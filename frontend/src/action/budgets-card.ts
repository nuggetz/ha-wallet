import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletActionCard, opColor, opLabel, type Op } from "./action-base";
import { listCategories } from "../core/accounts";
import { categoryColor, tint } from "../core/colors";
import { BUDGET_TYPES, SERVICE } from "../const";
import type { WalletCategory } from "../types";

/**
 * A3 · Budgets — `manage_budget` (create / patch / delete). budget_id required
 * for patch/delete. Category ids from the categories sensor.
 */
@customElement("wallet-budgets-action-card")
export class WalletBudgetsActionCard extends WalletActionCard {
  @state() private _op: Op = "create";
  @state() private _budgetId = "";
  @state() private _name = "";
  @state() private _limit = "";
  @state() private _type = BUDGET_TYPES[1];
  @state() private _currency = "";
  @state() private _categoryIds: string[] = [];

  protected defaultTitle(): string {
    return "Budgets";
  }

  protected renderContent(): TemplateResult {
    const categories = this.hass ? listCategories(this.hass) : [];
    const needsId = this._op !== "create";
    const canSubmit =
      this._op === "delete"
        ? !!this._budgetId
        : (this._op === "patch" ? !!this._budgetId : true) &&
          (this._op === "create" ? !!this._name && !!this._limit : true);

    return this.wrap(html`
      <div class="relative">
        ${this.overlay()}
        ${this.head(this.serviceCaption(SERVICE.manageBudget))}
        ${this.segmented<Op>(
          [
            ["create", "Create"],
            ["patch", "Patch"],
            ["delete", "Delete"],
          ],
          this._op,
          (o) => (this._op = o),
        )}
        <div class="stack">
          ${needsId
            ? this.textField("Budget id", this._budgetId, (v) => (this._budgetId = v))
            : ""}
          ${this._op !== "delete"
            ? html`
                ${this.textField("Name", this._name, (v) => (this._name = v))}
                ${this.numberField("Limit", this._limit, (v) => (this._limit = v))}
                <div class="field">
                  <label>Interval</label>
                  <select
                    .value=${this._type}
                    @change=${(e: Event) =>
                      (this._type = (e.target as HTMLSelectElement).value as typeof this._type)}
                  >
                    ${BUDGET_TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
                  </select>
                </div>
                ${this.textField("Currency code", this._currency, (v) => (this._currency = v), "EUR")}
                ${this.categoryChips(categories)}
              `
            : html`<div class="dashed" style="text-align:left">
                Deleting a budget removes its awareness automations' source. This can't be undone.
              </div>`}
          ${this.primaryButton(
            `${opLabel(this._op)} budget`,
            opColor(this._op),
            () => this.submit(),
            !canSubmit,
          )}
        </div>
      </div>
    `);
  }

  private categoryChips(categories: WalletCategory[]): TemplateResult {
    return html`
      <div class="field">
        <label>Categories</label>
        <div class="pill-row">
          ${categories.slice(0, 12).map((c) => {
            const color = categoryColor(c.name, categories);
            const on = this._categoryIds.includes(c.id);
            return html`<button
              class="pill"
              style=${on ? `border-color:${color};background:${tint(color, 0.13)}` : ""}
              @click=${() =>
                (this._categoryIds = on
                  ? this._categoryIds.filter((x) => x !== c.id)
                  : [...this._categoryIds, c.id])}
            >
              ${c.name}
            </button>`;
          })}
        </div>
      </div>
    `;
  }

  private textField(
    label: string,
    value: string,
    onInput: (v: string) => void,
    placeholder = "",
  ): TemplateResult {
    return html`<div class="field">
      <label>${label}</label>
      <input
        .value=${value}
        placeholder=${placeholder}
        @input=${(e: Event) => onInput((e.target as HTMLInputElement).value)}
      />
    </div>`;
  }

  private numberField(
    label: string,
    value: string,
    onInput: (v: string) => void,
  ): TemplateResult {
    return html`<div class="field">
      <label>${label}</label>
      <input
        type="number"
        step="0.01"
        .value=${value}
        @input=${(e: Event) => onInput((e.target as HTMLInputElement).value)}
      />
    </div>`;
  }

  private submit(): void {
    const data: Record<string, unknown> = { operation: this._op };
    if (this._op !== "create") data.budget_id = this._budgetId;
    if (this._op !== "delete") {
      if (this._name) data.name = this._name;
      if (this._limit) data.limit = Number(this._limit);
      if (this._type) data.type = this._type;
      if (this._currency) data.currency_code = this._currency;
      if (this._categoryIds.length) data.category_ids = this._categoryIds;
    }
    this.call(SERVICE.manageBudget, data, "Budget saved");
  }
}
