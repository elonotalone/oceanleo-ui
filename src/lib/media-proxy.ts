"use client";

// ============================================================================
// @oceanleo/ui — 画布安全媒体加载（单一事实源）
// ----------------------------------------------------------------------------
// fabric 画布 / 波形 / 视频抽帧 / PDF 都要以「可读像素」方式加载素材。素材 URL
// 大多在 supabase storage 公共 bucket 或 api.oceanleo.com 上，直接
// `crossOrigin=anonymous` 读取会因缺 CORS 头而 canvas 污染（v1 高级功能图片
// 白屏的直接原因）。统一解法：凡进画布的 URL 先经网关同源代理
// `GET /v1/media/proxy?url=...`（只放行自家来源，流式返回 + CORS 头）。
// data:/blob: URL 与网关自身 URL 无需代理。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE, SUPABASE_URL } from "./auth/config";

const ASSET_OSS_HOSTS = new Set([
  "oceanleo-assets.oss-cn-guangzhou.aliyuncs.com",
]);

/** Turn browser-relative material paths into the absolute URL the gateway sees. */
export function absoluteMediaUrl(url: string): string {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

/** 与网关 allowlist 对齐的轻量客户端预判（安全边界仍由服务端执行）。 */
export function isFirstPartyMediaUrl(url: string): boolean {
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  try {
    const parsed = new URL(url, window.location.href);
    const gateway = new URL(GATEWAY_BASE);
    const supabase = SUPABASE_URL ? new URL(SUPABASE_URL) : null;
    if (parsed.origin === window.location.origin) return true;
    if (parsed.origin === gateway.origin) return true;
    if (
      supabase &&
      parsed.origin === supabase.origin &&
      parsed.pathname.includes("/storage/v1/object/public/")
    ) {
      return true;
    }
    return (
      parsed.protocol === "https:" &&
      ASSET_OSS_HOSTS.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return url.startsWith("data:") || url.startsWith("blob:");
  }
}

/** 判断 URL 是否已经无需代理（同源 data/blob，或网关自己发的）。 */
export function needsMediaProxy(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin === window.location.origin) return false;
    if (parsed.origin === new URL(GATEWAY_BASE).origin) {
      // 网关自己的 /v1/media/proxy 与 /v1/assets/... 响应都带 CORS 头。
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** 把任意自家素材 URL 变成画布可安全读取的 URL。 */
export function canvasSafeUrl(url: string): string {
  if (!needsMediaProxy(url)) return url;
  return `${GATEWAY_BASE}/v1/media/proxy?url=${encodeURIComponent(url)}`;
}

/** fetch 一个素材为 Blob（走代理），供波形解码 / PDF / ffmpeg 抽帧等用。 */
export async function fetchMediaBlob(
  url: string,
  options: {
    maxBytes?: number;
    signal?: AbortSignal;
    cache?: RequestCache;
  } = {},
): Promise<Blob> {
  const response = await fetch(canvasSafeUrl(url), {
    cache: options.cache ?? "force-cache",
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`媒体加载失败 HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (options.maxBytes && declared > options.maxBytes) {
    throw new Error("素材过大，无法在浏览器内存中安全处理");
  }
  const blob = await response.blob();
  if (options.maxBytes && blob.size > options.maxBytes) {
    throw new Error("素材过大，无法在浏览器内存中安全处理");
  }
  return blob;
}

/**
 * 把用户粘贴的外链先导入 OceanLeo 永久对象存储，再交给时间线/画布。
 * 服务端执行 SSRF、大小和 MIME 校验；返回值一定是渲染服务允许的第一方 URL。
 */
export interface ImportedMedia {
  url: string;
  contentType: string;
  bytes: number;
  alreadyOwned: boolean;
}

interface MediaImportResponse {
  url?: string;
  detail?: string | { code?: string; message?: string };
  content_type?: string;
  bytes?: number;
  already_owned?: boolean;
}

export async function importMediaAsset(
  url: string,
  opts: {
    kind?: "image" | "video" | "audio" | "model3d" | "file";
    siteId?: string;
    title?: string;
    registerAsset?: boolean;
  } = {},
): Promise<ImportedMedia> {
  const token = await accessToken();
  if (!token) throw new Error("未登录");
  const sourceUrl = absoluteMediaUrl(url);
  const payload: Record<string, unknown> = {
    url: sourceUrl,
    site_id: opts.siteId || "oceanleo",
    title: opts.title || "",
    register_asset: opts.registerAsset ?? true,
  };
  if (opts.kind) payload.kind = opts.kind;
  const response = await fetch(`${GATEWAY_BASE}/v1/media/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  let data: MediaImportResponse | null = null;
  try {
    data = (await response.json()) as MediaImportResponse;
  } catch {
    /* non-JSON */
  }
  if (!response.ok || !data?.url) {
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : data?.detail?.message;
    throw new Error(detail || `素材导入失败 HTTP ${response.status}`);
  }
  return {
    url: data.url,
    contentType: data.content_type || "",
    bytes: Number(data.bytes || 0),
    alreadyOwned: Boolean(data.already_owned),
  };
}

export async function importMediaUrl(
  url: string,
  opts: Parameters<typeof importMediaAsset>[1] = {},
): Promise<string> {
  return (await importMediaAsset(url, opts)).url;
}
