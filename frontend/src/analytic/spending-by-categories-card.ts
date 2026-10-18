import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { singleton } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatMoney, toNumber } from "../core/format";
import { categoryColor } from "../core/colors";
import { progressBar, vsChip } from "../core/ui";
import { emptyState, errorState, skeletonBars, staleBadge } from "../core/states";
import type { HassEntity, WalletCategory } from "../types";

const TOP_N = 5;

/**
 * Card 6 · Spending by Categories — one bar per category, scaled to the largest,
 * in that category's color. Source: `…_spending` attr `by_category` (map
 * category→amount) + vs_previous_pct. Categories list (for color resolution)
 * from `…_categories`.
 */
@customElement("wallet-spending-by-categories-card")
export class WalletSpendingByCategoriesCard extends WalletBaseCard {
  protected defaultTitle(): string {
    return "Spending by Categories";
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
        ${this.seenGood ? errorState() : skeletonBars(4)}
      `);
    }
    const a = e!.attributes;
    const currency = a.currency as string | undefined;
    const byCategory = (a.by_category as Record<string, number>) ?? {};
    const pct = toNumber(a.vs_previous_pct);
    const period = a.period as string | undefined;

    const entries = Object.entries(byCategory)
      .map(([name, value]) => ({ name, value: Math.abs(toNumber(value) ?? 0) }))
      .filter((x) => x.value > 0)
      .sort((x, y) => y.value - x.value);

    if (!entries.length) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("No expenses this period", "mdi:cart-off")}
      `);
    }

    const total = entries.reduce((s, x) => s + x.value, 0);
    const max = entries[0].value || 1;
    const shown = entries.slice(0, TOP_N);
    const remainder = entries.length - shown.length;
    const cats = this.categories();

    return this.wrap(html`
      ${this.head(isUnavailable(e) && this.seenGood ? staleBadge() : "")}
      <div class="row between" style="align-items:flex-end">
        <div class="col">
          <span class="caption">${this.periodLabel(period)}</span>
          <span class="big-value expense"
            >${formatMoney(this.hass, -total, currency, { signed: true })}</span
          >
        </div>
        <div class="col" style="align-items:flex-end">
          <span class="caption caption-up">VS Previous Period</span>
          ${vsChip(pct, false)}
        </div>
      </div>
      <div class="stack" style="margin-top:14px">
        ${shown.map((x) => {
          const color = categoryColor(x.name, cats);
          return html`
            <div class="col">
              <div class="row between">
                <span class="label" style="color:var(--w-text)">${x.name}</span>
                <span style="font-weight:700"
                  >${formatMoney(this.hass, x.value, currency)}</span
                >
              </div>
              ${progressBar(x.value / max, color)}
            </div>
          `;
        })}
        ${remainder > 0
          ? html`<span class="footnote">+ ${remainder} more categor${
              remainder === 1 ? "y" : "ies"
            }</span>`
          : ""}
      </div>
    `);
  }
}
