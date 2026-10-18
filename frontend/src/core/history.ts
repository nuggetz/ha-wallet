import type { HomeAssistant } from "../types";

/**
 * Long-term-statistics access for the trend cards (Cash Flow Trend, Balance
 * Trend, Period to Period). Trends read HA's recorder statistics, never the
 * Wallet API per poll (contract). Fresh installs have data only from install
 * date forward — cards render the "collecting from install date" affordance.
 */

export interface StatPoint {
  start: number; // epoch ms
  end: number;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  sum?: number | null;
  state?: number | null;
}

export type StatsMap = Record<string, StatPoint[]>;

export type StatPeriod = "hour" | "day" | "week" | "month";

interface RawStat {
  start: string | number;
  end: string | number;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  sum?: number | null;
  state?: number | null;
}

/**
 * Fetch recorder statistics for one or more statistic ids (entity ids).
 * Returns a map id → ordered points. Empty on any failure so callers fall back
 * to their empty/insufficient-history state.
 */
export async function fetchStatistics(
  hass: HomeAssistant,
  ids: string[],
  start: Date,
  end: Date = new Date(),
  period: StatPeriod = "month",
): Promise<StatsMap> {
  if (!hass?.callWS || !ids.length) return {};
  try {
    const raw = await hass.callWS<Record<string, RawStat[]>>({
      type: "recorder/statistics_during_period",
      statistic_ids: ids,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      period,
      types: ["mean", "min", "max", "sum", "state"],
    });
    const out: StatsMap = {};
    for (const id of ids) {
      const rows = raw?.[id] ?? [];
      out[id] = rows.map((r) => ({
        start: toEpoch(r.start),
        end: toEpoch(r.end),
        mean: r.mean ?? null,
        min: r.min ?? null,
        max: r.max ?? null,
        sum: r.sum ?? null,
        state: r.state ?? null,
      }));
    }
    return out;
  } catch {
    return {};
  }
}

function toEpoch(v: string | number): number {
  return typeof v === "number" ? v : new Date(v).getTime();
}

/** Best available representative value for a point (state → mean → max). */
export function pointValue(p: StatPoint): number | null {
  if (p.state !== null && p.state !== undefined) return p.state;
  if (p.mean !== null && p.mean !== undefined) return p.mean;
  if (p.max !== null && p.max !== undefined) return p.max;
  return null;
}

/**
 * Whether the statistics cover the requested window or only start mid-way
 * (fresh install). Returns the earliest datum epoch, or null if no data.
 */
export function earliestPoint(map: StatsMap): number | null {
  let earliest: number | null = null;
  for (const points of Object.values(map)) {
    if (points.length) {
      const first = points[0].start;
      earliest = earliest === null ? first : Math.min(earliest, first);
    }
  }
  return earliest;
}

/** Short month tick labels for the current year window. */
export function monthTicks(lang: string): string[] {
  const fmt = (() => {
    try {
      return new Intl.DateTimeFormat(lang, { month: "short" });
    } catch {
      return null;
    }
  })();
  const names: string[] = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(2020, m, 1);
    names.push(fmt ? fmt.format(d) : d.toLocaleString("en", { month: "short" }));
  }
  return names;
}
