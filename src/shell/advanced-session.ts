import type { AppSession } from "../lib/app-session";
import {
  lightweightOfficeRouteForExtension,
  type LightweightOfficeRoute,
} from "../lib/office-client";
import type { ArtifactRevisionCommit } from "./artifact-client";
import {
  normalizeArtifactProjectionResult,
  type ArtifactProjection,
  type ArtifactType,
} from "./artifact-contract";
import {
  isDurableLibraryItem,
  type LibraryItem,
  type LibraryKind,
} from "./library-data";
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
const MAX_ARTIFACT_JSON = 120_000;

type StoredEditorRouteType = EditorRoute["type"] | "office";

const CANONICAL_ROUTE_TYPES = new Set<EditorRoute["type"]>([
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
const STORED_ROUTE_TYPES = new Set<StoredEditorRouteType>([
  ...CANONICAL_ROUTE_TYPES,
  "office",
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
  "file_name",
  "filename",
  "extension",
  "ext",
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
  "previous_revision_id",
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
    artifactId?: string;
    revisionId?: string;
    artifactType?: ArtifactType;
    artifact?: ArtifactProjection;
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

function legacyOfficeRouteForSnapshot(input: {
  kind: LibraryKind;
  title: string;
  url?: string;
  meta: Record<string, unknown>;
}): LightweightOfficeRoute | null {
  for (const candidate of [
    input.meta.format,
    input.meta.file_name,
    input.meta.filename,
    input.meta.extension,
    input.meta.ext,
    input.url,
    input.title,
  ]) {
    const route = lightweightOfficeRouteForExtension(String(candidate || ""));
    if (route) return route;
  }
  const mime = String(input.meta.mime || "").trim().toLowerCase();
  if (/wordprocessingml|msword/.test(mime)) return "richdoc";
  if (/spreadsheetml|ms-excel/.test(mime)) return "grid";
  if (/presentationml|ms-powerpoint/.test(mime)) return "deck";
  if (input.kind === "document") return "richdoc";
  if (input.kind === "sheet") return "grid";
  if (input.kind === "ppt") return "deck";
  return null;
}

export function advancedRootItemId(item: LibraryItem): string {
  return boundedString(
    item.meta.root_asset_id || item.meta.parent_asset_id || item.id || item.key,
    512,
  );
}

export type SavedEditorRevisionTransitionCode =
  | "non-durable-source"
  | "metadata-only"
  | "revision-commit"
  | "missing-durable-item"
  | "wrong-artifact-root"
  | "same-revision-commit"
  | "wrong-previous-revision"
  | "invalid-integrity";

export interface SavedEditorRevisionTransition {
  ok: boolean;
  durableCommit: boolean;
  code: SavedEditorRevisionTransitionCode;
  reason: string;
}

function previousRevisionId(item: LibraryItem): string {
  return boundedString(item.meta.previous_revision_id, 512);
}

/**
 * Classify one editor callback against the exact revision that was opened.
 * Same-revision callbacks are normal working-head/metadata updates as long as
 * they retain the source's existing lineage metadata. Only a returned durable
 * revision with a changed revision id is evaluated as a commit.
 */
export function savedEditorRevisionTransition(
  source: LibraryItem,
  returned: LibraryItem,
): SavedEditorRevisionTransition {
  if (!isDurableLibraryItem(source)) {
    return {
      ok: true,
      durableCommit: false,
      code: "non-durable-source",
      reason: "",
    };
  }
  if (!isDurableLibraryItem(returned)) {
    return {
      ok: false,
      durableCommit: false,
      code: "missing-durable-item",
      reason: "编辑器返回值丢失了已打开素材的 durable artifact identity。",
    };
  }

  const sameRoot = returned.artifactId === source.artifactId;
  const sameRevision = returned.revisionId === source.revisionId;
  const returnedPrevious = previousRevisionId(returned);
  const sourcePrevious = previousRevisionId(source);

  if (sameRoot && sameRevision && returnedPrevious === sourcePrevious) {
    if (!returned.artifact.integrity.ok) {
      return {
        ok: false,
        durableCommit: false,
        code: "invalid-integrity",
        reason: "编辑器返回的 artifact projection 未通过完整性校验。",
      };
    }
    return {
      ok: true,
      durableCommit: false,
      code: "metadata-only",
      reason: "",
    };
  }
  if (!sameRoot) {
    return {
      ok: false,
      durableCommit: true,
      code: "wrong-artifact-root",
      reason: "编辑器 revision commit 改变了 artifact root。",
    };
  }
  if (sameRevision) {
    return {
      ok: false,
      durableCommit: true,
      code: "same-revision-commit",
      reason: "编辑器把同一 revision 冒充为新的 revision commit。",
    };
  }
  if (returnedPrevious !== source.revisionId) {
    return {
      ok: false,
      durableCommit: true,
      code: "wrong-previous-revision",
      reason: "编辑器 revision commit 没有以当前 pin 作为 previous revision。",
    };
  }
  if (!returned.artifact.integrity.ok) {
    return {
      ok: false,
      durableCommit: true,
      code: "invalid-integrity",
      reason: "编辑器返回的新 artifact revision 未通过完整性校验。",
    };
  }
  return {
    ok: true,
    durableCommit: true,
    code: "revision-commit",
    reason: "",
  };
}

/**
 * Add the pinned lineage marker to a publisher result and validate the entire
 * transition before it can replace the opened head. A publisher may omit the
 * compatibility metadata, but it may never contradict it.
 */
export function advancedCommittedRevisionItem(
  source: LibraryItem,
  committed: LibraryItem,
  meta: Record<string, unknown> = {},
): LibraryItem {
  if (!isDurableLibraryItem(source)) {
    throw new Error("durable revision commit 缺少 pinned source revision。");
  }
  const declaredPrevious = previousRevisionId(committed);
  if (declaredPrevious && declaredPrevious !== source.revisionId) {
    throw new Error("revision commit 返回了错误的 previous_revision_id。");
  }
  const pinned: LibraryItem = {
    ...committed,
    meta: {
      ...committed.meta,
      ...meta,
      previous_revision_id: source.revisionId,
    },
  };
  const transition = savedEditorRevisionTransition(source, pinned);
  if (!transition.ok || !transition.durableCommit) {
    throw new Error(transition.reason || "revision commit 未推进 artifact revision。");
  }
  return pinned;
}

export interface AdvancedRevisionPublishResult {
  ok: boolean;
  data?: LibraryItem;
  error?: string;
}

/**
 * Publish against the exact opened pin. Callers provide bytes/rendition
 * evidence only; this helper owns expectedRevisionId, artifactType and lineage
 * metadata so route implementations cannot accidentally omit or rebase them.
 */
export async function commitAdvancedSavedRevision(
  source: LibraryItem,
  input: {
    commit: Omit<
      ArtifactRevisionCommit,
      "expectedRevisionId" | "artifactType"
    >;
    publish: (
      artifactId: string,
      commit: ArtifactRevisionCommit,
    ) => Promise<AdvancedRevisionPublishResult>;
    meta?: Record<string, unknown>;
  },
): Promise<LibraryItem> {
  if (
    !isDurableLibraryItem(source) ||
    !source.artifact.integrity.ok ||
    !source.artifact.access.canEdit
  ) {
    throw new Error(
      "当前素材没有可提交新 revision 的完整、可编辑 durable identity。",
    );
  }
  const published = await input.publish(source.artifactId, {
    ...input.commit,
    expectedRevisionId: source.revisionId,
    artifactType: source.artifactType,
  });
  if (!published.ok || !published.data) {
    throw new Error(published.error || "artifact revision commit 失败。");
  }
  return advancedCommittedRevisionItem(
    source,
    published.data,
    input.meta,
  );
}

interface StoredDurableArtifact {
  artifactId: string;
  revisionId: string;
  artifactType: ArtifactType;
  artifact: ArtifactProjection;
}

function durableArtifactForSnapshot(
  item: LibraryItem,
): StoredDurableArtifact | null {
  if (!isDurableLibraryItem(item)) return null;
  let encoded = "";
  try {
    encoded = JSON.stringify(item.artifact);
  } catch {
    throw new Error("artifact projection 无法序列化到高级编辑 session。");
  }
  if (!encoded || encoded.length > MAX_ARTIFACT_JSON) {
    throw new Error("artifact projection 超过高级编辑 session 安全上限。");
  }
  const normalized = normalizeArtifactProjectionResult(JSON.parse(encoded));
  if (
    !normalized.ok ||
    !normalized.data ||
    normalized.data.artifactId !== item.artifactId ||
    normalized.data.revisionId !== item.revisionId ||
    normalized.data.artifactType !== item.artifactType ||
    !normalized.data.integrity.ok
  ) {
    throw new Error(
      normalized.error ||
        "artifact projection 无法以完整 durable identity 写入 session。",
    );
  }
  return {
    artifactId: item.artifactId,
    revisionId: item.revisionId,
    artifactType: item.artifactType,
    artifact: normalized.data,
  };
}

/**
 * undefined = legacy/non-durable snapshot, null = a malformed durable claim.
 */
function durableArtifactFromStoredItem(
  raw: Record<string, unknown>,
): StoredDurableArtifact | null | undefined {
  const claimed = [
    raw.artifactId,
    raw.revisionId,
    raw.artifactType,
    raw.artifact,
  ].some((value) => value !== undefined);
  if (!claimed) return undefined;
  const artifactId = boundedString(raw.artifactId, 512);
  const revisionId = boundedString(raw.revisionId, 512);
  const normalized = normalizeArtifactProjectionResult(raw.artifact);
  if (
    !artifactId ||
    !revisionId ||
    !normalized.ok ||
    !normalized.data ||
    normalized.data.artifactId !== artifactId ||
    normalized.data.revisionId !== revisionId ||
    normalized.data.artifactType !== raw.artifactType ||
    !normalized.data.integrity.ok ||
    boundedString(raw.id, 512) !== artifactId
  ) {
    return null;
  }
  return {
    artifactId,
    revisionId,
    artifactType: normalized.data.artifactType,
    artifact: normalized.data,
  };
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

function advancedSessionAppIdForStoredRoute(
  item: LibraryItem,
  route: StoredEditorRouteType,
): string {
  const rootId = advancedRootItemId(item);
  return `advanced:v2:${route}:${stableDigest(rootId)}`.slice(0, MAX_APP_ID);
}

export function advancedSessionAppId(
  item: LibraryItem,
  route: EditorRoute["type"],
): string {
  if (!CANONICAL_ROUTE_TYPES.has(route)) {
    throw new Error("Legacy office route cannot create an advanced session.");
  }
  return advancedSessionAppIdForStoredRoute(item, route);
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
  const durableArtifact = durableArtifactForSnapshot(item);
  const feature = advancedFeatureForItem(item);
  if (!feature) {
    throw new Error("当前素材没有可恢复的高级功能。");
  }
  if (!CANONICAL_ROUTE_TYPES.has(route)) {
    throw new Error("Legacy office route cannot be persisted.");
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
      ...(durableArtifact || {}),
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
    const storedHeadRoute = head?.route as StoredEditorRouteType;
    if (
      !head ||
      head.version !== INLINE_EDITOR_HISTORY_VERSION ||
      !STORED_ROUTE_TYPES.has(storedHeadRoute) ||
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
    const durableArtifact = durableArtifactFromStoredItem(
      raw as unknown as Record<string, unknown>,
    );
    if (durableArtifact === null) continue;
    if (durableArtifact) Object.assign(candidate, durableArtifact);
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
    const expectedAppId = advancedSessionAppIdForStoredRoute(
      candidate,
      storedHeadRoute,
    );
    // Reuse the hardened legacy decoder in memory; the normal App snapshot
    // stores an inline head, never an advanced session or advanced surface.
    const decoderSnapshot = {
      kind: ADVANCED_SESSION_KIND,
      version: ADVANCED_SESSION_SCHEMA_VERSION,
      editor_route: storedHeadRoute,
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
    !STORED_ROUTE_TYPES.has(record.editor_route as StoredEditorRouteType) ||
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
  const storedRoute = record.editor_route as StoredEditorRouteType;
  const meta = jsonSafeMeta(raw.meta as Record<string, unknown>);
  const durableArtifact = durableArtifactFromStoredItem(raw);
  if (durableArtifact === null) return null;
  let route: EditorRoute["type"];
  // Historical snapshots may name the removed Office/native-Chrome adapter.
  // Recover only when their typed source identifies one lightweight editor.
  if (storedRoute === "office") {
    const lightweightRoute = legacyOfficeRouteForSnapshot({
      kind,
      title,
      url,
      meta,
    });
    if (!lightweightRoute) return null;
    route = lightweightRoute;
    meta.advanced_editor_route = lightweightRoute;
  } else {
    route = storedRoute;
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
    ...(durableArtifact || {}),
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
    storedRoute === "office"
      ? advancedSessionAppIdForStoredRoute(restored, "office")
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
