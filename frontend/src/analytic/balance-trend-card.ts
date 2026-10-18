import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletTrendCard } from "./trend-base";
import { byPrefix } from "../core/discovery";
import { formatMoney } from "../core/format";
import { vsChip } from "../core/ui";
import { emptyState, errorState, skeletonChart } from "../core/states";
import { areaLine } from "../charts/charts";
import { pointValue } from "../core/history";
import { COLOR } from "../const";
import type { HassEntity } from "../types";

/**
 * Card 8 · Balance Trend — area/line of total balance over the window from HA
 * LTS. Source: history of the per-currency `…_balance_<currency>` sensor
 * (dominant currency when several). Fresh installs show the partial-history
 * affordance from trend-base.
 */
@customElement("wallet-balance-trend-card")
export class WalletBalanceTrendCard extends WalletTrendCard {
  protected defaultTitle(): string {
    return "Balance Trend";
  }

  /** The balance sensor to trend: config override, else the largest by |state|. */
  private target(): HassEntity | undefined {
    if (!this.hass) return undefined;
    if (this._config.entity && this.hass.states[this._config.entity]) {
      return this.hass.states[this._config.entity];
    }
    const balances = byPrefix.balances(this.hass);
    return balances
      .slice()
      .sort(
        (a, b) => Math.abs(Number(b.state) || 0) - Math.abs(Number(a.state) || 0),
      )[0];
  }

  protected statisticIds(): string[] {
    const t = this.target();
    return t ? [t.entity_id] : [];
  }

  protected renderContent(): TemplateResult {
    const t = this.target();
    if (!t) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("No balance sensors — select accounts in options", "mdi:bank-off")}
      `);
    }
    if (this._loading && !Object.keys(this._stats).length) {
      return this.wrap(html`${this.head()}${skeletonChart(170)}`);
    }
    if (this._error) {
      return this.wrap(html`${this.head()}${errorState("Couldn't load history")}`);
    }
    const points = this._stats[t.entity_id] ?? [];
    const values = points.map(pointValue).filter((v): v is number => v !== null);
    const currency = (t.attributes.currency as string) ?? t.attributes.unit_of_measurement;

    if (values.length < 2) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("Not enough history yet", "mdi:chart-line")}
        ${this.collectingNote()}
      `);
    }

    const latest = values[values.length - 1];
    const first = values[0];
    const pct = first !== 0 ? ((latest - first) / Math.abs(first)) * 100 : null;
    const partial = this.partialFraction();

    return this.wrap(html`
      ${this.head()}
      <div class="row between" style="align-items:flex-end">
        <div class="col">
          <span class="caption">${this.periodLabel()}</span>
          <span class="big-value">${formatMoney(this.hass, latest, currency)}</span>
        </div>
        <div class="col" style="align-items:flex-end">
          <span class="caption caption-up">VS Previous Period</span>
          ${vsChip(pct, true)}
        </div>
      </div>
      <div style="margin-top:10px">
        ${areaLine(values, COLOR.areaLine, this.months(), {
          partialFrom: partial ?? undefined,
        })}
      </div>
      ${this.collectingNote()}
    `);
  }
}
