"""Data update coordinator for Wallet by BudgetBakers.

Foundational polling machinery (M0): rate-limit-aware refresh driven off the
``X-Last-Data-Change-Rev`` header, capped-backoff handling of the ``409`` initial
sync, and reauth signalling on ``401``. It fetches accounts only for now; M1
layers budgets, records and categories on top of the same request budget.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import (
    WalletApiClient,
    WalletApiError,
    WalletAuthError,
    WalletInitSyncError,
    WalletRateLimitError,
    WalletResponseMeta,
)
from .const import (
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    INIT_SYNC_BACKOFF_MAX,
    INIT_SYNC_BACKOFF_START,
    RATE_LIMIT_SAFETY_MARGIN,
)

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry

_LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class WalletData:
    """Snapshot handed to entities. Grows with each milestone (M0: accounts)."""

    accounts: list[dict[str, Any]] = field(default_factory=list)
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
        # Last revision we successfully ingested; M1 uses it to skip the heavier
        # fetches when the account probe reports an unchanged revision.
        self._last_rev: str | None = None

    @property
    def last_change_rev(self) -> str | None:
        """Most recent ``X-Last-Data-Change-Rev`` we ingested."""
        return self._last_rev

    async def _async_update_data(self) -> WalletData:
        """Fetch the current snapshot, respecting the request budget."""
        # Proactive guard: if the last response left us near the ceiling, hold
        # the previous snapshot rather than risk a 429 that would also starve
        # user-triggered writes (services arrive in M2+).
        remaining = self.client.meta.ratelimit_remaining
        if (
            remaining is not None
            and remaining <= RATE_LIMIT_SAFETY_MARGIN
            and self.data is not None
        ):
            _LOGGER.debug(
                "Skipping poll: %s requests remaining this hour (margin %s)",
                remaining,
                RATE_LIMIT_SAFETY_MARGIN,
            )
            return self.data

        try:
            accounts = await self.client.async_get_accounts()
        except WalletAuthError as err:
            # Trigger HA's reauth flow so the user can paste a fresh token.
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

        # Success: restore the normal cadence and record the revision.
        self._restore_interval()
        meta = self.client.meta
        self._last_rev = meta.change_rev
        if meta.sync_in_progress:
            _LOGGER.debug("Wallet reports sync in progress; data may be partial")
        return WalletData(accounts=accounts, meta=meta)

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
        capped = min(max(seconds, INIT_SYNC_BACKOFF_START.total_seconds()),
                     INIT_SYNC_BACKOFF_MAX.total_seconds())
        self.update_interval = timedelta(seconds=capped)

    def _restore_interval(self) -> None:
        if self.update_interval != DEFAULT_SCAN_INTERVAL:
            self.update_interval = DEFAULT_SCAN_INTERVAL
