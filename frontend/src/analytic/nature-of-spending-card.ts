import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { singleton } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatMoney, toNumber } from "../core/format";
import { emptyState, errorState, skeletonChart, staleBadge } from "../core/states";
import { legend, stackedBars, type StackedBar } from "../charts/charts";
import { COLOR } from "../const";
import type { HassEntity } from "../types";

type Bucket = "all" | "must" | "need" | "want";

// Mockup legend mapping (§ Card 4): Must=food red, Need=housing amber, Want=life green.
const BUCKET_COLOR: Record<Exclude<Bucket, "all">, string> = {
  must: COLOR.food,
  need: COLOR.housing,
  want: COLOR.life,
};

/**
 * Card 4 · Nature of Spending — Must / Need / Want split with an All/Must/Need/
 * Want filter. Source: `…_spending_by_cardinality` (attrs must, need, want).
 * The single-snapshot sensor gives current-period totals; a proper monthly
 * stack needs LTS of the attributes, unavailable at 0.1.0 — we render the
 * current split as a single labelled stack and expose the filter.
 */
@customElement("wallet-nature-of-spending-card")
export class WalletNatureOfSpendingCard extends WalletBaseCard {
  @state() private _filter: Bucket = "all";

  protected defaultTitle(): string {
    return "Nature of Spending";
  }

  private entity(): HassEntity | undefined {
    return this.hass
      ? singleton.spendingByCardinality(this.hass, this._config.entity)
      : undefined;
  }

  protected override trackGood(): boolean {
    return !isUnavailable(this.entity());
  }

  protected renderContent(): TemplateResult {
    const e = this.entity();
    if (isUnavailable(e)) {
      return this.wrap(html`
        ${this.head()}
        ${this.seenGood ? errorState() : skeletonChart(170)}
      `);
    }
    const a = e!.attributes;
    const currency = a.currency as string | undefined;
    const must = Math.abs(toNumber(a.must) ?? 0);
    const need = Math.abs(toNumber(a.need) ?? 0);
    const want = Math.abs(toNumber(a.want) ?? 0);
    const total = must + need + want;

    if (total === 0) {
      return this.wrap(html`
        ${this.head()}
        ${emptyState("No categorised spend", "mdi:shape-outline")}
      `);
    }

    const buckets: [Exclude<Bucket, "all">, number][] = [
      ["must", must],
      ["need", need],
      ["want", want],
    ];
    const active = buckets.filter(([k]) => this._filter === "all" || this._filter === k);
    const bar: StackedBar = {
      segments: active.map(([k, v]) => ({ value: v, color: BUCKET_COLOR[k] })),
    };

    return this.wrap(html`
      ${this.head(isUnavailable(e) && this.seenGood ? staleBadge() : "")}
      <div class="segmented" style="margin-bottom:14px">
        ${(["all", "must", "need", "want"] as Bucket[]).map(
          (b) => html`<button
            class=${this._filter === b ? "active" : ""}
            @click=${() => (this._filter = b)}
          >
            ${b === "all" ? "All" : b[0].toUpperCase() + b.slice(1)}
          </button>`,
        )}
      </div>
      <div style="max-width:120px;margin:0 auto">
        ${stackedBars([bar], [this.periodLabel(a.period as string)])}
      </div>
      <div class="row between" style="margin-top:8px">
        ${active.map(
          ([k, v]) => html`<span class="subline" style="color:var(--w-text)">
            <span class="dot" style="background:${BUCKET_COLOR[k]}"></span>
            ${k[0].toUpperCase() + k.slice(1)}
            <span class="muted">${formatMoney(this.hass, v, currency)}</span>
          </span>`,
        )}
      </div>
      ${legend([
        { label: "Must", color: BUCKET_COLOR.must },
        { label: "Need", color: BUCKET_COLOR.need },
        { label: "Want", color: BUCKET_COLOR.want },
      ])}
    `);
  }
}
