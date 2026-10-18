import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { singleton } from "../core/discovery";
import { listAccounts } from "../core/accounts";
import { isUnavailable } from "../core/entity-state";
import { formatDate, formatMoney, toNumber } from "../core/format";
import { categoryColor, tint } from "../core/colors";
import { categoryIcon } from "../core/ui";
import { emptyState, errorState, skeletonRows, staleBadge } from "../core/states";
import { COLOR } from "../const";
import type { HassEntity, WalletCategory, WalletRecord } from "../types";

/**
 * Card 11 · Last Records. Source: `…_last_records` attr `records`
 * (list: id, amount, category, account, date, note). Sync dot: green when the
 * account is bank-synced, grey for cash/manual.
 */
@customElement("wallet-last-records-card")
export class WalletLastRecordsCard extends WalletBaseCard {
  protected defaultTitle(): string {
    return "Last Records";
  }

  private entity(): HassEntity | undefined {
    return this.hass ? singleton.lastRecords(this.hass, this._config.entity) : undefined;
  }

  private categories(): WalletCategory[] {
    const c = this.hass ? singleton.categories(this.hass) : undefined;
    return (c?.attributes.categories as WalletCategory[]) ?? [];
  }

  /** Names of bank-synced accounts, to color record sync dots by account name. */
  private syncedAccountNames(): Set<string> {
    const set = new Set<string>();
    if (!this.hass) return set;
    for (const a of listAccounts(this.hass)) {
      if (a.bankSynced) set.add(a.name);
    }
    return set;
  }

  protected override trackGood(): boolean {
    return !isUnavailable(this.entity());
  }

  protected renderContent(): TemplateResult {
    const e = this.entity();
    if (isUnavailable(e)) {
      return this.wrap(html`
        ${this.head()}
        ${this.seenGood ? errorState() : skeletonRows(3)}
      `);
    }
    const records = (e!.attributes.records as WalletRecord[]) ?? [];
    if (!records.length) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("No records in this period", "mdi:receipt-text-outline")}
      `);
    }
    const cats = this.categories();
    const syncByAccount = this.syncedAccountNames();

    return this.wrap(html`
      ${this.head(isUnavailable(e) && this.seenGood ? staleBadge() : "")}
      <div>
        ${records.map((r) => {
          const color = categoryColor(r.category, cats);
          const amount = toNumber(r.amount) ?? 0;
          // `bank_synced` isn't guaranteed on each record (contract gap, flagged
          // in entity-contract.md). Fall back to matching the record's account
          // name against the bank-synced account sensors.
          const synced =
            r.bank_synced ?? (r.account ? syncByAccount.has(r.account) : false);
          return html`
            <div class="list-row">
              <div class="avatar round" style="background:${tint(color, 0.16)}">
                <ha-icon icon=${categoryIcon(r.category)} style="color:${color}"></ha-icon>
              </div>
              <div class="grow col" style="gap:2px">
                <span class="ellipsis" style="font-weight:700"
                  >${r.category ?? "Uncategorised"}</span
                >
                <span class="subline">
                  <span
                    class="dot"
                    style="background:${synced ? COLOR.bankSynced : "var(--w-muted)"}"
                  ></span>
                  <span class="ellipsis">${r.account ?? ""}</span>
                  ${r.date ? html`· ${formatDate(this.hass, r.date)}` : ""}
                </span>
              </div>
              <span
                style="font-weight:800;white-space:nowrap"
                class=${amount < 0 ? "expense" : "income"}
                >${formatMoney(this.hass, amount, undefined, { signed: true })}</span
              >
            </div>
          `;
        })}
      </div>
    `);
  }
}
