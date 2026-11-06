/**
 * Snapshot and restore a transcript position while an older page is prepended.
 * Browsers otherwise apply their own overflow anchoring, which races the page's
 * render and can move the reader twice.
 */
export type OlderScrollAnchorSnapshot = {
  scrollTop: number;
  scrollHeight: number;
  /** Updated while the reader keeps scrolling during the network request. */
  currentScrollTop?: number;
};

export function restoreOlderScrollAnchor(
  element: Pick<HTMLElement, "scrollTop" | "scrollHeight">,
  anchor: OlderScrollAnchorSnapshot,
): number {
  const delta = element.scrollHeight - anchor.scrollHeight;
  element.scrollTop = (anchor.currentScrollTop ?? anchor.scrollTop) + delta;
  return delta;
}
