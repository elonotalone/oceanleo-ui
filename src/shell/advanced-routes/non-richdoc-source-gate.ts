/**
 * Non-richdoc persistence admission. Load failure must not become an editable
 * blank that autosaves over existing bytes. Routes own the UI; these helpers
 * are the shared refuse/admit answers tests can call without mounting React.
 */

import { parseDesignDocumentProject } from "../image-editor/design-document-schema";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import { blankWebsiteSource } from "../website-local/blank-website-source";
import { parseWebsiteSource } from "../website-source-carrier/website-source-validate";
import type { WebsiteSource } from "../website-source-carrier/website-source-schema";

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
}): NonRichdocSourceAdmission {
  if (input.loading) {
    return {
      ok: false,
      error: "图片源尚未载入完成，未把空白画布当作可保存稿。",
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
}): { ok: true; source: WebsiteSource } | { ok: false; error: string } {
  const raw =
    item.meta && typeof item.meta === "object"
      ? item.meta.websiteSource
      : undefined;
  if (raw && typeof raw === "object") {
    try {
      return { ok: true, source: parseWebsiteSource(JSON.stringify(raw)) };
    } catch (caught) {
      const detail =
        caught instanceof Error && caught.message.trim()
          ? caught.message.trim()
          : "网站工程源无法解析";
      return {
        ok: false,
        error: `${detail}，未改用空白稿覆盖原件。`,
      };
    }
  }
  const content = typeof item.content === "string" ? item.content.trim() : "";
  if (content.startsWith("{")) {
    try {
      return { ok: true, source: parseWebsiteSource(content) };
    } catch (caught) {
      const detail =
        caught instanceof Error && caught.message.trim()
          ? caught.message.trim()
          : "网站工程源无法解析";
      return {
        ok: false,
        error: `${detail}，未改用空白稿覆盖原件。`,
      };
    }
  }
  if (item.artifactId) {
    return {
      ok: false,
      error:
        "这份网站没有可在本地打开的 website-source@1 工程，未改用空白稿覆盖原件。",
    };
  }
  return {
    ok: true,
    source: blankWebsiteSource(item.title || "本地可编辑的网站工程"),
  };
}

export function designCanvasLocalSourceAdmission(item: {
  title?: string;
  artifactId?: string;
  meta?: Record<string, unknown>;
}): NonRichdocSourceAdmission {
  const raw =
    item.meta && typeof item.meta === "object"
      ? item.meta.designDocument
      : undefined;
  if (raw && typeof raw === "object") {
    try {
      parseDesignDocumentProject(JSON.stringify(raw));
      return { ok: true };
    } catch (caught) {
      return {
        ok: false,
        error:
          caught instanceof Error
            ? caught.message
            : "设计稿源无法解析，未改用空白画布覆盖原件。",
      };
    }
  }
  if (item.artifactId) {
    return {
      ok: false,
      error:
        "这份设计稿没有可在本地打开的工程源，未改用空白画布覆盖原件。",
    };
  }
  return { ok: true };
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
