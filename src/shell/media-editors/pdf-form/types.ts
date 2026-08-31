import type { PdfVisualRect } from "../pdf-annotation-operations";
import type { PdfWorkbenchState } from "../pdf-workbench-state";

/** AcroForm field kinds the office panel knows how to fill. */
export type PdfFormFieldKind =
  | "text"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "option-list"
  | "signature";

export interface PdfFormFieldView {
  name: string;
  kind: PdfFormFieldKind;
  pageIndex: number;
  /** Visual-normalized widget bounds when pdf-lib exposes them. */
  rect: PdfVisualRect | null;
  required: boolean;
  readOnly: boolean;
  value: string | boolean | string[];
  options: string[];
  /** `MaxLen` declared by the PDF itself, not a guess. Text fields only. */
  maxLength: number | null;
  multiline: boolean;
}

export type PdfOfficeTool = "none" | "signature" | "redaction";

export interface PdfRedactionMark {
  id: string;
  pageIndex: number;
  rect: PdfVisualRect;
}

export interface PdfSavedSignature {
  id: string;
  label: string;
  /** PNG bytes, base64-encoded for localStorage. */
  pngBase64: string;
  createdAt: number;
}

/** Extended workbench surface returned by `usePdfWorkbench` (structural superset). */
export interface PdfOfficeWorkbenchState extends PdfWorkbenchState {
  formFields: PdfFormFieldView[];
  formHasFields: boolean;
  formValues: Record<string, string | boolean | string[]>;
  formErrors: Record<string, string>;
  formFlatten: boolean;
  setFormValue: (name: string, value: string | boolean | string[]) => void;
  setFormFlatten: (flatten: boolean) => void;
  applyFormFill: () => Promise<void>;
  officeTool: PdfOfficeTool;
  setOfficeTool: (tool: PdfOfficeTool) => void;
  savedSignatures: PdfSavedSignature[];
  saveSignatureFromPng: (label: string, pngBytes: Uint8Array) => void;
  removeSavedSignature: (id: string) => void;
  pendingSignatureId: string;
  setPendingSignatureId: (id: string) => void;
  placeSignatureAt: (rect: PdfVisualRect) => Promise<void>;
  redactionMarks: PdfRedactionMark[];
  redactionPreview: PdfVisualRect | null;
  setRedactionPreview: (rect: PdfVisualRect | null) => void;
  addRedactionMark: (rect: PdfVisualRect) => void;
  removeRedactionMark: (id: string) => void;
  applyRedactions: () => Promise<void>;
  applyCrossPageSeal: () => Promise<void>;
  signaturePlacementLabel: string;
  signatureDisclaimer: string;
}
