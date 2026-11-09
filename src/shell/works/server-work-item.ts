import type { LibraryItem } from "../library-data";
import { normalizeServerWork, type ServerWork } from "./model";

export function serverWorkLibraryItem(work: ServerWork): LibraryItem {
  return {
    key: `server-work:${work.id}`,
    source: "creation",
    id: work.id,
    title: work.title,
    kind: work.kind === "game" || work.kind === "website" ? work.kind : "website",
    siteId: "",
    favorite: false,
    createdAt: work.updated_at,
    meta: { serverWork: work.server_work, serverWorkRecord: work },
  };
}

export function isServerWorkItem(item: LibraryItem): boolean {
  return item.source === "creation" && item.key.startsWith("server-work:") && Boolean(normalizeServerWork(item.meta.serverWorkRecord));
}

export function serverWorkFromLibraryItem(item: LibraryItem): ServerWork | null {
  if (!isServerWorkItem(item)) return null;
  return normalizeServerWork(item.meta.serverWorkRecord);
}
