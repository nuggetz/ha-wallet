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
CONF_CUSTOM_START: Final = "custom_start"
CONF_CUSTOM_END: Final = "custom_end"

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

# --- M1 read layer -----------------------------------------------------------
# Number of most-recent records surfaced by the "last records" sensor.
LAST_RECORDS_COUNT: Final = 10

# Account types the API treats as credit-like; used (best-effort) for the credit
# utilization sensor, which reads balance.creditLimit / creditBalance.
CREDIT_ACCOUNT_TYPES: Final = ("CreditCard", "Overdraft")

# --- Services (M2–M4) --------------------------------------------------------
SERVICE_ADD_RECORD: Final = "add_record"
SERVICE_UPDATE_RECORD: Final = "update_record"
SERVICE_DELETE_RECORD: Final = "delete_record"
SERVICE_ADD_TRANSFER: Final = "add_transfer"

# M4 management services: one per entity with an `operation` field.
SERVICE_MANAGE_BUDGET: Final = "manage_budget"
SERVICE_MANAGE_CATEGORY: Final = "manage_category"
SERVICE_MANAGE_ACCOUNT: Final = "manage_account"
SERVICE_MANAGE_LABEL: Final = "manage_label"

# M5 delete services for advanced entities.
SERVICE_DELETE_STANDING_ORDER: Final = "delete_standing_order"
SERVICE_DELETE_RECORD_RULE: Final = "delete_record_rule"
ATTR_STANDING_ORDER_ID: Final = "standing_order_id"
ATTR_RECORD_RULE_ID: Final = "record_rule_id"

ATTR_OPERATION: Final = "operation"
OP_CREATE: Final = "create"
OP_PATCH: Final = "patch"
OP_DELETE: Final = "delete"
OPERATIONS: Final = (OP_CREATE, OP_PATCH, OP_DELETE)

# Management field keys.
ATTR_BUDGET_ID: Final = "budget_id"
ATTR_LABEL_ID: Final = "label_id"
ATTR_NAME: Final = "name"
ATTR_BUDGET_TYPE: Final = "type"
ATTR_CURRENCY_CODE: Final = "currency_code"
ATTR_START_DATE: Final = "start_date"
ATTR_END_DATE: Final = "end_date"
ATTR_CLOSED: Final = "closed"
ATTR_PARENT_ID: Final = "parent_id"
ATTR_CARDINALITY: Final = "cardinality"
ATTR_COLOR: Final = "color"
ATTR_ACCOUNT_TYPE_FIELD: Final = "account_type"
ATTR_INITIAL_BALANCE: Final = "initial_balance"
ATTR_EXCLUDE_FROM_STATS: Final = "exclude_from_stats"
ATTR_ARCHIVED: Final = "archived"

# API enums (mirror the OpenAPI spec).
BUDGET_TYPES: Final = (
    "BUDGET_INTERVAL_WEEK",
    "BUDGET_INTERVAL_MONTH",
    "BUDGET_INTERVAL_YEAR",
    "BUDGET_CUSTOM",
)
CREATABLE_ACCOUNT_TYPES: Final = (
    "General",
    "Cash",
    "CurrentAccount",
    "SavingAccount",
    "Insurance",
)
CATEGORY_CARDINALITIES: Final = ("none", "must", "need", "want")
COLOR_NAMES: Final = (
    "Blue",
    "Charcoal",
    "CoffeeBrown",
    "DarkPurple",
    "Green",
    "LightBlue",
    "Lime",
    "Orange",
    "PineGreen",
    "Pink",
    "Purple",
    "Red",
    "Stone",
    "Turquoise",
    "Wine",
    "Yellow",
)

# add_record fields (service schema keys). Amount sign drives the record type:
# negative = expense, positive = income (never zero). Currency is inherited from
# the account, never sent, per the multi-currency rule.
ATTR_ACCOUNT_ID: Final = "account_id"
ATTR_AMOUNT: Final = "amount"
ATTR_PAYMENT_TYPE: Final = "payment_type"
ATTR_CATEGORY_ID: Final = "category_id"
ATTR_RECORD_DATE: Final = "record_date"
ATTR_NOTE: Final = "note"
ATTR_LABEL_IDS: Final = "label_ids"

# update_record / delete_record / add_transfer fields (M3).
ATTR_RECORD_ID: Final = "record_id"
ATTR_FORCE: Final = "force"
ATTR_FROM_ACCOUNT_ID: Final = "from_account_id"
ATTR_TO_ACCOUNT_ID: Final = "to_account_id"
ATTR_PAIRING_MODE: Final = "pairing_mode"

# Transfer pairing: new = create a linked mirror on the target account,
# unpaired = single transfer-typed record, existing = bind to an existing record.
PAIRING_MODES: Final = ("new", "unpaired", "existing")
DEFAULT_PAIRING_MODE: Final = "new"

PAYMENT_TYPES: Final = (
    "cash",
    "debit_card",
    "credit_card",
    "transfer",
    "voucher",
    "mobile_payment",
    "web_payment",
)

# Common entity/attribute keys (kept here so sensors and the card SPEC agree).
ATTR_CURRENCY: Final = "currency"
ATTR_PERIOD: Final = "period"
ATTR_VS_PREVIOUS_PCT: Final = "vs_previous_pct"
ATTR_ACCOUNT_TYPE: Final = "account_type"
ATTR_BANK_SYNCED: Final = "bank_synced"
ATTR_LAST_CHANGE: Final = "last_change"
ATTR_ACCOUNT_IDS: Final = "account_ids"
ATTR_INCOME: Final = "income"
ATTR_EXPENSE: Final = "expense"
ATTR_BY_CATEGORY: Final = "by_category"
ATTR_LIMIT: Final = "limit"
ATTR_REMAINING: Final = "remaining"
ATTR_CATEGORY_IDS: Final = "category_ids"
ATTR_RECORDS: Final = "records"
ATTR_CREDIT_BALANCE: Final = "credit_balance"
ATTR_TOTAL_CREDIT_LIMIT: Final = "total_credit_limit"
ATTR_AVAILABLE: Final = "available"

# M5 sensor attributes.
ATTR_RESET_AT: Final = "reset_at"
ATTR_GOAL_STATE: Final = "goal_state"
ATTR_DESIRED_DATE: Final = "desired_date"
ATTR_INITIAL_AMOUNT: Final = "initial_amount"
ATTR_ORDERS: Final = "orders"
ATTR_RULES: Final = "rules"
