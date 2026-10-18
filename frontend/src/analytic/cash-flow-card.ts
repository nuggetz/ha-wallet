import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { singleton } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatMoney, toNumber } from "../core/format";
import { progressBar, vsChip } from "../core/ui";
import { emptyState, errorState, skeletonBars, staleBadge } from "../core/states";
import { COLOR } from "../const";
import type { HassEntity } from "../types";

/**
 * Card 1 · Cash Flow — net income − expense for the period, with income/expense
 * bars and a VS-previous chip. Source: `…_cash_flow` (state = net; attrs income,
 * expense, vs_previous_pct, currency, period).
 */
@customElement("wallet-cash-flow-card")
export class WalletCashFlowCard extends WalletBaseCard {
  protected defaultTitle(): string {
    return "Cash Flow";
  }

  private entity(): HassEntity | undefined {
    return this.hass ? singleton.cashFlow(this.hass, this._config.entity) : undefined;
  }

  protected override trackGood(): boolean {
    return !isUnavailable(this.entity());
  }

  protected renderContent(): TemplateResult {
    const e = this.entity();
    if (isUnavailable(e)) {
      return this.wrap(html`
        ${this.head()}
        ${this.seenGood ? errorState() : skeletonBars(2)}
      `);
    }
    const a = e!.attributes;
    const currency = (a.currency as string) ?? undefined;
    const net = toNumber(e!.state);
    const income = toNumber(a.income) ?? 0;
    const expense = toNumber(a.expense) ?? 0;
    const pct = toNumber(a.vs_previous_pct);
    const period = a.period as string | undefined;

    if (income === 0 && expense === 0) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("No cash flow this period", "mdi:cash-remove")}
      `);
    }

    const scale = Math.max(income, expense, 1);
    return this.wrap(html`
      ${this.head(this.seenGood && isUnavailable(e) ? staleBadge() : "")}
      <div class="row between" style="align-items:flex-end">
        <div class="col">
          <span class="caption">${this.periodLabel(period)}</span>
          <span
            class="big-value ${net !== null && net < 0 ? "expense" : "income"}"
            >${formatMoney(this.hass, net, currency, { signed: true })}</span
          >
        </div>
        <div class="col" style="align-items:flex-end">
          <span class="caption caption-up">VS Previous Period</span>
          ${vsChip(pct, true)}
        </div>
      </div>
      <div class="stack" style="margin-top:16px">
        ${this.barRow("Income", income, scale, COLOR.income, currency)}
        ${this.barRow("Expense", expense, scale, COLOR.expense, currency)}
      </div>
    `);
  }

  private barRow(
    label: string,
    value: number,
    scale: number,
    color: string,
    currency?: string,
  ): TemplateResult {
    return html`
      <div class="col">
        <div class="row between">
          <span class="label">${label}</span>
          <span style="font-weight:700;color:${color}"
            >${formatMoney(this.hass, value, currency)}</span
          >
        </div>
        ${progressBar(value / scale, color)}
      </div>
    `;
  }
}
