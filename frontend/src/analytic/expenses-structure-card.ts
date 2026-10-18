import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { singleton } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatMoney, toNumber } from "../core/format";
import { categoryColor } from "../core/colors";
import { emptyState, errorState, skeletonChart, staleBadge } from "../core/states";
import { donut, type DonutSlice } from "../charts/charts";
import type { HassEntity, WalletCategory } from "../types";

/**
 * Card 9 · Expenses Structure — donut of `by_category` shares with a legend.
 * Same data as Card 6, shown as proportion. Source: `…_spending` attr
 * `by_category`.
 */
@customElement("wallet-expenses-structure-card")
export class WalletExpensesStructureCard extends WalletBaseCard {
  protected defaultTitle(): string {
    return "Expenses Structure";
  }

  private entity(): HassEntity | undefined {
    return this.hass ? singleton.spending(this.hass, this._config.entity) : undefined;
  }

  private categories(): WalletCategory[] {
    const c = this.hass ? singleton.categories(this.hass) : undefined;
    return (c?.attributes.categories as WalletCategory[]) ?? [];
  }

  protected override trackGood(): boolean {
    return !isUnavailable(this.entity());
  }

  protected renderContent(): TemplateResult {
    const e = this.entity();
    if (isUnavailable(e)) {
      return this.wrap(html`
        ${this.head()}
        ${this.seenGood ? errorState() : skeletonChart(180)}
      `);
    }
    const a = e!.attributes;
    const currency = a.currency as string | undefined;
    const byCategory = (a.by_category as Record<string, number>) ?? {};
    const cats = this.categories();

    const entries = Object.entries(byCategory)
      .map(([name, value]) => ({ name, value: Math.abs(toNumber(value) ?? 0) }))
      .filter((x) => x.value > 0)
      .sort((x, y) => y.value - x.value);

    if (!entries.length) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("No expenses to break down", "mdi:chart-donut")}
      `);
    }

    const total = entries.reduce((s, x) => s + x.value, 0);
    const slices: DonutSlice[] = entries.map((x) => ({
      label: x.name,
      value: x.value,
      color: categoryColor(x.name, cats),
    }));

    return this.wrap(html`
      ${this.head(isUnavailable(e) && this.seenGood ? staleBadge() : "")}
      <div class="row" style="align-items:center;gap:18px;flex-wrap:wrap">
        <div style="flex:0 0 180px;max-width:180px">
          ${donut(slices, currency ?? "", formatMoney(this.hass, total, currency))}
        </div>
        <div class="grow stack" style="gap:8px;min-width:150px">
          ${slices.map((s) => {
            const share = Math.round((s.value / total) * 100);
            return html`
              <div class="row between">
                <span class="subline" style="color:var(--w-text)">
                  <span class="dot" style="background:${s.color}"></span>${s.label}
                </span>
                <span class="muted" style="font-weight:700">${share}%</span>
              </div>
            `;
          })}
        </div>
      </div>
    `);
  }
}
