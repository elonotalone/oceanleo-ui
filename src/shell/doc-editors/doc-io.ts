"use client";

// ============================================================================
// @oceanleo/ui — doc-editors 共享 IO（高级内容工作台 v2 文档三件套公共层）
// ----------------------------------------------------------------------------
// 富文本 / 表格 / Deck 三个编辑器共用：文件下载、Blob→dataURL、「保存到我的库」
// 两步链路（uploadFile 上传成品 → saveCreations 登记 creation），以及 onSaved 回调
// 去重 hook。避免三处重复同一套上传登记样板。
// ============================================================================

import { useEffect, useRef } from "react";
import { saveCreations, uploadFile, type MediaType } from "../../lib/database";
import { createArtifactRevision } from "../artifact-client";
import { editorWorkingHeadUrl } from "../editor-working-head";
import {
  normalizeWork,
  type LibraryItem,
} from "../library-data";
import type { ArtifactType } from "../artifact-contract";
import {
  artifactSaveStepMessage,
  planArtifactSaveRenditions,
  type ArtifactSaveStep,
} from "./artifact-save-contract";
import { EDITOR_PREVIEW_MEDIA_TYPE } from "./editor-preview-raster";
export { editorWorkingHeadUrl } from "../editor-working-head";

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadText(name: string, data: string, type: string): void {
  downloadBlob(name, new Blob([data], { type }));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(blob);
  });
}

export async function loadEditorProject<T>(
  url: string,
  expectedSchema: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`可编辑工程读取失败（HTTP ${response.status}）`);
  }
  const text = await response.text();
  if (!text || new TextEncoder().encode(text).byteLength > 20_000_000) {
    throw new Error("可编辑工程为空或超过 20MB 安全上限");
  }
  const parsed = JSON.parse(text) as {
    schema?: unknown;
    version?: unknown;
    data?: unknown;
  };
  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.schema !== expectedSchema ||
    parsed.version !== 1 ||
    parsed.data === undefined
  ) {
    throw new Error("可编辑工程格式或版本不受支持");
  }
  return parsed.data as T;
}

export interface SaveToLibraryInput {
  item: LibraryItem;
  siteId: string;
  /** siteId 为空时登记到的产品站（word / excel / ppt）。 */
  fallbackSite: string;
  /** New delivery bytes. Omit only when deliveryUrl preserves an existing dependency-complete file set. */
  file?: File;
  /**
   * Build delivery bytes only after the structured project is durable. This
   * keeps a failed renderer from publishing a revision while retaining the
   * recoverable project sidecar.
   */
  createFile?: () => Promise<File>;
  /** Durable delivery already proven loadable (for example a multi-file glTF dependency closure). */
  deliveryUrl?: string;
  /**
   * Client-rendered displayable bitmap for this exact edit revision.
   *
   * Office deliveries (docx/xlsx/pptx) can never satisfy the backend's
   * displayable-primary assertion, so the editor renders its own cover the way
   * chart/composite_image already do. Returning null is not an error by itself;
   * `artifact-save-contract.ts` decides per type whether the commit may proceed.
   */
  createPreview?: () => Promise<Blob | null>;
  /** Explicit source contract for the user-downloadable delivery. */
  sourceFormat?: string;
  sourceMediaType?: string;
  title: string;
  mediaType: MediaType;
  kind: string;
  idempotencyKey: string;
  meta: Record<string, unknown>;
  thumbUrl?: string;
  project?: {
    schema: string;
    data: unknown;
  };
  /** Data-only editor declaration; its URL always points at project JSON. */
  editorManifest?: {
    id: string;
    format?: string;
  };
  /**
   * Opt in to an atomic CAS revision when the input carries typed identity.
   * Identity-bearing inputs fail closed instead of forking through creations.
   */
  artifactRevision?: {
    artifactType: ArtifactType;
    /** Editor id recorded in provenance when there is no editor manifest. */
    editor?: string;
    provenance?: Record<string, unknown>;
  };
  /** Retry receipts. Callers may reuse them only for the same edit revision. */
  preparedProject?: PreparedProjectUpload;
  preparedDelivery?: PreparedDeliveryUpload;
  preparedPreview?: PreparedPreviewUpload;
  /** The exported delivery file is itself the exact editable project. */
  deliveryProjectSchema?: string;
  /** Register only the structured project, keeping one stable creation URL. */
  projectOnly?: boolean;
  /** Previously chosen working-head URL (needed when the first head used a project URL). */
  workingHeadUrl?: string;
}

export interface PreparedUpload {
  url: string;
  digest: string;
  artifactId: string;
  revisionId: string;
}

export interface PreparedProjectUpload extends PreparedUpload {
  schema: string;
  savedAt: string;
}

export interface PreparedDeliveryUpload extends PreparedUpload {
  format: string;
  mediaType: string;
  fileName: string;
}

export interface PreparedPreviewUpload extends PreparedUpload {
  mediaType: string;
}

export interface SaveToLibraryResult {
  ok: boolean;
  url: string;
  versionId: string;
  projectUrl: string;
  projectSchema: string;
  sourceFormat: string;
  sourceMediaType: string;
  title: string;
  fileName: string;
  savedAt: string;
  artifactId: string;
  revisionId: string;
  previousRevisionId: string;
  item?: LibraryItem;
  preparedProject?: PreparedProjectUpload;
  preparedDelivery?: PreparedDeliveryUpload;
  preparedPreview?: PreparedPreviewUpload;
  error: string;
  /** Which link of the save chain broke; empty on success. */
  failedStep?: ArtifactSaveStep | "";
  /**
   * The cover render was attempted and produced nothing. Not fatal on its own,
   * but it is the usual root cause behind a later displayable-primary refusal,
   * so it travels with the result instead of being swallowed.
   */
  previewWarning?: string;
}

export type PersistedEditorVersion = Pick<
  SaveToLibraryResult,
  "url" | "versionId" | "projectUrl" | "projectSchema"
> &
  Partial<
    Pick<
      SaveToLibraryResult,
      | "sourceFormat"
      | "sourceMediaType"
      | "title"
      | "fileName"
      | "savedAt"
      | "artifactId"
      | "revisionId"
      | "previousRevisionId"
      | "item"
      | "preparedProject"
      | "preparedDelivery"
      | "preparedPreview"
    >
  >;

/**
 * Autosave input.
 *
 * `artifactRevision` / `editorManifest` / `createPreview` stay in: a
 * project-only save can still publish a typed revision, because for
 * `audio` / `video` / `workflow` the project schema is itself an accepted
 * `source.format` (matrix §3.2 rows 10/11/13). Omitting them here is what made
 * those types structurally incapable of ever producing a revision.
 */
export interface SaveProjectWorkingHeadInput
  extends Omit<
    SaveToLibraryInput,
    | "createFile"
    | "deliveryProjectSchema"
    | "deliveryUrl"
    | "file"
    | "preparedDelivery"
    | "projectOnly"
    | "sourceFormat"
    | "sourceMediaType"
  > {
  project: NonNullable<SaveToLibraryInput["project"]>;
}

/**
 * Autosave contract: upload only the JSON project and upsert one creation.
 * The original durable delivery/preview URL remains the creation key. A blank
 * draft uses its first project URL as that stable key until a delivery exists.
 */
export async function saveProjectWorkingHead(
  input: SaveProjectWorkingHeadInput,
): Promise<SaveToLibraryResult> {
  const thumbnailUrl = editorWorkingHeadUrl({
    url: input.thumbUrl,
    previewUrl: input.item.thumbUrl || input.item.previewUrl,
  });
  const priorProjectUrl = String(
    input.item.meta.editor_project_url || "",
  ).trim();
  const projectBackedWorkingHead = Boolean(
    input.item.meta.editor_working_head_uses_project_url,
  );
  const thumbnailIsProject =
    thumbnailUrl === priorProjectUrl ||
    (projectBackedWorkingHead &&
      (thumbnailUrl === input.workingHeadUrl ||
        thumbnailUrl === input.item.url));
  return saveFileToLibrary({
    ...input,
    projectOnly: true,
    thumbUrl: thumbnailIsProject ? undefined : thumbnailUrl || undefined,
  });
}

/** 上传交付文件或轻量工程并登记到我的库；error 为空串时由调用方兜底文案。 */
export interface SaveToLibraryDependencies {
  uploadFile: typeof uploadFile;
  saveCreations: typeof saveCreations;
  createArtifactRevision: typeof createArtifactRevision;
  now: () => Date;
}

const SAVE_DEPENDENCIES: SaveToLibraryDependencies = {
  uploadFile,
  saveCreations,
  createArtifactRevision,
  now: () => new Date(),
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, maximum = 2_000): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizedDigest(value: unknown): string {
  return boundedText(value, 200).toLowerCase().replace(/^sha256:/, "");
}

async function sha256Blob(blob: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return "";
  const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function uploadReceiptDigest(file: unknown): string {
  const record = asRecord(file);
  const metadata = asRecord(record?.meta);
  const artifact = asRecord(record?.artifact);
  const renditions = asRecord(artifact?.renditions);
  const source = asRecord(renditions?.source);
  return normalizedDigest(
    metadata?.content_digest ||
      metadata?.sha256 ||
      source?.digest ||
      artifact?.content_digest,
  );
}

/**
 * Bind upload CAS keys to content digest. Revision-only keys collide across
 * sessions (local counters restart at 0) and across AdvancedPersistenceController
 * retries that rebuild project JSON with a fresh updatedAt — same key + different
 * digest → POST /v1/database/upload HTTP 409.
 */
function uploadIdempotencyKey(
  base: string,
  role: "project" | "delivery" | "preview",
  digest: string,
): string {
  const token = normalizedDigest(digest).slice(0, 24);
  const suffix = token || `u${Date.now().toString(36)}`;
  return `${boundedText(base, 140)}:${role}:${suffix}`.slice(0, 200);
}

function preparedUploadFrom(
  file: unknown,
  url: string,
  digest: string,
): PreparedUpload {
  const record = asRecord(file);
  const receiptDigest = uploadReceiptDigest(record);
  if (receiptDigest && digest && receiptDigest !== normalizedDigest(digest)) {
    throw new Error("上传回执摘要与本地文件不一致");
  }
  return {
    url,
    digest: normalizedDigest(digest || receiptDigest),
    artifactId: boundedText(record?.artifact_id, 600),
    revisionId: boundedText(record?.revision_id, 600),
  };
}

function safePreparedUrl(value: unknown): string {
  return editorWorkingHeadUrl({ url: boundedText(value) });
}

function savedIdentity(item: LibraryItem): {
  artifactId: string;
  revisionId: string;
  artifactType: string;
} {
  return {
    artifactId: boundedText(item.artifactId || item.meta.artifact_id, 600),
    revisionId: boundedText(item.revisionId || item.meta.revision_id, 600),
    artifactType: boundedText(item.artifactType || item.meta.artifact_type, 120),
  };
}

function resultError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : boundedText(error, 1_000);
}

/**
 * Upload project and delivery exactly once, then publish one creation or one
 * CAS artifact revision. Exposed with dependencies for deterministic producer
 * contract tests; normal callers use saveFileToLibrary below.
 */
export async function saveFileToLibraryWithDependencies(
  input: SaveToLibraryInput,
  dependencies: SaveToLibraryDependencies,
): Promise<SaveToLibraryResult> {
  const site = input.siteId || input.fallbackSite;
  const identity = savedIdentity(input.item);
  let sourceFormat = boundedText(input.sourceFormat, 120).toLowerCase();
  let sourceMediaType = boundedText(input.sourceMediaType, 300).toLowerCase();
  let fileName = "";
  let projectSchema = boundedText(input.deliveryProjectSchema, 120);
  let preparedProject: PreparedProjectUpload | undefined;
  let preparedDelivery: PreparedDeliveryUpload | undefined;
  let preparedPreview: PreparedPreviewUpload | undefined;
  let previewWarning = "";
  let savedAt = dependencies.now().toISOString();
  let projectUrl = "";
  let url = "";

  const finish = (
    result: Partial<SaveToLibraryResult> & Pick<SaveToLibraryResult, "ok">,
  ): SaveToLibraryResult => ({
    ok: result.ok,
    url: result.url ?? url,
    versionId: result.versionId ?? "",
    projectUrl: result.projectUrl ?? projectUrl,
    projectSchema: result.projectSchema ?? projectSchema,
    sourceFormat: result.sourceFormat ?? sourceFormat,
    sourceMediaType: result.sourceMediaType ?? sourceMediaType,
    title: result.title ?? input.title,
    fileName: result.fileName ?? fileName,
    savedAt: result.savedAt ?? savedAt,
    artifactId: result.artifactId ?? identity.artifactId,
    revisionId: result.revisionId ?? "",
    previousRevisionId: result.previousRevisionId ?? identity.revisionId,
    item: result.item,
    preparedProject: result.preparedProject ?? preparedProject,
    preparedDelivery: result.preparedDelivery ?? preparedDelivery,
    preparedPreview: result.preparedPreview ?? preparedPreview,
    error: result.error ?? "",
    failedStep: result.failedStep ?? "",
    previewWarning: result.previewWarning ?? previewWarning,
  });

  /** Every refusal names the link of the chain that broke. */
  const fail = (
    step: ArtifactSaveStep,
    detail: unknown,
  ): SaveToLibraryResult =>
    finish({
      ok: false,
      failedStep: step,
      error: artifactSaveStepMessage(step, detail),
    });

  if (
    input.project &&
    !input.projectOnly &&
    (sourceFormat.startsWith("oceanleo.") ||
      sourceFormat.includes("json") ||
      sourceMediaType === "application/json" ||
      sourceMediaType.startsWith("application/vnd.oceanleo") ||
      sourceMediaType.endsWith("+json"))
  ) {
    return fail(
      "contract",
      "交付 source 不能是 editor JSON/project schema；请登记真实二进制格式（如 pptx）",
    );
  }

  if (input.project) {
    projectSchema = boundedText(input.project.schema, 120);
    if (!projectSchema) {
      return fail("project-build", "可编辑工程缺少 schema");
    }
    const reusable = input.preparedProject;
    if (
      reusable &&
      reusable.schema === projectSchema &&
      safePreparedUrl(reusable.url)
    ) {
      preparedProject = {
        ...reusable,
        url: safePreparedUrl(reusable.url),
        digest: normalizedDigest(reusable.digest),
      };
      savedAt = reusable.savedAt || savedAt;
    } else {
      const projectJson = JSON.stringify({
        schema: projectSchema,
        version: 1,
        updatedAt: savedAt,
        data: input.project.data,
      });
      if (new TextEncoder().encode(projectJson).byteLength > 20_000_000) {
        return fail("project-build", "可编辑工程超过 20MB 安全上限");
      }
      const projectFile = new File(
        [projectJson],
        `${input.title}.oceanleo-project.json`,
        { type: "application/json" },
      );
      let digest = "";
      try {
        digest = await sha256Blob(projectFile);
      } catch (caught) {
        return fail("project-build", resultError(caught));
      }
      let projectUpload: Awaited<ReturnType<typeof uploadFile>>;
      try {
        projectUpload = await dependencies.uploadFile(projectFile, {
          siteId: site,
          title: `${input.title}工程`,
          registerAsset: false,
          idempotencyKey: uploadIdempotencyKey(
            input.idempotencyKey,
            "project",
            digest,
          ),
        });
      } catch (caught) {
        return fail("project-upload", resultError(caught));
      }
      projectUrl = safePreparedUrl(projectUpload.data?.file?.url);
      if (!projectUpload.ok || !projectUrl) {
        return fail(
          "project-upload",
          projectUpload.error || "存储服务没有返回可编辑工程地址",
        );
      }
      try {
        preparedProject = {
          ...preparedUploadFrom(projectUpload.data?.file, projectUrl, digest),
          schema: projectSchema,
          savedAt,
        };
      } catch (caught) {
        return fail("project-upload", resultError(caught));
      }
    }
    projectUrl = preparedProject.url;
  }

  const existingWorkingHead = editorWorkingHeadUrl(
    input.item,
    input.workingHeadUrl,
  );
  if (input.projectOnly) {
    // Shelf/public binary sources are not creation keys. Reusing them as the
    // project-only working head makes /v1/creations return HTTP 409. Only reuse
    // a prior editor working head / project URL once the row already carries
    // editor persistence metadata from a successful save.
    const reuseEditorWorkingHead = Boolean(
      input.item.meta.editor_working_head_url ||
        input.item.meta.editor_working_head_uses_project_url ||
        input.item.meta.editor_project_url,
    );
    url = reuseEditorWorkingHead
      ? editorWorkingHeadUrl(input.item, input.workingHeadUrl, projectUrl)
      : safePreparedUrl(projectUrl) ||
        editorWorkingHeadUrl(input.item, input.workingHeadUrl, projectUrl);
  } else {
    const requestedDeliveryUrl = boundedText(input.deliveryUrl);
    if (requestedDeliveryUrl) {
      url = safePreparedUrl(requestedDeliveryUrl);
      if (!url) {
        return fail("delivery-build", "现有交付地址无效");
      }
    }
    const reusable = input.preparedDelivery;
    if (
      !url &&
      reusable &&
      safePreparedUrl(reusable.url) &&
      (!sourceFormat || reusable.format === sourceFormat) &&
      (!sourceMediaType ||
        reusable.mediaType.toLowerCase() === sourceMediaType)
    ) {
      preparedDelivery = {
        ...reusable,
        url: safePreparedUrl(reusable.url),
        digest: normalizedDigest(reusable.digest),
      };
      url = preparedDelivery.url;
      sourceFormat ||= preparedDelivery.format;
      sourceMediaType ||= preparedDelivery.mediaType.toLowerCase();
      fileName = preparedDelivery.fileName;
    }
    if (!url) {
      let deliveryFile = input.file;
      if (!deliveryFile && input.createFile) {
        try {
          deliveryFile = await input.createFile();
        } catch (caught) {
          return fail("delivery-build", resultError(caught));
        }
      }
      if (!deliveryFile) {
        return fail("delivery-build", "缺少可保存的交付文件");
      }
      fileName = deliveryFile.name;
      const extension = urlExtension(deliveryFile.name);
      sourceFormat ||= extension;
      sourceMediaType ||= deliveryFile.type.toLowerCase();
      if (
        ["docx", "pdf", "pptx", "xlsx"].includes(sourceFormat) &&
        extension !== sourceFormat
      ) {
        return fail(
          "delivery-build",
          `交付文件扩展名必须是 .${sourceFormat}`,
        );
      }
      if (
        sourceMediaType &&
        deliveryFile.type &&
        deliveryFile.type.toLowerCase() !== sourceMediaType
      ) {
        return fail("delivery-build", "交付文件 MIME 与 source 合同不一致");
      }
      const digest = await sha256Blob(deliveryFile);
      let uploaded: Awaited<ReturnType<typeof uploadFile>>;
      try {
        uploaded = await dependencies.uploadFile(deliveryFile, {
          siteId: site,
          title: input.title,
          registerAsset: false,
          idempotencyKey: uploadIdempotencyKey(
            input.idempotencyKey,
            "delivery",
            digest,
          ),
        });
      } catch (caught) {
        return fail("delivery-upload", resultError(caught));
      }
      url = safePreparedUrl(uploaded.data?.file?.url);
      if (!uploaded.ok || !url) {
        return fail(
          "delivery-upload",
          uploaded.error || "存储服务没有返回交付文件地址",
        );
      }
      try {
        preparedDelivery = {
          ...preparedUploadFrom(uploaded.data?.file, url, digest),
          format: sourceFormat,
          mediaType: sourceMediaType,
          fileName,
        };
      } catch (caught) {
        return fail("delivery-upload", resultError(caught));
      }
    }
  }

  if (!projectUrl && projectSchema) projectUrl = url;
  if (input.project && !input.projectOnly && projectUrl === url) {
    return fail("contract", "交付 source 与 editor project 必须使用不同文件");
  }
  const projectUrlIsWorkingHead =
    input.projectOnly &&
    Boolean(projectUrl) &&
    (url === projectUrl ||
      Boolean(input.item.meta.editor_working_head_uses_project_url) ||
      (!existingWorkingHead && url === projectUrl));
  const rootId = String(
    input.item.meta.root_asset_id ||
      input.item.meta.parent_asset_id ||
      identity.artifactId ||
      input.item.id,
  ).slice(0, 600);
  const editorManifest =
    input.editorManifest && projectUrl
      ? {
          schema: "oceanleo.editor-manifest.v1",
          id: boundedText(input.editorManifest.id, 64),
          version: 1,
          capabilities: ["load", "mutate", "save", "reopen"],
          source: {
            kind: "url",
            format:
              boundedText(input.editorManifest.format, 120) || projectSchema,
            url: projectUrl,
          },
        }
      : undefined;
  const editorWorkingHeadMetadata = input.projectOnly
    ? {
        editor_working_head_url: url,
        editor_working_head_uses_project_url: projectUrlIsWorkingHead,
      }
    : {
        editor_working_head_url: projectUrl,
      };
  const creationMeta: Record<string, unknown> = {
    ...input.meta,
    parent_asset_id: rootId,
    root_asset_id: rootId,
    source_site: input.item.siteId || site,
    ...(sourceFormat
      ? {
          source_format: sourceFormat,
          format: sourceFormat,
          delivery_format: sourceFormat,
        }
      : {}),
    ...(sourceMediaType
      ? {
          source_media_type: sourceMediaType,
          mime: sourceMediaType,
        }
      : {}),
    ...(fileName ? { file_name: fileName } : {}),
    ...(!input.projectOnly && url ? { source_url: url } : {}),
    ...(preparedDelivery?.digest
      ? { source_digest: `sha256:${preparedDelivery.digest}` }
      : {}),
    ...(preparedDelivery?.artifactId
      ? { uploaded_source_artifact_id: preparedDelivery.artifactId }
      : {}),
    ...(preparedDelivery?.revisionId
      ? { uploaded_source_revision_id: preparedDelivery.revisionId }
      : {}),
    ...(identity.artifactId ? { artifact_id: identity.artifactId } : {}),
    ...(identity.revisionId
      ? { previous_revision_id: identity.revisionId }
      : {}),
    ...(projectUrl
      ? {
          editor_project_url: projectUrl,
          editor_project_schema: projectSchema,
          editor_project_version: 1,
          editor_manifest_url: projectUrl,
          editor_manifest_schema: projectSchema,
          editor_manifest_media_type: "application/json",
          editor_manifest: editorManifest,
          editor_saved_at: savedAt,
          ...editorWorkingHeadMetadata,
          editor_working_head_project_url: projectUrl,
          editor_working_head_schema: projectSchema,
          ...(preparedProject?.digest
            ? {
                editor_manifest_digest: `sha256:${preparedProject.digest}`,
              }
            : {}),
          ...(preparedProject?.artifactId
            ? {
                uploaded_editor_manifest_artifact_id:
                  preparedProject.artifactId,
              }
            : {}),
          ...(preparedProject?.revisionId
            ? {
                uploaded_editor_manifest_revision_id:
                  preparedProject.revisionId,
              }
            : {}),
        }
      : {}),
  };

  const hasTypedIdentity = Boolean(identity.artifactId || identity.revisionId);
  if (input.artifactRevision && hasTypedIdentity) {
    if (!identity.artifactId || !identity.revisionId) {
      return fail(
        "identity",
        "typed artifact 保存缺少完整 artifact/revision identity",
      );
    }
    if (
      identity.artifactType &&
      identity.artifactType !== input.artifactRevision.artifactType
    ) {
      return fail("identity", "typed artifact 类型与编辑器不一致");
    }
    /**
     * 这次 revision 的 `source` 用哪份字节。
     *
     * 两种形态，都在矩阵 §3.2 的接受范围内：
     *   - 有独立交付物（docx/xlsx/pptx/pdf/glb/png…）→ source 就是它；
     *   - 只有工程 JSON（`projectOnly` 的 audio / video / workflow）→ 工程 schema
     *     本身就是该类型 accepted 的 `source.format`（`oceanleo.audio-project.v1`、
     *     `oceanleo.timeline.v1`、`oceanleo.workflow.v1`…），source 就是它。
     *
     * 原来这里硬要求「交付摘要 + 工程摘要 + editorManifest 三者同时在场」，
     * 于是没有工程 sidecar 的 `pdf` 和没有独立交付物的 `audio`/`video` 在类型层面
     * 就永远进不来——这正是 A9-1 里那 8 类没有提交路径的机制之一。
     */
    const commitSource = preparedDelivery?.digest
      ? {
          url,
          digest: preparedDelivery.digest,
          format: sourceFormat,
          mediaType: sourceMediaType,
        }
      : preparedProject?.digest && projectUrl
        ? {
            url: projectUrl,
            digest: preparedProject.digest,
            format: sourceFormat || projectSchema,
            mediaType: "application/json",
          }
        : null;
    if (!commitSource || !commitSource.format) {
      return fail(
        "contract",
        "typed artifact revision 既没有交付字节也没有可作为 source 的工程摘要",
      );
    }

    // Cover bitmap: the only rendition the office three can offer the backend's
    // displayable-primary assertion. Reuse a receipt from a previous attempt so
    // a retry never re-renders and re-uploads the same bytes.
    if (input.preparedPreview && safePreparedUrl(input.preparedPreview.url)) {
      preparedPreview = {
        ...input.preparedPreview,
        url: safePreparedUrl(input.preparedPreview.url),
        digest: normalizedDigest(input.preparedPreview.digest),
      };
    } else if (input.createPreview) {
      let previewBlob: Blob | null = null;
      try {
        previewBlob = await input.createPreview();
      } catch (caught) {
        previewWarning = artifactSaveStepMessage(
          "preview-render",
          resultError(caught),
        );
      }
      if (previewBlob && previewBlob.size > 0) {
        const previewFile = new File(
          [previewBlob],
          `${input.title}.preview.png`,
          { type: EDITOR_PREVIEW_MEDIA_TYPE },
        );
        const previewDigest = await sha256Blob(previewFile);
        let previewUpload: Awaited<ReturnType<typeof uploadFile>> | null = null;
        try {
          previewUpload = await dependencies.uploadFile(previewFile, {
            siteId: site,
            title: `${input.title}封面`,
            registerAsset: false,
            idempotencyKey: uploadIdempotencyKey(
              input.idempotencyKey,
              "preview",
              previewDigest,
            ),
          });
        } catch (caught) {
          return fail("preview-upload", resultError(caught));
        }
        const previewUrl = safePreparedUrl(previewUpload.data?.file?.url);
        if (!previewUpload.ok || !previewUrl) {
          return fail(
            "preview-upload",
            previewUpload.error || "存储服务没有返回封面预览图地址",
          );
        }
        try {
          preparedPreview = {
            ...preparedUploadFrom(
              previewUpload.data?.file,
              previewUrl,
              previewDigest,
            ),
            mediaType: EDITOR_PREVIEW_MEDIA_TYPE,
          };
        } catch (caught) {
          return fail("preview-upload", resultError(caught));
        }
      } else if (!previewWarning) {
        previewWarning = artifactSaveStepMessage(
          "preview-render",
          "当前环境画不出封面位图（缺少 canvas 或内容为空）",
        );
      }
    }

    const plan = planArtifactSaveRenditions(
      input.artifactRevision.artifactType,
      {
        delivery: preparedDelivery?.digest
          ? { url, digest: preparedDelivery.digest }
          : null,
        editorManifest:
          editorManifest && preparedProject?.digest
            ? { url: projectUrl, digest: preparedProject.digest }
            : null,
        previewBitmap: preparedPreview
          ? { url: preparedPreview.url, digest: preparedPreview.digest }
          : null,
      },
    );
    if (!plan.ok) {
      return fail(
        "contract",
        previewWarning ? `${plan.error}（${previewWarning}）` : plan.error,
      );
    }

    let published: Awaited<ReturnType<typeof createArtifactRevision>>;
    try {
      published = await dependencies.createArtifactRevision(
        identity.artifactId,
        {
          expectedRevisionId: identity.revisionId,
          artifactType: input.artifactRevision.artifactType,
          source: {
            format: commitSource.format,
            url: commitSource.url,
            digest: commitSource.digest,
          },
          renditions: plan.renditions,
          provenance: {
            editor: editorManifest?.id || input.artifactRevision.editor || "",
            previousRevisionId: identity.revisionId,
            editorProjectSchema: projectSchema,
            sourceFormat,
            displayable_primary: plan.displayablePrimary,
            ...(preparedPreview
              ? {
                  preview_digest: preparedPreview.digest,
                  preview_media_type: preparedPreview.mediaType,
                  preview_static_frame: "final",
                }
              : {}),
            ...input.artifactRevision.provenance,
          },
        },
      );
    } catch (caught) {
      return fail("revision-publish", resultError(caught));
    }
    const next = published.data;
    const nextSource = next?.artifact?.renditions.source;
    const nextManifest = next?.artifact?.renditions.editor_manifest;
    if (!published.ok || !next) {
      // 后端拒绝时最常见的原因就是拿不到可展示主产物；把渲染失败一起说清楚。
      return fail(
        "revision-publish",
        previewWarning
          ? `${published.error || "服务端未接受这次新版本提交"}（${previewWarning}）`
          : published.error || "服务端未接受这次新版本提交",
      );
    }
    const manifestPlanned = plan.renditions.some(
      (rendition) => rendition.purpose === "editor_manifest",
    );
    if (
      next.artifactId !== identity.artifactId ||
      !next.revisionId ||
      next.revisionId === identity.revisionId ||
      next.artifactType !== input.artifactRevision.artifactType ||
      next.artifact?.sourceFormat !== commitSource.format ||
      nextSource?.revisionId !== next.revisionId ||
      normalizedDigest(nextSource?.digest) !== commitSource.digest ||
      // Only assert the media type when the caller declared one; a project-JSON
      // source is described by its schema, not by a wire MIME the caller picked.
      (Boolean(commitSource.mediaType) &&
        nextSource?.mediaType.toLowerCase() !== commitSource.mediaType) ||
      (manifestPlanned &&
        (nextManifest?.revisionId !== next.revisionId ||
          normalizedDigest(nextManifest?.digest) !==
            preparedProject?.digest))
    ) {
      return fail(
        "revision-verify",
        "服务端返回的新版本不是同一 artifact root，或 source / 可编辑工程摘要对不上",
      );
    }
    // Every rendition the contract demanded must come back pinned to the new
    // revision; a silently dropped preview is what leaves shelves thumbnail-less.
    const unpinned = plan.renditions.find((rendition) => {
      const returned = next.artifact?.renditions[rendition.purpose];
      return (
        !returned ||
        returned.revisionId !== next.revisionId ||
        normalizedDigest(returned.digest) !== rendition.digest
      );
    });
    if (unpinned) {
      return fail(
        "revision-verify",
        `服务端返回的新版本缺少契约要求的 ${unpinned.purpose} rendition，或它没有固定到这次新版本`,
      );
    }
    const item: LibraryItem = {
      ...next,
      title: input.title,
      url: nextSource.url || url,
      meta: { ...next.meta, ...creationMeta },
    };
    return finish({
      ok: true,
      url: nextSource.url || url,
      versionId: next.revisionId,
      artifactId: next.artifactId,
      revisionId: next.revisionId,
      previousRevisionId: identity.revisionId,
      item,
    });
  }

  let saved: Awaited<ReturnType<typeof saveCreations>>;
  try {
    saved = await dependencies.saveCreations(site, [
      {
        url,
        ...(input.thumbUrl ? { thumb_url: input.thumbUrl } : {}),
        media_type: input.mediaType,
        title: input.title,
        kind: input.kind,
        meta: creationMeta,
      },
    ]);
  } catch (caught) {
    return fail("creation-register", resultError(caught));
  }
  const rawSavedItem = saved.data?.items?.[0];
  if (
    !saved.ok ||
    Number(saved.data?.saved || 0) !== 1 ||
    !rawSavedItem
  ) {
    return fail(
      "creation-register",
      saved.error || "我的库没有确认这次登记",
    );
  }
  const normalized = normalizeWork(rawSavedItem);
  const item: LibraryItem = {
    ...normalized,
    title: input.title,
    url,
    meta: { ...normalized.meta, ...creationMeta },
  };
  return finish({
    ok: true,
    versionId:
      normalized.revisionId ||
      boundedText(rawSavedItem.revision_id, 600) ||
      rawSavedItem.id,
    artifactId: normalized.artifactId || "",
    revisionId: normalized.revisionId || "",
    item,
  });
}

/** Use production dependencies for the shared save producer. */
export async function saveFileToLibrary(
  input: SaveToLibraryInput,
): Promise<SaveToLibraryResult> {
  return saveFileToLibraryWithDependencies(input, SAVE_DEPENDENCIES);
}

/** savedUrl 变化时回调 onSaved（幂等：同一 URL 只回调一次）。 */
export function useOnSaved(
  savedUrl: string,
  onSaved?: (url: string) => void,
): void {
  const reported = useRef("");
  useEffect(() => {
    if (savedUrl && savedUrl !== reported.current) {
      reported.current = savedUrl;
      onSaved?.(savedUrl);
    }
  }, [savedUrl, onSaved]);
}

/** 取 URL path 部分的小写扩展名（无点），解析失败返回空串。 */
export function urlExtension(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url, "https://oceanleo.invalid");
    const match = parsed.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}
