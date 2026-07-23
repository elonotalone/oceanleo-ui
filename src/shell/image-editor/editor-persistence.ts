"use client";

import type { LibraryItem } from "../library-data";
import { isDurableLibraryItem } from "../library-data";
import { createArtifactRevision } from "../artifact-client";
import { uploadFile } from "../../lib/database";
import {
  fetchMediaBlob,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import { saveProjectWorkingHead } from "../doc-editors/doc-io";
import {
  normalizeEditorSnapshot,
  type EditorSnapshot,
} from "./editor-runtime";
import {
  IMAGE_SCENE_SOURCE_FORMAT,
  IMAGE_SCENE_SOURCE_SCHEMA,
  ImageSceneSourceError,
  assertImageDependencyAccess,
  createImageSceneRevisionBundle,
  imageDependencyNeedsRefresh,
  sha256Blob,
} from "./image-scene-source";
import type { ExportFormat } from "./types";

export const IMAGE_PROJECT_SCHEMA = "oceanleo.fabric-image.v1";
const MAX_PROJECT_BYTES = 5_000_000;
const LOCAL_DRAFT_PREFIX = "oceanleo:advanced:image-draft:v1:";

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export interface FabricImageProject {
  schema: typeof IMAGE_PROJECT_SCHEMA;
  version: 1;
  updatedAt: string;
  snapshot: EditorSnapshot;
}

export interface PersistedImageProject {
  previewUrl: string;
  projectUrl: string;
  savedAt: string;
  versionId: string;
  item?: LibraryItem;
  revisionDigest?: string;
  sourceDigest?: string;
  dependencyClosureDigest?: string;
  dependencyRevisionIds?: string[];
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

export function createFabricImageProject(
  snapshot: EditorSnapshot,
  updatedAt = new Date().toISOString(),
): FabricImageProject {
  return {
    schema: IMAGE_PROJECT_SCHEMA,
    version: 1,
    updatedAt,
    snapshot,
  };
}

export function parseFabricImageProject(
  value: unknown,
): FabricImageProject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const project = value as Partial<FabricImageProject>;
  if (project.schema !== IMAGE_PROJECT_SCHEMA) return null;
  const wrapped = value as {
    version?: unknown;
    updatedAt?: unknown;
    snapshot?: unknown;
    data?: unknown;
  };
  if (wrapped.version != null && wrapped.version !== 1) return null;
  const snapshot = normalizeEditorSnapshot(
    wrapped.snapshot ?? wrapped.data,
  );
  if (!snapshot) return null;
  return createFabricImageProject(
    snapshot,
    typeof wrapped.updatedAt === "string" ? wrapped.updatedAt : "",
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
    const encoded = JSON.stringify(createFabricImageProject(snapshot));
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
    return parseFabricImageProject(parsed);
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
  const project = parseFabricImageProject(parsed);
  if (project) return project;
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
  const projectJson = JSON.stringify(
    createFabricImageProject(snapshot, savedAt),
  );
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
    project: { schema: IMAGE_PROJECT_SCHEMA, data: snapshot },
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

function normalizedDigest(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
}

function trustedArtifactMediaUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const local =
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    return (
      (parsed.protocol === "https:" || local) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      isFirstPartyMediaUrl(parsed.toString())
    );
  } catch {
    return false;
  }
}

function uploadDigest(file: {
  meta?: Record<string, unknown>;
} | null | undefined): string {
  return normalizedDigest(file?.meta?.content_digest || file?.meta?.sha256);
}

function assertUploadDigest(
  label: string,
  declared: string,
  file: { meta?: Record<string, unknown> } | null | undefined,
): void {
  const receipt = uploadDigest(file);
  if (receipt && receipt !== declared) {
    throw new Error(`${label}上传回执 digest 与本地字节不一致`);
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function assertPngPreview(blob: Blob): Promise<string> {
  if (blob.size <= 0 || blob.size > 32_000_000) {
    throw new Error("复合图片 preview 为空或超过 32MB 安全上限");
  }
  const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
    (value, index) => bytes[index] === value,
  ) && String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR";
  const mime = blob.type.split(";")[0].trim().toLowerCase();
  if (!png || (mime && mime !== "image/png")) {
    throw new Error("复合图片 preview 的 MIME 与 PNG magic 不一致");
  }
  return sha256Blob(blob);
}

async function verifyPersistedUpload(
  label: string,
  url: string,
  digest: string,
  maxBytes: number,
): Promise<void> {
  if (!trustedArtifactMediaUrl(url)) {
    throw new Error(`${label}上传返回了未托管的 URL`);
  }
  const persisted = await fetchMediaBlob(url, {
    maxBytes,
    cache: "no-store",
  });
  if ((await sha256Blob(persisted)) !== digest) {
    throw new Error(`${label}上传后的实际字节 digest 不一致`);
  }
}

async function verifyCompositeDependencies(
  dependencies: readonly {
    id: string;
    url: string;
    digest: string;
    artifactId?: string;
    revisionId?: string;
    expiresAt?: string | null;
    kind: "image";
    required: true;
  }[],
): Promise<void> {
  let cursor = 0;
  const verifyNext = async () => {
    while (cursor < dependencies.length) {
      const dependency = dependencies[cursor++];
      assertImageDependencyAccess(dependency, isFirstPartyMediaUrl);
      if (imageDependencyNeedsRefresh(dependency)) {
        throw new ImageSceneSourceError(
          "expired-dependency",
          `图层依赖 ${dependency.id} 在提交前已过期，请刷新后重试。`,
          dependency.id,
        );
      }
      const blob = await fetchMediaBlob(dependency.url, {
        maxBytes: 80 * 1024 * 1024,
      });
      if ((await sha256Blob(blob)) !== dependency.digest) {
        throw new ImageSceneSourceError(
          "dependency-digest-mismatch",
          `图层依赖 ${dependency.id} 的实际字节与 closure digest 不一致。`,
          dependency.id,
        );
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(6, dependencies.length) },
      () => verifyNext(),
    ),
  );
}

/**
 * Composite images never use the legacy creation sidecar. The versioned scene
 * source plus a static preview rendered from the same stable edit revision are
 * published through one If-Match artifact revision. The layered scene remains
 * canonical; the PNG is only a content-addressed display derivative.
 */
export async function persistCompositeImageProject(
  snapshot: EditorSnapshot,
  item: LibraryItem,
  siteId: string,
  idempotencyKey: string,
  editRevision: number,
  previewBlob: Blob,
): Promise<PersistedImageProject> {
  if (
    !isDurableLibraryItem(item) ||
    item.artifactType !== "composite_image" ||
    item.artifact.artifactType !== "composite_image" ||
    item.artifact.sourceFormat !== IMAGE_SCENE_SOURCE_FORMAT ||
    !item.artifact.integrity.ok ||
    item.artifact.scene?.schema !== IMAGE_SCENE_SOURCE_SCHEMA ||
    item.artifact.scene.sceneRevisionId !== item.revisionId ||
    item.artifact.scene.closureStatus !== "complete"
  ) {
    throw new Error(
      "复合图片缺少 durable artifact/revision identity，不能保存分层工程。",
    );
  }
  if (
    !item.artifact.access.canEdit ||
    item.artifact.owner.visibility === "public"
  ) {
    throw new Error("当前主体不能更新此复合图片 revision；请先 fork。");
  }
  const savedAt = new Date().toISOString();
  const bundle = await createImageSceneRevisionBundle({
    snapshot,
    revision: editRevision,
    artifactId: item.artifactId,
    baseRevisionId: item.revisionId,
    updatedAt: savedAt,
  });
  const scene = bundle.source;
  const sceneJson = bundle.sourceText;
  if (byteLength(sceneJson) > MAX_PROJECT_BYTES) {
    throw new Error("复合图片 scene 超过 5MB，不能安全提交");
  }
  const sourceDigest = bundle.sourceDigest;
  const dependencyRevisionIds = bundle.dependencyRevisionIds;
  const dependencyClosureDigest = bundle.artifactClosureDigest;
  const previewDigest = await assertPngPreview(previewBlob);
  await verifyCompositeDependencies(
    bundle.source.dependencyClosure.dependencies,
  );
  const title = `${item.title || "图片"}-编辑版`;
  const safeTitle =
    title.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 120) ||
    "复合图片";
  const sourceFile = new File(
    [sceneJson],
    `${safeTitle}.oceanleo-scene.json`,
    { type: "application/json" },
  );
  const previewFile = new File(
    [previewBlob],
    `${safeTitle}.preview.png`,
    { type: "image/png" },
  );
  const targetSite = siteId || item.siteId || "image";
  const [sourceUpload, previewUpload] = await Promise.all([
    uploadFile(sourceFile, {
      siteId: targetSite,
      title: `${title}分层工程`,
      registerAsset: false,
      idempotencyKey:
        `image-scene-source:${sourceDigest.slice(0, 32)}:${idempotencyKey}`.slice(
          0,
          180,
        ),
    }),
    uploadFile(previewFile, {
      siteId: targetSite,
      title: `${title}预览`,
      registerAsset: false,
      idempotencyKey:
        `image-scene-preview:${previewDigest.slice(0, 32)}:${idempotencyKey}`.slice(
          0,
          180,
        ),
    }),
  ]);
  const sourceRow = sourceUpload.data?.file;
  const previewRow = previewUpload.data?.file;
  if (!sourceUpload.ok || !sourceRow?.url) {
    throw new Error(sourceUpload.error || "复合图片 scene 上传失败");
  }
  if (!previewUpload.ok || !previewRow?.url) {
    throw new Error(previewUpload.error || "复合图片 preview 上传失败");
  }
  assertUploadDigest("复合图片 scene", sourceDigest, sourceRow);
  assertUploadDigest("复合图片 preview", previewDigest, previewRow);
  await Promise.all([
    verifyPersistedUpload(
      "复合图片 scene",
      sourceRow.url,
      sourceDigest,
      MAX_PROJECT_BYTES,
    ),
    verifyPersistedUpload(
      "复合图片 preview",
      previewRow.url,
      previewDigest,
      32_000_000,
    ),
  ]);
  const committed = await createArtifactRevision(item.artifactId, {
    expectedRevisionId: item.revisionId,
    artifactType: "composite_image",
    source: {
      format: IMAGE_SCENE_SOURCE_FORMAT,
      url: sourceRow.url,
      digest: sourceDigest,
    },
    renditions: [
      {
        purpose: "preview",
        url: previewRow.url,
        digest: previewDigest,
      },
      { purpose: "full", url: previewRow.url, digest: previewDigest },
      {
        purpose: "editor_manifest",
        url: sourceRow.url,
        digest: sourceDigest,
      },
    ],
    scene: {
      schema: IMAGE_SCENE_SOURCE_SCHEMA,
      closureDigest: dependencyClosureDigest,
      dependencyRevisionIds,
    },
    provenance: {
      editor: "oceanleo-fabric-image-scene-v1",
      scene_revision: scene.revision,
      scene_revision_digest: scene.revisionDigest,
      dependency_closure_digest: scene.dependencyClosure.digest,
      poster_scene_revision: scene.revision,
      commit_base_revision_id: item.revisionId,
      preview_source_digest: sourceDigest,
      preview_digest: previewDigest,
      preview_static_frame: "final",
    },
  });
  if (!committed.ok || !committed.data || !isDurableLibraryItem(committed.data)) {
    throw new Error(committed.error || "复合图片 revision 提交失败");
  }
  const next = committed.data;
  const nextSource = next.artifact.renditions.source;
  const nextPreview =
    next.artifact.renditions.preview || next.artifact.renditions.full;
  const nextFull =
    next.artifact.renditions.full || next.artifact.renditions.preview;
  const sourceMatches =
    nextSource?.revisionId === next.revisionId &&
    trustedArtifactMediaUrl(nextSource.url) &&
    normalizedDigest(nextSource.digest) === sourceDigest;
  const previewMatches =
    nextPreview?.revisionId === next.revisionId &&
    trustedArtifactMediaUrl(nextPreview.url) &&
    normalizedDigest(nextPreview.digest) === previewDigest &&
    nextFull?.revisionId === next.revisionId &&
    trustedArtifactMediaUrl(nextFull.url) &&
    normalizedDigest(nextFull.digest) === previewDigest;
  const closureMatches =
    next.artifact.scene?.sceneRevisionId === next.revisionId &&
    next.artifact.scene.schema === IMAGE_SCENE_SOURCE_SCHEMA &&
    next.artifact.scene.closureStatus === "complete" &&
    normalizedDigest(next.artifact.scene.closureDigest) ===
      dependencyClosureDigest &&
    sameStrings(
      next.artifact.scene.dependencyRevisionIds,
      dependencyRevisionIds,
    );
  if (
    next.artifactId !== item.artifactId ||
    next.revisionId === item.revisionId ||
    next.artifactType !== "composite_image" ||
    next.artifact.sourceFormat !== IMAGE_SCENE_SOURCE_FORMAT ||
    !next.artifact.integrity.ok ||
    !next.artifact.access.canEdit ||
    next.artifact.owner.visibility === "public" ||
    !sourceMatches ||
    !previewMatches ||
    !closureMatches ||
    !nextPreview?.url ||
    !nextSource?.url
  ) {
    throw new Error(
      "复合图片保存回执的 artifact/revision、source digest 或 dependency closure 不一致。",
    );
  }
  return {
    previewUrl: nextPreview.url,
    projectUrl: nextSource.url,
    savedAt,
    versionId: next.revisionId,
    item: next,
    revisionDigest: scene.revisionDigest,
    sourceDigest,
    dependencyClosureDigest,
    dependencyRevisionIds,
  };
}
