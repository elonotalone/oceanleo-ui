import assert from "node:assert/strict";
import test from "node:test";

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  degrees,
} from "pdf-lib";
import {
  addPdfHighlightAnnotation,
  addPdfTextAnnotationAt,
  deletePdfAnnotation,
  listPdfAnnotations,
  movePdfAnnotation,
  pdfPageGeometry,
  pdfPointToVisual,
  updatePdfAnnotation,
  visualPointToPdf,
} from "../src/shell/media-editors/pdf-annotation-operations.ts";
import { appendPdfHistory } from "../src/shell/media-editors/pdf-workbench-utils.ts";

async function blankPdf(rotation = 0) {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  page.setRotation(degrees(rotation));
  return document.save();
}

async function croppedPdf(rotation = 0) {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  page.setCropBox(100, 200, 300, 400);
  page.setRotation(degrees(rotation));
  return document.save();
}

function close(actual, expected, tolerance = 0.002) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`,
  );
}

const VISUAL_CORNERS = [
  { name: "top-left", x: 0, y: 0 },
  { name: "top-right", x: 1, y: 0 },
  { name: "bottom-right", x: 1, y: 1 },
  { name: "bottom-left", x: 0, y: 1 },
];

function rectAtCorner(corner, width, height) {
  return {
    x: corner.x === 0 ? 0 : 1 - width,
    y: corner.y === 0 ? 0 : 1 - height,
    width,
    height,
  };
}

function assertRectAtCorner(rect, corner, tolerance = 0.003) {
  close(rect.x, corner.x === 0 ? 0 : 1 - rect.width, tolerance);
  close(rect.y, corner.y === 0 ? 0 : 1 - rect.height, tolerance);
}

async function assertAnnotationRectsInsideCrop(bytes, expectedCount) {
  const document = await PDFDocument.load(bytes);
  const page = document.getPage(0);
  const crop = page.getCropBox();
  const annotations = page.node.Annots();
  assert.equal(annotations?.size() || 0, expectedCount);
  if (!annotations) return;
  for (let index = 0; index < annotations.size(); index += 1) {
    const dictionary = document.context.lookup(
      annotations.get(index),
      PDFDict,
    );
    const rect = dictionary
      .lookup(PDFName.of("Rect"), PDFArray)
      .asRectangle();
    assert.ok(rect.x >= crop.x - 0.0001);
    assert.ok(rect.y >= crop.y - 0.0001);
    assert.ok(rect.x + rect.width <= crop.x + crop.width + 0.0001);
    assert.ok(rect.y + rect.height <= crop.y + crop.height + 0.0001);
  }
}

test("PDF visual and CropBox coordinates include nonzero origins at every rotation", async () => {
  const expectedCorners = {
    0: [
      { x: 100, y: 600 },
      { x: 400, y: 600 },
      { x: 400, y: 200 },
      { x: 100, y: 200 },
    ],
    90: [
      { x: 100, y: 200 },
      { x: 100, y: 600 },
      { x: 400, y: 600 },
      { x: 400, y: 200 },
    ],
    180: [
      { x: 400, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 600 },
      { x: 400, y: 600 },
    ],
    270: [
      { x: 400, y: 600 },
      { x: 400, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 600 },
    ],
  };
  for (const rotation of [0, 90, 180, 270]) {
    const document = await PDFDocument.load(await croppedPdf(rotation));
    const geometry = pdfPageGeometry(document, 0);
    assert.deepEqual(geometry, {
      x: 100,
      y: 200,
      width: 300,
      height: 400,
      rotation,
    });
    VISUAL_CORNERS.forEach((visual, index) => {
      const page = visualPointToPdf(visual, geometry);
      close(page.x, expectedCorners[rotation][index].x);
      close(page.y, expectedCorners[rotation][index].y);
      const reopened = pdfPointToVisual(page, geometry);
      close(reopened.x, visual.x);
      close(reopened.y, visual.y);
    });
    const visual = { x: 0.23, y: 0.71 };
    const page = visualPointToPdf(visual, geometry);
    const reopened = pdfPointToVisual(page, geometry);
    close(reopened.x, visual.x);
    close(reopened.y, visual.y);
  }
});

test("CropBox text and highlight CRUD stays embedded across four rotations", async (t) => {
  for (const rotation of [0, 90, 180, 270]) {
    await t.test(`${rotation} degrees`, async () => {
      let bytes = await croppedPdf(rotation);
      const created = [];

      for (const [cornerIndex, corner] of VISUAL_CORNERS.entries()) {
        const text = await addPdfTextAnnotationAt(
          bytes,
          0,
          `text-${rotation}-${corner.name}`,
          corner,
        );
        bytes = text.bytes;
        created.push({
          id: text.id,
          kind: "text",
          cornerIndex,
        });
        const listedText = (await listPdfAnnotations(bytes, 0)).find(
          (annotation) => annotation.id === text.id,
        );
        assert.ok(listedText);
        assertRectAtCorner(listedText.rect, corner);

        const highlight = await addPdfHighlightAnnotation(
          bytes,
          0,
          rectAtCorner(corner, 0.12, 0.08),
          `highlight-${rotation}-${corner.name}`,
        );
        bytes = highlight.bytes;
        created.push({
          id: highlight.id,
          kind: "highlight",
          cornerIndex,
        });
        const listedHighlight = (await listPdfAnnotations(bytes, 0)).find(
          (annotation) => annotation.id === highlight.id,
        );
        assert.ok(listedHighlight);
        assertRectAtCorner(listedHighlight.rect, corner);
      }

      await assertAnnotationRectsInsideCrop(bytes, created.length);

      for (const entry of created) {
        const current = (await listPdfAnnotations(bytes, 0)).find(
          (annotation) => annotation.id === entry.id,
        );
        assert.ok(current);
        const target =
          VISUAL_CORNERS[
            (entry.cornerIndex + 2) % VISUAL_CORNERS.length
          ];
        bytes = await movePdfAnnotation(
          bytes,
          0,
          entry.id,
          rectAtCorner(
            target,
            current.rect.width,
            current.rect.height,
          ),
        );
        bytes = await updatePdfAnnotation(
          bytes,
          0,
          entry.id,
          `moved-${entry.kind}-${rotation}-${target.name}`,
        );
        const moved = (await listPdfAnnotations(bytes, 0)).find(
          (annotation) => annotation.id === entry.id,
        );
        assert.ok(moved);
        assert.equal(
          moved.contents,
          `moved-${entry.kind}-${rotation}-${target.name}`,
        );
        assertRectAtCorner(moved.rect, target);
      }

      await assertAnnotationRectsInsideCrop(bytes, created.length);
      const beforeReopen = await listPdfAnnotations(bytes, 0);
      const reopenedBytes = await (
        await PDFDocument.load(bytes)
      ).save();
      const afterReopen = await listPdfAnnotations(reopenedBytes, 0);
      assert.equal(afterReopen.length, beforeReopen.length);
      for (const before of beforeReopen) {
        const after = afterReopen.find(
          (annotation) => annotation.id === before.id,
        );
        assert.ok(after);
        assert.equal(after.kind, before.kind);
        assert.equal(after.contents, before.contents);
        close(after.rect.x, before.rect.x);
        close(after.rect.y, before.rect.y);
        close(after.rect.width, before.rect.width);
        close(after.rect.height, before.rect.height);
      }
      await assertAnnotationRectsInsideCrop(
        reopenedBytes,
        created.length,
      );

      bytes = reopenedBytes;
      for (const entry of created) {
        bytes = await deletePdfAnnotation(bytes, 0, entry.id);
      }
      assert.deepEqual(await listPdfAnnotations(bytes, 0), []);
      await assertAnnotationRectsInsideCrop(bytes, 0);
    });
  }
});

test("positioned text annotations can be listed, edited, saved and deleted", async () => {
  const source = await blankPdf(90);
  const created = await addPdfTextAnnotationAt(
    source,
    0,
    "初稿",
    { x: 0.25, y: 0.35 },
  );
  let annotations = await listPdfAnnotations(created.bytes, 0);
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].id, created.id);
  assert.equal(annotations[0].kind, "text");
  assert.equal(annotations[0].contents, "初稿");
  close(
    annotations[0].rect.x + annotations[0].rect.width / 2,
    0.25,
    0.03,
  );
  close(
    annotations[0].rect.y + annotations[0].rect.height / 2,
    0.35,
    0.03,
  );

  const updated = await updatePdfAnnotation(
    created.bytes,
    0,
    created.id,
    "终稿",
  );
  annotations = await listPdfAnnotations(updated, 0);
  assert.equal(annotations[0].contents, "终稿");
  assert.equal((await PDFDocument.load(updated)).getPageCount(), 1);

  const deleted = await deletePdfAnnotation(updated, 0, created.id);
  assert.deepEqual(await listPdfAnnotations(deleted, 0), []);
});

test("highlight rectangles and notes survive PDF binary reopen", async () => {
  const source = await blankPdf();
  const created = await addPdfHighlightAnnotation(
    source,
    0,
    { x: 0.12, y: 0.28, width: 0.55, height: 0.08 },
    "关键结论",
  );
  const reopenedBytes = Uint8Array.from(
    await (await PDFDocument.load(created.bytes)).save(),
  );
  let [annotation] = await listPdfAnnotations(reopenedBytes, 0);
  assert.equal(annotation.kind, "highlight");
  assert.equal(annotation.contents, "关键结论");
  close(annotation.rect.x, 0.12);
  close(annotation.rect.y, 0.28);
  close(annotation.rect.width, 0.55);
  close(annotation.rect.height, 0.08);

  const updated = await updatePdfAnnotation(
    reopenedBytes,
    0,
    annotation.id,
    "已复核",
  );
  [annotation] = await listPdfAnnotations(updated, 0);
  assert.equal(annotation.contents, "已复核");
});

test("imported Text annotations without OceanLeo IDs remain editable", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  const external = document.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Text"),
    Rect: [20, 20, 44, 44],
    Contents: PDFHexString.fromText("外部批注"),
  });
  page.node.addAnnot(document.context.register(external));
  const bytes = await document.save();
  const [listed] = await listPdfAnnotations(bytes, 0);
  assert.match(listed.id, /^ref:/);
  const updated = await updatePdfAnnotation(bytes, 0, listed.id, "已编辑");
  assert.equal((await listPdfAnnotations(updated, 0))[0].contents, "已编辑");
  const deleted = await deletePdfAnnotation(updated, 0, listed.id);
  assert.deepEqual(await listPdfAnnotations(deleted, 0), []);
});

test("highlight creation rejects accidental click-sized rectangles", async () => {
  const source = await blankPdf();
  await assert.rejects(
    () =>
      addPdfHighlightAnnotation(
        source,
        0,
        { x: 0.5, y: 0.5, width: 0.001, height: 0.001 },
      ),
    /过小/,
  );
});

test("PDF binary snapshots restore annotation mutations for undo and redo", async () => {
  const original = await blankPdf();
  const created = await addPdfTextAnnotationAt(original, 0, "可撤销", {
    x: 0.5,
    y: 0.5,
  });
  const undo = appendPdfHistory([], {
    bytes: Uint8Array.from(original),
    pageNumber: 1,
    pageCount: 1,
  });
  const redo = appendPdfHistory([], {
    bytes: Uint8Array.from(created.bytes),
    pageNumber: 1,
    pageCount: 1,
  });
  assert.deepEqual(await listPdfAnnotations(undo[0].bytes, 0), []);
  assert.equal((await listPdfAnnotations(redo[0].bytes, 0))[0].contents, "可撤销");
});
