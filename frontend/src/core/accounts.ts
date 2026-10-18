import { byPrefix, singleton } from "./discovery";
import { isUnavailable } from "./entity-state";
import type {
  HomeAssistant,
  WalletCategory,
  WalletLabel,
} from "../types";

/** Flattened account info the write cards need (id, name, sync, currency). */
export interface AccountInfo {
  entity_id: string;
  id: string;
  name: string;
  type?: string;
  currency?: string;
  bankSynced: boolean;
  balance: number | null;
}

/** Enumerate accounts from the per-account sensors, reading their attributes. */
export function listAccounts(hass: HomeAssistant): AccountInfo[] {
  return byPrefix
    .accounts(hass)
    .filter((e) => !isUnavailable(e))
    .map((e) => {
      const a = e.attributes;
      const fn = a.friendly_name as string | undefined;
      const name = fn ? fn.replace(/^.*?Account\s+/i, "").trim() || fn : e.entity_id;
      return {
        entity_id: e.entity_id,
        id: String(a.account_id ?? ""),
        name,
        type: a.account_type as string | undefined,
        currency: (a.currency as string) ?? (a.unit_of_measurement as string),
        bankSynced: Boolean(a.bank_synced),
        balance: numeric(e.state),
      };
    })
    .filter((a) => a.id);
}

/** Categories list (id discovery) from the diagnostic categories sensor. */
export function listCategories(hass: HomeAssistant): WalletCategory[] {
  const c = singleton.categories(hass);
  return (c?.attributes.categories as WalletCategory[]) ?? [];
}

/** Labels list from the diagnostic labels sensor. */
export function listLabels(hass: HomeAssistant): WalletLabel[] {
  const c = singleton.labels(hass);
  return (c?.attributes.labels as WalletLabel[]) ?? [];
}

function numeric(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
