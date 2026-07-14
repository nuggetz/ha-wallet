"""add_record payload + schema tests."""

import pytest
import voluptuous as vol

from custom_components.ha_wallet.services import (
    ADD_RECORD_SCHEMA,
    build_add_record_payload,
)


def test_payload_minimal_omits_currency_and_optionals():
    data = {"account_id": "acc-1", "amount": -12.5, "payment_type": "cash"}
    payload = build_add_record_payload(data, "2026-07-14T10:00:00+00:00")
    assert payload == {
        "accountId": "acc-1",
        "amount": {"value": -12.5},  # signed; no currencyCode → inherits account
        "recordDate": "2026-07-14T10:00:00+00:00",
        "paymentType": "cash",
    }


def test_payload_includes_provided_optionals():
    data = {
        "account_id": "acc-1",
        "amount": 5.0,
        "payment_type": "debit_card",
        "category_id": "cat-9",
        "note": "lunch",
        "label_ids": ["l1", "l2"],
    }
    payload = build_add_record_payload(data, "2026-07-14T10:00:00+00:00")
    assert payload["categoryId"] == "cat-9"
    assert payload["note"] == "lunch"
    assert payload["labelIds"] == ["l1", "l2"]
    assert "currencyCode" not in payload["amount"]


def test_schema_rejects_zero_amount():
    with pytest.raises(vol.Invalid):
        ADD_RECORD_SCHEMA({"account_id": "a", "amount": 0, "payment_type": "cash"})


def test_schema_rejects_unknown_payment_type():
    with pytest.raises(vol.Invalid):
        ADD_RECORD_SCHEMA({"account_id": "a", "amount": 5, "payment_type": "crypto"})


def test_schema_accepts_minimal_valid():
    out = ADD_RECORD_SCHEMA({"account_id": "a", "amount": -3.2, "payment_type": "cash"})
    assert out["amount"] == -3.2
