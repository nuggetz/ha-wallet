import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletTrendCard } from "./trend-base";
import { singleton } from "../core/discovery";
import { emptyState, errorState, skeletonChart } from "../core/states";
import { legend, multiLine, type NamedSeries } from "../charts/charts";
import { COLOR } from "../const";
import { pointValue, type StatPoint } from "../core/history";

type Metric = "cash_flow" | "expense" | "income";

/**
 * Card 10 · Period to Period Comparison — three yearly windows of a chosen
 * metric (Cash flow / Expense / Income) from HA LTS of `…_cash_flow` and
 * `…_spending`. Needs ≥2 comparable periods, else "Not enough history".
 */
@customElement("wallet-period-comparison-card")
export class WalletPeriodComparisonCard extends WalletTrendCard {
  @state() private _metric: Metric = "cash_flow";

  protected defaultTitle(): string {
    return "Period to Period Comparison";
  }

  /** Two full calendar years before this one, so three windows can be compared. */
  protected override windowStart(): Date {
    return new Date(new Date().getFullYear() - 2, 0, 1);
  }

  private cashFlowId(): string | undefined {
    return (this.hass ? singleton.cashFlow(this.hass, this._config.entity) : undefined)
      ?.entity_id;
  }
  private spendingId(): string | undefined {
    return (this.hass ? singleton.spending(this.hass) : undefined)?.entity_id;
  }

  protected statisticIds(): string[] {
    return [this.cashFlowId(), this.spendingId()].filter((x): x is string => !!x);
  }

  protected renderContent(): TemplateResult {
    if (!this.statisticIds().length) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("Cash-flow sensor not found", "mdi:chart-line")}
      `);
    }
    if (this._loading && !Object.keys(this._stats).length) {
      return this.wrap(html`${this.head()}${skeletonChart(180)}`);
    }
    if (this._error) {
      return this.wrap(html`${this.head()}${errorState("Couldn't load history")}`);
    }

    const byYear = this.metricByYear();
    const years = Object.keys(byYear)
      .map(Number)
      .sort((a, b) => b - a);
    const withData = years.filter((y) => byYear[y].some((v) => v !== null));

    if (withData.length < 2) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("Not enough history to compare", "mdi:chart-timeline-variant")}
        ${this.collectingNote()}
      `);
    }

    const [current, yearAgo, previous] = withData;
    const series: NamedSeries[] = [
      { name: "Current Period", color: COLOR.cmpCurrent, values: byYear[current] },
    ];
    if (yearAgo !== undefined)
      series.push({
        name: "Same period a year ago",
        color: COLOR.cmpYearAgo,
        values: byYear[yearAgo],
      });
    if (previous !== undefined)
      series.push({
        name: "Previous Period",
        color: COLOR.cmpPrevious,
        values: byYear[previous],
      });

    return this.wrap(html`
      ${this.head()}
      <div class="segmented" style="margin-bottom:12px">
        ${(
          [
            ["cash_flow", "Cash flow"],
            ["expense", "Expense"],
            ["income", "Income"],
          ] as [Metric, string][]
        ).map(
          ([m, label]) => html`<button
            class=${this._metric === m ? "active" : ""}
            @click=${() => (this._metric = m)}
          >
            ${label}
          </button>`,
        )}
      </div>
      ${multiLine(series, this.months())}
      ${legend(series.map((s) => ({ label: s.name, color: s.color })))}
      ${this.collectingNote()}
    `);
  }

  /** metric-of-choice as a monthly cumulative array (index 0-11) per calendar year. */
  private metricByYear(): Record<number, (number | null)[]> {
    const net = this._stats[this.cashFlowId() ?? ""] ?? [];
    const exp = this._stats[this.spendingId() ?? ""] ?? [];
    const netByYear = bucketByYear(net);
    const expByYear = bucketByYear(exp);
    const years = new Set([
      ...Object.keys(netByYear).map(Number),
      ...Object.keys(expByYear).map(Number),
    ]);
    const out: Record<number, (number | null)[]> = {};
    for (const y of years) {
      const n = netByYear[y] ?? blankYear();
      const e = expByYear[y] ?? blankYear();
      out[y] = n.map((nv, i) => {
        const ev = e[i];
        if (this._metric === "cash_flow") return nv;
        if (this._metric === "expense") return ev === null ? null : Math.abs(ev);
        // income = net + expense (both cumulative)
        if (nv === null && ev === null) return null;
        return (nv ?? 0) + Math.abs(ev ?? 0);
      });
    }
    return out;
  }
}

function blankYear(): (number | null)[] {
  return Array.from({ length: 12 }, () => null);
}

/** Cumulative monthly value at each month index, per calendar year. */
function bucketByYear(points: StatPoint[]): Record<number, (number | null)[]> {
  const out: Record<number, (number | null)[]> = {};
  for (const p of points) {
    const d = new Date(p.start);
    const y = d.getFullYear();
    const m = d.getMonth();
    (out[y] ??= blankYear())[m] = pointValue(p);
  }
  return out;
}
