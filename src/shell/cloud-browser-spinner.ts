import type { CloudBrowserTransportState } from "../lib/browser";

export function cloudBrowserShouldShowViewportSpinner(
  transportState: CloudBrowserTransportState,
  hasCanvasFrame: boolean,
  liveRequested: boolean,
): boolean {
  if (!liveRequested || transportState === "streaming") return false;
  if (transportState === "failed" || transportState === "closed") return false;
  return !hasCanvasFrame;
}
