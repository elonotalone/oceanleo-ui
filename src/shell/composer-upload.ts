"use client";

// ============================================================================
// @oceanleo/ui — 输入框附件上传（私有，W6 2026-10-31）
// ----------------------------------------------------------------------------
// 主站首页、任务页、子站输入框的「＋/拖拽/粘贴」文件都走这里：
//   - 只走私有路由 `POST /v1/database/private-upload`（桶 `project-assets`），
//     带内容绑定的幂等键；失败就是失败，绝不转去公开 `media-uploads`。
//   - 单文件 > 20MB 直接拒绝（「文件超过 20MB，暂不支持」），不发请求。
//   - 结果带 `artifactId`/`revisionId` + typed `libraryItem`（合同 C2）；
//     发给 agent 的 `attachment` 只有引用、`url` 为空串，网关按 owner 解析。
// 缩略图由调用方用本地 `blob:` 地址画，这里不返回任何存储 URL。
// ============================================================================

import type { AgentAttachment } from "../lib/agent";
import {
  PRIVATE_ATTACHMENT_MAX_BYTES,
  PRIVATE_ATTACHMENT_TOO_LARGE,
  agentAttachmentFromPrivateUpload,
  attachmentRef,
  isRawStorageUrl,
  mediaTypeFromMime,
} from "../lib/attachment-url";
import {
  normalizeUploadIdempotencyKey,
  uploadFile,
  type FileItem,
  type MediaType,
} from "../lib/database";
import {
  artifactIsVisible,
  normalizeArtifactProjectionResult,
} from "./artifact-contract";
import { artifactProjectionToLibraryItem, type LibraryItem } from "./library-data";
import type { ComposerAttachment } from "./LeoComposer";

export interface ComposerPrivateUpload {
  artifactId: string;
  revisionId: string;
  /** Typed Library projection (same result as `canonicalUploadLibraryItem`). */
  libraryItem?: LibraryItem;
  name: string;
  mime?: string;
  mediaType?: MediaType;
  /** What goes to `/v1/agent/tasks`: reference only, `url: ""`. */
  attachment: AgentAttachment;
}

export type ComposerUploadResult =
  | { ok: true; upload: ComposerPrivateUpload }
  | { ok: false; error: string; status?: number; tooLarge?: boolean };

/** Same checks as `MyLibrary.canonicalUploadLibraryItem`, without loading MyLibrary. */
export function composerLibraryItem(uploaded: FileItem): LibraryItem | undefined {
  const normalized = normalizeArtifactProjectionResult(uploaded.artifact);
  if (!normalized.ok || !normalized.data) return undefined;
  const artifactId = String(uploaded.artifact_id || "").trim();
  const revisionId = String(uploaded.revision_id || "").trim();
  if (
    !artifactId ||
    !revisionId ||
    normalized.data.artifactId !== artifactId ||
    normalized.data.revisionId !== revisionId ||
    !artifactIsVisible(normalized.data)
  ) {
    return undefined;
  }
  return artifactProjectionToLibraryItem(normalized.data);
}

/**
 * A file already in the user's private Library → a ready composer attachment
 * (「从资料库添加文件」 and a restored draft use this). Same shape the home page's
 * 「最近文件」 builds: the private reference + typed `libraryItem`; the preview is a
 * gateway rendition, never a raw storage URL. No reference → `null` (not attachable).
 */
export function composerAttachmentFromLibraryItem(item: LibraryItem): ComposerAttachment | null {
  const ref =
    attachmentRef(item) ??
    attachmentRef({ artifactId: item.artifact?.artifactId, revisionId: item.artifact?.revisionId });
  if (!ref) return null;
  const name = item.title || undefined;
  const mime = item.artifact?.renditions?.source?.mediaType || undefined;
  const poster = item.posterUrl && !isRawStorageUrl(item.posterUrl) ? item.posterUrl : undefined;
  const mediaType = mediaTypeFromMime(mime, name) ?? item.kind;
  return {
    id: ref.artifactId,
    ...(name ? { name } : {}),
    ...(poster ? { previewUrl: poster } : {}),
    ...(mime ? { mime } : {}),
    ...(mediaType ? { mediaType } : {}),
    artifactId: ref.artifactId,
    revisionId: ref.revisionId,
    libraryItem: item,
  };
}

/** A ready private composer attachment → what goes to `/v1/agent/tasks` (reference only). */
export function agentAttachmentFromComposer(att: ComposerAttachment): AgentAttachment | null {
  const ref = attachmentRef(att);
  if (!ref) return null;
  const mediaType = att.mediaType || mediaTypeFromMime(att.mime, att.name);
  return {
    url: "",
    artifact_id: ref.artifactId,
    revision_id: ref.revisionId,
    ...(att.name ? { name: att.name } : {}),
    ...(att.mime ? { mime: att.mime } : {}),
    ...(mediaType ? { media_type: mediaType } : {}),
  };
}

export async function uploadComposerFile(
  file: File,
  opts: {
    siteId: string;
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
  },
): Promise<ComposerUploadResult> {
  if (file.size > PRIVATE_ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: PRIVATE_ATTACHMENT_TOO_LARGE, status: 413, tooLarge: true };
  }
  const siteId = opts.siteId || "home";
  const idempotencyKey = await normalizeUploadIdempotencyKey([
    "composer-upload-v1",
    siteId,
    file.name,
    file.size,
    file.lastModified,
  ]);
  const result = await uploadFile(file, {
    siteId,
    title: file.name,
    privateUpload: true,
    idempotencyKey,
    signal: opts.signal,
    onProgress: opts.onProgress,
  });
  if (!result.ok || !result.data?.file) {
    return {
      ok: false,
      error: result.status === 413 ? PRIVATE_ATTACHMENT_TOO_LARGE : result.error || "文件上传失败",
      status: result.status,
      tooLarge: result.status === 413,
    };
  }
  const uploaded = result.data.file;
  const attachment = agentAttachmentFromPrivateUpload(uploaded, {
    name: file.name,
    mime: file.type,
  });
  if (!attachment?.artifact_id || !attachment.revision_id) {
    return { ok: false, error: "上传未返回私有文件编号，请重试", status: result.status };
  }
  const mime = attachment.mime;
  const libraryItem = composerLibraryItem(uploaded);
  return {
    ok: true,
    upload: {
      artifactId: attachment.artifact_id,
      revisionId: attachment.revision_id,
      ...(libraryItem ? { libraryItem } : {}),
      name: attachment.name || file.name,
      mime,
      mediaType: mediaTypeFromMime(mime, file.name),
      attachment,
    },
  };
}

// Contract C2: the composer attachment object gains the private identity.
// Declared here (the upload owner) so LeoComposer/AttachmentStrip and the
// right workspace read one typed shape without a second interface.
declare module "./LeoComposer" {
  interface ComposerAttachment {
    /** Private Library artifact of a finished upload. */
    artifactId?: string;
    revisionId?: string;
    /** Typed Library item for opening it in the right workspace / editor. */
    libraryItem?: LibraryItem;
    /** image | doc | video | audio | … (sent as `media_type`). */
    mediaType?: string;
  }
}
