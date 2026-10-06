// 聊天附件上传（契约 §4.2）：init → 直传到对象存储 → finalize。可取消、带进度、单个 ≤100MB。
// 依赖全部可注入（测试用）；默认走 messagesApi 与 `src/lib/upload/progress.ts` 的 xhrUpload。

import { messagesApi, type MessagesApi, type UploadInitResult } from "../../../lib/im/messages-api";
import type { ImAttachment } from "../../../lib/im/types";
import { xhrUpload, type XhrUploadOptions, type XhrUploadResult } from "../../../lib/upload/progress";

/** 单个附件上限：100MB。 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export type UploadErrorCode =
  | "too_large"
  | "empty"
  | "cancelled"
  | "init_failed"
  | "transfer_failed"
  | "finalize_failed";

export class UploadError extends Error {
  readonly code: UploadErrorCode;
  readonly detail: string;
  constructor(code: UploadErrorCode, detail = "") {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export interface UploadDeps {
  api: Pick<MessagesApi, "uploadInit" | "uploadFinalize">;
  transfer: (options: XhrUploadOptions) => Promise<XhrUploadResult>;
}

export interface UploadOptions {
  /** 0..1 */
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
  /** 指定附件类型（语音用）；不给就按 MIME 判断。 */
  kind?: ImAttachment["kind"];
  deps?: UploadDeps;
}

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

/** 按 MIME 归类：图片 / 视频 / 音频 / 其余当文件（文件只给下载链接，不内联预览）。 */
export function attachmentKindFor(file: Pick<FileLike, "type" | "name">): ImAttachment["kind"] {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/** 发消息时的 kind：一条消息带多个附件时，全是图片就算 image，否则按第一个。 */
export function messageKindForAttachments(
  attachments: ImAttachment[],
): "file" | "image" | "video" | "audio" | "voice" {
  if (attachments.length === 0) return "file";
  const first = attachments[0].kind;
  if (attachments.every((a) => a.kind === first)) return first;
  return "file";
}

export function checkUploadable(file: Pick<FileLike, "size">): UploadErrorCode | null {
  if (!file.size || file.size <= 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "too_large";
  return null;
}

const defaultDeps = (): UploadDeps => ({
  api: messagesApi,
  transfer: xhrUpload,
});

function errorDetail(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "");
  }
  return "";
}

/**
 * 上传一个文件，返回 finalize 之后的附件。失败抛 `UploadError`；取消抛 code 为 `cancelled` 的 `UploadError`。
 * 顺序固定：超限检查（不发任何请求）→ init → 直传 → finalize。
 */
export async function uploadAttachment(
  file: File | (FileLike & Blob),
  options: UploadOptions = {},
): Promise<ImAttachment> {
  const deps = options.deps ?? defaultDeps();
  const problem = checkUploadable(file);
  if (problem) throw new UploadError(problem);
  const { signal } = options;
  const ensureAlive = () => {
    if (signal?.aborted) throw new UploadError("cancelled");
  };
  ensureAlive();

  const kind = options.kind ?? attachmentKindFor(file);
  const mime = file.type || "application/octet-stream";
  let init: UploadInitResult;
  try {
    init = await deps.api.uploadInit({ name: file.name, size: file.size, mime, kind });
  } catch (error) {
    throw new UploadError("init_failed", errorDetail(error));
  }
  ensureAlive();

  if (!init.upload_complete) {
    const result = await deps.transfer({
      url: init.upload_url,
      method: "PUT",
      body: file,
      headers: { "Content-Type": mime, ...(init.headers ?? {}) },
      onProgress: (loaded, total) => {
        const denominator = total > 0 ? total : file.size;
        options.onProgress?.(Math.min(1, loaded / denominator));
      },
      signal,
    });
    if (result.aborted || signal?.aborted) throw new UploadError("cancelled");
    if (!result.ok) throw new UploadError("transfer_failed", String(result.status || ""));
  }
  options.onProgress?.(1);
  ensureAlive();

  try {
    return await deps.api.uploadFinalize(init.finalize_token);
  } catch (error) {
    throw new UploadError("finalize_failed", errorDetail(error));
  }
}

export interface UploadJob {
  id: string;
  file: File;
  status: "uploading" | "done" | "failed";
  ratio: number;
  error: UploadErrorCode | null;
  attachment: ImAttachment | null;
}
