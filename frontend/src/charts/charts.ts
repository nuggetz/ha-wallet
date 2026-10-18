import { svg, html, type TemplateResult } from "lit";

/**
 * Inline-SVG chart primitives (no external chart library — keeps the bundle
 * self-contained). Colors come from the caller (brand/semantic constants or
 * category colors); axis/grid strokes use HA theme vars via currentColor mixes.
 */

const AXIS = "var(--w-line)";
const GRID = "color-mix(in srgb, var(--w-line) 60%, transparent)";
const TEXT = "var(--w-muted)";

// --- semicircular gauge (Card 3) --------------------------------------------

/**
 * 180° gauge with a red→amber→green arc and a needle at `fraction` (0..1).
 * `fraction` near 0 = low spend (needle left/red), near 1 = high (green side),
 * matching the app's dashboard gauges.
 */
export function gauge(fraction: number): TemplateResult {
  const f = clamp(fraction, 0, 1);
  const w = 240;
  const h = 140;
  const cx = w / 2;
  const cy = 128;
  const r = 96;
  const seg = (a0: number, a1: number, color: string) =>
    svg`<path d=${arcPath(cx, cy, r, a0, a1)} fill="none" stroke=${color}
      stroke-width="18" stroke-linecap="round" />`;
  // 180°(left)→0°(right); split into three colored thirds.
  const needleAngle = 180 - f * 180;
  const nx = cx + (r - 6) * Math.cos((needleAngle * Math.PI) / 180);
  const ny = cy - (r - 6) * Math.sin((needleAngle * Math.PI) / 180);
  return svg`
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="gauge">
      ${seg(180, 120, "#f5433a")}
      ${seg(120, 60, "#f7a81b")}
      ${seg(60, 0, "#34c759")}
      <circle cx=${cx} cy=${cy} r="7" fill="var(--w-text)" />
      <line x1=${cx} y1=${cy} x2=${nx} y2=${ny}
        stroke="var(--w-text)" stroke-width="4" stroke-linecap="round" />
    </svg>
  `;
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  a0deg: number,
  a1deg: number,
): string {
  const a0 = (a0deg * Math.PI) / 180;
  const a1 = (a1deg * Math.PI) / 180;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy - r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy - r * Math.sin(a1);
  const large = Math.abs(a1deg - a0deg) > 180 ? 1 : 0;
  const sweep = a1deg < a0deg ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

// --- donut (Card 9) ----------------------------------------------------------

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Donut ring; center content supplied by the caller (currency + total). */
export function donut(slices: DonutSlice[], centerTop: string, centerBottom: string): TemplateResult {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 66;
  const sw = 26;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const rings = total
    ? slices
        .filter((s) => s.value > 0)
        .map((s) => {
          const frac = s.value / total;
          const dash = frac * circ;
          const el = svg`<circle cx=${cx} cy=${cy} r=${r} fill="none"
            stroke=${s.color} stroke-width=${sw}
            stroke-dasharray="${dash} ${circ - dash}"
            stroke-dashoffset=${-offset}
            transform="rotate(-90 ${cx} ${cy})" />`;
          offset += dash;
          return el;
        })
    : [
        svg`<circle cx=${cx} cy=${cy} r=${r} fill="none" stroke=${GRID}
          stroke-width=${sw} />`,
      ];
  return svg`
    <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="donut">
      ${rings}
      <text x=${cx} y=${cy - 4} text-anchor="middle"
        font-size="11" fill=${TEXT}>${centerTop}</text>
      <text x=${cx} y=${cy + 14} text-anchor="middle"
        font-size="15" font-weight="800" fill="var(--w-text)">${centerBottom}</text>
    </svg>
  `;
}

// --- area line (Card 8) ------------------------------------------------------

export interface XYPoint {
  x: number; // 0..1 normalized
  y: number; // raw value
}

/** Area chart with a gradient fill fading down + month ticks. */
export function areaLine(
  values: number[],
  color: string,
  ticks: string[],
  opts: { partialFrom?: number } = {},
): TemplateResult {
  const w = 320;
  const h = 170;
  const padL = 4;
  const padR = 4;
  const padT = 8;
  const padB = 22;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const gid = `w-area-${Math.random().toString(36).slice(2, 8)}`;
  const pts = values.map((v, i) => {
    const x = padL + (values.length > 1 ? (i / (values.length - 1)) * iw : 0);
    const y = padT + ih - ((v - min) / span) * ih;
    return { x, y };
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1]?.x ?? padL} ${padT + ih} L ${
    pts[0]?.x ?? padL
  } ${padT + ih} Z`;
  const divider =
    opts.partialFrom !== undefined && opts.partialFrom > 0
      ? svg`<line x1=${padL + opts.partialFrom * iw} y1=${padT}
          x2=${padL + opts.partialFrom * iw} y2=${padT + ih}
          stroke=${AXIS} stroke-width="1.5" stroke-dasharray="4 4" />`
      : "";
  return svg`
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="area chart">
      <defs>
        <linearGradient id=${gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color=${color} stop-opacity="0.28" />
          <stop offset="1" stop-color=${color} stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines(padL, padT, iw, ih, 4)}
      <path d=${area} fill=${`url(#${gid})`} />
      <path d=${line} fill="none" stroke=${color} stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round" />
      ${divider}
      ${xTicks(padL, iw, padT + ih + 14, ticks)}
    </svg>
  `;
}

// --- grouped income/expense bars + net line (Card 2) -------------------------

export interface TrendBar {
  income: number;
  expense: number;
  net: number;
}

export function incomeExpenseBars(
  bars: TrendBar[],
  ticks: string[],
  colors: { income: string; expense: string; net: string },
): TemplateResult {
  const w = 320;
  const h = 200;
  const padT = 10;
  const padB = 24;
  const padX = 6;
  const iw = w - padX * 2;
  const ih = h - padT - padB;
  const mid = padT + ih / 2;
  const maxAbs =
    Math.max(1, ...bars.map((b) => Math.max(b.income, b.expense, Math.abs(b.net)))) || 1;
  const step = bars.length ? iw / bars.length : iw;
  const bw = Math.min(20, step * 0.5);
  const scale = (v: number) => (v / maxAbs) * (ih / 2);
  const barsSvg = bars.map((b, i) => {
    const cx = padX + step * i + step / 2;
    const incH = scale(b.income);
    const expH = scale(b.expense);
    return svg`
      <rect x=${cx - bw / 2} y=${mid - incH} width=${bw} height=${incH}
        rx="3" fill=${colors.income} />
      <rect x=${cx - bw / 2} y=${mid} width=${bw} height=${expH}
        rx="3" fill=${colors.expense} />`;
  });
  const netPts = bars.map((b, i) => {
    const cx = padX + step * i + step / 2;
    const y = mid - scale(b.net);
    return { x: cx, y };
  });
  const netLine = smoothPath(netPts);
  return svg`
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="income expense bars">
      <line x1=${padX} y1=${mid} x2=${w - padX} y2=${mid}
        stroke=${AXIS} stroke-width="1" />
      ${barsSvg}
      <path d=${netLine} fill="none" stroke=${colors.net}
        stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      ${xTicks(padX, iw, h - 8, ticks)}
    </svg>
  `;
}

// --- stacked bars (Card 4 nature of spending) --------------------------------

export interface StackedBar {
  segments: { value: number; color: string }[];
}

export function stackedBars(
  bars: StackedBar[],
  ticks: string[],
): TemplateResult {
  const w = 320;
  const h = 190;
  const padT = 10;
  const padB = 24;
  const padX = 6;
  const iw = w - padX * 2;
  const ih = h - padT - padB;
  const totals = bars.map((b) => b.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, ...totals);
  const step = bars.length ? iw / bars.length : iw;
  const bw = Math.min(22, step * 0.55);
  const rects = bars.map((b, i) => {
    const cx = padX + step * i + step / 2;
    let y = padT + ih;
    return b.segments.map((seg) => {
      const segH = (seg.value / max) * ih;
      y -= segH;
      return svg`<rect x=${cx - bw / 2} y=${y} width=${bw} height=${segH}
        fill=${seg.color} />`;
    });
  });
  return svg`
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="stacked bars">
      ${gridLines(padX, padT, iw, ih, 4)}
      ${rects}
      ${xTicks(padX, iw, h - 8, ticks)}
    </svg>
  `;
}

// --- multi-line comparison (Card 10) -----------------------------------------

export interface NamedSeries {
  name: string;
  color: string;
  values: (number | null)[];
}

export function multiLine(series: NamedSeries[], ticks: string[]): TemplateResult {
  const w = 320;
  const h = 180;
  const padT = 10;
  const padB = 22;
  const padX = 6;
  const iw = w - padX * 2;
  const ih = h - padT - padB;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const paths = series.map((s) => {
    const pts = s.values
      .map((v, i) => {
        if (v === null) return null;
        const n = s.values.length > 1 ? i / (s.values.length - 1) : 0;
        return { x: padX + n * iw, y: padT + ih - ((v - min) / span) * ih };
      })
      .filter((p): p is { x: number; y: number } => p !== null);
    return svg`<path d=${smoothPath(pts)} fill="none" stroke=${s.color}
      stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
  });
  return svg`
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="comparison lines">
      ${gridLines(padX, padT, iw, ih, 4)}
      <line x1=${padX} y1=${padT + ih - ((0 - min) / span) * ih}
        x2=${w - padX} y2=${padT + ih - ((0 - min) / span) * ih}
        stroke=${AXIS} stroke-width="1" />
      ${paths}
      ${xTicks(padX, iw, h - 6, ticks)}
    </svg>
  `;
}

// --- shared helpers ----------------------------------------------------------

function gridLines(x: number, y: number, w: number, h: number, n: number) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const gy = y + (h / n) * i;
    return svg`<line x1=${x} y1=${gy} x2=${x + w} y2=${gy}
      stroke=${GRID} stroke-width="1" stroke-dasharray="3 4" />`;
  });
}

function xTicks(x: number, w: number, y: number, ticks: string[]) {
  if (!ticks.length) return "";
  return ticks.map((t, i) => {
    const tx = ticks.length > 1 ? x + (i / (ticks.length - 1)) * w : x;
    const anchor = i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle";
    return svg`<text x=${tx} y=${y} font-size="10" fill=${TEXT}
      text-anchor=${anchor}>${t}</text>`;
  });
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** A legend row (swatch + label), reused by several cards. */
export function legend(items: { label: string; color: string; extra?: string }[]): TemplateResult {
  return html`
    <div class="row" style="flex-wrap:wrap;gap:14px;justify-content:center;margin-top:10px">
      ${items.map(
        (it) => html`<span class="subline"
          ><span class="dot" style="background:${it.color}"></span>${it.label}${it.extra
            ? html` <span class="muted">${it.extra}</span>`
            : ""}</span
        >`,
      )}
    </div>
  `;
}
