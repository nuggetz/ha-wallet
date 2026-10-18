import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletActionCard, opColor, opLabel, type Op } from "./action-base";
import { listAccounts } from "../core/accounts";
import { ACCOUNT_TYPES, COLOR_NAMES, NAMED_COLOR, SERVICE } from "../const";

// A5 exposes create/patch; delete is a disabled, locked segment (no delete in v1).
type AcctOp = Op;

/**
 * A5 · Accounts — `manage_account` (create / patch only; NO delete in v1). The
 * Delete segment is shown disabled with a lock + note (contract).
 */
@customElement("wallet-accounts-action-card")
export class WalletAccountsActionCard extends WalletActionCard {
  @state() private _op: AcctOp = "create";
  @state() private _accountId = "";
  @state() private _name = "";
  @state() private _type = ACCOUNT_TYPES[1]; // Cash
  @state() private _currency = "";
  @state() private _initialBalance = "";
  @state() private _color = "Turquoise";
  @state() private _excludeFromStats = false;
  @state() private _archived = false;

  protected defaultTitle(): string {
    return "Accounts";
  }

  protected renderContent(): TemplateResult {
    const accounts = this.hass ? listAccounts(this.hass) : [];
    const canSubmit =
      this._op === "create" ? !!this._name : !!this._accountId;

    return this.wrap(html`
      <div class="relative">
        ${this.overlay()}
        ${this.head(this.serviceCaption(SERVICE.manageAccount))}
        ${this.segmented<AcctOp>(
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
          Delete not exposed in v1 (contract). Cash/manual accounts only.
        </div>
        <div class="stack">
          ${this._op === "patch"
            ? html`<div class="field">
                <label>Account</label>
                <select
                  .value=${this._accountId}
                  @change=${(e: Event) =>
                    (this._accountId = (e.target as HTMLSelectElement).value)}
                >
                  <option value="" disabled selected=${!this._accountId}>Select…</option>
                  ${accounts.map((a) => html`<option value=${a.id}>${a.name}</option>`)}
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
            <label>Account type</label>
            <select
              .value=${this._type}
              @change=${(e: Event) =>
                (this._type = (e.target as HTMLSelectElement).value as typeof this._type)}
            >
              ${ACCOUNT_TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
            </select>
          </div>
          ${this._op === "create"
            ? html`
                <div class="field">
                  <label>Currency code</label>
                  <input
                    .value=${this._currency}
                    placeholder="EUR"
                    @input=${(e: Event) => (this._currency = (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="field">
                  <label>Initial balance</label>
                  <input
                    type="number"
                    step="0.01"
                    .value=${this._initialBalance}
                    @input=${(e: Event) =>
                      (this._initialBalance = (e.target as HTMLInputElement).value)}
                  />
                </div>
              `
            : ""}
          ${this.colorPicker()}
          <label class="row" style="gap:8px;cursor:pointer">
            <input
              type="checkbox"
              .checked=${this._excludeFromStats}
              @change=${(e: Event) =>
                (this._excludeFromStats = (e.target as HTMLInputElement).checked)}
            />
            <span class="label">Exclude from stats</span>
          </label>
          ${this._op === "patch"
            ? html`<label class="row" style="gap:8px;cursor:pointer">
                <input
                  type="checkbox"
                  .checked=${this._archived}
                  @change=${(e: Event) =>
                    (this._archived = (e.target as HTMLInputElement).checked)}
                />
                <span class="label">Archived</span>
              </label>`
            : ""}
          ${this.primaryButton(
            `${opLabel(this._op)} account`,
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
              <span class="dot" style="width:18px;height:18px;background:${hex}"></span>
            </button>`;
          })}
        </div>
      </div>
    `;
  }

  private submit(): void {
    if (this._op === "delete") return; // locked
    const data: Record<string, unknown> = { operation: this._op };
    if (this._op === "patch") data.account_id = this._accountId;
    if (this._name) data.name = this._name;
    if (this._type) data.account_type = this._type;
    if (this._op === "create") {
      if (this._currency) data.currency_code = this._currency;
      if (this._initialBalance) data.initial_balance = Number(this._initialBalance);
    }
    data.color = this._color;
    data.exclude_from_stats = this._excludeFromStats;
    if (this._op === "patch") data.archived = this._archived;
    this.call(SERVICE.manageAccount, data, "Account saved");
  }
}
