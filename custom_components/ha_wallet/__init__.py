"""The Wallet by BudgetBakers integration.

Unofficial Home Assistant integration for Wallet by BudgetBakers, built on the
official Wallet REST API. Not affiliated with BudgetBakers.

Sets up the API client and the polling coordinator and forwards the sensor
platform (M1 read core: balances, budgets, spending, records).
"""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import WalletApiClient
from .const import CONF_TOKEN
from .coordinator import WalletDataUpdateCoordinator

PLATFORMS: list[Platform] = [Platform.SENSOR]


@dataclass(slots=True)
class WalletRuntimeData:
    """Objects shared across the config entry's lifetime."""

    client: WalletApiClient
    coordinator: WalletDataUpdateCoordinator


type WalletConfigEntry = ConfigEntry[WalletRuntimeData]


async def async_setup_entry(hass: HomeAssistant, entry: WalletConfigEntry) -> bool:
    """Set up Wallet by BudgetBakers from a config entry."""
    session = async_get_clientsession(hass)
    client = WalletApiClient(session, entry.data[CONF_TOKEN])
    coordinator = WalletDataUpdateCoordinator(hass, entry, client)

    # Raises ConfigEntryNotReady (retry) on transient failures, or
    # ConfigEntryAuthFailed (reauth) on a rejected token.
    await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = WalletRuntimeData(client=client, coordinator=coordinator)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload_on_update))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: WalletConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_reload_on_update(
    hass: HomeAssistant, entry: WalletConfigEntry
) -> None:
    """Reload the entry when options change (account/period selection)."""
    await hass.config_entries.async_reload(entry.entry_id)
