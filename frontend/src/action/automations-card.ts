import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletActionCard } from "./action-base";
import { singleton } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatDate, formatMoney, toNumber } from "../core/format";
import { emptyState, skeletonRows } from "../core/states";
import { COLOR, SERVICE } from "../const";
import { tint } from "../core/colors";
import type {
  HassEntity,
  WalletRecordRule,
  WalletStandingOrder,
} from "../types";

type Tab = "orders" | "rules";

/**
 * A7 · Automations — read-only lists whose only write is delete.
 * Standing orders from `…_standing_orders` (attr orders), record rules from
 * `…_record_rules` (attr rules). Trash → delete_standing_order /
 * delete_record_rule.
 */
@customElement("wallet-automations-action-card")
export class WalletAutomationsActionCard extends WalletActionCard {
  @state() private _tab: Tab = "orders";

  protected defaultTitle(): string {
    return "Automations";
  }

  private ordersEntity(): HassEntity | undefined {
    return this.hass ? singleton.standingOrders(this.hass) : undefined;
  }
  private rulesEntity(): HassEntity | undefined {
    return this.hass ? singleton.recordRules(this.hass) : undefined;
  }

  protected override trackGood(): boolean {
    return !isUnavailable(this.ordersEntity()) || !isUnavailable(this.rulesEntity());
  }

  protected renderContent(): TemplateResult {
    const service =
      this._tab === "orders" ? SERVICE.deleteStandingOrder : SERVICE.deleteRecordRule;
    return this.wrap(html`
      <div class="relative">
        ${this.overlay()}
        ${this.head(this.serviceCaption(service))}
        <div class="segmented" style="margin-bottom:14px">
          ${(
            [
              ["orders", "Standing orders"],
              ["rules", "Record rules"],
            ] as [Tab, string][]
          ).map(
            ([v, label]) => html`<button
              class=${this._tab === v ? "active" : ""}
              @click=${() => (this._tab = v)}
            >
              ${label}
            </button>`,
          )}
        </div>
        ${this._tab === "orders" ? this.renderOrders() : this.renderRules()}
      </div>
    `);
  }

  private renderOrders(): TemplateResult {
    const e = this.ordersEntity();
    if (isUnavailable(e)) {
      return this.seenGood
        ? emptyState("Standing orders unavailable", "mdi:calendar-sync")
        : skeletonRows(3);
    }
    const orders = (e!.attributes.orders as WalletStandingOrder[]) ?? [];
    if (!orders.length) return emptyState("No standing orders", "mdi:calendar-blank");
    return html`
      <div>
        ${orders.map((o) =>
          this.row(
            "mdi:calendar-sync",
            o.name ?? "Standing order",
            html`${o.type ?? ""}
            ${o.due_date ? html`· ${formatDate(this.hass, o.due_date)}` : ""}
            ${o.amount !== undefined
              ? html`· ${formatMoney(this.hass, toNumber(o.amount), o.currency)}`
              : ""}`,
            () => this.call(SERVICE.deleteStandingOrder, { standing_order_id: o.id }, "Deleted"),
          ),
        )}
      </div>
    `;
  }

  private renderRules(): TemplateResult {
    const e = this.rulesEntity();
    if (isUnavailable(e)) {
      return this.seenGood
        ? emptyState("Record rules unavailable", "mdi:auto-fix")
        : skeletonRows(3);
    }
    const rules = (e!.attributes.rules as WalletRecordRule[]) ?? [];
    if (!rules.length) return emptyState("No record rules", "mdi:auto-fix");
    return html`
      <div>
        ${rules.map((r) => {
          const kw = Array.isArray(r.keywords) ? r.keywords.join(", ") : r.keywords;
          return this.row(
            "mdi:auto-fix",
            r.name ?? "Rule",
            html`${r.category ? html`→ ${r.category}` : ""}
            ${kw ? html`· ${kw}` : ""}`,
            () => this.call(SERVICE.deleteRecordRule, { record_rule_id: r.id }, "Deleted"),
          );
        })}
      </div>
    `;
  }

  private row(
    icon: string,
    title: string,
    sub: TemplateResult,
    onDelete: () => void,
  ): TemplateResult {
    return html`
      <div class="list-row">
        <div class="avatar" style="background:${tint(COLOR.transfer, 0.16)}">
          <ha-icon icon=${icon} style="color:${COLOR.transfer}"></ha-icon>
        </div>
        <div class="grow col" style="gap:2px">
          <span class="ellipsis" style="font-weight:700">${title}</span>
          <span class="subline">${sub}</span>
        </div>
        <button
          class="pill"
          style="padding:8px;background:${tint(COLOR.expense, 0.12)};border-color:transparent"
          title="Delete"
          ?disabled=${this._submitting}
          @click=${onDelete}
        >
          <ha-icon icon="mdi:trash-can-outline" style="color:${COLOR.expense}"></ha-icon>
        </button>
      </div>
    `;
  }

  public override getCardSize(): number {
    return 5;
  }
}
