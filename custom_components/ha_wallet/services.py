"""Services for Wallet by BudgetBakers (M2 cash entry).

``ha_wallet.add_record`` creates an expense or income on a cash/manual account.
The amount is signed (negative = expense, positive = income); the currency is
inherited from the account, never sent. Writes to bank-synced accounts are
rejected up front — they are read-only by API design.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.util import dt as dt_util

from .api import WalletApiError, WalletRecordError
from .const import (
    ATTR_ACCOUNT_ID,
    ATTR_AMOUNT,
    ATTR_CATEGORY_ID,
    ATTR_FORCE,
    ATTR_FROM_ACCOUNT_ID,
    ATTR_LABEL_IDS,
    ATTR_NOTE,
    ATTR_PAIRING_MODE,
    ATTR_PAYMENT_TYPE,
    ATTR_RECORD_DATE,
    ATTR_RECORD_ID,
    ATTR_TO_ACCOUNT_ID,
    ATTR_RECORD_RULE_ID,
    ATTR_STANDING_ORDER_ID,
    DEFAULT_PAIRING_MODE,
    DOMAIN,
    PAYMENT_TYPES,
    SERVICE_ADD_RECORD,
    SERVICE_ADD_TRANSFER,
    SERVICE_DELETE_RECORD,
    SERVICE_DELETE_RECORD_RULE,
    SERVICE_DELETE_STANDING_ORDER,
    SERVICE_UPDATE_RECORD,
)

# Pairing modes exposed by the transfer service. "existing" (bind to a specific
# counter record) needs a record id the contract does not model, so it is not
# offered here.
SERVICE_PAIRING_MODES = ("new", "unpaired")

if TYPE_CHECKING:
    from .coordinator import WalletDataUpdateCoordinator

_LOGGER = logging.getLogger(__name__)


def _non_zero(value: float) -> float:
    """Reject a zero amount (the API forbids it; sign selects the record type)."""
    if value == 0:
        raise vol.Invalid("amount must not be zero (sign selects expense/income)")
    return value


ADD_RECORD_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ACCOUNT_ID): cv.string,
        vol.Required(ATTR_AMOUNT): vol.All(vol.Coerce(float), _non_zero),
        vol.Required(ATTR_PAYMENT_TYPE): vol.In(PAYMENT_TYPES),
        vol.Optional(ATTR_CATEGORY_ID): cv.string,
        vol.Optional(ATTR_RECORD_DATE): cv.datetime,
        vol.Optional(ATTR_NOTE): cv.string,
        vol.Optional(ATTR_LABEL_IDS): vol.All(cv.ensure_list, [cv.string]),
    }
)


def build_add_record_payload(
    data: dict[str, Any], record_date_iso: str
) -> dict[str, Any]:
    """Map validated service data to a create-record API payload (pure).

    ``currencyCode`` is deliberately omitted so the API inherits the account's
    currency. Optional fields are included only when provided.
    """
    payload: dict[str, Any] = {
        "accountId": data[ATTR_ACCOUNT_ID],
        "amount": {"value": data[ATTR_AMOUNT]},
        "recordDate": record_date_iso,
        "paymentType": data[ATTR_PAYMENT_TYPE],
    }
    if data.get(ATTR_CATEGORY_ID):
        payload["categoryId"] = data[ATTR_CATEGORY_ID]
    if data.get(ATTR_NOTE):
        payload["note"] = data[ATTR_NOTE]
    if data.get(ATTR_LABEL_IDS):
        payload["labelIds"] = data[ATTR_LABEL_IDS]
    return payload


def _find_account(
    hass: HomeAssistant, account_id: str
) -> tuple[WalletDataUpdateCoordinator, dict[str, Any]]:
    """Locate the loaded entry that owns ``account_id`` and return its account."""
    for entry in hass.config_entries.async_entries(DOMAIN):
        runtime = getattr(entry, "runtime_data", None)
        coordinator = getattr(runtime, "coordinator", None)
        data = getattr(coordinator, "data", None)
        for account in getattr(data, "accounts", []) or []:
            if str(account.get("id")) == account_id:
                return coordinator, account
    raise ServiceValidationError(
        f"No tracked Wallet account with id {account_id} was found."
    )


async def _handle_add_record(call: ServiceCall) -> ServiceResponse:
    """Validate, create the record, and refresh so sensors reflect it."""
    hass = call.hass
    data = call.data
    coordinator, account = _find_account(hass, data[ATTR_ACCOUNT_ID])

    if account.get("isBankSync"):
        raise ServiceValidationError(
            f"Account {account.get('name') or account.get('id')} is bank-synced "
            "and read-only; records apply to cash/manual accounts only."
        )

    payload = build_add_record_payload(dict(data), _resolve_date(data))

    try:
        result = await coordinator.client.async_create_record(payload)
    except WalletRecordError as err:
        # Client-side rejection (e.g. a constraint we did not pre-check).
        raise ServiceValidationError(str(err)) from err
    except WalletApiError as err:
        raise HomeAssistantError(f"Wallet API error creating record: {err}") from err

    await coordinator.async_request_refresh()
    return {"record_id": result.get("id")}


# --- update_record -----------------------------------------------------------

UPDATE_RECORD_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_RECORD_ID): cv.string,
        vol.Optional(ATTR_AMOUNT): vol.All(vol.Coerce(float), _non_zero),
        vol.Optional(ATTR_PAYMENT_TYPE): vol.In(PAYMENT_TYPES),
        vol.Optional(ATTR_CATEGORY_ID): cv.string,
        vol.Optional(ATTR_RECORD_DATE): cv.datetime,
        vol.Optional(ATTR_NOTE): cv.string,
        vol.Optional(ATTR_LABEL_IDS): vol.All(cv.ensure_list, [cv.string]),
    }
)

_PATCHABLE = (
    ATTR_AMOUNT,
    ATTR_PAYMENT_TYPE,
    ATTR_CATEGORY_ID,
    ATTR_RECORD_DATE,
    ATTR_NOTE,
    ATTR_LABEL_IDS,
)


def build_update_record_payload(
    data: dict[str, Any], record_date_iso: str | None
) -> dict[str, Any]:
    """Map validated data to a PATCH item (pure). Only provided fields are sent."""
    payload: dict[str, Any] = {"id": data[ATTR_RECORD_ID]}
    if ATTR_AMOUNT in data:
        payload["amount"] = {"value": data[ATTR_AMOUNT]}
    if data.get(ATTR_PAYMENT_TYPE):
        payload["paymentType"] = data[ATTR_PAYMENT_TYPE]
    if data.get(ATTR_CATEGORY_ID):
        payload["categoryId"] = data[ATTR_CATEGORY_ID]
    if record_date_iso:
        payload["recordDate"] = record_date_iso
    if ATTR_NOTE in data:
        payload["note"] = data[ATTR_NOTE]
    if ATTR_LABEL_IDS in data:
        payload["labelIds"] = data[ATTR_LABEL_IDS]
    return payload


async def _handle_update_record(call: ServiceCall) -> ServiceResponse:
    """Patch a record on the single loaded entry (v1 = one token)."""
    data = call.data
    if not any(field in data for field in _PATCHABLE):
        raise ServiceValidationError(
            "Provide at least one field to change besides the record id."
        )
    coordinator = _single_entry(call.hass)
    record_date = _resolve_date(data) if ATTR_RECORD_DATE in data else None
    payload = build_update_record_payload(dict(data), record_date)

    try:
        result = await coordinator.client.async_update_record(payload)
    except WalletRecordError as err:
        raise ServiceValidationError(str(err)) from err
    except WalletApiError as err:
        raise HomeAssistantError(f"Wallet API error updating record: {err}") from err

    await coordinator.async_request_refresh()
    return {"record_id": result.get("id") or data[ATTR_RECORD_ID]}


# --- delete_record -----------------------------------------------------------

DELETE_RECORD_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_RECORD_ID): cv.string,
        vol.Optional(ATTR_FORCE, default=False): cv.boolean,
    }
)


def summarize_references(references: dict[str, Any]) -> dict[str, int]:
    """Collapse a references response to ``{type: total}`` for non-empty groups."""
    out: dict[str, int] = {}
    for key in ("records", "budgets", "recordRules", "standingOrders"):
        group = references.get(key)
        total = group.get("total") if isinstance(group, dict) else None
        if total:
            out[key] = total
    return out


async def _handle_delete_record(call: ServiceCall) -> ServiceResponse:
    """Delete a record after a references safety check (bypass with force)."""
    data = call.data
    record_id = data[ATTR_RECORD_ID]
    coordinator = _single_entry(call.hass)

    if not data.get(ATTR_FORCE):
        try:
            references = await coordinator.client.async_get_references(
                "records", record_id
            )
        except WalletApiError as err:
            raise HomeAssistantError(f"Wallet API error checking references: {err}") from err
        blocking = summarize_references(references)
        if blocking:
            refs = ", ".join(f"{k}={v}" for k, v in blocking.items())
            raise ServiceValidationError(
                f"Record {record_id} is referenced by other entities ({refs}). "
                "Set force: true to delete it anyway."
            )

    try:
        await coordinator.client.async_delete_record(record_id)
    except WalletRecordError as err:
        raise ServiceValidationError(str(err)) from err
    except WalletApiError as err:
        raise HomeAssistantError(f"Wallet API error deleting record: {err}") from err

    await coordinator.async_request_refresh()
    return {"record_id": record_id}


# --- add_transfer ------------------------------------------------------------

ADD_TRANSFER_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_FROM_ACCOUNT_ID): cv.string,
        vol.Required(ATTR_TO_ACCOUNT_ID): cv.string,
        vol.Required(ATTR_AMOUNT): vol.All(vol.Coerce(float), _non_zero),
        vol.Optional(ATTR_PAIRING_MODE, default=DEFAULT_PAIRING_MODE): vol.In(
            SERVICE_PAIRING_MODES
        ),
        vol.Optional(ATTR_RECORD_DATE): cv.datetime,
        vol.Optional(ATTR_NOTE): cv.string,
    }
)


def build_add_transfer_payload(
    data: dict[str, Any], record_date_iso: str
) -> dict[str, Any]:
    """Model a transfer as a record leaving the source account (pure).

    The amount is stored negative on the source (money out); the API creates the
    positive mirror on the target for pairing mode ``new``. Currency is inherited
    from the source account (never sent).
    """
    pairing_mode = data.get(ATTR_PAIRING_MODE, DEFAULT_PAIRING_MODE)
    transfer: dict[str, Any] = {"pairingMode": pairing_mode}
    if pairing_mode != "unpaired":
        transfer["accountId"] = data[ATTR_TO_ACCOUNT_ID]
    payload: dict[str, Any] = {
        "accountId": data[ATTR_FROM_ACCOUNT_ID],
        "amount": {"value": -abs(data[ATTR_AMOUNT])},
        "recordDate": record_date_iso,
        "transfer": transfer,
    }
    if data.get(ATTR_NOTE):
        payload["note"] = data[ATTR_NOTE]
    return payload


async def _handle_add_transfer(call: ServiceCall) -> ServiceResponse:
    """Create an account→account transfer (both accounts on the same token)."""
    hass = call.hass
    data = call.data
    coordinator, source = _find_account(hass, data[ATTR_FROM_ACCOUNT_ID])
    target = _find_account_in(coordinator, data[ATTR_TO_ACCOUNT_ID])

    for account in (source, target):
        if account.get("isBankSync"):
            raise ServiceValidationError(
                f"Account {account.get('name') or account.get('id')} is bank-synced "
                "and read-only; transfers apply to cash/manual accounts only."
            )

    payload = build_add_transfer_payload(dict(data), _resolve_date(data))
    try:
        result = await coordinator.client.async_create_record(payload)
    except WalletRecordError as err:
        raise ServiceValidationError(str(err)) from err
    except WalletApiError as err:
        raise HomeAssistantError(f"Wallet API error creating transfer: {err}") from err

    await coordinator.async_request_refresh()
    return {"record_id": result.get("id")}


# --- delete_standing_order / delete_record_rule (M5) -------------------------

DELETE_STANDING_ORDER_SCHEMA = vol.Schema(
    {vol.Required(ATTR_STANDING_ORDER_ID): cv.string}
)
DELETE_RECORD_RULE_SCHEMA = vol.Schema({vol.Required(ATTR_RECORD_RULE_ID): cv.string})


def _make_delete_handler(entity_type: str, id_field: str):
    """Build a handler that deletes one advanced entity by id (single entry)."""

    async def handler(call: ServiceCall) -> ServiceResponse:
        entity_id = call.data[id_field]
        coordinator = _single_entry(call.hass)
        try:
            await coordinator.client.async_delete_entity(entity_type, entity_id)
        except WalletRecordError as err:
            raise ServiceValidationError(str(err)) from err
        except WalletApiError as err:
            raise HomeAssistantError(
                f"Wallet API error deleting {entity_type}: {err}"
            ) from err
        await coordinator.async_request_refresh()
        return {"id": entity_id}

    return handler


# --- shared helpers ----------------------------------------------------------


def _resolve_date(data: dict[str, Any]) -> str:
    """Return an ISO 8601 record date (defaults to now, local tz if naive)."""
    record_date = data.get(ATTR_RECORD_DATE) or dt_util.now()
    if record_date.tzinfo is None:
        record_date = record_date.replace(tzinfo=dt_util.now().tzinfo)
    return record_date.isoformat()


def _find_account_in(coordinator, account_id: str) -> dict[str, Any]:
    """Find an account within one coordinator's snapshot, or raise."""
    for account in getattr(coordinator.data, "accounts", []) or []:
        if str(account.get("id")) == account_id:
            return account
    raise ServiceValidationError(
        f"No tracked Wallet account with id {account_id} was found."
    )


def _single_entry(hass: HomeAssistant) -> WalletDataUpdateCoordinator:
    """Return the one loaded coordinator (v1 = single token).

    Record-scoped services carry no account, so with multiple entries we cannot
    tell which token owns the record; ask the user to disambiguate then.
    """
    coordinators = [
        entry.runtime_data.coordinator
        for entry in hass.config_entries.async_entries(DOMAIN)
        if getattr(entry, "runtime_data", None) is not None
    ]
    if len(coordinators) == 1:
        return coordinators[0]
    raise ServiceValidationError(
        "Multiple Wallet accounts are configured; record-scoped services need a "
        "single account in v1."
    )


def async_setup_services(hass: HomeAssistant) -> None:
    """Register integration services once."""
    if hass.services.has_service(DOMAIN, SERVICE_ADD_RECORD):
        return
    # Imported lazily to avoid a circular import (management uses helpers here).
    from .management import MANAGEMENT_SERVICE_NAMES, management_services

    services = (
        (SERVICE_ADD_RECORD, _handle_add_record, ADD_RECORD_SCHEMA),
        (SERVICE_UPDATE_RECORD, _handle_update_record, UPDATE_RECORD_SCHEMA),
        (SERVICE_DELETE_RECORD, _handle_delete_record, DELETE_RECORD_SCHEMA),
        (SERVICE_ADD_TRANSFER, _handle_add_transfer, ADD_TRANSFER_SCHEMA),
        (
            SERVICE_DELETE_STANDING_ORDER,
            _make_delete_handler("standing-orders", ATTR_STANDING_ORDER_ID),
            DELETE_STANDING_ORDER_SCHEMA,
        ),
        (
            SERVICE_DELETE_RECORD_RULE,
            _make_delete_handler("record-rules", ATTR_RECORD_RULE_ID),
            DELETE_RECORD_RULE_SCHEMA,
        ),
        *management_services(),
    )
    # Destructive and structural services are admin-only. The flagship setup is a
    # shared wall panel, which is exactly where a non-admin or guest user reaches
    # the service registry — and every one of these writes to real financial data.
    # add_record/update_record stay open: logging a cash expense is the point.
    admin_only = {
        SERVICE_DELETE_RECORD,
        SERVICE_ADD_TRANSFER,
        SERVICE_DELETE_STANDING_ORDER,
        SERVICE_DELETE_RECORD_RULE,
        *MANAGEMENT_SERVICE_NAMES,
    }
    for name, handler, schema in services:
        if name in admin_only:
            async_register_admin_service(
                hass,
                DOMAIN,
                name,
                handler,
                schema=schema,
                supports_response=SupportsResponse.OPTIONAL,
            )
            continue
        hass.services.async_register(
            DOMAIN,
            name,
            handler,
            schema=schema,
            supports_response=SupportsResponse.OPTIONAL,
        )


def async_unload_services(hass: HomeAssistant) -> None:
    """Remove integration services when the last entry is unloaded."""
    from .management import MANAGEMENT_SERVICE_NAMES

    names = (
        SERVICE_ADD_RECORD,
        SERVICE_UPDATE_RECORD,
        SERVICE_DELETE_RECORD,
        SERVICE_ADD_TRANSFER,
        SERVICE_DELETE_STANDING_ORDER,
        SERVICE_DELETE_RECORD_RULE,
        *MANAGEMENT_SERVICE_NAMES,
    )
    for name in names:
        if hass.services.has_service(DOMAIN, name):
            hass.services.async_remove(DOMAIN, name)
