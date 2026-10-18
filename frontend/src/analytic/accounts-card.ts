import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { byPrefix } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatMoney, formatRelative, toNumber } from "../core/format";
import { emptyState, skeletonRows } from "../core/states";
import { COLOR } from "../const";
import { tint } from "../core/colors";
import type { HassEntity } from "../types";

/**
 * Card 12 · Accounts. Source: per-account `…_account_<name>` sensors (state =
 * balance; attrs account_type, currency, bank_synced, last_change). Bank-synced
 * accounts show a green check + relative last_change.
 */
@customElement("wallet-accounts-card")
export class WalletAccountsCard extends WalletBaseCard {
  protected defaultTitle(): string {
    return "Accounts";
  }

  private accounts(): HassEntity[] {
    return this.hass ? byPrefix.accounts(this.hass) : [];
  }

  protected override trackGood(): boolean {
    return this.accounts().some((a) => !isUnavailable(a));
  }

  protected renderContent(): TemplateResult {
    const all = this.accounts();
    const ready = all.filter((a) => !isUnavailable(a));

    if (!all.length) {
      return this.wrap(html`
        ${this.head()}
        ${this.seenGood
          ? emptyState("No accounts selected in options", "mdi:bank-off")
          : skeletonRows(2)}
      `);
    }
    if (!ready.length) {
      return this.wrap(html`${this.head()}${skeletonRows(all.length)}`);
    }

    return this.wrap(html`
      ${this.head()}
      <div>
        ${ready.map((e) => this.accountRow(e))}
      </div>
    `);
  }

  private accountRow(e: HassEntity): TemplateResult {
    const a = e.attributes;
    const synced = Boolean(a.bank_synced);
    const currency = (a.currency as string) ?? a.unit_of_measurement;
    const type = (a.account_type as string) ?? "";
    const name = this.accountName(e);
    const color = synced ? COLOR.bankSynced : COLOR.cashAccount;
    const icon = synced ? "mdi:bank" : "mdi:cash-multiple";
    return html`
      <div class="list-row">
        <div class="avatar" style="background:${tint(color, 0.16)}">
          <ha-icon icon=${icon} style="color:${color}"></ha-icon>
        </div>
        <div class="grow col" style="gap:2px">
          <span class="ellipsis" style="font-weight:700">${name}</span>
          <span class="subline">
            ${prettyType(type)}
            ${synced
              ? html` · <ha-icon
                    icon="mdi:check-circle"
                    style="--mdc-icon-size:13px;color:${COLOR.bankSynced}"
                  ></ha-icon>
                  Synced ${formatRelative(this.hass, a.last_change as string)}`
              : ""}
          </span>
        </div>
        <span style="font-weight:800;white-space:nowrap"
          >${formatMoney(this.hass, toNumber(e.state), currency)}</span
        >
      </div>
    `;
  }

  private accountName(e: HassEntity): string {
    const fn = e.attributes.friendly_name as string | undefined;
    // friendly name is "Wallet by BudgetBakers Account <name>" → strip the prefix.
    if (fn) return fn.replace(/^.*?Account\s+/i, "").trim() || fn;
    return e.entity_id;
  }
}

function prettyType(type: string): string {
  const map: Record<string, string> = {
    Cash: "Cash",
    General: "General",
    CurrentAccount: "Current account",
    SavingAccount: "Savings",
    Insurance: "Insurance",
    CreditCard: "Credit card",
    Overdraft: "Overdraft",
  };
  return map[type] ?? type;
}
