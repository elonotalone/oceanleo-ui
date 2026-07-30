import type { RefCallback } from "react";
import type { PersistedEditorVersion } from "../doc-editors/doc-io";
import type {
  PdfAnnotationView,
  PdfVisualPoint,
  PdfVisualRect,
} from "./pdf-annotation-operations";
import type { PdfBinaryManifest, PdfFailureCode } from "./pdf-manifest";

/** §3.2 — the reading and editing states. `invalid` and `image-only` are the
 * two bypass terminals; everything else is on the main path. */
export type PdfReaderState =
  | "empty"
  | "loading"
  | "paged"
  | "text-ready"
  | "annotating"
  | "saving"
  | "invalid"
  | "image-only";

export const PDF_READER_STATES: readonly PdfReaderState[] = [
  "empty",
  "loading",
  "paged",
  "text-ready",
  "annotating",
  "saving",
  "invalid",
  "image-only",
];

export type PdfReaderEvent =
  | "source-received"
  | "parse-failed"
  | "pages-resolved"
  | "text-layer-ready"
  | "text-layer-absent"
  | "annotation-edited"
  | "commit-started"
  | "commit-succeeded"
  | "commit-conflicted"
  | "reset";

/** §3.2 transition table, one row per documented migration. */
export const PDF_READER_TRANSITIONS: Readonly<
  Record<PdfReaderState, Partial<Record<PdfReaderEvent, PdfReaderState>>>
> = {
  empty: { "source-received": "loading" },
  loading: { "parse-failed": "invalid", "pages-resolved": "paged" },
  paged: { "text-layer-ready": "text-ready", "text-layer-absent": "image-only" },
  "text-ready": { "annotation-edited": "annotating" },
  "image-only": { "annotation-edited": "annotating" },
  annotating: { "commit-started": "saving" },
  saving: { "commit-succeeded": "text-ready", "commit-conflicted": "annotating" },
  invalid: {},
};

/** §3.2 — the five migrations that MUST NOT happen. */
export const PDF_ILLEGAL_READER_TRANSITIONS: readonly (readonly [
  PdfReaderState,
  PdfReaderState,
])[] = [
  ["loading", "text-ready"],
  ["invalid", "annotating"],
  ["image-only", "text-ready"],
  ["saving", "invalid"],
  ["paged", "saving"],
];

export function isIllegalPdfReaderTransition(
  from: PdfReaderState,
  to: PdfReaderState,
): boolean {
  return PDF_ILLEGAL_READER_TRANSITIONS.some(
    ([source, target]) => source === from && target === to,
  );
}

/**
 * Apply one event. Returns `null` when the event is not defined for the state,
 * so callers surface a controlled refusal instead of silently jumping.
 *
 * `textLayerPresent` disambiguates the one place where §3.2's table and its
 * illegal list disagree: the table lands every successful commit in
 * `text-ready`, but `image-only → text-ready` is explicitly forbidden. A
 * scanned document therefore returns to `image-only` after saving rather than
 * claiming a full-text search it cannot serve.
 */
export function pdfReaderTransition(
  from: PdfReaderState,
  event: PdfReaderEvent,
  textLayerPresent = true,
): PdfReaderState | null {
  if (event === "reset") return "empty";
  const target = PDF_READER_TRANSITIONS[from]?.[event];
  if (!target) return null;
  const resolved =
    target === "text-ready" && !textLayerPresent ? "image-only" : target;
  return isIllegalPdfReaderTransition(from, resolved) ? null : resolved;
}

export interface PdfReaderFailure {
  code: PdfFailureCode;
  message: string;
}

export interface PdfTextLayerSummary {
  status: "idle" | "probing" | "ready";
  present: boolean;
  totalCharacters: number;
  coveragePageRatio: number;
  extractor: string;
}

export interface PdfSearchHit {
  pageNumber: number;
  excerpt: string;
  offset: number;
}

export interface PdfWorkbenchState {
  readerState: PdfReaderState;
  failure: PdfReaderFailure | null;
  textLayer: PdfTextLayerSummary;
  manifest: PdfBinaryManifest | null;
  searchFullText: (query: string) => PdfSearchHit[];
  renderPageThumbnail: (
    pageNumber: number,
    canvas: HTMLCanvasElement,
  ) => Promise<void>;
  zoomStops: readonly number[];
  fitZoom: (mode: "width" | "page") => void;
  canvasRef: RefCallback<HTMLCanvasElement>;
  sourceUrl: string;
  pageNumber: number;
  pageCount: number;
  rotation: number;
  zoom: number;
  renderedZoom: number;
  pageWidth: number;
  pageHeight: number;
  loading: boolean;
  rendering: boolean;
  processing: boolean;
  saving: boolean;
  dirty: boolean;
  editRevision: number;
  canUndo: boolean;
  canRedo: boolean;
  error: string;
  notice: string;
  savedUrl: string;
  annotationText: string;
  annotations: PdfAnnotationView[];
  selectedAnnotationId: string;
  selectedAnnotation: PdfAnnotationView | null;
  annotationTool: "select" | "text" | "highlight";
  setAnnotationText: (value: string) => void;
  setAnnotationTool: (value: "select" | "text" | "highlight") => void;
  selectAnnotation: (id: string) => void;
  goToPage: (pageNumber: number) => void;
  previousPage: () => void;
  nextPage: () => void;
  setZoom: (percent: number) => void;
  zoomBy: (delta: number) => void;
  rotateCurrentPage: (direction?: 1 | -1) => Promise<void>;
  movePage: (fromPage: number, toPage: number) => Promise<void>;
  moveCurrentPage: (offset: 1 | -1) => Promise<void>;
  deleteCurrentPage: () => Promise<void>;
  addBlankPage: () => Promise<void>;
  mergePdf: (file: File, position?: "append" | "after-current") => Promise<void>;
  extractPages: (pageNumbers?: readonly number[]) => Promise<void>;
  addTextAnnotation: () => Promise<void>;
  addTextAnnotationAt: (point: PdfVisualPoint) => Promise<void>;
  addHighlightAnnotation: (rect: PdfVisualRect) => Promise<void>;
  moveAnnotation: (id: string, rect: PdfVisualRect) => Promise<void>;
  updateSelectedAnnotation: (contents: string) => Promise<void>;
  deleteSelectedAnnotation: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  download: () => void;
  saveCopy: () => Promise<PersistedEditorVersion | null>;
  captureRecovery: () => Blob | null;
  restoreRecovery: (payload: unknown) => Promise<boolean>;
}
