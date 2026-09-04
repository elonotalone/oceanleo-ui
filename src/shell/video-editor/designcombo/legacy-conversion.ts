/**
 * Stored OceanLeo timelines under the next core: read-only + one-click convert (R7).
 * Pure functions so "opening never rewrites the file" can be asserted without React.
 */
import {
  createEmptyDoc,
  isTimelineDoc,
  normalizeTimelineDoc,
} from "../timeline-model";
import type { TimelineClip, TimelineDoc, TrackKind } from "../types";
import {
  LEGACY_TIMELINE_SCHEMA,
  OPENVIDEO_PROJECT_SCHEMA,
  cloneOpenVideoProject,
  emptyOpenVideoProject,
  isOpenVideoProject,
  makeOpenVideoId,
  msToUs,
  normalizeOpenVideoProject,
  usToMs,
  type OpenVideoClip,
  type OpenVideoClipType,
  type OpenVideoProject,
  type OpenVideoTrackType,
  type OpenVideoTransform,
} from "./schema";

export const VIDEO_LEGACY_READONLY_NOTICE =
  "这份时间线是用旧引擎存的，现在是只读打开的。点「转换为新时间线」之后才会改动它。";

export type VideoConversionState =
  | "readonly"
  | "converting"
  | "converted"
  | "failed";

export type VideoConversionEvent =
  | { type: "request" }
  | { type: "resolve" }
  | { type: "reject" }
  | { type: "retry" };

export function nextVideoConversionState(
  state: VideoConversionState,
  event: VideoConversionEvent,
): VideoConversionState {
  switch (state) {
    case "readonly":
      return event.type === "request" ? "converting" : "readonly";
    case "converting":
      if (event.type === "resolve") return "converted";
      if (event.type === "reject") return "failed";
      return "converting";
    case "failed":
      return event.type === "retry" ? "converting" : "failed";
    case "converted":
      return "converted";
    default:
      return state;
  }
}

const KIND_TO_TRACK: Record<TrackKind, OpenVideoTrackType> = {
  video: "video",
  audio: "audio",
  image: "image",
  text: "caption",
};

const KIND_TO_CLIP: Record<TrackKind, OpenVideoClipType> = {
  video: "Video",
  audio: "Audio",
  image: "Image",
  text: "Caption",
};

/**
 * 旧文字片段的画面位置在 `style.x` / `style.y`（0..1 中心点），大小在 `font_size`。
 * 不许写死成 600×100 底栏字幕框：标题卡会从画面中央变成下方一条横条。
 */
function captionBoxFromLegacyText(
  clip: TimelineClip,
  canvasWidth: number,
  canvasHeight: number,
): OpenVideoTransform {
  const fontSize = clip.style?.font_size ?? 64;
  const lines = String(clip.text ?? "").split("\n");
  const lineCount = Math.max(1, lines.length);
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const width = Math.min(
    canvasWidth,
    Math.max(fontSize * 2, Math.round(longest * fontSize * 0.9)),
  );
  const height = Math.round(fontSize * 1.3 * lineCount);
  const nx = clip.style?.x ?? 0.5;
  const ny = clip.style?.y ?? 0.5;
  return {
    x: Math.round(nx * canvasWidth - width / 2),
    y: Math.round(ny * canvasHeight - height / 2),
    width,
    height,
    angle: clip.rotation ?? 0,
    opacity: clip.opacity ?? 1,
    zIndex: 20,
    flip: { x: false, y: false },
  };
}

export type VideoLegacyConversion =
  | { ok: true; data: OpenVideoProject; summary: string; dropped: string[] }
  | { ok: false; reason: string };

export interface VideoLegacyConversionInput {
  doc?: unknown;
  schema?: string;
  title?: string;
}

const MAX_CLIPS = 400;

function clipCount(doc: TimelineDoc): number {
  return doc.tracks.reduce((sum, track) => sum + track.clips.length, 0);
}

export function timelineDocToOpenVideo(doc: TimelineDoc): OpenVideoProject {
  const normalized = normalizeTimelineDoc(doc);
  const project = emptyOpenVideoProject(
    normalized.width,
    normalized.height,
    normalized.fps,
  );
  const trackByKind = new Map(
    project.tracks.map((track) => [track.type, track] as const),
  );
  for (const track of normalized.tracks) {
    const target = trackByKind.get(KIND_TO_TRACK[track.kind]);
    if (!target) continue;
    for (const clip of track.clips) {
      const id = clip.id || makeOpenVideoId("clip");
      const from = msToUs(clip.start_ms);
      const duration = msToUs(clip.duration_ms);
      const ov: OpenVideoClip = {
        id,
        type: KIND_TO_CLIP[track.kind],
        name: clip.text || track.kind,
        src: clip.source_url || "",
        text: clip.text,
        timing: {
          display: { from, to: from + duration },
          trim: {
            from: msToUs(clip.in_ms || 0),
            to: msToUs((clip.in_ms || 0) + (clip.source_duration_ms || clip.duration_ms)),
          },
          duration,
          playbackRate: clip.speed ?? 1,
        },
        transform: {
          x: Math.round((clip.x ?? 0.5) * normalized.width - normalized.width / 2 * (clip.scale ?? 1)),
          y: Math.round((clip.y ?? 0.5) * normalized.height - normalized.height / 2 * (clip.scale ?? 1)),
          width: Math.round(normalized.width * (clip.scale ?? 1)),
          height: Math.round(normalized.height * (clip.scale ?? 1)),
          angle: clip.rotation ?? 0,
          opacity: clip.opacity ?? 1,
          zIndex: 10,
          flip: { x: false, y: false },
        },
        volume: clip.muted ? 0 : clip.volume ?? 1,
        muted: clip.muted === true,
        audio: track.kind === "video" || track.kind === "audio",
      };
      if (track.kind === "text") {
        ov.caption = {
          words: [
            {
              text: clip.text || "",
              from: 0,
              to: duration / 1000,
              isKeyWord: false,
            },
          ],
          colors: {
            active: { color: clip.style?.color || "#ffffff" },
            future: { color: "#ffffff" },
          },
          positioning: {
            videoWidth: normalized.width,
            videoHeight: normalized.height,
          },
        };
        ov.style = {
          fontSize: clip.style?.font_size ?? 64,
          color: clip.style?.color || "#ffffff",
          align: clip.style?.align || "center",
          fontWeight: clip.style?.bold ? "700" : "400",
        };
        ov.transform = captionBoxFromLegacyText(
          clip,
          normalized.width,
          normalized.height,
        );
      }
      project.clips[id] = ov;
      target.clipIds.push(id);
    }
  }
  return normalizeOpenVideoProject(project);
}

export function planVideoLegacyConversion(
  input: VideoLegacyConversionInput,
): VideoLegacyConversion {
  const schema = String(input.schema || "");
  if (schema === OPENVIDEO_PROJECT_SCHEMA && isOpenVideoProject(input.doc)) {
    return {
      ok: true,
      data: normalizeOpenVideoProject(input.doc),
      summary: "已经是新时间线，不用转换。",
      dropped: [],
    };
  }
  if (!isTimelineDoc(input.doc)) {
    return {
      ok: false,
      reason:
        "这份文档里没有可识别的旧时间线（缺少 tracks/clips）。请在旧编辑器里打开确认内容还在，再转换。",
    };
  }
  const doc = normalizeTimelineDoc(input.doc);
  if (clipCount(doc) === 0) {
    return {
      ok: false,
      reason: "这份时间线是空的，没有可以转换的片段。",
    };
  }
  if (clipCount(doc) > MAX_CLIPS) {
    return {
      ok: false,
      reason: `这份时间线有 ${clipCount(doc)} 个片段，超过新引擎这一轮能接住的 ${MAX_CLIPS} 个。请先在旧编辑器里拆成更短的成片。`,
    };
  }
  const dropped: string[] = [];
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      if (clip.transition_in) {
        dropped.push(
          `片段 ${clip.id} 的转场「${clip.transition_in.type}」没有写进 OpenVideo JSON；请在专业模式里用内核转场重加。`,
        );
      }
    }
  }
  const data = timelineDocToOpenVideo(doc);
  for (const track of doc.tracks) {
    if (track.kind !== "text") continue;
    for (const clip of track.clips) {
      if (!data.clips[clip.id]) {
        dropped.push(
          `文字片段「${clip.text || clip.id}」没有写进新时间线。`,
        );
      }
    }
  }
  return {
    ok: true,
    data,
    summary: dropped.length
      ? `已转成新时间线，有 ${dropped.length} 项带不过去。`
      : "已转成新时间线。",
    dropped,
  };
}

function trackKindFromOpenVideo(type: string): TrackKind {
  const lower = type.toLowerCase();
  if (lower === "audio") return "audio";
  if (lower === "image") return "image";
  if (lower === "text" || lower === "caption") return "text";
  return "video";
}

export function openVideoToTimelineDoc(project: OpenVideoProject): TimelineDoc {
  const normalized = normalizeOpenVideoProject(project);
  const doc = createEmptyDoc();
  doc.width = normalized.settings.width;
  doc.height = normalized.settings.height;
  doc.fps = normalized.settings.fps;
  const byKind = new Map(doc.tracks.map((track) => [track.kind, track]));
  for (const track of normalized.tracks) {
    const kind = trackKindFromOpenVideo(track.type);
    const target = byKind.get(kind);
    if (!target) continue;
    for (const clipId of track.clipIds) {
      const clip = normalized.clips[clipId];
      if (!clip) continue;
      const start_ms = usToMs(clip.timing.display.from);
      const duration_ms = Math.max(
        100,
        usToMs(clip.timing.display.to - clip.timing.display.from),
      );
      const transform = clip.transform;
      const mapped: TimelineClip = {
        id: clip.id,
        start_ms,
        duration_ms,
        source_url: clip.src || undefined,
        in_ms: clip.timing.trim ? usToMs(clip.timing.trim.from) : 0,
        speed: clip.timing.playbackRate ?? 1,
        volume: clip.muted ? 0 : clip.volume ?? 1,
        muted: clip.muted === true || clip.volume === 0,
        text: clip.text,
        x: transform
          ? (transform.x + transform.width / 2) / Math.max(1, doc.width)
          : 0.5,
        y: transform
          ? (transform.y + transform.height / 2) / Math.max(1, doc.height)
          : 0.5,
        scale: transform
          ? transform.width / Math.max(1, doc.width)
          : 1,
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
      }
      target.clips.push(mapped);
    }
  }
  return normalizeTimelineDoc(doc);
}

export { LEGACY_TIMELINE_SCHEMA, OPENVIDEO_PROJECT_SCHEMA, cloneOpenVideoProject };
