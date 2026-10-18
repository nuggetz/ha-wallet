import { html, type TemplateResult } from "lit";

/** Reusable render fragments for the empty / loading / error states (§0.5). */

export function emptyState(message: string, icon = "mdi:inbox-outline"): TemplateResult {
  return html`
    <div class="state-empty">
      <ha-icon icon=${icon}></ha-icon>
      <div>${message}</div>
    </div>
  `;
}

/**
 * Error state. If we still have last-known content, show it with a stale badge
 * (rendered by the card in its head); this is the "never loaded" variant.
 */
export function errorState(
  message = "Can't reach Wallet API",
  hint = "The integration coordinator failed to update.",
): TemplateResult {
  return html`
    <div class="state-error">
      <ha-icon icon="mdi:cloud-alert"></ha-icon>
      <div><strong>${message}</strong></div>
      <div class="footnote">${hint}</div>
    </div>
  `;
}

export function staleBadge(): TemplateResult {
  return html`<span class="stale-badge"><ha-icon
      icon="mdi:history"
      style="--mdc-icon-size:13px"
    ></ha-icon>stale</span>`;
}

/** N shimmer lines. */
export function skeletonLines(count: number, width = "100%"): TemplateResult {
  return html`
    <div class="stack">
      ${Array.from(
        { length: count },
        () => html`<div class="sk sk-line" style="width:${width}"></div>`,
      )}
    </div>
  `;
}

/** A labeled skeleton bar (value + track), used by cash-flow/spending cards. */
export function skeletonBars(count: number): TemplateResult {
  return html`
    <div class="stack">
      <div class="sk sk-value"></div>
      ${Array.from(
        { length: count },
        () => html`
          <div class="col">
            <div class="sk sk-line" style="width:30%"></div>
            <div class="sk sk-bar"></div>
          </div>
        `,
      )}
    </div>
  `;
}

/** A skeleton block sized like a chart frame. */
export function skeletonChart(height = 180): TemplateResult {
  return html`<div class="sk sk-block" style="height:${height}px"></div>`;
}

/** N skeleton list rows (avatar + two lines + trailing value). */
export function skeletonRows(count: number): TemplateResult {
  return html`
    <div>
      ${Array.from(
        { length: count },
        () => html`
          <div class="list-row">
            <div class="sk avatar"></div>
            <div class="grow col">
              <div class="sk sk-line" style="width:55%"></div>
              <div class="sk sk-line" style="width:35%"></div>
            </div>
            <div class="sk sk-line" style="width:60px"></div>
          </div>
        `,
      )}
    </div>
  `;
}
