import { pdfMediaReference, type PdfMediaReference, type PdfSourceReference } from "./pdf-source-reference";
import type { PdfAnnotationLike } from "./pdf-viewer-bridge";

export const PDF_WORKING_COPY_SCHEMA = "oceanleo.pdf-working-document.v1";
export type PdfPageOperation =
  | { type: "rotate"; pageIndex: number; degrees: number }
  | { type: "delete"; pageIndex: number }
  | { type: "move"; fromIndex: number; toIndex: number };
export interface PdfWorkingAnnotation {
  annotation: PdfAnnotationLike;
  media?: PdfMediaReference & { mimeType: string };
}
export interface PdfWorkingState {
  annotations: PdfWorkingAnnotation[];
  formValues: Record<string, string>;
}
export interface PdfWorkingCopy extends PdfWorkingState {
  version: 1;
  source: PdfSourceReference;
  operations: PdfPageOperation[];
  /** Number of page operations already reflected in the annotation coordinate space. */
  annotationOperationCount?: number;
}

/** Dates become ISO strings. Binary data belongs in referenced media, never this document. */
export function pdfWorkingJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function decodePdfRecovery(payload: unknown): PdfWorkingCopy | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const doc = payload as PdfWorkingCopy;
  const mediaValid = (ref: PdfMediaReference) => Boolean(ref && (ref.artifactId && ref.revisionId || typeof ref.url === "string" && /^https?:\/\//i.test(ref.url)));
  if (doc.version !== 1 || !doc.source ||
      typeof doc.source.blank !== "boolean" || (!doc.source.blank && !mediaValid(doc.source)) ||
      !Array.isArray(doc.operations) || !Array.isArray(doc.annotations) ||
      !doc.formValues || typeof doc.formValues !== "object") return null;
  if (doc.annotationOperationCount !== undefined && (!Number.isInteger(doc.annotationOperationCount) || doc.annotationOperationCount < 0 || doc.annotationOperationCount > doc.operations.length)) return null;
  const index = (n: number) => Number.isInteger(n) && n >= 0;
  if (!doc.operations.every((op) => op && (op.type === "move"
    ? index(op.fromIndex) && index(op.toIndex)
    : (op.type === "delete" || op.type === "rotate") && index(op.pageIndex) &&
      (op.type !== "rotate" || Number.isFinite(op.degrees) && op.degrees % 90 === 0)))) return null;
  if (!doc.annotations.every((entry) => entry?.annotation && typeof entry.annotation.id === "string" &&
    index(entry.annotation.pageIndex) && Number.isInteger(entry.annotation.type) && entry.annotation.rect &&
    (!entry.media || mediaValid(entry.media)))) return null;
  if (!Object.values(doc.formValues).every((value) => typeof value === "string")) return null;
  try {
    const copy = pdfWorkingJson(doc);
    if (copy.source.url) copy.source = { ...pdfMediaReference(copy.source.url), blank: copy.source.blank };
    copy.annotations = copy.annotations.map((entry) => entry.media?.url
      ? { ...entry, media: { ...pdfMediaReference(entry.media.url), mimeType: entry.media.mimeType } } : entry);
    return copy;
  } catch { return null; }
}

export function pdfLiveAnnotation(annotation: PdfAnnotationLike): PdfAnnotationLike {
  const next = { ...annotation };
  for (const field of ["created", "modified"]) {
    if (typeof next[field] === "string") next[field] = new Date(next[field] as string);
  }
  return next;
}
