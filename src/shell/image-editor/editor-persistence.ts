"use client";

import type { LibraryItem } from "../library-data";
import { saveProjectWorkingHead } from "../doc-editors/doc-io";
import type { EditorSnapshot } from "./editor-runtime";
import type { ExportFormat } from "./types";

const PROJECT_SCHEMA = "oceanleo.fabric-image.v1";
const MAX_PROJECT_BYTES = 5_000_000;
const LOCAL_DRAFT_PREFIX = "oceanleo:advanced:image-draft:v1:";

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export interface FabricImageProject {
  schema: typeof PROJECT_SCHEMA;
  version: 1;
  updatedAt: string;
  snapshot: EditorSnapshot;
}

export interface PersistedImageProject {
  previewUrl: string;
  projectUrl: string;
  savedAt: string;
  versionId: string;
}

export function mimeFor(format: ExportFormat): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

export function extensionFor(format: ExportFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function downloadImageBlob(
  blob: Blob,
  title: string,
  format: ExportFormat,
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = `${title || "oceanleo-image"}.${extensionFor(format)}`;
  anchor.href = url;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function imageProject(
  snapshot: EditorSnapshot,
  updatedAt = new Date().toISOString(),
): FabricImageProject {
  return {
    schema: PROJECT_SCHEMA,
    version: 1,
    updatedAt,
    snapshot,
  };
}

function isImageProject(value: unknown): value is FabricImageProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const project = value as Partial<FabricImageProject>;
  return (
    project.schema === PROJECT_SCHEMA &&
    project.version === 1 &&
    typeof project.updatedAt === "string" &&
    Boolean(project.snapshot) &&
    typeof project.snapshot?.json === "object" &&
    Number.isFinite(project.snapshot?.doc?.width) &&
    Number.isFinite(project.snapshot?.doc?.height) &&
    typeof project.snapshot?.canvasBackground === "string"
  );
}

function localDraftKey(item: LibraryItem): string {
  const root = String(
    item.meta.root_asset_id || item.meta.parent_asset_id || item.id || item.key,
  ).slice(0, 600);
  return `${LOCAL_DRAFT_PREFIX}${root}`;
}

export function saveLocalImageDraft(
  item: LibraryItem,
  snapshot: EditorSnapshot,
): void {
  if (typeof window === "undefined") return;
  try {
    const encoded = JSON.stringify(imageProject(snapshot));
    if (byteLength(encoded) > MAX_PROJECT_BYTES) return;
    window.localStorage.setItem(localDraftKey(item), encoded);
  } catch {
    // Cloud autosave still runs; local draft storage is a best-effort safety net.
  }
}

export function loadLocalImageDraft(
  item: LibraryItem,
): FabricImageProject | null {
  if (typeof window === "undefined") return null;
  try {
    const encoded = window.localStorage.getItem(localDraftKey(item));
    if (!encoded || byteLength(encoded) > MAX_PROJECT_BYTES) return null;
    const parsed: unknown = JSON.parse(encoded);
    return isImageProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLocalImageDraft(item: LibraryItem): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(localDraftKey(item));
  } catch {
    // A durable cloud version already exists, so quota/privacy failures are safe.
  }
}

export async function loadImageProject(
  url: string,
  signal?: AbortSignal,
): Promise<FabricImageProject> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`图片工程读取失败（HTTP ${response.status}）`);
  }
  const text = await response.text();
  if (!text || byteLength(text) > MAX_PROJECT_BYTES) {
    throw new Error("图片工程为空或超过 5MB 安全上限");
  }
  const parsed: unknown = JSON.parse(text);
  if (isImageProject(parsed)) return parsed;
  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as { schema?: unknown }).schema === PROJECT_SCHEMA &&
    (parsed as { version?: unknown }).version === 1
  ) {
    const wrapped = parsed as { data?: unknown; updatedAt?: unknown };
    const normalized = imageProject(
      wrapped.data as EditorSnapshot,
      typeof wrapped.updatedAt === "string" ? wrapped.updatedAt : undefined,
    );
    if (isImageProject(normalized)) return normalized;
  }
  throw new Error("图片工程格式无效");
}

export async function persistImageProject(
  snapshot: EditorSnapshot,
  item: LibraryItem,
  siteId: string,
  idempotencyKey: string,
  workingHeadUrl: string,
  messages: { uploadFailed: string; registerFailed: string },
): Promise<PersistedImageProject> {
  const targetSite = siteId || "design";
  const title = `${item.title || "图片"}-编辑版`;
  const rootId = String(
    item.meta.root_asset_id || item.meta.parent_asset_id || item.id,
  );
  const savedAt = new Date().toISOString();
  const projectJson = JSON.stringify(imageProject(snapshot, savedAt));
  if (byteLength(projectJson) > MAX_PROJECT_BYTES) {
    throw new Error("图片工程超过 5MB，暂时无法自动保存");
  }
  const saved = await saveProjectWorkingHead({
    item,
    siteId: targetSite,
    fallbackSite: "design",
    title,
    mediaType: "image",
    kind: "image",
    idempotencyKey,
    workingHeadUrl,
    meta: {
      parent_asset_id: rootId,
      editor: "fabric-v3",
      fabric_saved_at: savedAt,
    },
    project: { schema: PROJECT_SCHEMA, data: snapshot },
  });
  if (!saved.ok) {
    throw new Error(
      saved.error || messages.uploadFailed || messages.registerFailed,
    );
  }
  return {
    previewUrl: saved.url,
    projectUrl: saved.projectUrl,
    savedAt,
    versionId: saved.versionId,
  };
}
