import { PDF_CARRIER_CONSTANTS } from "./pdf-manifest";

const MAX_PDF_HISTORY_BYTES = 384 * 1024 * 1024;
const MAX_PDF_HISTORY_ENTRIES = 20;

/** §2.1 reader palette. Values are normative; do not retune for contrast. */
export const PDF_READER_PALETTE = {
  "reader.canvas": "#525659",
  "reader.page": "#FFFFFF",
  "reader.chrome": "#1F2328",
  "reader.accent": "#1F6FEB",
  "annot.highlight": "#FFD43B",
  "annot.text.marker": "#E5484D",
  "annot.selected": "#0969DA",
} as const;

/** §2.2 layout, in px. */
export const PDF_READER_LAYOUT = {
  thumbnailRailWidth: PDF_CARRIER_CONSTANTS.C23_thumbnailRailWidthPx,
  thumbnailPageWidth: PDF_CARRIER_CONSTANTS.C24_thumbnailPageWidthPx,
  thumbnailGap: 12,
  toolbarHeight: PDF_CARRIER_CONSTANTS.C25_toolbarHeightPx,
  pageGap: 16,
  pageShadowSpread: 4,
  minimumHitTarget: PDF_CARRIER_CONSTANTS.C26_minimumHitTargetPx,
} as const;

/** §2.3 / C20–C22 — nine stops, 25 % to 400 %. */
export const PDF_ZOOM_STOPS = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const;
export const PDF_MIN_ZOOM = PDF_CARRIER_CONSTANTS.C20_minimumZoomPercent;
export const PDF_MAX_ZOOM = PDF_CARRIER_CONSTANTS.C21_maximumZoomPercent;

export function clampPdfZoom(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, Math.round(value)));
}

/** Step to the neighbouring stop rather than adding a fixed percentage. */
export function nextPdfZoomStop(current: number, direction: 1 | -1): number {
  const stops = PDF_ZOOM_STOPS;
  const value = clampPdfZoom(current);
  if (direction > 0) {
    return stops.find((stop) => stop > value) ?? PDF_MAX_ZOOM;
  }
  const lower = stops.filter((stop) => stop < value);
  return lower.length ? lower[lower.length - 1] : PDF_MIN_ZOOM;
}

/** §2.3 — fit-width and fit-page are computed stops, still clamped to 25–400. */
export function fitPdfZoom(
  mode: "width" | "page",
  container: { width: number; height: number },
  page: { width: number; height: number },
): number {
  if (page.width <= 0 || page.height <= 0) return 100;
  const widthRatio = container.width / page.width;
  const ratio =
    mode === "width"
      ? widthRatio
      : Math.min(widthRatio, container.height / Math.max(1, page.height));
  return clampPdfZoom(ratio * 100);
}

/**
 * §3.3 — the single viewport→visual conversion. The visual space is the page
 * frame normalised to [0,1], and the frame is what zoom scales, so a pointer
 * landing on the same glyph yields the same pair at 25 % and at 400 %. Call
 * sites MUST use this rather than dividing by a bounding box themselves.
 */
export function viewportPointToVisual(
  client: { x: number; y: number },
  bounds: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const width = Math.max(Number.EPSILON, bounds.width);
  const height = Math.max(Number.EPSILON, bounds.height);
  return {
    x: Math.max(0, Math.min(1, (client.x - bounds.left) / width)),
    y: Math.max(0, Math.min(1, (client.y - bounds.top) / height)),
  };
}

export interface PdfSnapshot {
  bytes: Uint8Array;
  pageNumber: number;
  pageCount: number;
}

export function appendPdfHistory(
  stack: PdfSnapshot[],
  snapshot: PdfSnapshot,
  other: PdfSnapshot[] = [],
): PdfSnapshot[] {
  if (snapshot.bytes.byteLength > MAX_PDF_HISTORY_BYTES) return [];
  const next = [...stack, snapshot].slice(-MAX_PDF_HISTORY_ENTRIES);
  while (
    next.length > 0 &&
    [...next, ...other].reduce(
      (sum, value) => sum + value.bytes.byteLength,
      0,
    ) > MAX_PDF_HISTORY_BYTES
  ) {
    next.shift();
  }
  return next;
}

export function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function pdfErrorMessage(caught: unknown, fallback: string): string {
  if (
    typeof DOMException !== "undefined" &&
    caught instanceof DOMException &&
    caught.name === "AbortError"
  ) {
    return "";
  }
  return caught instanceof Error ? caught.message : fallback;
}

export function pdfFileStem(title: string): string {
  const clean = title
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
  return clean || "oceanleo-pdf";
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
