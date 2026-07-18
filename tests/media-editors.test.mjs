import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  addBlankPdfPage,
  deletePdfPage,
  extractPdfPages,
  inspectPdf,
  mergePdfBytes,
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

test("PDF operations rotate, reorder, delete and add pages without mutating input", async () => {
  const original = await makePdf([
    [300, 500],
    [400, 500],
    [500, 500],
  ]);
  const snapshot = Uint8Array.from(original);

  const rotated = await rotatePdfPage(original, 1, 90);
  const rotatedDocument = await PDFDocument.load(rotated);
  assert.equal(rotatedDocument.getPage(1).getRotation().angle, 90);

  const moved = await movePdfPage(rotated, 0, 2);
  assert.deepEqual(await pageWidths(moved), [400, 500, 300]);

  const removed = await deletePdfPage(moved, 1);
  assert.deepEqual(await pageWidths(removed), [400, 300]);

  const withBlank = await addBlankPdfPage(removed, 0);
  assert.deepEqual(await pageWidths(withBlank), [400, 400, 300]);
  assert.equal(await inspectPdf(withBlank), 3);
  assert.deepEqual(original, snapshot);
});

test("PDF operations merge and extract selected pages in requested order", async () => {
  const base = await makePdf([
    [300, 500],
    [400, 500],
  ]);
  const incoming = await makePdf([
    [600, 500],
    [700, 500],
  ]);
  const merged = await mergePdfBytes(base, incoming, 0);
  assert.equal(merged.insertedCount, 2);
  assert.deepEqual(await pageWidths(merged.bytes), [300, 600, 700, 400]);

  const extracted = await extractPdfPages(merged.bytes, [2, 0]);
  assert.deepEqual(await pageWidths(extracted), [700, 300]);

  const onePage = await makePdf([[300, 500]]);
  await assert.rejects(() => deletePdfPage(onePage, 0), /至少需要保留一页/);
});

test("media editor public API and lifecycle hardening remain wired", () => {
  const index = source("../src/shell/media-editors/index.ts");
  const pdfHook = source("../src/shell/media-editors/use-pdf-workbench.ts");
  const pdfPreviewHook = source(
    "../src/shell/media-editors/use-pdf-preview-render.ts",
  );
  const modelHook = source("../src/shell/media-editors/use-model3d-workbench.ts");
  const modelSave = source("../src/shell/media-editors/use-model3d-save.ts");
  const modelProject = source("../src/shell/media-editors/model3d-project.ts");
  const modelFiles = source("../src/shell/media-editors/model3d-files.ts");

  for (const api of [
    "usePdfWorkbench",
    "PdfControls",
    "PdfStage",
    "PdfWorkbench",
    "useModel3DWorkbench",
    "Model3DControls",
    "Model3DStage",
    "Model3DWorkbench",
    "useThreeDWorkbench",
    "ThreeDControls",
    "ThreeDStage",
  ]) {
    assert.match(index, new RegExp(`\\b${api}\\b`));
  }
  assert.match(pdfHook, /new AbortController\(\)/);
  assert.match(pdfPreviewHook, /renderTask\?\.cancel\(\)/);
  assert.match(pdfPreviewHook, /document\.createElement\("canvas"\)/);
  assert.match(pdfHook, /saveFileToLibrary/);
  assert.match(pdfHook, /deliveryProjectSchema: "pdf-binary@1"/);
  assert.match(modelHook, /import\("@google\/model-viewer"\)/);
  assert.match(modelHook, /downloadAbortRef\.current\?\.abort\(\)/);
  assert.match(modelHook, /useModel3DSave/);
  assert.match(modelSave, /persistModel3DProject/);
  assert.match(modelProject, /saveProjectWorkingHead/);
  assert.match(modelProject, /workingHeadUrl: sourceUrl/);
  assert.match(modelProject, /preserved-source-closure/);
  assert.doesNotMatch(modelProject, /fetchMediaBlob|new File\(\[modelBlob\]/);
  assert.doesNotMatch(modelSave, /captureBlob|uploadFile/);
  assert.match(modelFiles, /依赖本地纹理或 \.bin 文件/);
  assert.equal(
    (modelHook.match(/Number\(saved\.data\?\.saved \|\| 0\) !== 1/g) || []).length,
    1,
  );
});

test("each media editor source file stays below the 600-line component limit", () => {
  const directory = new URL("../src/shell/media-editors/", import.meta.url);
  const taskFiles = new Set([
    "Model3DControls.tsx",
    "Model3DStage.tsx",
    "Model3DWorkbench.tsx",
    "PdfControls.tsx",
    "PdfStage.tsx",
    "PdfWorkbench.tsx",
    "index.ts",
    "pdf-operations.ts",
    "use-model3d-workbench.ts",
    "use-pdf-preview-render.ts",
    "use-pdf-workbench.ts",
  ]);
  for (const filename of readdirSync(directory)) {
    if (!taskFiles.has(filename)) continue;
    const lines = readFileSync(new URL(filename, directory), "utf8").split("\n").length;
    assert.ok(lines < 600, `${filename} has ${lines} lines`);
  }
});
