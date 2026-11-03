import type { CompressionOutcome, PreparedImageDimensions } from "./image-compress";

// Local file bytes only. Nothing in this registry is serialized or sent to the server.
const preparations = new WeakMap<File, CompressionOutcome>();

export function rememberImagePreparation(outcome: CompressionOutcome): void {
  if (!outcome.compressed || outcome.original === outcome.upload) return;
  preparations.set(outcome.upload, outcome);
}

export function originalForPreparedFile(file: File | null | undefined): File | undefined {
  return file ? preparations.get(file)?.original : undefined;
}

export function dimensionsForPreparedFile(file: File | null | undefined): PreparedImageDimensions | undefined {
  const dimensions = file ? preparations.get(file)?.dimensions : undefined;
  if (!dimensions) return undefined;
  return [dimensions.originalWidth, dimensions.originalHeight, dimensions.width, dimensions.height]
    .every((value) => Number.isInteger(value) && value > 0) ? dimensions : undefined;
}

/** Native inbox filename deduplication clones the same bytes; keep its original choice. */
export function copyImagePreparation(source: File, clone: File): void {
  const prepared = preparations.get(source);
  if (!prepared || source.size !== clone.size || source.type !== clone.type) return;
  preparations.set(clone, { ...prepared, upload: clone, uploadBytes: clone.size });
}
