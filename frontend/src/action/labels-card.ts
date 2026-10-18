import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletActionCard, opColor, opLabel, type Op } from "./action-base";
import { listLabels } from "../core/accounts";
import { COLOR_NAMES, NAMED_COLOR, SERVICE } from "../const";

/**
 * A6 · Labels — `manage_label` (create / patch only; NO delete in v1 — archive
 * instead). label_id comes from the labels sensor.
 */
@customElement("wallet-labels-action-card")
export class WalletLabelsActionCard extends WalletActionCard {
  @state() private _op: Op = "create";
  @state() private _labelId = "";
  @state() private _name = "";
  @state() private _color = "Pink";
  @state() private _archived = false;

  protected defaultTitle(): string {
    return "Labels";
  }

  protected renderContent(): TemplateResult {
    const labels = this.hass ? listLabels(this.hass) : [];
    const canSubmit = this._op === "create" ? !!this._name : !!this._labelId;

    return this.wrap(html`
      <div class="relative">
        ${this.overlay()}
        ${this.head(this.serviceCaption(SERVICE.manageLabel))}
        ${this.segmented<Op>(
          [
            ["create", "Create"],
            ["patch", "Patch"],
            ["delete", "Delete"],
          ],
          this._op,
          (o) => (this._op = o),
          ["delete"],
        )}
        <div class="footnote" style="margin-bottom:10px">
          Delete not exposed in v1. Archive instead.
        </div>
        <div class="stack">
          ${this._op === "patch"
            ? html`<div class="field">
                <label>Label</label>
                <select
                  .value=${this._labelId}
                  @change=${(e: Event) => (this._labelId = (e.target as HTMLSelectElement).value)}
                >
                  <option value="" disabled selected=${!this._labelId}>Select…</option>
                  ${labels.map((l) => html`<option value=${l.id}>${l.name}</option>`)}
                </select>
              </div>`
            : ""}
          <div class="field">
            <label>Name</label>
            <input
              .value=${this._name}
              @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}
            />
          </div>
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
                  <span class="dot" style="width:18px;height:18px;background:${hex}"></span>
                </button>`;
              })}
            </div>
          </div>
          <label class="row" style="gap:8px;cursor:pointer">
            <input
              type="checkbox"
              .checked=${this._archived}
              @change=${(e: Event) => (this._archived = (e.target as HTMLInputElement).checked)}
            />
            <span class="label">Archived</span>
          </label>
          ${this.primaryButton(
            `${opLabel(this._op)} label`,
            opColor(this._op),
            () => this.submit(),
            !canSubmit,
          )}
        </div>
      </div>
    `);
  }

  private submit(): void {
    if (this._op === "delete") return;
    const data: Record<string, unknown> = { operation: this._op };
    if (this._op === "patch") data.label_id = this._labelId;
    if (this._name) data.name = this._name;
    data.color = this._color;
    data.archived = this._archived;
    this.call(SERVICE.manageLabel, data, "Label saved");
  }
}
