/**
 * Non-richdoc persistence admission. Load failure must not become an editable
 * blank that autosaves over existing bytes. Routes own the UI; these helpers
 * are the shared refuse/admit answers tests can call without mounting React.
 */

import { planDesignCanvasSource } from "../design-canvas/design-canvas-source";

export { storedEditorProjectUrl } from "./stored-editor-project";
export {
  hydrateDesignCanvasSource,
  planDesignCanvasSource,
} from "../design-canvas/design-canvas-source";

export type NonRichdocSourceAdmission =
  | { ok: true }
  | { ok: false; error: string };

function diagnosticMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "message" in value) {
    const message = String(
      (value as { message?: unknown }).message || "",
    ).trim();
    if (message) return message;
  }
  return fallback;
}

/** Opening errors and save refusal are separate user actions. */
export function imageSourceFailureMessage(input: { error: string; sceneDiagnostic: unknown }): string {
  return input.error.trim() || diagnosticMessage(
    input.sceneDiagnostic,
    "图片源未成功载入，未改用空白画布覆盖原件。",
  );
}

export function imageSourcePersistenceAdmitted(input: {
  loading: boolean;
  sceneDiagnostic: unknown;
  sourceReady?: boolean;
}): NonRichdocSourceAdmission {
  if (input.loading) {
    return {
      ok: false,
      error: "图片源尚未载入完成，未把空白画布当作可保存稿。",
    };
  }
  if (input.sourceReady === false) {
    return {
      ok: false,
      error: "图片源未成功载入，拒绝把空白画布写回原件。",
    };
  }
  if (input.sceneDiagnostic) {
    return {
      ok: false,
      error: diagnosticMessage(
        input.sceneDiagnostic,
        "图片分层工程源未成功载入，未改用空白画布覆盖原件。",
      ),
    };
  }
  return { ok: true };
}

export function pdfSourcePersistenceAdmitted(input: {
  loading: boolean;
  failure: unknown;
  hasBytes: boolean;
}): NonRichdocSourceAdmission {
  if (input.failure) {
    return {
      ok: false,
      error: diagnosticMessage(
        input.failure,
        "PDF 源未成功载入，未把空白页当作可保存稿。",
      ),
    };
  }
  if (input.loading) {
    return {
      ok: false,
      error: "PDF 源尚未载入完成，未把空白页当作可保存稿。",
    };
  }
  if (!input.hasBytes) {
    return {
      ok: false,
      error: "PDF 没有可保存的字节，拒绝用空内容覆盖原件。",
    };
  }
  return { ok: true };
}

export function designCanvasLocalSourceAdmission(item: {
  title?: string;
  artifactId?: string;
  meta?: Record<string, unknown>;
  url?: string | null;
  content?: string | null;
  artifact?: {
    renditions?: {
      source?: { url?: string | null } | null;
      full?: { url?: string | null } | null;
    };
  };
}): NonRichdocSourceAdmission {
  const plan = planDesignCanvasSource(item);
  if (plan.kind === "ready" || plan.kind === "blank" || plan.kind === "remote") {
    return { ok: true };
  }
  return { ok: false, error: plan.error };
}
