"""Data update coordinator for Wallet by BudgetBakers.

Polling machinery driven off the ``X-Last-Data-Change-Rev`` header: a cheap
accounts probe runs every cycle, and the heavier budget/record fetches plus
aggregation only run when the revision actually changed. Rate-limit-aware,
handles the ``409`` initial sync with capped backoff, and signals reauth on
``401``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .aggregation import AggregateResult, aggregate, distinct_currencies
from .api import (
    WalletApiClient,
    WalletApiError,
    WalletAuthError,
    WalletInitSyncError,
    WalletRateLimitError,
    WalletResponseMeta,
)
from .const import (
    CONF_ACCOUNT_IDS,
    CONF_CUSTOM_END,
    CONF_CUSTOM_START,
    CONF_PERIOD,
    DEFAULT_PERIOD,
    PERIOD_CUSTOM,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    INIT_SYNC_BACKOFF_MAX,
    INIT_SYNC_BACKOFF_START,
    LAST_RECORDS_COUNT,
    RATE_LIMIT_SAFETY_MARGIN,
)
from .period import resolve_period

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry

_LOGGER = logging.getLogger(__name__)


def _parse_date(value: Any):
    """Parse an ISO ``YYYY-MM-DD`` string to a date, or ``None`` if unusable."""
    from datetime import date

    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


@dataclass(slots=True)
class WalletData:
    """Snapshot handed to entities."""

    accounts: list[dict[str, Any]] = field(default_factory=list)
    budgets: list[dict[str, Any]] = field(default_factory=list)
    goals: list[dict[str, Any]] = field(default_factory=list)
    standing_orders: list[dict[str, Any]] = field(default_factory=list)
    record_rules: list[dict[str, Any]] = field(default_factory=list)
    spending: AggregateResult = field(default_factory=AggregateResult)
    spending_previous: AggregateResult = field(default_factory=AggregateResult)
    last_records: list[dict[str, Any]] = field(default_factory=list)
    base_currency: str | None = None
    period: str = DEFAULT_PERIOD
    meta: WalletResponseMeta = field(default_factory=WalletResponseMeta)


class WalletDataUpdateCoordinator(DataUpdateCoordinator[WalletData]):
    """Coordinate polling of the Wallet API within the hourly request budget."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        client: WalletApiClient,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=DEFAULT_SCAN_INTERVAL,
            config_entry=entry,
        )
        self.client = client
        self._last_rev: str | None = None

    @property
    def last_change_rev(self) -> str | None:
        """Most recent ``X-Last-Data-Change-Rev`` we ingested."""
        return self._last_rev

    # --- options helpers -----------------------------------------------------

    def _selected_account_ids(self, accounts: list[dict[str, Any]]) -> set[str]:
        """Accounts the user chose to track (default: all)."""
        selected = self.config_entry.options.get(CONF_ACCOUNT_IDS)
        if not selected:
            return {str(a["id"]) for a in accounts if a.get("id") is not None}
        return {str(x) for x in selected}

    @property
    def _period(self) -> str:
        return self.config_entry.options.get(CONF_PERIOD, DEFAULT_PERIOD)

    def _resolve_bounds(self):
        """Resolve the configured period, falling back if custom is incomplete."""
        options = self.config_entry.options
        today = dt_util.now().date()
        period = self._period
        custom_start = _parse_date(options.get(CONF_CUSTOM_START))
        custom_end = _parse_date(options.get(CONF_CUSTOM_END))
        try:
            return resolve_period(period, today, custom_start, custom_end)
        except ValueError:
            if period == PERIOD_CUSTOM:
                _LOGGER.warning(
                    "Custom period selected without valid dates; using %s",
                    DEFAULT_PERIOD,
                )
                return resolve_period(DEFAULT_PERIOD, today)
            raise

    # --- refresh -------------------------------------------------------------

    async def _async_update_data(self) -> WalletData:
        """Probe for changes cheaply; do the heavy fetch only when data moved."""
        remaining = self.client.meta.ratelimit_remaining
        if (
            remaining is not None
            and remaining <= RATE_LIMIT_SAFETY_MARGIN
            and self.data is not None
        ):
            _LOGGER.debug(
                "Skipping poll: %s requests remaining this hour", remaining
            )
            return self.data

        accounts = await self._guarded(self.client.async_get_accounts())
        rev = self.client.meta.change_rev

        # Nothing changed since our last full snapshot: reuse it and skip the
        # budget/record fetches entirely (the whole point of rev polling).
        if self.data is not None and rev is not None and rev == self._last_rev:
            self._restore_interval()
            return self.data

        budgets = await self._guarded(self.client.async_get_budgets())
        categories = await self._guarded(self.client.async_get_categories())
        goals = await self._guarded(self.client.async_get_goals())
        standing_orders = await self._guarded(self.client.async_get_standing_orders())
        record_rules = await self._guarded(self.client.async_get_record_rules())
        cardinality = {
            str(c["id"]): str(c.get("cardinality", "none"))
            for c in categories
            if c.get("id") is not None
        }

        bounds = self._resolve_bounds()
        current_records = await self._guarded(
            self.client.async_get_records(extra_params=bounds.current_filters())
        )
        previous_records = await self._guarded(
            self.client.async_get_records(extra_params=bounds.previous_filters())
        )

        eligible = self._eligible_account_ids(accounts)
        base_currency = self._detect_base_currency(current_records, previous_records)
        use_base = len(distinct_currencies(current_records, eligible)) > 1

        spending = aggregate(
            current_records, cardinality, eligible,
            use_base=use_base, base_currency=base_currency,
        )
        spending_previous = aggregate(
            previous_records, cardinality, eligible,
            use_base=use_base, base_currency=base_currency,
        )

        self._restore_interval()
        self._last_rev = rev
        return WalletData(
            accounts=accounts,
            budgets=budgets,
            goals=goals,
            standing_orders=standing_orders,
            record_rules=record_rules,
            spending=spending,
            spending_previous=spending_previous,
            last_records=self._serialize_records(current_records, eligible),
            base_currency=base_currency,
            period=self._period,
            meta=self.client.meta,
        )

    async def _guarded(self, awaitable: Any) -> Any:
        """Await an API call, translating client errors to coordinator outcomes."""
        try:
            return await awaitable
        except WalletAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except WalletInitSyncError as err:
            self._enter_backoff(err.retry_after)
            raise UpdateFailed("Wallet initial sync in progress; will retry") from err
        except WalletRateLimitError as err:
            if err.retry_after:
                self._set_interval_seconds(err.retry_after)
            raise UpdateFailed("Wallet API rate limit reached; will retry") from err
        except WalletApiError as err:
            raise UpdateFailed(str(err)) from err

    def _eligible_account_ids(self, accounts: list[dict[str, Any]]) -> set[str]:
        """Selected accounts minus those Wallet flags as excluded from stats."""
        selected = self._selected_account_ids(accounts)
        excluded = {
            str(a["id"])
            for a in accounts
            if a.get("excludeFromStats") and a.get("id") is not None
        }
        return selected - excluded

    @staticmethod
    def _detect_base_currency(*record_lists: list[dict[str, Any]]) -> str | None:
        """Read the profile base currency from any converted amount."""
        for records in record_lists:
            for record in records:
                converted = record.get("convertedAmount") or {}
                code = converted.get("currencyCode")
                if code and not converted.get("error"):
                    return code
        return None

    def _serialize_records(
        self, records: list[dict[str, Any]], eligible: set[str]
    ) -> list[dict[str, Any]]:
        """Compact the newest records for the last-records sensor attribute."""
        out: list[dict[str, Any]] = []
        for record in records:
            if record.get("accountId") not in eligible:
                continue
            amount = record.get("amount") or {}
            category = record.get("category") or {}
            out.append(
                {
                    "amount": amount.get("value"),
                    "currency": amount.get("currencyCode"),
                    "type": record.get("recordType"),
                    "category": category.get("name"),
                    "account": record.get("accountName"),
                    "date": record.get("recordDate"),
                    "note": record.get("note"),
                }
            )
            if len(out) >= LAST_RECORDS_COUNT:
                break
        return out

    # --- interval helpers ----------------------------------------------------

    def _enter_backoff(self, retry_after: float | None) -> None:
        """Grow the poll interval on repeated 409s, capped, honouring any hint."""
        if retry_after:
            self._set_interval_seconds(retry_after)
            return
        current = self.update_interval or INIT_SYNC_BACKOFF_START
        nxt = min(max(current * 2, INIT_SYNC_BACKOFF_START), INIT_SYNC_BACKOFF_MAX)
        self.update_interval = nxt

    def _set_interval_seconds(self, seconds: float) -> None:
        capped = min(
            max(seconds, INIT_SYNC_BACKOFF_START.total_seconds()),
            INIT_SYNC_BACKOFF_MAX.total_seconds(),
        )
        self.update_interval = timedelta(seconds=capped)

    def _restore_interval(self) -> None:
        if self.update_interval != DEFAULT_SCAN_INTERVAL:
            self.update_interval = DEFAULT_SCAN_INTERVAL
