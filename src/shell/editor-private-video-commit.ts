/** Untrusted private-staging hints; server owner/bucket/hash checks are final. */
export interface PrivateEditorBlob {
  blobId: string;
  digest: string;
  mediaType: string;
  byteSize: number;
}

export interface PrivateVideoBlobCommit {
  source: PrivateEditorBlob;
  preview: PrivateEditorBlob;
}

const PRIVATE_LOCATOR = /^project-assets:u\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[A-Za-z0-9._~/-]+$/i;
const DIGEST = /^[0-9a-f]{64}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function blob(value: unknown, mediaType: string): PrivateEditorBlob | null {
  const raw = record(value);
  if (!raw || Object.keys(raw).sort().join(",") !== "blobId,byteSize,digest,mediaType") return null;
  const { blobId, digest, byteSize } = raw;
  if (
    typeof blobId !== "string" || blobId.length > 940 || !PRIVATE_LOCATOR.test(blobId) ||
    blobId.split("/").some((part) => !part || part === "." || part === "..") ||
    typeof digest !== "string" || !DIGEST.test(digest) ||
    raw.mediaType !== mediaType ||
    typeof byteSize !== "number" || !Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > 20 * 1024 * 1024
  ) return null;
  return { blobId, digest, mediaType, byteSize };
}

export function privateVideoBlobCommit(value: unknown): PrivateVideoBlobCommit | null {
  const meta = record(value);
  const raw = record(meta?.private_blob_commit);
  if (
    !meta || meta.requires_typed_artifact_commit !== true ||
    meta.artifact_type !== "workflow" || meta.source_format !== "oceanleo.video.project.v2" ||
    !raw || Object.keys(raw).sort().join(",") !== "preview,source"
  ) return null;
  const source = blob(raw.source, "application/json");
  const preview = blob(raw.preview, "image/png");
  if (!source || !preview || source.blobId.split("/")[1] !== preview.blobId.split("/")[1]) return null;
  return { source, preview };
}
