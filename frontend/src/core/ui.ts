import { html, type TemplateResult } from "lit";
import { CATEGORY_ICON } from "../const";
import { categoryColor, tint, trendChip } from "./colors";
import type { WalletCategory } from "../types";
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

/**
 * A list capped at `limit` rows with a "Show more" toggle. Once expanded, the
 * full list sits in a scroll box of about the same height, so the card never
 * grows without bound (scroll by touch or wheel).
 */
export function cappedList<T>(
  items: T[],
  limit: number,
  expanded: boolean,
  toggle: () => void,
  row: (item: T) => TemplateResult,
  rowHeight = 58,
): TemplateResult {
  const overflow = items.length > limit;
  const visible = overflow && !expanded ? items.slice(0, limit) : items;
  return html`
    <div
      class=${overflow && expanded ? "scroll-list" : ""}
      style=${overflow && expanded ? `max-height:${limit * rowHeight}px` : ""}
    >
      ${visible.map(row)}
    </div>
    ${overflow
      ? html`<button class="more-btn" @click=${toggle}>
          ${expanded ? "Show less" : `Show more (${items.length - limit})`}
        </button>`
      : ""}
  `;
}

/** Category label with its parent, so subcategories read unambiguously. */
function categoryLabel(c: WalletCategory, byId: Map<string, WalletCategory>): string {
  const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
  return parent?.name ? `${parent.name} › ${c.name}` : c.name;
}

/**
 * Category picker as a native dropdown (every category reachable, fixed
 * height), with the selected category's icon and color beside it.
 */
export function categorySelect(
  categories: WalletCategory[],
  selectedId: string | null,
  onChange: (id: string | null) => void,
): TemplateResult {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const options = categories
    .filter((c) => c.name)
    .map((c) => ({ id: c.id, label: categoryLabel(c, byId) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const color = selected ? categoryColor(selected.name, categories) : "var(--w-muted)";
  return html`
    <div class="row" style="gap:10px;align-items:center">
      <div class="avatar round" style="background:${selected ? tint(color, 0.16) : "var(--w-chip)"}">
        <ha-icon
          icon=${selected ? categoryIcon(selected.name) : "mdi:shape-outline"}
          style="--mdc-icon-size:18px;color:${color}"
        ></ha-icon>
      </div>
      <select
        class="grow"
        .value=${selectedId ?? ""}
        @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value || null)}
      >
        <option value="" ?selected=${!selectedId}>No category</option>
        ${options.map(
          (o) => html`<option value=${o.id} ?selected=${o.id === selectedId}>${o.label}</option>`,
        )}
      </select>
    </div>
  `;
}
