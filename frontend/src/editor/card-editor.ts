import { LitElement, html, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { DOMAIN } from "../const";
import type { HomeAssistant, WalletCardConfig } from "../types";

/**
 * Shared GUI editor for every Wallet card. Uses HA's `ha-form` so the fields
 * match the native card editor look. The entity picker is filtered to the
 * `ha_wallet` integration, so users only see Wallet entities. Fields shown
 * adapt to the card type: an optional entity override for singleton-bound
 * analytic cards, a period selector for period-based cards, and a title for all.
 */

/** Cards that accept an optional `entity` override (singleton-bound). */
const ENTITY_CARDS = new Set([
  "wallet-cash-flow-card",
  "wallet-cash-flow-trend-card",
  "wallet-spending-card",
  "wallet-nature-of-spending-card",
  "wallet-spending-by-categories-card",
  "wallet-credit-limits-card",
  "wallet-balance-trend-card",
  "wallet-expenses-structure-card",
  "wallet-last-records-card",
  "wallet-period-comparison-card",
]);

/** Cards that show a reporting period and accept a `period` override. */
const PERIOD_CARDS = new Set([
  "wallet-cash-flow-card",
  "wallet-cash-flow-trend-card",
  "wallet-spending-card",
  "wallet-nature-of-spending-card",
  "wallet-spending-by-categories-card",
  "wallet-credit-limits-card",
  "wallet-balance-trend-card",
  "wallet-expenses-structure-card",
  "wallet-period-comparison-card",
]);

interface FormSchemaItem {
  name: string;
  selector: Record<string, unknown>;
}

const LABELS: Record<string, string> = {
  title: "Title (optional)",
  entity: "Wallet entity (optional — auto-detected)",
  period: "Reporting period",
};

@customElement("ha-wallet-card-editor")
export class WalletCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: WalletCardConfig;

  public setConfig(config: WalletCardConfig): void {
    this._config = config;
  }

  private schema(): FormSchemaItem[] {
    const type = this._config?.type?.replace(/^custom:/, "") ?? "";
    const items: FormSchemaItem[] = [
      { name: "title", selector: { text: {} } },
    ];
    if (ENTITY_CARDS.has(type)) {
      items.push({
        name: "entity",
        selector: { entity: { integration: DOMAIN, domain: "sensor" } },
      });
    }
    if (PERIOD_CARDS.has(type)) {
      items.push({
        name: "period",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "this_year", label: "This year" },
              { value: "this_month", label: "This month" },
              { value: "custom", label: "Custom period" },
            ],
          },
        },
      });
    }
    return items;
  }

  protected override render(): TemplateResult {
    if (!this.hass || !this._config) return html``;
    const data: Record<string, unknown> = { ...this._config };
    // ha-form shouldn't render the type field.
    delete data.type;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this.schema()}
        .computeLabel=${(s: FormSchemaItem) => LABELS[s.name] ?? s.name}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config) return;
    const value = (ev.detail as { value: Record<string, unknown> }).value ?? {};
    // Drop empty strings so optional fields don't persist as "".
    const cleaned: Record<string, unknown> = { type: this._config.type };
    for (const [k, v] of Object.entries(value)) {
      if (v !== "" && v !== undefined && v !== null) cleaned[k] = v;
    }
    this._config = cleaned as unknown as WalletCardConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: cleaned },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
