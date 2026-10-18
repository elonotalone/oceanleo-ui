/**
 * W10 mount table for W04 `editor.html?type=`.
 *
 * W10 does not edit editor-runtime. W04 imports these loaders / item helpers
 * and passes the listed props. Web stays iframe; local cores still need
 * prefer-local (non-web platform, next flag, or `local-editor-cores`) plus
 * injected `local-hosted:*` origins for the four hosted cores.
 */
import type { RefObject } from "react";

import type { AdvancedContentWorkbenchProps } from "./advanced-workbench-types";
import { blankDesignDocument } from "./design-canvas/blank-design-document";
import { deckDocumentToPptist } from "./doc-editors/deck-pptist-carrier";
import { normalizeDeckDocument } from "./doc-editors/deck-schema";
import { UMO_DOC_FORMAT } from "./doc-editors/rich-doc-umo-migration";
import type { LibraryItem, LibraryKind } from "./library-data";
import { blankWebsiteSource } from "./website-local/blank-website-source";
import { emptyVideoCanvasGraph } from "./workflow-carrier/video-canvas-local-session";
import { VIDEO_CANVAS_PROJECT_SCHEMA } from "./workflow-carrier/video-canvas-schema";

export function w10BlankPptistDocument(title = "本地幻灯片") {
  return deckDocumentToPptist(normalizeDeckDocument({}, title));
}

export function w10BlankUmoDocument(title = "本地文档") {
  return {
    format: UMO_DOC_FORMAT,
    title,
    content: { type: "doc", content: [{ type: "paragraph" }] },
  };
}

export const W10_EDITOR_IDS = Object.freeze([
  "website",
  "design-canvas",
  "video-canvas",
  "video-timeline",
  "deck",
  "umo-hosted",
  "audiomass-hosted",
  "three-editor",
] as const);

export type W10EditorId = (typeof W10_EDITOR_IDS)[number];

export type W10HostedFrameProps = {
  instanceId: string;
  hostOrigin: string;
  src: string;
  title: string;
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  onReady: () => void;
  onDirty?: (revision?: number | string) => void;
  onSnapshot: (payload: Record<string, unknown>) => void;
  onError: (message: string) => void;
};

export type W10MountKind = "workbench" | "hosted-frame";

type MountRow = {
  editorId: W10EditorId;
  kind: LibraryKind;
  schema: string;
  exportName: string;
  modulePath: string;
  mountKind: W10MountKind;
  defaultTitle: string;
  hostCapability: string | null;
  requiredWorkbench: readonly (keyof AdvancedContentWorkbenchProps)[];
  requiredFrame: readonly (keyof W10HostedFrameProps)[];
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
    hostCapability: null,
    requiredWorkbench: WORKBENCH_REQUIRED,
    requiredFrame: [],
    load: () => import("./advanced-routes/WebsiteLocalRoute"),
    defaultMeta: () => ({
      editor: "website",
      editor_project_schema: "website-source@1",
      websiteSource: blankWebsiteSource("本地可编辑的网站工程"),
    }),
  },
  "design-canvas": {
    editorId: "design-canvas",
    kind: "canvas",
    schema: "oceanleo.design-document.v1",
    exportName: "DesignCanvasLocalRoute",
    modulePath: "src/shell/advanced-routes/DesignCanvasLocalRoute.tsx",
    mountKind: "workbench",
    defaultTitle: "本地设计稿 W10",
    hostCapability: null,
    requiredWorkbench: WORKBENCH_REQUIRED,
    requiredFrame: [],
    load: () => import("./advanced-routes/DesignCanvasLocalRoute"),
    defaultMeta: () => ({
      editor: "design-canvas",
      editor_project_schema: "oceanleo.design-document.v1",
      designDocument: blankDesignDocument("本地设计稿 W10"),
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
    hostCapability: null,
    requiredWorkbench: WORKBENCH_REQUIRED,
    requiredFrame: [],
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
    hostCapability: null,
    requiredWorkbench: WORKBENCH_REQUIRED,
    requiredFrame: [],
    load: () => import("./advanced-routes/VideoTimelineRoute"),
    defaultMeta: () => ({
      editor: "video-timeline",
      editor_project_schema: "oceanleo.timeline.v1",
      timeline: { width: 1920, height: 1080, fps: 30, tracks: [] },
    }),
  },
  deck: {
    editorId: "deck",
    kind: "ppt",
    schema: "pptist.slides.v2",
    exportName: "DeckHostedRoute",
    modulePath: "src/shell/advanced-routes/DeckHostedRoute.tsx",
    mountKind: "workbench",
    defaultTitle: "本地幻灯片",
    hostCapability: "local-hosted:slides",
    requiredWorkbench: WORKBENCH_REQUIRED,
    requiredFrame: [],
    load: () => import("./advanced-routes/DeckHostedRoute"),
    defaultMeta: () => ({
      editor: "deck",
      editor_project_schema: "pptist.slides.v2",
      draft: true,
      blank: true,
      slides: w10BlankPptistDocument("本地幻灯片"),
    }),
  },
  "umo-hosted": {
    editorId: "umo-hosted",
    kind: "document",
    schema: "umo-document@1",
    exportName: "RichDocHostedRoute",
    modulePath: "src/shell/advanced-routes/RichDocHostedRoute.tsx",
    mountKind: "workbench",
    defaultTitle: "本地文档",
    hostCapability: "local-hosted:docs",
    requiredWorkbench: WORKBENCH_REQUIRED,
    requiredFrame: [],
    load: () => import("./advanced-routes/RichDocHostedRoute"),
    defaultMeta: () => ({
      editor: "umo-hosted",
      editor_project_schema: "umo-document@1",
      draft: true,
      blank: true,
      project: w10BlankUmoDocument("本地文档"),
    }),
  },
  "audiomass-hosted": {
    editorId: "audiomass-hosted",
    kind: "audio",
    schema: "oceanleo.audio-project.v1",
    exportName: "AudioHostedFrame",
    modulePath: "src/shell/media-editors/AudioHostedFrame.tsx",
    mountKind: "hosted-frame",
    defaultTitle: "本地音频",
    hostCapability: "local-hosted:audio",
    requiredWorkbench: [],
    requiredFrame: ["instanceId", "hostOrigin", "src", "title", "onReady", "onSnapshot", "onError"],
    load: () => import("./media-editors/AudioHostedFrame"),
    defaultMeta: () => ({
      editor: "audiomass-hosted",
      editor_project_schema: "oceanleo.audio-project.v1",
    }),
  },
  "three-editor": {
    editorId: "three-editor",
    kind: "threed",
    schema: "oceanleo.model-view@1",
    exportName: "Model3DHostedFrame",
    modulePath: "src/shell/media-editors/Model3DHostedFrame.tsx",
    mountKind: "hosted-frame",
    defaultTitle: "本地三维",
    hostCapability: "local-hosted:3d",
    requiredWorkbench: [],
    requiredFrame: ["instanceId", "hostOrigin", "src", "title", "onReady", "onDirty", "onSnapshot", "onError"],
    load: () => import("./media-editors/Model3DHostedFrame"),
    defaultMeta: () => ({
      editor: "three-editor",
      editor_project_schema: "oceanleo.model-view@1",
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

export function w10LocalHostedCapability(label: "slides" | "docs" | "audio" | "3d", origin: string): string {
  return `local-hosted:${label}=${origin}`;
}
