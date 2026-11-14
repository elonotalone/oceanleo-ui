import type { PdfAnnotationLike } from "./pdf-viewer-bridge";

export const PDF_WORKING_COPY_SCHEMA = "oceanleo.pdf-working-document.v1";
export type PdfPageOperation =
  | { type: "rotate"; pageIndex: number; degrees: number }
  | { type: "delete"; pageIndex: number }
  | { type: "move"; fromIndex: number; toIndex: number };
export interface PdfWorkingAnnotation {
  annotation: PdfAnnotationLike;
  media?: { url: string; mimeType: string };
}
export interface PdfWorkingState {
  annotations: PdfWorkingAnnotation[];
  formValues: Record<string, string>;
}
export interface PdfWorkingCopy extends PdfWorkingState {
  version: 1;
  source: { url: string; blank: boolean };
  operations: PdfPageOperation[];
}

/** Dates become ISO strings. Binary data belongs in referenced media, never this document. */
export function pdfWorkingJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function decodePdfRecovery(payload: unknown): PdfWorkingCopy | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const doc = payload as PdfWorkingCopy;
  if (doc.version !== 1 || !doc.source || typeof doc.source.url !== "string" ||
      typeof doc.source.blank !== "boolean" || (!doc.source.blank && !/^https?:\/\//i.test(doc.source.url)) ||
      !Array.isArray(doc.operations) || !Array.isArray(doc.annotations) ||
      !doc.formValues || typeof doc.formValues !== "object") return null;
  const index = (n: number) => Number.isInteger(n) && n >= 0;
  if (!doc.operations.every((op) => op && (op.type === "move"
    ? index(op.fromIndex) && index(op.toIndex)
    : (op.type === "delete" || op.type === "rotate") && index(op.pageIndex) &&
      (op.type !== "rotate" || Number.isFinite(op.degrees) && op.degrees % 90 === 0)))) return null;
  if (!doc.annotations.every((entry) => entry?.annotation && typeof entry.annotation.id === "string" &&
    index(entry.annotation.pageIndex) && Number.isInteger(entry.annotation.type) && entry.annotation.rect &&
    (!entry.media || /^https?:\/\//i.test(entry.media.url)))) return null;
  if (!Object.values(doc.formValues).every((value) => typeof value === "string")) return null;
  try { return pdfWorkingJson(doc); } catch { return null; }
}

export function pdfLiveAnnotation(annotation: PdfAnnotationLike): PdfAnnotationLike {
  const next = { ...annotation };
  for (const field of ["created", "modified"]) {
    if (typeof next[field] === "string") next[field] = new Date(next[field] as string);
  }
  return next;
}
