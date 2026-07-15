"use client";

// 高级内容工作台 v3 的能力路由：一个素材是否有真实 round-trip adapter。
// 单一事实源——壳（AdvancedContentWorkbench）与工具栏标签都从这里取。

import type { MediaType } from "../lib/database";
import type {
  EditorCapabilityName,
  EditorManifestV1,
  LibraryItem,
} from "./library-data";

export type EditorRoute =
  | { type: "office"; ext: string }
  | { type: "video-timeline" }
  | { type: "audio" }
  | { type: "image" }
  | { type: "pdf" }
  | { type: "richdoc" }
  | { type: "grid"; adapter?: "chart-editor@1" }
  | { type: "deck" }
  | { type: "threed" }
  | { type: "embed"; base: string; mediaType: MediaType }
  | { type: "none" };

export type EditorAdapterId =
  | "office"
  | "video-timeline"
  | "audio"
  | "image"
  | "pdf"
  | "richdoc"
  | "grid"
  | "chart-editor@1"
  | "deck"
  | "threed"
  | "website"
  | "design-canvas"
  | "video-canvas"
  | "none";

export interface EditorCapability {
  available: boolean;
  adapter: EditorAdapterId;
  route: EditorRoute;
  manifest: EditorManifestV1 | null;
  unavailableReason: string;
}

interface RegistryEntry {
  routeType: EditorRoute["type"];
  roundTrip: readonly EditorCapabilityName[];
}

const ROUND_TRIP = ["load", "mutate", "save", "reopen"] as const;

/** Only ids in this data-only registry can activate an editor implementation. */
export const TRUSTED_EDITOR_REGISTRY: Readonly<
  Record<Exclude<EditorAdapterId, "none">, RegistryEntry>
> = {
  office: { routeType: "office", roundTrip: ROUND_TRIP },
  "video-timeline": { routeType: "video-timeline", roundTrip: ROUND_TRIP },
  audio: { routeType: "audio", roundTrip: ROUND_TRIP },
  image: { routeType: "image", roundTrip: ROUND_TRIP },
  pdf: { routeType: "pdf", roundTrip: ROUND_TRIP },
  richdoc: { routeType: "richdoc", roundTrip: ROUND_TRIP },
  grid: { routeType: "grid", roundTrip: ROUND_TRIP },
  "chart-editor@1": { routeType: "grid", roundTrip: ROUND_TRIP },
  deck: { routeType: "deck", roundTrip: ROUND_TRIP },
  threed: { routeType: "threed", roundTrip: ROUND_TRIP },
  website: { routeType: "embed", roundTrip: ROUND_TRIP },
  "design-canvas": { routeType: "embed", roundTrip: ROUND_TRIP },
  "video-canvas": { routeType: "embed", roundTrip: ROUND_TRIP },
};

const WORD_EXT = new Set([
  "docx",
  "doc",
  "odt",
  "rtf",
  "docm",
  "dotx",
  "epub",
  "mht",
]);
const CELL_EXT = new Set(["xlsx", "xls", "ods", "xlsm", "xltx"]);
const SLIDE_EXT = new Set([
  "pptx",
  "ppt",
  "odp",
  "pptm",
  "pot",
  "potx",
  "potm",
]);
const VIDEO_EXT = new Set([
  "mp4",
  "webm",
  "mov",
  "mkv",
  "m4v",
  "avi",
  "mpeg",
  "mpg",
  "ogv",
]);
const AUDIO_EXT = new Set([
  "mp3",
  "wav",
  "m4a",
  "flac",
  "ogg",
  "oga",
  "opus",
  "aac",
  "wma",
]);
const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
  "avif",
]);
const MODEL_EXT = new Set(["glb", "gltf"]);

function extOf(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (!path.includes(".")) return "";
    return path.split(".").pop() || "";
  } catch {
    return "";
  }
}

function officeExtensionOf(url: string): string {
  const extension = extOf(url);
  return WORD_EXT.has(extension) ||
    CELL_EXT.has(extension) ||
    SLIDE_EXT.has(extension)
    ? extension
    : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function editorManifestFor(item: LibraryItem): EditorManifestV1 | null {
  const value =
    item.descriptor?.editor || item.meta.editor_manifest || item.meta.editor;
  const record = asRecord(value);
  const source = asRecord(record?.source);
  if (
    !record ||
    record.schema !== "oceanleo.editor-manifest.v1" ||
    record.id !== "chart-editor" ||
    record.version !== 1 ||
    !source ||
    (source.kind !== "inline" && source.kind !== "url") ||
    typeof source.format !== "string" ||
    !Array.isArray(record.capabilities)
  ) {
    return null;
  }
  const capabilities = [
    ...new Set(
      record.capabilities.filter(
        (value): value is EditorCapabilityName =>
          value === "load" ||
          value === "mutate" ||
          value === "save" ||
          value === "reopen",
      ),
    ),
  ];
  const sourceUrl =
    typeof source.url === "string" && source.url.length <= 2_000
      ? source.url.trim()
      : "";
  if (source.kind === "url" && !trustedChartSourceUrl(sourceUrl)) return null;
  return {
    schema: "oceanleo.editor-manifest.v1",
    id: "chart-editor",
    version: 1,
    capabilities,
    source: {
      kind: source.kind,
      format: source.format.slice(0, 80),
      ...(sourceUrl ? { url: sourceUrl } : {}),
    },
  };
}

function trustedChartSourceUrl(url: string): boolean {
  if (/^\/v1\/assets\/library\/[a-z0-9-]+\/editor-source$/i.test(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      (host === "api.oceanleo.com" ||
        host === "oceanleo-assets.oss-cn-guangzhou.aliyuncs.com") &&
      (parsed.pathname.endsWith(".json") ||
        /\/v1\/assets\/library\/[a-z0-9-]+\/editor-source$/i.test(
          parsed.pathname,
        ))
    );
  } catch {
    return false;
  }
}

function hasRoundTrip(manifest: EditorManifestV1): boolean {
  return ROUND_TRIP.every((capability) =>
    manifest.capabilities.includes(capability),
  );
}

function chartSourceIsPresent(
  item: LibraryItem,
  manifest: EditorManifestV1,
): boolean {
  if (manifest.source.kind === "url") {
    return Boolean(manifest.source.url);
  }
  return Boolean(
    item.content?.trim() ||
      asRecord(item.meta.chart_document) ||
      asRecord(item.meta.chart_option),
  );
}

function contentTypeFor(item: LibraryItem): string {
  return String(
    item.descriptor?.contentType ||
      item.meta.content_type ||
      item.meta.asset_type ||
      "",
  )
    .trim()
    .toLowerCase();
}

function threeDSubtypeFor(item: LibraryItem): "model" | "hdri" | "texture" | "unknown" {
  const explicit = [
    item.descriptor?.subtype,
    item.meta.subtype,
    item.meta.category,
  ].map((value) => String(value || "").trim().toLowerCase());
  for (const value of explicit) {
    if (value === "hdri" || value === "environment-map") return "hdri";
    if (value === "texture" || value === "texture-image") return "texture";
    if (value === "model" || value === "mesh") return "model";
  }
  const values = [
    ...(Array.isArray(item.meta.scene_tags) ? item.meta.scene_tags : []),
    ...(Array.isArray(item.meta.tags) ? item.meta.tags : []),
  ].map((value) => String(value || "").trim().toLowerCase());
  if (values.includes("hdri") || values.includes("environment-map")) return "hdri";
  if (values.includes("texture") || values.includes("texture-image")) return "texture";
  if (values.includes("model") || values.includes("mesh")) return "model";
  const hint = `${item.url || ""} ${item.meta.format || ""}`.toLowerCase();
  if (/\.(?:hdr|exr)(?:$|[?#\s])/.test(hint)) return "hdri";
  if (/\.(?:glb|gltf)(?:$|[?#\s])/.test(hint)) return "model";
  return "unknown";
}

function available(
  adapter: Exclude<EditorAdapterId, "none">,
  route: EditorRoute,
  manifest: EditorManifestV1 | null = null,
): EditorCapability {
  if (TRUSTED_EDITOR_REGISTRY[adapter].routeType !== route.type) {
    return unavailable("编辑器注册信息与路由不一致。");
  }
  return {
    available: true,
    adapter,
    route,
    manifest,
    unavailableReason: "",
  };
}

function unavailable(reason: string): EditorCapability {
  return {
    available: false,
    adapter: "none",
    route: { type: "none" },
    manifest: null,
    unavailableReason: reason,
  };
}

function hasInlineText(item: LibraryItem): boolean {
  if (item.content?.trim()) return true;
  return ["content", "text", "markdown", "source"].some(
    (key) => typeof item.meta[key] === "string" && String(item.meta[key]).trim(),
  );
}

function hasStructuredSlides(item: LibraryItem): boolean {
  if (Array.isArray(item.meta.slides) && item.meta.slides.length > 0) return true;
  const content = (item.content || "").trim();
  if (content.startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as { slides?: unknown };
      return Array.isArray(parsed.slides) && parsed.slides.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

/** 素材 → 受信任 editor capability；viewer kind 本身不授予编辑能力。 */
export function editorCapabilityFor(item: LibraryItem): EditorCapability {
  const templateDocumentUrl = String(item.meta.template_doc_url || "");
  const url = item.url || item.previewUrl || "";
  const ext = extOf(url);
  const officeExt = url ? officeExtensionOf(url) : "";
  const mime = String(item.meta.mime || "").toLowerCase();
  const isPdf = mime === "application/pdf" || ext === "pdf";
  const contentType = contentTypeFor(item);
  const chartManifest = editorManifestFor(item);

  if (contentType === "chart" || chartManifest?.id === "chart-editor") {
    if (
      chartManifest &&
      hasRoundTrip(chartManifest) &&
      chartSourceIsPresent(item, chartManifest)
    ) {
      return available(
        "chart-editor@1",
        { type: "grid", adapter: "chart-editor@1" },
        chartManifest,
      );
    }
    return unavailable(
      String(item.descriptor?.unavailableReason || item.meta.unavailable_reason || "") ||
        "此历史图表只有渲染 HTML/封面，没有 ECharts option 源；需补录 chart-editor@1 结构化源后才能编辑。",
    );
  }

  // A validated advanced-session snapshot pins the editor chosen when the work
  // began. Re-inferring solely from the preview file extension changed Design
  // canvas sessions into the image editor after refresh.
  const pinnedRoute = item.meta.advanced_editor_route;
  if (pinnedRoute === "richdoc") {
    return available("richdoc", { type: "richdoc" });
  }
  if (pinnedRoute === "grid") {
    return available("grid", { type: "grid" });
  }
  if (pinnedRoute === "deck") {
    return available("deck", { type: "deck" });
  }
  if (
    pinnedRoute === "video-timeline" ||
    pinnedRoute === "audio" ||
    pinnedRoute === "image" ||
    pinnedRoute === "pdf"
  ) {
    return available(pinnedRoute, { type: pinnedRoute });
  }
  if (pinnedRoute === "threed") {
    return threeDSubtypeFor(item) === "model"
      ? available("threed", { type: "threed" })
      : unavailable("只有 3D 模型可进入场景/视图工作台。");
  }
  if (pinnedRoute === "none") {
    return unavailable(
      String(item.meta.unavailable_reason || "") ||
        "此内容没有可安全回写的结构化编辑器。",
    );
  }
  if (pinnedRoute === "office" && officeExt) {
    return available("office", { type: "office", ext: officeExt });
  }
  if (pinnedRoute === "embed") {
    const pinnedSite = String(item.siteId || item.meta.site_id || "").toLowerCase();
    if (templateDocumentUrl || pinnedSite === "design") {
      return available("design-canvas", {
          type: "embed",
          base: "https://design.oceanleo.com/embed/editor",
          mediaType: "canvas",
        });
    }
    if (item.kind === "website" || pinnedSite === "website") {
      return available("website", {
        type: "embed",
        base: "https://website.oceanleo.com/embed/site-editor",
        mediaType: "website",
      });
    }
    if (item.kind === "video_canvas" || pinnedSite === "video") {
      return available("video-canvas", {
        type: "embed",
        base: "https://video.oceanleo.com/canvas-board",
        mediaType: "video_canvas",
      });
    }
  }
  if (
    /^https:\/\/asset\.oceanleo\.com\/design-templates\/doc\/[a-z0-9-]+\.json$/i.test(
      templateDocumentUrl,
    )
  ) {
    return available("design-canvas", {
      type: "embed",
      base: "https://design.oceanleo.com/embed/editor",
      mediaType: "canvas",
    });
  }

  if (item.kind === "website" || contentType === "website") {
    const projectId =
      item.meta.website_id ||
      item.meta.project_id ||
      item.meta.slug ||
      item.meta.site_id;
    const starterId = item.meta.starter_id;
    if (!projectId && !starterId) {
      return unavailable(
        "这个网站条目只有预览，没有可恢复的 project_id 或 starter_id。",
      );
    }
    return available("website", {
        type: "embed",
        base: "https://website.oceanleo.com/embed/site-editor",
        mediaType: "website",
      });
  }

  if (
    item.kind === "video_canvas" ||
    (item.kind === "canvas" &&
      (item.siteId === "video" ||
        item.siteId === "video.oceanleo.com" ||
        item.meta.editor === "video-canvas"))
  ) {
    return available("video-canvas", {
        type: "embed",
        base: "https://video.oceanleo.com/canvas-board",
        mediaType: "video_canvas",
      });
  }
  if (item.kind === "canvas" && (url || Array.isArray(item.meta.nodes))) {
    return available("design-canvas", {
      type: "embed",
      base: "https://design.oceanleo.com/embed/editor",
      mediaType: "canvas",
    });
  }

  if (
    officeExt &&
    (WORD_EXT.has(officeExt) ||
      CELL_EXT.has(officeExt) ||
      SLIDE_EXT.has(officeExt))
  ) {
    return available("office", { type: "office", ext: officeExt });
  }
  if (isPdf) return available("pdf", { type: "pdf" });
  if (VIDEO_EXT.has(ext) || mime.startsWith("video/")) {
    return available("video-timeline", { type: "video-timeline" });
  }
  if (AUDIO_EXT.has(ext) || mime.startsWith("audio/")) {
    return available("audio", { type: "audio" });
  }

  if (item.kind === "threed" || contentType === "3d") {
    const subtype = threeDSubtypeFor(item);
    if (subtype === "hdri") {
      return unavailable(
        "HDRI 是环境光照素材，不是 3D 模型；当前可预览和下载，但不能送入 model-viewer。",
      );
    }
    if (subtype === "texture") {
      return unavailable(
        "纹理是贴图素材，不是 3D 模型；当前可预览和下载，但不能送入 model-viewer。",
      );
    }
    if (
      subtype === "model" &&
      (MODEL_EXT.has(ext) ||
        mime === "model/gltf-binary" ||
        mime === "model/gltf+json")
    ) {
      return available("threed", { type: "threed" });
    }
    return unavailable("没有可加载的 GLB 或已整包托管的 glTF 模型。");
  }

  if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
    return available("image", { type: "image" });
  }
  if (hasStructuredSlides(item)) {
    return available("deck", { type: "deck" });
  }
  if (
    ext === "csv" ||
    mime === "text/csv" ||
    Array.isArray(item.meta.sheets) ||
    Array.isArray(item.meta.rows)
  ) {
    return available("grid", { type: "grid" });
  }
  if (
    ["md", "markdown", "txt", "html", "htm"].includes(ext) ||
    hasInlineText(item)
  ) {
    return available("richdoc", { type: "richdoc" });
  }
  if (contentType === "font") {
    return unavailable("字体素材目前可预览和下载，但没有可回写的字体编辑器。");
  }
  return unavailable(
    String(item.descriptor?.unavailableReason || item.meta.unavailable_reason || "") ||
      "此内容目前只有预览，没有通过 load → mutate → save → reopen 验证的编辑器。",
  );
}

/** Backward-compatible route accessor used by advanced-session snapshots. */
export function editorRouteFor(item: LibraryItem): EditorRoute {
  return editorCapabilityFor(item).route;
}

/** 「编辑」工具在工具栏上的具体名字（按路由）。 */
export function editorToolLabel(route: EditorRoute): string {
  switch (route.type) {
    case "office":
      return "Office 编辑";
    case "video-timeline":
      return "时间线剪辑";
    case "audio":
      return "音频处理";
    case "image":
      return "图片编辑";
    case "pdf":
      return "PDF 工作台";
    case "richdoc":
      return "文档编辑";
    case "grid":
      return route.adapter === "chart-editor@1" ? "图表编辑" : "表格编辑";
    case "deck":
      return "幻灯片编辑";
    case "threed":
      return "3D 场景与视图";
    case "embed":
      return route.mediaType === "website"
        ? "网站编辑"
        : route.mediaType === "video_canvas"
          ? "节点画布"
          : "画布编辑";
    default:
      return "编辑";
  }
}
