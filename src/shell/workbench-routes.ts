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
  advancedCapabilityForArtifactFields,
  artifactEditorCapabilityIsCompatible,
  artifactSourceFormatIsCompatible,
  chartOptionEvidenceIsPresent,
  type AdvancedEditorAdapterId,
} from "./artifact-contract";
import {
  TRUSTED_EDITOR_REGISTRY,
  editorAdapterForArtifactCapability,
  isLegacyOfficeMetadata,
  type EditorAdapterId,
  type EditorCapability,
  type EditorRoute,
  type RegistryEntry,
  type ToolbarOwnership,
} from "./workbench-capability-registry";
import {
  pluginIdForItem,
  pluginRuntimeForItem,
} from "./plugin-initial-state";
import {
  AUDIO_EXT,
  IMAGE_EXT,
  MODEL_EXT,
  NATIVE_DECK_EXT,
  NATIVE_GRID_EXT,
  NATIVE_RICHDOC_EXT,
  ROUND_TRIP,
  VIDEO_EXT,
  extOf,
  officeExtensionForItem,
} from "./workbench-route-formats";

export { officeExtensionForItem } from "./workbench-route-formats";

export {
  TRUSTED_EDITOR_REGISTRY,
  editorAdapterForArtifactCapability,
  registryEntryForAdvancedFeature,
  editorRouteHintForArtifactCapability,
  artifactTypeHasRoutableEditor,
} from "./workbench-capability-registry";
export type {
  EditorAdapterId,
  EditorCapability,
  EditorRoute,
  RegistryEntry,
  ToolbarOwnership,
} from "./workbench-capability-registry";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasLegacyOfficeMetadata(item: LibraryItem): boolean {
  const metaEditor = asRecord(item.meta.editor);
  const descriptorEditor = asRecord(item.descriptor?.editor);
  return [
    item.meta.advanced_editor_route,
    item.meta.editor,
    item.meta.editor_adapter,
    item.meta.editor_capability,
    item.meta.editor_project_schema,
    item.meta.project_schema,
    item.meta.schema,
    item.descriptor?.representation,
    metaEditor?.id,
    metaEditor?.projectSchema,
    metaEditor?.project_schema,
    descriptorEditor?.id,
    descriptorEditor?.projectSchema,
    descriptorEditor?.project_schema,
  ].some(isLegacyOfficeMetadata);
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
  if (artifact.editability === "view_only") {
    return unavailable("此素材为只读内容，不能进入编辑器。");
  }
  const source = artifact.renditions.source;
  if (
    !artifact.sourceFormat ||
    !source ||
    source.revisionId !== artifact.revisionId ||
    !source.url ||
    !source.digest
  ) {
    return unavailable("当前版本缺少可重新打开的编辑源。");
  }
  if (
    !artifactSourceFormatIsCompatible(
      artifact.artifactType,
      artifact.sourceFormat,
    )
  ) {
    return unavailable(
      `source format ${artifact.sourceFormat} 与 artifact type ${artifact.artifactType} 不匹配。`,
    );
  }
  if (
    !artifactEditorCapabilityIsCompatible(
      artifact.artifactType,
      artifact.editorCapability,
    )
  ) {
    return unavailable(
      `editor capability ${artifact.editorCapability || "missing"} 与 artifact type ${artifact.artifactType} 不匹配。`,
    );
  }
  if (
    artifact.artifactType === "composite_image" &&
    (!artifact.scene ||
      artifact.scene.sceneRevisionId !== artifact.revisionId ||
      artifact.scene.closureStatus !== "complete" ||
      !artifact.scene.closureDigest)
  ) {
    return unavailable("复合图片缺少当前 revision 的完整 scene 依赖闭包。");
  }
  if (
    artifact.artifactType === "chart" &&
    !chartOptionEvidenceIsPresent({
      sourceFormat: artifact.sourceFormat,
      editorManifest: artifact.renditions.editor_manifest,
    })
  ) {
    return unavailable(
      "图表缺少 oceanleo.chart.v1 option 源或带摘要的 editor manifest。",
    );
  }
  const advancedContract = advancedCapabilityForArtifactFields({
    artifactType: artifact.artifactType,
    sourceFormat: artifact.sourceFormat,
    editorCapability: artifact.editorCapability,
  });
  if (!advancedContract) {
    return unavailable(
      "服务端 typed artifact 无法通过共享 feature/capability/adapter matrix。",
    );
  }
  const adapter: AdvancedEditorAdapterId = advancedContract.adapter;
  switch (adapter) {
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
    case "game":
      return available(adapter, { type: "game" });
    // 两个新载体各走自己的 route，不复用 grid 宿主视口
    // （`geo-map.md` §10.3 / `interactive-doc.md` §10.3 末的 MUST NOT）。
    case "geo-map":
      return available(adapter, { type: "geo-map" });
    case "interactive-doc":
      return available(adapter, { type: "interactive-doc" });
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

/**
 * 插件实例的路由。
 *
 * 取代的是原来那条「空手起手件」分支：它按 `meta.draft`/`meta.blank` + 载体类型
 * 把按键换成 5 份通用空白模板之一，于是所有按键在运行时只对应 5 份骨架。现在
 * 认的是 `meta.plugin_id`（`plugin-initial-state.ts` 造实例时写的），字节来自
 * 这枚插件自己的第一屏，路由只负责把它送进对应内核。
 *
 * 三个内核对三条 route，与 `_COMMON.md` §4.3 的内核划分逐条对齐；名单之外的
 * 内核一律不认（fail-closed），不许在这里长出第四条通用回退。
 *
 * 必须留在 `contentType === "chart"` 分支之前：那条分支对「没有 option 源」的
 * 内容一律判 `legacy-render-only`，会把插件实例当成一张渲染残片挡下来。
 *
 * 门槛刻意窄：插件实例永远没有 URL（插件不可下载）。带了 URL 的一律不是插件实例，
 * 交回既有判定 —— 在架素材一件都不受影响。
 */
function pluginCapabilityFor(item: LibraryItem): EditorCapability | null {
  if (!pluginIdForItem(item)) return null;
  if (item.url || item.previewUrl) {
    return unavailable("插件实例不该带下载地址；这件内容的身份不可信。");
  }
  const runtime = pluginRuntimeForItem(item);
  switch (runtime) {
    case "geo-map":
      return available("geo-map", { type: "geo-map" });
    case "interactive-doc":
      return available("interactive-doc", { type: "interactive-doc" });
    case "grid":
      return available("grid", { type: "grid" });
    default:
      return unavailable("这个功能没有可识别的运行时内核，已拒绝打开。");
  }
}

/** 素材 → 受信任 editor capability；viewer kind 本身不授予编辑能力。 */
export function editorCapabilityFor(item: LibraryItem): EditorCapability {
  const durable = durableEditorCapabilityFor(item);
  if (durable) return durable;
  const plugin = pluginCapabilityFor(item);
  if (plugin) return plugin;
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
    /**
     * `chart.md` R6：这处历史文案只讲了「只有渲染 HTML/封面」一种坏法，
     * 但落到这里的其实是三种不同的 `legacy-render-only` 成因（§3.2 状态机），
     * 用同一句话回答会让「有 option 但 manifest 不支持回写」的素材看起来像
     * 一份 HTML 截图。逐因给话，`html = 不可编辑` 的边界一条都不放宽。
     */
    const chartRejection = !chartManifest
      ? "此历史图表只有渲染 HTML/封面，没有 ECharts option 源；需补录 oceanleo.chart.v1 结构化源后才能编辑。"
      : !hasRoundTrip(chartManifest)
        ? "此图表的 editor manifest 没有声明 load/mutate/save/reopen 全套回写能力；补齐 chart-editor@1 的回写声明后才能编辑。"
        : "此图表声明了 chart-editor@1，但当前版本取不到 option 源字节（manifest 指向的 url 或内联 option 缺失）；补录 oceanleo.chart.v1 源后才能编辑。";
    return unavailable(
      String(item.descriptor?.unavailableReason || item.meta.unavailable_reason || "") ||
        chartRejection,
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
  // 必须留在下面 `item.kind === "website"` 分支之前：游戏 bundle 也是单文件 HTML，
  // 落到那个分支就会被送进 Next 源码工作台（`01-decisions.md` D7 明令禁止）。
  if (pinnedRoute === "game") {
    return available("game", { type: "game" });
  }
  // 两个新载体的 pinned route：同样必须留在 `item.kind === "website"` 之前，
  // 否则交互文档的渲出 HTML 预览会被当成站点源码送进 Next 工作台。
  if (pinnedRoute === "geo-map") {
    return available("geo-map", { type: "geo-map" });
  }
  if (pinnedRoute === "interactive-doc") {
    return available("interactive-doc", { type: "interactive-doc" });
  }
  if (pinnedRoute === "none") {
    return unavailable(
      String(item.meta.unavailable_reason || "") ||
        "此内容没有可安全回写的结构化编辑器。",
    );
  }
  if (hasLegacyOfficeMetadata(item)) {
    if (NATIVE_DECK_EXT.has(officeExt)) {
      return available("deck", { type: "deck" });
    }
    if (NATIVE_GRID_EXT.has(officeExt)) {
      return available("grid", { type: "grid" });
    }
    if (NATIVE_RICHDOC_EXT.has(officeExt)) {
      return available("richdoc", { type: "richdoc" });
    }
    return unavailable(
      "Legacy Office metadata requires a typed document, grid, or deck source.",
    );
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

  /**
   * 两个新载体的非 durable 回退。必须留在下面「有内联文本就送 richdoc」与
   * 「image/*」两条之前：两者的 source 都是 JSON 文本，落到 richdoc 会被当成
   * 富文本打开（`interactive-doc.md` §1.1 明令 MUST NOT 复用 `document`），
   * 落到 image 会把地图当成一张位图。
   */
  if (item.kind === "geo_map" || contentType === "geo_map") {
    return available("geo-map", { type: "geo-map" });
  }
  if (item.kind === "interactive_doc" || contentType === "interactive_doc") {
    return available("interactive-doc", { type: "interactive-doc" });
  }

  if (NATIVE_DECK_EXT.has(officeExt)) {
    return available("deck", { type: "deck" });
  }
  if (NATIVE_GRID_EXT.has(officeExt)) {
    return available("grid", { type: "grid" });
  }
  if (NATIVE_RICHDOC_EXT.has(officeExt)) {
    return available("richdoc", { type: "richdoc" });
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

/**
 * 这一次挂载有没有编辑栏，以及归谁。
 *
 * **插件实例一律 `none`**：编辑栏是用来编辑一件素材的，非编辑类插件没有素材输入
 * （`_COMMON.md` §3.2），所以地图、地球仪、台账这些打开之后上方不该有那条栏。
 * 判据落在**挂的是什么**而不是**用了哪个适配器**：`grid` 同时是编辑类插件
 * 「表格编辑器」的内核和台账的渲染内核，按适配器判会把两者一起误伤。
 *
 * 素材照旧按适配器在注册表里的登记走，13 个编辑类适配器一个字都没动。
 */
export function editBarOwnershipForItem(item: LibraryItem): ToolbarOwnership {
  if (pluginIdForItem(item)) return "none";
  const capability = editorCapabilityFor(item);
  if (!capability.available || capability.adapter === "none") return "none";
  return TRUSTED_EDITOR_REGISTRY[capability.adapter].toolbarOwnership;
}

/** 「编辑」工具在工具栏上的具体名字（按路由）。 */
export function editorToolLabel(route: EditorRoute): string {
  switch (route.type) {
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
    case "game":
      return "游戏编辑";
    case "geo-map":
      return "地图编辑";
    case "interactive-doc":
      return "交互文档编辑";
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
