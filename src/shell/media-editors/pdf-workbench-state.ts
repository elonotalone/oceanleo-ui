import type { RefCallback } from "react";
import type { PersistedEditorVersion } from "../doc-editors/doc-io";
import type {
  PdfAnnotationView,
  PdfVisualPoint,
  PdfVisualRect,
} from "./pdf-annotation-operations";

export interface PdfWorkbenchState {
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
