import type { LibraryItem } from "../library-data";
import { isArtifactSourceTreeUrl } from "../artifact-contract";
import { looksLikeHtmlDocument } from "../website-inline-preview";
import { parseVideoProjectText, VIDEO_PROJECT_V2_SCHEMA } from "../workflow-carrier/video-project-doc";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const records = (value: unknown): RecordValue[] => Array.isArray(value)
  ? value.map(record).filter((value): value is RecordValue => value !== null) : [];
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const mediaType = (value: unknown): string => text(value).split(";")[0].toLowerCase();
const rasterType = (value: unknown): boolean => /^image\/(?:png|jpeg|webp|gif|avif|bmp|apng)$/.test(mediaType(value));
const rasterUrl = (url: string): boolean => /\.(?:png|jpe?g|webp|gif|avif|bmp|apng)(?:$|[?#])/i.test(url);
const jsonUrl = (url: string): boolean => /\.json(?:$|[?#])/i.test(url);
const duration = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function isVideoCanvasV2Item(item: LibraryItem): boolean {
  return [item.artifact?.sourceFormat, item.meta.source_format, item.meta.format]
    .some(value => text(value).toLowerCase() === VIDEO_PROJECT_V2_SCHEMA);
}

/** A known non-image declaration wins over a misleading file extension. */
export function videoCanvasBitmapPreview(item: LibraryItem): string {
  const url = text(item.previewUrl);
  if (!url || jsonUrl(url) || isArtifactSourceTreeUrl(url)) return "";
  const rendition = item.artifact?.renditions.preview;
  const declared = mediaType(rendition?.url === url ? rendition.mediaType : item.meta.preview_media_type);
  return (declared ? rasterType(declared) : rasterUrl(url)) ? url : "";
}

export interface VideoCanvasPreviewShot {
  id: string;
  title: string;
  durationSeconds: number | null;
}
export interface VideoCanvasPreviewSummary {
  title: string;
  nodeCount: number;
  edgeCount: number;
  shotCount: number;
  durationSeconds: number | null;
  scenes: { id: string; title: string; shots: VideoCanvasPreviewShot[] }[];
  ungroupedShots: VideoCanvasPreviewShot[];
}

function projectSummary(source: string, fallbackTitle: string): VideoCanvasPreviewSummary {
  const parsed = parseVideoProjectText(source);
  if (!parsed.ok) throw new Error(parsed.error);
  const doc = parsed.doc;
  const head = doc.versions[doc.headVersionId];
  const shots = records(head.shots).map((shot, index) => ({
    id: text(shot.shotId) || `shot-${index}`,
    title: text(shot.title) || `镜头 ${index + 1}`,
    durationSeconds: duration(shot.intendedDurationSeconds),
    sceneId: text(shot.sceneId),
  }));
  const assigned = new Set<string>();
  const scenes = records(head.scenes).map((scene, index) => {
    const id = text(scene.sceneId) || `scene-${index}`;
    const order = Array.isArray(scene.shotIds) ? scene.shotIds : [];
    const members = [
      ...order.flatMap(shotId => shots.filter(shot => shot.id === shotId)),
      ...shots.filter(shot => shot.sceneId === id),
    ].filter(shot => {
      if (assigned.has(shot.id)) return false;
      assigned.add(shot.id);
      return true;
    });
    return { id, title: text(scene.title) || `场景 ${index + 1}`, shots: members };
  });
  const clipEnds = records(head.clips).flatMap(clip => {
    const length = duration(clip.durationSeconds);
    const start = duration(clip.startSeconds);
    return length !== null && start !== null ? [start + length] : [];
  });
  const shotDurations = shots.flatMap(shot => shot.durationSeconds === null ? [] : [shot.durationSeconds]);
  return {
    title: text(doc.title) || fallbackTitle,
    nodeCount: head.graph.nodes.length,
    edgeCount: head.graph.edges.length,
    shotCount: shots.length,
    durationSeconds: clipEnds.length ? Math.max(...clipEnds)
      : shotDurations.length ? shotDurations.reduce((sum, value) => sum + value, 0) : null,
    scenes,
    ungroupedShots: shots.filter(shot => !assigned.has(shot.id)),
  };
}

function sourceUrl(item: LibraryItem): string {
  const source = item.artifact?.renditions.source;
  const full = item.artifact?.renditions.full;
  for (const [candidate, type] of [
    [source?.url, source?.mediaType],
    [item.meta.source_url, item.meta.source_media_type],
    [full?.url, full?.mediaType],
    [item.url, item.meta.viewer_media_type || item.meta.content_type],
  ]) {
    const url = text(candidate);
    if (!url || isArtifactSourceTreeUrl(url) || rasterUrl(url) || mediaType(type).startsWith("image/")) continue;
    return url;
  }
  return "";
}

export type VideoCanvasSourcePreview =
  | { kind: "project"; summary: VideoCanvasPreviewSummary }
  | { kind: "web"; url: string };

/** JSON is parsed as a project; only declared AND inspected legacy HTML can use a frame. */
export async function loadVideoCanvasSourcePreview(
  item: LibraryItem,
  read: (url: string) => Promise<string>,
): Promise<VideoCanvasSourcePreview> {
  const url = sourceUrl(item);
  const inline = !item.artifactId && !url ? text(item.content) : "";
  if (!url && !inline) throw new Error("这份视频画布没有可读取的工程源。请重试或通过编辑入口打开。");
  let source: string;
  try { source = inline || await read(url); }
  catch { throw new Error("暂时无法读取视频画布工程，请重试。"); }
  const full = item.artifact?.renditions.full;
  const declared = mediaType(full?.url === url ? full.mediaType : item.meta.viewer_media_type || item.meta.content_type);
  if (!isVideoCanvasV2Item(item) && url === item.url && /^https?:\/\//i.test(url) && !jsonUrl(url) &&
    declared === "text/html" && looksLikeHtmlDocument(source)) {
    return { kind: "web", url };
  }
  return { kind: "project", summary: projectSummary(source, item.title) };
}

export function videoCanvasDurationLabel(seconds: number | null): string {
  return seconds === null ? "时长未设置" : `${Number(seconds.toFixed(2))} 秒`;
}
