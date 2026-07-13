"""Config and options flow for Wallet by BudgetBakers."""

from __future__ import annotations

import base64
import binascii
import json
import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .api import (
    WalletApiClient,
    WalletApiError,
    WalletAuthError,
    WalletConnectionError,
    WalletInitSyncError,
    WalletRateLimitError,
)
from .const import (
    CONF_ACCOUNT_IDS,
    CONF_PERIOD,
    CONF_TOKEN,
    DEFAULT_PERIOD,
    DOMAIN,
    NAME,
    PERIODS,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

TOKEN_SELECTOR = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))


def _jwt_subject(token: str) -> str | None:
    """Best-effort read of the JWT ``sub`` claim (the client id).

    Used purely as a stable ``unique_id`` so the same token cannot be added
    twice. The signature is not verified — we never trust these bytes for auth,
    only for de-duplication. Returns ``None`` if the token is not a JWT.
    """
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1]
    payload += "=" * (-len(payload) % 4)  # restore base64 padding
    try:
        decoded = base64.urlsafe_b64decode(payload)
        claims = json.loads(decoded)
    except (binascii.Error, ValueError, json.JSONDecodeError):
        return None
    sub = claims.get("sub")
    return str(sub) if sub is not None else None


async def _validate_token(hass: HomeAssistant, token: str) -> str | None:
    """Validate a token against the API. Returns an error key, or ``None`` if OK.

    A ``409`` (initial sync) counts as valid: the token authenticated, so we let
    setup proceed and the coordinator retries with backoff.
    """
    client = WalletApiClient(async_get_clientsession(hass), token)
    try:
        await client.async_get_accounts()
    except WalletAuthError:
        return "invalid_auth"
    except WalletInitSyncError:
        return None
    except WalletRateLimitError:
        return "rate_limited"
    except WalletConnectionError:
        return "cannot_connect"
    except WalletApiError:
        return "unknown"
    return None


class WalletConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle the UI-driven setup for a single Wallet token."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Collect and validate the Bearer token."""
        errors: dict[str, str] = {}
        if user_input is not None:
            token = user_input[CONF_TOKEN].strip()

            subject = _jwt_subject(token)
            if subject is not None:
                await self.async_set_unique_id(subject)
                self._abort_if_unique_id_configured()

            error = await _validate_token(self.hass, token)
            if error:
                errors["base"] = error
            else:
                return self.async_create_entry(
                    title=NAME, data={CONF_TOKEN: token}
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_TOKEN): TOKEN_SELECTOR}),
            errors=errors,
        )

    async def async_step_reauth(
        self, entry_data: dict[str, Any]
    ) -> ConfigFlowResult:
        """Start reauth when the stored token is rejected (401)."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Let the user paste a fresh token, keeping the same entry."""
        errors: dict[str, str] = {}
        reauth_entry = self._get_reauth_entry()
        if user_input is not None:
            token = user_input[CONF_TOKEN].strip()
            error = await _validate_token(self.hass, token)
            if error:
                errors["base"] = error
            else:
                return self.async_update_reload_and_abort(
                    reauth_entry, data_updates={CONF_TOKEN: token}
                )

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_TOKEN): TOKEN_SELECTOR}),
            errors=errors,
        )

    @staticmethod
    def async_get_options_flow(config_entry: ConfigEntry) -> WalletOptionsFlow:
        """Return the options flow handler."""
        return WalletOptionsFlow()


class WalletOptionsFlow(OptionsFlow):
    """Select which accounts to expose and the reporting period.

    Budget selection joins here in M1 once budget sensors exist; the option key
    is reserved now so the stored shape stays stable.
    """

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Show account/period selection populated from live coordinator data."""
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        options = self.config_entry.options
        account_choices = self._account_choices()

        schema = vol.Schema(
            {
                vol.Optional(
                    CONF_ACCOUNT_IDS,
                    default=options.get(
                        CONF_ACCOUNT_IDS, [c["value"] for c in account_choices]
                    ),
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=account_choices,
                        multiple=True,
                        mode=SelectSelectorMode.LIST,
                    )
                ),
                vol.Optional(
                    CONF_PERIOD,
                    default=options.get(CONF_PERIOD, DEFAULT_PERIOD),
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=list(PERIODS),
                        translation_key="period",
                    )
                ),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)

    def _account_choices(self) -> list[SelectOptionDict]:
        """Build account options from the running coordinator's snapshot."""
        runtime = getattr(self.config_entry, "runtime_data", None)
        coordinator = getattr(runtime, "coordinator", None)
        data = getattr(coordinator, "data", None)
        accounts = getattr(data, "accounts", []) or []
        choices: list[SelectOptionDict] = []
        for account in accounts:
            account_id = account.get("id")
            if account_id is None:
                continue
            label = account.get("name") or str(account_id)
            choices.append(SelectOptionDict(value=str(account_id), label=label))
        return choices
