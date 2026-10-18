import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { COLOR, DOMAIN } from "../const";
import type { WalletCardConfig } from "../types";
import { errorText } from "../quick-add/quick-add-card";

export type Op = "create" | "patch" | "delete";

/** Primary-button color by operation (§2). */
export function opColor(op: Op): string {
  if (op === "create") return COLOR.income;
  if (op === "patch") return COLOR.transfer;
  return COLOR.expense;
}

export function opLabel(op: Op): string {
  return op === "create" ? "Create" : op === "patch" ? "Patch" : "Delete";
}

/**
 * Base for the write-side action cards: segmented operation control, a
 * monospace service caption, a result overlay, and a callService wrapper that
 * surfaces the integration's error text inline (bank-synced rejection, amount=0,
 * future date, delete-not-allowed, reference pre-check failure).
 */
export abstract class WalletActionCard<
  C extends WalletCardConfig = WalletCardConfig,
> extends WalletBaseCard<C> {
  @state() protected _submitting = false;
  @state() protected _result: { ok: boolean; title: string; msg: string } | null = null;

  /** Monospace `ha_wallet.<service>` caption shown top-right. */
  protected serviceCaption(service: string): TemplateResult {
    return html`<span class="svc-caption">${DOMAIN}.${service}</span>`;
  }

  protected segmented<T extends string>(
    options: [T, string][],
    active: T,
    onSelect: (v: T) => void,
    disabled: T[] = [],
  ): TemplateResult {
    return html`
      <div class="segmented" style="margin-bottom:14px">
        ${options.map(
          ([v, label]) => html`<button
            class=${active === v ? "active" : ""}
            ?disabled=${disabled.includes(v)}
            @click=${() => !disabled.includes(v) && onSelect(v)}
          >
            ${disabled.includes(v)
              ? html`<ha-icon
                  icon="mdi:lock"
                  style="--mdc-icon-size:13px;vertical-align:-2px"
                ></ha-icon> `
              : ""}${label}
          </button>`,
        )}
      </div>
    `;
  }

  protected primaryButton(
    label: string,
    color: string,
    onClick: () => void,
    disabled = false,
  ): TemplateResult {
    return html`
      <button
        class="btn"
        style="background:${color};margin-top:12px"
        ?disabled=${disabled || this._submitting}
        @click=${onClick}
      >
        ${this._submitting ? "Working…" : label}
      </button>
    `;
  }

  /** Call a ha_wallet service, showing a success/error overlay. */
  protected async call(
    service: string,
    data: Record<string, unknown>,
    successMsg: string,
  ): Promise<void> {
    if (!this.hass) return;
    this._submitting = true;
    try {
      await this.hass.callService(DOMAIN, service, data);
      this._result = {
        ok: true,
        title: "Service called",
        msg: `${DOMAIN}.${service}`,
      };
      this.onSuccess?.(successMsg);
    } catch (err) {
      this._result = { ok: false, title: "Service error", msg: errorText(err) };
    } finally {
      this._submitting = false;
    }
  }

  protected onSuccess?(msg: string): void;

  protected overlay(): TemplateResult | "" {
    if (!this._result) return "";
    const r = this._result;
    return html`
      <div class="overlay ${r.ok ? "ok" : "err"}">
        <ha-icon icon=${r.ok ? "mdi:check-circle" : "mdi:alert-circle"}></ha-icon>
        <strong>${r.title}</strong>
        <div class="footnote" style="word-break:break-word">${r.msg}</div>
        <button
          class="btn"
          style="background:var(--w-transfer);max-width:160px"
          @click=${() => (this._result = null)}
        >
          Dismiss
        </button>
      </div>
    `;
  }

  public override getCardSize(): number {
    return 6;
  }
}
