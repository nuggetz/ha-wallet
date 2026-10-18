import { css } from "lit";

/**
 * Shared card styling. Surfaces and text bind to Home Assistant theme
 * variables (§0.1) so cards match light/dark with no code change; only brand
 * and semantic colors are constant (§0.2). Fallbacks keep the editor preview
 * legible outside a themed dashboard.
 */
export const sharedStyles = css`
  :host {
    /* surfaces & text — HA vars */
    --w-surface: var(--ha-card-background, var(--card-background-color, #fff));
    --w-page-bg: var(--primary-background-color, #f4f5f7);
    --w-text: var(--primary-text-color, #14181f);
    --w-muted: var(--secondary-text-color, #6b7280);
    --w-line: var(--divider-color, rgba(0, 0, 0, 0.12));
    --w-chip: var(--secondary-background-color, rgba(0, 0, 0, 0.05));
    --w-track: var(--divider-color, rgba(0, 0, 0, 0.1));
    --w-radius: var(--ha-card-border-radius, 18px);
    --w-shadow: var(
      --ha-card-box-shadow,
      0 2px 8px rgba(0, 0, 0, 0.08)
    );

    /* brand & semantic — constant */
    --w-c-housing: #f7a81b;
    --w-c-shopping: #4ec3f7;
    --w-c-food: #f5433a;
    --w-c-life: #8bc34a;
    --w-c-comm: #5c6bc0;
    --w-c-vehicle: #af52de;
    --w-income: #34c759;
    --w-expense: #f5433a;
    --w-transfer: #4c8dff;
    --w-up: #1f9d4d;
    --w-up-bg: rgba(52, 199, 89, 0.15);
    --w-down: #e0362b;
    --w-down-bg: rgba(245, 67, 58, 0.14);
    --w-brand-amber: #ff7a1a;
    --w-brand-acid: #c6ff3a;

    display: block;
  }

  ha-card {
    background: var(--w-surface);
    border: 1px solid var(--w-line);
    border-radius: var(--w-radius);
    box-shadow: var(--w-shadow);
    padding: 20px 22px;
    color: var(--w-text);
    box-sizing: border-box;
    overflow: hidden;
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .title {
    font-weight: 800;
    font-size: 20px;
    letter-spacing: -0.01em;
    line-height: 1.1;
    margin: 0;
    color: var(--w-text);
  }

  .svc-caption {
    font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 11px;
    color: var(--w-muted);
    opacity: 0.9;
    white-space: nowrap;
  }

  .caption,
  .label {
    font-weight: 600;
    font-size: 12px;
    color: var(--w-muted);
  }

  .caption-up {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .big-value {
    font-weight: 800;
    font-size: 26px;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .between {
    justify-content: space-between;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .income {
    color: var(--w-income);
  }
  .expense {
    color: var(--w-expense);
  }
  .transfer {
    color: var(--w-transfer);
  }

  /* VS-previous chip */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    font-size: 13px;
    padding: 3px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .chip .arrow {
    font-size: 12px;
    line-height: 1;
  }

  /* progress bars */
  .bar-track {
    position: relative;
    width: 100%;
    height: 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--w-track) 55%, transparent);
    overflow: hidden;
  }
  .bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  /* segmented control (§2) */
  .segmented {
    display: inline-flex;
    background: var(--w-chip);
    border-radius: 11px;
    padding: 3px;
    gap: 2px;
  }
  .segmented button {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--w-muted);
    font: inherit;
    font-weight: 600;
    font-size: 13px;
    padding: 7px 14px;
    border-radius: 9px;
    cursor: pointer;
    min-height: 34px;
  }
  .segmented button.active {
    background: var(--w-surface);
    color: var(--w-text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
  }
  .segmented button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* chips / pills */
  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    min-height: 40px;
    border-radius: 12px;
    border: 1.5px solid var(--w-line);
    background: var(--w-chip);
    color: var(--w-text);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }

  /* inputs */
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field label {
    font-size: 12px;
    font-weight: 600;
    color: var(--w-muted);
  }
  .field input,
  .field select,
  .field textarea {
    font: inherit;
    padding: 9px 11px;
    border-radius: 10px;
    border: 1px solid var(--w-line);
    background: var(--w-chip);
    color: var(--w-text);
    box-sizing: border-box;
    min-height: 40px;
  }

  /* primary buttons (color set inline per operation) */
  .btn {
    appearance: none;
    border: 0;
    border-radius: 12px;
    padding: 12px 16px;
    font: inherit;
    font-weight: 700;
    font-size: 15px;
    color: #fff;
    cursor: pointer;
    min-height: 48px;
    width: 100%;
  }
  .btn[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* list rows */
  .list-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
  }
  .list-row + .list-row {
    border-top: 1px solid var(--w-line);
  }
  .avatar {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    display: grid;
    place-items: center;
  }
  .avatar.round {
    border-radius: 999px;
  }
  .grow {
    flex: 1 1 auto;
    min-width: 0;
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .subline {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--w-muted);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex: 0 0 auto;
  }

  /* --- state: empty --- */
  .state-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: var(--w-muted);
    padding: 26px 12px;
  }
  .state-empty ha-icon {
    --mdc-icon-size: 34px;
    opacity: 0.6;
  }
  .dashed {
    border: 1.5px dashed var(--w-line);
    border-radius: 12px;
    padding: 16px;
    color: var(--w-muted);
    font-size: 13px;
    text-align: center;
  }

  /* --- state: error --- */
  .stale-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--w-down);
    background: var(--w-down-bg);
    padding: 2px 7px;
    border-radius: 999px;
  }
  .state-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    color: var(--w-muted);
    padding: 22px 12px;
  }
  .state-error ha-icon {
    --mdc-icon-size: 32px;
    color: var(--w-down);
  }

  /* --- state: loading (skeleton) --- */
  @keyframes shimmer {
    0% {
      background-position: -360px 0;
    }
    100% {
      background-position: 360px 0;
    }
  }
  .sk {
    border-radius: 8px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--w-track) 60%, transparent) 25%,
      var(--w-chip) 37%,
      color-mix(in srgb, var(--w-track) 60%, transparent) 63%
    );
    background-size: 720px 100%;
    animation: shimmer 1.3s infinite linear;
  }
  .sk-line {
    height: 12px;
  }
  .sk-title {
    height: 22px;
    width: 45%;
  }
  .sk-value {
    height: 28px;
    width: 40%;
  }
  .sk-bar {
    height: 12px;
    width: 100%;
  }
  .sk-block {
    width: 100%;
  }

  /* overlays (quick-add / action feedback) */
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    padding: 24px;
    background: color-mix(in srgb, var(--w-surface) 92%, transparent);
    backdrop-filter: blur(2px);
    border-radius: var(--w-radius);
    z-index: 5;
  }
  .overlay ha-icon {
    --mdc-icon-size: 44px;
  }
  .overlay.ok ha-icon {
    color: var(--w-income);
  }
  .overlay.err ha-icon {
    color: var(--w-expense);
  }
  .relative {
    position: relative;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .muted {
    color: var(--w-muted);
  }
  .footnote {
    font-size: 11px;
    color: var(--w-muted);
    margin-top: 10px;
  }
`;
