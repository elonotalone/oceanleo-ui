"use client";

// 用隐藏媒体元素探测素材元数据（时长/尺寸），加 clip 前定初始 duration 用。
// URL 一律先过 canvasSafeUrl —— 与预览引擎同一条 CORS 纪律。

import { canvasSafeUrl } from "../../lib/media-proxy";

/** 探测 video/audio 源时长（ms）；失败或 15s 超时返回 null。 */
export function probeMediaDuration(
  url: string,
  kind: "video" | "audio",
): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const el = document.createElement(kind);
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
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
    el.onloadedmetadata = () =>
      done(
        Number.isFinite(el.duration) && el.duration > 0
          ? Math.round(el.duration * 1000)
          : null,
      );
    el.onerror = () => done(null);
    window.setTimeout(() => done(null), 15000);
    el.src = canvasSafeUrl(url);
  });
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
