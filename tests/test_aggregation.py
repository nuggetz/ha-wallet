"""Record-aggregation tests (pure logic)."""

from custom_components.ha_wallet.aggregation import (
    aggregate,
    distinct_currencies,
    percent_change,
)

CARDINALITY = {"c1": "must", "c2": "want", "c3": "none"}


def _rec(account, rtype, state, value, currency, cat_id, cat_name, converted=None):
    record = {
        "accountId": account,
        "recordType": rtype,
        "recordState": state,
        "amount": {"value": value, "currencyCode": currency},
        "category": {"id": cat_id, "name": cat_name},
    }
    if converted is not None:
        record["convertedAmount"] = {"value": converted, "currencyCode": "USD"}
    return record


def test_single_currency_states_and_breakdowns():
    records = [
        _rec("a", "expense", "cleared", 10.0, "EUR", "c1", "Food"),
        _rec("a", "expense", "uncleared", 5.0, "EUR", "c2", "Fun"),
        _rec("a", "income", "reconciled", 100.0, "EUR", "c3", "Salary"),
        _rec("a", "expense", "void", 999.0, "EUR", "c1", "Food"),  # excluded
        _rec("b", "expense", "cleared", 50.0, "EUR", "c1", "Food"),  # not eligible
    ]
    r = aggregate(records, CARDINALITY, {"a"}, use_base=False, base_currency="USD")
    assert r.expense == 15.0
    assert r.income == 100.0
    assert r.net == 85.0
    assert r.currency == "EUR"
    assert r.by_category == {"Food": 10.0, "Fun": 5.0}
    assert r.by_cardinality["must"] == 10.0
    assert r.by_cardinality["want"] == 5.0
    assert r.record_count == 3


def test_mixed_currency_uses_base():
    mixed = [
        _rec("a", "expense", "cleared", 10.0, "EUR", "c1", "Food", converted=11.0),
        _rec("b", "expense", "cleared", 20.0, "USD", "c1", "Food", converted=20.0),
    ]
    assert distinct_currencies(mixed, {"a", "b"}) == {"EUR", "USD"}
    r = aggregate(mixed, CARDINALITY, {"a", "b"}, use_base=True, base_currency="USD")
    assert r.expense == 31.0
    assert r.currency == "USD"


def test_percent_change():
    assert percent_change(150, 100) == 50.0
    assert percent_change(50, 100) == -50.0
    assert percent_change(10, 0) is None
