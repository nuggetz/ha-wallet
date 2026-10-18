import { DEVICE_NAME, DOMAIN, ENTITY_PREFIX, KEY, PREFIX } from "../const";
import type { HassEntity, HomeAssistant } from "../types";

/**
 * Entity discovery for the `ha_wallet` device.
 *
 * Real ids are `sensor.wallet_by_budgetbakers_<key>` but the card never
 * hardcodes a full slug: it resolves the device's entities from the HA entity
 * registry when available, and falls back to matching the documented id prefix.
 * Dynamic sensors (accounts, per-currency balances, budgets, goals) are
 * enumerated by their key prefix (§5.2 / §5.3).
 */

/** Entity ids belonging to the ha_wallet device (registry-based when possible). */
export function walletEntityIds(hass: HomeAssistant): string[] {
  const ids = new Set<string>();

  // 1. Registry path: find the device(s) named like the integration, then its
  //    entities. Most robust — survives entity renames.
  const deviceIds = new Set<string>();
  if (hass.devices) {
    for (const dev of Object.values(hass.devices)) {
      const name = dev.name_by_user || dev.name || "";
      if (name === DEVICE_NAME) deviceIds.add(dev.id);
    }
  }
  if (hass.entities && deviceIds.size) {
    for (const ent of Object.values(hass.entities)) {
      if (ent.device_id && deviceIds.has(ent.device_id)) ids.add(ent.entity_id);
    }
  }

  // 2. Fallback: match the documented id prefix directly against hass.states.
  if (!ids.size) {
    for (const id of Object.keys(hass.states)) {
      if (id.startsWith(ENTITY_PREFIX)) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Resolve one singleton sensor by its entity-id suffix, honoring an explicit
 * override. `attrMatch` is a robustness net: if the slug lookup fails (entity
 * renamed, or the name slug differs from what we guessed / was localized), the
 * sensor is identified by a set of attributes only it carries (e.g. the
 * cardinality sensor's must/need/want).
 */
export function findSingleton(
  hass: HomeAssistant,
  key: string,
  override?: string,
  attrMatch?: string[],
): HassEntity | undefined {
  if (override && hass.states[override]) return hass.states[override];
  const direct = hass.states[ENTITY_PREFIX + key];
  if (direct) return direct;
  // Match by entity-id suffix among the device's entities.
  const suffix = `_${key}`;
  for (const id of walletEntityIds(hass)) {
    if (id.endsWith(suffix) && hass.states[id]) return hass.states[id];
  }
  // Attribute-based fallback: robust to naming / localization.
  if (attrMatch?.length) {
    for (const id of walletEntityIds(hass)) {
      const st = hass.states[id];
      if (st && attrMatch.every((a) => a in st.attributes)) return st;
    }
  }
  return undefined;
}

/** All sensors whose key starts with a dynamic prefix (account_, balance_, …). */
export function findByPrefix(hass: HomeAssistant, prefix: string): HassEntity[] {
  const out: HassEntity[] = [];
  const full = ENTITY_PREFIX + prefix;
  const seen = new Set<string>();
  for (const id of Object.keys(hass.states)) {
    if (id.startsWith(full) && !seen.has(id)) {
      seen.add(id);
      out.push(hass.states[id]);
    }
  }
  // Registry-discovered ids may differ from the prefix convention (renames);
  // include device sensors that carry the matching attributes as a safety net.
  if (!out.length) {
    for (const id of walletEntityIds(hass)) {
      const key = id.replace(ENTITY_PREFIX, "");
      if (key.startsWith(prefix) && !seen.has(id)) {
        seen.add(id);
        out.push(hass.states[id]);
      }
    }
  }
  return out;
}

export const singleton = {
  cashFlow: (h: HomeAssistant, o?: string) => findSingleton(h, KEY.cashFlow, o),
  spending: (h: HomeAssistant, o?: string) => findSingleton(h, KEY.spending, o),
  spendingByCardinality: (h: HomeAssistant, o?: string) =>
    findSingleton(h, KEY.spendingByCardinality, o, ["must", "need", "want"]),
  lastRecords: (h: HomeAssistant, o?: string) =>
    findSingleton(h, KEY.lastRecords, o),
  creditUtilization: (h: HomeAssistant, o?: string) =>
    findSingleton(h, KEY.creditUtilization, o),
  apiUsage: (h: HomeAssistant, o?: string) => findSingleton(h, KEY.apiUsage, o),
  standingOrders: (h: HomeAssistant, o?: string) =>
    findSingleton(h, KEY.standingOrders, o),
  recordRules: (h: HomeAssistant, o?: string) =>
    findSingleton(h, KEY.recordRules, o),
  categories: (h: HomeAssistant, o?: string) =>
    findSingleton(h, KEY.categories, o),
  labels: (h: HomeAssistant, o?: string) => findSingleton(h, KEY.labels, o),
};

export const byPrefix = {
  accounts: (h: HomeAssistant) => findByPrefix(h, PREFIX.account),
  balances: (h: HomeAssistant) => findByPrefix(h, PREFIX.balance),
  budgets: (h: HomeAssistant) => findByPrefix(h, PREFIX.budget),
  goals: (h: HomeAssistant) => findByPrefix(h, PREFIX.goal),
};

/** Does the integration expose a given service? (feature-check, e.g. import_history) */
export function hasService(hass: HomeAssistant, service: string): boolean {
  return Boolean(hass.services?.[DOMAIN]?.[service]);
}
