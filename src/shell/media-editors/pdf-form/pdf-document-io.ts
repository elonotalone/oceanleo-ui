import { PDFDocument } from "pdf-lib";

const LOAD_OPTIONS = {
  ignoreEncryption: false,
  updateMetadata: false,
} as const;

export async function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(Uint8Array.from(bytes), LOAD_OPTIONS);
}

export async function savePdfDocument(document: PDFDocument): Promise<Uint8Array> {
  return document.save({ useObjectStreams: true, objectsPerTick: 25 });
}
