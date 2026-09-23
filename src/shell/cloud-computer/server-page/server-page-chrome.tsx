"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ServerPageCard } from "./href";

export type ServerPageChrome = {
  activeCard: ServerPageCard;
  /** The row directly under the page header that holds the active card's program strip. */
  stripSlot: HTMLElement | null;
};

export const ServerPageChromeContext = createContext<ServerPageChrome | null>(null);

/** `null` when a card renders outside `ServerPage` (tests, legacy hosts). */
export function useServerPageChrome(): ServerPageChrome | null {
  return useContext(ServerPageChromeContext);
}

/**
 * Puts the card's strip into the page row while that card is active, renders
 * nothing while another card is active, and falls back to inline rendering
 * when there is no `ServerPage` around.
 */
export function ServerPageStripPortal({
  card,
  children,
}: {
  card: ServerPageCard;
  children: ReactNode;
}) {
  const chrome = useServerPageChrome();
  if (!chrome) return <>{children}</>;
  if (chrome.activeCard !== card || !chrome.stripSlot) return null;
  return createPortal(children, chrome.stripSlot);
}
