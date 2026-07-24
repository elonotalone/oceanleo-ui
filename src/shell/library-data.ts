import type { Creation } from "../lib/database";
import type {
  ArtifactProjection,
  ArtifactType,
  TransientGenerationResult,
} from "./artifact-contract";
import { isArtifactSourceTreeUrl } from "./artifact-contract";
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
};

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
    file: "document",
  } as Record<LibraryKind, ArtifactType>)[kind];
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
  const viewer =
    artifact.renditions.preview ||
    artifact.renditions.full ||
    (artifact.access.canExportSource
      ? artifact.renditions.source
      : undefined);
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
  const browserSafeSource =
    source?.url && !isArtifactSourceTreeUrl(source.url) ? source : null;
  const selectedRendition = prefersBinarySource
    ? browserSafeSource || full || viewer
    : options.forEdit
      ? source || full || viewer
      : full || viewer;
  const url = selectedRendition?.url;
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
    thumbUrl: thumbnail?.url || preview?.url || undefined,
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
