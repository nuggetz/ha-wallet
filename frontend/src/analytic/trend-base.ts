import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { hasService } from "../core/discovery";
import { SERVICE } from "../const";
import {
  earliestPoint,
  fetchStatistics,
  monthTicks,
  type StatsMap,
  type StatPeriod,
} from "../core/history";
import type { WalletCardConfig } from "../types";

/**
 * Shared plumbing for the LTS trend cards (Cash Flow Trend, Balance Trend,
 * Period to Period). Fetches recorder statistics for a set of ids, tracks
 * whether the window is fully covered, and renders the "collecting from install
 * date" affordance — with the `import_history` hint gated on the service
 * existing (§5.1: it does not at 0.1.0).
 */
export abstract class WalletTrendCard extends WalletBaseCard {
  @state() protected _stats: StatsMap = {};
  @state() protected _loading = true;
  @state() protected _error = false;

  protected statPeriod: StatPeriod = "month";
  private _lastIds = "";
  private _fetching = false;

  /** Statistic ids (entity ids) the concrete card needs. */
  protected abstract statisticIds(): string[];

  /** Window start (default: Jan 1 of the current year). */
  protected windowStart(): Date {
    return new Date(new Date().getFullYear(), 0, 1);
  }

  public override setConfig(config: WalletCardConfig): void {
    super.setConfig(config);
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    super.updated(changed as never);
    if (changed.has("hass") && this.hass) this.maybeFetch();
  }

  private async maybeFetch(): Promise<void> {
    const ids = this.statisticIds();
    const key = ids.join("|");
    if (!ids.length) {
      this._loading = false;
      return;
    }
    if (this._fetching || key === this._lastIds) return;
    this._lastIds = key;
    this._fetching = true;
    try {
      const map = await fetchStatistics(
        this.hass!,
        ids,
        this.windowStart(),
        new Date(),
        this.statPeriod,
      );
      this._stats = map;
      this._error = false;
      if (Object.values(map).some((p) => p.length)) this.seenGood = true;
    } catch {
      this._error = true;
    } finally {
      this._loading = false;
      this._fetching = false;
    }
  }

  /** Fraction 0..1 into the window where recorded data begins (fresh installs). */
  protected partialFraction(): number | null {
    const earliest = earliestPoint(this._stats);
    if (earliest === null) return null;
    const start = this.windowStart().getTime();
    const end = Date.now();
    if (earliest <= start + 24 * 3600 * 1000) return null; // covers the window
    return Math.max(0, Math.min(1, (earliest - start) / (end - start)));
  }

  protected months(): string[] {
    return monthTicks(this.hass?.locale?.language || this.hass?.language || "en");
  }

  /** The "collecting from install date" note, with the conditional backfill hint. */
  protected collectingNote(): TemplateResult | "" {
    if (this.partialFraction() === null) return "";
    const canBackfill = this.hass && hasService(this.hass, SERVICE.importHistory);
    return html`
      <div class="footnote">
        Trend building from install date forward.${canBackfill
          ? html` Run <code>ha_wallet.import_history</code> to backfill.`
          : ""}
      </div>
    `;
  }
}
