"use client";

import { PDFDocument, degrees } from "pdf-lib";
import type { PdfPageOperation } from "./pdf-recovery";

/**
 * 页面整理的字节级操作（pdf-lib，MIT）。查看器引擎没有「写旋转 / 挪页」的接口，
 * 所以缩略图栏的旋转、排序、删页在这里改字节，再换回同一个查看器。
 */

const LOAD_OPTIONS = {
  ignoreEncryption: false,
  updateMetadata: false,
  parseSpeed: 25,
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
  return applyPdfPageOperations(bytes, [{ type: "rotate", pageIndex, degrees: clockwiseDegrees }]);
}

export async function movePdfPage(
  bytes: Uint8Array,
  fromIndex: number,
  toIndex: number,
): Promise<Uint8Array> {
  return applyPdfPageOperations(bytes, [{ type: "move", fromIndex, toIndex }]);
}

export async function deletePdfPage(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  return applyPdfPageOperations(bytes, [{ type: "delete", pageIndex }]);
}

/** Replay the page history in one parse/save, yielding while parsing and between batches. */
export async function applyPdfPageOperations(bytes: Uint8Array, operations: PdfPageOperation[]): Promise<Uint8Array> {
  if (!operations.length) return bytes;
  const document = await loadPdf(bytes);
  let changed = false;
  for (let index = 0; index < operations.length; index++) {
    const op = operations[index];
    if (op.type === "move") {
      assertPageIndex(document, op.fromIndex);
      assertPageIndex(document, op.toIndex);
      if (op.fromIndex === op.toIndex) continue;
      const page = document.getPage(op.fromIndex);
      document.removePage(op.fromIndex);
      document.insertPage(op.toIndex, page);
    } else {
      assertPageIndex(document, op.pageIndex);
      if (op.type === "rotate") {
        const page = document.getPage(op.pageIndex);
        page.setRotation(degrees(((page.getRotation().angle + op.degrees) % 360 + 360) % 360));
      } else {
        if (document.getPageCount() <= 1) throw new Error("PDF 至少需要保留一页");
        document.removePage(op.pageIndex);
      }
    }
    changed = true;
    if (index % 25 === 24) await new Promise<void>((done) => setTimeout(done, 0));
  }
  return changed ? savePdf(document) : copyBytes(bytes);
}


