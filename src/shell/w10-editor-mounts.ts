/**
 * Mount table for the client `editor.html?type=` runtime.
 *
 * Only native in-page workbench routes are listed. There are no hosted
 * (iframe) editor mounts any more: deck / rich doc / audio / 3D / design canvas
 * are mounted through their normal routes (design canvas = image editor).
 */
import type { AdvancedContentWorkbenchProps } from "./advanced-workbench-types";
import type { LibraryItem, LibraryKind } from "./library-data";
import { blankWebsiteSource } from "./website-local/blank-website-source";
import { emptyVideoCanvasGraph } from "./workflow-carrier/video-canvas-local-session";
import { VIDEO_CANVAS_PROJECT_SCHEMA } from "./workflow-carrier/video-canvas-schema";

export const W10_EDITOR_IDS = Object.freeze([
  "website",
  "video-canvas",
  "video-timeline",
] as const);

export type W10EditorId = (typeof W10_EDITOR_IDS)[number];

export type W10MountKind = "workbench";

type MountRow = {
  editorId: W10EditorId;
  kind: LibraryKind;
  schema: string;
  exportName: string;
  modulePath: string;
  mountKind: W10MountKind;
  defaultTitle: string;
  requiredWorkbench: readonly (keyof AdvancedContentWorkbenchProps)[];
  load: () => Promise<Record<string, unknown>>;
  defaultMeta: () => Record<string, unknown>;
};

const WORKBENCH_REQUIRED = ["item", "onClose"] as const;

export const W10_EDITOR_MOUNTS: Record<W10EditorId, MountRow> = {
  website: {
    editorId: "website",
    kind: "website",
    schema: "website-source@1",
    exportName: "WebsiteLocalRoute",
    modulePath: "src/shell/advanced-routes/WebsiteLocalRoute.tsx",
    mountKind: "workbench",
    defaultTitle: "本地可编辑的网站工程",
    requiredWorkbench: WORKBENCH_REQUIRED,
    load: () => import("./advanced-routes/WebsiteLocalRoute"),
    defaultMeta: () => ({
      editor: "website",
      editor_project_schema: "website-source@1",
      websiteSource: blankWebsiteSource("本地可编辑的网站工程"),
    }),
  },
  "video-canvas": {
    editorId: "video-canvas",
    kind: "video_canvas",
    schema: VIDEO_CANVAS_PROJECT_SCHEMA,
    exportName: "VideoCanvasRoute",
    modulePath: "src/shell/advanced-routes/VideoCanvasRoute.tsx",
    mountKind: "workbench",
    defaultTitle: "本地视频画布",
    requiredWorkbench: WORKBENCH_REQUIRED,
    load: () => import("./advanced-routes/VideoCanvasRoute"),
    defaultMeta: () => ({
      editor: "video-canvas",
      editor_project_schema: VIDEO_CANVAS_PROJECT_SCHEMA,
      graph: emptyVideoCanvasGraph(),
    }),
  },
  "video-timeline": {
    editorId: "video-timeline",
    kind: "video",
    schema: "oceanleo.timeline.v1",
    exportName: "VideoTimelineRoute",
    modulePath: "src/shell/advanced-routes/VideoTimelineRoute.tsx",
    mountKind: "workbench",
    defaultTitle: "本地时间线",
    requiredWorkbench: WORKBENCH_REQUIRED,
    load: () => import("./advanced-routes/VideoTimelineRoute"),
    defaultMeta: () => ({
      editor: "video-timeline",
      editor_project_schema: "oceanleo.timeline.v1",
      timeline: { width: 1920, height: 1080, fps: 30, tracks: [] },
    }),
  },
};

export function w10WorkbenchItem(
  editorId: W10EditorId,
  overrides: Partial<LibraryItem> = {},
): LibraryItem {
  const spec = W10_EDITOR_MOUNTS[editorId];
  return {
    key: overrides.key || `w10-${editorId}`,
    source: overrides.source || "creation",
    id: overrides.id || `w10-${editorId}`,
    title: overrides.title || spec.defaultTitle,
    kind: overrides.kind || spec.kind,
    siteId: overrides.siteId || "",
    favorite: overrides.favorite === true,
    url: overrides.url,
    previewUrl: overrides.previewUrl,
    content: overrides.content,
    meta: {
      ...spec.defaultMeta(),
      ...(overrides.meta || {}),
    },
    descriptor: overrides.descriptor,
    posterUrl: overrides.posterUrl,
    artifactId: overrides.artifactId,
    revisionId: overrides.revisionId,
    artifactType: overrides.artifactType,
    artifact: overrides.artifact,
    transient: overrides.transient,
  };
}
