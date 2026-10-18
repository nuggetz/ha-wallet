import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { listAccounts, listCategories, type AccountInfo } from "../core/accounts";
import { categoryColor, tint } from "../core/colors";
import { categoryIcon } from "../core/ui";
import { formatMoney } from "../core/format";
import { skeletonRows } from "../core/states";
import { COLOR, DOMAIN, SERVICE } from "../const";
import type { WalletCategory } from "../types";

type Kind = "expense" | "income";

/**
 * Card 13 · Quick-Add — mirrors the app's add-record sheet. Builds an amount on
 * a keypad, picks a category and a cash/manual account, and calls
 * `ha_wallet.add_record`. Bank-synced accounts are blocked (read-only, contract).
 */
@customElement("wallet-quick-add-card")
export class WalletQuickAddCard extends WalletBaseCard {
  @state() private _digits = ""; // integer-cents string, e.g. "1250" => 12.50
  @state() private _kind: Kind = "expense";
  @state() private _categoryId: string | null = null;
  @state() private _accountId: string | null = null;
  @state() private _submitting = false;
  @state() private _result: { ok: boolean; msg: string } | null = null;

  protected defaultTitle(): string {
    return "Quick Add";
  }

  protected override trackGood(): boolean {
    return this.hass ? listAccounts(this.hass).length > 0 : false;
  }

  private amount(): number {
    const cents = parseInt(this._digits || "0", 10);
    const abs = cents / 100;
    return this._kind === "expense" ? -abs : abs;
  }

  private selectedAccount(accounts: AccountInfo[]): AccountInfo | undefined {
    return accounts.find((a) => a.id === this._accountId);
  }

  protected renderContent(): TemplateResult {
    const accounts = this.hass ? listAccounts(this.hass) : [];
    const categories = this.hass ? listCategories(this.hass) : [];

    // loading: the account sensors haven't populated yet.
    if (!accounts.length && !this.seenGood) {
      return this.wrap(html`${this.head()}${skeletonRows(3)}`);
    }

    const acct = this.selectedAccount(accounts);
    const currency = acct?.currency ?? (this.hass?.config.currency as string) ?? undefined;
    const canAdd =
      !!this._accountId && !!acct && !acct.bankSynced && this._digits !== "" && this.amount() !== 0;

    return this.wrap(html`
      <div class="relative">
        ${this._result ? this.overlay(this._result) : ""}
        ${this.head(html`<span class="chip"
          style="background:${COLOR.brandAcid};color:#0B0E14">INTERACTIVE</span>`)}

        ${this.amountPanel(currency)}
        ${this.typeToggle()}
        ${this.categorySection(categories)}
        ${this.accountSection(accounts, acct)}
        ${this.keypad()}

        <button
          class="btn"
          style="background:${this._kind === "expense" ? COLOR.expense : COLOR.income};margin-top:14px"
          ?disabled=${!canAdd || this._submitting}
          @click=${() => this.submit(acct)}
        >
          ${this._submitting ? "Adding…" : "Add record"}
        </button>
        ${acct?.bankSynced
          ? html`<div class="footnote" style="color:${COLOR.expense}">
              ${acct.name} is bank-synced (read-only). Pick a cash/manual account.
            </div>`
          : ""}
      </div>
    `);
  }

  private amountPanel(currency?: string): TemplateResult {
    return html`
      <div
        style="background:var(--w-chip);border-radius:14px;padding:16px 18px;margin-bottom:12px"
      >
        <span class="caption caption-up"
          >${this._kind} · ${currency ?? ""}</span
        >
        <div
          class="big-value ${this._kind === "expense" ? "expense" : "income"}"
          style="font-size:34px;margin-top:4px"
        >
          ${formatMoney(this.hass, this.amount(), currency, { signed: true })}
        </div>
      </div>
    `;
  }

  private typeToggle(): TemplateResult {
    return html`
      <div class="segmented" style="margin-bottom:12px">
        ${(["expense", "income"] as Kind[]).map(
          (k) => html`<button
            class=${this._kind === k ? "active" : ""}
            @click=${() => (this._kind = k)}
          >
            ${k[0].toUpperCase() + k.slice(1)}
          </button>`,
        )}
      </div>
    `;
  }

  private categorySection(categories: WalletCategory[]): TemplateResult {
    const list = categories.filter((c) => c.name);
    if (!list.length) return html``;
    return html`
      <span class="label">Category</span>
      <div class="pill-row" style="margin:6px 0 12px">
        ${list.slice(0, 12).map((c) => {
          const color = categoryColor(c.name, categories);
          const on = this._categoryId === c.id;
          return html`<button
            class="pill"
            style=${on
              ? `border-color:${color};background:${tint(color, 0.13)}`
              : ""}
            @click=${() => (this._categoryId = on ? null : c.id)}
          >
            <ha-icon
              icon=${categoryIcon(c.name)}
              style="--mdc-icon-size:18px;color:${color}"
            ></ha-icon>
            ${c.name}
          </button>`;
        })}
      </div>
    `;
  }

  private accountSection(accounts: AccountInfo[], selected?: AccountInfo): TemplateResult {
    return html`
      <span class="label">Account</span>
      <div class="stack" style="gap:6px;margin:6px 0 12px">
        ${accounts.map((a) => {
          const on = this._accountId === a.id;
          const disabled = a.bankSynced;
          return html`<button
            class="pill"
            style="width:100%;justify-content:space-between;${on
              ? `border-color:${COLOR.transfer}`
              : ""};${disabled ? "opacity:.55" : ""}"
            @click=${() => !disabled && (this._accountId = a.id)}
          >
            <span class="row" style="gap:8px">
              <ha-icon
                icon=${a.bankSynced ? "mdi:bank" : "mdi:cash"}
                style="--mdc-icon-size:18px;color:${a.bankSynced
                  ? COLOR.bankSynced
                  : COLOR.cashAccount}"
              ></ha-icon>
              ${a.name}
              ${disabled
                ? html`<span class="muted" style="font-size:11px">read-only</span>`
                : ""}
            </span>
            ${on ? html`<ha-icon icon="mdi:check" style="--mdc-icon-size:18px"></ha-icon>` : ""}
          </button>`;
        })}
        ${selected?.bankSynced
          ? html`<span class="footnote">Bank-synced accounts can't receive manual records.</span>`
          : ""}
      </div>
    `;
  }

  private keypad(): TemplateResult {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
    return html`
      <div
        style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"
      >
        ${keys.map(
          (k) => html`<button
            class="pill"
            style="justify-content:center;min-height:48px;font-size:18px;font-weight:700"
            @click=${() => this.press(k)}
          >
            ${k}
          </button>`,
        )}
      </div>
    `;
  }

  private press(key: string): void {
    if (this._result) this._result = null;
    if (key === "⌫") {
      this._digits = this._digits.slice(0, -1);
      return;
    }
    if (key === ".") return; // amount is cents-based; decimal is implicit.
    if (this._digits.length >= 7) return; // cap ~ 99,999.99
    if (this._digits === "" && key === "0") return;
    this._digits += key;
  }

  private async submit(acct?: AccountInfo): Promise<void> {
    if (!this.hass || !acct || acct.bankSynced) return;
    const amount = this.amount();
    if (!amount) return;
    this._submitting = true;
    const data: Record<string, unknown> = {
      account_id: acct.id,
      amount,
      payment_type: "cash",
    };
    if (this._categoryId) data.category_id = this._categoryId;
    try {
      await this.hass.callService(DOMAIN, SERVICE.addRecord, data);
      this._result = {
        ok: true,
        msg: `${formatMoney(this.hass, amount, acct.currency, {
          signed: true,
        })} logged to ${acct.name} via ${DOMAIN}.${SERVICE.addRecord}.`,
      };
      this._digits = "";
    } catch (err) {
      this._result = { ok: false, msg: errorText(err) };
    } finally {
      this._submitting = false;
    }
  }

  private overlay(result: { ok: boolean; msg: string }): TemplateResult {
    return html`
      <div class="overlay ${result.ok ? "ok" : "err"}">
        <ha-icon icon=${result.ok ? "mdi:check-circle" : "mdi:alert-circle"}></ha-icon>
        <strong>${result.ok ? "Record added" : "Couldn't add record"}</strong>
        <div class="footnote">${result.msg}</div>
        <button
          class="btn"
          style="background:var(--w-transfer);max-width:180px"
          @click=${() => (this._result = null)}
        >
          ${result.ok ? "Add another" : "Try again"}
        </button>
      </div>
    `;
  }

  public override getCardSize(): number {
    return 8;
  }
}

export function errorText(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
