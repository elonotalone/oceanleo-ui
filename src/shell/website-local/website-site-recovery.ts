/** Portable recovery keeps replacement bytes beside their document paths. */
import { isSiteDoc, siteImagePaths, type SiteDoc } from "./website-site-doc";
import { validateSiteImage } from "./website-site-files";

interface DraftImage {
  path: string;
  name: string;
  type: string;
  modified: number;
  bytes: string;
}

export async function captureSiteDraft(doc: SiteDoc, images: ReadonlyMap<string, File>) {
  const named = new Set(siteImagePaths(doc));
  const files: DraftImage[] = await Promise.all([...images].filter(([path]) => named.has(path)).map(async ([path, file]) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let start = 0; start < bytes.length; start += 8192) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    }
    return { path, name: file.name, type: file.type, modified: file.lastModified, bytes: btoa(binary) };
  }));
  return { doc, images: files };
}

/** Validate the complete payload before mutating the current editor. */
export function restoreSiteDraft(payload: unknown): { doc: SiteDoc; images: Map<string, File> } | null {
  const draft = payload as { doc?: unknown; images?: unknown } | null;
  if (!isSiteDoc(draft?.doc)) return null;
  const images = new Map<string, File>();
  if (draft.images !== undefined && !Array.isArray(draft.images)) return null;
  try {
    for (const image of (draft.images || []) as DraftImage[]) {
      if (!/^images\/[A-Za-z0-9._-]{1,200}$/.test(image.path) || image.path.includes("..")) return null;
      if (typeof image.bytes !== "string" || image.bytes.length > 12_000_000) return null;
      const binary = atob(image.bytes);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const file = new File([bytes], image.name, { type: image.type, lastModified: image.modified });
      if (validateSiteImage(file)) return null;
      images.set(image.path, file);
    }
    return { doc: draft.doc, images };
  } catch {
    return null;
  }
}
