"use client";

// ============================================================================
// @oceanleo/ui — 保存中间文件走私有 staging（不再一存一个隐藏库 root）
// ----------------------------------------------------------------------------
// 10-23 实测：编辑器每次保存把工程 JSON / 交付件 / 封面各传一次
// `/v1/database/upload register_asset=false`，后端为每份 ensure 一个
// `editorInternal` artifact root（操作员库里已有 1,431 个）。typed revision 的
// 字节其实只需要一个私有、可校验的定位：提交时后端把它复制进内容寻址存储并记
// blob claim，revision 自己持有字节。所以有 typed 身份的保存改走
// `POST /v1/artifacts/{id}/staging`（私有桶 editor-staging/，24h 后无引用即清）。
// ============================================================================

import type { LibraryItem } from "../library-data";

const METADATA_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_METADATA_BYTES = 8_000;

/** Client-side bound; the server applies its own allowlist again. */
export function boundedRevisionMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    ([key, entry]) => METADATA_KEY.test(key) && entry !== undefined,
  );
  if (entries.length === 0) return undefined;
  const bounded = Object.fromEntries(entries);
  try {
    const encoded = JSON.stringify(bounded);
    if (new TextEncoder().encode(encoded).byteLength > MAX_METADATA_BYTES) {
      return undefined;
    }
    return JSON.parse(encoded) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

interface StagedProject {
  blobId?: string;
}

/** Project JSON staged privately has no URL of its own; use the server rendition. */
export function stagedProjectUrl(
  committed: LibraryItem,
  project: StagedProject | undefined,
): string {
  if (!project?.blobId) return "";
  return committed.artifact?.renditions.editor_manifest?.url || "";
}

/** Editor metadata pointing at the committed manifest instead of a staging path. */
export function stagedLocatorMeta(
  committed: LibraryItem,
  project: StagedProject | undefined,
  manifest?: unknown,
): Record<string, unknown> {
  const projectUrl = stagedProjectUrl(committed, project);
  if (!projectUrl) return {};
  const declared =
    manifest && typeof manifest === "object" && !Array.isArray(manifest)
      ? (manifest as Record<string, unknown>)
      : null;
  const source =
    declared?.source && typeof declared.source === "object"
      ? (declared.source as Record<string, unknown>)
      : null;
  return {
    ...(declared && source
      ? { editor_manifest: { ...declared, source: { ...source, url: projectUrl } } }
      : {}),
    editor_project_url: projectUrl,
    editor_manifest_url: projectUrl,
    editor_working_head_url: projectUrl,
    editor_working_head_project_url: projectUrl,
  };
}

/** Shape-compatible subset of `uploadFile`'s result that doc-io reads. */
export interface IntermediateUploadResult {
  ok: boolean;
  error?: string;
  status?: number;
  data?: {
    file?: {
      url?: string;
      blob_id?: string;
      artifact_id?: string;
      revision_id?: string;
      meta?: Record<string, unknown>;
    };
  };
}

export type StageBlob = (
  artifactId: string,
  file: File,
) => Promise<{
  ok: boolean;
  data?: { blobId: string; digest: string };
  error?: string;
  status?: number;
  retryable?: boolean;
}>;

/** Gateways without the staging route, or bytes it does not stage, keep the old upload. */
const STAGING_FALLBACK_STATUSES = new Set([404, 405, 413, 415, 422]);

/**
 * Upload one save intermediate. With a typed identity it goes to private
 * staging (no Library root); otherwise, or when staging cannot take these
 * bytes, it uses the legacy upload unchanged.
 */
export async function uploadSaveIntermediate(
  file: File,
  options: { stageFor?: string; stage?: StageBlob },
  legacy: () => Promise<IntermediateUploadResult>,
): Promise<IntermediateUploadResult> {
  if (options.stageFor && options.stage) {
    const staged = await options.stage(options.stageFor, file);
    if (staged.ok && staged.data) {
      return {
        ok: true,
        data: {
          file: {
            url: "",
            blob_id: staged.data.blobId,
            meta: { content_digest: staged.data.digest },
          },
        },
      };
    }
    if (!STAGING_FALLBACK_STATUSES.has(Number(staged.status))) {
      return {
        ok: false,
        error: staged.error || "保存暂存区暂时不可用",
        status: staged.status,
      };
    }
  }
  return legacy();
}

/** Upload receipt → locator; exactly one of url / blobId is set when ok. */
export function intermediateLocator(
  uploaded: IntermediateUploadResult,
  safeUrl: (value: unknown) => string,
): { url: string; blobId: string } | null {
  const file = uploaded.data?.file;
  const blobId = String(file?.blob_id || "").trim();
  if (uploaded.ok && blobId) return { url: "", blobId };
  const url = safeUrl(file?.url);
  return uploaded.ok && url ? { url, blobId: "" } : null;
}
