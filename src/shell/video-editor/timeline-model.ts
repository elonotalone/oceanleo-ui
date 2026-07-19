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
        }
        if (track.kind === "video") {
          next.fit = ["contain", "cover", "stretch"].includes(
            String(clip.fit),
          )
            ? clip.fit
            : "contain";
          next.brightness = canonicalNumber(clip.brightness, 0, -1, 1);
          next.contrast = canonicalNumber(clip.contrast, 1, 0, 2);
          next.saturation = canonicalNumber(clip.saturation, 1, 0, 3);
        }
        if (track.kind === "text") {
          const style = clip.style || {};
          next.style = {
            ...style,
            font_size: canonicalNumber(style.font_size, 64, 8, 300),
            color: style.color || "#ffffff",
            x: canonicalNumber(style.x, 0.5, 0, 1),
            y: canonicalNumber(style.y, 0.85, 0, 1),
            align: ["left", "center", "right"].includes(String(style.align))
              ? style.align
              : "center",
            bold: style.bold === true,
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

/** 宽松校验一份草稿 JSON 是否能当 TimelineDoc 恢复。 */
export function isTimelineDoc(value: unknown): value is TimelineDoc {
  if (!value || typeof value !== "object") return false;
  const doc = value as TimelineDoc;
  if (
    typeof doc.width !== "number" ||
    typeof doc.height !== "number" ||
    typeof doc.fps !== "number" ||
    !Array.isArray(doc.tracks)
  ) {
    return false;
  }
  return doc.tracks.every(
    (track) =>
      track &&
      typeof track.id === "string" &&
      ["video", "audio", "text", "image"].includes(track.kind) &&
      Array.isArray(track.clips) &&
      track.clips.every(
        (clip) =>
          clip &&
          typeof clip.id === "string" &&
          typeof clip.start_ms === "number" &&
          typeof clip.duration_ms === "number",
      ),
  );
}

export const TRACK_KIND_ORDER: TrackKind[] = ["video", "audio", "text", "image"];
