"""add_record payload + schema tests."""

import pytest
import voluptuous as vol

from custom_components.ha_wallet.services import (
    ADD_RECORD_SCHEMA,
    ADD_TRANSFER_SCHEMA,
    UPDATE_RECORD_SCHEMA,
    build_add_record_payload,
    build_add_transfer_payload,
    build_update_record_payload,
    summarize_references,
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


# --- M3: update / delete / transfer ------------------------------------------


def test_update_payload_sends_only_provided_fields():
    data = {"record_id": "r1", "note": "fixed", "label_ids": ["l1"]}
    payload = build_update_record_payload(data, None)
    assert payload == {"id": "r1", "note": "fixed", "labelIds": ["l1"]}


def test_update_payload_amount_object_and_date():
    data = {"record_id": "r1", "amount": -4.0}
    payload = build_update_record_payload(data, "2026-07-14T10:00:00+00:00")
    assert payload["amount"] == {"value": -4.0}
    assert payload["recordDate"] == "2026-07-14T10:00:00+00:00"


def test_update_schema_rejects_zero_amount():
    with pytest.raises(vol.Invalid):
        UPDATE_RECORD_SCHEMA({"record_id": "r1", "amount": 0})


def test_transfer_payload_negative_on_source_with_mirror():
    data = {
        "from_account_id": "src",
        "to_account_id": "dst",
        "amount": 50.0,
        "pairing_mode": "new",
    }
    payload = build_add_transfer_payload(data, "2026-07-14T10:00:00+00:00")
    assert payload["accountId"] == "src"
    assert payload["amount"] == {"value": -50.0}  # money leaving source
    assert payload["transfer"] == {"pairingMode": "new", "accountId": "dst"}
    assert "currencyCode" not in payload["amount"]


def test_transfer_unpaired_omits_target_account():
    data = {
        "from_account_id": "src",
        "to_account_id": "dst",
        "amount": 10.0,
        "pairing_mode": "unpaired",
    }
    payload = build_add_transfer_payload(data, "D")
    assert payload["transfer"] == {"pairingMode": "unpaired"}


def test_transfer_schema_rejects_existing_mode():
    with pytest.raises(vol.Invalid):
        ADD_TRANSFER_SCHEMA(
            {"from_account_id": "a", "to_account_id": "b", "amount": 5,
             "pairing_mode": "existing"}
        )


def test_summarize_references_keeps_nonempty_groups():
    refs = {
        "records": {"total": 2, "ids": ["x", "y"]},
        "budgets": {"total": 0},
        "recordRules": {"total": 1},
        "standingOrders": {"total": 0},
    }
    assert summarize_references(refs) == {"records": 2, "recordRules": 1}


def test_summarize_references_empty():
    assert summarize_references({"records": {"total": 0}}) == {}
