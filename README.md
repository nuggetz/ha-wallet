# Wallet by BudgetBakers — Home Assistant integration

[![hacs][hacs-badge]][hacs-url]
[![license][license-badge]](LICENSE)

Bring your **[Wallet by BudgetBakers][wallet]** finances into Home Assistant over
the **official Wallet REST API** — see balances, budgets and spending as
entities, and (from a later milestone) log cash expenses from a home wall panel
straight back into the Wallet app.

> **Unofficial / not affiliated.** This is a community integration. It is not
> made by, endorsed by, or affiliated with BudgetBakers. "Wallet by
> BudgetBakers" is used only to describe what the integration connects to.

## Why this integration

- **Bidirectional & app-synced** — the only Home Assistant finance integration
  that both reads *and* writes to a real mobile app you already use (cash entry
  lands in a later milestone). Others are read-only mirrors or local-only tools.
- **Private by design** — runs locally, your token stays on your instance, and
  bank-synced accounts are read-only. Nothing is sent to a third party.
- **Multi-currency & i18n from day one** — currency is inherited from Wallet per
  account, never hardcoded; strings are translatable.

## Requirements

- A **Wallet Premium** plan and a **Bearer token** from the Wallet web app
  (Settings → API). The token maps to one Wallet account.
- Home Assistant **2024.12** or newer.

The Premium requirement is inherent to the official API — this integration is
built on the supported API rather than a fragile email/notification hack.

## Installation (HACS)

1. In HACS, add this repository as a **custom repository** (category:
   *Integration*): `https://github.com/nuggetz/ha-wallet`.
2. Search for **Wallet by BudgetBakers** in HACS and install it.
3. Restart Home Assistant.
4. Go to **Settings → Devices & Services → Add Integration**, search for
   **Wallet by BudgetBakers**, and paste your API token.
5. Use the integration's **Configure** button to pick which accounts to expose
   and the reporting period.

> If your token is later rejected, Home Assistant will prompt you to
> **re-authenticate** — just paste a fresh token.

## Privacy & data handling

- The token is stored in Home Assistant's encrypted config entry and **never
  logged**.
- Bank-synced accounts are **read-only** by API design; the integration can only
  write to cash/manual accounts (write features land in a later milestone).

## Services

### `ha_wallet.add_record`

Create an expense or income on a **cash/manual** account. The **amount sign**
selects the type — negative = expense, positive = income (never zero) — and the
**currency is inherited from the account** (never sent). Writes to bank-synced
accounts are rejected with a clear error.

| Field | Required | Notes |
|---|---|---|
| `account_id` | ✅ | A cash/manual account id (bank-synced accounts are read-only). |
| `amount` | ✅ | Non-zero. Negative = expense, positive = income. |
| `payment_type` | ✅ | `cash`, `debit_card`, `credit_card`, `transfer`, `voucher`, `mobile_payment`, `web_payment`. |
| `category_id` | | Optional category id. |
| `record_date` | | Optional date/time (defaults to now; not >24 h in the future). |
| `note` | | Optional free text. |
| `label_ids` | | Optional list of label ids. |

```yaml
service: ha_wallet.add_record
data:
  account_id: "3f8e2a6b-9c4d-4e1f-b2a7-5d8c3e9f1a4b"
  amount: -12.50          # €12.50 expense
  payment_type: cash
  note: "Coffee"
```

### Wall-panel quick add

A ready-made helper package (amount / expense-income / payment type / note plus
a one-tap script) lives in [`examples/wall-panel-package.yaml`](examples/wall-panel-package.yaml).
Drop it into your `packages/` folder, point it at a cash account id, and add the
Lovelace card shown at the bottom of that file. A polished quick-add form card is
part of the separate **ha-wallet-card** project.

## Companion dashboard card

A dedicated Lovelace panel, **ha-wallet-card**, is planned as a separate project
to give these entities a proper place to look. **Coming soon** — this repo ships
the integration (entities & services) only.

## Development status

This is an early build. Milestones ship internally; the **first public release
is `0.1.0`**, cut once the full v1 API surface is complete.

| Milestone | Scope | Status |
|---|---|---|
| **M0** | Config flow (secure token), rate-limit-aware coordinator, init-sync handling, i18n + multi-currency base | ✅ Done |
| **M1** | Read sensors (balances, budgets, spending, records) + overspending blueprint | ✅ Done |
| **M2** | Cash entry service (`add_record`) + wall-panel button recipe | ✅ Done |
| M3 | Extended record write (patch/delete/transfers) | ⏳ Planned |
| M4 | Management (budgets, custom categories, accounts) | ⏳ Planned |
| M5 | Standing orders, record rules, goals, API-usage sensor, optional CSV history import | ⏳ Planned |
| 0.2.0 | Household / multi-account (multiple tokens) | 🔮 Future |

## License

[MIT](LICENSE) © nugg3tz

[wallet]: https://budgetbakers.com/
[hacs-badge]: https://img.shields.io/badge/HACS-Custom-41BDF5.svg
[hacs-url]: https://hacs.xyz/
[license-badge]: https://img.shields.io/badge/license-MIT-blue.svg
