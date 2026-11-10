import type { LibraryItem } from "../library-data";
import type { WorkKind, WorkLink } from "./model";

export interface LinkWork { id: string; title: string; kind: WorkKind; links: WorkLink[]; note: string; updated_at: string }
function rec(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
export function normalizeLinkWork(value: unknown): LinkWork | null {
  const raw = rec(value); if (!raw) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const links = (Array.isArray(raw.links) ? raw.links : []).flatMap((entry) => {
    const link = rec(entry); const label = typeof link?.label === "string" ? link.label.trim() : ""; const url = typeof link?.url === "string" ? link.url.trim() : "";
    try { const parsed = new URL(url); return label && parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash ? [{ label, url: parsed.href }] : []; } catch { return []; }
  });
  if (!id || !title || !links.length) return null;
  return { id, title, links, kind: raw.kind === "game" || raw.kind === "app" || raw.kind === "website" ? raw.kind : "other", note: typeof raw.note === "string" ? raw.note : "", updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date(0).toISOString() };
}
export function linkWorkFromLibraryItem(item: LibraryItem): LinkWork | null { return normalizeLinkWork(item.meta?.link_work); }
export function isLinkWorkItem(item: LibraryItem): boolean { return item.source === "creation" && Boolean(linkWorkFromLibraryItem(item)); }
export function linkWorkLibraryItem(work: LinkWork): LibraryItem { return { key: `link-work:${work.id}`, source: "creation", id: work.id, title: work.title, kind: work.kind === "game" || work.kind === "website" ? work.kind : "website", siteId: "", favorite: false, createdAt: work.updated_at, meta: { link_work: work } }; }
