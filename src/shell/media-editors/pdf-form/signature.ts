import { appendPdfAnnotation } from "../pdf-annotation-operations";
import type { PdfVisualRect } from "../pdf-annotation-operations";
import { loadPdfDocument, savePdfDocument } from "./pdf-document-io";
import type { PdfSavedSignature } from "./types";

const STORAGE_KEY = "oceanleo.pdf.saved-signatures.v1";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }
  return out;
}

export const SIGNATURE_IMAGE_LABEL = "图像签章";
export const SIGNATURE_NOT_PKI =
  "这是图像签章，不是具有法律效力的数字签名（PKI）。";

export function loadSavedSignatures(): PdfSavedSignature[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PdfSavedSignature[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedSignatures(entries: PdfSavedSignature[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 12)));
}

export function createSavedSignature(
  label: string,
  pngBytes: Uint8Array,
): PdfSavedSignature {
  return {
    id: `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: label.trim().slice(0, 40) || SIGNATURE_IMAGE_LABEL,
    pngBase64: bytesToBase64(pngBytes),
    createdAt: Date.now(),
  };
}

export function signaturePngBytes(entry: PdfSavedSignature): Uint8Array {
  return base64ToBytes(entry.pngBase64);
}

export async function placeImageSignature(
  bytes: Uint8Array,
  pageIndex: number,
  rect: PdfVisualRect,
  pngBytes: Uint8Array,
): Promise<Uint8Array> {
  const document = await loadPdfDocument(bytes);
  await appendPdfAnnotation(document, pageIndex, {
    kind: "stamp",
    rect,
    contents: SIGNATURE_IMAGE_LABEL,
    stampImage: { bytes: pngBytes, mediaType: "image/png" },
  });
  return savePdfDocument(document);
}

/** 骑缝章：跨页边缘各贴一条窄条图像签章。 */
export async function placeCrossPageSeal(
  bytes: Uint8Array,
  pngBytes: Uint8Array,
  edge: "left" | "right" = "right",
): Promise<Uint8Array> {
  const document = await loadPdfDocument(bytes);
  const pageCount = document.getPageCount();
  if (pageCount < 2) {
    throw new Error("骑缝章至少需要两页");
  }
  const stripWidth = 0.04;
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const x = edge === "right" ? 1 - stripWidth : 0;
    await appendPdfAnnotation(document, pageIndex, {
      kind: "stamp",
      rect: { x, y: 0.35, width: stripWidth, height: 0.3 },
      contents: SIGNATURE_IMAGE_LABEL,
      stampImage: { bytes: pngBytes, mediaType: "image/png" },
    });
  }
  return savePdfDocument(document);
}
