"""Record aggregation (pure, no Home Assistant dependency).

Turns a list of raw Wallet records into the spending / cash-flow / cardinality
figures the M1 sensors expose. Product decisions baked in here:

* record states — everything counts **except ``void``** (pending ``uncleared``
  records are included, matching the app's running totals);
* multi-currency — the caller decides ``use_base``: when the selected accounts
  share one currency we sum native amounts; when they span currencies we sum the
  API's ``convertedAmount`` (profile base currency) instead;
* ``excludeFromStats`` accounts are filtered out by the caller via
  ``eligible_account_ids``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

CARDINALITIES = ("must", "need", "want", "none")
_VOID_STATE = "void"


@dataclass(slots=True)
class AggregateResult:
    """Spending/income figures for one window, in a single display currency."""

    currency: str | None = None
    expense: float = 0.0
    income: float = 0.0
    by_category: dict[str, float] = field(default_factory=dict)
    by_cardinality: dict[str, float] = field(
        default_factory=lambda: {key: 0.0 for key in CARDINALITIES}
    )
    record_count: int = 0

    @property
    def net(self) -> float:
        """Cash flow: income minus expense."""
        return round(self.income - self.expense, 2)


def _amount(record: dict[str, Any], use_base: bool) -> tuple[float | None, str | None]:
    """Return (value, currency) for a record, honouring the currency basis.

    Falls back to the native amount when a base conversion is requested but the
    record carries no usable ``convertedAmount`` (e.g. the rate was unavailable).
    """
    if use_base:
        converted = record.get("convertedAmount") or {}
        if not converted.get("error") and converted.get("value") is not None:
            return converted.get("value"), converted.get("currencyCode")
    native = record.get("amount") or {}
    return native.get("value"), native.get("currencyCode")


def _eligible(record: dict[str, Any], eligible_account_ids: set[str] | None) -> bool:
    """Whether a record should be counted at all."""
    if str(record.get("recordState", "")).lower() == _VOID_STATE:
        return False
    if eligible_account_ids is not None:
        return record.get("accountId") in eligible_account_ids
    return True


def distinct_currencies(
    records: Iterable[dict[str, Any]], eligible_account_ids: set[str] | None
) -> set[str]:
    """Native currencies present across the countable records."""
    currencies: set[str] = set()
    for record in records:
        if not _eligible(record, eligible_account_ids):
            continue
        native = record.get("amount") or {}
        code = native.get("currencyCode")
        if code:
            currencies.add(code)
    return currencies


def aggregate(
    records: Iterable[dict[str, Any]],
    category_cardinality: dict[str, str],
    eligible_account_ids: set[str] | None,
    *,
    use_base: bool,
    base_currency: str | None,
) -> AggregateResult:
    """Aggregate records into expense/income totals plus expense breakdowns."""
    result = AggregateResult()
    display_currency: str | None = base_currency if use_base else None

    for record in records:
        if not _eligible(record, eligible_account_ids):
            continue
        value, currency = _amount(record, use_base)
        if value is None:
            continue
        value = abs(float(value))  # amounts are unsigned; recordType gives sign
        result.record_count += 1
        if display_currency is None:
            display_currency = currency

        if str(record.get("recordType", "")).lower() == "income":
            result.income = round(result.income + value, 2)
            continue

        # Everything else is treated as an expense for spending breakdowns.
        result.expense = round(result.expense + value, 2)

        category = record.get("category") or {}
        name = category.get("name") or "Uncategorized"
        result.by_category[name] = round(result.by_category.get(name, 0.0) + value, 2)

        cardinality = category_cardinality.get(category.get("id"), "none")
        if cardinality not in result.by_cardinality:
            cardinality = "none"
        result.by_cardinality[cardinality] = round(
            result.by_cardinality[cardinality] + value, 2
        )

    result.currency = display_currency
    return result


def percent_change(current: float, previous: float) -> float | None:
    """Signed percent change current-vs-previous, or ``None`` if not defined."""
    if previous == 0:
        return None
    return round((current - previous) / abs(previous) * 100, 1)
