"use client";

/**
 * 视觉影音家族访问后端转换端点的唯一入口。
 *
 * 端点是既有的（`oceanleo/backend/app/routers/convert_router.py`）：
 *   POST /v1/convert/image  multipart file + target + quality → 直接流回转换后的字节
 *   POST /v1/convert/media  multipart file + target          → 同上
 * 前端不塞任何新的解析器：转不动就把人话原因抛出去，由调用方显示。
 */

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import {
  DEFAULT_LOSSY_QUALITY,
  clampLossyQuality,
  visualFileExtension,
} from "./visual-formats";

/** 单次转换的输入上限，和网关 `_MAX_UPLOAD_BYTES` 之上的直传口径保持一致。 */
export const MAX_CONVERT_INPUT_BYTES = 200 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  glb: "model/gltf-binary",
  svg: "image/svg+xml",
  json: "application/json",
};

export function visualMimeFor(extension: string): string {
  return MIME_BY_EXTENSION[extension.toLowerCase()] || "application/octet-stream";
}

/** 把后缀换掉，其余文件名原样保留。 */
export function withExtension(name: string, extension: string): string {
  const clean = String(name || "文件").split(/[\\/]/).pop() || "文件";
  const stem = clean.includes(".")
    ? clean.slice(0, clean.lastIndexOf("."))
    : clean;
  return `${stem || "文件"}.${extension}`;
}

async function postConvert(
  path: "/v1/convert/image" | "/v1/convert/media",
  file: Blob,
  fileName: string,
  fields: Record<string, string>,
): Promise<Blob> {
  if (file.size > MAX_CONVERT_INPUT_BYTES) {
    throw new Error(
      `这个文件 ${Math.round(file.size / 1024 / 1024)}MB，超过 ${
        MAX_CONVERT_INPUT_BYTES / 1024 / 1024
      }MB 的转换上限。`,
    );
  }
  const token = await accessToken();
  if (!token) throw new Error("请先登录再做格式转换。");
  const body = new FormData();
  body.append("file", file, fileName);
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      cache: "no-store",
    });
  } catch {
    throw new Error("网络不通，格式转换没有做成。");
  }
  if (!response.ok) {
    let detail = "";
    try {
      const text = await response.text();
      try {
        detail = String(JSON.parse(text)?.detail || "").trim();
      } catch {
        detail = text.slice(0, 200).trim();
      }
    } catch {
      detail = "";
    }
    if (response.status === 401) throw new Error("登录已过期，请重新登录。");
    if (response.status === 402) {
      throw new Error(detail || "积分不足，这次格式转换没有做成。");
    }
    throw new Error(detail || `格式转换失败（${response.status}）。`);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("转换回来的文件是空的，这次没有成功。");
  return blob;
}

/** 图片转换：heic→jpg、bmp→png、png→webp 之类。质量只对有损目标有意义。 */
export async function convertImageBlob(
  file: Blob,
  fileName: string,
  target: string,
  quality: number = DEFAULT_LOSSY_QUALITY,
): Promise<Blob> {
  return postConvert("/v1/convert/image", file, fileName, {
    target,
    quality: String(clampLossyQuality(quality)),
  });
}

/** 影音转换：mov→mp4、flac→mp3、mp4→webm 之类。端点不收质量参数。 */
export async function convertMediaBlob(
  file: Blob,
  fileName: string,
  target: string,
): Promise<Blob> {
  return postConvert("/v1/convert/media", file, fileName, { target });
}

/** 把一个 Blob 交到用户手上。浏览器之外（SSR / 测试）直接不做事。 */
export function downloadVisualBlob(blob: Blob, fileName: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 取远端产物的字节；转换要先把它拿回本地。 */
export async function fetchDeliverableBlob(url: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error("取不到刚渲染出来的文件，转换没有做成。");
  }
  if (!response.ok) {
    throw new Error(`取不到刚渲染出来的文件（${response.status}）。`);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("刚渲染出来的文件是空的。");
  return blob;
}

/** 远端产物 → 指定格式 → 下载到本机。 */
export async function downloadConvertedFromUrl(options: {
  url: string;
  title: string;
  target: string;
  kind: "image" | "media";
  quality?: number;
}): Promise<void> {
  const source = await fetchDeliverableBlob(options.url);
  const sourceName = withExtension(
    options.title || "文件",
    visualFileExtension(options.url) || "bin",
  );
  const converted =
    options.kind === "image"
      ? await convertImageBlob(
          source,
          sourceName,
          options.target,
          options.quality,
        )
      : await convertMediaBlob(source, sourceName, options.target);
  downloadVisualBlob(
    converted,
    withExtension(options.title || "文件", options.target),
  );
}
