import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { WalletBaseCard } from "../core/base-card";
import { byPrefix } from "../core/discovery";
import { isUnavailable } from "../core/entity-state";
import { formatMoney, toNumber } from "../core/format";
import { progressBar } from "../core/ui";
import { emptyState, skeletonRows } from "../core/states";
import { COLOR } from "../const";
import type { HassEntity } from "../types";

/**
 * Card 5 · Balance by Currencies — one row per currency; bars scaled to the
 * largest currency total. Never sums across currencies (contract). Source: the
 * per-currency `…_balance_<currency>` sensors (one each).
 */
@customElement("wallet-balance-by-currencies-card")
export class WalletBalanceByCurrenciesCard extends WalletBaseCard {
  protected defaultTitle(): string {
    return "Balance by Currencies";
  }

  private balances(): HassEntity[] {
    return this.hass ? byPrefix.balances(this.hass) : [];
  }

  protected override trackGood(): boolean {
    return this.balances().some((b) => !isUnavailable(b));
  }

  protected renderContent(): TemplateResult {
    const all = this.balances();
    const ready = all.filter((b) => !isUnavailable(b));

    if (!all.length) {
      // No per-currency sensors at all: either loading or no accounts selected.
      return this.wrap(html`
        ${this.head()}
        ${this.seenGood
          ? emptyState("No accounts selected in options", "mdi:bank-off")
          : skeletonRows(2)}
      `);
    }
    if (!ready.length) {
      return this.wrap(html`${this.head()}${skeletonRows(all.length || 2)}`);
    }

    const rows = ready
      .map((e) => ({
        currency: (e.attributes.currency as string) ?? e.attributes.unit_of_measurement,
        value: Math.abs(toNumber(e.state) ?? 0),
        raw: toNumber(e.state) ?? 0,
      }))
      .sort((a, b) => b.value - a.value);
    const max = rows[0]?.value || 1;

    return this.wrap(html`
      ${this.head()}
      <div class="stack">
        ${rows.map(
          (r) => html`
            <div class="col">
              <div class="row between">
                <span class="label" style="color:var(--w-text)"
                  >${currencyName(r.currency)}</span
                >
                <span class="big-value" style="font-size:20px"
                  >${formatMoney(this.hass, r.raw, r.currency)}</span
                >
              </div>
              ${progressBar(r.value / max, COLOR.balanceBar)}
            </div>
          `,
        )}
      </div>
      <div class="footnote">Per-currency — never merged into one total.</div>
    `);
  }
}

function currencyName(code?: string): string {
  const names: Record<string, string> = {
    EUR: "Euro",
    USD: "US Dollar",
    GBP: "British Pound",
    CHF: "Swiss Franc",
    CZK: "Czech Koruna",
    PLN: "Polish Złoty",
    JPY: "Japanese Yen",
  };
  return (code && names[code]) || code || "—";
}
