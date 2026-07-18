"use client";

// 封面帧 / 草稿的上传持久化（无 React state），useVideoTimeline 调用。
// 草稿合同：TimelineDoc JSON 先 uploadFile 成公网 URL，再 saveWorks 登记
// meta.timeline_doc + is_draft + parent_asset_id，回库后可从 meta 恢复。
// 文案经调用方传入的 tt（useUI）包裹，保持可本地化。

import { uploadFile } from "../../lib/database";
import type { UITranslate } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import { saveProjectWorkingHead } from "../doc-editors/doc-io";
import type { TimelineDoc } from "./types";

export interface PersistResult {
  url?: string;
  versionId?: string;
  projectUrl?: string;
  projectSchema?: string;
  error?: string;
}

/** 把预览 canvas 当前帧导出 PNG 并上传，返回公网 URL。 */
export async function uploadCoverPng(
  canvas: HTMLCanvasElement,
  title: string,
  siteId: string,
  idempotencyKey: string,
  tt: UITranslate,
): Promise<PersistResult> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return { error: tt("封面导出失败：画布不可读取") };
  const uploaded = await uploadFile(
    new File([blob], `${title}.png`, { type: "image/png" }),
    { siteId, title, idempotencyKey },
  );
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    return { error: uploaded.error || tt("封面上传失败") };
  }
  return { url };
}

/** 上传 TimelineDoc 草稿 JSON 并登记到我的库。 */
export async function uploadDraft(
  doc: TimelineDoc,
  item: LibraryItem,
  title: string,
  siteId: string,
  idempotencyKey: string,
  workingHeadUrl: string,
  tt: UITranslate,
): Promise<PersistResult> {
  const saved = await saveProjectWorkingHead({
    item,
    siteId,
    fallbackSite: "oceanleo",
    title,
    idempotencyKey,
    workingHeadUrl,
    mediaType: "video",
    kind: "video",
    meta: {
      timeline_doc: doc,
      is_draft: true,
    },
    project: {
      schema: "oceanleo.timeline.v1",
      data: doc,
    },
  });
  if (!saved.ok) {
    return { error: saved.error || tt("草稿已上传，但登记到我的库失败") };
  }
  return {
    url: saved.url,
    versionId: saved.versionId,
    projectUrl: saved.projectUrl,
    projectSchema: saved.projectSchema,
  };
}
