"use client";

import { PDFDocument, degrees } from "pdf-lib";

const LOAD_OPTIONS = {
  ignoreEncryption: false,
  updateMetadata: false,
} as const;

function copyBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
}

async function savePdf(document: PDFDocument): Promise<Uint8Array> {
  return document.save({ useObjectStreams: true, objectsPerTick: 25 });
}

function assertPageIndex(document: PDFDocument, pageIndex: number): void {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= document.getPageCount()) {
    throw new Error("PDF 页码超出范围");
  }
}

export async function inspectPdf(bytes: Uint8Array): Promise<number> {
  const document = await loadPdf(bytes);
  return document.getPageCount();
}

export async function createBlankPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([595.28, 841.89]);
  document.setTitle("OceanLeo 空白 PDF");
  document.setCreator("OceanLeo");
  return savePdf(document);
}

export async function rotatePdfPage(
  bytes: Uint8Array,
  pageIndex: number,
  clockwiseDegrees: number,
): Promise<Uint8Array> {
  const document = await loadPdf(bytes);
  assertPageIndex(document, pageIndex);
  const page = document.getPage(pageIndex);
  const current = page.getRotation().angle;
  const normalized = ((current + clockwiseDegrees) % 360 + 360) % 360;
  page.setRotation(degrees(normalized));
  return savePdf(document);
}

export async function movePdfPage(
  bytes: Uint8Array,
  fromIndex: number,
  toIndex: number,
): Promise<Uint8Array> {
  const document = await loadPdf(bytes);
  assertPageIndex(document, fromIndex);
  assertPageIndex(document, toIndex);
  if (fromIndex === toIndex) return copyBytes(bytes);
  const page = document.getPage(fromIndex);
  document.removePage(fromIndex);
  document.insertPage(toIndex, page);
  return savePdf(document);
}

export async function deletePdfPage(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  const document = await loadPdf(bytes);
  assertPageIndex(document, pageIndex);
  if (document.getPageCount() <= 1) {
    throw new Error("PDF 至少需要保留一页");
  }
  document.removePage(pageIndex);
  return savePdf(document);
}

export async function addBlankPdfPage(
  bytes: Uint8Array,
  afterIndex: number,
): Promise<Uint8Array> {
  const document = await loadPdf(bytes);
  assertPageIndex(document, afterIndex);
  const source = document.getPage(afterIndex);
  const page = document.insertPage(afterIndex + 1, [source.getWidth(), source.getHeight()]);
  page.setRotation(source.getRotation());
  return savePdf(document);
}

export async function mergePdfBytes(
  bytes: Uint8Array,
  incomingBytes: Uint8Array,
  insertAfterIndex?: number,
): Promise<{ bytes: Uint8Array; insertedCount: number }> {
  const document = await loadPdf(bytes);
  const incoming = await loadPdf(incomingBytes);
  const incomingCount = incoming.getPageCount();
  if (incomingCount < 1) throw new Error("要合并的 PDF 没有页面");
  const copied = await document.copyPages(
    incoming,
    Array.from({ length: incomingCount }, (_, index) => index),
  );
  const after =
    insertAfterIndex == null
      ? document.getPageCount() - 1
      : Math.max(-1, Math.min(document.getPageCount() - 1, insertAfterIndex));
  copied.forEach((page, offset) => document.insertPage(after + 1 + offset, page));
  return { bytes: await savePdf(document), insertedCount: incomingCount };
}

export async function extractPdfPages(
  bytes: Uint8Array,
  pageIndices: readonly number[],
): Promise<Uint8Array> {
  const source = await loadPdf(bytes);
  if (pageIndices.length < 1) throw new Error("请至少选择一页");
  pageIndices.forEach((index) => assertPageIndex(source, index));
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, [...pageIndices]);
  pages.forEach((page) => output.addPage(page));
  const title = source.getTitle();
  if (title) output.setTitle(title);
  const author = source.getAuthor();
  if (author) output.setAuthor(author);
  return savePdf(output);
}
