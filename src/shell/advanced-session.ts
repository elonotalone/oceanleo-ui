import type { AppSession } from "../lib/app-session";
import type { LibraryItem, LibraryKind } from "./library-data";
import { savedItemVisualUrls } from "./editor-working-head";
import {
  advancedFeatureById,
  advancedFeatureForItem,
  type AdvancedFeatureId,
} from "./advanced-features";
import { editorRouteFor, type EditorRoute } from "./workbench-routes";

export const ADVANCED_SESSION_SCHEMA_VERSION = 2;
export const ADVANCED_SESSION_KIND = "advanced_content";
export const INLINE_EDITOR_HISTORY_KEY = "oceanleo_inline_editor";
const INLINE_EDITOR_HISTORY_VERSION = 1;
const MAX_APP_ID = 160;
const MAX_META_JSON = 20_000;

const ROUTE_TYPES = new Set<EditorRoute["type"]>([
  "office",
  "video-timeline",
  "audio",
  "image",
  "pdf",
  "richdoc",
  "grid",
  "deck",
  "threed",
  "embed",
  "none",
]);
const ITEM_KINDS = new Set<LibraryKind>([
  "website",
  "canvas",
  "ppt",
  "sheet",
  "document",
  "image",
  "video",
  "video_canvas",
  "audio",
  "xhs",
  "threed",
  "file",
]);
const META_KEYS = new Set([
  "mime",
  "format",
  "library_source",
  "draft",
  "blank",
  "website_id",
  "project_id",
  "slug",
  "site_id",
  "starter_id",
  "github_repo",
  "commit_sha",
  "github_url",
  "live_url",
  "asset_id",
  "platform_asset_id",
  "editor",
  "editor_manifest",
  "fabric_document_url",
  "fabric_preview_url",
  "fabric_saved_at",
  "editor_project_url",
  "editor_project_schema",
  "editor_saved_at",
  "model_source_url",
  "model_dependency_mode",
  "content_type",
  "representation",
  "subtype",
  "source_app_id",
  "parent_asset_id",
  "root_asset_id",
  "content",
  "text",
  "markdown",
  "source",
  "slides",
  "sheets",
  "rows",
  "view",
  "source_deck",
  "schema",
  "page_count",
  "sheet_count",
  "sheet_names",
  "aspect",
  "theme",
  "timeline",
  "clips",
  "nodes",
  "scenes",
  "images",
  "body",
  "caption",
  "video_url",
  "preview_url",
  "asset_type",
  "template_doc_url",
  "source_asset_url",
  "open_url",
  "advanced_editor_route",
]);

export interface AdvancedSessionSnapshot extends Record<string, unknown> {
  kind: typeof ADVANCED_SESSION_KIND;
  version: typeof ADVANCED_SESSION_SCHEMA_VERSION;
  editor_route: EditorRoute["type"];
  feature_id: AdvancedFeatureId;
  item: {
    key: string;
    source: LibraryItem["source"];
    /** Stable root material id; new saved versions never change the app identity. */
    id: string;
    /** The concrete library row currently rendered by the editor. */
    versionId: string;
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
  };
  task_id: string | null;
}

function jsonSafeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  try {
    const filtered = Object.fromEntries(
      Object.entries(meta).filter(([key]) => META_KEYS.has(key)),
    );
    const encoded = JSON.stringify(filtered);
    if (encoded.length > MAX_META_JSON) return {};
    const parsed = JSON.parse(encoded) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function boundedString(value: unknown, maximum: number): string {
  return typeof value === "string" && value.trim() && value.length <= maximum
    ? value.trim()
    : "";
}

function durableUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2_000) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isNativeDeckFile(url: string | undefined, meta: Record<string, unknown>): boolean {
  const format = String(meta.format || "").trim().toLowerCase();
  return (
    ["pptx", "pptm", "potx", "potm"].includes(format) ||
    /\.(?:pptx|pptm|potx|potm)(?:$|[?#])/i.test(url || "")
  );
}

export function advancedRootItemId(item: LibraryItem): string {
  return boundedString(
    item.meta.root_asset_id || item.meta.parent_asset_id || item.id || item.key,
    512,
  );
}

function stableDigest(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second
    .toString(16)
    .padStart(8, "0")}`;
}

export function advancedSessionAppId(
  item: LibraryItem,
  route: EditorRoute["type"],
): string {
  const rootId = advancedRootItemId(item);
  return `advanced:v2:${route}:${stableDigest(rootId)}`.slice(0, MAX_APP_ID);
}

export function advancedSavedItem(
  item: LibraryItem,
  input: {
    url: string;
    previewUrl?: string;
    thumbUrl?: string;
    title?: string;
    versionId?: string;
    meta?: Record<string, unknown>;
  },
): LibraryItem {
  const rootId = advancedRootItemId(item);
  const visual = savedItemVisualUrls(item, input);
  return {
    ...item,
    id: input.versionId || item.id,
    title: input.title || item.title,
    url: input.url,
    previewUrl: visual.previewUrl,
    thumbUrl: visual.thumbUrl,
    meta: {
      ...item.meta,
      ...input.meta,
      parent_asset_id: rootId,
    },
  };
}

export function advancedSessionSnapshot(
  item: LibraryItem,
  route: EditorRoute["type"],
  taskId?: string | null,
): AdvancedSessionSnapshot {
  const rootId = advancedRootItemId(item);
  const feature = advancedFeatureForItem(item);
  if (!feature) {
    throw new Error("当前素材没有可恢复的高级功能。");
  }
  return {
    kind: ADVANCED_SESSION_KIND,
    version: ADVANCED_SESSION_SCHEMA_VERSION,
    editor_route: route,
    feature_id: feature.id,
    item: {
      key: item.key,
      source: item.source,
      id: rootId,
      versionId: item.id,
      title: item.title,
      kind: item.kind,
      siteId: item.siteId,
      url: item.url,
      previewUrl: item.previewUrl,
      thumbUrl: item.thumbUrl,
      content: item.content,
      favorite: item.favorite,
      createdAt: item.createdAt,
      meta: jsonSafeMeta({
        ...item.meta,
        advanced_editor_route: route,
      }),
    },
    task_id: taskId?.trim() || null,
  };
}

interface InlineEditorHistoryEntry {
  updatedAt: string;
  head: {
    version: 1;
    route: EditorRoute["type"];
    task_id: string | null;
    item: AdvancedSessionSnapshot["item"];
  };
}

interface InlineEditorHistoryState {
  version: typeof INLINE_EDITOR_HISTORY_VERSION;
  latestRootId: string;
  heads: Record<string, InlineEditorHistoryEntry>;
}

/** Add one reopenable editor head without replacing the App's native snapshot. */
export function withInlineEditorHistoryHead(
  currentSnapshot: unknown,
  item: LibraryItem,
  route: EditorRoute["type"],
  taskId?: string | null,
): Record<string, unknown> {
  const base =
    currentSnapshot &&
    typeof currentSnapshot === "object" &&
    !Array.isArray(currentSnapshot)
      ? (currentSnapshot as Record<string, unknown>)
      : {};
  const rawState =
    base[INLINE_EDITOR_HISTORY_KEY] &&
    typeof base[INLINE_EDITOR_HISTORY_KEY] === "object" &&
    !Array.isArray(base[INLINE_EDITOR_HISTORY_KEY])
      ? (base[INLINE_EDITOR_HISTORY_KEY] as Record<string, unknown>)
      : null;
  const rawHeads =
    rawState?.version === INLINE_EDITOR_HISTORY_VERSION &&
    rawState.heads &&
    typeof rawState.heads === "object" &&
    !Array.isArray(rawState.heads)
      ? (rawState.heads as Record<string, InlineEditorHistoryEntry>)
      : {};
  const rootId = advancedRootItemId(item);
  const key = stableDigest(rootId);
  const serialized = advancedSessionSnapshot(item, route, taskId);
  const heads = {
    ...rawHeads,
    [key]: {
      updatedAt: new Date().toISOString(),
      head: {
        version: 1 as const,
        route,
        task_id: taskId?.trim() || null,
        item: serialized.item,
      },
    },
  };
  const trimmed = Object.fromEntries(
    Object.entries(heads)
      .sort(([, left], [, right]) =>
        String(right.updatedAt).localeCompare(String(left.updatedAt)),
      )
      .slice(0, 24),
  );
  const state: InlineEditorHistoryState = {
    version: INLINE_EDITOR_HISTORY_VERSION,
    latestRootId: rootId,
    heads: trimmed,
  };
  return { ...base, [INLINE_EDITOR_HISTORY_KEY]: state };
}

/** Read saved editor heads embedded in a normal App session. */
export function inlineEditorItemsFromSession(
  session: AppSession | null | undefined,
): LibraryItem[] {
  const snapshot = session?.snapshot;
  if (!session || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return [];
  }
  const rawState = (snapshot as Record<string, unknown>)[INLINE_EDITOR_HISTORY_KEY];
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) return [];
  const state = rawState as Record<string, unknown>;
  if (
    state.version !== INLINE_EDITOR_HISTORY_VERSION ||
    !state.heads ||
    typeof state.heads !== "object" ||
    Array.isArray(state.heads)
  ) {
    return [];
  }
  const ordered = Object.values(
    state.heads as Record<string, InlineEditorHistoryEntry>,
  ).sort((left, right) =>
    String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || "")),
  );
  const items: LibraryItem[] = [];
  for (const entry of ordered.slice(0, 24)) {
    const head = entry?.head;
    const raw = head?.item;
    if (
      !head ||
      head.version !== INLINE_EDITOR_HISTORY_VERSION ||
      !ROUTE_TYPES.has(head.route) ||
      !raw ||
      typeof raw !== "object"
    ) {
      continue;
    }
    const candidate: LibraryItem = {
      key: boundedString(raw.key, 512),
      source:
        raw.source === "artifact" || raw.source === "creation"
          ? raw.source
          : "creation",
      id: boundedString(raw.versionId, 512),
      title: boundedString(raw.title, 500),
      kind: ITEM_KINDS.has(raw.kind) ? raw.kind : "file",
      siteId: boundedString(raw.siteId, 120),
      url: durableUrl(raw.url),
      previewUrl: durableUrl(raw.previewUrl),
      thumbUrl: durableUrl(raw.thumbUrl),
      content:
        typeof raw.content === "string" && raw.content.length <= 100_000
          ? raw.content
          : undefined,
      favorite: raw.favorite === true,
      createdAt: boundedString(raw.createdAt, 100) || undefined,
      meta:
        raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)
          ? jsonSafeMeta(raw.meta)
          : {},
    };
    if (
      !candidate.key ||
      !candidate.id ||
      !candidate.title ||
      !candidate.siteId ||
      candidate.kind === "file" && raw.kind !== "file"
    ) {
      continue;
    }
    candidate.meta.parent_asset_id = boundedString(raw.id, 512);
    const feature = advancedFeatureForItem(candidate);
    if (!feature) continue;
    const expectedAppId = advancedSessionAppId(candidate, head.route);
    // Reuse the hardened legacy decoder in memory; the normal App snapshot
    // stores an inline head, never an advanced session or advanced surface.
    const decoderSnapshot: AdvancedSessionSnapshot = {
      kind: ADVANCED_SESSION_KIND,
      version: ADVANCED_SESSION_SCHEMA_VERSION,
      editor_route: head.route,
      feature_id: feature.id,
      task_id: head.task_id,
      item: raw,
    };
    const restored = advancedItemFromSession({
      ...session,
      app_id: expectedAppId,
      snapshot: decoderSnapshot,
    });
    if (restored) items.push(restored);
  }
  return items;
}

export function advancedSnapshotFromSession(
  session: AppSession | null | undefined,
): AdvancedSessionSnapshot | null {
  const snapshot = session?.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const record = snapshot as Record<string, unknown>;
  if (
    record.kind !== ADVANCED_SESSION_KIND ||
    record.version !== ADVANCED_SESSION_SCHEMA_VERSION ||
    !ROUTE_TYPES.has(record.editor_route as EditorRoute["type"]) ||
    !record.item ||
    typeof record.item !== "object" ||
    Array.isArray(record.item)
  ) {
    return null;
  }
  const raw = record.item as Record<string, unknown>;
  const source =
    raw.source === "creation" || raw.source === "artifact"
      ? raw.source
      : null;
  const kind = ITEM_KINDS.has(raw.kind as LibraryKind)
    ? (raw.kind as LibraryKind)
    : null;
  const key = boundedString(raw.key, 512);
  const rootId = boundedString(raw.id, 512);
  const versionId = boundedString(raw.versionId, 512);
  const title = boundedString(raw.title, 500);
  const siteId = boundedString(raw.siteId, 120);
  const url = durableUrl(raw.url);
  const previewUrl = durableUrl(raw.previewUrl);
  const thumbUrl = durableUrl(raw.thumbUrl);
  const content =
    raw.content === undefined
      ? undefined
      : typeof raw.content === "string" && raw.content.length <= 100_000
        ? raw.content
        : null;
  const createdAt =
    raw.createdAt === undefined
      ? undefined
      : boundedString(raw.createdAt, 100) || null;
  const taskId =
    record.task_id === null
      ? null
      : boundedString(record.task_id, 512) || undefined;
  if (
    !source ||
    !kind ||
    !key ||
    !rootId ||
    !versionId ||
    !title ||
    !siteId ||
    typeof raw.favorite !== "boolean" ||
    content === null ||
    createdAt === null ||
    taskId === undefined ||
    (raw.url !== undefined && !url) ||
    (raw.previewUrl !== undefined && !previewUrl) ||
    (raw.thumbUrl !== undefined && !thumbUrl) ||
    !raw.meta ||
    typeof raw.meta !== "object" ||
    Array.isArray(raw.meta)
  ) {
    return null;
  }
  let route = record.editor_route as EditorRoute["type"];
  const meta = jsonSafeMeta(raw.meta as Record<string, unknown>);
  // Sessions created before the native importer used the Office iframe for
  // PPTX. Upgrade those snapshots in place while retaining their durable id.
  if (route === "office" && isNativeDeckFile(url, meta)) {
    route = "deck";
    meta.advanced_editor_route = "deck";
  }
  if (
    route === "embed" &&
    siteId === "design" &&
    typeof meta.template_doc_url !== "string"
  ) {
    const legacyTemplate = /^site:tpl-([a-z0-9-]+)$/i.exec(rootId);
    if (legacyTemplate) {
      meta.template_doc_url =
        `https://asset.oceanleo.com/design-templates/doc/${legacyTemplate[1]}.json`;
    }
  }
  // v2 snapshots written before blank/draft became allowlisted lost the
  // website onboarding marker. Recover only source-less website drafts; real
  // projects, starters and GitHub-backed saves all carry their own identity.
  if (
    kind === "website" &&
    !url &&
    !meta.project_id &&
    !meta.website_id &&
    !meta.starter_id &&
    !meta.github_repo
  ) {
    meta.draft = true;
    meta.blank = true;
  }
  const item: AdvancedSessionSnapshot["item"] = {
    key,
    source,
    id: rootId,
    versionId,
    title,
    kind,
    siteId,
    url,
    previewUrl,
    thumbUrl,
    content,
    favorite: raw.favorite,
    createdAt,
    meta,
  };
  const restored: LibraryItem = {
    ...item,
    id: versionId,
    meta: { ...meta, parent_asset_id: rootId },
  };
  const feature = advancedFeatureForItem(restored);
  const declaredFeature =
    typeof record.feature_id === "string"
      ? advancedFeatureById(record.feature_id)
      : null;
  const expectedAppId = advancedSessionAppId(restored, route);
  const legacyOfficeAppId =
    route === "deck" && isNativeDeckFile(url, meta)
      ? advancedSessionAppId(restored, "office")
      : "";
  if (
    !feature ||
    (record.feature_id !== undefined && declaredFeature?.id !== feature.id) ||
    (session.app_id !== expectedAppId && session.app_id !== legacyOfficeAppId) ||
    editorRouteFor(restored).type !== route
  ) {
    return null;
  }
  return {
    kind: ADVANCED_SESSION_KIND,
    version: ADVANCED_SESSION_SCHEMA_VERSION,
    editor_route: route,
    feature_id: feature.id,
    item,
    task_id: taskId,
  };
}

export function advancedItemFromSession(
  session: AppSession | null | undefined,
): LibraryItem | null {
  const snapshot = advancedSnapshotFromSession(session);
  return snapshot
    ? {
        ...snapshot.item,
        id: snapshot.item.versionId,
        meta: {
          ...snapshot.item.meta,
          parent_asset_id: snapshot.item.id,
        },
      }
    : null;
}
