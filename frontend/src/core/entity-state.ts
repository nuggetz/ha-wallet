import type { HassEntity } from "../types";

/**
 * The four states every card renders (CARD-BUILD-SPEC §0.5):
 *   loading — entity unavailable/unknown on first poll or restart
 *   error   — was available, now unavailable (or coordinator failed)
 *   empty   — available but the payload is empty
 *   default — available with data
 *
 * "empty" is card-specific (empty map, [] list, no dynamic sensors,
 * credit_utilization unknown); each card decides it, so this helper only
 * classifies the generic availability lifecycle.
 */
export type CardState = "loading" | "error" | "empty" | "default";

const UNAVAILABLE = new Set(["unavailable", "unknown", "none", "", null as unknown as string]);

export function isUnavailable(entity?: HassEntity | null): boolean {
  return !entity || UNAVAILABLE.has(entity.state);
}

/**
 * Generic availability classification for a required entity.
 * Returns "loading" the first time (no prior good value seen), "error" once a
 * value has been seen and the entity later goes unavailable, else "default".
 * `seenGood` should be tracked by the card across renders.
 */
export function availability(
  entity: HassEntity | undefined | null,
  seenGood: boolean,
): Extract<CardState, "loading" | "error" | "default"> {
  if (isUnavailable(entity)) return seenGood ? "error" : "loading";
  return "default";
}

/** Convenience: has this entity ever produced a usable value? */
export function hasValue(entity?: HassEntity | null): boolean {
  return !isUnavailable(entity);
}
