// Opening a quote card's snapshot in the right panel (session / sites wave 2026-11-21, contract §1 / §2.4).
// The shared right panel (`result-canvas-view-state.ts`) listens on every page that hosts it and shows the
// messages read-only, with no composer.
import type { ImMessage } from "../../lib/im/types";

export const OPEN_QUOTE_PANEL_EVENT = "oceanleo:open-quote-panel";

/** detail of OPEN_QUOTE_PANEL_EVENT: the message whose `card.type === "quote"`. */
export interface OpenQuotePanelDetail {
  message: ImMessage;
}

export function openQuotePanel(message: ImMessage): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenQuotePanelDetail>(OPEN_QUOTE_PANEL_EVENT, { detail: { message } }));
}
