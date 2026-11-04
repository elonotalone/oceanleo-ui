import { PRIVATE_ATTACHMENT_MAX_BYTES, resolveAttachmentDisplayUrl } from "../lib/attachment-url";
import type { ComposerAttachment } from "./LeoComposer";
import type { LibraryItem } from "./library-data";

/** Immutable private identity and integrity metadata selected by the user. */
export type NativeLibrarySource = {
  artifactId?: string;
  revisionId?: string;
  name?: string;
  mime?: string;
  byteSize?: number | null;
  digest?: string | null;
  metadataMismatch?: boolean;
};

export function nativeLibrarySourceOf(item: ComposerAttachment): NativeLibrarySource {
  const selected = item as ComposerAttachment & { artifactId?: string; revisionId?: string; libraryItem?: LibraryItem };
  const artifact = selected.libraryItem?.artifact;
  const source = artifact?.renditions?.source;
  return {
    artifactId: selected.artifactId, revisionId: selected.revisionId, name: selected.name, mime: selected.mime,
    byteSize: source?.byteSize, digest: source?.digest,
    metadataMismatch: Boolean(artifact && (artifact.artifactId !== selected.artifactId || artifact.revisionId !== selected.revisionId || (source?.revisionId && source.revisionId !== selected.revisionId))),
  };
}

export class NativeLibraryReadError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, status?: number) {
    super(code);
    this.name = "NativeLibraryReadError";
    this.code = code;
    this.status = status;
  }
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

/** Private source bytes only; display/preview URLs never substitute for source. */
export async function readNativeLibraryFile(source: NativeLibrarySource, { signal }: { signal?: AbortSignal } = {}): Promise<File> {
  checkAbort(signal);
  if (typeof source.artifactId !== "string" || !source.artifactId.trim() || typeof source.revisionId !== "string" || !source.revisionId.trim()) throw new NativeLibraryReadError("invalid-reference");
  if (source.metadataMismatch) throw new NativeLibraryReadError("reference-mismatch");
  if (source.byteSize != null && (!Number.isSafeInteger(source.byteSize) || source.byteSize < 0)) throw new NativeLibraryReadError("invalid-source-size");
  if ((source.byteSize ?? 0) > PRIVATE_ATTACHMENT_MAX_BYTES) throw new NativeLibraryReadError("source-too-large");
  if (source.digest != null && typeof source.digest !== "string") throw new NativeLibraryReadError("invalid-source-digest");
  const digest = source.digest?.replace(/^sha256:/i, "").toLowerCase();
  if (digest && !/^[a-f0-9]{64}$/.test(digest)) throw new NativeLibraryReadError("invalid-source-digest");
  // Grant lookup is shared/cached by attachment-url. Cancelling this selection
  // must not abort another consumer's lookup; ignore its late result instead.
  let url: string | undefined;
  try { url = await resolveAttachmentDisplayUrl({ artifactId: source.artifactId, revisionId: source.revisionId }, "source"); }
  catch { checkAbort(signal); throw new NativeLibraryReadError("source-unavailable"); }
  checkAbort(signal);
  if (!url) throw new NativeLibraryReadError("source-unavailable");
  let response: Response;
  try { response = await fetch(url, { signal }); }
  catch (error) { checkAbort(signal); throw new NativeLibraryReadError("source-unavailable"); }
  if (!response.ok) throw new NativeLibraryReadError("source-http-error", response.status);
  let blob: Blob;
  try { blob = await response.blob(); }
  catch { checkAbort(signal); throw new NativeLibraryReadError("source-read-error"); }
  checkAbort(signal);
  if (blob.size > PRIVATE_ATTACHMENT_MAX_BYTES) throw new NativeLibraryReadError("source-too-large");
  if (source.byteSize != null && source.byteSize !== blob.size) throw new NativeLibraryReadError("source-size-mismatch");
  const contentLength = response.headers.get("content-length");
  const encoding = response.headers.get("content-encoding");
  if (contentLength !== null && (!encoding || encoding === "identity") && Number(contentLength) !== blob.size) throw new NativeLibraryReadError("http-size-mismatch");
  if (digest) {
    const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    checkAbort(signal);
    if (Array.from(actual, (value) => value.toString(16).padStart(2, "0")).join("") !== digest) throw new NativeLibraryReadError("source-digest-mismatch");
  }
  return new File([blob], source.name || "file", { type: source.mime || blob.type || "application/octet-stream" });
}
