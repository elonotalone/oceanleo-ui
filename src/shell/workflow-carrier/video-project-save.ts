/**
 * 视频画布 v2 的真保存（D11）：每次保存 = 服务器上一个新的 typed revision。
 *
 * - source 就是 v2 工程 JSON 本身（`oceanleo.video.project.v2`，workflow 类型的
 *   accepted format），走共享内核 `saveFileToLibrary` 的 CAS 提交：基线是编辑器手里
 *   的 revision，保存成功后由调用方把基线前移到回执里的新 revision（W04 内核）。
 * - 封面 PNG 选配（workflow 契约 preview | full 任一即可）。
 * - 10-22 的修复不回退：没有 durable 身份、或源没载入，一律不报「已保存」。
 */
import type { LibraryItem } from "../library-data";
import {
  saveFileToLibrary,
  type SaveToLibraryInput,
  type SaveToLibraryResult,
} from "../doc-editors/doc-io";
import {
  VIDEO_PROJECT_V2_MEDIA_TYPE,
  VIDEO_PROJECT_V2_SCHEMA,
  serializeVideoProjectDoc,
  type VideoProjectDoc,
} from "./video-project-doc";

export const VIDEO_PROJECT_EDITOR_ID = "video-canvas";

export type VideoProjectSaveOutcome =
  | { ok: true; item: LibraryItem; revisionId: string }
  | { ok: false; error: string };

export interface VideoProjectSaveRequest {
  /** The editor's current base (advanced after every successful save). */
  base: LibraryItem;
  doc: VideoProjectDoc;
  editRevision: number;
  siteId?: string;
  createPreview?: () => Promise<Blob | null>;
}

function durable(item: LibraryItem): boolean {
  return Boolean(item.artifactId && item.revisionId && item.artifactType === "workflow");
}

export function videoProjectSaveInput(request: VideoProjectSaveRequest): SaveToLibraryInput {
  const { base, doc } = request;
  const title = String(base.title || doc.title || "视频画布").slice(0, 200);
  const json = serializeVideoProjectDoc(doc);
  return {
    item: base,
    siteId: request.siteId || "",
    fallbackSite: "video",
    file: new File([json], `${title}.json`, { type: VIDEO_PROJECT_V2_MEDIA_TYPE }),
    sourceFormat: VIDEO_PROJECT_V2_SCHEMA,
    sourceMediaType: VIDEO_PROJECT_V2_MEDIA_TYPE,
    title,
    mediaType: "video_canvas",
    kind: String(base.kind || "video_canvas"),
    idempotencyKey: `video-canvas:${base.artifactId}:${base.revisionId}:${request.editRevision}`,
    meta: { editor: VIDEO_PROJECT_EDITOR_ID, editor_capability: "video-canvas" },
    artifactRevision: { artifactType: "workflow", editor: VIDEO_PROJECT_EDITOR_ID },
    ...(request.createPreview ? { createPreview: request.createPreview } : {}),
  };
}

export async function saveVideoProject(
  request: VideoProjectSaveRequest,
  save: (input: SaveToLibraryInput) => Promise<SaveToLibraryResult> = saveFileToLibrary,
): Promise<VideoProjectSaveOutcome> {
  if (!durable(request.base)) {
    return {
      ok: false,
      error: "这份视频画布还不在我的库里，不能保存为新版本。",
    };
  }
  let result: SaveToLibraryResult;
  try {
    result = await save(videoProjectSaveInput(request));
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error && caught.message ? caught.message : "保存失败",
    };
  }
  if (!result.ok || !result.item || !result.revisionId) {
    return { ok: false, error: result.error || "服务器没有确认这次保存" };
  }
  if (result.item.artifactId !== request.base.artifactId || result.revisionId === request.base.revisionId) {
    return { ok: false, error: "服务器返回的不是这份视频画布的新版本" };
  }
  return { ok: true, item: result.item, revisionId: result.revisionId };
}
