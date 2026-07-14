"""Management services for Wallet by BudgetBakers (M4).

Four services — ``manage_budget``, ``manage_category``, ``manage_account``,
``manage_label`` — each with an ``operation`` field (``create`` / ``patch`` /
``delete``). Product decisions for v1: accounts and labels are **not deletable**
here (the API exposes a delete, but v1 does not); only custom categories and
budgets can be deleted. Currencies and colours come from the API's own vocab.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import voluptuous as vol
from homeassistant.core import ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .api import WalletApiError, WalletRecordError
from .const import (
    ATTR_ACCOUNT_ID,
    ATTR_ACCOUNT_IDS,
    ATTR_ACCOUNT_TYPE_FIELD,
    ATTR_ARCHIVED,
    ATTR_BUDGET_ID,
    ATTR_BUDGET_TYPE,
    ATTR_CARDINALITY,
    ATTR_CATEGORY_ID,
    ATTR_CATEGORY_IDS,
    ATTR_CLOSED,
    ATTR_COLOR,
    ATTR_CURRENCY_CODE,
    ATTR_END_DATE,
    ATTR_EXCLUDE_FROM_STATS,
    ATTR_INITIAL_BALANCE,
    ATTR_LABEL_ID,
    ATTR_LABEL_IDS,
    ATTR_LIMIT,
    ATTR_NAME,
    ATTR_OPERATION,
    ATTR_PARENT_ID,
    ATTR_START_DATE,
    BUDGET_TYPES,
    CATEGORY_CARDINALITIES,
    COLOR_NAMES,
    CREATABLE_ACCOUNT_TYPES,
    DOMAIN,
    OP_CREATE,
    OP_DELETE,
    OP_PATCH,
    OPERATIONS,
    SERVICE_MANAGE_ACCOUNT,
    SERVICE_MANAGE_BUDGET,
    SERVICE_MANAGE_CATEGORY,
    SERVICE_MANAGE_LABEL,
)
from .services import _single_entry as _resolve_coordinator


# --- validation helpers ------------------------------------------------------


def _require(data: dict[str, Any], field: str) -> Any:
    """Return a required field's value, or raise a clear validation error."""
    value = data.get(field)
    if value in (None, ""):
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="missing_field",
            translation_placeholders={"field": field},
        )
    return value


def _put(payload: dict[str, Any], key: str, value: Any) -> None:
    """Set ``key`` only when ``value`` is not ``None`` (empty list allowed)."""
    if value is not None:
        payload[key] = value


def _iso(value: Any) -> Any:
    """Serialise a date/datetime to ISO, pass through anything else."""
    return value.isoformat() if hasattr(value, "isoformat") else value


# --- payload builders (pure) -------------------------------------------------


def build_budget_create(d: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "name": _require(d, ATTR_NAME),
        "currencyCode": _require(d, ATTR_CURRENCY_CODE),
        "type": _require(d, ATTR_BUDGET_TYPE),
        "limit": _require(d, ATTR_LIMIT),
    }
    _put(payload, "categoryIds", d.get(ATTR_CATEGORY_IDS))
    _put(payload, "accountIds", d.get(ATTR_ACCOUNT_IDS))
    _put(payload, "labelIds", d.get(ATTR_LABEL_IDS))
    _put(payload, "startDate", _iso(d.get(ATTR_START_DATE)))
    _put(payload, "endDate", _iso(d.get(ATTR_END_DATE)))
    return payload


def build_budget_patch(d: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {"id": _require(d, ATTR_BUDGET_ID)}
    _put(payload, "name", d.get(ATTR_NAME))
    _put(payload, "categoryIds", d.get(ATTR_CATEGORY_IDS))
    _put(payload, "accountIds", d.get(ATTR_ACCOUNT_IDS))
    _put(payload, "labelIds", d.get(ATTR_LABEL_IDS))
    _put(payload, "startDate", _iso(d.get(ATTR_START_DATE)))
    _put(payload, "endDate", _iso(d.get(ATTR_END_DATE)))
    if ATTR_CLOSED in d:
        payload["closed"] = d[ATTR_CLOSED]
    return payload


def build_category_create(d: dict[str, Any]) -> dict[str, Any]:
    payload = {"name": _require(d, ATTR_NAME), "parentId": _require(d, ATTR_PARENT_ID)}
    _put(payload, "cardinality", d.get(ATTR_CARDINALITY))
    _put(payload, "color", d.get(ATTR_COLOR))
    return payload


def build_category_patch(d: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {"id": _require(d, ATTR_CATEGORY_ID)}
    _put(payload, "name", d.get(ATTR_NAME))
    _put(payload, "cardinality", d.get(ATTR_CARDINALITY))
    _put(payload, "color", d.get(ATTR_COLOR))
    return payload


def build_account_create(d: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "name": _require(d, ATTR_NAME),
        "accountType": _require(d, ATTR_ACCOUNT_TYPE_FIELD),
        "currencyCode": _require(d, ATTR_CURRENCY_CODE),
        "initialBalance": _require(d, ATTR_INITIAL_BALANCE),
    }
    _put(payload, "color", d.get(ATTR_COLOR))
    if ATTR_EXCLUDE_FROM_STATS in d:
        payload["excludeFromStats"] = d[ATTR_EXCLUDE_FROM_STATS]
    return payload


def build_account_patch(d: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {"id": _require(d, ATTR_ACCOUNT_ID)}
    _put(payload, "name", d.get(ATTR_NAME))
    _put(payload, "color", d.get(ATTR_COLOR))
    if ATTR_INITIAL_BALANCE in d:
        payload["initialBalance"] = d[ATTR_INITIAL_BALANCE]
    if ATTR_EXCLUDE_FROM_STATS in d:
        payload["excludeFromStats"] = d[ATTR_EXCLUDE_FROM_STATS]
    if ATTR_ARCHIVED in d:
        payload["archived"] = d[ATTR_ARCHIVED]
    return payload


def build_label_create(d: dict[str, Any]) -> dict[str, Any]:
    payload = {"name": _require(d, ATTR_NAME)}
    _put(payload, "color", d.get(ATTR_COLOR))
    return payload


def build_label_patch(d: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {"id": _require(d, ATTR_LABEL_ID)}
    _put(payload, "name", d.get(ATTR_NAME))
    _put(payload, "color", d.get(ATTR_COLOR))
    if ATTR_ARCHIVED in d:
        payload["archived"] = d[ATTR_ARCHIVED]
    return payload


# --- entity config + generic handler -----------------------------------------


@dataclass(frozen=True, slots=True)
class ManageEntity:
    """Describes how one manageable entity maps to the API."""

    label: str
    entity_type: str  # patch/delete route segment (budgets/categories/…)
    create_path: str
    result_key: str
    id_field: str
    allow_delete: bool
    build_create: Callable[[dict[str, Any]], dict[str, Any]]
    build_patch: Callable[[dict[str, Any]], dict[str, Any]]


_ENTITIES: dict[str, ManageEntity] = {
    SERVICE_MANAGE_BUDGET: ManageEntity(
        "budget", "budgets", "/budgets", "budget", ATTR_BUDGET_ID, True,
        build_budget_create, build_budget_patch,
    ),
    SERVICE_MANAGE_CATEGORY: ManageEntity(
        "category", "categories", "/categories/custom", "category",
        ATTR_CATEGORY_ID, True, build_category_create, build_category_patch,
    ),
    SERVICE_MANAGE_ACCOUNT: ManageEntity(
        "account", "accounts", "/accounts", "account", ATTR_ACCOUNT_ID, False,
        build_account_create, build_account_patch,
    ),
    SERVICE_MANAGE_LABEL: ManageEntity(
        "label", "labels", "/labels", "label", ATTR_LABEL_ID, False,
        build_label_create, build_label_patch,
    ),
}


def _make_handler(cfg: ManageEntity) -> Callable[[ServiceCall], Any]:
    async def handler(call: ServiceCall) -> ServiceResponse:
        data = dict(call.data)
        operation = data[ATTR_OPERATION]
        coordinator = _resolve_coordinator(call.hass)
        client = coordinator.client
        try:
            if operation == OP_CREATE:
                obj = await client.async_create_entity(
                    cfg.create_path, cfg.build_create(data), cfg.result_key
                )
                result_id = obj.get("id")
            elif operation == OP_PATCH:
                item = cfg.build_patch(data)
                res = await client.async_patch_entity(cfg.entity_type, item)
                result_id = res.get("id") or item.get("id")
            else:  # delete
                if not cfg.allow_delete:
                    raise ServiceValidationError(
                        translation_domain=DOMAIN,
                        translation_key="delete_not_supported",
                        translation_placeholders={"entity": cfg.label},
                    )
                result_id = _require(data, cfg.id_field)
                await client.async_delete_entity(cfg.entity_type, result_id)
        except WalletRecordError as err:
            raise ServiceValidationError(str(err)) from err
        except WalletApiError as err:
            raise HomeAssistantError(
                f"Wallet API error ({operation} {cfg.label}): {err}"
            ) from err

        await coordinator.async_request_refresh()
        return {"id": result_id}

    return handler


# --- schemas -----------------------------------------------------------------

_OPERATION = {vol.Required(ATTR_OPERATION): vol.In(OPERATIONS)}

MANAGE_BUDGET_SCHEMA = vol.Schema(
    {
        **_OPERATION,
        vol.Optional(ATTR_BUDGET_ID): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
        vol.Optional(ATTR_CURRENCY_CODE): cv.string,
        vol.Optional(ATTR_BUDGET_TYPE): vol.In(BUDGET_TYPES),
        vol.Optional(ATTR_LIMIT): vol.All(vol.Coerce(float), vol.Range(min=0.01)),
        vol.Optional(ATTR_CATEGORY_IDS): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional(ATTR_ACCOUNT_IDS): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional(ATTR_LABEL_IDS): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional(ATTR_START_DATE): cv.date,
        vol.Optional(ATTR_END_DATE): cv.date,
        vol.Optional(ATTR_CLOSED): cv.boolean,
    }
)

MANAGE_CATEGORY_SCHEMA = vol.Schema(
    {
        **_OPERATION,
        vol.Optional(ATTR_CATEGORY_ID): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
        vol.Optional(ATTR_PARENT_ID): cv.string,
        vol.Optional(ATTR_CARDINALITY): vol.In(CATEGORY_CARDINALITIES),
        vol.Optional(ATTR_COLOR): vol.In(COLOR_NAMES),
    }
)

MANAGE_ACCOUNT_SCHEMA = vol.Schema(
    {
        **_OPERATION,
        vol.Optional(ATTR_ACCOUNT_ID): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
        vol.Optional(ATTR_ACCOUNT_TYPE_FIELD): vol.In(CREATABLE_ACCOUNT_TYPES),
        vol.Optional(ATTR_CURRENCY_CODE): cv.string,
        vol.Optional(ATTR_INITIAL_BALANCE): vol.Coerce(float),
        vol.Optional(ATTR_COLOR): vol.In(COLOR_NAMES),
        vol.Optional(ATTR_EXCLUDE_FROM_STATS): cv.boolean,
        vol.Optional(ATTR_ARCHIVED): cv.boolean,
    }
)

MANAGE_LABEL_SCHEMA = vol.Schema(
    {
        **_OPERATION,
        vol.Optional(ATTR_LABEL_ID): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
        vol.Optional(ATTR_COLOR): vol.In(COLOR_NAMES),
        vol.Optional(ATTR_ARCHIVED): cv.boolean,
    }
)


def management_services() -> tuple[tuple[str, Callable, vol.Schema], ...]:
    """Return ``(name, handler, schema)`` triples for registration."""
    return (
        (SERVICE_MANAGE_BUDGET, _make_handler(_ENTITIES[SERVICE_MANAGE_BUDGET]), MANAGE_BUDGET_SCHEMA),
        (SERVICE_MANAGE_CATEGORY, _make_handler(_ENTITIES[SERVICE_MANAGE_CATEGORY]), MANAGE_CATEGORY_SCHEMA),
        (SERVICE_MANAGE_ACCOUNT, _make_handler(_ENTITIES[SERVICE_MANAGE_ACCOUNT]), MANAGE_ACCOUNT_SCHEMA),
        (SERVICE_MANAGE_LABEL, _make_handler(_ENTITIES[SERVICE_MANAGE_LABEL]), MANAGE_LABEL_SCHEMA),
    )


MANAGEMENT_SERVICE_NAMES = (
    SERVICE_MANAGE_BUDGET,
    SERVICE_MANAGE_CATEGORY,
    SERVICE_MANAGE_ACCOUNT,
    SERVICE_MANAGE_LABEL,
)
