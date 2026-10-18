import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletActionCard, opColor, opLabel, type Op } from "./action-base";
import { listCategories } from "../core/accounts";
import { normalizeColor } from "../core/colors";
import { CARDINALITIES, COLOR_NAMES, NAMED_COLOR, SERVICE } from "../const";

/**
 * A4 · Categories — `manage_category` (create custom subcategory / patch /
 * delete). Only custom categories are deletable; built-ins locked. category_id
 * / parent_id come from the categories sensor.
 */
@customElement("wallet-categories-action-card")
export class WalletCategoriesActionCard extends WalletActionCard {
  @state() private _op: Op = "create";
  @state() private _categoryId = "";
  @state() private _parentId = "";
  @state() private _name = "";
  @state() private _cardinality = "none";
  @state() private _color = "Blue";

  protected defaultTitle(): string {
    return "Categories";
  }

  protected renderContent(): TemplateResult {
    const categories = this.hass ? listCategories(this.hass) : [];
    const custom = categories.filter((c) => c.custom);
    const parents = categories.filter((c) => !c.parent_id);
    const canSubmit =
      this._op === "create"
        ? !!this._name && !!this._parentId
        : !!this._categoryId;

    return this.wrap(html`
      <div class="relative">
        ${this.overlay()}
        ${this.head(this.serviceCaption(SERVICE.manageCategory))}
        ${this.segmented<Op>(
          [
            ["create", "Create"],
            ["patch", "Patch"],
            ["delete", "Delete"],
          ],
          this._op,
          (o) => (this._op = o),
        )}
        <div class="footnote" style="margin-bottom:10px">
          Only custom categories are deletable; built-ins are locked.
        </div>
        <div class="stack">
          ${this._op === "create"
            ? this.selectField(
                "Parent category",
                this._parentId,
                parents.map((c) => [c.id, c.name] as [string, string]),
                (v) => (this._parentId = v),
              )
            : this.selectField(
                "Custom category",
                this._categoryId,
                custom.map((c) => [c.id, c.name] as [string, string]),
                (v) => (this._categoryId = v),
              )}
          ${this._op !== "delete"
            ? html`
                <div class="field">
                  <label>Name</label>
                  <input
                    .value=${this._name}
                    @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="field">
                  <label>Cardinality</label>
                  <select
                    .value=${this._cardinality}
                    @change=${(e: Event) =>
                      (this._cardinality = (e.target as HTMLSelectElement).value)}
                  >
                    ${CARDINALITIES.map((c) => html`<option value=${c}>${c}</option>`)}
                  </select>
                </div>
                ${this.colorPicker()}
              `
            : html`<div class="dashed" style="text-align:left">
                Deleting a custom category can't be undone. Built-in categories reject delete.
              </div>`}
          ${this.primaryButton(
            `${opLabel(this._op)} category`,
            opColor(this._op),
            () => this.submit(),
            !canSubmit,
          )}
        </div>
      </div>
    `);
  }

  private colorPicker(): TemplateResult {
    return html`
      <div class="field">
        <label>Color</label>
        <div class="pill-row">
          ${COLOR_NAMES.map((name) => {
            const hex = NAMED_COLOR[name];
            const on = this._color === name;
            return html`<button
              class="pill"
              title=${name}
              style="padding:6px;border-color:${on ? hex : "var(--w-line)"};${on
                ? `box-shadow:0 0 0 2px ${hex}`
                : ""}"
              @click=${() => (this._color = name)}
            >
              <span
                class="dot"
                style="width:18px;height:18px;background:${hex}"
              ></span>
            </button>`;
          })}
        </div>
      </div>
    `;
  }

  private selectField(
    label: string,
    value: string,
    options: [string, string][],
    onChange: (v: string) => void,
  ): TemplateResult {
    return html`<div class="field">
      <label>${label}</label>
      <select
        .value=${value}
        @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}
      >
        <option value="" disabled selected=${!value}>Select…</option>
        ${options.map(([id, name]) => html`<option value=${id}>${name}</option>`)}
      </select>
    </div>`;
  }

  private submit(): void {
    const data: Record<string, unknown> = { operation: this._op };
    if (this._op === "create") {
      data.parent_id = this._parentId;
      data.name = this._name;
      if (this._cardinality !== "none") data.cardinality = this._cardinality;
      data.color = this._color;
    } else if (this._op === "patch") {
      data.category_id = this._categoryId;
      if (this._name) data.name = this._name;
      if (this._cardinality !== "none") data.cardinality = this._cardinality;
      if (normalizeColor(this._color)) data.color = this._color;
    } else {
      data.category_id = this._categoryId;
    }
    this.call(SERVICE.manageCategory, data, "Category saved");
  }
}
