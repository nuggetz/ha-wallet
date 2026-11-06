import { ATTRIBUTION, DEVICE_NAME, DOMAIN, ENTITY_PREFIX, KEY, PREFIX } from "../const";
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

/** Marker every built entity id contains (device name slug), wherever HA put it. */
const ID_MARKER = ENTITY_PREFIX.replace(/^sensor\./, "");

/**
 * Key of a wallet entity id: the part after `wallet_by_budgetbakers_`, or null.
 * HA can put text before the device slug (e.g. an area or a renamed device:
 * `sensor.sistema_wallet_by_budgetbakers_account_cash`), so the marker is
 * searched anywhere in the id, not only right after `sensor.`.
 */
export function entityKey(id: string): string | null {
  const i = id.indexOf(ID_MARKER);
  return i < 0 ? null : id.slice(i + ID_MARKER.length);
}

/** Entity ids belonging to the ha_wallet integration (registry-based when possible). */
export function walletEntityIds(hass: HomeAssistant): string[] {
  const ids = new Set<string>();

  // 1. Registry path: entities whose platform is ha_wallet, or that sit on the
  //    integration's device. Survives entity and device renames.
  const deviceIds = new Set<string>();
  if (hass.devices) {
    for (const dev of Object.values(hass.devices)) {
      const names = [dev.name_by_user, dev.name].filter(Boolean) as string[];
      if (names.some((n) => n.includes(DEVICE_NAME))) deviceIds.add(dev.id);
    }
  }
  if (hass.entities) {
    for (const ent of Object.values(hass.entities)) {
      if (
        ent.platform === DOMAIN ||
        (ent.device_id && deviceIds.has(ent.device_id))
      ) {
        if (hass.states[ent.entity_id]) ids.add(ent.entity_id);
      }
    }
  }

  // 2. Fallback: the device slug anywhere in the id, or the integration's attribution.
  if (!ids.size) {
    for (const [id, st] of Object.entries(hass.states)) {
      if (!id.startsWith("sensor.")) continue;
      if (id.includes(ID_MARKER) || st.attributes?.attribution === ATTRIBUTION) {
        ids.add(id);
      }
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
  // Exact key among the integration's entities (any text before the device slug).
  const ids = walletEntityIds(hass);
  for (const id of ids) {
    if (entityKey(id) === key && hass.states[id]) return hass.states[id];
  }
  // Match by entity-id suffix (entity renamed but key kept at the end).
  const suffix = `_${key}`;
  for (const id of ids) {
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

/**
 * Attribute that only the per-item sensors of a prefix carry. Used when the
 * entity id does not reveal the key (entity renamed by the user).
 */
const PREFIX_ATTR: Record<string, string> = {
  [PREFIX.account]: "account_id",
  [PREFIX.balance]: "account_ids",
  [PREFIX.budget]: "budget_id",
};

/** All sensors whose key starts with a dynamic prefix (account_, balance_, …). */
export function findByPrefix(hass: HomeAssistant, prefix: string): HassEntity[] {
  const attr = PREFIX_ATTR[prefix];
  const out: HassEntity[] = [];
  for (const id of walletEntityIds(hass)) {
    const st = hass.states[id];
    if (!st) continue;
    const key = entityKey(id);
    const byKey = key !== null && key.startsWith(prefix);
    const byAttr = key === null && attr !== undefined && attr in st.attributes;
    if (byKey || byAttr) out.push(st);
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
