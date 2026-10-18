/** Minimal Home Assistant typings used by the cards. */

export interface HassEntityAttributes {
  friendly_name?: string;
  unit_of_measurement?: string;
  device_class?: string;
  icon?: string;
  [key: string]: unknown;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: HassEntityAttributes;
  last_changed: string;
  last_updated: string;
}

export interface HassServices {
  [domain: string]: { [service: string]: unknown };
}

export interface HassConfig {
  time_zone?: string;
  currency?: string;
  [key: string]: unknown;
}

export interface HassLocale {
  language: string;
  number_format?: string;
  time_format?: string;
  [key: string]: unknown;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  services: HassServices;
  config: HassConfig;
  locale: HassLocale;
  language: string;
  themes: { darkMode?: boolean; [key: string]: unknown };
  entities?: Record<string, { device_id?: string; entity_id: string }>;
  devices?: Record<string, { id: string; name?: string; name_by_user?: string }>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ) => Promise<unknown>;
  callWS: <T>(msg: Record<string, unknown>) => Promise<T>;
  formatEntityState?: (entity: HassEntity) => string;
}

/** Base Lovelace card config; individual cards extend this. */
export interface WalletCardConfig {
  type: string;
  /** Explicit entity binding; when absent the card auto-discovers from the device. */
  entity?: string;
  title?: string;
  /** Optional period label override ("this_year" | "this_month" | "custom"). */
  period?: string;
}

/** Lovelace custom-card interface. */
export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: WalletCardConfig): void;
  getCardSize(): number;
}

/** A single record from `…_last_records` attr `records`. */
export interface WalletRecord {
  id: string;
  amount: number;
  category?: string;
  account?: string;
  date?: string;
  note?: string;
  bank_synced?: boolean;
}

/** A category entry from `…_categories` attr `categories`. */
export interface WalletCategory {
  id: string;
  name: string;
  custom?: boolean;
  parent_id?: string | null;
  cardinality?: string | null;
  color?: string | null;
}

/** A label entry from `…_labels` attr `labels`. */
export interface WalletLabel {
  id: string;
  name: string;
  archived?: boolean;
  color?: string | null;
}

/** A standing order from `…_standing_orders` attr `orders`. */
export interface WalletStandingOrder {
  id: string;
  name?: string;
  amount?: number;
  currency?: string;
  type?: string;
  due_date?: string;
  payment_type?: string;
  account_id?: string;
}

/** A record rule from `…_record_rules` attr `rules`. */
export interface WalletRecordRule {
  id: string;
  name?: string;
  keywords?: string[] | string;
  category?: string;
}

/** window global registry used to advertise cards to the Lovelace UI. */
export interface CustomCardRegistration {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards?: CustomCardRegistration[];
  }
}
