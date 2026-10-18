"""Bundled card registration tests."""

from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.loader import async_get_integration

from custom_components.ha_wallet.cards import (
    CARD_PATH,
    CARD_URL,
    async_register_cards,
)
from custom_components.ha_wallet.const import DOMAIN


def test_bundle_is_shipped_inside_the_integration():
    assert CARD_PATH.is_file()
    assert CARD_PATH.parent.name == "www"


async def test_registers_static_path_and_versioned_module(hass):
    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    version = (await async_get_integration(hass, DOMAIN)).version

    with patch("custom_components.ha_wallet.cards.add_extra_js_url") as add_js:
        await async_register_cards(hass)

    (configs,), _ = hass.http.async_register_static_paths.call_args
    assert [(c.url_path, c.path) for c in configs] == [(CARD_URL, str(CARD_PATH))]
    add_js.assert_called_once_with(hass, f"{CARD_URL}?v={version}")
