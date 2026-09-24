import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import {
  saveFileToLibrary,
  type SaveToLibraryResult,
} from "../doc-editors/doc-io";
import { photopeaLaunchUrl } from "../image-editor/photopea-bridge";

export const PHOTOPEA_PNG_EXPORT_SCRIPT = 'app.activeDocument.saveToOE("png");';
export const PHOTOPEA_DATA_URL_MAX_CHARS = 1_500_000;
export const PHOTOPEA_SAVE_TIMEOUT_MS = 15_000;

const FABRIC_PROJECT_META_KEYS = [
  "fabric_document_url",
  "editor_project_url",
  "editor_project_schema",
  "editor_working_head_url",
  "editor_working_head_project_url",
  "editor_working_head_schema",
] as const;

export type ImageBytesKind = "png" | "jpeg" | "webp" | "gif" | "psd" | "unknown";

export function sniffImageBytes(bytes: ArrayBuffer): ImageBytesKind {
  const view = new Uint8Array(bytes);
  if (view.length >= 4 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47) {
    return "png";
  }
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
    return "jpeg";
  }
  if (
    view.length >= 12 &&
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x45 &&
    view[10] === 0x42 &&
    view[11] === 0x50
  ) {
    return "webp";
  }
  if (view.length >= 6 && view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x38) {
    return "gif";
  }
  if (view.length >= 4 && view[0] === 0x38 && view[1] === 0x42 && view[2] === 0x50 && view[3] === 0x53) {
    return "psd";
  }
  return "unknown";
}

export function photopeaRevisionBlockedReason(item: LibraryItem): string | null {
  if (item.artifactType === "composite_image") {
    return "这份是分层设计稿，专业编辑里改完的平面图不会覆盖原稿。";
  }
  return null;
}

export function stripFabricProjectPointers(item: LibraryItem): LibraryItem {
  const meta = { ...(item.meta || {}) };
  for (const key of FABRIC_PROJECT_META_KEYS) {
    delete meta[key];
  }
  return { ...item, meta };
}

export function photopeaLaunchIncludesDocument(launchUrl: string): boolean {
  const hash = launchUrl.split("#")[1] || "";
  if (!hash) return false;
  try {
    const config = JSON.parse(decodeURIComponent(hash)) as { files?: unknown };
    return Array.isArray(config.files) && config.files.some((entry) => Boolean(entry));
  } catch {
    return false;
  }
}

export function launchPhotopeaWithCurrentImage(documentDataUrl?: string): string {
  return photopeaLaunchUrl({ documentDataUrl });
}

function bytesToBase64(bytes: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  const view = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < view.length; index += chunk) {
    binary += String.fromCharCode(...view.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function toPhotopeaDocumentRef(
  url: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; documentDataUrl: string } | { ok: false; error: string }> {
  if (!url) return { ok: false, error: "当前没有可交给专业编辑的图像。" };
  if (url.startsWith("data:")) {
    return url.length <= PHOTOPEA_DATA_URL_MAX_CHARS
      ? { ok: true, documentDataUrl: url }
      : { ok: true, documentDataUrl: url };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) {
      return { ok: true, documentDataUrl: url };
    }
    const bytes = await response.arrayBuffer();
    const declared = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const mime = /^image\/[a-z0-9.+-]+$/.test(declared) ? declared : "image/png";
    const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
    if (dataUrl.length > PHOTOPEA_DATA_URL_MAX_CHARS) {
      return { ok: true, documentDataUrl: url };
    }
    return { ok: true, documentDataUrl: dataUrl };
  } catch {
    return { ok: true, documentDataUrl: url };
  }
}

export function createPhotopeaSaveRoundtrip(timeoutMs = PHOTOPEA_SAVE_TIMEOUT_MS): {
  expect: () => Promise<LibraryItem>;
  settle: (result: { ok: true; item: LibraryItem } | { ok: false; error: string }) => boolean;
} {
  let pending: {
    resolve: (item: LibraryItem) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  return {
    expect() {
      return new Promise((resolve, reject) => {
        if (pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error("专业编辑还没确认保存。"));
        }
        const timer = setTimeout(() => {
          pending = null;
          reject(new Error("专业编辑还没确认保存。"));
        }, timeoutMs);
        pending = { resolve, reject, timer };
      });
    },
    settle(result) {
      if (!pending) return false;
      clearTimeout(pending.timer);
      const current = pending;
      pending = null;
      if (result.ok) current.resolve(result.item);
      else current.reject(new Error(result.error));
      return true;
    },
  };
}

export async function persistPhotopeaDocument(input: {
  item: LibraryItem;
  siteId: string;
  bytes: ArrayBuffer;
  save?: (args: Parameters<typeof saveFileToLibrary>[0]) => Promise<SaveToLibraryResult>;
}): Promise<{ ok: true; item: LibraryItem } | { ok: false; error: string }> {
  const blocked = photopeaRevisionBlockedReason(input.item);
  if (blocked) return { ok: false, error: blocked };
  const kind = sniffImageBytes(input.bytes);
  if (kind === "psd" || kind === "unknown") {
    return { ok: false, error: "专业编辑没有带回可用的图片。" };
  }
  const mime =
    kind === "jpeg"
      ? "image/jpeg"
      : kind === "webp"
        ? "image/webp"
        : kind === "gif"
          ? "image/gif"
          : "image/png";
  const extension = kind === "jpeg" ? "jpg" : kind;
  const title = `${input.item.title || "图片"}-编辑版`;
  const fileStem =
    title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 120) || "image";
  const file = new File([input.bytes], `${fileStem}.${extension}`, { type: mime });
  const cleaned = stripFabricProjectPointers(input.item);
  const durableSingle =
    isDurableLibraryItem(cleaned) && cleaned.artifactType === "single_file_image";
  const save = input.save ?? saveFileToLibrary;
  const result = await save({
    item: cleaned,
    siteId: input.siteId || "design",
    fallbackSite: "design",
    file,
    createFile: async () => file,
    sourceFormat: extension === "jpg" ? "jpeg" : extension,
    sourceMediaType: mime,
    title,
    mediaType: "image",
    kind: "image",
    idempotencyKey: `photopea:${cleaned.revisionId || cleaned.id}:${Date.now().toString(36)}`,
    meta: {
      editor: "photopea",
      editor_capability: "image-editor",
    },
    ...(durableSingle
      ? {
          artifactRevision: {
            artifactType: "single_file_image" as const,
            editor: "photopea",
          },
        }
      : {}),
  });
  if (!result.ok) {
    return { ok: false, error: result.error || "图片没有存成新版本。" };
  }
  const next = stripFabricProjectPointers(result.item || cleaned);
  return {
    ok: true,
    item: {
      ...next,
      url: result.url || next.url,
      previewUrl: result.url || next.previewUrl,
      artifactId: result.artifactId || next.artifactId,
      revisionId: result.revisionId || next.revisionId,
    },
  };
}
