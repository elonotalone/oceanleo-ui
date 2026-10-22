"use client";

// 高级内容工作台 v3 的能力路由：一个素材是否有真实 round-trip adapter。
// 单一事实源——壳（AdvancedContentWorkbench）与工具栏标签都从这里取。

import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";
import { currentDomainProfile } from "../contracts/domain-family";
import {
  advancedCapabilityForArtifactFields,
  artifactEditorCapabilityIsCompatible,
  artifactSourceFormatIsCompatible,
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
  AUDIO_EXT,
  IMAGE_EXT,
  MODEL_EXT,
  NATIVE_DECK_EXT,
  NATIVE_GRID_EXT,
  NATIVE_RICHDOC_EXT,
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

function isChartEditorMetadata(value: unknown): boolean {
  return asRecord(value)?.id === "chart-editor";
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
): EditorCapability {
  if (TRUSTED_EDITOR_REGISTRY[adapter].routeType !== route.type) {
    return unavailable("编辑器注册信息与路由不一致。");
  }
  return {
    available: true,
    adapter,
    route,
    manifest: null,
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

const DESIGN_TEMPLATE_DOC_PATH =
  /^\/design-templates\/doc\/[a-z0-9-]+\.json$/i;

/**
 * 当前家族素材域上的 design 模板文档地址。域外一律不认（fail closed）。
 * `assetOrigin` 只用于认旧地址，不在这里生成链接。
 *
 * 判定与它取代的那条写死正则**逐字等价**，所以查询串、片段与内嵌凭据都要显式
 * 拒掉：原正则以 `$` 收尾且从 `https://asset.…` 起头，这三种形状本来就进不来，
 * 只比对 origin + pathname 会把它们放进来，那是放宽不是搬家。
 */
function isFamilyDesignTemplateDocUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === currentDomainProfile().assetOrigin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      DESIGN_TEMPLATE_DOC_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/** 网站 → 本地 Puck 路由；视频画布 → 本地节点画布；设计画布 → 图片编辑器。 */
function websiteEditor(): EditorCapability {
  return available("website", { type: "website" });
}

function videoCanvasEditor(): EditorCapability {
  return available("video-canvas", { type: "video-canvas" });
}

function designCanvasEditor(): EditorCapability {
  return available("design-canvas", { type: "image" });
}

const CHART_EDITOR_REMOVED_REASON =
  "图表编辑器已下线，这份图表目前只读：可以查看和下载，不能在线修改。";

const VECTOR_IMAGE_READ_ONLY_REASON =
  "矢量图（SVG）暂不支持在线编辑，目前可以查看和下载。";

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
  if (artifact.artifactType === "chart") {
    return unavailable(CHART_EDITOR_REMOVED_REASON);
  }
  // 矢量图原先在整站嵌入的设计子站里编辑；本地图片编辑器不改写 SVG 源，
  // 所以只读打开，绝不静默改写已存文档。
  if (artifact.artifactType === "vector_image") {
    return unavailable(VECTOR_IMAGE_READ_ONLY_REASON);
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
      return unavailable(CHART_EDITOR_REMOVED_REASON);
    case "deck":
      return available(adapter, { type: "deck" });
    case "threed":
      return available(adapter, { type: "threed" });
    case "game":
      return available(adapter, { type: "game" });
    case "website":
      return websiteEditor();
    case "design-canvas":
      return designCanvasEditor();
    case "video-canvas":
      return videoCanvasEditor();
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

  if (
    contentType === "chart" ||
    isChartEditorMetadata(item.descriptor?.editor) ||
    isChartEditorMetadata(item.meta.editor_manifest) ||
    isChartEditorMetadata(item.meta.editor)
  ) {
    return unavailable(
      String(item.descriptor?.unavailableReason || item.meta.unavailable_reason || "") ||
        CHART_EDITOR_REMOVED_REASON,
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
  // 历史会话把网站 / 视频画布 / 设计画布都记成 "embed"。读时别名到本地编辑器，
  // 不改写存量；新写入用各自的真实路由名。
  if (
    pinnedRoute === "embed" ||
    pinnedRoute === "website" ||
    pinnedRoute === "video-canvas"
  ) {
    const pinnedEditor = String(item.meta.editor || "").toLowerCase();
    if (
      pinnedRoute === "website" ||
      item.kind === "website" ||
      pinnedEditor === "website"
    ) {
      return websiteEditor();
    }
    if (
      pinnedRoute === "video-canvas" ||
      item.kind === "video_canvas" ||
      pinnedEditor === "video-canvas"
    ) {
      return videoCanvasEditor();
    }
    if (
      templateDocumentUrl ||
      item.kind === "canvas" ||
      pinnedEditor === "design-canvas"
    ) {
      return designCanvasEditor();
    }
  }
  // 素材域按**当前家族**取，正则不再写死 `.com`。`.com` 站的判定逐字不变。
  if (isFamilyDesignTemplateDocUrl(templateDocumentUrl)) {
    return designCanvasEditor();
  }

  if (item.kind === "website" || contentType === "website") {
    // Blank website drafts are isomorphic to design/video blank embeds: no URL
    // yet, opened via ?blank=1 on the shared website adapter host.
    if (
      (item.meta.draft === true || item.meta.blank === true) &&
      !item.url &&
      !item.previewUrl
    ) {
      return websiteEditor();
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
    return websiteEditor();
  }

  if (
    item.kind === "video_canvas" ||
    (item.kind === "canvas" && item.meta.editor === "video-canvas")
  ) {
    return videoCanvasEditor();
  }
  // A canvas is an editable project capability in its own right. Blank drafts
  // intentionally have no URL/nodes yet and must work from every hosting site.
  if (item.kind === "canvas") {
    return designCanvasEditor();
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

  if (ext === "psd" || IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
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

/** 这一次素材挂载有没有编辑栏，以及归谁。插件模块不经过素材编辑器路由。 */
export function editBarOwnershipForItem(item: LibraryItem): ToolbarOwnership {
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
      return "表格编辑";
    case "deck":
      return "幻灯片编辑";
    case "threed":
      return "3D 场景与视图";
    case "game":
      return "游戏编辑";
    case "website":
      return "网站编辑";
    case "video-canvas":
      return "节点画布";
    default:
      return "编辑";
  }
}
