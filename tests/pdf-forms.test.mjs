import assert from "node:assert/strict";
import test from "node:test";

import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
} from "pdf-lib";

import {
  PDF_FORM_BAD_EMAIL,
  PDF_FORM_NOT_AN_OPTION,
  PDF_FORM_NO_FIELDS,
  PDF_FORM_NO_FIELDS_HINT,
  PDF_FORM_REQUIRED,
  fillPdfForm,
  listPdfFormFields,
  pdfHasInteractiveForm,
  validatePdfFormValues,
} from "../src/shell/media-editors/pdf-form/acroform.ts";
import {
  REDACTION_IRREVERSIBLE,
  applyPdfRedactions,
  extractPageTextWithPdfJs,
} from "../src/shell/media-editors/pdf-form/redaction.ts";
import {
  CROSS_PAGE_SEAL_NEEDS_PAGES,
  SIGNATURE_IMAGE_LABEL,
  SIGNATURE_NOT_PKI,
  createSavedSignature,
  placeCrossPageSeal,
  placeImageSignature,
  signaturePngBytes,
} from "../src/shell/media-editors/pdf-form/signature.ts";
import {
  appendBlackRectOperator,
  blankContentStrings,
  removeImageDrawsInRegion,
  scanContentStrings,
} from "../src/shell/media-editors/pdf-form/content-stream.ts";
import { listPdfAnnotations } from "../src/shell/media-editors/pdf-annotation-operations.ts";

/* ------------------------------------------------------------------ *
 * Fixtures.
 *
 * Text is read back with pdfjs — a reader that shares no code with the
 * redaction implementation — so "the text is gone" is a claim about the
 * file, not about our own bookkeeping.
 * ------------------------------------------------------------------ */

/** 1x1 opaque PNG. */
const TINY_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function formDocument() {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  const form = document.getForm();

  const name = form.createTextField("applicant.name");
  name.setText("");
  name.addToPage(page, { x: 60, y: 700, width: 200, height: 24 });
  name.enableRequired();

  const email = form.createTextField("applicant.email");
  email.addToPage(page, { x: 60, y: 660, width: 200, height: 24 });

  const code = form.createTextField("applicant.code");
  code.addToPage(page, { x: 60, y: 620, width: 200, height: 24 });
  code.setMaxLength(4);

  const agree = form.createCheckBox("applicant.agree");
  agree.addToPage(page, { x: 60, y: 580, width: 16, height: 16 });

  const plan = form.createDropdown("applicant.plan");
  plan.setOptions(["basic", "pro"]);
  plan.addToPage(page, { x: 60, y: 540, width: 120, height: 24 });

  const tags = form.createOptionList("applicant.tags");
  tags.setOptions(["a", "b", "c"]);
  tags.addToPage(page, { x: 60, y: 480, width: 120, height: 48 });

  return document.save();
}

async function flatDocument(lines = ["SECRET-ALPHA", "PUBLIC-BETA"]) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([600, 800]);
  let y = 700;
  for (const line of lines) {
    page.drawText(line, { x: 60, y, size: 16, font });
    y -= 500;
  }
  return document.save();
}

/** Visual rect (origin top-left, 0..1) covering a line drawn at PDF `y`. */
function visualBandForPdfY(y, pageHeight = 800, band = 40) {
  return {
    x: 0.02,
    y: (pageHeight - y - band / 2) / pageHeight,
    width: 0.9,
    height: band / pageHeight,
  };
}

function streamBytes(context, value) {
  const resolved = value instanceof PDFRef ? context.lookup(value) : value;
  if (resolved instanceof PDFRawStream) {
    return decodePDFRawStream(resolved).decode();
  }
  if (resolved instanceof PDFStream) return resolved.getContents();
  return new Uint8Array();
}

/** Raw bytes of every content stream on a page, straight out of the file. */
async function rawPageContent(bytes, pageIndex = 0) {
  const document = await PDFDocument.load(Uint8Array.from(bytes));
  const page = document.getPage(pageIndex);
  const contents = page.node.Contents();
  if (!contents) return "";
  const context = document.context;
  const refs =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) => contents.get(index))
      : [contents];
  return refs
    .map((ref) => Buffer.from(streamBytes(context, ref)).toString("latin1"))
    .join("\n");
}

/** Drop the bare `q` / `Q` lines pdf-lib adds when it normalises a page. */
function withoutGraphicsStateWrap(content) {
  return content
    .split("\n")
    .filter((line) => line.trim() !== "q" && line.trim() !== "Q")
    .join("\n")
    .replace(/\n+/g, "\n")
    .trim();
}

function pdfText(object) {
  if (!object) return undefined;
  if (typeof object.decodeText === "function") return object.decodeText();
  if (typeof object.asString === "function") return object.asString();
  return undefined;
}

/**
 * Field name -> value, read straight off `/Root /AcroForm /Fields` without
 * going through our own acroform.ts. Descends `/Kids`, because a dotted field
 * name produces a parent field whose child carries the value.
 */
async function rawAcroFormValues(bytes) {
  const document = await PDFDocument.load(Uint8Array.from(bytes));
  const context = document.context;
  const acroForm = context.lookup(document.catalog.get(PDFName.of("AcroForm")));
  const values = new Map();
  if (!acroForm) return values;
  const roots = context.lookup(acroForm.get(PDFName.of("Fields")));
  if (!roots) return values;

  const visit = (dict, prefix) => {
    const name = pdfText(dict.get(PDFName.of("T")));
    const path = name ? (prefix ? `${prefix}.${name}` : name) : prefix;
    const value = dict.get(PDFName.of("V"));
    if (value !== undefined) {
      values.set(path, pdfText(value) ?? String(value));
    }
    const kids = dict.get(PDFName.of("Kids"));
    if (!kids) return;
    const list = context.lookup(kids);
    for (let index = 0; index < list.size(); index += 1) {
      visit(context.lookup(list.get(index)), path);
    }
  };
  for (let index = 0; index < roots.size(); index += 1) {
    visit(context.lookup(roots.get(index)), "");
  }
  return values;
}

/** Decoded `/AP /N` operator streams of a page's annotations. */
async function annotationAppearanceStreams(bytes, pageIndex = 0) {
  const document = await PDFDocument.load(Uint8Array.from(bytes));
  const context = document.context;
  const annots = document.getPage(pageIndex).node.Annots();
  const streams = [];
  if (!annots) return streams;
  for (let index = 0; index < annots.size(); index += 1) {
    const dict = context.lookup(annots.get(index));
    const appearance = dict.get(PDFName.of("AP"));
    if (!appearance) continue;
    const normal = context.lookup(context.lookup(appearance).get(PDFName.of("N")));
    if (!normal) continue;
    streams.push(Buffer.from(streamBytes(context, normal)).toString("latin1"));
  }
  return streams;
}

/** Appearance streams of the form widgets on a page. */
async function widgetAppearanceStreams(bytes, pageIndex = 0) {
  return annotationAppearanceStreams(bytes, pageIndex);
}

/* ------------------------------------------------------------------ *
 * P2 · AcroForm
 * ------------------------------------------------------------------ */

test("form fields are discovered with kind, page, options and declared limits", async () => {
  const fields = await listPdfFormFields(await formDocument());
  const byName = new Map(fields.map((field) => [field.name, field]));

  assert.equal(fields.length, 6);
  assert.equal(byName.get("applicant.name").kind, "text");
  assert.equal(byName.get("applicant.name").required, true);
  assert.equal(byName.get("applicant.agree").kind, "checkbox");
  assert.equal(byName.get("applicant.plan").kind, "dropdown");
  assert.deepEqual(byName.get("applicant.plan").options, ["basic", "pro"]);
  assert.equal(byName.get("applicant.tags").kind, "option-list");
  assert.equal(byName.get("applicant.code").maxLength, 4);

  // Widget geometry resolves to the page the widget actually sits on.
  for (const field of fields) {
    assert.equal(field.pageIndex, 0);
    assert.ok(field.rect, `${field.name} should expose widget bounds`);
    assert.ok(field.rect.x >= 0 && field.rect.x <= 1);
  }
});

test("validation reports required, option and declared-length violations", async () => {
  const fields = await listPdfFormFields(await formDocument());

  const empty = validatePdfFormValues(fields, {});
  assert.equal(empty["applicant.name"], PDF_FORM_REQUIRED);
  assert.equal(empty["applicant.email"], undefined);

  const bad = validatePdfFormValues(fields, {
    "applicant.name": "Ada",
    "applicant.email": "not-an-email",
    "applicant.code": "TOOLONG",
    "applicant.plan": "enterprise",
    "applicant.tags": ["a", "zzz"],
  });
  assert.equal(bad["applicant.name"], undefined);
  assert.equal(bad["applicant.email"], PDF_FORM_BAD_EMAIL);
  assert.match(bad["applicant.code"], /4/);
  assert.equal(bad["applicant.plan"], PDF_FORM_NOT_AN_OPTION);
  assert.equal(bad["applicant.tags"], PDF_FORM_NOT_AN_OPTION);

  const good = validatePdfFormValues(fields, {
    "applicant.name": "Ada",
    "applicant.email": "ada@example.com",
    "applicant.code": "AB12",
    "applicant.plan": "pro",
    "applicant.tags": ["a", "c"],
  });
  assert.deepEqual(good, {});
});

test("filling keeps fields editable and the values read back", async () => {
  const filled = await fillPdfForm(
    await formDocument(),
    {
      "applicant.name": "Ada Lovelace",
      "applicant.agree": true,
      "applicant.plan": "pro",
      "applicant.tags": ["a", "c"],
    },
    false,
  );

  assert.equal(await pdfHasInteractiveForm(filled), true);
  const fields = await listPdfFormFields(filled);
  const byName = new Map(fields.map((field) => [field.name, field]));
  assert.equal(byName.get("applicant.name").value, "Ada Lovelace");
  assert.equal(byName.get("applicant.agree").value, true);
  assert.equal(byName.get("applicant.plan").value, "pro");
  assert.deepEqual(byName.get("applicant.tags").value, ["a", "c"]);

  // Not just our own bookkeeping: the value sits where the PDF spec says a
  // form value lives. Walked straight off the raw dictionaries, bypassing
  // acroform.ts entirely. A dotted name makes a hierarchical field, so the
  // value is on the leaf, not on the "applicant" parent.
  const tree = await rawAcroFormValues(filled);
  assert.equal(tree.get("applicant.name"), "Ada Lovelace");
  assert.equal(tree.get("applicant.plan"), "pro");

  // And it is renderable: updateFieldAppearances regenerated the widget's
  // appearance stream, which is what any reader paints.
  const appearances = await widgetAppearanceStreams(filled, 0);
  const glyphHex = Buffer.from("Ada Lovelace", "latin1").toString("hex").toUpperCase();
  assert.ok(
    appearances.some((ops) => ops.toUpperCase().includes(glyphHex)),
    "a widget appearance stream must carry the filled glyphs",
  );

  // While the form stays editable the value is deliberately NOT painted into
  // the page content stream -- that is what keeps it a form and not ink.
  // pdfjs reads page content only, so empty here is the correct answer.
  assert.equal(await extractPageTextWithPdfJs(filled, 0), "");
});

test("flattening removes the interactive form but keeps the text visible", async () => {
  const source = await formDocument();
  const values = { "applicant.name": "Ada Lovelace", "applicant.plan": "pro" };

  const editable = await fillPdfForm(source, values, false);
  const flattened = await fillPdfForm(source, values, true);

  assert.equal(await pdfHasInteractiveForm(editable), true);
  assert.equal(await pdfHasInteractiveForm(flattened), false);
  assert.deepEqual(await listPdfFormFields(flattened), []);

  // Flattening bakes the appearances into the page content, so this is where
  // an outside reader can finally see the answers.
  const pageText = await extractPageTextWithPdfJs(flattened, 0);
  assert.match(pageText, /Ada Lovelace/);
  assert.match(pageText, /pro/);
});

test("a PDF without form fields is reported, never faked", async () => {
  const flat = await flatDocument();
  assert.deepEqual(await listPdfFormFields(flat), []);
  assert.equal(await pdfHasInteractiveForm(flat), false);
  await assert.rejects(() => fillPdfForm(flat, { anything: "x" }, false), {
    message: PDF_FORM_NO_FIELDS,
  });
  // The hint the panel shows points at text annotations instead of inventing
  // input boxes over a flat page.
  assert.match(PDF_FORM_NO_FIELDS_HINT, /无表单域/);
  assert.match(PDF_FORM_NO_FIELDS_HINT, /批注/);
});

/* ------------------------------------------------------------------ *
 * P3 · Image signatures and seals
 * ------------------------------------------------------------------ */

test("image signature lands as a standard Stamp annotation, not page ink", async () => {
  const before = await flatDocument();
  const beforeContent = await rawPageContent(before);

  const signed = await placeImageSignature(
    before,
    0,
    { x: 0.6, y: 0.7, width: 0.25, height: 0.1 },
    TINY_PNG,
  );

  const annotations = await listPdfAnnotations(signed, 0);
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].kind, "stamp");
  assert.equal(annotations[0].contents, SIGNATURE_IMAGE_LABEL);

  // The page content stream gained no drawing operators: the signature lives
  // in the annotation's appearance stream, so it stays removable.
  //
  // pdf-lib's addAnnot normalises the page, which brackets the existing
  // content with a bare `q` / `Q` pair. Those only push and pop graphics
  // state, so they are ignored here -- but anything that actually marks the
  // page is not.
  const afterContent = await rawPageContent(signed);
  assert.equal(withoutGraphicsStateWrap(afterContent), withoutGraphicsStateWrap(beforeContent));
  assert.doesNotMatch(afterContent, /\sDo\b/, "no image may be drawn into the page");
  assert.doesNotMatch(afterContent, /\bre\s+f\b/, "no rectangle may be painted onto the page");

  // The stamp does render, though -- from inside the annotation appearance.
  const appearances = await annotationAppearanceStreams(signed, 0);
  assert.equal(appearances.length, 1);
  assert.match(appearances[0], /\sDo\b/, "the seal image is drawn in the appearance stream");
});

test("wording never claims a PKI digital signature", () => {
  assert.equal(SIGNATURE_IMAGE_LABEL, "图像签章");
  assert.match(SIGNATURE_NOT_PKI, /不是/);
  assert.match(SIGNATURE_NOT_PKI, /PKI/);
  // "数字签名" may only appear when denied in the same breath.
  assert.doesNotMatch(SIGNATURE_IMAGE_LABEL, /数字签名/);
});

test("saved signatures round-trip through storage encoding", () => {
  const entry = createSavedSignature("我的章", TINY_PNG);
  assert.equal(entry.label, "我的章");
  assert.deepEqual(signaturePngBytes(entry), TINY_PNG);
});

test("cross-page seal gives every page a different slice of one seal", async () => {
  const document = await PDFDocument.create();
  document.addPage([600, 800]);
  document.addPage([600, 800]);
  document.addPage([600, 800]);
  const sealed = await placeCrossPageSeal(await document.save(), TINY_PNG);

  const loaded = await PDFDocument.load(Uint8Array.from(sealed));
  const crops = [];
  for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
    const annotations = await listPdfAnnotations(sealed, pageIndex);
    assert.equal(annotations.length, 1, `page ${pageIndex} carries one seal`);
    assert.match(annotations[0].contents, new RegExp(`${pageIndex + 1}/3`));

    // The appearance stream of each slice must translate the image differently:
    // three identical stamps would be three whole seals, not a 骑缝章.
    const annots = loaded.getPage(pageIndex).node.Annots();
    const dict = loaded.context.lookup(annots.get(0));
    const appearance = loaded.context.lookup(
      dict.get(PDFName.of("AP")).get(PDFName.of("N")),
    );
    const operators = Buffer.from(
      decodePDFRawStream(appearance).decode(),
    ).toString("latin1");
    assert.match(operators, /re W n/, "slice must be clipped");
    crops.push(operators.match(/([\d.-]+) 0 0 ([\d.-]+) ([\d.-]+) ([\d.-]+) cm/)[3]);
  }
  assert.equal(new Set(crops).size, 3, "each page shows a different slice");
});

test("cross-page seal refuses a single-page document", async () => {
  const document = await PDFDocument.create();
  document.addPage([600, 800]);
  const single = await document.save();
  await assert.rejects(() => placeCrossPageSeal(single, TINY_PNG), {
    message: CROSS_PAGE_SEAL_NEEDS_PAGES,
  });
});

/* ------------------------------------------------------------------ *
 * P4 · Redaction — the safety judge
 * ------------------------------------------------------------------ */

test("redaction removes the text, and pdfjs can no longer extract it", async () => {
  const before = await flatDocument();
  assert.match(await extractPageTextWithPdfJs(before, 0), /SECRET-ALPHA/);

  const outcome = await applyPdfRedactions(before, [
    { id: "m1", pageIndex: 0, rect: visualBandForPdfY(700) },
  ]);

  const after = await extractPageTextWithPdfJs(outcome.bytes, 0);
  assert.doesNotMatch(after, /SECRET-ALPHA/, "redacted text must not be extractable");
  assert.match(after, /PUBLIC-BETA/, "untouched text must survive");
  assert.equal(outcome.removedTextCount, 1);
  assert.deepEqual(outcome.broadenedPages, []);
});

test("redaction erases the bytes, not just the pixels", async () => {
  const outcome = await applyPdfRedactions(await flatDocument(), [
    { id: "m1", pageIndex: 0, rect: visualBandForPdfY(700) },
  ]);
  const content = await rawPageContent(outcome.bytes);

  // "SECRET-ALPHA" as pdf-lib writes it: 2 hex digits per byte.
  const hex = Buffer.from("SECRET-ALPHA", "latin1").toString("hex").toUpperCase();
  assert.doesNotMatch(content, new RegExp(hex, "i"));
  assert.doesNotMatch(content, /SECRET-ALPHA/);
  // The surviving line is still there in the same file.
  assert.match(
    content,
    new RegExp(Buffer.from("PUBLIC-BETA", "latin1").toString("hex").toUpperCase(), "i"),
  );
  // And a black rectangle is painted over the area.
  assert.match(content, /0 0 0 rg/);
  assert.match(content, /re f/);
});

test("redaction empties every content stream of the page, not only the first", async () => {
  // A page whose content is split across two streams: filtering the merge and
  // writing back only stream 0 would leave the original text in stream 1.
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([600, 800]);
  page.drawText("SECRET-ALPHA", { x: 60, y: 700, size: 16, font });
  const first = page.node.Contents();
  const extra = document.context.register(
    document.context.flateStream("q\nQ\n"),
  );
  const array = PDFArray.withContext(document.context);
  if (first instanceof PDFArray) {
    for (let index = 0; index < first.size(); index += 1) array.push(first.get(index));
  } else {
    array.push(first);
  }
  array.push(extra);
  page.node.set(PDFName.of("Contents"), array);
  const twoStreams = await document.save();

  const reloaded = await PDFDocument.load(Uint8Array.from(twoStreams));
  assert.equal(reloaded.getPage(0).node.Contents().size(), 2, "fixture has 2 streams");

  const outcome = await applyPdfRedactions(twoStreams, [
    { id: "m1", pageIndex: 0, rect: visualBandForPdfY(700) },
  ]);
  const content = await rawPageContent(outcome.bytes);
  const hex = Buffer.from("SECRET-ALPHA", "latin1").toString("hex").toUpperCase();
  assert.doesNotMatch(content, new RegExp(hex, "i"));
  assert.equal(await extractPageTextWithPdfJs(outcome.bytes, 0), "");
});

test("redaction deletes an image whose placement falls under the mark", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  const image = await document.embedPng(TINY_PNG);
  page.drawImage(image, { x: 100, y: 600, width: 120, height: 90 });
  page.drawImage(image, { x: 100, y: 100, width: 120, height: 90 });
  const withImages = await document.save();

  assert.equal(
    (await rawPageContent(withImages)).match(/\/\S+ Do/g).length,
    2,
    "fixture draws two images",
  );

  const outcome = await applyPdfRedactions(withImages, [
    { id: "m1", pageIndex: 0, rect: visualBandForPdfY(645, 800, 120) },
  ]);
  assert.equal(outcome.removedImageCount, 1);
  assert.equal((await rawPageContent(outcome.bytes)).match(/\/\S+ Do/g).length, 1);
});

test("redaction refuses an empty mark set", async () => {
  const flat = await flatDocument();
  await assert.rejects(() => applyPdfRedactions(flat, []), /标记/);
});

test("the irreversible-redaction confirmation says it cannot be undone", () => {
  assert.match(REDACTION_IRREVERSIBLE, /永久/);
  assert.match(REDACTION_IRREVERSIBLE, /无法撤销/);
});

/* ------------------------------------------------------------------ *
 * Content-stream primitives
 * ------------------------------------------------------------------ */

test("string scanner reads literals, escapes and hex, and skips dictionaries", () => {
  const spans = scanContentStrings(
    "<< /Type /Page >>\n(plain) Tj\n(a\\(b\\)c) Tj\n(\\101) Tj\n<414243> Tj\n% (comment)\n",
  );
  assert.deepEqual(
    spans.map((span) => span.candidates[0]),
    ["plain", "a(b)c", "A", "ABC"],
  );
  assert.equal(spans.filter((span) => span.kind === "hex").length, 1);
});

test("hex strings decode both as bytes and as UTF-16BE", () => {
  const [span] = scanContentStrings("<00480049> Tj");
  assert.ok(span.candidates.includes("HI"), "UTF-16BE candidate is required");
});

test("blanking a string keeps its operator and drops only the glyphs", () => {
  const content = "BT\n(SECRET) Tj\nET";
  const [span] = scanContentStrings(content);
  assert.equal(blankContentStrings(content, [span]), "BT\n() Tj\nET");
});

test("image removal follows the CTM stack, not text order", () => {
  const content = [
    "q",
    "120 0 0 90 100 600 cm",
    "/Img0 Do",
    "Q",
    "q",
    "120 0 0 90 100 100 cm",
    "/Img0 Do",
    "Q",
  ].join("\n");
  const hit = removeImageDrawsInRegion(content, {
    x: 90,
    y: 590,
    width: 140,
    height: 110,
  });
  assert.equal(hit.removed, 1);
  assert.equal(hit.content.match(/Do/g).length, 1);

  const miss = removeImageDrawsInRegion(content, {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });
  assert.equal(miss.removed, 0);
  assert.equal(miss.content, content);
});

test("black rectangle operators are appended, not substituted", () => {
  const painted = appendBlackRectOperator("BT\nET", 10, 20, 30, 40);
  assert.match(painted, /^BT\nET\n/);
  assert.match(painted, /0 0 0 rg/);
  assert.match(painted, /10 20 30 40 re f/);
});
