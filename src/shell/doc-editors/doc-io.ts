"use client";

// ============================================================================
// @oceanleo/ui — doc-editors 共享 IO（高级内容工作台 v2 文档三件套公共层）
// ----------------------------------------------------------------------------
// 富文本 / 表格 / Deck 三个编辑器共用：文件下载、Blob→dataURL、「保存到我的库」
// 两步链路（uploadFile 上传成品 → saveWorks 登记 creation），以及 onSaved 回调
// 去重 hook。避免三处重复同一套上传登记样板。
// ============================================================================

import { useEffect, useRef } from "react";
import { saveWorks, uploadFile, type MediaType } from "../../lib/database";
import type { LibraryItem } from "../library-data";

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
  file: File;
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
  /** The exported delivery file is itself the exact editable project. */
  deliveryProjectSchema?: string;
}

export interface SaveToLibraryResult {
  ok: boolean;
  url: string;
  versionId: string;
  projectUrl: string;
  projectSchema: string;
  error: string;
}

export type PersistedEditorVersion = Pick<
  SaveToLibraryResult,
  "url" | "versionId" | "projectUrl" | "projectSchema"
>;

/** 上传成品文件并登记到我的库；error 为空串时由调用方兜底文案。 */
export async function saveFileToLibrary(
  input: SaveToLibraryInput,
): Promise<SaveToLibraryResult> {
  const site = input.siteId || input.fallbackSite;
  const savedAt = new Date().toISOString();
  let projectUrl = "";
  let projectSchema = (input.deliveryProjectSchema || "").trim().slice(0, 120);
  if (input.project) {
    projectSchema = input.project.schema.trim().slice(0, 120);
    const projectJson = JSON.stringify({
      schema: projectSchema,
      version: 1,
      updatedAt: savedAt,
      data: input.project.data,
    });
    if (new TextEncoder().encode(projectJson).byteLength > 20_000_000) {
      return {
        ok: false,
        url: "",
        versionId: "",
        projectUrl: "",
        projectSchema,
        error: "可编辑工程超过 20MB 安全上限",
      };
    }
    const projectUpload = await uploadFile(
      new File([projectJson], `${input.title}.oceanleo-project.json`, {
        type: "application/json",
      }),
      {
        siteId: site,
        title: `${input.title}工程`,
        registerAsset: false,
        idempotencyKey: `${input.idempotencyKey}:project`,
      },
    );
    projectUrl = projectUpload.data?.file?.url || "";
    if (!projectUpload.ok || !projectUrl) {
      return {
        ok: false,
        url: "",
        versionId: "",
        projectUrl: "",
        projectSchema,
        error: projectUpload.error || "",
      };
    }
  }
  const uploaded = await uploadFile(input.file, {
    siteId: site,
    title: input.title,
    registerAsset: false,
    idempotencyKey: `${input.idempotencyKey}:delivery`,
  });
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    return {
      ok: false,
      url: "",
      versionId: "",
      projectUrl,
      projectSchema,
      error: uploaded.error || "",
    };
  }
  if (!projectUrl && projectSchema) projectUrl = url;
  const saved = await saveWorks(site, [
    {
      url,
      ...(input.thumbUrl ? { thumb_url: input.thumbUrl } : {}),
      media_type: input.mediaType,
      title: input.title,
      kind: input.kind,
      meta: {
        parent_asset_id: input.item.id,
        source_site: input.item.siteId || site,
        ...(projectUrl
          ? {
              editor_project_url: projectUrl,
              editor_project_schema: projectSchema,
              editor_saved_at: savedAt,
            }
          : {}),
        ...input.meta,
      },
    },
  ]);
  if (!saved.ok || Number(saved.data?.saved || 0) !== 1) {
    return {
      ok: false,
      url,
      versionId: "",
      projectUrl,
      projectSchema,
      error: saved.error || "",
    };
  }
  return {
    ok: true,
    url,
    versionId: saved.data?.items?.[0]?.id || "",
    projectUrl,
    projectSchema,
    error: "",
  };
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
