"""Small unit tests for API client helpers."""

from custom_components.ha_wallet.api import _parse_limit_cap


def test_parse_limit_cap_extracts_number():
    assert _parse_limit_cap("limit must be at most 20") == 20


def test_parse_limit_cap_ignores_range_message():
    assert _parse_limit_cap("limit must be between 1 and 200") is None


def test_parse_limit_cap_no_match():
    assert _parse_limit_cap("some other error") is None
