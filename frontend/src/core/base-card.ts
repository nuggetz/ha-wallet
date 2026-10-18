import { LitElement, html, type TemplateResult, type PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import { sharedStyles } from "../styles/shared";
import { PERIOD_LABEL } from "../const";
import type { HomeAssistant, WalletCardConfig } from "../types";

/**
 * Base for every Wallet card. Provides hass/config wiring, the shared chrome
 * (title + optional right slot), period labels, and a `seenGood` flag so a card
 * can tell first-load "loading" from later "error". Concrete cards implement
 * `renderContent()`.
 */
export abstract class WalletBaseCard<
  C extends WalletCardConfig = WalletCardConfig,
> extends LitElement {
  static override styles = sharedStyles;

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() protected _config!: C;

  /** Set once a primary entity has produced a usable value; drives error vs loading. */
  protected seenGood = false;

  public setConfig(config: C): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  /** GUI editor (shared across all cards; adapts fields to the card type). */
  public static getConfigElement(): HTMLElement {
    return document.createElement("ha-wallet-card-editor");
  }

  /** Minimal stub inserted when the card is picked; HA adds `type`. */
  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has("hass") && this.hass && this.trackGood()) {
      this.seenGood = true;
    }
  }

  /** Cards override to report whether their primary entity currently has data. */
  protected trackGood(): boolean {
    return false;
  }

  protected cardTitle(fallback: string): string {
    return this._config?.title ?? fallback;
  }

  protected periodLabel(period?: string | null): string {
    const key = this._config?.period ?? period ?? "this_year";
    return PERIOD_LABEL[key] ?? PERIOD_LABEL.this_year;
  }

  /** Card chrome: title bar with an optional right-aligned slot. */
  protected head(right?: TemplateResult | string): TemplateResult {
    return html`
      <div class="card-head">
        <h2 class="title">${this.cardTitle(this.defaultTitle())}</h2>
        ${right ? html`<div>${right}</div>` : ""}
      </div>
    `;
  }

  /** Wrap content in an ha-card. */
  protected wrap(inner: TemplateResult): TemplateResult {
    return html`<ha-card>${inner}</ha-card>`;
  }

  protected abstract defaultTitle(): string;
  protected abstract renderContent(): TemplateResult;

  protected override render(): TemplateResult {
    if (!this._config) return html``;
    if (!this.hass) {
      return this.wrap(html`${this.head()}<div class="dashed">Waiting for Home Assistant…</div>`);
    }
    return this.renderContent();
  }
}
