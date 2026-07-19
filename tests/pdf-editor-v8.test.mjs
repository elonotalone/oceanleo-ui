import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { PDFDocument } from "pdf-lib";
import {
  addPdfTextAnnotationAt,
  listPdfAnnotations,
  movePdfAnnotation,
} from "../src/shell/media-editors/pdf-annotation-operations.ts";
import {
  deletePdfPage,
  extractPdfPages,
  inspectPdf,
  movePdfPage,
  rotatePdfPage,
} from "../src/shell/media-editors/pdf-operations.ts";
import {
  appendPdfHistory,
} from "../src/shell/media-editors/pdf-workbench-utils.ts";

async function threePagePdf() {
  const document = await PDFDocument.create();
  for (const [index, [width, height]] of [
    [200, 300],
    [300, 400],
    [400, 500],
  ].entries()) {
    const page = document.addPage([width, height]);
    page.setCropBox(10 + index, 20 + index, width - 30, height - 50);
  }
  return document.save();
}

test("PDF text actions are icon+tooltip controls and unsupported crop is hidden", async () => {
  const [route, controls, toolbar, operations] = await Promise.all([
    readFile(resolve("src/shell/advanced-routes/PdfRoute.tsx"), "utf8"),
    readFile(resolve("src/shell/media-editors/PdfControls.tsx"), "utf8"),
    readFile(
      resolve("src/shell/media-editors/PdfContextToolbar.tsx"),
      "utf8",
    ),
    readFile(
      resolve("src/shell/media-editors/pdf-operations.ts"),
      "utf8",
    ),
  ]);
  assert.match(controls, /iconOnly/);
  assert.match(controls, /title=\{tt\("添加空白页"\)\}/);
  assert.match(toolbar, /iconOnly:\s*true/g);
  assert.match(toolbar, /label:\s*tt\("顺时针旋转 90°"\)/);
  assert.match(toolbar, /icon:\s*"download"/);
  assert.doesNotMatch(toolbar, /id:\s*"crop"/);
  assert.doesNotMatch(operations, /cropPdfPage|setCropBox/);
  assert.match(route, /history:\s*\{[\s\S]*undo:\s*editor\.undo/);
  assert.match(route, /directDownload:[\s\S]*onTrigger:\s*editor\.download/);
  assert.match(route, /capture:\s*editor\.captureRecovery/);
  assert.match(route, /restore:\s*editor\.restoreRecovery/);
});

test("page and annotation mutations persist through undo, reopen, extract and export", async () => {
  const original = await threePagePdf();
  let bytes = await rotatePdfPage(original, 0, 90);
  bytes = await movePdfPage(bytes, 0, 2);

  const annotated = await addPdfTextAnnotationAt(
    bytes,
    2,
    "最终批注",
    { x: 0.25, y: 0.4 },
  );
  bytes = await movePdfAnnotation(
    annotated.bytes,
    2,
    annotated.id,
    { x: 0.55, y: 0.6, width: 0.1, height: 0.08 },
  );

  const exported = await (await PDFDocument.load(bytes)).save();
  const reopened = await PDFDocument.load(exported);
  assert.equal(reopened.getPageCount(), 3);
  assert.deepEqual(
    reopened.getPages().map((page) => [page.getWidth(), page.getHeight()]),
    [
      [300, 400],
      [400, 500],
      [200, 300],
    ],
  );
  assert.equal(reopened.getPage(2).getRotation().angle, 90);
  assert.deepEqual(reopened.getPage(2).getCropBox(), {
    x: 10,
    y: 20,
    width: 170,
    height: 250,
  });
  const [annotation] = await listPdfAnnotations(exported, 2);
  assert.equal(annotation.contents, "最终批注");
  assert.ok(Math.abs(annotation.rect.x - 0.55) < 0.003);
  assert.ok(Math.abs(annotation.rect.y - 0.6) < 0.003);

  const extracted = await extractPdfPages(exported, [2]);
  assert.equal(await inspectPdf(extracted), 1);
  const extractedDoc = await PDFDocument.load(extracted);
  assert.equal(extractedDoc.getPage(0).getRotation().angle, 90);
  assert.deepEqual(extractedDoc.getPage(0).getCropBox(), {
    x: 10,
    y: 20,
    width: 170,
    height: 250,
  });
  assert.equal((await listPdfAnnotations(extracted, 0))[0].contents, "最终批注");

  const deleted = await deletePdfPage(exported, 1);
  assert.equal(await inspectPdf(deleted), 2);

  const undo = appendPdfHistory([], {
    bytes: Uint8Array.from(original),
    pageNumber: 1,
    pageCount: 3,
  });
  const redo = appendPdfHistory([], {
    bytes: Uint8Array.from(exported),
    pageNumber: 3,
    pageCount: 3,
  });
  assert.equal((await PDFDocument.load(undo[0].bytes)).getPage(0).getRotation().angle, 0);
  assert.equal((await PDFDocument.load(redo[0].bytes)).getPage(2).getRotation().angle, 90);
  assert.equal((await listPdfAnnotations(redo[0].bytes, 2))[0].contents, "最终批注");
});
