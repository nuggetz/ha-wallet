import { html, type TemplateResult } from "lit";
import { CATEGORY_ICON } from "../const";
import { trendChip } from "./colors";
import { formatPercent } from "./format";

/** Horizontal progress bar (value scaled 0..1) in a given color. */
export function progressBar(fraction: number, color: string): TemplateResult {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return html`
    <div class="bar-track">
      <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>
  `;
}

/**
 * VS-Previous-Period chip. `goodWhenPositive` = income/cash-flow (up green);
 * for spending pass false so an increase reads red.
 */
export function vsChip(
  pct: number | null | undefined,
  goodWhenPositive = true,
): TemplateResult | string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "";
  const { color, bg, arrow } = trendChip(pct, goodWhenPositive);
  return html`
    <span class="chip" style="color:${color};background:${bg}">
      <span class="arrow">${arrow}</span>${formatPercent(pct)}
    </span>
  `;
}

/** mdi icon for a canonical category name, with a sensible default. */
export function categoryIcon(name?: string): string {
  const key = (name ?? "").trim().toLowerCase();
  if (key in CATEGORY_ICON) return CATEGORY_ICON[key];
  const head = key.split(/[:>\-–—]/)[0].trim();
  return CATEGORY_ICON[head] ?? "mdi:tag";
}
