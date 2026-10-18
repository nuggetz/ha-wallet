import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletActionCard, opColor } from "./action-base";
import { listAccounts, type AccountInfo } from "../core/accounts";
import { formatMoney, toNumber } from "../core/format";
import { skeletonRows } from "../core/states";
import { COLOR, SERVICE } from "../const";

type Pairing = "new" | "unpaired";

/**
 * A2 · Transfer — `add_transfer`. FROM → TO account tiles, amount, and a
 * pairing_mode toggle. The API exposes only new/unpaired (§5.4) — no "existing".
 */
@customElement("wallet-transfer-card")
export class WalletTransferCard extends WalletActionCard {
  @state() private _from: string | null = null;
  @state() private _to: string | null = null;
  @state() private _amount = "";
  @state() private _pairing: Pairing = "new";
  @state() private _note = "";

  protected defaultTitle(): string {
    return "Transfer";
  }

  protected override trackGood(): boolean {
    return this.hass ? listAccounts(this.hass).length > 0 : false;
  }

  protected renderContent(): TemplateResult {
    const accounts = this.hass ? listAccounts(this.hass) : [];
    if (!accounts.length && !this.seenGood) {
      return this.wrap(html`${this.head()}${skeletonRows(3)}`);
    }
    const from = accounts.find((a) => a.id === this._from);
    const amount = Math.abs(toNumber(this._amount) ?? 0);
    const canSubmit = !!this._from && !!this._to && this._from !== this._to && amount > 0;

    return this.wrap(html`
      <div class="relative">
        ${this.overlay()}
        ${this.head(this.serviceCaption(SERVICE.addTransfer))}

        <div class="row" style="gap:10px;align-items:stretch">
          ${this.tile("From", accounts, this._from, (id) => (this._from = id))}
          <div class="row" style="align-items:center">
            <ha-icon icon="mdi:arrow-right-bold" style="color:${COLOR.transfer}"></ha-icon>
          </div>
          ${this.tile("To", accounts, this._to, (id) => (this._to = id))}
        </div>

        <div
          style="background:var(--w-chip);border-radius:12px;padding:14px;margin-top:12px"
        >
          <span class="caption caption-up">Amount ${from?.currency ?? ""}</span>
          <div class="big-value transfer" style="font-size:26px">
            ${formatMoney(this.hass, amount, from?.currency, { signed: false })}
          </div>
        </div>
        <div class="field" style="margin-top:10px">
          <input
            type="number"
            step="0.01"
            min="0"
            .value=${this._amount}
            @input=${(e: Event) => (this._amount = (e.target as HTMLInputElement).value)}
            placeholder="0.00"
          />
        </div>

        <div class="field" style="margin-top:10px">
          <label>Pairing</label>
          <div class="segmented">
            ${(
              [
                ["new", "Paired"],
                ["unpaired", "Two records"],
              ] as [Pairing, string][]
            ).map(
              ([v, label]) => html`<button
                class=${this._pairing === v ? "active" : ""}
                @click=${() => (this._pairing = v)}
              >
                ${label}
              </button>`,
            )}
          </div>
        </div>

        <div class="field" style="margin-top:10px">
          <label>Note</label>
          <input
            .value=${this._note}
            @input=${(e: Event) => (this._note = (e.target as HTMLInputElement).value)}
          />
        </div>

        ${this._from && this._from === this._to
          ? html`<div class="footnote" style="color:${COLOR.expense}">
              From and To must differ.
            </div>`
          : ""}
        ${this.primaryButton("Transfer", opColor("patch"), () => this.submit(), !canSubmit)}
      </div>
    `);
  }

  private tile(
    label: string,
    accounts: AccountInfo[],
    selected: string | null,
    onSelect: (id: string) => void,
  ): TemplateResult {
    const acct = accounts.find((a) => a.id === selected);
    return html`
      <div class="grow field">
        <label>${label}</label>
        <select
          .value=${selected ?? ""}
          @change=${(e: Event) => onSelect((e.target as HTMLSelectElement).value)}
        >
          <option value="" disabled selected=${!selected}>Select…</option>
          ${accounts.map((a) => html`<option value=${a.id}>${a.name}</option>`)}
        </select>
        ${acct
          ? html`<span class="footnote"
              >${formatMoney(this.hass, acct.balance, acct.currency)}</span
            >`
          : ""}
      </div>
    `;
  }

  private submit(): void {
    const amount = Math.abs(toNumber(this._amount) ?? 0);
    if (!this._from || !this._to || this._from === this._to || !amount) return;
    const data: Record<string, unknown> = {
      from_account_id: this._from,
      to_account_id: this._to,
      amount,
      pairing_mode: this._pairing,
    };
    if (this._note) data.note = this._note;
    this.call(SERVICE.addTransfer, data, "Transfer created");
  }
}
