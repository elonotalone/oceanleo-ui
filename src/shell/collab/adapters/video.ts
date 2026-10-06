/**
 * 视频时间线的多人同改适配（work-chat W14，契约 §9.15）。
 *
 * 合并粒度 = 片段：每个轨道、每个片段各一个实体，实体 id 就是时间线文档里已有的
 * `track.id` / `clip.id`（不另生成）。片段所在轨道、起止、音量、位置等是实体的字段，
 * 两个人同时改同一个片段的不同字段都保留，同一字段后改的人胜。
 *
 * 纯函数、不依赖 yjs，也不 import 编辑器运行时（只借类型），所以能在 node 里直接测。
 */
import type { TimelineClip, TimelineDoc, TimelineTrack, TrackKind } from "../../video-editor/types";

export const VIDEO_ROOT = "oceanleo:video";

export interface EntityDoc {
  order: string[];
  entities: Record<string, Record<string, unknown>>;
  meta?: Record<string, unknown>;
}

const TRACK = "t:";
const CLIP = "c:";
const TRACK_KINDS: readonly string[] = ["video", "audio", "text", "image"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function videoTrackKey(id: string): string {
  return `${TRACK}${id}`;
}
export function videoClipKey(id: string): string {
  return `${CLIP}${id}`;
}

/** 编辑器里的时间线文档 → 协同实体。 */
export function videoToEntities(doc: TimelineDoc): EntityDoc {
  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  for (const track of doc.tracks) {
    const key = videoTrackKey(track.id);
    order.push(key);
    entities[key] = { kind: track.kind };
  }
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      const { id, ...fields } = clip;
      const key = videoClipKey(id);
      const entity: Record<string, unknown> = { trackId: track.id };
      for (const [name, value] of Object.entries(fields)) {
        if (value !== undefined) entity[name] = value;
      }
      order.push(key);
      entities[key] = entity;
    }
  }
  return {
    order,
    entities,
    meta: { width: doc.width, height: doc.height, fps: doc.fps },
  };
}

/** 协同实体 → 时间线文档。指向已被删掉的轨道的片段随轨道一起消失。 */
export function videoFromEntities(
  input: { order: string[]; entities: Record<string, Record<string, unknown>>; meta?: Record<string, unknown> },
  prev: TimelineDoc | null,
): TimelineDoc {
  const meta = input.meta ?? {};
  const tracks: TimelineTrack[] = [];
  const byId = new Map<string, TimelineTrack>();
  for (const key of input.order) {
    if (!key.startsWith(TRACK)) continue;
    const entity = input.entities[key];
    if (!isRecord(entity)) continue;
    const id = key.slice(TRACK.length);
    if (byId.has(id)) continue;
    const kind = TRACK_KINDS.includes(String(entity.kind)) ? (entity.kind as TrackKind) : "video";
    const track: TimelineTrack = { id, kind, clips: [] };
    byId.set(id, track);
    tracks.push(track);
  }
  const seen = new Set<string>();
  for (const key of input.order) {
    if (!key.startsWith(CLIP) || seen.has(key)) continue;
    seen.add(key);
    const entity = input.entities[key];
    if (!isRecord(entity)) continue;
    const { trackId, ...fields } = entity;
    const track = byId.get(String(trackId));
    if (!track) continue;
    track.clips.push({ ...(fields as Omit<TimelineClip, "id">), id: key.slice(CLIP.length) } as TimelineClip);
  }
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    width: num(meta.width, prev?.width ?? 1920),
    height: num(meta.height, prev?.height ?? 1080),
    fps: num(meta.fps, prev?.fps ?? 30),
    tracks,
  };
}

/** 从 Y.Doc 里读出实体根（鸭子类型，不 import yjs）。 */
export function readEntityRoot(doc: unknown, rootName: string): Required<EntityDoc> {
  const d = doc as {
    getArray(name: string): { toArray(): unknown[] };
    getMap(name: string): { toJSON(): unknown };
  };
  const order = d.getArray(`${rootName}:order`).toArray().map(String);
  const entities = d.getMap(`${rootName}:entities`).toJSON();
  const meta = d.getMap(`${rootName}:meta`).toJSON();
  return {
    order,
    entities: (isRecord(entities) ? entities : {}) as Record<string, Record<string, unknown>>,
    meta: isRecord(meta) ? meta : {},
  };
}

export function videoFromYDoc(doc: unknown): TimelineDoc {
  return videoFromEntities(readEntityRoot(doc, VIDEO_ROOT), null);
}

/** 版本 JSON（TimelineDoc 本身，或带 doc / project 外壳）→ 时间线文档；认不出返回空文档。 */
export function videoFromRevisionJson(json: unknown): TimelineDoc {
  const candidates = isRecord(json) ? [json, json.doc, json.project, json.timeline] : [];
  for (const candidate of candidates) {
    if (isRecord(candidate) && Array.isArray(candidate.tracks)) {
      return videoFromEntities(
        videoToEntities({
          width: Number(candidate.width) || 1920,
          height: Number(candidate.height) || 1080,
          fps: Number(candidate.fps) || 30,
          tracks: (candidate.tracks as unknown[]).filter(isRecord).map((track) => ({
            id: String(track.id ?? ""),
            kind: (TRACK_KINDS.includes(String(track.kind)) ? track.kind : "video") as TrackKind,
            clips: Array.isArray(track.clips)
              ? (track.clips as unknown[]).filter(isRecord).map((clip) => clip as unknown as TimelineClip)
              : [],
          })),
        }),
        null,
      );
    }
  }
  return { width: 1920, height: 1080, fps: 30, tracks: [] };
}

export function videoClipCount(doc: TimelineDoc): number {
  return doc.tracks.reduce((sum, track) => sum + track.clips.length, 0);
}

function clipMap(doc: TimelineDoc): Map<string, { clip: TimelineClip; track: TimelineTrack }> {
  const map = new Map<string, { clip: TimelineClip; track: TimelineTrack }>();
  for (const track of doc.tracks) for (const clip of track.clips) map.set(clip.id, { clip, track });
  return map;
}

export interface VideoClipChange {
  added: string[];
  removed: string[];
  changed: string[];
}

/** 逐片段对比两份时间线。 */
export function videoDiff(prev: TimelineDoc | null, next: TimelineDoc): VideoClipChange {
  const before = prev ? clipMap(prev) : new Map();
  const after = clipMap(next);
  const added: string[] = [];
  const changed: string[] = [];
  for (const [id, entry] of after) {
    const old = before.get(id);
    if (!old) added.push(id);
    else if (old.track.id !== entry.track.id || JSON.stringify(old.clip) !== JSON.stringify(entry.clip)) changed.push(id);
  }
  const removed = [...before.keys()].filter((id) => !after.has(id));
  return { added, removed, changed };
}

/** 一句话：「新增 2 段、移动/调整 1 段」。无变化返回 null。 */
export function videoDescribeChange(prev: unknown, next: unknown): string | null {
  if (!isRecord(next) || !Array.isArray(next.tracks)) return null;
  const nextDoc = next as unknown as TimelineDoc;
  const prevDoc = isRecord(prev) && Array.isArray(prev.tracks) ? (prev as unknown as TimelineDoc) : null;
  const { added, removed, changed } = videoDiff(prevDoc, nextDoc);
  const parts: string[] = [];
  if (added.length) parts.push(`新增了 ${added.length} 段`);
  if (removed.length) parts.push(`删掉了 ${removed.length} 段`);
  if (changed.length) parts.push(`调整了 ${changed.length} 段`);
  if (!prevDoc && !parts.length) return null;
  const prevTracks = prevDoc?.tracks.length ?? nextDoc.tracks.length;
  if (nextDoc.tracks.length > prevTracks) parts.push(`加了 ${nextDoc.tracks.length - prevTracks} 条轨道`);
  if (nextDoc.tracks.length < prevTracks) parts.push(`去掉了 ${prevTracks - nextDoc.tracks.length} 条轨道`);
  return parts.length ? `${parts.join("，")}（时间线）` : null;
}

/** 回放「从这一步接手」：快照就是编辑器能打开的时间线文档。 */
export function videoToArtifactJson(snapshot: unknown): unknown {
  return videoFromRevisionJson(snapshot);
}
