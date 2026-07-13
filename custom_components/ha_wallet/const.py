"""Constants for the Wallet by BudgetBakers integration."""

from __future__ import annotations

from datetime import timedelta
from typing import Final

DOMAIN: Final = "ha_wallet"

# Display name (unofficial, not affiliated with BudgetBakers).
NAME: Final = "Wallet by BudgetBakers"
MANUFACTURER: Final = "BudgetBakers (unofficial)"
ATTRIBUTION: Final = "Data provided by the Wallet by BudgetBakers REST API"

# --- API ---------------------------------------------------------------------
# Base URL already includes the service segment; endpoints live under /v1/api.
API_BASE_URL: Final = "https://rest.budgetbakers.com/wallet"
API_PREFIX: Final = "/v1/api"

# Config-entry keys.
CONF_TOKEN: Final = "token"  # Bearer token from the Wallet web app (Premium).

# Options-flow keys.
CONF_ACCOUNT_IDS: Final = "account_ids"
CONF_BUDGET_IDS: Final = "budget_ids"
CONF_PERIOD: Final = "period"

PERIOD_THIS_YEAR: Final = "this_year"
PERIOD_THIS_MONTH: Final = "this_month"
PERIOD_CUSTOM: Final = "custom"
PERIODS: Final = (PERIOD_THIS_YEAR, PERIOD_THIS_MONTH, PERIOD_CUSTOM)
DEFAULT_PERIOD: Final = PERIOD_THIS_YEAR

# --- Polling / rate limiting -------------------------------------------------
# We poll on a slow base cadence and short-circuit when X-Last-Data-Change-Rev
# is unchanged, so almost every poll costs a single cheap request. The 300 req/h
# figure in the docs is only a default: the real ceiling is read at runtime from
# the X-RateLimit-Limit header and never hardcoded for enforcement.
DEFAULT_SCAN_INTERVAL: Final = timedelta(minutes=5)
RATE_LIMIT_DEFAULT: Final = 300  # documented hourly default; superseded by header.

# When X-RateLimit-Remaining drops to/below this we skip the poll to keep
# headroom for user-triggered writes (services land in M2+).
RATE_LIMIT_SAFETY_MARGIN: Final = 10

# Initial-sync 409 handling: retry with capped exponential backoff. The API does
# not reliably return retry_after_minutes, so we drive backoff ourselves.
INIT_SYNC_BACKOFF_START: Final = timedelta(seconds=30)
INIT_SYNC_BACKOFF_MAX: Final = timedelta(minutes=10)

# --- Response headers --------------------------------------------------------
HEADER_CHANGE_REV: Final = "X-Last-Data-Change-Rev"
HEADER_CHANGE_AT: Final = "X-Last-Data-Change-At"
HEADER_SYNC_IN_PROGRESS: Final = "X-Sync-In-Progress"
HEADER_RATELIMIT_LIMIT: Final = "X-RateLimit-Limit"
HEADER_RATELIMIT_REMAINING: Final = "X-RateLimit-Remaining"
HEADER_RETRY_AFTER: Final = "Retry-After"
