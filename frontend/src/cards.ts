/**
 * Wallet by BudgetBakers card set — every card plus the card-picker registry.
 *
 * Importing a card module defines its custom element (via @customElement).
 * Here we import every card and advertise them to the Lovelace card picker
 * through window.customCards. Loaded by `index.ts`.
 */

import { CARD_VERSION } from "./const";

// GUI editor (shared by all cards via getConfigElement)
import "./editor/card-editor";

// Analytic (12)
import "./analytic/cash-flow-card";
import "./analytic/cash-flow-trend-card";
import "./analytic/spending-card";
import "./analytic/nature-of-spending-card";
import "./analytic/balance-by-currencies-card";
import "./analytic/spending-by-categories-card";
import "./analytic/credit-limits-card";
import "./analytic/balance-trend-card";
import "./analytic/expenses-structure-card";
import "./analytic/period-comparison-card";
import "./analytic/last-records-card";
import "./analytic/accounts-card";

// Quick entry (1)
import "./quick-add/quick-add-card";

// Action / write-side (8)
import "./action/records-card";
import "./action/transfer-card";
import "./action/budgets-card";
import "./action/categories-card";
import "./action/accounts-action-card";
import "./action/labels-card";
import "./action/automations-card";
import "./action/import-history-card";

const DOC = "https://github.com/nuggetz/ha-wallet#dashboard-cards";

interface CardMeta {
  type: string;
  name: string;
  description: string;
}

const CARDS: CardMeta[] = [
  ["wallet-cash-flow-card", "Wallet · Cash Flow", "Net income vs expense with a VS-previous chip."],
  ["wallet-cash-flow-trend-card", "Wallet · Cash Flow Trend", "Monthly income/expense bars + net line (LTS)."],
  ["wallet-spending-card", "Wallet · Spending", "Spending gauge with total and VS-previous."],
  ["wallet-nature-of-spending-card", "Wallet · Nature of Spending", "Must / Need / Want split."],
  ["wallet-balance-by-currencies-card", "Wallet · Balance by Currencies", "One bar per currency, never merged."],
  ["wallet-spending-by-categories-card", "Wallet · Spending by Categories", "Category bars for the period."],
  ["wallet-credit-limits-card", "Wallet · Credit Limits", "Credit balance / limit utilization."],
  ["wallet-balance-trend-card", "Wallet · Balance Trend", "Balance area chart over time (LTS)."],
  ["wallet-expenses-structure-card", "Wallet · Expenses Structure", "Donut of expense shares by category."],
  ["wallet-period-comparison-card", "Wallet · Period to Period", "Compare metric across three windows (LTS)."],
  ["wallet-last-records-card", "Wallet · Last Records", "Most recent records list."],
  ["wallet-accounts-card", "Wallet · Accounts", "Account balances with sync status."],
  ["wallet-quick-add-card", "Wallet · Quick Add", "Keypad cash entry → add_record."],
  ["wallet-records-action-card", "Wallet · Records (write)", "Add / edit / delete records."],
  ["wallet-transfer-card", "Wallet · Transfer", "Account-to-account transfer."],
  ["wallet-budgets-action-card", "Wallet · Budgets (write)", "Create / patch / delete budgets."],
  ["wallet-categories-action-card", "Wallet · Categories (write)", "Manage custom categories."],
  ["wallet-accounts-action-card", "Wallet · Accounts (write)", "Create / patch accounts."],
  ["wallet-labels-action-card", "Wallet · Labels (write)", "Create / patch labels."],
  ["wallet-automations-action-card", "Wallet · Automations", "Delete standing orders / record rules."],
  ["wallet-import-history-card", "Wallet · Import History", "Seed LTS from a CSV export (0.1.x)."],
].map(([type, name, description]) => ({ type, name, description }));

window.customCards = window.customCards ?? [];
for (const c of CARDS) {
  window.customCards.push({
    // Bare element name — HA prepends "custom:" itself when building the picker
    // preview. Prefixing here would double it ("custom:custom:…") and the
    // preview fails with "Custom element not found".
    type: c.type,
    name: c.name,
    description: c.description,
    // Live preview in the picker. Works now that getStubConfig() provides a
    // valid stub config (the earlier spinner was HA unable to build a preview
    // without a stub, not the preview flag itself).
    preview: true,
    documentationURL: DOC,
  });
}

// eslint-disable-next-line no-console
console.info(
  `%c ha-wallet-card %c v${CARD_VERSION} `,
  "color:#0B0E14;background:#C6FF3A;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px",
  "color:#fff;background:#FF7A1A;font-weight:700;border-radius:0 4px 4px 0;padding:2px 6px",
);
