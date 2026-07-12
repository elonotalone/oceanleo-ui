import type { WorkItem } from "../lib/database";

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

function normalizeUrlKey(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${decodeURIComponent(parsed.pathname)}`.replace(/\/+$/, "");
  } catch {
    return url.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  }
}

export function normalizeWork(work: WorkItem): LibraryItem {
  const meta = work.meta ?? {};
  const url = (work.url || "").trim();
  return {
    key: `creation:${work.id}`,
    source: "creation",
    id: work.id,
    title: (work.title || titleFromUrl(url) || "未命名作品").trim(),
    kind: inferLibraryKind({
      meta,
      mediaType: work.media_type,
      kind: work.kind,
      url,
      siteId: work.site_id,
    }),
    siteId: work.site_id || "",
    url: url || undefined,
    previewUrl: previewFromMeta(meta) || work.thumb_url || undefined,
    thumbUrl: work.thumb_url || previewFromMeta(meta) || undefined,
    content: typeof meta.content === "string" ? meta.content : undefined,
    favorite: Boolean((work as WorkItem & { favorite?: boolean }).favorite),
    createdAt: work.created_at,
    meta,
  };
}

export function normalizeArtifact(row: LibraryArtifactRow): LibraryItem {
  const url = (row.url || "").trim();
  const content = row.content || "";
  const meta: Record<string, unknown> = {
    task_id: row.task_id || undefined,
    session_id: row.session_id || undefined,
  };
  return {
    key: `artifact:${row.id}`,
    source: "artifact",
    id: row.id,
    title: (row.title || titleFromUrl(url) || "未命名交付物").trim(),
    kind: inferLibraryKind({ kind: row.kind, url, meta }),
    siteId: "",
    url: url || undefined,
    content: content || undefined,
    favorite: Boolean(row.favorite),
    createdAt: row.created_at || undefined,
    meta,
  };
}

function mergeItem(preferred: LibraryItem, other: LibraryItem): LibraryItem {
  const creation =
    preferred.source === "creation"
      ? preferred
      : other.source === "creation"
        ? other
        : preferred;
  const artifact = creation === preferred ? other : preferred;
  return {
    ...artifact,
    ...creation,
    key: creation.key,
    title:
      creation.title && creation.title !== "未命名作品"
        ? creation.title
        : artifact.title,
    kind: creation.kind === "file" ? artifact.kind : creation.kind,
    url: creation.url || artifact.url,
    previewUrl: creation.previewUrl || artifact.previewUrl,
    thumbUrl: creation.thumbUrl || artifact.thumbUrl,
    content: creation.content || artifact.content,
    favorite: creation.favorite || artifact.favorite,
    createdAt: creation.createdAt || artifact.createdAt,
    meta: { ...artifact.meta, ...creation.meta, artifact_id: artifact.id },
  };
}

/** Merge both durable stores and de-duplicate the same file URL. */
export function buildLibraryItems(
  works: WorkItem[],
  artifacts: LibraryArtifactRow[],
): LibraryItem[] {
  const merged = new Map<string, LibraryItem>();
  const noUrl: LibraryItem[] = [];
  for (const item of [
    ...works.map(normalizeWork),
    ...artifacts.map(normalizeArtifact),
  ]) {
    const urlKey = normalizeUrlKey(item.url);
    if (!urlKey) {
      noUrl.push(item);
      continue;
    }
    const current = merged.get(urlKey);
    merged.set(urlKey, current ? mergeItem(current, item) : item);
  }
  return [...merged.values(), ...noUrl].sort((a, b) =>
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
