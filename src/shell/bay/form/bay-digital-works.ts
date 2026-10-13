import type { BayServiceMediaKind } from "../../../lib/bay/seller";
import { kindFromUrl } from "./bay-typed-preview";

export type DigitalWorkRef = {
  id: string;
  title: string;
  kind?: "task" | "artifact";
  url?: string;
  thumbUrl?: string;
  bytes?: number;
};

export const BAY_WORK_CAPTION_PREFIX = "bay-work:";
/** 每个用户最多传到文件库的总量（与网关免费额度默认 20GiB 对齐）。 */
export const USER_UPLOAD_MAX_BYTES = 20 * 1024 * 1024 * 1024;

export function httpsWorkUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.startsWith("https://") ? text : undefined;
}

export function workIdFromCaption(caption: unknown): string | null {
  const text = typeof caption === "string" ? caption.trim() : "";
  if (!text.startsWith(BAY_WORK_CAPTION_PREFIX)) return null;
  const rest = text.slice(BAY_WORK_CAPTION_PREFIX.length).trim();
  const id = rest.split("|")[0]?.trim() || "";
  return id || null;
}

export function workTitleFromCaption(caption: unknown): string {
  const text = typeof caption === "string" ? caption.trim() : "";
  if (!text.startsWith(BAY_WORK_CAPTION_PREFIX)) return "";
  const rest = text.slice(BAY_WORK_CAPTION_PREFIX.length);
  const pipe = rest.indexOf("|");
  if (pipe < 0) return "";
  return rest.slice(pipe + 1).trim();
}

export function isBayWorkCaption(caption: unknown): boolean {
  return Boolean(workIdFromCaption(caption));
}

export function workCaptionFor(id: string, title?: string): string {
  const cleanTitle = (title || "").replace(/\|/g, " ").trim();
  return cleanTitle ? `${BAY_WORK_CAPTION_PREFIX}${id}|${cleanTitle}` : `${BAY_WORK_CAPTION_PREFIX}${id}`;
}

export function mediaKindForWork(
  work: Pick<DigitalWorkRef, "url" | "title">,
  libraryKind?: string,
): BayServiceMediaKind {
  if (libraryKind === "image") return "image";
  if (libraryKind === "video" || libraryKind === "video_canvas") return "video";
  if (libraryKind === "audio") return "audio";
  const fromUrl = kindFromUrl(work.url || work.title || "");
  if (fromUrl === "image" || fromUrl === "video" || fromUrl === "audio") return fromUrl;
  return "file";
}

function titleFromUrl(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    const path = new URL(url).pathname;
    const base = decodeURIComponent(path.split("/").pop() || "");
    return base.trim() || fallback;
  } catch {
    return fallback;
  }
}

export function normalizeDigitalWorks(works: readonly DigitalWorkRef[]): DigitalWorkRef[] {
  const seen = new Set<string>();
  const out: DigitalWorkRef[] = [];
  for (const work of works) {
    const id = typeof work?.id === "string" ? work.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const url = httpsWorkUrl(work.url);
    const thumbUrl = httpsWorkUrl(work.thumbUrl);
    const title = typeof work.title === "string" && work.title.trim() ? work.title.trim() : titleFromUrl(url, id);
    const bytes = typeof work.bytes === "number" && Number.isFinite(work.bytes) && work.bytes > 0 ? work.bytes : undefined;
    out.push({
      id,
      title,
      kind: work.kind === "artifact" ? "artifact" : work.kind === "task" ? "task" : undefined,
      ...(url ? { url } : {}),
      ...(thumbUrl ? { thumbUrl } : {}),
      ...(bytes ? { bytes } : {}),
    });
  }
  return out;
}

export function bytesOfWork(work: Pick<DigitalWorkRef, "bytes">): number {
  return typeof work.bytes === "number" && Number.isFinite(work.bytes) && work.bytes > 0 ? work.bytes : 0;
}

export function totalWorkBytes(works: readonly Pick<DigitalWorkRef, "bytes">[]): number {
  return works.reduce((sum, work) => sum + bytesOfWork(work), 0);
}

export function applyDigitalWorks(works: readonly DigitalWorkRef[]): {
  digitalWork: DigitalWorkRef | null;
  digitalWorks: DigitalWorkRef[];
} {
  const digitalWorks = normalizeDigitalWorks(works);
  return { digitalWork: digitalWorks[0] || null, digitalWorks };
}

export type WorkMediaRow = {
  caption?: string | null;
  url?: string | null;
  kind?: string | null;
  position?: number | null;
  poster_url?: string | null;
};

export function digitalWorksFromLoaded(input: {
  digitalWork?: DigitalWorkRef | null;
  media?: readonly WorkMediaRow[] | null;
}): DigitalWorkRef[] {
  const first = input.digitalWork && typeof input.digitalWork.id === "string" && input.digitalWork.id.trim()
    ? input.digitalWork
    : null;
  const rows = [...(input.media || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
  const extras: DigitalWorkRef[] = [];
  for (const row of rows) {
    const id = workIdFromCaption(row.caption);
    if (!id) continue;
    extras.push({
      id,
      title: workTitleFromCaption(row.caption) || titleFromUrl(httpsWorkUrl(row.url), id),
      kind: "artifact",
      url: httpsWorkUrl(row.url),
      thumbUrl: httpsWorkUrl(row.poster_url),
    });
  }
  return normalizeDigitalWorks(first ? [first, ...extras] : extras);
}
