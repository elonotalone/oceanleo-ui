export type UserAttachment = { name: string; mime: string; preview?: string };

const RASTER = /^image\/(png|jpeg|gif|webp)$/i;
const MAX_PREVIEW = 128 * 1024;

export function safeImagePreview(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_PREVIEW) return undefined;
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value) ? value : undefined;
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
    return [{ name, mime, ...(preview ? { preview } : {}) }];
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
