"""M4 management payload builders + schema tests."""

from datetime import date

import pytest
import voluptuous as vol
from homeassistant.exceptions import ServiceValidationError

from custom_components.ha_wallet.management import (
    MANAGE_ACCOUNT_SCHEMA,
    MANAGE_BUDGET_SCHEMA,
    build_account_create,
    build_account_patch,
    build_budget_create,
    build_category_create,
    build_label_patch,
)


def test_budget_create_maps_and_serialises_dates():
    payload = build_budget_create(
        {
            "operation": "create",
            "name": "Groceries",
            "currency_code": "EUR",
            "type": "BUDGET_CUSTOM",
            "limit": 300.0,
            "category_ids": ["c1"],
            "start_date": date(2026, 1, 1),
            "end_date": date(2026, 3, 31),
        }
    )
    assert payload == {
        "name": "Groceries",
        "currencyCode": "EUR",
        "type": "BUDGET_CUSTOM",
        "limit": 300.0,
        "categoryIds": ["c1"],
        "startDate": "2026-01-01",
        "endDate": "2026-03-31",
    }


def test_budget_create_missing_required_raises():
    with pytest.raises(ServiceValidationError):
        build_budget_create({"operation": "create", "name": "x"})


def test_category_create_requires_parent():
    with pytest.raises(ServiceValidationError):
        build_category_create({"operation": "create", "name": "Snacks"})
    ok = build_category_create(
        {"operation": "create", "name": "Snacks", "parent_id": "p1", "cardinality": "want"}
    )
    assert ok == {"name": "Snacks", "parentId": "p1", "cardinality": "want"}


def test_account_create_and_patch_field_mapping():
    created = build_account_create(
        {
            "operation": "create",
            "name": "Wallet cash",
            "account_type": "Cash",
            "currency_code": "EUR",
            "initial_balance": 50.0,
        }
    )
    assert created["accountType"] == "Cash"
    assert created["initialBalance"] == 50.0

    patched = build_account_patch(
        {"operation": "patch", "account_id": "a1", "archived": True}
    )
    assert patched == {"id": "a1", "archived": True}


def test_label_patch_requires_id():
    with pytest.raises(ServiceValidationError):
        build_label_patch({"operation": "patch", "name": "x"})


def test_budget_schema_rejects_bad_type_and_nonpositive_limit():
    with pytest.raises(vol.Invalid):
        MANAGE_BUDGET_SCHEMA({"operation": "create", "type": "BUDGET_DECADE"})
    with pytest.raises(vol.Invalid):
        MANAGE_BUDGET_SCHEMA({"operation": "create", "limit": 0})


def test_account_schema_rejects_noncreatable_type_and_bad_color():
    with pytest.raises(vol.Invalid):
        MANAGE_ACCOUNT_SCHEMA({"operation": "create", "account_type": "CreditCard"})
    with pytest.raises(vol.Invalid):
        MANAGE_ACCOUNT_SCHEMA({"operation": "create", "color": "Magenta"})
