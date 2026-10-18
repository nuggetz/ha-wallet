import {
  CATEGORY_COLOR_BY_NAME,
  COLOR,
  NAMED_COLOR,
} from "../const";
import type { WalletCategory } from "../types";

/** A rotating palette for categories with neither a color field nor a known name. */
const FALLBACK_PALETTE = [
  COLOR.housing,
  COLOR.shopping,
  COLOR.food,
  COLOR.life,
  COLOR.comm,
  COLOR.vehicle,
  COLOR.balanceBar,
  COLOR.cmpYearAgo,
  COLOR.cmpPrevious,
];

/**
 * Resolve a category color. Order (per CARD-BUILD-SPEC §0.2):
 *   1. the category's own `color` field (hex, or a Wallet color-name enum)
 *   2. canonical name → fixed palette
 *   3. deterministic fallback from the name hash
 */
export function categoryColor(
  name: string | undefined,
  categories?: WalletCategory[],
): string {
  const key = (name ?? "").trim().toLowerCase();
  if (categories && key) {
    const match = categories.find((c) => (c.name ?? "").toLowerCase() === key);
    const own = normalizeColor(match?.color);
    if (own) return own;
  }
  if (key in CATEGORY_COLOR_BY_NAME) return CATEGORY_COLOR_BY_NAME[key];
  // partial match on the leading token (e.g. "Food & Drinks: Groceries")
  const head = key.split(/[:>\-–—]/)[0].trim();
  if (head in CATEGORY_COLOR_BY_NAME) return CATEGORY_COLOR_BY_NAME[head];
  return FALLBACK_PALETTE[hashString(key) % FALLBACK_PALETTE.length];
}

/** Turn a Wallet color-name enum or hex into a hex string, or null. */
export function normalizeColor(color?: string | null): string | null {
  if (!color) return null;
  if (color.startsWith("#")) return color;
  if (color in NAMED_COLOR) return NAMED_COLOR[color];
  return null;
}

/** Add an alpha channel to a hex color, e.g. tint(#F5433A, .16). */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Direction/sign coloring for the VS-Previous chip.
 * `goodWhenPositive` = income/cash-flow (up is green); for spending pass false.
 */
export function trendChip(pct: number, goodWhenPositive = true): {
  color: string;
  bg: string;
  arrow: string;
} {
  const positive = pct >= 0;
  const good = goodWhenPositive ? positive : !positive;
  return {
    color: good ? COLOR.up : COLOR.down,
    bg: good ? COLOR.upBg : COLOR.downBg,
    arrow: positive ? "↑" : "↓",
  };
}
