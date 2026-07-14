"""Period date-math tests (pure logic)."""

from datetime import date

from custom_components.ha_wallet.period import resolve_period


def test_this_year_to_date():
    b = resolve_period("this_year", date(2026, 7, 14))
    assert b.current_start == date(2026, 1, 1)
    assert b.current_end == date(2026, 7, 15)  # today + 1, exclusive
    assert b.previous_start == date(2025, 1, 1)
    assert b.previous_end == date(2025, 7, 15)
    assert b.current_filters() == [
        ("recordDate", "gte.2026-01-01"),
        ("recordDate", "lt.2026-07-15"),
    ]


def test_this_month_clamps_day():
    b = resolve_period("this_month", date(2026, 3, 31))
    assert b.current_start == date(2026, 3, 1)
    assert b.current_end == date(2026, 4, 1)
    assert b.previous_start == date(2026, 2, 1)
    assert b.previous_end == date(2026, 3, 1)


def test_leap_day_clamp():
    b = resolve_period("this_year", date(2024, 2, 29))
    assert b.previous_end == date(2023, 3, 1)


def test_custom_window_and_previous_span():
    b = resolve_period(
        "custom",
        date(2026, 7, 14),
        custom_start=date(2026, 6, 1),
        custom_end=date(2026, 6, 30),
    )
    assert b.current_start == date(2026, 6, 1)
    assert b.current_end == date(2026, 7, 1)
    assert b.previous_end == date(2026, 6, 1)
    assert b.previous_start == date(2026, 5, 2)


def test_custom_requires_bounds():
    import pytest

    with pytest.raises(ValueError):
        resolve_period("custom", date(2026, 7, 14))
