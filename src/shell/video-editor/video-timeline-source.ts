import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import { parseVideoProjectEnvelope } from "../media-editors/source-integrity.mjs";
import {
  createEmptyDoc,
  isTimelineDoc,
  makeId,
  normalizeTimelineDoc,
} from "./timeline-model";
import type { TimelineClip, TimelineDoc } from "./types";

export const VIDEO_TIMELINE_PROJECT_SCHEMA = "oceanleo.timeline.v1";
export const VIDEO_TIMELINE_PLACEHOLDER_DURATION_MS = 5000;
export const VIDEO_TIMELINE_MISSING_PROJECT =
  "当前时间线 revision 缺少工程源；已阻止用空时间线替代。";
export const VIDEO_TIMELINE_MISSING_MEDIA =
  "当前视频 revision 缺少可验证的媒体源；已阻止用空时间线替代。";

export type VideoTimelineSourcePlan =
  | { kind: "ready"; doc: TimelineDoc }
  | { kind: "remote"; url: string; doc: TimelineDoc }
  | {
      kind: "seed";
      doc: TimelineDoc;
      seededClipId: string;
      seededKind: "video" | "audio";
    }
  | { kind: "blank"; doc: TimelineDoc }
  | { kind: "fail"; error: string; doc: TimelineDoc; projectExpected: boolean };

export function serializeVideoProjectEnvelope(doc: TimelineDoc): string {
  return JSON.stringify({
    schema: VIDEO_TIMELINE_PROJECT_SCHEMA,
    version: 1,
    data: doc,
  });
}

export function hydrateVideoTimelineDoc(text: string): TimelineDoc {
  const data = parseVideoProjectEnvelope(text);
  if (!isTimelineDoc(data)) {
    throw new Error("时间线工程格式无效");
  }
  return normalizeTimelineDoc(data);
}

export function planVideoTimelineSource(
  item: Pick<
    LibraryItem,
    "url" | "previewUrl" | "source" | "kind" | "artifactId"
  > & {
    meta?: LibraryItem["meta"];
    title?: LibraryItem["title"];
  },
): VideoTimelineSourcePlan {
  const meta = item.meta ?? {};
  const draft = meta.timeline_doc;
  if (isTimelineDoc(draft)) {
    return { kind: "ready", doc: normalizeTimelineDoc(draft) };
  }
  const doc = createEmptyDoc();
  if (meta.editor_project_schema === VIDEO_TIMELINE_PROJECT_SCHEMA) {
    const projectUrl = String(meta.editor_project_url || item.url || "").trim();
    if (projectUrl) {
      return { kind: "remote", url: projectUrl, doc };
    }
    return {
      kind: "fail",
      error: VIDEO_TIMELINE_MISSING_PROJECT,
      doc,
      projectExpected: true,
    };
  }
  const url = item.url || item.previewUrl || "";
  if (!url) {
    if (
      item.source === "artifact" ||
      isDurableLibraryItem(item as LibraryItem) ||
      item.artifactId
    ) {
      return {
        kind: "fail",
        error: VIDEO_TIMELINE_MISSING_MEDIA,
        doc,
        projectExpected: false,
      };
    }
    return { kind: "blank", doc };
  }
  const media: "video" | "audio" = item.kind === "audio" ? "audio" : "video";
  const track = doc.tracks.find((entry) => entry.kind === media);
  if (!track) {
    return {
      kind: "fail",
      error: "当前素材没有可用的时间线轨道。",
      doc,
      projectExpected: false,
    };
  }
  const clip: TimelineClip = {
    id: makeId("clip"),
    start_ms: 0,
    duration_ms: VIDEO_TIMELINE_PLACEHOLDER_DURATION_MS,
    source_url: url,
    in_ms: 0,
    speed: 1,
    volume: 1,
    ...(item.title?.trim() ? { label: item.title.trim().slice(0, 120) } : {}),
  };
  track.clips.push(clip);
  return {
    kind: "seed",
    doc,
    seededClipId: clip.id,
    seededKind: media,
  };
}

export function videoTimelineSeedFromPlan(plan: VideoTimelineSourcePlan): {
  doc: TimelineDoc;
  seededClipId: string;
  seededKind: "video" | "audio" | null;
  sourceReady: boolean;
  sourceError: string;
  projectExpected: boolean;
} {
  if (plan.kind === "ready") {
    return {
      doc: plan.doc,
      seededClipId: "",
      seededKind: null,
      sourceReady: true,
      sourceError: "",
      projectExpected: false,
    };
  }
  if (plan.kind === "remote") {
    return {
      doc: plan.doc,
      seededClipId: "",
      seededKind: null,
      sourceReady: false,
      sourceError: "",
      projectExpected: true,
    };
  }
  if (plan.kind === "seed") {
    return {
      doc: plan.doc,
      seededClipId: plan.seededClipId,
      seededKind: plan.seededKind,
      sourceReady: false,
      sourceError: "",
      projectExpected: false,
    };
  }
  if (plan.kind === "fail") {
    return {
      doc: plan.doc,
      seededClipId: "",
      seededKind: null,
      sourceReady: false,
      sourceError: plan.error,
      projectExpected: plan.projectExpected,
    };
  }
  return {
    doc: plan.doc,
    seededClipId: "",
    seededKind: null,
    sourceReady: true,
    sourceError: "",
    projectExpected: false,
  };
}

export function planVideoTimelineSeed(item: LibraryItem) {
  return videoTimelineSeedFromPlan(planVideoTimelineSource(item));
}

/**
 * 库条目的 `url` 常是 `/v1/artifact-renditions/access/<grant>` 这种几分钟就过期（410）的
 * 签名地址。时间线工程要长期引用素材，所以 seed 时先换成持久地址；`.../access/public`
 * 是内容寻址的，本身就持久。
 */
export function isExpiringArtifactGrantUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://api.oceanleo.com");
    const marker = "/artifact-renditions/access/";
    const at = parsed.pathname.indexOf(marker);
    if (at < 0) return false;
    const rest = parsed.pathname.slice(at + marker.length);
    return Boolean(rest) && rest !== "public";
  } catch {
    return false;
  }
}
