"""Reporting-period date math (pure, no Home Assistant dependency).

Resolves a period selection into a current and a *to-date* previous window so
``vs_previous_pct`` compares like with like (e.g. Jan 1 → today against Jan 1 →
the same day last year). All bounds are ``date`` objects; the upper bound is
**exclusive** and expressed for the API as ``lt.<end>``.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from .const import PERIOD_CUSTOM, PERIOD_THIS_MONTH, PERIOD_THIS_YEAR


@dataclass(frozen=True, slots=True)
class PeriodBounds:
    """A current window and the matching previous (to-date) window.

    Ends are exclusive: ``current_start <= recordDate < current_end``.
    """

    label: str
    current_start: date
    current_end: date
    previous_start: date
    previous_end: date

    def as_record_filters(self, start: date, end: date) -> list[tuple[str, str]]:
        """Build ``recordDate`` range query params for one window."""
        return [
            ("recordDate", f"gte.{start.isoformat()}"),
            ("recordDate", f"lt.{end.isoformat()}"),
        ]

    def current_filters(self) -> list[tuple[str, str]]:
        return self.as_record_filters(self.current_start, self.current_end)

    def previous_filters(self) -> list[tuple[str, str]]:
        return self.as_record_filters(self.previous_start, self.previous_end)


def _clamp_day(year: int, month: int, day: int) -> date:
    """Return a valid date, clamping the day to the month's last day."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def _add_years(value: date, years: int) -> date:
    """Shift a date by whole years, clamping Feb 29 to Feb 28 when needed."""
    return _clamp_day(value.year + years, value.month, value.day)


def _add_months(value: date, months: int) -> date:
    """Shift a date by whole months, clamping the day to the target month."""
    index = value.month - 1 + months
    year = value.year + index // 12
    month = index % 12 + 1
    return _clamp_day(year, month, value.day)


def resolve_period(
    period: str,
    today: date,
    custom_start: date | None = None,
    custom_end: date | None = None,
) -> PeriodBounds:
    """Resolve a period key into current + previous (to-date) windows.

    ``today`` is treated as inclusive, so the current window ends at
    ``today + 1 day`` (exclusive). The previous window is the same span shifted
    back one period, cut at the equivalent to-date point.
    """
    tomorrow = _add_days(today, 1)

    if period == PERIOD_THIS_YEAR:
        current_start = date(today.year, 1, 1)
        current_end = tomorrow
        return PeriodBounds(
            label=period,
            current_start=current_start,
            current_end=current_end,
            previous_start=_add_years(current_start, -1),
            previous_end=_add_years(current_end, -1),
        )

    if period == PERIOD_THIS_MONTH:
        current_start = date(today.year, today.month, 1)
        current_end = tomorrow
        return PeriodBounds(
            label=period,
            current_start=current_start,
            current_end=current_end,
            previous_start=_add_months(current_start, -1),
            previous_end=_add_months(current_end, -1),
        )

    if period == PERIOD_CUSTOM:
        if custom_start is None or custom_end is None:
            raise ValueError("custom period requires custom_start and custom_end")
        # Treat custom_end as inclusive to mirror how a user reads a range.
        current_end = _add_days(custom_end, 1)
        span = (current_end - custom_start).days
        return PeriodBounds(
            label=period,
            current_start=custom_start,
            current_end=current_end,
            previous_start=_add_days(custom_start, -span),
            previous_end=custom_start,
        )

    raise ValueError(f"unknown period: {period}")


def _add_days(value: date, days: int) -> date:
    return value + timedelta(days=days)
