import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  deletePdfPage,
  inspectPdf,
  movePdfPage,
  rotatePdfPage,
} from "../src/shell/media-editors/pdf-operations.ts";

async function makePdf(sizes) {
  const document = await PDFDocument.create();
  for (const size of sizes) document.addPage(size);
  return document.save();
}

async function pageWidths(bytes) {
  const document = await PDFDocument.load(bytes);
  return document.getPages().map((page) => page.getWidth());
}

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

// 10-23 D4：页面整理只剩旋转（写进文件）、排序、删页；插空白页、合并、提取页已删。
test("PDF operations rotate, reorder and delete pages without mutating input", async () => {
  const original = await makePdf([
    [300, 500],
    [400, 500],
    [500, 500],
  ]);
  const snapshot = Uint8Array.from(original);

  const rotated = await rotatePdfPage(original, 1, 90);
  const rotatedDocument = await PDFDocument.load(rotated);
  assert.equal(rotatedDocument.getPage(1).getRotation().angle, 90);
  const back = await rotatePdfPage(rotated, 1, -90);
  assert.equal((await PDFDocument.load(back)).getPage(1).getRotation().angle, 0);

  const moved = await movePdfPage(rotated, 0, 2);
  assert.deepEqual(await pageWidths(moved), [400, 500, 300]);

  const removed = await deletePdfPage(moved, 1);
  assert.deepEqual(await pageWidths(removed), [400, 300]);
  assert.equal(await inspectPdf(removed), 2);
  assert.deepEqual(original, snapshot);

  const onePage = await makePdf([[300, 500]]);
  await assert.rejects(() => deletePdfPage(onePage, 0), /至少需要保留一页/);
  await assert.rejects(() => rotatePdfPage(onePage, 3, 90), /页码超出范围/);
});

test("each media editor source file stays below the 600-line component limit", () => {
  const directory = new URL("../src/shell/media-editors/", import.meta.url);
  const taskFiles = new Set([
    "AudioWorkbench.tsx",
    "AudioWorkbenchView.tsx",
    "Model3DControls.tsx",
    "use-model3d-selection-adapter.ts",
    "use-audio-selection-adapter.ts",
    "Model3DStage.tsx",
    "Model3DWorkbench.tsx",
    "PdfControls.tsx",
    "PdfStage.tsx",
    "PdfWorkbench.tsx",
    "index.ts",
    "audio-workbench-state.ts",
    "audio-workbench-utils.ts",
    "pdf-operations.ts",
    "use-audio-persistence.ts",
    "use-model3d-media-actions.ts",
    "use-model3d-runtime.ts",
    "use-model3d-save.ts",
    "use-model3d-sidecar.ts",
    "use-model3d-workbench.ts",
    "use-pdf-workbench.ts",
    // 10-23 D4 单实例 PDF 编辑器的新文件，一并守 600 行。
    "PdfFindBar.tsx",
    "pdf-selection-controls.ts",
    "use-pdf-selection-adapter.ts",
    "PdfToolPalette.tsx",
    "PdfSignatureDialog.tsx",
    "pdf-cjk-appearance.ts",
    "pdf-command-surface.ts",
    "pdf-mark-tools.ts",
    "pdf-signature-store.ts",
    "pdf-viewer-bridge.ts",
    "pdf-viewer-config.ts",
  ]);
  for (const filename of readdirSync(directory)) {
    if (!taskFiles.has(filename)) continue;
    const lines = readFileSync(new URL(filename, directory), "utf8").split("\n").length;
    assert.ok(lines < 600, `${filename} has ${lines} lines`);
  }
});
