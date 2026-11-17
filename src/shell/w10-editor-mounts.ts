/**
 * Mount table for the client `editor.html?type=` runtime.
 *
 * Only native in-page workbench routes are listed. There are no hosted
 * (iframe) editor mounts any more: deck / rich doc / design canvas
 * are mounted through their normal routes (design canvas = image editor).
 */
import type { AdvancedContentWorkbenchProps } from "./advanced-workbench-types";
import type { LibraryItem, LibraryKind } from "./library-data";

export const W10_EDITOR_IDS = Object.freeze([
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
