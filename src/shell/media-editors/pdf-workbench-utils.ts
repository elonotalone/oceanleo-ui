const MAX_PDF_HISTORY_BYTES = 384 * 1024 * 1024;
const MAX_PDF_HISTORY_ENTRIES = 20;

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
