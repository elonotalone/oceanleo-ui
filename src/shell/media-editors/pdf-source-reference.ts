import type { LibraryItem } from "../library-data";
import { getArtifactItem } from "../artifact-client";

export interface PdfMediaReference {
  artifactId?: string;
  revisionId?: string;
  purpose?: string;
  url?: string;
}
export interface PdfSourceReference extends PdfMediaReference { blank: boolean }

/** Read identity only. The authenticated resolver checks access again; a ticket is never retained. */
export function pdfMediaReference(url: string): PdfMediaReference {
  try {
    const path = new URL(url).pathname;
    const ticket = /^\/v1\/artifact-renditions\/access\/([^/]+)$/.exec(path)?.[1];
    if (ticket && ticket.length < 8192 && ticket.includes(".")) {
      const base64 = ticket.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
      if (payload.v === 1 && typeof payload.artifact === "string" && typeof payload.revision === "string") {
        return { artifactId: payload.artifact, revisionId: payload.revision, purpose: String(payload.purpose || "source") };
      }
    }
  } catch { /* Ordinary stable URLs have no embedded artifact identity. */ }
  return { url };
}
export function pdfSourceReference(item: LibraryItem, url: string, blank: boolean): PdfSourceReference {
  if (blank) return { blank: true };
  const embedded = pdfMediaReference(url);
  if (embedded.artifactId) return { ...embedded, blank: false };
  const artifactId = item.artifactId || String(item.meta.artifact_id || "");
  const revisionId = item.revisionId || String(item.meta.revision_id || "");
  return artifactId && revisionId ? { artifactId, revisionId, purpose: "source", blank: false } : { url, blank: false };
}
export function samePdfSource(a: PdfSourceReference | null, b: PdfSourceReference): boolean {
  return Boolean(a && a.blank === b.blank && a.artifactId === b.artifactId && a.revisionId === b.revisionId && a.purpose === b.purpose && a.url === b.url);
}
export async function resolvePdfMedia(reference: PdfMediaReference, signal?: AbortSignal): Promise<string> {
  const ref = reference.url ? pdfMediaReference(reference.url) : reference;
  if (!ref.artifactId || !ref.revisionId) {
    if (!ref.url) throw new Error("PDF 加载失败");
    return ref.url;
  }
  const result = await getArtifactItem(ref.artifactId, ref.revisionId, signal);
  if (!result.ok || !result.data) throw new Error(result.error || "PDF 加载失败");
  const item = result.data;
  const purpose = ref.purpose as "source" | "full" | "preview" | undefined;
  const url = item.artifact?.renditions[purpose || "source"]?.url || String(item.meta.editor_source_url || "") || item.url;
  if (!url) throw new Error("PDF 加载失败");
  return url;
}
