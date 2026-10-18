/**
 * Entry point of the card bundle served by the ha_wallet integration.
 *
 * The standalone ha-wallet-card plugin defines the same custom elements. If
 * both are loaded, the second customElements.define() throws, so when the
 * cards already exist this bundle steps aside instead of breaking them.
 */

if (customElements.get("wallet-cash-flow-card")) {
  // eslint-disable-next-line no-console
  console.warn(
    "ha-wallet: Wallet cards are already defined, most likely by the standalone " +
      "ha-wallet-card plugin. Remove that plugin and its dashboard resource: the " +
      "cards now ship with the integration.",
  );
} else {
  void import("./cards");
}
