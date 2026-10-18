import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { singleton } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatMoney, toNumber } from "../core/format";
import { progressBar } from "../core/ui";
import { errorState, skeletonBars } from "../core/states";
import { COLOR } from "../const";
import type { HassEntity } from "../types";

/**
 * Card 7 · Credit Limits Utilization. Source: `…_credit_utilization` (state =
 * used credit, may be `unknown`; attrs credit_balance, total_credit_limit,
 * available). The required empty state (matching the app) is `unknown`/no
 * credit accounts → dashed "no credit accounts" panel with €0.00 figures.
 */
@customElement("wallet-credit-limits-card")
export class WalletCreditLimitsCard extends WalletBaseCard {
  protected defaultTitle(): string {
    return "Credit Limits Utilization";
  }

  private entity(): HassEntity | undefined {
    return this.hass
      ? singleton.creditUtilization(this.hass, this._config.entity)
      : undefined;
  }

  protected override trackGood(): boolean {
    return this.entity() !== undefined;
  }

  protected renderContent(): TemplateResult {
    const e = this.entity();
    // No entity at all on first load → skeleton; after it existed → error.
    if (!e) {
      return this.wrap(html`
        ${this.head()}
        ${this.seenGood ? errorState() : skeletonBars(2)}
      `);
    }
    const a = e.attributes;
    const currency = a.currency as string | undefined;
    const balance = toNumber(a.credit_balance);
    const limit = toNumber(a.total_credit_limit);
    const available = toNumber(a.available);
    // `unknown` state OR no credit data → the app's empty affordance.
    const noCredit = isUnavailable(e) || (balance === null && limit === null);

    if (noCredit) {
      return this.wrap(html`
        ${this.head()}
        <span class="caption caption-up">${this.periodLabel()}</span>
        <div class="dashed" style="margin:12px 0">
          No credit accounts found or missing credit-card limit setting.
        </div>
        ${this.figures(0, 0, currency)}
      `);
    }

    const used = Math.abs(balance ?? 0);
    const lim = Math.abs(limit ?? 0);
    const utilization = lim > 0 ? used / lim : 0;

    return this.wrap(html`
      ${this.head()}
      <span class="caption caption-up">${this.periodLabel()}</span>
      ${this.figures(balance ?? 0, limit ?? 0, currency)}
      <div class="col" style="margin-top:14px;gap:6px">
        ${progressBar(utilization, COLOR.housing)}
        <span class="footnote"
          >${Math.round(utilization * 100)}% utilized ·
          ${formatMoney(this.hass, available ?? lim - used, currency)} available</span
        >
      </div>
    `);
  }

  private figures(balance: number, limit: number, currency?: string): TemplateResult {
    return html`
      <div class="row" style="gap:32px;margin-top:10px;flex-wrap:wrap">
        <div class="col">
          <span class="caption caption-up">Credit Balance</span>
          <span class="big-value expense"
            >${formatMoney(this.hass, -Math.abs(balance), currency, { signed: true })}</span
          >
        </div>
        <div class="col">
          <span class="caption caption-up">Total Credit Limit</span>
          <span class="big-value">${formatMoney(this.hass, limit, currency)}</span>
        </div>
      </div>
    `;
  }
}
