"use client";

// 高级内容工作台 v3 的能力路由：一个素材是否有真实 round-trip adapter。
// 单一事实源——壳（AdvancedContentWorkbench）与工具栏标签都从这里取。

import {
  isDurableLibraryItem,
  type EditorCapabilityName,
  type EditorManifestV1,
  type LibraryItem,
} from "./library-data";
import {
  TRUSTED_EDITOR_REGISTRY,
  editorAdapterForArtifactCapability,
  type EditorAdapterId,
  type EditorCapability,
  type EditorRoute,
  type RegistryEntry,
} from "./workbench-capability-registry";

export {
  TRUSTED_EDITOR_REGISTRY,
  editorAdapterForArtifactCapability,
  editorRouteHintForArtifactCapability,
} from "./workbench-capability-registry";
export type {
  EditorAdapterId,
  EditorCapability,
  EditorRoute,
  RegistryEntry,
} from "./workbench-capability-registry";

const ROUND_TRIP = ["load", "mutate", "save", "reopen"] as const;

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
const CELL_EXT = new Set([
  "xlsx",
  "xls",
  "ods",
  "xlsm",
  "xlsb",
  "xltx",
]);
const NATIVE_GRID_EXT = new Set(["xlsx", "xls", "ods"]);
const SLIDE_EXT = new Set([
  "pptx",
  "ppt",
  "odp",
  "pptm",
  "pot",
  "potx",
  "potm",
]);
const NATIVE_DECK_EXT = new Set(["pptx", "pptm", "potx", "potm"]);
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
const OFFICE_MIME_EXT = new Map<string, string>([
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["application/msword", "doc"],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx",
  ],
  ["application/vnd.ms-excel", "xls"],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx",
  ],
  ["application/vnd.ms-powerpoint.presentation.macroenabled.12", "pptm"],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.template",
    "potx",
  ],
  ["application/vnd.ms-powerpoint.template.macroenabled.12", "potm"],
  ["application/vnd.ms-powerpoint", "ppt"],
]);

function extOf(url: string): string {
  try {
    const path = new URL(url, "https://local.invalid").pathname.toLowerCase();
    if (!path.includes(".")) return "";
    return path.split(".").pop() || "";
  } catch {
    return "";
  }
}

function officeExtensionOf(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\./, "");
  const extension =
    WORD_EXT.has(normalized) ||
    CELL_EXT.has(normalized) ||
    SLIDE_EXT.has(normalized)
      ? normalized
      : extOf(value);
  return WORD_EXT.has(extension) ||
    CELL_EXT.has(extension) ||
    SLIDE_EXT.has(extension)
    ? extension
    : "";
}

export function officeExtensionForItem(item: LibraryItem): string {
  const meta = item.meta || {};
  const candidates = [
    item.url,
    item.previewUrl,
    meta.file_name,
    meta.filename,
    meta.name,
    meta.format,
    meta.extension,
    meta.ext,
    item.title,
  ];
  for (const candidate of candidates) {
    const extension = officeExtensionOf(String(candidate || ""));
    if (extension) return extension;
  }
  return OFFICE_MIME_EXT.get(String(meta.mime || "").toLowerCase()) || "";
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

const DURABLE_ADAPTER_TYPES: Readonly<
  Record<Exclude<EditorAdapterId, "none">, readonly string[]>
> = {
  office: ["document", "grid", "deck"],
  "video-timeline": ["video"],
  audio: ["audio"],
  image: ["single_file_image", "composite_image", "vector_image"],
  pdf: ["pdf"],
  richdoc: ["document"],
  grid: ["grid"],
  "chart-editor@1": ["chart"],
  deck: ["deck"],
  threed: ["model_3d"],
  website: ["website"],
  "design-canvas": ["composite_image", "workflow"],
  "video-canvas": ["workflow"],
};

function durableEditorCapabilityFor(
  item: LibraryItem,
): EditorCapability | null {
  if (!isDurableLibraryItem(item)) return null;
  const artifact = item.artifact;
  if (
    artifact.artifactId !== item.artifactId ||
    artifact.revisionId !== item.revisionId
  ) {
    return unavailable("artifact/revision identity 与卡片不一致。");
  }
  if (!artifact.integrity.ok) {
    return unavailable(
      artifact.integrity.reason || "artifact 未通过完整性校验。",
    );
  }
  if (!artifact.access.canRead) {
    return unavailable("当前主体没有读取这个 revision 的权限。");
  }
  if (!artifact.access.canEdit && !artifact.access.canFork) {
    return unavailable("当前主体没有编辑或 fork 这个 revision 的权限。");
  }
  // view_only is not a card-level hide gate: editable shelves decide which
  // materials appear; typed editorCapability remains the hard edit gate.
  const adapter = editorAdapterForArtifactCapability(
    artifact.editorCapability,
  );
  if (!adapter) {
    return unavailable(
      "服务端没有声明受信任的 typed editor capability。",
    );
  }
  if (!DURABLE_ADAPTER_TYPES[adapter].includes(artifact.artifactType)) {
    return unavailable(
      `editor capability ${artifact.editorCapability} 与 artifact type ${artifact.artifactType} 不匹配。`,
    );
  }
  switch (adapter) {
    case "office": {
      const ext =
        officeExtensionOf(artifact.sourceFormat) ||
        OFFICE_MIME_EXT.get(artifact.sourceFormat.toLowerCase()) ||
        "";
      return ext
        ? available("office", { type: "office", ext })
        : unavailable("Office artifact 缺少受支持的 source format。");
    }
    case "video-timeline":
      return available(adapter, { type: "video-timeline" });
    case "audio":
      return available(adapter, { type: "audio" });
    case "image":
      return available(adapter, { type: "image" });
    case "pdf":
      return available(adapter, { type: "pdf" });
    case "richdoc":
      return available(adapter, { type: "richdoc" });
    case "grid":
      return available(adapter, { type: "grid" });
    case "chart-editor@1":
      return available(adapter, {
        type: "grid",
        adapter: "chart-editor@1",
      });
    case "deck":
      return available(adapter, { type: "deck" });
    case "threed":
      return available(adapter, { type: "threed" });
    case "website":
      return available(adapter, {
        type: "embed",
        base: "https://website.oceanleo.com/embed/site-editor",
        mediaType: "website",
      });
    case "design-canvas":
      return available(adapter, {
        type: "embed",
        base: "https://design.oceanleo.com/embed/editor",
        mediaType: "canvas",
      });
    case "video-canvas":
      return available(adapter, {
        type: "embed",
        base: "https://video.oceanleo.com/canvas-board",
        mediaType: "video_canvas",
      });
  }
  return unavailable("没有匹配的受信任 typed editor adapter。");
}

/** 素材 → 受信任 editor capability；viewer kind 本身不授予编辑能力。 */
export function editorCapabilityFor(item: LibraryItem): EditorCapability {
  const durable = durableEditorCapabilityFor(item);
  if (durable) return durable;
  const templateDocumentUrl = String(item.meta.template_doc_url || "");
  const url = item.url || item.previewUrl || "";
  const ext = extOf(url);
  const mime = String(item.meta.mime || "").toLowerCase();
  const officeExt = officeExtensionForItem(item);
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
    const pinnedEditor = String(item.meta.editor || "").toLowerCase();
    if (item.kind === "website" || pinnedEditor === "website") {
      return available("website", {
        type: "embed",
        base: "https://website.oceanleo.com/embed/site-editor",
        mediaType: "website",
      });
    }
    if (
      item.kind === "video_canvas" ||
      pinnedEditor === "video-canvas"
    ) {
      return available("video-canvas", {
        type: "embed",
        base: "https://video.oceanleo.com/canvas-board",
        mediaType: "video_canvas",
      });
    }
    if (
      templateDocumentUrl ||
      item.kind === "canvas" ||
      pinnedEditor === "design-canvas"
    ) {
      return available("design-canvas", {
        type: "embed",
        base: "https://design.oceanleo.com/embed/editor",
        mediaType: "canvas",
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
    // Blank website drafts are isomorphic to design/video blank embeds: no URL
    // yet, opened via ?blank=1 on the shared website adapter host.
    if (
      (item.meta.draft === true || item.meta.blank === true) &&
      !item.url &&
      !item.previewUrl
    ) {
      return available("website", {
        type: "embed",
        base: "https://website.oceanleo.com/embed/site-editor",
        mediaType: "website",
      });
    }
    const projectId =
      item.meta.website_id ||
      item.meta.project_id ||
      item.meta.slug ||
      item.meta.site_id;
    const starterId = item.meta.starter_id;
    const githubRepo = item.meta.github_repo;
    if (!projectId && !starterId && !githubRepo) {
      return unavailable(
        "这个网站条目只有预览，没有可恢复的项目、模板或 GitHub 源码。",
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
    (item.kind === "canvas" && item.meta.editor === "video-canvas")
  ) {
    return available("video-canvas", {
        type: "embed",
        base: "https://video.oceanleo.com/canvas-board",
        mediaType: "video_canvas",
      });
  }
  // A canvas is an editable project capability in its own right. Blank drafts
  // intentionally have no URL/nodes yet and must work from every hosting site.
  if (item.kind === "canvas") {
    return available("design-canvas", {
      type: "embed",
      base: "https://design.oceanleo.com/embed/editor",
      mediaType: "canvas",
    });
  }

  if (NATIVE_DECK_EXT.has(officeExt)) {
    return available("deck", { type: "deck" });
  }
  if (NATIVE_GRID_EXT.has(officeExt)) {
    return available("grid", { type: "grid" });
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
