import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";
import { servePdfiumWasm } from "./helpers/pdfium-wasm.mjs";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import { deckDocumentFromWorkingCopy, prepareDeckMedia } from "../src/shell/doc-editors/deck-working-copy.ts";
import { gridWorkingCopy } from "../src/shell/doc-editors/grid-univer/working-copy.ts";
import { decodePdfRecovery, pdfWorkingJson } from "../src/shell/media-editors/pdf-recovery.ts";
import { createPdfViewerBridge } from "../src/shell/media-editors/pdf-viewer-bridge.ts";

function annotation(id, type = 3, pageIndex = 0) {
  return { id, type, pageIndex, rect: { origin: { x: 20, y: 30 }, size: { width: 100, height: 40 } },
    contents: `Note ${id}`, color: "#123456", opacity: 1, flags: ["print"], created: new Date("2026-11-01T00:00:00Z") };
}
function registry(initial = []) {
  let objects = structuredClone(initial);
  let values = { name: "OceanLeo" };
  let active = "doc";
  const edits = new Set();
  const task = (value) => ({ toPromise: async () => value });
  const scope = {
    getState: () => ({ selectedUids: [], activeToolId: null }),
    getAnnotations: () => objects.map((object) => ({ object })),
    getSelectedAnnotation: () => null,
    setActiveTool() {}, setLocked() {},
    createAnnotation(_page, object) { objects.push(object); },
    updateAnnotation(_page, id, patch) { objects = objects.map((object) => object.id === id ? { ...object, ...patch } : object); },
    deleteAnnotation(_page, id) { objects = objects.filter((object) => object.id !== id); },
    commit: () => task(true),
    exportAnnotations: () => task(objects.map((object) => ({ annotation: object, ...(object.type===13?{ctx:{data:new ArrayBuffer(4),mimeType:"image/png"}}:{}) }))),
  };
  const plugins = {
    annotation: { forDocument: () => scope, onStateChange: () => () => {}, getTool: () => null },
    form: { forDocument: () => ({ getFormValues: () => values, setFormValues: (next) => { values = next; return task(true); } }) },
    history: { forDocument: () => ({ canUndo: () => true, canRedo: () => false }), onHistoryChange(cb) { edits.add(cb); return () => edits.delete(cb); } },
    "document-manager": { getActiveDocumentId: () => active, getActiveDocument: () => ({ pages: [] }), onDocumentOpened: () => () => {},
      openDocumentBuffer: () => task({ documentId: "next", task: task(undefined) }), setActiveDocument: (id) => { active = id; }, closeDocument: () => task(undefined) },
  };
  return { getPlugin: (id) => plugins[id] ? { provides: () => plugins[id] } : null,
    emit: () => edits.forEach((cb) => cb({ documentId: active })), scope };
}

function measure(label, capture, expectedLimit, sampleCount = 9) {
  const values = [];
  let doc;
  for (let i = 0; i < sampleCount; i++) {
    const start = performance.now();
    doc = capture();
    values.push(performance.now() - start);
  }
  values.sort((a, b) => a - b);
  const p95 = values[Math.ceil(values.length * 0.95) - 1];
  const bytes = Buffer.byteLength(JSON.stringify(doc));
  console.log(`CAPTURE ${label}: bytes=${bytes} p50=${values[Math.floor(values.length / 2)].toFixed(2)}ms p95=${p95.toFixed(2)}ms n=${values.length}`);
  assert.ok(p95 <= expectedLimit, `${label}: ${p95.toFixed(2)}ms exceeds ${expectedLimit}ms`);
  return doc;
}

test("deck full model round-trips references, notes, masters, animation and rich text", async () => {
  const deck = normalizeDeckDocument({ title: "Launch", slides: [{ id: "s", title: "Cover", notes: "speaker notes", transition: { type: "fade", durationMs: 200 },
    elements: [{ id: "t", type: "text", text: "Hello", highlight: "#ff0" }, { id: "i", type: "image", src: "https://example.invalid/owned.png" }] }] });
  assert.deepEqual(JSON.parse(JSON.stringify(deckDocumentFromWorkingCopy(JSON.parse(JSON.stringify(deck))))), JSON.parse(JSON.stringify(deck)));
  assert.deepEqual(JSON.parse(JSON.stringify(await prepareDeckMedia(deck, "ppt"))), JSON.parse(JSON.stringify(deck)), "durable sources do not upload at capture/save");
  assert.equal(deckDocumentFromWorkingCopy({ slides: [] }), null);
  const large = normalizeDeckDocument({ slides: Array.from({ length: 100 }, (_, slide) => ({ id: `s${slide}`, title: `Slide ${slide}`, notes: "speaker notes ".repeat(30),
    elements: Array.from({ length: 50 }, (_, element) => ({ id: `e${slide}-${element}`, type: element % 5 ? "text" : "image", text: "A realistic paragraph with formatting ".repeat(3), src: "https://example.invalid/owned.png", animation: { type: "fade", durationMs: 300 } })) })) });
  measure("deck/100 slides/5000 elements", () => large, 100);
  assert.deepEqual(JSON.parse(JSON.stringify(deckDocumentFromWorkingCopy(JSON.parse(JSON.stringify(large))))), JSON.parse(JSON.stringify(large)));
});

test("grid complete workbook round-trips cells, formula, styles, layout and plugin resources", () => {
  const sheets = {};
  for (let sheet = 0; sheet < 4; sheet++) {
    const cellData = {};
    for (let row = 0; row < 1500; row++) cellData[row] = Object.fromEntries(Array.from({ length: 12 }, (_, column) => [column, { v: `R${row}C${column}`, t: 1, s: "bold" }]));
    sheets[`s${sheet}`] = { id: `s${sheet}`, name: `Sheet ${sheet}`, rowCount: 2000, columnCount: 26, cellData, mergeData: [], freeze: { xSplit: 1, ySplit: 1 } };
  }
  sheets.s0.cellData[0][0] = { f: "=SUM(B1:B10)", v: 42, t: 2, s: "bold" };
  const workbook = { id: "wb", name: "Budget", sheetOrder: Object.keys(sheets), sheets, styles: { bold: { bl: 1 } }, resources: [{ name: "SHEET_DRAWING_PLUGIN", data: JSON.stringify({ s0: { data: { image: { source: "https://example.invalid/image.png" } } } }) }] };
  const ready = gridWorkingCopy(workbook);
  const copy = measure("grid/4 sheets/72000 cells", () => ready, 100);
  assert.deepEqual(gridWorkingCopy(JSON.parse(JSON.stringify(copy))), copy);
  copy.sheets.s0.cellData[0][0].v = "changed";
  assert.equal(workbook.sheets.s0.cellData[0][0].v, 42);
  assert.equal(gridWorkingCopy({ sheets: [] }), null);
});

test("PDF native state round-trips stamps, forms and page edits without exporting bytes", async () => {
  const original = registry([annotation("note"), annotation("signature", 13), { ...annotation("field", 20), field: { name: "name", value: "OceanLeo", type: 6 } }]);
  const bridge = createPdfViewerBridge(original, "sample.pdf");
  let uploads=0;
  await bridge.prepareWorkingCopyMedia(async()=>{uploads++;return "https://example.invalid/stamp.png";});
  assert.equal(uploads,1,"source stamp media is prepared before capture");
  await bridge.prepareWorkingCopyMedia(async()=>{uploads++;return "https://example.invalid/stamp.png";});
  assert.equal(uploads,1,"known stamp media is reused");
  const first = { version: 1, source: { url: "https://example.invalid/source.pdf", blank: false }, operations: [{ type: "rotate", pageIndex: 0, degrees: 90 }, { type: "move", fromIndex: 1, toIndex: 0 }, { type: "delete", pageIndex: 2 }], ...bridge.captureWorkingState() };
  assert.ok(decodePdfRecovery(first));
  const opened = registry();
  const second = createPdfViewerBridge(opened, "reopen.pdf");
  let edits = 0;
  const off = second.subscribe({ onEdit: () => edits++ });
  await second.restoreWorkingState(first, async () => new ArrayBuffer(4));
  assert.equal(edits, 0, "restore never becomes a user edit");
  opened.emit();
  assert.equal(edits, 1, "a real native history edit is reported");
  assert.deepEqual(second.captureWorkingState(), bridge.captureWorkingState());
  off();
  assert.equal(decodePdfRecovery(new Blob(["PDF"])), null, "rebuilt bytes are not a working document");
  const largeBridge = createPdfViewerBridge(registry(Array.from({ length: 5000 }, (_, id) => annotation(`a${id}`, 3, id % 100))), "large.pdf");
  await largeBridge.prepareWorkingCopyMedia(async () => { throw new Error("No stamp upload expected"); });
  measure("pdf/100 pages/5000 annotations", () => ({ ...first, ...largeBridge.captureWorkingState() }), 100);
});

test("PDF background builder uses a separate PDFium document, preserves forms and CJK, and applies page order", async () => {
  const host = await import("../src/shell/media-editors/pdf-engine-host.ts");
  const wasm = await servePdfiumWasm();
  host.overridePdfiumWasmUrlForTests(wasm.url);
  const engine = await host.getPdfiumEngine("direct");
  const source = await PDFDocument.create();
  source.addPage([400, 600]); source.addPage([500, 700]); source.addPage([600, 800]);
  const form = source.getForm();
  const field = form.createTextField("name");
  field.setText("Before"); field.addToPage(source.getPage(0), { x: 10, y: 10, width: 200, height: 30 });
  const bytes = await source.save();
  globalThis.__s3aStampImage = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==", "base64"));
  globalThis.__s3aPdfCloses = 0;
  const { buildPdfWorkingCopy } = await import(await compileModule("src/shell/media-editors/pdf-working-copy-publish.ts", {
    "../../lib/media-proxy": dataModule('export async function fetchMediaBlob(){return new Blob([globalThis.__s3aStampImage],{type:"image/png"});}'),
    "./pdf-engine-host": dataModule(`import {openPdfEngineDocument} from ${JSON.stringify(realModule("src/shell/media-editors/pdf-engine-host.ts"))}; export async function openPdfEngineDocumentForTest(bytes) { const opened=await openPdfEngineDocument(bytes,{mode:"direct"}); return {...opened,close:async()=>{globalThis.__s3aPdfCloses++;await opened.close();}}; } export {openPdfEngineDocumentForTest as openPdfEngineDocument};`),
  }));
  const ordered = await import("../src/shell/media-editors/pdf-working-copy-publish.ts").then(({ applyPdfPageOperations }) => applyPdfPageOperations(bytes, [{ type: "rotate", pageIndex: 0, degrees: 90 }, { type: "move", fromIndex: 0, toIndex: 1 }, { type: "delete", pageIndex: 2 }]));
  const base = await host.openPdfEngineDocument(ordered, { mode: "direct" });
  const widgets = [];
  for (const page of base.doc.pages) widgets.push(...await engine.getPageAnnotations(base.doc, page).toPromise());
  await base.close();
  const copy = { version: 1, source: { url: "https://example.invalid/source.pdf", blank: false }, operations: [{ type: "rotate", pageIndex: 0, degrees: 90 }, { type: "move", fromIndex: 0, toIndex: 1 }, { type: "delete", pageIndex: 2 }], annotations: [
    ...widgets.map((widget) => ({ annotation: widget })), { annotation: { ...annotation("added", 3, 0), contents: "Hello 张三", fontSize: 12, fontFamily: "Helvetica", fontColor: "#000000", textAlign: 0, lineHeight: 1.2, rotation: 0 } },
    { annotation: {...annotation("stamp",13,0),rotation:0}, media: {url:"https://example.invalid/stamp.png",mimeType:"image/png"} },
  ], formValues: { name: "After" } };
  try {
    const saved = await buildPdfWorkingCopy(copy, bytes);
    assert.equal(globalThis.__s3aPdfCloses,1,"publisher closes its independent engine document exactly once");
    const pdf = await PDFDocument.load(saved);
    assert.equal(pdf.getPageCount(), 2);
    assert.equal(pdf.getPage(0).getWidth(), 500);
    assert.equal(pdf.getPage(1).getWidth(), 400);
    assert.equal(pdf.getPage(1).getRotation().angle,90);
    assert.equal(pdf.getForm().getTextField("name").getText(), "After");
    const reopened = await host.openPdfEngineDocument(saved, { mode: "direct" });
    try {
      const annotations = await engine.getPageAnnotations(reopened.doc, reopened.doc.pages[0]).toPromise();
      assert.ok(annotations.some((entry) => entry.contents === "Hello 张三"));
      const stamp=annotations.find((entry)=>entry.type===13);
      assert.ok(stamp,"stamp image survives headless publication");
      const appearance=await engine.exportAnnotationAppearanceAsPdf(reopened.doc,reopened.doc.pages[0],stamp).toPromise();
      assert.ok(appearance.byteLength>0);
    } finally { await reopened.close(); }
    const invalid=structuredClone(copy);invalid.annotations.find(({annotation})=>annotation.type===3).annotation.fontColor=undefined;
    await assert.rejects(buildPdfWorkingCopy(invalid,bytes));
    assert.equal(globalThis.__s3aPdfCloses,2,"failed publisher also closes exactly once");
  } finally { await wasm.close(); host.overridePdfiumWasmUrlForTests(null); }
});
