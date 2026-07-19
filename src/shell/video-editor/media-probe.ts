"use client";

// 用隐藏媒体元素探测素材元数据（时长/尺寸），加 clip 前定初始 duration 用。
// URL 一律先过 canvasSafeUrl —— 与预览引擎同一条 CORS 纪律。

import { canvasSafeUrl } from "../../lib/media-proxy";

export interface MediaProbeResult {
  durationMs: number;
  width: number;
  height: number;
}

/** 探测 video/audio 的真实时长与像素尺寸；失败或 15s 超时返回 null。 */
export function probeMediaSource(
  url: string,
  kind: "video" | "audio",
): Promise<MediaProbeResult | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const el = document.createElement(kind);
    let settled = false;
    let timer = 0;
    const done = (value: MediaProbeResult | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.onloadedmetadata = null;
      el.onerror = null;
      el.removeAttribute("src");
      try {
        el.load();
      } catch {
        /* noop */
      }
      resolve(value);
    };
    el.preload = "metadata";
    el.crossOrigin = "anonymous";
    el.onloadedmetadata = () => {
      if (!Number.isFinite(el.duration) || el.duration <= 0) {
        done(null);
        return;
      }
      const video = kind === "video" ? (el as HTMLVideoElement) : null;
      done({
        durationMs: Math.round(el.duration * 1000),
        width: video?.videoWidth || 0,
        height: video?.videoHeight || 0,
      });
    };
    el.onerror = () => done(null);
    timer = window.setTimeout(() => done(null), 15000);
    el.src = canvasSafeUrl(url);
  });
}

/** Backward-compatible duration-only probe. */
export async function probeMediaDuration(
  url: string,
  kind: "video" | "audio",
): Promise<number | null> {
  return (await probeMediaSource(url, kind))?.durationMs ?? null;
}

/** 猜测 URL 的媒体类别（加素材时决定进哪类轨）。 */
export function guessMediaKind(url: string): "video" | "audio" | "image" | null {
  const clean = url.split(/[?#]/, 1)[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|mkv)$/.test(clean)) return "video";
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(clean)) return "audio";
  if (/\.(png|jpe?g|webp|gif|avif|svg)$/.test(clean)) return "image";
  return null;
}

/** 猜测 File 对象的媒体类别。 */
export function guessFileKind(file: File): "video" | "audio" | "image" | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return guessMediaKind(file.name);
}
