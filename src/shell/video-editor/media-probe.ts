"use client";

// 用隐藏媒体元素探测素材元数据（时长/尺寸），加 clip 前定初始 duration 用。
// URL 一律先过 canvasSafeUrl —— 与预览引擎同一条 CORS 纪律。
//
// 失败必须带原因：15s 超时、元素 onerror、元数据无效/无轨 是三件不同的事。
// 以前压成同一个 null，调用方只能报「无法解码」，把陈列馆里最常见的超时
// 说成编解码故障。

import { canvasSafeUrl } from "../../lib/media-proxy";

export interface MediaProbeResult {
  durationMs: number;
  width: number;
  height: number;
}

export type MediaProbeFailureReason = "timeout" | "error" | "no-track";

export type MediaProbeFailureContext = "clip" | "timeline" | "initial" | "append";

export type MediaProbeOutcome =
  | ({ ok: true } & MediaProbeResult)
  | { ok: false; reason: MediaProbeFailureReason };

/**
 * 参数名/类型带 `UITranslate`，好让 `i18n-tt-key-coverage` 把本函数里的
 * `tt("…")` 字面量收进扫描面。不要改成别的名字，闸会把新文案当成动态 key 漏掉。
 */
type UITranslate = (zh: string, vars?: Record<string, string | number>) => string;

const PROBE_TIMEOUT_MS = 15_000;

/** 探测 video/audio 的真实时长与像素尺寸；三种失败分别带 reason。 */
export function probeMediaSource(
  url: string,
  kind: "video" | "audio",
): Promise<MediaProbeOutcome> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({ ok: false, reason: "error" });
      return;
    }
    const el = document.createElement(kind);
    let settled = false;
    let timer = 0;
    const done = (value: MediaProbeOutcome) => {
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
        done({ ok: false, reason: "no-track" });
        return;
      }
      const video = kind === "video" ? (el as HTMLVideoElement) : null;
      if (
        video &&
        (!Number.isFinite(video.videoWidth) ||
          video.videoWidth <= 0 ||
          !Number.isFinite(video.videoHeight) ||
          video.videoHeight <= 0)
      ) {
        done({ ok: false, reason: "no-track" });
        return;
      }
      done({
        ok: true,
        durationMs: Math.round(el.duration * 1000),
        width: video?.videoWidth || 0,
        height: video?.videoHeight || 0,
      });
    };
    el.onerror = () => done({ ok: false, reason: "error" });
    timer = window.setTimeout(
      () => done({ ok: false, reason: "timeout" }),
      PROBE_TIMEOUT_MS,
    );
    try {
      el.src = canvasSafeUrl(url);
    } catch {
      done({ ok: false, reason: "error" });
    }
  });
}

/** Backward-compatible duration-only probe. */
export async function probeMediaDuration(
  url: string,
  kind: "video" | "audio",
): Promise<number | null> {
  const outcome = await probeMediaSource(url, kind);
  return outcome.ok ? outcome.durationMs : null;
}

/**
 * 把探测失败翻成操作员能看懂的中文原文（再交给 `tt()` 走词典）。
 * 超时那条故意不含「解码」——超时不是编解码故障。
 */
export function translateMediaProbeFailure(
  tt: UITranslate,
  reason: MediaProbeFailureReason,
  kind: "video" | "audio",
  context: MediaProbeFailureContext = "initial",
  clipId = "",
): string {
  const detail =
    kind === "video"
      ? reason === "timeout"
        ? tt("视频源 15 秒内没有响应，可能是网络或服务太慢，请重试")
        : reason === "error"
          ? tt("视频源加载失败（网络或地址不可达）")
          : tt("视频源没有可用的视频轨或时长为 0")
      : reason === "timeout"
        ? tt("音频源 15 秒内没有响应，可能是网络或服务太慢，请重试")
        : reason === "error"
          ? tt("音频源加载失败（网络或地址不可达）")
          : tt("音频源没有可用的音轨或时长为 0");
  if (context === "clip") {
    return tt("片段 {clipId}：{detail}", { clipId, detail });
  }
  if (context === "append") {
    return tt("{detail}，未加入时间线", { detail });
  }
  return detail;
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
