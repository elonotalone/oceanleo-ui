/**
 * Non-richdoc persistence admission. Load failure must not become an editable
 * blank that autosaves over existing bytes. Routes own the UI; these helpers
 * are the shared refuse/admit answers tests can call without mounting React.
 */

import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import { planWebsiteLocalSource } from "../website-local/website-local-source";
import { planDesignCanvasSource } from "../design-canvas/design-canvas-source";
import type { WebsiteSource } from "../website-source-carrier/website-source-schema";

export {
  localRemoteEditorWorkbenchChoice,
  storedEditorProjectUrl,
} from "./stored-editor-project";
export {
  hydrateWebsiteLocalSource,
  planWebsiteLocalSource,
} from "../website-local/website-local-source";
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

export function audioSourcePersistenceAdmitted(input: {
  loading: boolean;
  capture: unknown;
}): NonRichdocSourceAdmission {
  if (input.loading) {
    return {
      ok: false,
      error: "音频源尚未载入完成，未把静音占位当作可保存稿。",
    };
  }
  if (input.capture == null) {
    return {
      ok: false,
      error: "音频源未成功载入，未把静音占位当作可保存稿。",
    };
  }
  return { ok: true };
}

export function model3dSourcePersistenceAdmitted(input: {
  loading: boolean;
  modelLoaded: boolean;
}): NonRichdocSourceAdmission {
  if (input.loading) {
    return {
      ok: false,
      error: "3D 模型尚未载入完成，未把空场景当作可保存稿。",
    };
  }
  if (!input.modelLoaded) {
    return {
      ok: false,
      error: "3D 模型未成功载入，未把空场景当作可保存稿。",
    };
  }
  return { ok: true };
}

export function websiteLocalSourceFromItem(item: {
  title?: string;
  content?: string | null;
  artifactId?: string;
  meta?: Record<string, unknown>;
  url?: string | null;
  artifact?: {
    renditions?: {
      source?: { url?: string | null } | null;
      full?: { url?: string | null } | null;
    };
  };
}): { ok: true; source: WebsiteSource } | { ok: false; error: string } {
  const plan = planWebsiteLocalSource(item);
  if (plan.kind === "ready" || plan.kind === "blank") {
    return { ok: true, source: plan.source };
  }
  if (plan.kind === "remote") {
    return {
      ok: false,
      error:
        "这份网站的工程源在远程，需经授权加载后打开，未改用空白稿覆盖原件。",
    };
  }
  return { ok: false, error: plan.error };
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

function gameEnvelopePresent(item: LibraryItem): boolean {
  if (isDurableLibraryItem(item)) {
    const envelope =
      item.artifact.renditions.full || item.artifact.renditions.source;
    return Boolean(envelope?.url && envelope?.digest);
  }
  const envelopeUrl = String(item.url || item.previewUrl || "").trim();
  return Boolean(
    envelopeUrl &&
      (item.kind === "game" || item.meta.advanced_editor_route === "game"),
  );
}

export function gameSourceAdmission(
  item: LibraryItem,
): NonRichdocSourceAdmission {
  if (gameEnvelopePresent(item)) return { ok: true };
  if (isDurableLibraryItem(item)) {
    return {
      ok: false,
      error: "这份游戏没有可打开的可玩信封，未改用空白稿覆盖原件。",
    };
  }
  return { ok: true };
}
