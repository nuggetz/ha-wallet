import type { HomeAssistant } from "../types";

/** Currency symbol lookup for the common cases; falls back to the code. */
const SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
  JPY: "¥",
  CZK: "Kč",
  PLN: "zł",
};

export function currencySymbol(code?: string | null): string {
  if (!code) return "";
  return SYMBOLS[code] ?? `${code} `;
}

/**
 * Format an amount in its own currency (never converted). Uses the HA locale
 * for grouping/decimals when possible, otherwise a sane en-style fallback.
 *
 * Sign handling: `signed` prepends +/− and drops the native minus so we control
 * the glyph; the caller colors it. When `signed` is false the number keeps its
 * natural sign.
 */
export function formatMoney(
  hass: HomeAssistant | undefined,
  value: number | null | undefined,
  currency?: string | null,
  opts: { signed?: boolean; decimals?: number } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const decimals = opts.decimals ?? 2;
  const abs = Math.abs(value);
  const lang = hass?.locale?.language || hass?.language || "en";
  let body: string;
  if (currency) {
    try {
      body = new Intl.NumberFormat(lang, {
        style: "currency",
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(abs);
    } catch {
      body = currencySymbol(currency) + groupNumber(abs, lang, decimals);
    }
  } else {
    body = groupNumber(abs, lang, decimals);
  }
  if (opts.signed) {
    const sign = value < 0 ? "−" : "+";
    return `${sign}${body}`;
  }
  return value < 0 ? `−${body}` : body;
}

function groupNumber(value: number, lang: string, decimals: number): string {
  try {
    return new Intl.NumberFormat(lang, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return value.toFixed(decimals);
  }
}

/** Percent chip text, e.g. "318%" or "−18%" (integer, sign kept). */
export function formatPercent(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "";
  const rounded = Math.round(pct);
  const sign = rounded < 0 ? "−" : rounded > 0 ? "+" : "";
  return `${sign}${Math.abs(rounded)}%`;
}

/** Short human date from an ISO string, per HA locale. */
export function formatDate(
  hass: HomeAssistant | undefined,
  iso?: string | null,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const lang = hass?.locale?.language || hass?.language || "en";
  try {
    return new Intl.DateTimeFormat(lang, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Relative "6 hours ago" style label. */
export function formatRelative(
  hass: HomeAssistant | undefined,
  iso?: string | null,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const lang = hass?.locale?.language || hass?.language || "en";
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = safeRelativeFormat(lang);
  const table: [number, Intl.RelativeTimeFormatUnit][] = [
    [1000 * 60 * 60 * 24 * 365, "year"],
    [1000 * 60 * 60 * 24 * 30, "month"],
    [1000 * 60 * 60 * 24, "day"],
    [1000 * 60 * 60, "hour"],
    [1000 * 60, "minute"],
    [1000, "second"],
  ];
  for (const [ms, unit] of table) {
    if (abs >= ms || unit === "second") {
      const v = Math.round(diffMs / ms);
      return rtf ? rtf.format(v, unit) : `${Math.abs(v)} ${unit}s ago`;
    }
  }
  return "";
}

function safeRelativeFormat(lang: string): Intl.RelativeTimeFormat | null {
  try {
    return new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  } catch {
    return null;
  }
}

/** Coerce an attribute/state to a number, or null. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
