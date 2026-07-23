"use client";

import { inspectPdf } from "./pdf-operations";
import { assertBlobSource } from "./source-integrity.mjs";

export function capturePdfRecovery(bytes: Uint8Array | null): Blob | null {
  return bytes
    ? new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
    : null;
}

export async function decodePdfRecovery(
  payload: unknown,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; pageCount: number } | null> {
  if (!(payload instanceof Blob) || payload.size > maxBytes) return null;
  try {
    await assertBlobSource(payload, "pdf");
    const bytes = new Uint8Array(await payload.arrayBuffer());
    const pageCount = await inspectPdf(bytes);
    return pageCount > 0 ? { bytes, pageCount } : null;
  } catch {
    return null;
  }
}
