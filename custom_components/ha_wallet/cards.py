"""Serve the bundled Lovelace cards and load them in the frontend.

The card set ships inside the integration (``www/ha-wallet-card.js``, built
from ``frontend/`` at the repo root). On setup the file is exposed over HTTP
and added as an extra frontend module, so the cards are available on every
dashboard without the user adding a resource by hand, in storage and YAML
mode alike. The query string carries the integration version, which busts the
browser cache on every upgrade.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN

CARD_FILENAME: Final = "ha-wallet-card.js"
CARD_URL: Final = f"/{DOMAIN}/{CARD_FILENAME}"
CARD_PATH: Final = Path(__file__).parent / "www" / CARD_FILENAME


async def async_register_cards(hass: HomeAssistant) -> None:
    """Expose the card bundle and load it in the frontend (once per run)."""
    integration = await async_get_integration(hass, DOMAIN)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(CARD_PATH), cache_headers=True)]
    )
    add_extra_js_url(hass, f"{CARD_URL}?v={integration.version}")
