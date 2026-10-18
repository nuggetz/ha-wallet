import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { singleton } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatMoney, toNumber } from "../core/format";
import { vsChip } from "../core/ui";
import { emptyState, errorState, skeletonChart, staleBadge } from "../core/states";
import { gauge } from "../charts/charts";
import type { HassEntity } from "../types";

/**
 * Card 3 · Spending — semicircular gauge + total expense + VS-previous.
 * Source: `…_spending` (state = total expense; attrs vs_previous_pct, currency,
 * period). Typical = prior-period spend derived from vs_previous_pct (omitted
 * when not derivable, per §0.5 / "no invented data").
 */
@customElement("wallet-spending-card")
export class WalletSpendingCard extends WalletBaseCard {
  protected defaultTitle(): string {
    return "Spending";
  }

  private entity(): HassEntity | undefined {
    return this.hass ? singleton.spending(this.hass, this._config.entity) : undefined;
  }

  protected override trackGood(): boolean {
    return !isUnavailable(this.entity());
  }

  protected renderContent(): TemplateResult {
    const e = this.entity();
    if (isUnavailable(e)) {
      return this.wrap(html`
        ${this.head()}
        ${this.seenGood ? errorState() : skeletonChart(150)}
      `);
    }
    const a = e!.attributes;
    const currency = a.currency as string | undefined;
    const total = toNumber(e!.state);
    const pct = toNumber(a.vs_previous_pct);
    const period = a.period as string | undefined;

    if (!total) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("Nothing spent yet", "mdi:cart-off")}
      `);
    }

    // typical = spend / (1 + pct/100), the prior period figure implied by the delta.
    let typical: number | null = null;
    if (pct !== null && pct > -100) typical = total / (1 + pct / 100);
    // Gauge fraction: current vs a soft ceiling of max(typical, current)*1.25.
    const ceiling = Math.max(typical ?? 0, total) * 1.25 || total || 1;
    const fraction = 1 - Math.min(1, total / ceiling);

    return this.wrap(html`
      ${this.head(isUnavailable(e) && this.seenGood ? staleBadge() : "")}
      <div class="row between">
        <span class="caption">${this.periodLabel(period)}</span>
        <div class="col" style="align-items:flex-end">
          <span class="caption caption-up">VS Previous Period</span>
          ${vsChip(pct, false)}
        </div>
      </div>
      <div style="max-width:260px;margin:6px auto 0">${gauge(fraction)}</div>
      <div class="col" style="align-items:center;margin-top:-8px">
        <span class="big-value expense"
          >${formatMoney(this.hass, -Math.abs(total), currency, { signed: true })}</span
        >
        ${typical !== null
          ? html`<span class="caption"
              >of ${formatMoney(this.hass, typical, currency)} typical</span
            >`
          : ""}
      </div>
    `);
  }
}
