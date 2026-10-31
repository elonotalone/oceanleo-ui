import type { ArchivedAttachment } from "./types";
export type UserAttachment = { archive?: ArchivedAttachment; name: string; mime: string; preview?: string; path?: string };

function inboxPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.trim();
  if (!path.startsWith("/") || path.includes("\0") || path.includes("://")) return undefined;
  return path.slice(0, 500);
}

const RASTER = /^image\/(png|jpeg|gif|webp)$/i;
const MAX_PREVIEW = 128 * 1024;

export function safeImagePreview(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_PREVIEW) return undefined;
  if (isLocalBlobPreview(value)) return value;
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value) ? value : undefined;
}

/**
 * A `blob:` object URL this tab made from a file the user just picked. Only
 * this document can resolve it, so it is a local thumbnail, never a storage
 * address (2026-10-31 W1: native image attachments show the picture).
 */
export function isLocalBlobPreview(value: unknown): value is string {
  return typeof value === "string" && value.length <= 300
    && /^blob:(?:https?:\/\/[A-Za-z0-9.:[\]-]+|null)\/[A-Za-z0-9-]{8,64}$/.test(value);
}

/**
 * Server rows (with `archive`) replace the optimistic echo, but keep the local
 * thumbnail of the same file (matched by inbox path, then by position+name).
 */
export function mergeLocalPreviews(server: UserAttachment[], local: UserAttachment[] | undefined): UserAttachment[] {
  if (!local?.length) return server;
  return server.map((item, index) => {
    if (item.preview) return item;
    const twin = (item.path ? local.find((row) => row.path === item.path) : undefined)
      ?? (local[index]?.name === item.name ? local[index] : undefined);
    return twin?.preview ? { ...item, preview: twin.preview } : item;
  });
}

export function userAttachments(raw: unknown): UserAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 32).flatMap((item): UserAttachment[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const mime = typeof row.mime === "string" ? row.mime.slice(0, 100) : "";
    const name = typeof row.name === "string" ? row.name.slice(0, 200) : "";
    if (!name) return [];
    const preview = safeImagePreview(row.preview);
    const path = inboxPath(row.path);
    const archive = safeArchivedAttachment(row.archive);
    return [{ name, mime, ...(archive ? { archive } : {}), ...(preview ? { preview } : {}), ...(path ? { path } : {}) }];
  });
}

// Some adapters return a serialized content block as a text chunk. Interpret
// only recognizable image payloads; normal JSON, code and prose remain text.
export function normalizeUserMessage(text: string, rawAttachments?: unknown): { text: string; attachments: UserAttachment[] } {
  const attachments = userAttachments(rawAttachments);
  text = text.replace(/\[(?:@?image|图片)\]\((data:image\/[^;\s)]+;base64,[A-Za-z0-9+/]+={0,2})(?:\)|…?$)/gi, (_match, uri: string) => {
    const mime = uri.slice(5, uri.indexOf(";"));
    const preview = safeImagePreview(uri);
    attachments.push({ name: "图片", mime, ...(preview ? { preview } : {}) });
    return "";
  });
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { text, attachments }; }
  const blocks = Array.isArray(parsed) ? parsed : [parsed];
  const texts: string[] = [];
  const images: UserAttachment[] = [];
  for (const item of blocks) {
    if (!item || typeof item !== "object") return { text, attachments };
    const block = item as Record<string, unknown>;
    if (block.type === "text" && typeof block.text === "string") { texts.push(block.text); continue; }
    if (block.type !== "image" && block.type !== "image_url") return { text, attachments };
    const source = block.source && typeof block.source === "object" ? block.source as Record<string, unknown> : block;
    const mime = typeof source.media_type === "string" ? source.media_type : typeof block.mimeType === "string" ? block.mimeType : "image/*";
    const data = typeof source.data === "string" ? source.data : "";
    const imageUrl = block.image_url && typeof block.image_url === "object" ? (block.image_url as Record<string, unknown>).url : block.image_url;
    if (!data && typeof imageUrl !== "string") return { text, attachments };
    const preview = RASTER.test(mime) ? safeImagePreview(`data:${mime};base64,${data}`) : safeImagePreview(imageUrl);
    images.push({ name: "图片", mime, ...(preview ? { preview } : {}) });
  }
  if (!images.length) return { text, attachments };
  return { text: texts.join(""), attachments: [...attachments, ...images] };
}

// Only owner-checked attachment routes are allowed; arbitrary URLs stay inert text.
export function safeArchivedAttachment(raw: unknown): ArchivedAttachment | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.mime !== "string" || typeof row.size !== "number" || typeof row.download_path !== "string") return undefined;
  if (!/^\/v1\/computer-task-sessions\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}$/.test(row.download_path)) return undefined;
  // The private Library upload the gateway registered for this file (opens the Library at it).
  const artifactId = typeof row.artifact_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.artifact_id)
    ? row.artifact_id : "";
  return { id: row.id, name: row.name.slice(0, 200), mime: row.mime.slice(0, 100), size: row.size, download_path: row.download_path,
    ...(artifactId ? { artifact_id: artifactId } : {}) };
}
