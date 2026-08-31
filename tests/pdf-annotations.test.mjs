import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
  degrees,
} from "pdf-lib";
import {
  PDF_ANNOTATION_KINDS,
  PDF_ANNOTATION_SUBTYPES,
  addPdfAnnotation,
  deletePdfAnnotation,
  listPdfAnnotations,
  movePdfAnnotation,
  updatePdfAnnotation,
} from "../src/shell/media-editors/pdf-annotation-operations.ts";

/* ------------------------------------------------------------------ *
 * Fixtures and independent readers.
 *
 * Nothing below imports the production content-stream code: the page
 * content is read straight out of the saved binary with pdf-lib's own
 * primitives, so "the annotation was not painted into the page" is an
 * assertion about the file, not about our own bookkeeping.
 * ------------------------------------------------------------------ */

async function pageWithText(rotation = 0) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([600, 800]);
  page.setRotation(degrees(rotation));
  page.drawText("Quarterly figures", { x: 60, y: 700, size: 16, font });
  return document.save();
}

function streamBytes(context, value) {
  const resolved = value instanceof PDFRef ? context.lookup(value) : value;
  if (resolved instanceof PDFRawStream) {
    return decodePDFRawStream(resolved).decode();
  }
  if (resolved instanceof PDFStream) {
    return resolved.getContents();
  }
  return new Uint8Array();
}

/** Decoded bytes of every content stream attached to one page. */
function pageContentBytes(document, pageIndex) {
  const page = document.getPage(pageIndex);
  const contents = page.node.Contents();
  if (!contents) return new Uint8Array();
  const context = document.context;
  const parts =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) =>
          streamBytes(context, contents.get(index)),
        )
      : [streamBytes(context, contents)];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

/**
 * pdf-lib balances the page content with an extra `q` / `Q` pair the first time
 * anything is appended to a page, which is bookkeeping rather than drawing.
 * Every operator that could actually paint something survives this filter, so a
 * burned-in annotation still shows up as a difference.
 */
function paintingOperators(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "q" && line !== "Q")
    .join("\n");
}

async function pageContentText(bytes, pageIndex = 0) {
  const document = await PDFDocument.load(bytes);
  return paintingOperators(
    Buffer.from(pageContentBytes(document, pageIndex)).toString("latin1"),
  );
}

function annotationDicts(document, pageIndex) {
  const page = document.getPage(pageIndex);
  const annots = page.node.Annots();
  if (!annots) return [];
  return Array.from({ length: annots.size() }, (_, index) => {
    const raw = annots.get(index);
    return raw instanceof PDFRef
      ? document.context.lookup(raw, PDFDict)
      : raw;
  }).filter((entry) => entry instanceof PDFDict);
}

function subtypeOf(dictionary) {
  return dictionary.lookupMaybe(PDFName.of("Subtype"), PDFName)?.decodeText();
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 2×2 RGBA PNG whose right column is fully transparent. */
function transparentPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixels = Buffer.from([
    0, 0x20, 0x30, 0x40, 0xff, 0x00, 0x00, 0x00, 0x00,
    0, 0x20, 0x30, 0x40, 0xff, 0x00, 0x00, 0x00, 0x00,
  ]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", zlib.deflateSync(pixels)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const DRAFTS = {
  text: { contents: "请复核这一段", point: { x: 0.4, y: 0.2 } },
  highlight: { rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.04 } },
  underline: { quads: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }] },
  strikeout: { quads: [{ x: 0.1, y: 0.3, width: 0.4, height: 0.03 }] },
  squiggly: { quads: [{ x: 0.1, y: 0.4, width: 0.4, height: 0.03 }] },
  freehand: {
    strokes: [
      [
        { x: 0.2, y: 0.5 },
        { x: 0.3, y: 0.55 },
        { x: 0.4, y: 0.5 },
      ],
    ],
  },
  square: { rect: { x: 0.5, y: 0.5, width: 0.2, height: 0.1 } },
  circle: { rect: { x: 0.5, y: 0.65, width: 0.2, height: 0.1 } },
  line: {
    endpoints: [
      { x: 0.1, y: 0.7 },
      { x: 0.45, y: 0.78 },
    ],
  },
  arrow: {
    endpoints: [
      { x: 0.1, y: 0.85 },
      { x: 0.45, y: 0.92 },
    ],
  },
  stamp: { rect: { x: 0.6, y: 0.8, width: 0.25, height: 0.1 } },
};

test("the annotation vocabulary covers the eleven office kinds", () => {
  assert.deepEqual([...PDF_ANNOTATION_KINDS].sort(), [
    "arrow",
    "circle",
    "freehand",
    "highlight",
    "line",
    "square",
    "squiggly",
    "stamp",
    "strikeout",
    "text",
    "underline",
  ]);
});

test("every kind is written as a standard PDF annotation subtype", async (t) => {
  for (const kind of PDF_ANNOTATION_KINDS) {
    await t.test(kind, async () => {
      const source = await pageWithText();
      const created = await addPdfAnnotation(source, 0, {
        kind,
        ...DRAFTS[kind],
      });
      const document = await PDFDocument.load(created.bytes);
      const dicts = annotationDicts(document, 0);
      assert.equal(dicts.length, 1, "exactly one annotation is appended");
      assert.equal(
        subtypeOf(dicts[0]),
        PDF_ANNOTATION_SUBTYPES[kind],
        "the /Subtype is the standard name, not a private one",
      );
      assert.equal(
        dicts[0].lookupMaybe(PDFName.of("Type"), PDFName)?.decodeText(),
        "Annot",
      );
      const [listed] = await listPdfAnnotations(created.bytes, 0);
      assert.equal(listed.kind, kind, "the kind survives a read-back");
    });
  }
});

/* This is the reverse verification for "not painted into the content stream".
 * Repointing any kind at the page content stream turns it red on the spot. */
test("no annotation kind touches the page content stream", async (t) => {
  const source = await pageWithText();
  const before = await pageContentText(source);
  for (const kind of PDF_ANNOTATION_KINDS) {
    await t.test(kind, async () => {
      const created = await addPdfAnnotation(source, 0, {
        kind,
        ...DRAFTS[kind],
      });
      assert.equal(
        await pageContentText(created.bytes),
        before,
        "the page content stream is byte-identical before and after",
      );
    });
  }
});

test("deleting an annotation leaves nothing behind, because nothing was burned in", async () => {
  let bytes = await pageWithText();
  const before = await pageContentText(bytes);
  const ids = [];
  for (const kind of PDF_ANNOTATION_KINDS) {
    const created = await addPdfAnnotation(bytes, 0, {
      kind,
      ...DRAFTS[kind],
    });
    bytes = created.bytes;
    ids.push(created.id);
  }
  assert.equal((await listPdfAnnotations(bytes, 0)).length, 11);
  for (const id of ids) {
    bytes = await deletePdfAnnotation(bytes, 0, id);
  }
  assert.deepEqual(await listPdfAnnotations(bytes, 0), []);
  assert.equal(await pageContentText(bytes), before);
});

test("annotation kinds and geometry survive a binary reopen at every rotation", async (t) => {
  for (const rotation of [0, 90, 180, 270]) {
    await t.test(`${rotation} degrees`, async () => {
      let bytes = await pageWithText(rotation);
      for (const kind of PDF_ANNOTATION_KINDS) {
        const created = await addPdfAnnotation(bytes, 0, {
          kind,
          contents: `${kind}-note`,
          ...DRAFTS[kind],
        });
        bytes = created.bytes;
      }
      const before = await listPdfAnnotations(bytes, 0);
      const reopened = await (await PDFDocument.load(bytes)).save();
      const after = await listPdfAnnotations(reopened, 0);
      assert.equal(after.length, before.length);
      for (const [index, entry] of before.entries()) {
        assert.equal(after[index].kind, entry.kind);
        assert.equal(after[index].contents, entry.contents);
        assert.ok(Math.abs(after[index].rect.x - entry.rect.x) < 0.003);
        assert.ok(Math.abs(after[index].rect.y - entry.rect.y) < 0.003);
      }
    });
  }
});

test("quad kinds carry QuadPoints so other readers can re-anchor them", async () => {
  for (const kind of ["highlight", "underline", "strikeout", "squiggly"]) {
    const source = await pageWithText();
    const created = await addPdfAnnotation(source, 0, {
      kind,
      quads: [
        { x: 0.1, y: 0.2, width: 0.3, height: 0.03 },
        { x: 0.1, y: 0.25, width: 0.2, height: 0.03 },
      ],
    });
    const document = await PDFDocument.load(created.bytes);
    const [dictionary] = annotationDicts(document, 0);
    const quads = dictionary.lookup(PDFName.of("QuadPoints"), PDFArray);
    assert.equal(quads.size(), 16, `${kind} writes two quads`);
    const [listed] = await listPdfAnnotations(created.bytes, 0);
    assert.equal(listed.quads.length, 2);
  }
});

test("freehand ink is stored as InkList point data, not as a picture", async () => {
  const source = await pageWithText();
  const strokes = [
    [
      { x: 0.2, y: 0.5 },
      { x: 0.25, y: 0.56 },
      { x: 0.32, y: 0.5 },
    ],
    [
      { x: 0.4, y: 0.5 },
      { x: 0.45, y: 0.58 },
    ],
  ];
  const created = await addPdfAnnotation(source, 0, { kind: "freehand", strokes });
  const document = await PDFDocument.load(created.bytes);
  const [dictionary] = annotationDicts(document, 0);
  const inkList = dictionary.lookup(PDFName.of("InkList"), PDFArray);
  assert.equal(inkList.size(), 2);
  assert.equal(inkList.lookup(0, PDFArray).size(), 6);
  assert.equal(inkList.lookup(1, PDFArray).size(), 4);
  const [listed] = await listPdfAnnotations(created.bytes, 0);
  assert.equal(listed.strokes.length, 2);
  assert.equal(listed.strokes[0].length, 3);
  assert.ok(Math.abs(listed.strokes[0][0].x - 0.2) < 0.005);
  assert.ok(Math.abs(listed.strokes[0][0].y - 0.5) < 0.005);
});

test("an arrow is a Line with an arrow ending, and reads back as an arrow", async () => {
  const source = await pageWithText();
  const endpoints = [
    { x: 0.2, y: 0.3 },
    { x: 0.6, y: 0.45 },
  ];
  const arrow = await addPdfAnnotation(source, 0, { kind: "arrow", endpoints });
  const plain = await addPdfAnnotation(source, 0, { kind: "line", endpoints });

  const arrowDoc = await PDFDocument.load(arrow.bytes);
  const [arrowDict] = annotationDicts(arrowDoc, 0);
  assert.equal(subtypeOf(arrowDict), "Line");
  const endings = arrowDict.lookup(PDFName.of("LE"), PDFArray);
  assert.equal(endings.lookup(1, PDFName).decodeText(), "ClosedArrow");
  assert.equal(arrowDict.lookup(PDFName.of("L"), PDFArray).size(), 4);

  assert.equal((await listPdfAnnotations(arrow.bytes, 0))[0].kind, "arrow");
  assert.equal((await listPdfAnnotations(plain.bytes, 0))[0].kind, "line");

  const [listed] = await listPdfAnnotations(arrow.bytes, 0);
  assert.ok(listed.endpoints);
  assert.ok(Math.abs(listed.endpoints[0].x - 0.2) < 0.005);
  assert.ok(Math.abs(listed.endpoints[1].y - 0.45) < 0.005);
});

test("an image stamp keeps its alpha channel and stays out of the page content", async () => {
  const source = await pageWithText();
  const before = await pageContentText(source);
  const created = await addPdfAnnotation(source, 0, {
    kind: "stamp",
    rect: { x: 0.55, y: 0.7, width: 0.3, height: 0.12 },
    stampImage: { bytes: transparentPng(), mediaType: "image/png" },
  });
  assert.equal(await pageContentText(created.bytes), before);

  const document = await PDFDocument.load(created.bytes);
  const [dictionary] = annotationDicts(document, 0);
  assert.equal(subtypeOf(dictionary), "Stamp");
  const appearance = dictionary.lookup(PDFName.of("AP"), PDFDict);
  const normal = appearance.lookup(PDFName.of("N"));
  assert.ok(normal instanceof PDFStream, "the stamp draws through /AP /N");
  const xobjects = normal
    .dict.lookup(PDFName.of("Resources"), PDFDict)
    .lookup(PDFName.of("XObject"), PDFDict);
  const image = xobjects.lookup(PDFName.of("OceanLeoStamp"), PDFStream);
  assert.equal(
    image.dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.decodeText(),
    "Image",
  );
  assert.ok(
    image.dict.get(PDFName.of("SMask")),
    "the PNG alpha channel is embedded as an /SMask",
  );
});

test("a built-in stamp name is written when no image is supplied", async () => {
  const source = await pageWithText();
  const created = await addPdfAnnotation(source, 0, {
    kind: "stamp",
    rect: { x: 0.5, y: 0.5, width: 0.3, height: 0.1 },
    stampName: "Confidential",
  });
  const document = await PDFDocument.load(created.bytes);
  const [dictionary] = annotationDicts(document, 0);
  assert.equal(
    dictionary.lookup(PDFName.of("Name"), PDFName).decodeText(),
    "Confidential",
  );
  assert.equal((await listPdfAnnotations(created.bytes, 0))[0].stampName, "Confidential");
});

test("moving an annotation moves its normative geometry, not only its Rect", async () => {
  const source = await pageWithText();
  const ink = await addPdfAnnotation(source, 0, {
    kind: "freehand",
    strokes: [
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
    ],
  });
  const moved = await movePdfAnnotation(ink.bytes, 0, ink.id, {
    x: 0.6,
    y: 0.6,
    width: 0.2,
    height: 0.2,
  });
  const [listed] = await listPdfAnnotations(moved, 0);
  assert.ok(listed.strokes.length === 1);
  for (const point of listed.strokes[0]) {
    assert.ok(point.x >= 0.58 && point.x <= 0.82, `stroke x ${point.x} follows the box`);
    assert.ok(point.y >= 0.58 && point.y <= 0.82, `stroke y ${point.y} follows the box`);
  }

  const arrow = await addPdfAnnotation(source, 0, {
    kind: "arrow",
    endpoints: [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.2 },
    ],
  });
  const movedArrow = await movePdfAnnotation(arrow.bytes, 0, arrow.id, {
    x: 0.5,
    y: 0.5,
    width: 0.3,
    height: 0.2,
  });
  const [listedArrow] = await listPdfAnnotations(movedArrow, 0);
  assert.equal(listedArrow.kind, "arrow", "an arrow stays an arrow after a move");
  assert.ok(listedArrow.endpoints);
  assert.ok(listedArrow.endpoints[0].x >= 0.48);
});

test("every new kind is editable and deletable, not read-only decoration", async () => {
  for (const kind of PDF_ANNOTATION_KINDS) {
    const source = await pageWithText();
    const created = await addPdfAnnotation(source, 0, {
      kind,
      contents: "初稿",
      ...DRAFTS[kind],
    });
    const updated = await updatePdfAnnotation(created.bytes, 0, created.id, "终稿");
    assert.equal(
      (await listPdfAnnotations(updated, 0))[0].contents,
      "终稿",
      `${kind} accepts a content edit`,
    );
    const deleted = await deletePdfAnnotation(updated, 0, created.id);
    assert.deepEqual(await listPdfAnnotations(deleted, 0), [], `${kind} deletes`);
  }
});

test("highlight stays sheer and the opaque kinds stay opaque", async () => {
  const source = await pageWithText();
  const highlight = await addPdfAnnotation(source, 0, {
    kind: "highlight",
    rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.04 },
  });
  const document = await PDFDocument.load(highlight.bytes);
  const [dictionary] = annotationDicts(document, 0);
  assert.equal(
    dictionary.lookup(PDFName.of("CA"), PDFNumber).asNumber(),
    0.35,
    "a highlight that hid the glyphs underneath would be useless",
  );
  const square = await addPdfAnnotation(source, 0, {
    kind: "square",
    rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.1 },
  });
  assert.equal((await listPdfAnnotations(square.bytes, 0))[0].opacity, 1);
});
