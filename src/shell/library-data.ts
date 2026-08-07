import type { Creation } from "../lib/database";
import type {
  ArtifactProjection,
  ArtifactRendition,
  ArtifactType,
  PopularityMetrics,
  TransientGenerationResult,
} from "./artifact-contract";
import {
  isArtifactSourceTreeUrl,
  POPULARITY_META_KEY,
  popularityMetricsFromWire,
} from "./artifact-contract";
import { editorRouteHintForArtifactCapability } from "./workbench-capability-registry";

/**
 * Cross-site library kinds are content/viewer semantics, not storage-table
 * semantics.  "ppt" means the PPT viewer can open it; it does not mean
 * `agent_artifacts.kind` happened to contain the word "ppt".
 */
export type LibraryKind =
  | "website"
  | "canvas"
  | "ppt"
  | "sheet"
  | "document"
  | "image"
  | "video"
  | "video_canvas"
  | "audio"
  | "xhs"
  | "threed"
  /**
   * 可玩的单文件游戏 bundle。刻意不并进 `website`：两者的查看器都是 HTML，
   * 但游戏必须落在受控沙箱宿主里，且它的编辑面是 prompt 迭代而不是源码工作台
   * （`01-decisions.md` D7）。并进 `website` 会让非 durable 回退路径把游戏
   * 送进 Next 源码编辑器。
   */
  | "game"
  /**
   * 地图工程与交互文档各占一个 viewer kind。
   *
   * 刻意不并进 `canvas` 或 `document`：`canvas` 的查看器是嵌入式画布宿主，
   * `document` 的查看器是富文本；两个新载体的 source 都是结构化 JSON 工程，
   * 并进任一侧都会让卡片、图标与「编辑」入口指向错误的工作台
   * （`geo-map.md` §10.3、`interactive-doc.md` §1.1）。
   */
  | "geo_map"
  | "interactive_doc"
  | "file";

export type EditorCapabilityName = "load" | "mutate" | "save" | "reopen";

export interface EditorSourceDescriptor {
  kind: "inline" | "url";
  format: string;
  url?: string;
}

/**
 * Versioned, data-only editor declaration. Callers still have to resolve the
 * id through the trusted workbench registry; arbitrary manifest ids never
 * become executable code.
 */
export interface EditorManifestV1 {
  schema: "oceanleo.editor-manifest.v1";
  id: string;
  version: 1;
  capabilities: EditorCapabilityName[];
  source: EditorSourceDescriptor;
}

export interface LibraryContentDescriptor {
  contentType: string;
  representation: string;
  subtype: string;
  editor: EditorManifestV1 | null;
  capabilities: EditorCapabilityName[];
  unavailableReason: string;
}

export interface LibraryItem {
  key: string;
  source: "creation" | "artifact";
  id: string;
  title: string;
  kind: LibraryKind;
  siteId: string;
  url?: string;
  previewUrl?: string;
  thumbUrl?: string;
  content?: string;
  favorite: boolean;
  createdAt?: string;
  meta: Record<string, unknown>;
  /** Viewer semantics stay in `kind`; editability lives in this descriptor. */
  descriptor?: LibraryContentDescriptor;
  /**
   * 可以直接放进 `<img>` 的画面地址。
   *
   * 与 `thumbUrl` / `previewUrl` 的区别是**保证**：这两个字段是「某个 rendition 的
   * 地址」，货架上 154/161 件 deck、842/900 件 document 的 `thumbnail` 其实就是
   * 原 pptx / docx 本体，喂给 `<img>` 只会得到一个碎图标。`posterUrl` 只在媒体
   * 类型确实是图片时才有值，没有真图就是缺席——**缺席是有意义的信号**，
   * 调用方应当据此画占位而不是硬塞一个地址。
   */
  posterUrl?: string;
  /** Durable identity. URLs below are only refreshable renditions. */
  artifactId?: string;
  revisionId?: string;
  artifactType?: ArtifactType;
  artifact?: ArtifactProjection;
  /** Compatibility receipt; never accepted as mutation identity. */
  transient?: TransientGenerationResult;
}

export interface LibraryArtifactRow {
  id: string;
  title?: string | null;
  kind?: string | null;
  content?: string | null;
  url?: string | null;
  favorite?: boolean | null;
  created_at?: string | null;
  task_id?: string | null;
  session_id?: string | null;
  artifact_id?: string | null;
  revision_id?: string | null;
  artifact_type?: ArtifactType | null;
  artifact?: unknown;
}

const ARTIFACT_KIND: Record<ArtifactType, LibraryKind> = {
  single_file_image: "image",
  composite_image: "image",
  vector_image: "image",
  chart: "image",
  document: "document",
  grid: "sheet",
  deck: "ppt",
  pdf: "document",
  website: "website",
  video: "video",
  audio: "audio",
  model_3d: "threed",
  workflow: "canvas",
  game: "game",
  geo_map: "geo_map",
  interactive_doc: "interactive_doc",
};

/**
 * The library category one artifact lands in. Deep-link dispatch
 * (`site-catalog-controller`) reads it through here rather than keeping its own
 * table, so a template-edit deep link can never file an artifact under a different
 * category than the library itself uses for the same artifact.
 */
export function libraryKindForArtifactType(
  artifactType: ArtifactType,
): LibraryKind | undefined {
  return ARTIFACT_KIND[artifactType];
}

const WEBSITE_PROJECT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function websiteProjectIdFromProjection(
  artifact: ArtifactProjection,
): string {
  const loose = artifact as ArtifactProjection & Record<string, unknown>;
  const nested =
    loose.meta && typeof loose.meta === "object" && !Array.isArray(loose.meta)
      ? (loose.meta as Record<string, unknown>)
      : null;
  const candidates = [
    loose.project_id,
    loose.website_id,
    loose.projectId,
    loose.websiteId,
    nested?.project_id,
    nested?.website_id,
    nested?.projectId,
    nested?.websiteId,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (WEBSITE_PROJECT_ID_RE.test(trimmed)) return trimmed;
  }
  return "";
}

/**
 * 这个 artifact 的热度数值，没有就是 `null`。
 *
 * 两个来源，缺一不可：
 *   · `artifact.popularity` —— 走过 `normalizeArtifactProjection` 的投影（库检索那条链
 *     是这一条：`searchArtifactLibrary` → normalizer → 这里）。
 *   · 原始 wire 对象本身 —— `normalizeArtifact` / `normalizeWork` 这类调用点直接把**未
 *     规范化**的行传进来（见 `isCanonicalArtifactProjection` 分支），那时 `popularity`
 *     字段还不存在，但原始键还在手上。
 * 只覆盖其中一条会得到「本站货架有热度、我的库没有」这种按入口分裂的行为。
 * 名单与判据都在 `artifact-contract.ts` 那一份（放行与取值同源）。
 */
function popularityForProjection(
  artifact: ArtifactProjection,
): PopularityMetrics | null {
  const declared = artifact.popularity;
  if (declared && Object.keys(declared).length > 0) return declared;
  return popularityMetricsFromWire(artifact);
}

export function artifactTypeForLibraryKind(kind: LibraryKind): ArtifactType {
  return ({
    website: "website",
    canvas: "workflow",
    ppt: "deck",
    sheet: "grid",
    document: "document",
    image: "single_file_image",
    video: "video",
    video_canvas: "workflow",
    audio: "audio",
    xhs: "document",
    threed: "model_3d",
    game: "game",
    geo_map: "geo_map",
    interactive_doc: "interactive_doc",
    file: "document",
  } as Record<LibraryKind, ArtifactType>)[kind];
}

/** 只有这一族媒体类型能进 `<img>`。 */
export function isImageMediaType(value: unknown): boolean {
  return /^image\//i.test(
    String(value ?? "").split(";", 1)[0].trim().toLowerCase(),
  );
}

/**
 * 明显不是图片的地址形状。
 *
 * 只当**兜底**用：rendition 声明了 `mediaType` 时一律以声明为准，这条正则服务的是
 * 老的、非 durable 的行（`normalizeWork` / `material-library-controller` 那几条），
 * 它们手里只有一个地址、没有类型元数据。
 * ⚠️ 它挡不住 `/v1/artifact-renditions/access/public?...&purpose=preview` 这种不带
 * 扩展名的地址——那种情况**必须**靠 `mediaType`，所以下面的取值顺序是「先看声明」。
 */
const NON_IMAGE_URL_RE =
  /\.(?:pptx?|potx?|ppsx?|xlsx?|xlsm|xlsb|docx?|dotx|odt|ods|odp|pdf|zip|json|csv|tsv|mp4|webm|mov|mp3|wav|m4a|glb|gltf)(?:$|[?#])/i;

/**
 * 这个 rendition 能不能当图片用。
 *
 * 声明了媒体类型就照声明判；**没声明才**退回地址形状。反过来（先看地址）会把
 * `access/public?...&purpose=thumbnail` 这类不带扩展名的 pptx 地址判成图片，
 * 那正是今天的缺陷。
 */
function imageRenditionUrl(rendition: ArtifactRendition | undefined): string {
  const url = rendition?.url?.trim();
  if (!url) return "";
  const declared = String(rendition?.mediaType ?? "").trim();
  if (declared) return isImageMediaType(declared) ? url : "";
  return NON_IMAGE_URL_RE.test(url) ? "" : url;
}

/**
 * 一件素材现在就能画出来的那张图；没有就是空串。
 *
 * 「没有」是正常且常见的答案（货架上 office 三类基本都没有真缩略图），调用方
 * 拿到空串应当画占位或进度，**不许**退回 `thumbUrl` / `previewUrl` 自行凑一个——
 * 那两个字段没有「是图片」这条保证。
 */
export function libraryItemPosterUrl(item: LibraryItem): string {
  const declared = item.posterUrl?.trim();
  if (declared) return declared;
  // 老的非 durable 条目没有 rendition 元数据，只能按地址形状兜底。
  for (const candidate of [item.thumbUrl, item.previewUrl]) {
    const url = candidate?.trim();
    if (url && !NON_IMAGE_URL_RE.test(url)) return url;
  }
  return "";
}

/**
 * 与 `full` 同 revision、同媒体类型，但地址是**内容寻址**的那个 rendition。
 *
 * `[实测 2026-08-07]` 网关对两种地址发的缓存头完全相反：
 *   · `/v1/artifact-renditions/access/public?artifactId=&revisionId=&purpose=`
 *     → `cache-control: public, max-age=31536000, immutable` + sha256 `etag`；
 *   · `/v1/artifact-renditions/access/<opaque grant>`（内含 `exp`/`nonce`/`sub`）
 *     → `cache-control: private, no-store`，且**每次签发地址都不同**。
 * 两者对截图那件 deck 回的字节 sha256 相同（`9b9645d1…`）。所以只读查看走前者，
 * 关掉再打开就是一次浏览器缓存命中；走后者则永远重下。
 */
function contentPinnedRenditionUrl(url: string | undefined): boolean {
  if (!url) return false;
  const [path, query = ""] = url.split("?", 2);
  return (
    path.endsWith("/artifact-renditions/access/public") &&
    query.includes("artifactId=") &&
    query.includes("revisionId=") &&
    query.includes("purpose=")
  );
}

/**
 * 同一份字节的可缓存替身。找不到就返回 `undefined`，调用方保持原选择。
 *
 * 判据刻意收得很紧：同 revision、媒体类型逐字相同、且替身地址确实是内容寻址的。
 * 媒体类型不同（例如 preview 是渲出来的 webp 封面）时**绝不**替换——那会把位图
 * 送进 office 解析器。
 */
export function cacheableRenditionTwin(
  artifact: ArtifactProjection,
  chosen: ArtifactRendition | null | undefined,
): ArtifactRendition | undefined {
  if (!chosen?.url || contentPinnedRenditionUrl(chosen.url)) return undefined;
  const twin = artifact.renditions.preview;
  if (!twin?.url || !contentPinnedRenditionUrl(twin.url)) return undefined;
  if (twin.revisionId !== artifact.revisionId) return undefined;
  const chosenType = String(chosen.mediaType ?? "").trim().toLowerCase();
  const twinType = String(twin.mediaType ?? "").trim().toLowerCase();
  if (!chosenType || chosenType !== twinType) return undefined;
  return twin;
}

/**
 * Convert one server-authoritative projection. No type, ACL or editability is
 * inferred from a filename, site or tag.
 */
export function artifactProjectionToLibraryItem(
  artifact: ArtifactProjection,
  options: { forEdit?: boolean } = {},
): LibraryItem {
  const kind =
    artifact.artifactType === "workflow" &&
    artifact.editorCapability === "video-canvas"
      ? "video_canvas"
      : ARTIFACT_KIND[artifact.artifactType];
  const preview = artifact.renditions.preview;
  const thumbnail = artifact.renditions.thumbnail;
  const full = artifact.renditions.full;
  const source = artifact.renditions.source;
  const browserSafeSource =
    source?.url && !isArtifactSourceTreeUrl(source.url) ? source : null;
  // Never fall back to auth-gated source-tree for LibraryItem.url — sites do not
  // proxy /v1, so relative source-tree resolves to slide/asset origin → 404.
  const viewer =
    artifact.renditions.preview ||
    artifact.renditions.full ||
    (artifact.access.canExportSource ? browserSafeSource : undefined);
  const routeHint = editorRouteHintForArtifactCapability(
    artifact.editorCapability,
  );
  // Deck/office binary preview must use PPTX/source bytes when they are already
  // browser-safe (opaque access https). Never prefer gateway-relative source-tree
  // on shelf list items — that resolves against the site origin and 404s.
  const prefersBinarySource =
    artifact.artifactType === "deck" ||
    artifact.artifactType === "document" ||
    artifact.artifactType === "grid" ||
    artifact.artifactType === "pdf";
  const baseRendition = prefersBinarySource
    ? browserSafeSource || full || viewer
    : options.forEdit
      ? browserSafeSource || full || viewer
      : full || viewer;
  /**
   * 只读查看优先走可缓存的同字节替身；编辑（`forEdit`）永远走 `full`/`source`，
   * 因为编辑要的是权威可写源，不是「够看就行」的那一份。
   */
  const selectedRendition =
    !options.forEdit && prefersBinarySource
      ? cacheableRenditionTwin(artifact, baseRendition) || baseRendition
      : baseRendition;
  const rawUrl = selectedRendition?.url;
  const url =
    rawUrl && !isArtifactSourceTreeUrl(rawUrl) ? rawUrl : undefined;
  const popularity = popularityForProjection(artifact);
  const meta: Record<string, unknown> = {
    artifact_id: artifact.artifactId,
    revision_id: artifact.revisionId,
    artifact_type: artifact.artifactType,
    roles: artifact.roles,
    source_format: artifact.sourceFormat,
    source_url: source?.url || "",
    source_revision_id: source?.revisionId || "",
    source_media_type: source?.mediaType || "",
    preview_media_type: preview?.mediaType || "",
    thumbnail_media_type: thumbnail?.mediaType || "",
    full_media_type: full?.mediaType || "",
    viewer_media_type: selectedRendition?.mediaType || "",
    content_type: selectedRendition?.mediaType || artifact.artifactType,
    editor_manifest_url:
      artifact.renditions.editor_manifest?.url || "",
    editor_capability: artifact.editorCapability || "",
    editor: artifact.editorCapability || "",
    editability: artifact.editability,
    access: artifact.access,
    integrity: artifact.integrity,
    provenance: artifact.provenance,
    context_bindings: artifact.bindings,
    artifact_scene: artifact.scene,
    format: artifact.sourceFormat,
    ...(routeHint ? { advanced_editor_route: routeHint } : {}),
    // 热度：白名单里唯一一个「有就放行、没有就整键缺席」的字段。写成空对象会让
    // 「没有热度数据」与「热度全是 0」不可区分，探索页的
    // `data-explore-popularity-ready` 就再也翻不回 false（见 popularity-fields.ts）。
    ...(popularity ? { [POPULARITY_META_KEY]: popularity } : {}),
    ...(artifact.scene
      ? {
          scene_revision_id: artifact.scene.sceneRevisionId,
          dependency_revision_ids:
            artifact.scene.dependencyRevisionIds,
          dependency_closure_digest: artifact.scene.closureDigest,
          dependency_closure_status: artifact.scene.closureStatus,
        }
      : {}),
  };
  if (artifact.artifactType === "website") {
    const projectId = websiteProjectIdFromProjection(artifact);
    if (projectId) {
      meta.project_id = projectId;
      meta.website_id = projectId;
    }
  }
  return {
    key: `artifact:${artifact.artifactId}:${artifact.revisionId}`,
    source: "artifact",
    id: artifact.artifactId,
    artifactId: artifact.artifactId,
    revisionId: artifact.revisionId,
    artifactType: artifact.artifactType,
    artifact,
    title: artifact.title,
    kind,
    siteId: artifact.owner.originSiteKey || "",
    url: url || undefined,
    previewUrl: preview?.url || viewer?.url || undefined,
    // 媒体类型过滤：`thumbnail` 在货架上大多就是原文件本体（154/161 件 deck、
    // 842/900 件 document），不过滤等于把 pptx 地址交出去当图片地址用。
    thumbUrl:
      imageRenditionUrl(thumbnail) || imageRenditionUrl(preview) || undefined,
    posterUrl:
      imageRenditionUrl(thumbnail) ||
      imageRenditionUrl(preview) ||
      imageRenditionUrl(full) ||
      undefined,
    favorite: artifact.favorite,
    createdAt: artifact.createdAt || undefined,
    meta,
    descriptor: {
      contentType: artifact.artifactType,
      representation: artifact.sourceFormat,
      subtype: artifact.artifactType,
      editor: null,
      capabilities:
        artifact.editability === "view_only"
          ? []
          : ["load", "mutate", "save", "reopen"],
      unavailableReason: artifact.integrity.ok
        ? artifact.editability === "view_only"
          ? "此 revision 是只读素材。"
          : ""
        : artifact.integrity.reason,
    },
  };
}

export function isDurableLibraryItem(
  item: LibraryItem,
): item is LibraryItem & {
  artifactId: string;
  revisionId: string;
  artifactType: ArtifactType;
  artifact: ArtifactProjection;
} {
  return Boolean(
    item.artifactId &&
      item.revisionId &&
      item.artifactType &&
      item.artifact &&
      item.artifact.artifactId === item.artifactId &&
      item.artifact.revisionId === item.revisionId,
  );
}

function isCanonicalArtifactProjection(
  value: unknown,
): value is ArtifactProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as Partial<ArtifactProjection>;
  return Boolean(
    artifact.schema === "oceanleo.artifact.v1" &&
      artifact.artifactId &&
      artifact.revisionId &&
      artifact.artifactType &&
      artifact.renditions &&
      artifact.access &&
      artifact.integrity,
  );
}

export function libraryItemIdentityKey(item: LibraryItem): string {
  return isDurableLibraryItem(item)
    ? `artifact:${item.artifactId}:${item.revisionId}`
    : `${item.source}:${item.id}`;
}

function transientFromMeta(
  input: {
    id: string;
    title: string;
    url?: string;
    kind: LibraryKind;
    siteId?: string;
    meta: Record<string, unknown>;
  },
  operation: TransientGenerationResult["operation"],
): TransientGenerationResult | undefined {
  const resultId = String(
    input.meta.generation_result_id ||
      input.meta.result_id ||
      input.meta.upload_id ||
      "",
  ).trim();
  const idempotencyKey = String(
    input.meta.artifact_idempotency_key ||
      input.meta.idempotency_key ||
      "",
  ).trim();
  const payloadDigest = String(
    input.meta.payload_digest || input.meta.content_digest || "",
  ).trim();
  const renditionUrl = String(
    input.meta.preview_url || input.url || "",
  ).trim();
  if (!resultId || !idempotencyKey || !payloadDigest || !renditionUrl) {
    return undefined;
  }
  return {
    schema: "oceanleo.transient-generation.v1",
    operation,
    resultId,
    idempotencyKey,
    payloadDigest,
    artifactType: artifactTypeForLibraryKind(input.kind),
    title: input.title,
    renditionUrl,
    sourceUrl:
      typeof input.meta.source_url === "string"
        ? input.meta.source_url
        : input.url,
    sourceFormat: String(input.meta.format || ""),
    siteId: input.siteId || "",
    appId: String(input.meta.app_id || ""),
    functionId: String(input.meta.function_id || ""),
    provenance:
      input.meta.provenance &&
      typeof input.meta.provenance === "object"
        ? (input.meta.provenance as Record<string, unknown>)
        : undefined,
  };
}

const KIND_ALIASES: Record<string, LibraryKind> = {
  website: "website",
  web: "website",
  webpage: "website",
  preview: "website",
  site: "website",
  canvas: "canvas",
  map: "canvas",
  board: "canvas",
  ppt: "ppt",
  pptx: "ppt",
  slide: "ppt",
  slides: "ppt",
  presentation: "ppt",
  sheet: "sheet",
  sheets: "sheet",
  spreadsheet: "sheet",
  excel: "sheet",
  xlsx: "sheet",
  document: "document",
  documents: "document",
  doc: "document",
  docx: "document",
  markdown: "document",
  text: "document",
  pdf: "document",
  image: "image",
  chart: "image",
  logo: "image",
  poster: "image",
  video: "video",
  video_canvas: "video_canvas",
  videocanvas: "video_canvas",
  timeline: "video_canvas",
  audio: "audio",
  music: "audio",
  voice: "audio",
  xhs: "xhs",
  xiaohongshu: "xhs",
  rednote: "xhs",
  "3d": "threed",
  threed: "threed",
  model3d: "threed",
  model: "threed",
  mesh: "threed",
  game: "game",
  games: "game",
  leoplay: "game",
  /**
   * `map` 已被上面的 `canvas` 占用（思维导图 / 白板），**不改**：地理地图的
   * token 一律带 `geo` 前缀。`cleanToken` 把连字符折成下划线，所以
   * `geo-map` 与 `geo_map` 命中同一个键。
   */
  geo_map: "geo_map",
  geomap: "geo_map",
  interactive_doc: "interactive_doc",
  interactivedoc: "interactive_doc",
  file: "file",
  other: "file",
};

const EXTENSIONS: Array<[RegExp, LibraryKind]> = [
  [/\.(pptx?|potx?)(?:$|[?#])/i, "ppt"],
  [/\.(xlsx?|xlsm|xlsb|ods|csv)(?:$|[?#])/i, "sheet"],
  [/\.(docx?|odt|rtf|pdf|md|markdown|txt)(?:$|[?#])/i, "document"],
  [/\.(png|jpe?g|webp|gif|avif|svg)(?:$|[?#])/i, "image"],
  [/\.(mp4|webm|mov|m4v|mkv)(?:$|[?#])/i, "video"],
  [/\.(mp3|wav|ogg|m4a|flac|aac)(?:$|[?#])/i, "audio"],
  [/\.(glb|gltf|obj|fbx|stl|usdz)(?:$|[?#])/i, "threed"],
  [/\.(html?|xhtml)(?:$|[?#])/i, "website"],
];

function cleanToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const EDITOR_CAPABILITIES = new Set<EditorCapabilityName>([
  "load",
  "mutate",
  "save",
  "reopen",
]);

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeEditorManifest(value: unknown): EditorManifestV1 | null {
  const record = recordValue(value);
  if (
    !record ||
    record.schema !== "oceanleo.editor-manifest.v1" ||
    record.version !== 1 ||
    typeof record.id !== "string" ||
    !/^[a-z][a-z0-9-]{1,63}$/.test(record.id)
  ) {
    return null;
  }
  const source = recordValue(record.source);
  if (
    !source ||
    (source.kind !== "inline" && source.kind !== "url") ||
    typeof source.format !== "string" ||
    !source.format.trim() ||
    source.format.length > 80
  ) {
    return null;
  }
  const sourceUrl =
    typeof source.url === "string" && source.url.length <= 2_000
      ? source.url.trim()
      : "";
  if (source.kind === "url" && !sourceUrl) return null;
  const capabilities = Array.isArray(record.capabilities)
    ? [
        ...new Set(
          record.capabilities.filter(
            (capability): capability is EditorCapabilityName =>
              typeof capability === "string" &&
              EDITOR_CAPABILITIES.has(capability as EditorCapabilityName),
          ),
        ),
      ]
    : [];
  return {
    schema: "oceanleo.editor-manifest.v1",
    id: record.id,
    version: 1,
    capabilities,
    source: {
      kind: source.kind,
      format: source.format.trim(),
      ...(sourceUrl ? { url: sourceUrl } : {}),
    },
  };
}

export function libraryContentDescriptor(input: {
  kind: LibraryKind;
  meta?: Record<string, unknown>;
  descriptor?: unknown;
}): LibraryContentDescriptor {
  const meta = input.meta ?? {};
  const provided = recordValue(input.descriptor);
  const contentType = cleanToken(
    provided?.contentType ||
      provided?.content_type ||
      meta.content_type ||
      meta.asset_type ||
      input.kind,
  );
  const representation = cleanToken(
    provided?.representation || meta.representation || meta.format,
  );
  const subtype = cleanToken(
    provided?.subtype || meta.subtype || meta.category,
  );
  const editor = normalizeEditorManifest(
    provided?.editor ?? meta.editor_manifest ?? meta.editor,
  );
  const unavailableReason = String(
    provided?.unavailableReason ||
      provided?.unavailable_reason ||
      meta.unavailable_reason ||
      "",
  ).slice(0, 500);
  return {
    contentType: contentType || input.kind,
    representation,
    subtype,
    editor,
    capabilities: editor?.capabilities || [],
    unavailableReason,
  };
}

export type ThreeDSubtype = "model" | "hdri" | "texture" | "unknown";

export function threeDSubtypeFor(item: LibraryItem): ThreeDSubtype {
  if (item.artifactType === "model_3d") return "model";
  const descriptor = item.descriptor || libraryContentDescriptor(item);
  const explicit = [
    descriptor.subtype,
    item.meta.subtype,
    item.meta.category,
  ].map(cleanToken);
  for (const value of explicit) {
    if (value === "hdri" || value === "environment_map") return "hdri";
    if (value === "texture" || value === "texture_image") return "texture";
    if (value === "model" || value === "mesh") return "model";
  }
  const values = [
    ...(Array.isArray(item.meta.scene_tags) ? item.meta.scene_tags : []),
    ...(Array.isArray(item.meta.tags) ? item.meta.tags : []),
  ].map(cleanToken);
  if (values.includes("hdri") || values.includes("environment_map")) return "hdri";
  if (values.includes("texture")) return "texture";
  if (values.includes("model") || values.includes("mesh")) return "model";
  const hint =
    `${item.url || ""} ${item.meta.format || ""} ${
      item.meta.source_format || ""
    }`.toLowerCase();
  if (/\.(?:hdr|exr)(?:$|[?#\s])/.test(hint)) return "hdri";
  if (/\.(?:glb|gltf)(?:$|[?#\s])/.test(hint)) return "model";
  return "unknown";
}

function metaString(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function hasCanvasPayload(meta: Record<string, unknown>): boolean {
  return Array.isArray(meta.nodes) || Array.isArray(meta.scenes) || Array.isArray(meta.timeline);
}

/**
 * Resolve a viewer kind using explicit metadata first, then media/kind, then
 * file extension. `siteId` is deliberately only a final hint: a site can emit
 * several different content types.
 */
export function inferLibraryKind(input: {
  meta?: Record<string, unknown>;
  mediaType?: unknown;
  kind?: unknown;
  url?: unknown;
  siteId?: unknown;
}): LibraryKind {
  const meta = input.meta ?? {};
  const explicit = cleanToken(
    metaString(meta, "library_kind", "libraryKind", "viewer", "viewer_kind"),
  );
  if (KIND_ALIASES[explicit]) return KIND_ALIASES[explicit];

  const media = cleanToken(input.mediaType);
  if (KIND_ALIASES[media] && KIND_ALIASES[media] !== "file") {
    return KIND_ALIASES[media];
  }

  const rawKind = cleanToken(input.kind);
  // Generic "file/other" carries no viewer information; let the extension
  // resolve a real PPT/Excel/Word/media kind before falling back to file.
  if (KIND_ALIASES[rawKind] && KIND_ALIASES[rawKind] !== "file") {
    if (rawKind === "video" && hasCanvasPayload(meta)) return "video_canvas";
    return KIND_ALIASES[rawKind];
  }

  const url = String(input.url ?? "");
  for (const [pattern, resolved] of EXTENSIONS) {
    if (pattern.test(url)) return resolved;
  }

  const site = cleanToken(input.siteId);
  if (site === "website" && /^https?:\/\//i.test(url)) return "website";
  if (site === "ppt" || site === "ppt_maker") return "ppt";
  if (site === "excel" || site === "excel_ai") return "sheet";
  if (site === "word" || site === "word_ai" || site === "paper") return "document";
  if (site === "video" && hasCanvasPayload(meta)) return "video_canvas";
  if (site === "threed") return "threed";
  return "file";
}

function titleFromUrl(url?: string): string {
  if (!url) return "";
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    return pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function previewFromMeta(meta: Record<string, unknown>): string {
  return metaString(meta, "preview_url", "previewUrl", "render_url", "renderUrl");
}

export function normalizeWork(work: Creation): LibraryItem {
  const meta = work.meta ?? {};
  const projection =
    work.artifact ?? meta.artifact ?? meta.artifact_projection;
  if (isCanonicalArtifactProjection(projection)) {
    return artifactProjectionToLibraryItem(projection);
  }
  const url = String(work.url ?? "").trim();
  const kind = inferLibraryKind({
    meta,
    mediaType: work.media_type,
    kind: work.kind,
    url,
    siteId: work.site_id,
  });
  const title = String(
    work.title || titleFromUrl(url) || "未命名作品",
  ).trim();
  const item: LibraryItem = {
    key: `creation:${work.id}`,
    source: "creation",
    id: work.id,
    title,
    kind,
    siteId: work.site_id || "",
    url: url || undefined,
    previewUrl: previewFromMeta(meta) || work.thumb_url || undefined,
    thumbUrl: work.thumb_url || previewFromMeta(meta) || undefined,
    content: typeof meta.content === "string" ? meta.content : undefined,
    favorite: Boolean((work as Creation & { favorite?: boolean }).favorite),
    createdAt: work.created_at,
    meta,
    descriptor: libraryContentDescriptor({ kind, meta }),
  };
  item.transient = transientFromMeta(
    {
      id: work.id,
      title,
      url,
      kind,
      siteId: work.site_id,
      meta,
    },
    meta.library_source === "upload" ? "upload" : "generation",
  );
  return item;
}

export function normalizeArtifact(row: LibraryArtifactRow): LibraryItem {
  if (isCanonicalArtifactProjection(row.artifact)) {
    return artifactProjectionToLibraryItem(row.artifact);
  }
  const url = String(row.url ?? "").trim();
  const content = row.content || "";
  const meta: Record<string, unknown> = {
    task_id: row.task_id || undefined,
    session_id: row.session_id || undefined,
  };
  const kind = inferLibraryKind({ kind: row.kind, url, meta });
  const title = String(
    row.title || titleFromUrl(url) || "未命名交付物",
  ).trim();
  const item: LibraryItem = {
    key: `artifact:${row.id}`,
    source: "artifact",
    id: row.id,
    title,
    kind,
    siteId: "",
    url: url || undefined,
    content: content || undefined,
    favorite: Boolean(row.favorite),
    createdAt: row.created_at || undefined,
    meta,
    descriptor: libraryContentDescriptor({ kind, meta }),
  };
  item.transient = transientFromMeta(
    { id: row.id, title, url, kind, meta },
    "legacy-import",
  );
  return item;
}

/**
 * Union compatibility stores without using signed/transient URLs as identity.
 * Canonical projections dedupe only by artifactId + pinned revisionId.
 */
export function buildLibraryItems(
  works: Creation[],
  artifacts: LibraryArtifactRow[],
): LibraryItem[] {
  const merged = new Map<string, LibraryItem>();
  for (const item of [
    ...works.map(normalizeWork),
    ...artifacts.map(normalizeArtifact),
  ]) {
    const key = libraryItemIdentityKey(item);
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
}

export function libraryItemMatches(
  item: LibraryItem,
  kinds: readonly LibraryKind[],
  favoritesOnly = false,
): boolean {
  return (!favoritesOnly || item.favorite) && (kinds.length === 0 || kinds.includes(item.kind));
}
