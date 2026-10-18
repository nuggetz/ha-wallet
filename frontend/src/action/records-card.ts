import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletActionCard, opColor } from "./action-base";
import { singleton } from "../core/discovery";
import { listAccounts, listCategories, type AccountInfo } from "../core/accounts";
import { categoryColor, tint } from "../core/colors";
import { categoryIcon } from "../core/ui";
import { formatDate, formatMoney, toNumber } from "../core/format";
import { COLOR, PAYMENT_TYPES, SERVICE } from "../const";
import type { WalletCategory, WalletRecord } from "../types";

type Mode = "add" | "edit" | "delete";

/**
 * A1 · Records — `add_record` / `update_record` / `delete_record`.
 * Delete picks a record from `…_last_records`, warns about the reference
 * pre-check + bank-synced restriction, and exposes the optional `force` toggle.
 */
@customElement("wallet-records-action-card")
export class WalletRecordsActionCard extends WalletActionCard {
  @state() private _mode: Mode = "add";
  @state() private _amount = "";
  @state() private _kind: "expense" | "income" = "expense";
  @state() private _accountId: string | null = null;
  @state() private _categoryId: string | null = null;
  @state() private _payment = "cash";
  @state() private _note = "";
  @state() private _labelsRaw = "";
  @state() private _recordId: string | null = null;
  @state() private _force = false;

  protected defaultTitle(): string {
    return "Records";
  }

  protected override trackGood(): boolean {
    return this.hass ? listAccounts(this.hass).length > 0 : false;
  }

  private service(): string {
    return this._mode === "add"
      ? SERVICE.addRecord
      : this._mode === "edit"
        ? SERVICE.updateRecord
        : SERVICE.deleteRecord;
  }

  protected renderContent(): TemplateResult {
    const accounts = this.hass ? listAccounts(this.hass) : [];
    const categories = this.hass ? listCategories(this.hass) : [];
    return this.wrap(html`
      <div class="relative">
        ${this.overlay()}
        ${this.head(this.serviceCaption(this.service()))}
        ${this.segmented<Mode>(
          [
            ["add", "Add"],
            ["edit", "Edit"],
            ["delete", "Delete"],
          ],
          this._mode,
          (m) => (this._mode = m),
        )}
        ${this._mode === "delete"
          ? this.deleteForm()
          : this.editForm(accounts, categories)}
      </div>
    `);
  }

  private editForm(
    accounts: AccountInfo[],
    categories: WalletCategory[],
  ): TemplateResult {
    const acct = accounts.find((a) => a.id === this._accountId);
    const amountNum = this.signedAmount();
    const currency = acct?.currency;
    const canSubmit =
      this._mode === "edit"
        ? !!this._recordId
        : !!this._accountId && !!acct && !acct.bankSynced && amountNum !== 0;

    return html`
      <div class="stack">
        <div
          style="background:var(--w-chip);border-radius:12px;padding:14px"
        >
          <span class="caption caption-up">${this._kind} ${currency ?? ""}</span>
          <div
            class="big-value ${this._kind === "expense" ? "expense" : "income"}"
            style="font-size:26px"
          >
            ${formatMoney(this.hass, amountNum, currency, { signed: true })}
          </div>
        </div>

        <div class="segmented">
          ${(["expense", "income"] as const).map(
            (k) => html`<button
              class=${this._kind === k ? "active" : ""}
              @click=${() => (this._kind = k)}
            >
              ${k[0].toUpperCase() + k.slice(1)}
            </button>`,
          )}
        </div>

        <div class="field">
          <label>Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            .value=${this._amount}
            @input=${(e: Event) => (this._amount = (e.target as HTMLInputElement).value)}
            placeholder="0.00"
          />
        </div>

        ${this._mode === "edit"
          ? html`<div class="field">
              <label>Record id (from Last Records)</label>
              <input
                .value=${this._recordId ?? ""}
                @input=${(e: Event) =>
                  (this._recordId = (e.target as HTMLInputElement).value || null)}
                placeholder="record id"
              />
            </div>`
          : this.accountPicker(accounts)}

        <div class="field">
          <label>Category</label>
          <div class="pill-row">
            ${categories.slice(0, 10).map((c) => {
              const color = categoryColor(c.name, categories);
              const on = this._categoryId === c.id;
              return html`<button
                class="pill"
                style=${on ? `border-color:${color};background:${tint(color, 0.13)}` : ""}
                @click=${() => (this._categoryId = on ? null : c.id)}
              >
                <ha-icon
                  icon=${categoryIcon(c.name)}
                  style="--mdc-icon-size:16px;color:${color}"
                ></ha-icon>
                ${c.name}
              </button>`;
            })}
          </div>
        </div>

        <div class="field">
          <label>Payment type</label>
          <select
            .value=${this._payment}
            @change=${(e: Event) => (this._payment = (e.target as HTMLSelectElement).value)}
          >
            ${PAYMENT_TYPES.map((p) => html`<option value=${p}>${p.replace("_", " ")}</option>`)}
          </select>
        </div>

        <div class="field">
          <label>Labels (comma-separated ids)</label>
          <input
            .value=${this._labelsRaw}
            @input=${(e: Event) => (this._labelsRaw = (e.target as HTMLInputElement).value)}
            placeholder="label id, label id"
          />
        </div>

        <div class="field">
          <label>Note</label>
          <input
            .value=${this._note}
            @input=${(e: Event) => (this._note = (e.target as HTMLInputElement).value)}
          />
        </div>

        ${acct?.bankSynced
          ? html`<div class="footnote" style="color:${COLOR.expense}">
              ${acct.name} is bank-synced (read-only).
            </div>`
          : ""}
        ${this.primaryButton(
          this._mode === "add" ? "Add record" : "Save changes",
          opColor(this._mode === "add" ? "create" : "patch"),
          () => this.submitEdit(acct),
          !canSubmit,
        )}
      </div>
    `;
  }

  private accountPicker(accounts: AccountInfo[]): TemplateResult {
    return html`
      <div class="field">
        <label>Account</label>
        <div class="stack" style="gap:6px">
          ${accounts.map((a) => {
            const on = this._accountId === a.id;
            return html`<button
              class="pill"
              style="width:100%;justify-content:space-between;${on
                ? `border-color:${COLOR.transfer}`
                : ""};${a.bankSynced ? "opacity:.55" : ""}"
              @click=${() => !a.bankSynced && (this._accountId = a.id)}
            >
              <span>${a.name}${a.bankSynced ? " · read-only" : ""}</span>
              ${on ? html`<ha-icon icon="mdi:check" style="--mdc-icon-size:16px"></ha-icon>` : ""}
            </button>`;
          })}
        </div>
      </div>
    `;
  }

  private deleteForm(): TemplateResult {
    const lr = this.hass ? singleton.lastRecords(this.hass) : undefined;
    const records = (lr?.attributes.records as WalletRecord[]) ?? [];
    if (!records.length) {
      return html`<div class="state-empty">
        <ha-icon icon="mdi:receipt-text-outline"></ha-icon>
        <div>No recent records to delete</div>
      </div>`;
    }
    const selected = records.find((r) => r.id === this._recordId);
    return html`
      <div class="stack">
        <div class="field">
          <label>Pick a record</label>
          <div class="stack" style="gap:6px">
            ${records.map((r) => {
              const on = this._recordId === r.id;
              const amount = toNumber(r.amount) ?? 0;
              return html`<button
                class="pill"
                style="width:100%;justify-content:space-between;${on
                  ? `border-color:${COLOR.expense}`
                  : ""}"
                @click=${() => (this._recordId = on ? null : r.id)}
              >
                <span class="ellipsis"
                  >${r.category ?? "Record"} · ${r.account ?? ""} ·
                  ${formatDate(this.hass, r.date)}</span
                >
                <span class=${amount < 0 ? "expense" : "income"}
                  >${formatMoney(this.hass, amount, undefined, { signed: true })}</span
                >
              </button>`;
            })}
          </div>
        </div>
        ${selected
          ? html`<div class="dashed" style="text-align:left">
              <strong>Reference pre-check runs before delete.</strong> Records on
              bank-synced accounts cannot be deleted.
            </div>`
          : ""}
        <label class="row" style="gap:8px;cursor:pointer">
          <input
            type="checkbox"
            .checked=${this._force}
            @change=${(e: Event) => (this._force = (e.target as HTMLInputElement).checked)}
          />
          <span class="label">Force (skip reference pre-check)</span>
        </label>
        ${this.primaryButton(
          "Delete record",
          opColor("delete"),
          () => this.submitDelete(),
          !this._recordId,
        )}
      </div>
    `;
  }

  private signedAmount(): number {
    const abs = Math.abs(toNumber(this._amount) ?? 0);
    return this._kind === "expense" ? -abs : abs;
  }

  private labelIds(): string[] {
    return this._labelsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private submitEdit(acct?: AccountInfo): void {
    const amount = this.signedAmount();
    if (this._mode === "add") {
      if (!acct || acct.bankSynced || !amount) return;
      const data: Record<string, unknown> = {
        account_id: acct.id,
        amount,
        payment_type: this._payment,
      };
      if (this._categoryId) data.category_id = this._categoryId;
      if (this._note) data.note = this._note;
      if (this.labelIds().length) data.label_ids = this.labelIds();
      this.call(SERVICE.addRecord, data, "Record added");
    } else {
      if (!this._recordId) return;
      const data: Record<string, unknown> = { record_id: this._recordId };
      if (this._amount) data.amount = amount;
      if (this._categoryId) data.category_id = this._categoryId;
      if (this._note) data.note = this._note;
      if (this._payment) data.payment_type = this._payment;
      if (this.labelIds().length) data.label_ids = this.labelIds();
      this.call(SERVICE.updateRecord, data, "Record updated");
    }
  }

  private submitDelete(): void {
    if (!this._recordId) return;
    const data: Record<string, unknown> = { record_id: this._recordId };
    if (this._force) data.force = true;
    this.call(SERVICE.deleteRecord, data, "Record deleted");
  }

  public override getCardSize(): number {
    return 9;
  }
}
