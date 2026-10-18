/**
 * Shared constants for the Wallet by BudgetBakers card set.
 *
 * The component (`ha_wallet`) exposes entities as
 * `sensor.wallet_by_budgetbakers_<key>` on a single device named
 * "Wallet by BudgetBakers" (has_entity_name). Real entity ids are discovered
 * from that device or pinned in config — never hardcode a full slug beyond the
 * documented key suffixes below.
 */

export const CARD_VERSION = "0.1.2";
export const DOMAIN = "ha_wallet";

/** Device name used by the integration (has_entity_name single device). */
export const DEVICE_NAME = "Wallet by BudgetBakers";

/** Prefix of the real, built entity ids. */
export const ENTITY_PREFIX = "sensor.wallet_by_budgetbakers_";

/**
 * Singleton sensor entity-id suffixes. NOTE: the real suffix is the entity
 * *name* slugified (has_entity_name), which for translated sensors can differ
 * from the component's internal translation_key. Verified against the shipped
 * strings.json: most names match their key, but `spending_by_cardinality` is
 * named "Spending by nature" → `spending_by_nature`, and `api_usage` is
 * "API requests remaining" → `api_requests_remaining`.
 */
export const KEY = {
  cashFlow: "cash_flow",
  spending: "spending",
  spendingByCardinality: "spending_by_nature",
  lastRecords: "last_records",
  creditUtilization: "credit_utilization",
  apiUsage: "api_requests_remaining",
  standingOrders: "standing_orders",
  recordRules: "record_rules",
  categories: "categories",
  labels: "labels",
} as const;

/** Prefixes of the dynamic, name-slugified sensors (one entity per item). */
export const PREFIX = {
  account: "account_",
  balance: "balance_",
  budget: "budget_",
  goal: "goal_",
} as const;

/** Services registered by the component (services.yaml). */
export const SERVICE = {
  addRecord: "add_record",
  updateRecord: "update_record",
  deleteRecord: "delete_record",
  addTransfer: "add_transfer",
  manageBudget: "manage_budget",
  manageCategory: "manage_category",
  manageAccount: "manage_account",
  manageLabel: "manage_label",
  deleteStandingOrder: "delete_standing_order",
  deleteRecordRule: "delete_record_rule",
  /** Deferred to a 0.1.x point release — always feature-check before using. */
  importHistory: "import_history",
} as const;

/** Period options from the integration options flow. */
export const PERIOD_LABEL: Record<string, string> = {
  this_year: "This year",
  this_month: "This month",
  custom: "Custom period",
};

/**
 * Fixed brand & semantic colors — constant across light/dark themes
 * (CARD-BUILD-SPEC §0.2). Surfaces and text use HA theme vars instead.
 */
export const COLOR = {
  // Wallet category identity.
  housing: "#F7A81B",
  shopping: "#4EC3F7",
  food: "#F5433A",
  life: "#8BC34A",
  comm: "#5C6BC0",
  vehicle: "#AF52DE",
  // Semantic.
  income: "#34C759",
  expense: "#F5433A",
  transfer: "#4C8DFF",
  // VS-previous chip.
  up: "#1f9d4d",
  upBg: "rgba(52,199,89,.15)",
  down: "#e0362b",
  downBg: "rgba(245,67,58,.14)",
  // Chart accents used by the mockup screenshots.
  balanceBar: "#3EC6E0",
  areaLine: "#4C8DFF",
  bankSynced: "#1E7A46",
  cashAccount: "#3EC6E0",
  // Period-to-period comparison lines.
  cmpCurrent: "#4C8DFF",
  cmpYearAgo: "#FF9F0A",
  cmpPrevious: "#FF2E97",
  // nugg3tz brand chrome accents.
  brandAmber: "#FF7A1A",
  brandAcid: "#C6FF3A",
  brandBase: "#0B0E14",
} as const;

/**
 * Category color lookup by canonical Wallet name (fallback when a category's
 * own `color` field is absent). Resolution order: category.color → this map.
 */
export const CATEGORY_COLOR_BY_NAME: Record<string, string> = {
  housing: COLOR.housing,
  shopping: COLOR.shopping,
  "food & drinks": COLOR.food,
  food: COLOR.food,
  "life & entertainment": COLOR.life,
  life: COLOR.life,
  "communication, pc": COLOR.comm,
  communication: COLOR.comm,
  vehicle: COLOR.vehicle,
};

/**
 * Wallet API color-name enum → hex, so a category/account/label whose `color`
 * field is one of the manage_* enum names (Blue, Orange, …) renders correctly.
 */
export const NAMED_COLOR: Record<string, string> = {
  Blue: "#2F6FED",
  Charcoal: "#4B5563",
  CoffeeBrown: "#795548",
  DarkPurple: "#5B2C86",
  Green: "#34C759",
  LightBlue: "#4EC3F7",
  Lime: "#C6FF3A",
  Orange: "#F7A81B",
  PineGreen: "#1E7A46",
  Pink: "#FF2E97",
  Purple: "#AF52DE",
  Red: "#F5433A",
  Stone: "#8D8D93",
  Turquoise: "#3EC6E0",
  Wine: "#8E1E3B",
  Yellow: "#FFD60A",
};

/** Category chip icon by canonical name (mdi). */
export const CATEGORY_ICON: Record<string, string> = {
  housing: "mdi:home-variant",
  shopping: "mdi:shopping",
  "food & drinks": "mdi:silverware-fork-knife",
  food: "mdi:silverware-fork-knife",
  "life & entertainment": "mdi:party-popper",
  life: "mdi:party-popper",
  "communication, pc": "mdi:laptop",
  communication: "mdi:laptop",
  vehicle: "mdi:car",
};

export const PAYMENT_TYPES = [
  "cash",
  "debit_card",
  "credit_card",
  "transfer",
  "voucher",
  "mobile_payment",
  "web_payment",
] as const;

export const BUDGET_TYPES = [
  "BUDGET_INTERVAL_WEEK",
  "BUDGET_INTERVAL_MONTH",
  "BUDGET_INTERVAL_YEAR",
  "BUDGET_CUSTOM",
] as const;

export const ACCOUNT_TYPES = [
  "General",
  "Cash",
  "CurrentAccount",
  "SavingAccount",
  "Insurance",
] as const;

export const CARDINALITIES = ["none", "must", "need", "want"] as const;

export const COLOR_NAMES = Object.keys(NAMED_COLOR);
