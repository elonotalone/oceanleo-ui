import type { AppSession } from "../lib/app-session";
import type { LibraryItem, LibraryKind } from "./library-data";
import type { EditorRoute } from "./workbench-routes";

export const ADVANCED_SESSION_SCHEMA_VERSION = 1;
export const ADVANCED_SESSION_KIND = "advanced_content";

export interface AdvancedSessionSnapshot extends Record<string, unknown> {
  kind: typeof ADVANCED_SESSION_KIND;
  version: typeof ADVANCED_SESSION_SCHEMA_VERSION;
  editor_route: EditorRoute["type"];
  item: {
    key: string;
    source: LibraryItem["source"];
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
  };
  task_id?: string;
}

function jsonSafeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  try {
    const encoded = JSON.stringify(meta);
    if (encoded.length > 20_000) return {};
    return JSON.parse(encoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function advancedSessionAppId(
  item: LibraryItem,
  route: EditorRoute["type"],
): string {
  return `advanced:${route}:${String(item.id || item.key).slice(0, 160)}`;
}

export function advancedSessionSnapshot(
  item: LibraryItem,
  route: EditorRoute["type"],
  taskId?: string | null,
): AdvancedSessionSnapshot {
  return {
    kind: ADVANCED_SESSION_KIND,
    version: ADVANCED_SESSION_SCHEMA_VERSION,
    editor_route: route,
    item: {
      key: item.key,
      source: item.source,
      id: item.id,
      title: item.title,
      kind: item.kind,
      siteId: item.siteId,
      url: item.url,
      previewUrl: item.previewUrl,
      thumbUrl: item.thumbUrl,
      content: item.content,
      favorite: item.favorite,
      createdAt: item.createdAt,
      meta: jsonSafeMeta(item.meta),
    },
    ...(taskId ? { task_id: taskId } : {}),
  };
}

export function advancedSnapshotFromSession(
  session: AppSession | null | undefined,
): AdvancedSessionSnapshot | null {
  const snapshot = session?.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const record = snapshot as Partial<AdvancedSessionSnapshot>;
  if (
    record.kind !== ADVANCED_SESSION_KIND ||
    record.version !== ADVANCED_SESSION_SCHEMA_VERSION ||
    !record.item ||
    typeof record.item !== "object"
  ) {
    return null;
  }
  const item = record.item as AdvancedSessionSnapshot["item"];
  if (
    !item.id ||
    !item.key ||
    !item.title ||
    !item.kind ||
    !item.source ||
    !item.meta ||
    typeof item.meta !== "object" ||
    Array.isArray(item.meta)
  ) {
    return null;
  }
  return record as AdvancedSessionSnapshot;
}

export function advancedItemFromSession(
  session: AppSession | null | undefined,
): LibraryItem | null {
  const snapshot = advancedSnapshotFromSession(session);
  return snapshot ? { ...snapshot.item } : null;
}
