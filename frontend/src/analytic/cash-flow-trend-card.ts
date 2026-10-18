import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletTrendCard } from "./trend-base";
import { singleton } from "../core/discovery";
import { emptyState, errorState, skeletonChart } from "../core/states";
import { incomeExpenseBars, legend, type TrendBar } from "../charts/charts";
import { COLOR } from "../const";
import { pointValue, type StatPoint } from "../core/history";

/**
 * Card 2 · Cash Flow Trend — grouped monthly income/expense bars + net line.
 * Source: HA LTS of `…_cash_flow` (net) and `…_spending` (expense). The sensors
 * are period-to-date cumulative, so monthly figures are the difference between
 * consecutive month-boundary LTS points; income = monthly net + monthly expense.
 */
@customElement("wallet-cash-flow-trend-card")
export class WalletCashFlowTrendCard extends WalletTrendCard {
  protected defaultTitle(): string {
    return "Cash Flow Trend";
  }

  private cashFlowId(): string | undefined {
    const e = this.hass ? singleton.cashFlow(this.hass, this._config.entity) : undefined;
    return e?.entity_id;
  }
  private spendingId(): string | undefined {
    const e = this.hass ? singleton.spending(this.hass) : undefined;
    return e?.entity_id;
  }

  protected statisticIds(): string[] {
    return [this.cashFlowId(), this.spendingId()].filter((x): x is string => !!x);
  }

  protected renderContent(): TemplateResult {
    if (!this.statisticIds().length) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("Cash-flow sensor not found", "mdi:chart-bar")}
      `);
    }
    if (this._loading && !Object.keys(this._stats).length) {
      return this.wrap(html`${this.head()}${skeletonChart(200)}`);
    }
    if (this._error) {
      return this.wrap(html`${this.head()}${errorState("Couldn't load history")}`);
    }

    const netPts = this._stats[this.cashFlowId() ?? ""] ?? [];
    const expPts = this._stats[this.spendingId() ?? ""] ?? [];
    const netMonthly = monthlyDeltas(netPts);
    const expMonthly = monthlyDeltas(expPts);

    if (netMonthly.length < 1) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("Not enough history yet", "mdi:chart-bar")}
        ${this.collectingNote()}
      `);
    }

    const bars: TrendBar[] = netMonthly.map((net, i) => {
      const expense = Math.abs(expMonthly[i] ?? 0);
      const income = net + expense; // net = income − expense
      return { income: Math.max(0, income), expense, net };
    });

    return this.wrap(html`
      ${this.head()}
      <div style="margin-top:6px">
        ${incomeExpenseBars(bars, this.months(), {
          income: COLOR.income,
          expense: COLOR.expense,
          net: "var(--w-text)",
        })}
      </div>
      ${legend([
        { label: "Cash flow", color: "var(--w-text)" },
        { label: "Expense", color: COLOR.expense },
        { label: "Income", color: COLOR.income },
      ])}
      ${this.collectingNote()}
    `);
  }
}

/** Per-month deltas of a period-to-date cumulative statistic. */
function monthlyDeltas(points: StatPoint[]): number[] {
  const vals = points.map(pointValue);
  const out: number[] = [];
  let prev = 0;
  for (const v of vals) {
    if (v === null) {
      out.push(0);
      continue;
    }
    out.push(v - prev);
    prev = v;
  }
  return out;
}
