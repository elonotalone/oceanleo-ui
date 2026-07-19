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
} from "./timeline-model";
import { drawTimelineVideoFrame } from "./preview-contract";
import type { TimelineClip, TimelineDoc, TimelineTrack } from "./types";

const PREVIEW_MAX_WIDTH = 1280;
export const DEFAULT_TEXT_FONT_SIZE = 64;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
        if (!clip.source_url) continue;
        if (track.kind === "video") wanted.set(clip.id, { type: "video", url: clip.source_url });
        else if (track.kind === "audio") wanted.set(clip.id, { type: "audio", url: clip.source_url });
        else if (track.kind === "image") wanted.set(clip.id, { type: "image", url: clip.source_url });
      }
    }
    for (const [id, spec] of wanted) this.ensureMedia(id, spec.type, spec.url);
    for (const [id, entry] of [...this.media]) {
      if (!wanted.has(id)) {
        this.releaseEntry(entry);
        this.media.delete(id);
      }
    }
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
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    this.canvas = null;
    this.onTick = null;
    this.onEnded = null;
    this.onFrameReady = null;
  }

  // -------------------------------------------------------------- internals

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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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
        if (!clip.source_url) continue;
        const el = this.media.get(clip.id)?.el as
          | HTMLImageElement
          | undefined;
        if (!el || !el.complete || !el.naturalWidth) {
          waitingForActiveVisual = true;
          continue;
        }
        const type = clip.transition_in?.type;
        const alpha =
          (clip.opacity ?? 1) *
          (type === "fade" || type === "crossfade"
            ? this.transitionProgress(clip, t)
            : 1);
        const drawWidth = width * (clip.scale ?? 0.35);
        const drawHeight = drawWidth * (el.naturalHeight / el.naturalWidth);
        const cx = (clip.x ?? 0.5) * width;
        const cy = (clip.y ?? 0.5) * height;
        const rotation = ((clip.rotation ?? 0) * Math.PI) / 180;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.globalAlpha = clamp01(alpha);
        ctx.drawImage(
          el,
          -drawWidth / 2,
          -drawHeight / 2,
          drawWidth,
          drawHeight,
        );
        ctx.restore();
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
    this.setFrameReady(!waitingForActiveVisual);
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
    const lines = String(clip.text ?? "").split("\n");
    const lineHeight = fontPx * 1.3;
    const totalHeight = lines.length * lineHeight;
    const align = style.align ?? "center";
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.font = `${style.bold ? "700" : "400"} ${fontPx}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const maxLine = Math.max(
      ...lines.map((line) => ctx.measureText(line).width),
      0,
    );
    const requestedX = (style.x ?? 0.5) * width;
    const anchorX =
      align === "left"
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
        align === "left"
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
      ctx.fillText(
        line,
        anchorX,
        anchorY - totalHeight / 2 + lineHeight * (index + 0.5),
      );
    });
    ctx.restore();
  }
}
