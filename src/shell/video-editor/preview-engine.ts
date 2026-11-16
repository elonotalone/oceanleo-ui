"use client";

// ============================================================================
// @oceanleo/ui — 时间线 canvas 软合成预览引擎（无 React 依赖）
// ----------------------------------------------------------------------------
// 按播放头时间把多轨 doc 画到一块 canvas 上：视频轨用隐藏 <video> seek +
// drawImage（轨 0 基底，后续视频轨整幅叠加），贴图轨画 HTMLImageElement
// overlay，文字轨用 canvas 文本。音频轨用隐藏 <audio> 元素随播放时钟出声。
// 不追求逐帧精确（成品以服务端 ffmpeg 渲染为准），但 seek 必须能看到对应画面。
// 所有源 URL 统一经 canvasSafeUrl() 进元素，杜绝 canvas 跨域污染。
// ============================================================================

import { canvasSafeUrl } from "../../lib/media-proxy";
import {
  clipEndMs,
  docDurationMs,
  normalizeTimelineDoc,
  normalizeTimelineCrop,
  timelineFontStack,
} from "./timeline-model";
import { drawTimelineVideoFrame } from "./preview-contract";
import {
  assertPreviewResolution,
  previewRenditionSize,
  thumbnailRenditionSize,
  TimelineCarrierError,
} from "./timeline-carrier";
import { TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, type TimelineClip, type TimelineDoc, type TimelineTrack, type TimelineLibraryImageSource } from "./types";

/**
 * 屏上取景宽度上限。这是视口,不是交付物 —— `preview` rendition 走
 * captureRenditionCanvas("preview"),按 video-timeline.md §3.3 恒等于源分辨率。
 */
const PREVIEW_MAX_WIDTH = 1280;
export const DEFAULT_TEXT_FONT_SIZE = 64;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Eq-style additive luma adjustment; alpha is immutable. */
export function adjustTimelineImagePixels(data: Uint8ClampedArray, clip: TimelineClip): void {
  const brightness = clip.brightness ?? 0;
  const contrast = clip.contrast ?? 1;
  const saturation = clip.saturation ?? 1;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const adjusted = clamp01((luma - 0.5) * contrast + 0.5 + brightness);
    data[i] = clamp01(adjusted + (r - luma) * saturation) * 255;
    data[i + 1] = clamp01(adjusted + (g - luma) * saturation) * 255;
    data[i + 2] = clamp01(adjusted + (b - luma) * saturation) * 255;
  }
}

const adjustedImageCache = new WeakMap<HTMLImageElement, { signature: string; canvas: HTMLCanvasElement }>();

function adjustedTimelineImage(image: HTMLImageElement, clip: TimelineClip): HTMLImageElement | HTMLCanvasElement {
  if (!(clip.brightness ?? 0) && (clip.contrast ?? 1) === 1 && (clip.saturation ?? 1) === 1) return image;
  const signature = [image.currentSrc || image.src, image.naturalWidth, image.naturalHeight, clip.brightness ?? 0, clip.contrast ?? 1, clip.saturation ?? 1].join("|");
  const cached = adjustedImageCache.get(image);
  if (cached?.signature === signature) return cached.canvas;
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new TimelineCarrierError("image-adjustment-unavailable", "图片调色预览暂时无法读取像素。");
  try {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    adjustTimelineImagePixels(pixels.data, clip);
    ctx.putImageData(pixels, 0, 0);
  } catch {
    // Never substitute multiplicative CSS brightness for the additive wire value.
    throw new TimelineCarrierError("image-adjustment-unavailable", "图片调色预览暂时无法读取像素。");
  }
  adjustedImageCache.set(image, { signature, canvas });
  return canvas;
}

/** Source crop is applied before fitting into the composition-shaped image box. */
export function drawTimelineImageFrame(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement, clip: TimelineClip,
  width: number, height: number, scale: number, alpha = 1,
): void {
  const source = adjustedTimelineImage(image, clip);
  const sourceWidth = source === image ? image.naturalWidth : source.width;
  const sourceHeight = source === image ? image.naturalHeight : source.height;
  const crop = normalizeTimelineCrop(clip.crop);
  let sx = crop.x * sourceWidth;
  let sy = crop.y * sourceHeight;
  let sw = crop.width * sourceWidth;
  let sh = crop.height * sourceHeight;
  const boxWidth = width * (clip.scale ?? 0.35);
  const boxHeight = height * (clip.scale ?? 0.35);
  let dw = boxWidth;
  let dh = boxHeight;
  if (clip.fit === "cover") {
    const fit = Math.max(boxWidth / sw, boxHeight / sh);
    const croppedWidth = boxWidth / fit;
    const croppedHeight = boxHeight / fit;
    sx += (sw - croppedWidth) / 2;
    sy += (sh - croppedHeight) / 2;
    sw = croppedWidth; sh = croppedHeight;
  } else if (clip.fit !== "stretch") {
    const fit = Math.min(boxWidth / sw, boxHeight / sh);
    dw = sw * fit; dh = sh * fit;
  }
  const radius = Math.min((clip.radius ?? 0) * scale, dw / 2, dh / 2);
  ctx.save();
  ctx.translate((clip.x ?? 0.5) * width, (clip.y ?? 0.5) * height);
  ctx.rotate(((clip.rotation ?? 0) * Math.PI) / 180);
  if (clip.flip_x || clip.flip_y) ctx.scale(clip.flip_x ? -1 : 1, clip.flip_y ? -1 : 1);
  ctx.globalAlpha = clamp01(alpha * (clip.opacity ?? 1));
  ctx.save();
  if (radius > 0) {
    ctx.beginPath(); ctx.roundRect(-dw / 2, -dh / 2, dw, dh, radius); ctx.clip();
  }
  ctx.filter = "none";
  ctx.drawImage(source, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  const border = Math.min((clip.border?.width ?? 0) * scale, dw / 2, dh / 2);
  if (border > 0) {
    ctx.strokeStyle = clip.border?.color ?? "#000000";
    ctx.lineWidth = border;
    ctx.beginPath();
    ctx.roundRect(-dw / 2 + border / 2, -dh / 2 + border / 2,
      Math.max(0, dw - border), Math.max(0, dh - border), Math.max(0, radius - border / 2));
    ctx.stroke();
  }
  ctx.restore();
}

interface MediaEntry {
  el: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  type: "video" | "audio" | "image";
  url: string;
  sourceNode?: MediaElementAudioSourceNode;
  gainNode?: GainNode;
}

interface ClipInfo {
  clip: TimelineClip;
  trackId: string;
}

export class TimelinePreviewEngine {
  private doc: TimelineDoc;
  private durationMs = 0;
  private canvas: HTMLCanvasElement | null = null;
  private media = new Map<string, MediaEntry>();
  private libraryImages = new Map<string, { url?: string; expiresAt?: number; pending?: Promise<void>; retryAt?: number }>();
  private libraryClipKeys = new Map<string, string>();
  private clipIndex = new Map<string, ClipInfo>();
  private raf = 0;
  private playing = false;
  private timeMs = 0;
  private clockBaseMs = 0;
  private clockWallStart = 0;
  private disposed = false;
  private frameReady = false;
  private audioContext: AudioContext | null = null;
  onTick: ((ms: number) => void) | null = null;
  onEnded: (() => void) | null = null;
  onFrameReady: ((ready: boolean) => void) | null = null;

  constructor(doc: TimelineDoc) {
    this.doc = normalizeTimelineDoc(doc);
    this.setDoc(doc);
    const loop = () => {
      if (this.disposed) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    if (!canvas) this.setFrameReady(false);
  }

  getTimeMs(): number {
    return this.timeMs;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setDoc(doc: TimelineDoc): void {
    this.doc = normalizeTimelineDoc(doc);
    this.durationMs = docDurationMs(this.doc);
    if (this.timeMs > this.durationMs) this.timeMs = this.durationMs;
    this.clipIndex.clear();
    const wanted = new Map<string, { type: MediaEntry["type"]; url: string }>();
    for (const track of this.doc.tracks) {
      for (const clip of track.clips) {
        this.clipIndex.set(clip.id, { clip, trackId: track.id });
        if (track.kind === "image" && clip.library_source) {
          const source = clip.library_source;
          const key = JSON.stringify([source.artifactId, source.revisionId, source.rendition]);
          if (this.libraryClipKeys.get(clip.id) !== key) {
            const previous = this.media.get(clip.id);
            if (previous) this.releaseEntry(previous);
            this.media.delete(clip.id);
          }
          this.libraryClipKeys.set(clip.id, key);
          wanted.set(clip.id, { type: "image", url: "" });
          this.ensureLibraryImage(clip.id, clip.library_source);
          continue;
        }
        this.libraryClipKeys.delete(clip.id);
        if (!clip.source_url) continue;
        if (track.kind === "video") wanted.set(clip.id, { type: "video", url: clip.source_url });
        else if (track.kind === "audio") wanted.set(clip.id, { type: "audio", url: clip.source_url });
        else if (track.kind === "image") wanted.set(clip.id, { type: "image", url: clip.source_url });
      }
    }
    for (const [id, spec] of wanted) if (spec.url) this.ensureMedia(id, spec.type, spec.url);
    for (const [id, entry] of [...this.media]) {
      if (!wanted.has(id)) {
        this.releaseEntry(entry);
        this.media.delete(id);
        this.libraryClipKeys.delete(id);
      }
    }
    for (const id of this.libraryClipKeys.keys()) if (!this.clipIndex.get(id)?.clip.library_source) this.libraryClipKeys.delete(id);
    const libraryKeys = new Set(this.libraryClipKeys.values());
    for (const key of this.libraryImages.keys()) if (!libraryKeys.has(key)) this.libraryImages.delete(key);
  }

  setTime(ms: number): void {
    this.timeMs = Math.min(Math.max(0, ms), this.durationMs);
    if (this.playing) {
      this.clockBaseMs = this.timeMs;
      this.clockWallStart = performance.now();
    }
  }

  play(): void {
    if (this.durationMs <= 0) return;
    if (this.timeMs >= this.durationMs - 1) this.timeMs = 0;
    this.playing = true;
    this.clockBaseMs = this.timeMs;
    this.clockWallStart = performance.now();
    for (const entry of this.media.values()) {
      if (entry.type !== "image") this.ensureAudioRouting(entry);
    }
    void this.audioContext?.resume().catch(() => undefined);
    // 自动播放解锁：在用户手势调用栈里对全部媒体元素 play() 一次，
    // 非活跃的立即回停，后续 rAF 里的 play() 才不会被策略拦。
    for (const [id, entry] of this.media) {
      if (entry.type === "image") continue;
      const el = entry.el as HTMLMediaElement;
      void el
        .play()
        .then(() => {
          if (!this.playing || !this.isClipActive(id)) el.pause();
        })
        .catch(() => {
          /* 策略拦截，忽略 */
        });
    }
  }

  pause(): void {
    this.playing = false;
    this.pauseAllMedia();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const entry of this.media.values()) this.releaseEntry(entry);
    this.media.clear();
    this.libraryImages.clear();
    this.libraryClipKeys.clear();
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    this.canvas = null;
    this.onTick = null;
    this.onEnded = null;
    this.onFrameReady = null;
  }

  // -------------------------------------------------------------- internals

  private ensureLibraryImage(clipId: string, source: TimelineLibraryImageSource): void {
    const key = JSON.stringify([source.artifactId, source.revisionId, source.rendition]);
    let cached = this.libraryImages.get(key);
    if (!cached) { cached = {}; this.libraryImages.set(key, cached); }
    if (cached.url && (cached.expiresAt ?? Infinity) > Date.now() + 30_000) {
      this.ensureMedia(clipId, "image", cached.url);
      return;
    }
    if (cached.pending || (cached.retryAt ?? 0) > Date.now()) return;
    const entry = cached;
    entry.pending = (async () => {
      try {
        const { refreshArtifactRendition } = await import("../artifact-client");
        const result = await refreshArtifactRendition(source, "full");
        if (!result.ok || !result.data?.url || !result.data.mediaType.startsWith("image/")) {
          throw new Error(result.error || "这份素材没能插入，请重试");
        }
        if (this.disposed) return;
        entry.url = result.data.url;
        const expiresAt = Date.parse(result.data.expiresAt || "");
        entry.expiresAt = Number.isFinite(expiresAt) ? expiresAt : Date.now() + 5 * 60_000;
        entry.retryAt = undefined;
        // A late response cannot reattach an image after replacement/deletion.
        for (const [id, info] of this.clipIndex) {
          const current = info.clip.library_source;
          if (current && JSON.stringify([current.artifactId, current.revisionId, current.rendition]) === key) {
            this.ensureMedia(id, "image", result.data.url);
          }
        }
      } catch {
        entry.retryAt = Date.now() + 30_000;
        const current = this.clipIndex.get(clipId)?.clip.library_source;
        if (!this.disposed && current && JSON.stringify(current) === JSON.stringify(source) && typeof window !== "undefined") {
          window.dispatchEvent(new window.CustomEvent(TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, {
            detail: { clipId, source, error: "这份素材没能插入，请重试" },
          }));
        }
      } finally { entry.pending = undefined; }
    })();
  }

  private ensureAudioRouting(entry: MediaEntry): void {
    if (entry.type === "image" || entry.gainNode) return;
    if (typeof AudioContext === "undefined") return;
    try {
      const context = this.audioContext || new AudioContext();
      this.audioContext = context;
      const source = context.createMediaElementSource(
        entry.el as HTMLMediaElement,
      );
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      entry.sourceNode = source;
      entry.gainNode = gain;
    } catch {
      // A browser without MediaElementAudioSource support keeps the safe
      // HTMLMediaElement volume fallback (capped at 100%).
    }
  }

  private ensureMedia(id: string, type: MediaEntry["type"], rawUrl: string): void {
    const safe = canvasSafeUrl(rawUrl);
    const existing = this.media.get(id);
    if (existing && existing.type === type) {
      if (existing.url !== safe) {
        existing.url = safe;
        (existing.el as HTMLMediaElement | HTMLImageElement).src = safe;
      }
      return;
    }
    if (existing) {
      this.releaseEntry(existing);
      this.media.delete(id);
    }
    if (typeof document === "undefined") return;
    if (type === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onerror = () => {
        const source = this.clipIndex.get(id)?.clip.library_source;
        if (!this.disposed && source && typeof window !== "undefined") {
          window.dispatchEvent(new window.CustomEvent(TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, {
            detail: { clipId: id, source, error: "这份素材没能插入，请重试" },
          }));
        }
      };
      img.src = safe;
      this.media.set(id, { el: img, type, url: safe });
      return;
    }
    const el = document.createElement(type);
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    if (type === "video") (el as HTMLVideoElement).playsInline = true;
    el.src = safe;
    this.media.set(id, { el, type, url: safe });
  }

  private releaseEntry(entry: MediaEntry): void {
    entry.sourceNode?.disconnect();
    entry.gainNode?.disconnect();
    entry.sourceNode = undefined;
    entry.gainNode = undefined;
    if (entry.type !== "image") {
      const el = entry.el as HTMLMediaElement;
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* noop */
      }
    } else {
      const image = entry.el as HTMLImageElement;
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
    }
  }

  private pauseAllMedia(): void {
    for (const entry of this.media.values()) {
      if (entry.type === "image") continue;
      const el = entry.el as HTMLMediaElement;
      if (!el.paused) el.pause();
    }
  }

  private isClipActive(clipId: string): boolean {
    const info = this.clipIndex.get(clipId);
    if (!info) return false;
    return (
      (info.clip.start_ms <= this.timeMs &&
        this.timeMs < clipEndMs(info.clip)) ||
      this.outgoingCrossfade(info, this.timeMs) !== null
    );
  }

  private outgoingCrossfade(info: ClipInfo, t: number): number | null {
    const track = this.doc.tracks.find((item) => item.id === info.trackId);
    // Video elements must stay paused on their exact out-frame so the visual
    // crossfade can hold that frame. Audio-track elements can continue through
    // the outgoing overlap and preview the true two-sided audio crossfade.
    if (!track || track.kind !== "audio") return null;
    const ordered = [...track.clips].sort(
      (left, right) => left.start_ms - right.start_ms,
    );
    const index = ordered.findIndex((clip) => clip.id === info.clip.id);
    const incoming = index >= 0 ? ordered[index + 1] : undefined;
    const transition = incoming?.transition_in;
    if (
      !incoming ||
      transition?.type !== "crossfade" ||
      transition.duration_ms <= 0 ||
      clipEndMs(info.clip) < incoming.start_ms - 1 ||
      t < incoming.start_ms ||
      t >= incoming.start_ms + transition.duration_ms
    ) {
      return null;
    }
    return 1 - clamp01(
      (t - incoming.start_ms) / transition.duration_ms,
    );
  }

  private frame(): void {
    if (this.playing) {
      const now = performance.now();
      let t = this.clockBaseMs + (now - this.clockWallStart);
      if (t >= this.durationMs) {
        t = this.durationMs;
        this.playing = false;
        this.pauseAllMedia();
        this.timeMs = t;
        this.onTick?.(t);
        this.onEnded?.();
      } else {
        this.timeMs = t;
        this.onTick?.(t);
      }
    }
    this.syncMedia();
    this.draw();
  }

  private syncMedia(): void {
    const t = this.timeMs;
    for (const [id, entry] of this.media) {
      if (entry.type === "image") continue;
      const info = this.clipIndex.get(id);
      if (!info) continue;
      const { clip } = info;
      const el = entry.el as HTMLMediaElement;
      const speed = clip.speed ?? 1;
      const incomingType = clip.transition_in?.type;
      const incomingEnvelope =
        incomingType === "fade" ||
        incomingType === "crossfade" ||
        incomingType === "black"
          ? this.transitionProgress(clip, t)
          : 1;
      const outgoingEnvelope = this.outgoingCrossfade(info, t) ?? 1;
      const volume = Math.min(
        2,
        Math.max(
          0,
          (clip.muted ? 0 : clip.volume ?? 1) *
            incomingEnvelope *
            outgoingEnvelope,
        ),
      );
      if (entry.gainNode && this.audioContext) {
        el.muted = false;
        if (el.volume !== 1) el.volume = 1;
        entry.gainNode.gain.setValueAtTime(
          volume,
          this.audioContext.currentTime,
        );
      } else {
        el.muted = Boolean(clip.muted);
        const fallbackVolume = clamp01(volume);
        if (el.volume !== fallbackVolume) el.volume = fallbackVolume;
      }
      try {
        if (el.playbackRate !== speed) el.playbackRate = speed;
      } catch {
        /* 超范围忽略 */
      }
      const active =
        (clip.start_ms <= t && t < clipEndMs(clip)) ||
        this.outgoingCrossfade(info, t) !== null;
      const wantSec = ((clip.in_ms ?? 0) + (t - clip.start_ms) * speed) / 1000;
      if (active && this.playing) {
        if (el.paused) {
          this.safeSeek(el, wantSec);
          void el.play().catch(() => {
            /* noop */
          });
        } else if (Math.abs(el.currentTime - wantSec) > 0.25) {
          this.safeSeek(el, wantSec);
        }
        continue;
      }
      if (!el.paused) el.pause();
      let target: number | null = null;
      if (active) target = Math.max(0, wantSec);
      else if (t < clip.start_ms && clip.start_ms - t < 2000) {
        // 即将进入的 clip 预 seek 到源内起点，切换时不黑帧。
        target = (clip.in_ms ?? 0) / 1000;
      }
      if (target !== null && Math.abs(el.currentTime - target) > 0.04) {
        this.safeSeek(el, target);
      }
    }
  }

  private safeSeek(el: HTMLMediaElement, seconds: number): void {
    try {
      el.currentTime = Math.max(0, seconds);
    } catch {
      /* 元数据未就绪，忽略 */
    }
  }

  private transitionProgress(clip: TimelineClip, t: number): number {
    const tr = clip.transition_in;
    if (!tr || tr.duration_ms <= 0) return 1;
    return clamp01((t - clip.start_ms) / tr.duration_ms);
  }

  private activeClips(track: TimelineTrack, t: number): TimelineClip[] {
    return track.clips
      .filter((clip) => clip.start_ms <= t && t < clipEndMs(clip))
      .sort((a, b) => a.start_ms - b.start_ms);
  }

  private draw(): void {
    const canvas = this.canvas;
    if (!canvas) {
      this.setFrameReady(false);
      return;
    }
    const scale = Math.min(1, PREVIEW_MAX_WIDTH / Math.max(1, this.doc.width));
    const width = Math.max(2, Math.round(this.doc.width * scale));
    const height = Math.max(2, Math.round(this.doc.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const waiting = this.composite(canvas, width, height, scale);
    this.setFrameReady(!waiting);
  }

  /**
   * 把当前时刻合成到给定尺寸的画布上,返回是否仍在等素材解码。
   * 屏上取景与交付 rendition 共用这一条合成路径,两边不会画出不同的帧。
   */
  private composite(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    scale: number,
  ): boolean {
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const t = this.timeMs;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0c0a09";
    ctx.fillRect(0, 0, width, height);
    let waitingForActiveVisual = false;
    let blackTransitionAlpha = 0;
    for (const track of this.doc.tracks) {
      for (const clip of this.activeClips(track, t)) {
        if (clip.transition_in?.type === "black") {
          blackTransitionAlpha = Math.max(
            blackTransitionAlpha,
            1 - this.transitionProgress(clip, t),
          );
        }
      }
    }

    for (const track of this.doc.tracks) {
      if (track.kind !== "video") continue;
      const active = this.activeClips(track, t);
      for (const clip of active) {
        if (!clip.source_url) continue;
        const entry = this.media.get(clip.id);
        const el = entry?.el as HTMLVideoElement | undefined;
        const progress = this.transitionProgress(clip, t);
        const type = clip.transition_in?.type;
        if (type === "crossfade" && progress < 1 && active.length === 1) {
          const prev = track.clips
            .filter(
              (candidate) =>
                candidate.source_url &&
                Math.abs(clipEndMs(candidate) - clip.start_ms) <= 1,
            )
            .sort((a, b) => clipEndMs(b) - clipEndMs(a))[0];
          const prevEl = prev
            ? (this.media.get(prev.id)?.el as HTMLVideoElement | undefined)
            : undefined;
          if (prev && prevEl && prevEl.readyState >= 2 && prevEl.videoWidth) {
            this.drawVideo(ctx, prevEl, prev, width, height, 1);
          }
        }
        if (el && el.readyState >= 2 && el.videoWidth) {
          const alpha = type === "fade" || type === "crossfade" ? progress : 1;
          this.drawVideo(ctx, el, clip, width, height, alpha);
        } else {
          waitingForActiveVisual = true;
        }
      }
    }

    for (const track of this.doc.tracks) {
      if (track.kind !== "image") continue;
      for (const clip of this.activeClips(track, t)) {
        if (!clip.source_url && !clip.library_source) continue;
        if (clip.library_source) this.ensureLibraryImage(clip.id, clip.library_source);
        const el = this.media.get(clip.id)?.el as
          | HTMLImageElement
          | undefined;
        if (!el || !el.complete || !el.naturalWidth) {
          waitingForActiveVisual = true;
          continue;
        }
        const type = clip.transition_in?.type;
        const alpha =
          (type === "fade" || type === "crossfade"
            ? this.transitionProgress(clip, t)
            : 1);
        drawTimelineImageFrame(ctx, el, clip, width, height, scale, alpha);
      }
    }

    for (const track of this.doc.tracks) {
      if (track.kind !== "text") continue;
      for (const clip of this.activeClips(track, t)) {
        if (!clip.text) continue;
        const type = clip.transition_in?.type;
        this.drawText(
          ctx,
          clip,
          width,
          height,
          scale,
          type === "fade" || type === "crossfade"
            ? this.transitionProgress(clip, t)
            : 1,
        );
      }
    }
    if (blackTransitionAlpha > 0) {
      ctx.globalAlpha = clamp01(blackTransitionAlpha);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    return waitingForActiveVisual;
  }

  /**
   * video-timeline.md §3.3 预览分辨率契约。
   *
   * `preview` rendition MUST 与源同分辨率 —— 入库校验读的就是
   * `preview.width == width && preview.height == height`
   * (`reviewed_material_catalog.py:2707-2708`)。屏上取景画布被
   * PREVIEW_MAX_WIDTH 限到 1280 宽,直接拿它当 preview 交付就是 F5
   * 「为省字节交付缩小版预览」,整包会被拒。所以这里另起一块与
   * `doc.width × doc.height` 等大的离屏画布重新合成,不做任何重采样。
   *
   * `thumbnail` 由 poster-frame 派生,MAY 缩小,但最小边 MUST ≥ 128 px。
   */
  captureRenditionCanvas(
    purpose: "preview" | "thumbnail",
    maxThumbnailEdgePx = 512,
  ): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const source = { width: this.doc.width, height: this.doc.height };
    const target =
      purpose === "preview"
        ? previewRenditionSize(source)
        : thumbnailRenditionSize(source, maxThumbnailEdgePx);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, target.width);
    canvas.height = Math.max(2, target.height);
    this.composite(canvas, canvas.width, canvas.height, canvas.width / Math.max(1, source.width));
    if (purpose === "preview") {
      const verdict = assertPreviewResolution(source, {
        width: canvas.width,
        height: canvas.height,
      });
      if (!verdict.ok) {
        throw new TimelineCarrierError(verdict.code!, verdict.message!);
      }
    }
    return canvas;
  }

  private setFrameReady(ready: boolean): void {
    if (this.frameReady === ready) return;
    this.frameReady = ready;
    this.onFrameReady?.(ready);
  }

  private drawVideo(
    ctx: CanvasRenderingContext2D,
    el: HTMLVideoElement,
    clip: TimelineClip,
    width: number,
    height: number,
    alpha: number,
  ): void {
    drawTimelineVideoFrame(ctx, el, clip, width, height, alpha);
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    clip: TimelineClip,
    width: number,
    height: number,
    scale: number,
    alpha: number,
  ): void {
    const style = clip.style ?? {};
    const fontPx = (style.font_size ?? DEFAULT_TEXT_FONT_SIZE) * scale;
    const rawLines = String(clip.text ?? "").split("\n");
    const lines = style.vertical_text
      ? rawLines.map(line => Array.from(line).join("\n")).join("\n").split("\n") : rawLines;
    const lineHeight = fontPx * (style.line_height ?? 1.3);
    const letterSpacing = (style.letter_spacing ?? 0) * scale;
    const totalHeight = lines.length * lineHeight;
    const align = style.align ?? "center";
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${fontPx}px ${timelineFontStack(style.font_family)}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const maxLine = Math.max(
      ...lines.map((line) => ctx.measureText(line).width + Math.max(0, Array.from(line).length - 1) * letterSpacing),
      0,
    );
    const requestedX = (style.x ?? 0.5) * width;
    const anchorX =
      align === "left" || align === "justify"
        ? Math.max(0, Math.min(Math.max(0, width - maxLine), requestedX))
        : align === "right"
          ? Math.max(maxLine, Math.min(width, requestedX))
          : Math.max(
              maxLine / 2,
              Math.min(Math.max(maxLine / 2, width - maxLine / 2), requestedX),
            );
    const anchorY = Math.max(
      totalHeight / 2,
      Math.min(
        Math.max(totalHeight / 2, height - totalHeight / 2),
        (style.y ?? 0.85) * height,
      ),
    );
    if (style.background) {
      const pad = fontPx * 0.35;
      const blockWidth = maxLine + pad * 2;
      const blockX =
        align === "left" || align === "justify"
          ? anchorX - pad
          : align === "right"
            ? anchorX - blockWidth + pad
            : anchorX - blockWidth / 2;
      ctx.fillStyle = style.background;
      ctx.beginPath();
      ctx.roundRect(
        blockX,
        anchorY - totalHeight / 2 - pad,
        blockWidth,
        totalHeight + pad * 2,
        pad * 0.5,
      );
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(0,0,0,.45)";
      ctx.shadowBlur = fontPx * 0.12;
    }
    ctx.fillStyle = style.color ?? "#ffffff";
    lines.forEach((line, index) => {
      const chars = Array.from(line);
      const naturalWidth = ctx.measureText(line).width + Math.max(0, chars.length - 1) * letterSpacing;
      const justify = align === "justify" && index < lines.length - 1 && chars.length > 1;
      const spacing = letterSpacing + (justify ? (maxLine - naturalWidth) / (chars.length - 1) : 0);
      const lineWidth = justify ? maxLine : naturalWidth;
      const left = align === "right" ? anchorX - lineWidth : align === "center" ? anchorX - lineWidth / 2 : anchorX;
      const y = anchorY - totalHeight / 2 + lineHeight * (index + 0.5);
      if (spacing === 0 || chars.length === 0) ctx.fillText(line, left, y);
      else {
        let x = left;
        chars.forEach((char, i) => {
          ctx.fillText(char, x, y);
          // Prefix measurements retain kerning advances when spacing is added.
          const before = chars.slice(0, i).join("");
          const through = chars.slice(0, i + 1).join("");
          x += ctx.measureText(through).width - ctx.measureText(before).width + spacing;
        });
      }
      const thickness = Math.max(scale, fontPx * 0.055);
      if (style.underline && chars.length) ctx.fillRect(left, y + fontPx * 0.38, lineWidth, thickness);
      if (style.strike && chars.length) ctx.fillRect(left, y - fontPx * 0.06, lineWidth, thickness);
    });
    ctx.restore();
  }
}
