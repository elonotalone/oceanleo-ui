/**
 * Reader for projects the retired OpenVideo / designcombo face saved
 * (`editor_project_schema === "oceanleo.video.openvideo.v1"`).
 *
 * The face is gone; the stored file is not. This module only READS that JSON
 * and maps it onto our own timeline document so the project still opens
 * (read-only until the user clicks convert). It never writes the old schema
 * and never touches the stored file.
 */
import { createEmptyDoc, normalizeTimelineDoc } from "./timeline-model";
import type { TimelineClip, TimelineDoc, TrackKind } from "./types";

export const OPENVIDEO_PROJECT_SCHEMA = "oceanleo.video.openvideo.v1";

export const OPENVIDEO_READONLY_NOTICE =
  "这份时间线是用旧版专业时间线存的，现在是只读打开的。点「转换为可编辑时间线」后才能修改，保存会生成新版本，原版本保留。";

interface OpenVideoClipLike {
  id?: string;
  type?: string;
  src?: string;
  text?: string;
  timing?: {
    display?: { from?: number; to?: number };
    trim?: { from?: number; to?: number };
    playbackRate?: number;
  };
  transform?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    angle?: number;
    opacity?: number;
  };
  style?: Record<string, unknown>;
  crop?: { x: number; y: number; width: number; height: number };
  volume?: number;
  muted?: boolean;
  animations?: unknown[];
  caption?: unknown;
}

interface OpenVideoProjectLike {
  settings: { width?: number; height?: number; fps?: number };
  tracks: Array<{ type?: string; clipIds?: string[] }>;
  clips: Record<string, OpenVideoClipLike>;
}

export interface OpenVideoReadResult {
  doc: TimelineDoc;
  /** Human-readable list of source features the timeline cannot represent. */
  dropped: string[];
}

export function isOpenVideoProjectLike(value: unknown): value is OpenVideoProjectLike {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<OpenVideoProjectLike>;
  return (
    Boolean(project.settings) &&
    typeof project.settings === "object" &&
    Array.isArray(project.tracks) &&
    Boolean(project.clips) &&
    typeof project.clips === "object" &&
    !Array.isArray(project.clips)
  );
}

function usToMs(us: unknown): number {
  return Math.max(0, Math.round(Number(us) / 1000) || 0);
}

function trackKind(type: string): TrackKind {
  const lower = type.toLowerCase();
  if (lower === "audio") return "audio";
  if (lower === "image") return "image";
  if (lower === "text" || lower === "caption") return "text";
  return "video";
}

/** Parse the stored file text: either `{schema,version,data}` or the bare project. */
export function parseOpenVideoStoredProject(text: string): OpenVideoProjectLike {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(text).replace(/^﻿/, ""));
  } catch {
    throw new Error("旧版时间线工程 JSON 无法解析");
  }
  const data =
    parsed && typeof parsed === "object" && "data" in (parsed as object)
      ? (parsed as { data: unknown }).data
      : parsed;
  if (!isOpenVideoProjectLike(data)) {
    throw new Error("旧版时间线工程打不开：JSON 不是 tracks/clips 形状。");
  }
  return data;
}

export function openVideoToTimeline(project: OpenVideoProjectLike): OpenVideoReadResult {
  const doc = createEmptyDoc();
  doc.width = Math.round(Math.min(3840, Math.max(16, Number(project.settings.width) || 1920)));
  doc.height = Math.round(Math.min(3840, Math.max(16, Number(project.settings.height) || 1080)));
  doc.fps = Math.round(Math.min(60, Math.max(1, Number(project.settings.fps) || 30)));
  const byKind = new Map(doc.tracks.map((track) => [track.kind, track]));
  const dropped = new Set<string>();
  for (const track of project.tracks) {
    const target = byKind.get(trackKind(String(track.type || "video")));
    if (!target) continue;
    for (const clipId of track.clipIds || []) {
      const clip = project.clips[clipId];
      if (!clip || typeof clip !== "object") continue;
      const from = usToMs(clip.timing?.display?.from);
      const to = usToMs(clip.timing?.display?.to);
      const transform = clip.transform;
      const mapped: TimelineClip = {
        id: String(clip.id || clipId),
        start_ms: from,
        duration_ms: Math.max(100, to - from),
        source_url: clip.src || undefined,
        in_ms: clip.timing?.trim ? usToMs(clip.timing.trim.from) : 0,
        speed: Number(clip.timing?.playbackRate) || 1,
        volume: clip.muted ? 0 : clip.volume ?? 1,
        muted: clip.muted === true || clip.volume === 0,
        text: clip.text,
        x: transform ? ((transform.x ?? 0) + (transform.width ?? doc.width) / 2) / doc.width : 0.5,
        y: transform ? ((transform.y ?? 0) + (transform.height ?? doc.height) / 2) / doc.height : 0.5,
        scale: transform ? (transform.width ?? doc.width) / doc.width : 1,
        opacity: transform?.opacity ?? 1,
        rotation: transform?.angle ?? 0,
      };
      if (clip.style && typeof clip.style.fontSize === "number") {
        mapped.style = {
          font_size: Number(clip.style.fontSize),
          color: String(clip.style.color || "#ffffff"),
          align:
            clip.style.align === "left" || clip.style.align === "right"
              ? clip.style.align
              : "center",
          bold: String(clip.style.fontWeight || "") === "700",
        };
      }
      if (clip.crop) {
        mapped.x = clip.crop.x + clip.crop.width / 2;
        mapped.y = clip.crop.y + clip.crop.height / 2;
        mapped.scale = clip.crop.width;
        dropped.add("裁切窗口（按位置与缩放近似）");
      }
      if (Array.isArray(clip.animations) && clip.animations.length) dropped.add("关键帧动画");
      if (clip.caption) dropped.add("逐字字幕样式");
      target.clips.push(mapped);
    }
  }
  return { doc: normalizeTimelineDoc(doc), dropped: [...dropped] };
}
