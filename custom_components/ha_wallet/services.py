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
from homeassistant.util import dt as dt_util

from .api import WalletApiError, WalletRecordError
from .const import (
    ATTR_ACCOUNT_ID,
    ATTR_AMOUNT,
    ATTR_CATEGORY_ID,
    ATTR_LABEL_IDS,
    ATTR_NOTE,
    ATTR_PAYMENT_TYPE,
    ATTR_RECORD_DATE,
    DOMAIN,
    PAYMENT_TYPES,
    SERVICE_ADD_RECORD,
)

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
        translation_domain=DOMAIN,
        translation_key="account_not_found",
        translation_placeholders={"account_id": account_id},
    )


async def _handle_add_record(call: ServiceCall) -> ServiceResponse:
    """Validate, create the record, and refresh so sensors reflect it."""
    hass = call.hass
    data = call.data
    coordinator, account = _find_account(hass, data[ATTR_ACCOUNT_ID])

    if account.get("isBankSync"):
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="account_read_only",
            translation_placeholders={"name": account.get("name") or ""},
        )

    record_date = data.get(ATTR_RECORD_DATE) or dt_util.now()
    if record_date.tzinfo is None:
        # Interpret a naive datetime in Home Assistant's local time zone.
        record_date = record_date.replace(tzinfo=dt_util.now().tzinfo)
    payload = build_add_record_payload(dict(data), record_date.isoformat())

    try:
        result = await coordinator.client.async_create_record(payload)
    except WalletRecordError as err:
        # Client-side rejection (e.g. a constraint we did not pre-check).
        raise ServiceValidationError(str(err)) from err
    except WalletApiError as err:
        raise HomeAssistantError(f"Wallet API error creating record: {err}") from err

    await coordinator.async_request_refresh()
    return {"record_id": result.get("id")}


def async_setup_services(hass: HomeAssistant) -> None:
    """Register integration services once."""
    if hass.services.has_service(DOMAIN, SERVICE_ADD_RECORD):
        return
    hass.services.async_register(
        DOMAIN,
        SERVICE_ADD_RECORD,
        _handle_add_record,
        schema=ADD_RECORD_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )


def async_unload_services(hass: HomeAssistant) -> None:
    """Remove integration services when the last entry is unloaded."""
    if hass.services.has_service(DOMAIN, SERVICE_ADD_RECORD):
        hass.services.async_remove(DOMAIN, SERVICE_ADD_RECORD)
