import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { WalletActionCard } from "./action-base";
import { hasService } from "../core/discovery";
import { SERVICE } from "../const";

/**
 * A8 · Import History — `ha_wallet.import_history`. BLOCKER (§5.1): the service
 * does NOT exist at 0.1.0 (deferred to a 0.1.x point release). The card is
 * feature-gated: it renders a live button only when the service exists,
 * otherwise a disabled "coming in 0.1.x" state — never a button to a missing
 * service.
 */
@customElement("wallet-import-history-card")
export class WalletImportHistoryCard extends WalletActionCard {
  @state() private _filePath = "";

  protected defaultTitle(): string {
    return "Import History";
  }

  private available(): boolean {
    return this.hass ? hasService(this.hass, SERVICE.importHistory) : false;
  }

  protected renderContent(): TemplateResult {
    if (!this.available()) {
      return this.wrap(html`
        ${this.head(this.serviceCaption(SERVICE.importHistory))}
        <div class="dashed" style="text-align:left">
          <strong>Coming in 0.1.x.</strong> The
          <code>ha_wallet.import_history</code> service isn't available in this
          version of the integration yet. Once released it will seed long-term
          statistics from a Wallet CSV export so Balance / Cash Flow /
          Period-to-Period trends work from day one.
        </div>
      `);
    }

    return this.wrap(html`
      <div class="relative">
        ${this.overlay()}
        ${this.head(this.serviceCaption(SERVICE.importHistory))}
        <div
          class="dashed"
          style="padding:26px;text-align:center;margin-bottom:12px"
        >
          <ha-icon icon="mdi:file-upload-outline" style="--mdc-icon-size:32px"></ha-icon>
          <div style="margin-top:8px">Path to a Wallet CSV export on the HA host</div>
        </div>
        <div class="field">
          <label>File path</label>
          <input
            .value=${this._filePath}
            placeholder="/config/wallet_export.csv"
            @input=${(e: Event) => (this._filePath = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="footnote">
          Validated &amp; idempotent — safe to re-run; existing stats aren't skewed.
          Seeds LTS so trends work from day one.
        </div>
        <button
          class="btn"
          style="background:var(--w-text);color:var(--w-surface);margin-top:12px"
          ?disabled=${!this._filePath || this._submitting}
          @click=${() =>
            this.call(SERVICE.importHistory, { file_path: this._filePath }, "Import started")}
        >
          ${this._submitting ? "Importing…" : "Import history"}
        </button>
      </div>
    `);
  }
}
