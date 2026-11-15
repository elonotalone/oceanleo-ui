// ============================================================================
// @oceanleo/ui — 时间线纯模型操作（无 DOM 依赖，全部不可变更新）
// ----------------------------------------------------------------------------
// 所有对 TimelineDoc 的结构性修改集中在这里：加删轨、加删 clip、移动、trim、
// 分割、复制、吸附、重叠消解。useVideoTimeline 只负责把这些纯函数接到
// state / undo 栈上。
// ============================================================================

import type {
  TimelineClip,
  TimelineDoc,
  TimelineTrack,
  TrackKind,
} from "./types";
import { TIMELINE_FONT_FAMILIES } from "./types";

export const MIN_CLIP_MS = 100;
export const DEFAULT_IMAGE_CLIP_MS = 4000;
export const DEFAULT_TEXT_CLIP_MS = 3000;

export function makeId(prefix: string): string {
  const raw =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw.replace(/-/g, "").slice(0, 12)}`;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clipEndMs(clip: TimelineClip): number {
  return clip.start_ms + clip.duration_ms;
}

/** 源消耗时长（变速前的素材区间长度）。 */
export function sourceSpanMs(clip: TimelineClip): number {
  return clip.duration_ms * (clip.speed ?? 1);
}

/** 最大可用时间线时长，保证预览和 FFmpeg 都不会读过素材尾部。 */
export function availableTimelineDurationMs(
  clip: TimelineClip,
  sourceInMs = clip.in_ms ?? 0,
): number {
  const sourceDuration = clip.source_duration_ms;
  if (!Number.isFinite(sourceDuration) || Number(sourceDuration) <= 0) {
    return Infinity;
  }
  const speed = clampNumber(clip.speed ?? 1, 0.25, 4);
  return Math.max(
    MIN_CLIP_MS,
    Math.floor((Number(sourceDuration) - Math.max(0, sourceInMs)) / speed),
  );
}

export function createEmptyDoc(): TimelineDoc {
  return {
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [
      { id: makeId("track"), kind: "video", clips: [] },
      { id: makeId("track"), kind: "audio", clips: [] },
      { id: makeId("track"), kind: "text", clips: [] },
      { id: makeId("track"), kind: "image", clips: [] },
    ],
  };
}

function canonicalNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  return clampNumber(Number.isFinite(numeric) ? numeric : fallback, min, max);
}

export function timelineFontFamily(value: unknown): string {
  return TIMELINE_FONT_FAMILIES.includes(value as typeof TIMELINE_FONT_FAMILIES[number])
    ? String(value) : "sans-serif";
}

export function timelineFontStack(value: unknown): string {
  const family = timelineFontFamily(value);
  const resolved = ({ "sans-serif": "Noto Sans CJK SC", serif: "DejaVu Serif", monospace: "DejaVu Sans Mono" } as Record<string, string>)[family] || family;
  return `${JSON.stringify(resolved)}, "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", ${family === "serif" || family === "monospace" ? family : "sans-serif"}`;
}

/** Crop bounds always describe a non-empty rectangle contained in the source. */
export function normalizeTimelineCrop(crop: TimelineClip["crop"]): NonNullable<TimelineClip["crop"]> {
  const x = canonicalNumber(crop?.x, 0, 0, 0.99);
  const y = canonicalNumber(crop?.y, 0, 0, 0.99);
  return { x, y,
    width: canonicalNumber(crop?.width, 1, 0.01, 1 - x),
    height: canonicalNumber(crop?.height, 1, 0.01, 1 - y) };
}

function canonicalColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : fallback;
}

/** 列表是可见文字转换，预览与导出都读取同一份 text；不假装支持富文本列表。 */
function listText(text: string, kind: "bullet" | "ordered"): string {
  let item = 0;
  return text.split("\n").map((line) => {
    if (!line.trim()) return line;
    item += 1;
    return `${kind === "bullet" ? "•" : `${item}.`} ${line}`;
  }).join("\n");
}

export function timelineTextListKind(clip: TimelineClip): "none" | "bullet" | "ordered" {
  const record = clip.text_list;
  return record &&
    (record.kind === "bullet" || record.kind === "ordered") &&
    typeof record.source_text === "string" &&
    clip.text === listText(record.source_text, record.kind)
    ? record.kind : "none";
}

/** 只撤销本编辑器生成且仍完整的前缀；原文字已有的项目符号和编号始终保留。 */
export function timelineTextListPatch(
  clip: TimelineClip,
  kind: "none" | "bullet" | "ordered",
): Partial<TimelineClip> {
  const source = timelineTextListKind(clip) === "none"
    ? String(clip.text ?? "") : clip.text_list!.source_text;
  return kind === "none"
    ? { text: source, text_list: undefined }
    : { text: listText(source, kind), text_list: Object.freeze({ kind, source_text: source }) };
}

/** 大小写直接修改内容；已有受管列表继续保留可撤销的前缀记录。 */
export function timelineTextCasePatch(
  clip: TimelineClip,
  kind: "upper" | "lower",
): Partial<TimelineClip> {
  const list = timelineTextListKind(clip);
  const source = list === "none" ? String(clip.text ?? "") : clip.text_list!.source_text;
  const text = kind === "upper" ? source.toUpperCase() : source.toLowerCase();
  return timelineTextListPatch({ ...clip, text, text_list: undefined }, list);
}

/**
 * Canonical model consumed by both the canvas preview and the FFmpeg request.
 * Defaults and bounds mirror the converter contract so a reopened legacy
 * project cannot render one value in-browser and another value on export.
 */
export function normalizeTimelineDoc(doc: TimelineDoc): TimelineDoc {
  const normalized: TimelineDoc = {
    width: Math.round(canonicalNumber(doc.width, 1920, 16, 3840)),
    height: Math.round(canonicalNumber(doc.height, 1080, 16, 3840)),
    fps: Math.round(canonicalNumber(doc.fps, 30, 1, 60)),
    tracks: doc.tracks.map((track) => ({
      id: track.id,
      kind: track.kind,
      clips: track.clips.map((clip) => {
        const next: TimelineClip = {
          ...clip,
          start_ms: Math.max(0, Math.round(Number(clip.start_ms) || 0)),
          duration_ms: Math.max(
            MIN_CLIP_MS,
            Math.round(Number(clip.duration_ms) || MIN_CLIP_MS),
          ),
        };
        const transition = clip.transition_in;
        if (
          transition &&
          ["fade", "crossfade", "black"].includes(transition.type)
        ) {
          next.transition_in = {
            type: transition.type,
            duration_ms: Math.round(
              canonicalNumber(transition.duration_ms, 500, 100, 3_000),
            ),
          };
        } else {
          delete next.transition_in;
        }
        if (track.kind === "video" || track.kind === "audio") {
          next.speed = canonicalNumber(clip.speed, 1, 0.25, 4);
          next.volume = canonicalNumber(clip.volume, 1, 0, 2);
          next.muted = clip.muted === true;
          next.in_ms = Math.max(0, Math.round(Number(clip.in_ms) || 0));
          if (
            Number.isFinite(clip.source_duration_ms) &&
            Number(clip.source_duration_ms) > 0
          ) {
            next.source_duration_ms = Math.round(
              Number(clip.source_duration_ms),
            );
            next.in_ms = Math.min(
              next.in_ms,
              Math.max(
                0,
                next.source_duration_ms - MIN_CLIP_MS * next.speed,
              ),
            );
            next.duration_ms = Math.min(
              next.duration_ms,
              availableTimelineDurationMs(next),
            );
          } else {
            delete next.source_duration_ms;
          }
        }
        if (track.kind === "video" || track.kind === "image") {
          next.x = canonicalNumber(clip.x, 0.5, 0, 1);
          next.y = canonicalNumber(clip.y, 0.5, 0, 1);
          next.scale = canonicalNumber(
            clip.scale,
            track.kind === "video" ? 1 : 0.35,
            track.kind === "video" ? 0.05 : 0.02,
            2,
          );
          next.opacity = canonicalNumber(clip.opacity, 1, 0, 1);
          next.rotation = canonicalNumber(clip.rotation, 0, -180, 180);
          if (clip.flip_x === true) next.flip_x = true;
          else delete next.flip_x;
          if (clip.flip_y === true) next.flip_y = true;
          else delete next.flip_y;
        }
        if (track.kind === "video" || track.kind === "image") {
          next.fit = ["contain", "cover", "stretch"].includes(
            String(clip.fit),
          )
            ? clip.fit
            : "contain";
          next.brightness = canonicalNumber(clip.brightness, 0, -1, 1);
          next.contrast = canonicalNumber(clip.contrast, 1, 0, 2);
          next.saturation = canonicalNumber(clip.saturation, 1, 0, 3);
        }
        if (track.kind === "image") {
          if (clip.crop) next.crop = normalizeTimelineCrop(clip.crop);
          next.radius = canonicalNumber(clip.radius, 0, 0, 1000);
          if (clip.border) next.border = {
            width: canonicalNumber(clip.border.width, 0, 0, 100),
            color: canonicalColor(clip.border.color, "#000000"),
          };
          next.alt = typeof clip.alt === "string" ? clip.alt.slice(0, 2000) : "";
        }
        if (track.kind === "text") {
          if (timelineTextListKind(clip) === "none") delete next.text_list;
          else next.text_list = Object.freeze({ ...clip.text_list! });
          const style = clip.style || {};
          next.style = {
            ...style,
            font_size: canonicalNumber(style.font_size, 64, 8, 300),
            font_family: timelineFontFamily(style.font_family),
            color: canonicalColor(style.color, "#ffffff"),
            ...(style.background ? { background: canonicalColor(style.background, "#000000") } : {}),
            x: canonicalNumber(style.x, 0.5, 0, 1),
            y: canonicalNumber(style.y, 0.85, 0, 1),
            align: ["left", "center", "right", "justify"].includes(String(style.align))
              ? style.align
              : "center",
            bold: style.bold === true,
            italic: style.italic === true,
            underline: style.underline === true,
            strike: style.strike === true,
            line_height: canonicalNumber(style.line_height, 1.3, 0.5, 3),
            letter_spacing: canonicalNumber(style.letter_spacing, 0, -10, 100),
            vertical_text: style.vertical_text === true,
          };
        }
        return next;
      }),
    })),
  };
  return normalized;
}

export function docDurationMs(doc: TimelineDoc): number {
  let max = 0;
  for (const track of doc.tracks) {
    for (const clip of track.clips) max = Math.max(max, clipEndMs(clip));
  }
  return max;
}

export interface ClipLocation {
  track: TimelineTrack;
  clip: TimelineClip;
  trackIndex: number;
  clipIndex: number;
}

export function findClip(doc: TimelineDoc, clipId: string): ClipLocation | null {
  for (let trackIndex = 0; trackIndex < doc.tracks.length; trackIndex += 1) {
    const track = doc.tracks[trackIndex];
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex >= 0) {
      return { track, clip: track.clips[clipIndex], trackIndex, clipIndex };
    }
  }
  return null;
}

function sortClips(clips: TimelineClip[]): TimelineClip[] {
  return [...clips].sort((a, b) => a.start_ms - b.start_ms);
}

function replaceTrack(
  doc: TimelineDoc,
  trackId: string,
  update: (track: TimelineTrack) => TimelineTrack,
): TimelineDoc {
  return {
    ...doc,
    tracks: doc.tracks.map((track) => (track.id === trackId ? update(track) : track)),
  };
}

export function patchClipIn(
  doc: TimelineDoc,
  clipId: string,
  patch: Partial<TimelineClip>,
): TimelineDoc {
  const located = findClip(doc, clipId);
  if (!located) return doc;
  return replaceTrack(doc, located.track.id, (track) => ({
    ...track,
    clips: sortClips(
      track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
    ),
  }));
}

export function addClipToTrack(
  doc: TimelineDoc,
  trackId: string,
  clip: TimelineClip,
): TimelineDoc {
  return replaceTrack(doc, trackId, (track) => ({
    ...track,
    clips: sortClips([...track.clips, clip]),
  }));
}

export function removeClipFrom(doc: TimelineDoc, clipId: string): TimelineDoc {
  const located = findClip(doc, clipId);
  if (!located) return doc;
  return replaceTrack(doc, located.track.id, (track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== clipId),
  }));
}

/**
 * 在轨道上为一个 clip 找不与他人重叠、离期望位置最近的落点。
 * 轨道被视为一串已占用区间；返回能容纳 duration 的 gap 内最近合法 start。
 */
export function resolveOverlapStart(
  track: TimelineTrack,
  clipId: string,
  desiredStart: number,
  durationMs: number,
): number {
  const others = sortClips(track.clips.filter((clip) => clip.id !== clipId));
  const want = Math.max(0, desiredStart);
  let best: number | null = null;
  let gapStart = 0;
  const consider = (candidate: number) => {
    if (best === null || Math.abs(candidate - want) < Math.abs(best - want)) {
      best = candidate;
    }
  };
  for (const other of others) {
    const gapEnd = other.start_ms;
    if (gapEnd - gapStart >= durationMs) {
      consider(clampNumber(want, gapStart, gapEnd - durationMs));
    }
    gapStart = Math.max(gapStart, clipEndMs(other));
  }
  consider(Math.max(want, gapStart));
  return best ?? gapStart;
}

/** 移动 clip：同轨改 start，或移到同 kind 目标轨；落点做重叠消解。 */
export function moveClipTo(
  doc: TimelineDoc,
  clipId: string,
  targetTrackId: string,
  desiredStart: number,
): TimelineDoc {
  const located = findClip(doc, clipId);
  if (!located) return doc;
  const target = doc.tracks.find((track) => track.id === targetTrackId);
  if (!target || target.kind !== located.track.kind) return doc;
  const start = resolveOverlapStart(
    target,
    clipId,
    desiredStart,
    located.clip.duration_ms,
  );
  const moved: TimelineClip = { ...located.clip, start_ms: Math.round(start) };
  const removed = removeClipFrom(doc, clipId);
  return addClipToTrack(removed, targetTrackId, moved);
}

/** 在 timeMs 处分割 clip；transition_in 留给前半段。 */
export function splitClipAt(
  doc: TimelineDoc,
  clipId: string,
  timeMs: number,
): TimelineDoc {
  const located = findClip(doc, clipId);
  if (!located) return doc;
  const { clip } = located;
  const offset = timeMs - clip.start_ms;
  if (offset < MIN_CLIP_MS || clip.duration_ms - offset < MIN_CLIP_MS) return doc;
  const speed = clip.speed ?? 1;
  const first: TimelineClip = {
    ...clip,
    duration_ms: Math.round(offset),
  };
  const second: TimelineClip = {
    ...clip,
    id: makeId("clip"),
    start_ms: Math.round(timeMs),
    duration_ms: Math.round(clip.duration_ms - offset),
    ...(clip.source_url
      ? { in_ms: Math.round((clip.in_ms ?? 0) + offset * speed) }
      : {}),
  };
  delete second.transition_in;
  return replaceTrack(doc, located.track.id, (track) => ({
    ...track,
    clips: sortClips([
      ...track.clips.filter((entry) => entry.id !== clipId),
      first,
      second,
    ]),
  }));
}

/**
 * 剪掉 [startMs, endMs) 这一段，后面的内容整体左移补上（ripple 删除）。
 *
 * 所有轨道一起剪：只剪视频轨会让声音和字幕跟画面错位，那是比不剪更糟的结果。
 * 剪完不足 `MIN_CLIP_MS` 的碎片直接丢掉——留下一个 3 帧的残片，用户既看不见
 * 也删不掉。
 */
export function cutTimelineRange(
  doc: TimelineDoc,
  startMs: number,
  endMs: number,
): TimelineDoc {
  const from = Math.max(0, Math.round(Math.min(startMs, endMs)));
  const to = Math.max(0, Math.round(Math.max(startMs, endMs)));
  const span = to - from;
  if (span < MIN_CLIP_MS) return doc;
  let changed = false;
  const tracks = doc.tracks.map((track) => {
    const next: TimelineClip[] = [];
    for (const clip of track.clips) {
      const clipStart = clip.start_ms;
      const clipEnd = clipEndMs(clip);
      if (clipEnd <= from) {
        next.push(clip);
        continue;
      }
      if (clipStart >= to) {
        changed = true;
        next.push({ ...clip, start_ms: Math.max(0, clipStart - span) });
        continue;
      }
      changed = true;
      const speed = clip.speed ?? 1;
      const headMs = Math.max(0, from - clipStart);
      const tailMs = Math.max(0, clipEnd - to);
      if (headMs >= MIN_CLIP_MS) {
        next.push({ ...clip, duration_ms: Math.round(headMs) });
      }
      if (tailMs >= MIN_CLIP_MS) {
        const consumed = Math.max(0, to - clipStart);
        const tail: TimelineClip = {
          ...clip,
          id: headMs >= MIN_CLIP_MS ? makeId("clip") : clip.id,
          // 幸存的后半段原本从 max(片段起点, 剪口末端) 开始，整体左移一个剪口宽度。
          start_ms: Math.round(Math.max(clipStart, to) - span),
          duration_ms: Math.round(tailMs),
          ...(clip.source_url
            ? { in_ms: Math.round((clip.in_ms ?? 0) + consumed * speed) }
            : {}),
        };
        if (headMs >= MIN_CLIP_MS) delete tail.transition_in;
        next.push(tail);
      }
    }
    return {
      ...track,
      clips: next.sort((left, right) => left.start_ms - right.start_ms),
    };
  });
  return changed ? { ...doc, tracks } : doc;
}

/** 复制 clip，副本落在原 clip 结束处（重叠消解）。返回新 clip id。 */
export function duplicateClipIn(
  doc: TimelineDoc,
  clipId: string,
): { doc: TimelineDoc; newClipId: string } {
  const located = findClip(doc, clipId);
  if (!located) return { doc, newClipId: "" };
  const copy: TimelineClip = {
    ...located.clip,
    id: makeId("clip"),
    start_ms: clipEndMs(located.clip),
  };
  const start = resolveOverlapStart(
    located.track,
    copy.id,
    copy.start_ms,
    copy.duration_ms,
  );
  copy.start_ms = Math.round(start);
  return {
    doc: addClipToTrack(doc, located.track.id, copy),
    newClipId: copy.id,
  };
}

/** 变速：保持源消耗区间不变，重算时间线时长。 */
export function changeClipSpeed(
  doc: TimelineDoc,
  clipId: string,
  nextSpeed: number,
): TimelineDoc {
  const located = findClip(doc, clipId);
  if (!located) return doc;
  const speed = clampNumber(nextSpeed, 0.25, 4);
  const span = sourceSpanMs(located.clip);
  const duration = Math.max(MIN_CLIP_MS, Math.round(span / speed));
  return patchClipIn(doc, clipId, { speed, duration_ms: duration });
}

export function addTrackTo(doc: TimelineDoc, kind: TrackKind): TimelineDoc {
  return {
    ...doc,
    tracks: [...doc.tracks, { id: makeId("track"), kind, clips: [] }],
  };
}

export function removeTrackFrom(doc: TimelineDoc, trackId: string): TimelineDoc {
  if (doc.tracks.length <= 1) return doc;
  return { ...doc, tracks: doc.tracks.filter((track) => track.id !== trackId) };
}

/** 吸附候选点：0、播放头、除被拖 clip 外所有 clip 边缘。 */
export function snapPoints(
  doc: TimelineDoc,
  excludeClipIds: readonly string[],
  playheadMs: number,
): number[] {
  const points = [0, playheadMs];
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      if (excludeClipIds.includes(clip.id)) continue;
      points.push(clip.start_ms, clipEndMs(clip));
    }
  }
  return points;
}

/**
 * 对一组待吸附边缘求最优修正量：任一边缘落进阈值内就整体平移对齐。
 * 返回 null 表示无吸附。
 */
export function snapDelta(
  edges: readonly number[],
  points: readonly number[],
  thresholdMs: number,
): number | null {
  let best: number | null = null;
  for (const edge of edges) {
    for (const point of points) {
      const delta = point - edge;
      if (Math.abs(delta) <= thresholdMs && (best === null || Math.abs(delta) < Math.abs(best))) {
        best = delta;
      }
    }
  }
  return best;
}

/**
 * trim：把 clip 的一端拖到 desiredMs（时间线坐标）。
 * - start 端受限于：左邻 clip 末尾、源内起点（in_ms 不可为负）、最小时长。
 * - end 端受限于：右邻 clip 起点、最小时长。源尾部越界交给预览冻结/服务端钳制。
 */
export function trimClipTo(
  doc: TimelineDoc,
  clipId: string,
  edge: "start" | "end",
  desiredMs: number,
): TimelineDoc {
  const located = findClip(doc, clipId);
  if (!located) return doc;
  const { clip, track } = located;
  const speed = clip.speed ?? 1;
  const others = track.clips.filter((entry) => entry.id !== clipId);
  if (edge === "start") {
    const leftNeighborEnd = Math.max(
      0,
      ...others
        .filter((entry) => entry.start_ms < clip.start_ms)
        .map((entry) => clipEndMs(entry)),
    );
    let minStart = leftNeighborEnd;
    if (clip.source_url) {
      minStart = Math.max(minStart, clip.start_ms - (clip.in_ms ?? 0) / speed);
    }
    const maxStart = clipEndMs(clip) - MIN_CLIP_MS;
    const start = Math.round(clampNumber(desiredMs, minStart, maxStart));
    const delta = start - clip.start_ms;
    if (!delta) return doc;
    const patch: Partial<TimelineClip> = {
      start_ms: start,
      duration_ms: clip.duration_ms - delta,
    };
    if (clip.source_url) {
      patch.in_ms = Math.max(0, Math.round((clip.in_ms ?? 0) + delta * speed));
    }
    return patchClipIn(doc, clipId, patch);
  }
  const rightNeighborStart = Math.min(
    Infinity,
    ...others
      .filter((entry) => entry.start_ms >= clipEndMs(clip))
      .map((entry) => entry.start_ms),
  );
  const sourceEnd = clip.start_ms + availableTimelineDurationMs(clip);
  const end = Math.round(
    clampNumber(
      desiredMs,
      clip.start_ms + MIN_CLIP_MS,
      Math.min(rightNeighborStart, sourceEnd),
    ),
  );
  if (end === clipEndMs(clip)) return doc;
  return patchClipIn(doc, clipId, { duration_ms: end - clip.start_ms });
}

/** mm:ss（>=1h 时 h:mm:ss），withTenths 加十分位（transport 用）。 */
export function formatMs(ms: number, withTenths = false): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base =
    hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (!withTenths) return base;
  return `${base}.${Math.floor((clamped % 1000) / 100)}`;
}

const MAX_TIMELINE_TRACKS = 64;
const MAX_TIMELINE_CLIPS = 5_000;
const MAX_TIMELINE_SOURCE_URL = 8_192;

export function validTimelineSourceReference(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  return typeof ref.artifactId === "string" && uuid.test(ref.artifactId)
    && typeof ref.revisionId === "string" && uuid.test(ref.revisionId)
    && typeof ref.path === "string" && ref.path.length > 0 && ref.path.length <= 512
    && !ref.path.startsWith("/") && !ref.path.includes("\\") && !ref.path.includes(":")
    && ref.path.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}

function validTimelineSourceUrl(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > MAX_TIMELINE_SOURCE_URL
  ) {
    return false;
  }
  const source = value.trim();
  if (source.startsWith("/") && !source.startsWith("//")) return true;
  try {
    return ["http:", "https:"].includes(new URL(source).protocol);
  } catch {
    return false;
  }
}

/** 返回视频工程的首个结构问题；空串代表可安全规范化。 */
export function timelineDocIssue(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "工程根节点必须是对象";
  }
  const doc = value as TimelineDoc;
  if (
    !Number.isFinite(doc.width) ||
    doc.width <= 0 ||
    !Number.isFinite(doc.height) ||
    doc.height <= 0 ||
    !Number.isFinite(doc.fps) ||
    doc.fps <= 0
  ) {
    return "画布宽高和帧率必须是有限数字";
  }
  if (!Array.isArray(doc.tracks)) return "tracks 必须是数组";
  if (doc.tracks.length > MAX_TIMELINE_TRACKS) {
    return `轨道超过 ${MAX_TIMELINE_TRACKS} 条安全上限`;
  }
  const trackIds = new Set<string>();
  const clipIds = new Set<string>();
  let clipCount = 0;
  for (let trackIndex = 0; trackIndex < doc.tracks.length; trackIndex += 1) {
    if (!(trackIndex in doc.tracks)) return `轨道 ${trackIndex + 1} 为空洞`;
    const track = doc.tracks[trackIndex];
    if (!track || typeof track !== "object") {
      return `轨道 ${trackIndex + 1} 不是对象`;
    }
    if (!track.id || typeof track.id !== "string" || track.id.length > 200) {
      return `轨道 ${trackIndex + 1} 缺少有效 id`;
    }
    if (trackIds.has(track.id)) return `轨道 id 重复：${track.id}`;
    trackIds.add(track.id);
    if (!["video", "audio", "text", "image"].includes(track.kind)) {
      return `轨道 ${track.id} 类型无效`;
    }
    if (!Array.isArray(track.clips)) return `轨道 ${track.id} 的 clips 必须是数组`;
    clipCount += track.clips.length;
    if (clipCount > MAX_TIMELINE_CLIPS) {
      return `片段超过 ${MAX_TIMELINE_CLIPS} 个安全上限`;
    }
    for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex += 1) {
      if (!(clipIndex in track.clips)) {
        return `轨道 ${track.id} 的片段 ${clipIndex + 1} 为空洞`;
      }
      const clip = track.clips[clipIndex];
      if (!clip || typeof clip !== "object") {
        return `轨道 ${track.id} 的片段 ${clipIndex + 1} 不是对象`;
      }
      if (!clip.id || typeof clip.id !== "string" || clip.id.length > 200) {
        return `轨道 ${track.id} 存在无效片段 id`;
      }
      if (clipIds.has(clip.id)) return `片段 id 重复：${clip.id}`;
      clipIds.add(clip.id);
      if (
        !Number.isFinite(clip.start_ms) ||
        clip.start_ms < 0 ||
        !Number.isFinite(clip.duration_ms) ||
        clip.duration_ms <= 0
      ) {
        return `片段 ${clip.id} 的时间范围无效`;
      }
      if (
        track.kind !== "text" &&
        !validTimelineSourceUrl(clip.source_url) && !validTimelineSourceReference(clip.source_ref)
      ) {
        return `片段 ${clip.id} 缺少安全的 http(s) 媒体源`;
      }
      if (
        track.kind === "text" &&
        clip.text !== undefined &&
        typeof clip.text !== "string"
      ) {
        return `文字片段 ${clip.id} 的 text 无效`;
      }
    }
  }
  return "";
}

/** 严格校验一份草稿 JSON 是否能当 TimelineDoc 恢复。 */
export function isTimelineDoc(value: unknown): value is TimelineDoc {
  return timelineDocIssue(value) === "";
}

export const TRACK_KIND_ORDER: TrackKind[] = ["video", "audio", "text", "image"];
