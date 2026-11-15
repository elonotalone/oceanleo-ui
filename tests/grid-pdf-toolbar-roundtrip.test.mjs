import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { runGridUniverCommand } from "../src/shell/doc-editors/grid-univer/facade-commands.ts";
import { gridRichTextCell, gridRichTextState, settleGridTextPort } from "../src/shell/doc-editors/grid-univer/rich-text-commands.ts";
import { readGridSelectionStyle } from "../src/shell/doc-editors/grid-univer/selection-style.ts";
import { gridWorkingCopy } from "../src/shell/doc-editors/grid-univer/working-copy.ts";
import { buildGridXlsxFromUniverSnapshot } from "../src/shell/doc-editors/grid-univer/xlsx-export.ts";
import { EDIT_BAR_CANON_ENGINE_SCOPES } from "../src/shell/edit-bar-canon-table.ts";
import { pdfSelectionControls, pdfSelectionPatch, PDF_FREETEXT_ENGINE_GAPS, PDF_STAMP_ENGINE_GAPS } from "../src/shell/media-editors/pdf-selection-controls.ts";
import { pdfWorkingJson } from "../src/shell/media-editors/pdf-recovery.ts";
import { servePdfiumWasm } from "./helpers/pdfium-wasm.mjs";

const require = createRequire(import.meta.url);
const univerRequire = createRequire(require.resolve("@univerjs/presets"));
const core = univerRequire("@univerjs/core");
const sheets = univerRequire("@univerjs/sheets");
const hyperRequire = createRequire(require.resolve("@univerjs/preset-sheets-hyper-link"));
const hyper = hyperRequire("@univerjs/sheets-hyper-link");

function fixture() {
  return { id: "toolbar-wb", name: "Toolbar", sheetOrder: ["s1"], styles: {}, sheets: { s1: {
    id: "s1", name: "Data", rowCount: 20, columnCount: 8,
    cellData: { 0: { 0: { v: "Alpha\nbeta", t: 1, s: { fs: 16, ff: "Arial", bl: 1 } },
      1: { v: 10, t: 2 }, 2: { f: "=1+1", v: 2, t: 2 }, 3: { v: "Second", t: 1 } } },
  } } };
}

function engine(snapshot = fixture()) {
  const univer = new core.Univer({ locale: "enUS", locales: { enUS: {} } });
  univer.registerPlugin(sheets.UniverSheetsPlugin);
  univer.registerPlugin(hyper.UniverSheetsHyperLinkPlugin);
  const wb = univer.createUnit(core.UniverInstanceType.UNIVER_SHEET, structuredClone(snapshot));
  univer.__getInjector().get(core.IUniverInstanceService).focusUnit(wb.getUnitId());
  const cmd = univer.__getInjector().get(core.ICommandService);
  const sheet = wb.getActiveSheet();
  const range = (row, column, rows = 1, cols = 1) => ({
    getCellData: () => sheet.getCell(row, column),
    getCellStyleData: () => wb.getStyles().getStyleByCell(sheet.getCell(row, column)),
    getRow: () => row, getColumn: () => column, getWidth: () => cols, getHeight: () => rows,
  });
  const port = { unitId: wb.getUnitId(), sheet: { getSheetId: () => sheet.getSheetId(), getRange: range },
    range: range(0, 0), workbook: {}, api: {}, selection: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 3 },
    execute: (id, params) => cmd.syncExecuteCommand(id, params),
  };
  return { univer, wb, cmd, port, cell: (col = 0) => sheet.getCell(0, col),
    api: { getActiveWorkbook: () => ({ getActiveSheet: () => ({ getSheetId: () => "s1", getSelection: () => ({ getActiveRange: () => range(0, 0) }) }) }) },
    save: () => wb.save(), close: () => univer.dispose() };
}

test("Grid native commands preserve list/px leading/link/case/indent on save, reopen and undo", () => {
  const e = engine();
  let reopened, decreased;
  try {
    for (const [id, value] of [["list", "ordered"], ["line-height", 30], ["link", "https://example.com/a"],
      ["case", "upper"], ["indent-increase"], ["vertical-text", true], ["align", "justify"]]) {
      const result = runGridUniverCommand(id, e.port, { value, ...(typeof value === "boolean" ? { on: value } : {}) });
      assert.equal(result.ok, true, `${id}: ${JSON.stringify(result)}`);
    }
    assert.equal(e.cell().p.body.dataStream, "ALPHA\rBETA\r\n");
    assert.deepEqual(gridRichTextState(e.cell()), { list: "ordered", lineHeight: 30, indent: 24, link: "https://example.com/a" });
    assert.equal(e.cell().p.body.textRuns[0].ts.bl, 1, "converting plain cell to rich text preserves its font");
    assert.equal(e.cell(1).v, 10);
    assert.equal(e.cell(2).f, "=1+1", "content commands leave formulas intact");
    assert.equal(e.cell(3).p.body.dataStream, "SECOND\r\n", "whole selection is applied, not just its first cell");
    const style = readGridSelectionStyle(e.api).style;
    assert.deepEqual([style.list, style.lineHeight, style.link, style.verticalText, style.indent, style.align],
      ["ordered", 30, "https://example.com/a", true, 24, "justify"]);
    const saved = gridWorkingCopy(JSON.parse(JSON.stringify(e.save())));
    assert.ok(saved);
    reopened = engine(saved);
    assert.deepEqual(gridRichTextState(reopened.cell()), gridRichTextState(e.cell()));
    assert.deepEqual(readGridSelectionStyle(reopened.api).style, style);
    assert.equal(e.cmd.syncExecuteCommand("univer.command.undo"), true);
    assert.equal(readGridSelectionStyle(e.api).style.align, "left");
    assert.equal(e.cmd.syncExecuteCommand("univer.command.redo"), true);
    assert.equal(readGridSelectionStyle(e.api).style.align, "justify");
    assert.equal(runGridUniverCommand("indent-decrease", reopened.port).ok, true);
    decreased = engine(gridWorkingCopy(JSON.parse(JSON.stringify(reopened.save()))));
    assert.equal(gridRichTextState(decreased.cell()).indent, 0, "decreased indentation survives another native reopen");
  } finally { decreased?.close(); reopened?.close(); e.close(); }
});

test("Grid command failures fail closed; case keeps Unicode run and hyperlink boundaries", () => {
  const source = { p: { body: { dataStream: "straße\r\n", paragraphs: [{ startIndex: 6 }], sectionBreaks: [{ startIndex: 7 }],
    textRuns: [{ st: 0, ed: 6, ts: { bl: 1 } }], customRanges: [{ startIndex: 0, endIndex: 5, rangeType: 0, properties: { url: "https://example.com" } }] } } };
  const result = gridRichTextCell(source, "case", "upper");
  assert.equal(result.p.body.dataStream, "STRASSE\r\n");
  assert.equal(result.p.body.textRuns[0].ed, 7);
  assert.equal(result.p.body.customRanges[0].endIndex, 6);
  assert.equal(result.p.body.paragraphs[0].startIndex, 7);
  assert.equal(source.p.body.dataStream, "straße\r\n", "no mutation before native command succeeds");
  const crlf = gridRichTextCell({ v: "a\r\nb" }, "case", "upper");
  assert.equal(crlf.p.body.dataStream, "A\rB\r\n");
  assert.equal(crlf.p.body.textRuns[0].ed, 3);
  for (const value of ["javascript:alert(1)", "data:text/html,bad", "file:///private"]) assert.equal(gridRichTextCell(source, "link", value), null);
  for (const value of [NaN, Infinity, 0, -1, 301]) assert.equal(gridRichTextCell(source, "line-height", value), null);
  const e = engine();
  try {
    assert.equal(runGridUniverCommand("link", e.port, { value: "javascript:alert(1)" }).ok, false);
    assert.equal(runGridUniverCommand("case", e.port, { value: "bogus" }).ok, false);
    e.port.selection.endRow = 100_000;
    assert.equal(runGridUniverCommand("list", e.port, { value: "bullet" }).ok, false);
  } finally { e.close(); }
});

test("Grid commits in-progress native cell text before transforming and cancels stale/read-only targets", async () => {
  const e = engine();
  try {
    e.port.workbook = { isCellEditing: () => true, endEditingAsync: async save => {
      assert.equal(save, true);
      assert.equal(e.port.execute("sheet.command.set-range-values", { unitId: e.port.unitId, subUnitId: "s1",
        range: { ...e.port.selection }, value: { 0: { 0: { v: "Live typing", t: 1 } } } }), true);
      return true;
    } };
    const settled = await settleGridTextPort(e.port, () => e.port, () => false);
    assert.equal(runGridUniverCommand("case", settled, { value: "upper" }).ok, true);
    assert.equal(e.cell().p.body.dataStream, "LIVE TYPING\r\n");
    assert.equal(await settleGridTextPort(e.port, () => e.port, () => true), null, "a permission change during commit cancels the format write");
    assert.equal(await settleGridTextPort(e.port, () => ({ ...e.port, selection: { ...e.port.selection, startRow: 1 } }), () => false), null);
    assert.equal(await settleGridTextPort(e.port, () => ({ ...e.port, unitId: "other" }), () => false), null);
    e.port.workbook.endEditingAsync = async () => false;
    assert.equal(await settleGridTextPort(e.port, () => e.port, () => false), null);
  } finally { e.close(); }
});

test("Univer paragraph layout renders ordered/bullet glyphs, exact px leading and indent after reopen", () => {
  const render = univerRequire("@univerjs/engine-render");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  // Only font measurement is deterministic; paragraph shaping/layout is the actual engine.
  const ctx = { font: "", measureText: text => ({ width: text.length * 8,
    fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ getContext: () => ctx, style: {} }) } });
  try {
    for (const list of ["ordered", "bullet"]) {
      let cell = { v: "Alpha\nbeta" };
      for (const [id, value] of [["list", list], ["line-height", 30], ["indent-increase"]]) cell = gridRichTextCell(cell, id, value);
      const p = JSON.parse(JSON.stringify(cell.p));
      p.documentStyle = { pageSize: { width: 200, height: 200 }, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };
      const model = new core.DocumentDataModel(p);
      const view = new render.DocumentViewModel(model);
      const locale = new core.LocaleService();
      const skeleton = render.DocumentSkeleton.create(view, locale);
      try {
        skeleton.calculate();
        const lines = skeleton.getSkeletonData().pages[0].sections[0].columns[0].lines;
        assert.deepEqual(lines.map(line => line.lineHeight), [30, 30]);
        assert.deepEqual(lines.map(line => line.divides[0].left), [24, 24]);
        assert.deepEqual(lines.map(line => line.divides[0].glyphGroup[0].content), list === "ordered" ? ["1.", "2."] : ["●", "●"]);
      } finally { skeleton.dispose(); view.dispose(); model.dispose(); locale.dispose(); }
    }
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
  }
});

test("Grid XLSX keeps justify/vertical text/link/list markers and discloses paragraph limitations", async () => {
  const e = engine();
  try {
    for (const [id, value] of [["list", "ordered"], ["line-height", 30], ["link", "https://example.com"],
      ["indent-increase"], ["vertical-text", true], ["align", "justify"]]) assert.equal(runGridUniverCommand(id, e.port, { value, on: true }).ok, true);
    const output = await buildGridXlsxFromUniverSnapshot(e.save());
    const excel = new ExcelJS.Workbook();
    await excel.xlsx.load(Buffer.from(await output.blob.arrayBuffer()));
    const cell = excel.worksheets[0].getCell("A1");
    assert.equal(cell.value.text, "1. Alpha\n2. beta");
    assert.equal(cell.value.hyperlink, "https://example.com");
    assert.equal(cell.font?.bold, true, "a hyperlink retains the native text's bold font");
    assert.equal(cell.font?.size, 16);
    assert.deepEqual([cell.alignment.horizontal, cell.alignment.textRotation, cell.alignment.indent], ["justify", "vertical", 1]);
    for (const feature of ["行距", "列表", "缩进"]) assert.ok(output.dropped.some((text) => text.includes(feature)));
    assert.equal(runGridUniverCommand("link", e.port, { value: "" }).ok, true);
    const plainList = await buildGridXlsxFromUniverSnapshot(e.save());
    const listExcel = new ExcelJS.Workbook();
    await listExcel.xlsx.load(Buffer.from(await plainList.blob.arrayBuffer()));
    const runs = listExcel.worksheets[0].getCell("A1").value.richText;
    assert.equal(runs.map(run => run.text).join(""), "1. Alpha\n2. beta");
    assert.ok(runs.filter(run => run.text.includes("Alpha") || run.text.includes("beta")).every(run => run.font.bold));
    const mixed = structuredClone(e.cell());
    mixed.p.body.textRuns = [{ st: 0, ed: 5, ts: { bl: 1, fs: 16 } }, { st: 6, ed: 10, ts: { it: 1, fs: 22 } }];
    const linkedMixed = gridRichTextCell(mixed, "link", "https://mixed.example");
    assert.equal(e.port.execute("sheet.command.set-range-values", { unitId: e.port.unitId, subUnitId: "s1",
      range: { ...e.port.selection }, value: { 0: { 0: linkedMixed } } }), true);
    const mixedExport = await buildGridXlsxFromUniverSnapshot(e.save());
    assert.ok(mixedExport.dropped.some(text => text.includes("段内混合字体")), "linked mixed fonts must never be silently flattened");
    assert.deepEqual(EDIT_BAR_CANON_ENGINE_SCOPES["grid-cell"].highlight, { scope: "cell-background", label: "单元格底色", nativeProperty: "bg" });
  } finally { e.close(); }
});

test("normal and Pro native link commands share ranges: distinct ids, native cancellation, save/reopen", () => {
  const e = engine();
  try {
    assert.equal(runGridUniverCommand("link", e.port, { value: "https://example.com" }).ok, true);
    const first = e.cell().p.body.customRanges[0];
    assert.notEqual(first.rangeId, e.cell(3).p.body.customRanges[0].rangeId);
    assert.equal(e.cmd.syncExecuteCommand(hyper.CancelHyperLinkCommand.id, { unitId: e.port.unitId,
      subUnitId: "s1", row: 0, column: 0, id: first.rangeId }), true);
    assert.equal(e.cell().p.body.dataStream, "Alpha\rbeta\r\n");
    assert.equal(gridRichTextState(e.cell()).link, "");
    assert.equal(gridRichTextState(e.cell(3)).link, "https://example.com");
    // A rich document produced by the native add helper is editable by our shared command.
    const native = structuredClone(e.cell().p);
    const tx = core.BuildTextUtils.customRange.add({ body: native.body,
      ranges: [{ startOffset: 0, endOffset: 5, collapsed: false }], rangeId: "native-ribbon-link", rangeType: 0,
      properties: { url: "https://native.example" } });
    native.body = core.TextX.apply(native.body, tx.serialize());
    const cleared = gridRichTextCell({ p: native }, "link", "");
    assert.equal(cleared.p.body.dataStream, native.body.dataStream);
    assert.equal(gridRichTextState(cleared).link, "");
    assert.deepEqual(cleared.p.body.textRuns, native.body.textRuns);
  } finally { e.close(); }
});

test("PDF reports only capabilities supported by its native overlay and AP writer", () => {
  const controls = pdfSelectionControls("freetext", { contents: "Hello", fontFamily: 4 }, x => x, true);
  const ids = controls.map(c => c.id);
  for (const id of ["case", "clear-format"]) assert.ok(ids.includes(id));
  assert.equal(pdfSelectionControls("freetext", {}, x => x, false).some(control => control.id === "case"), false, "idle tool settings must not transform the creation placeholder");
  for (const id of PDF_FREETEXT_ENGINE_GAPS) assert.ok(!ids.includes(id));
  assert.deepEqual(controls.find(control => control.id === "align").options.map(option => option.value), ["left", "center", "right"]);
  const stampIds = pdfSelectionControls("stamp", {}, x => x, true).map(c => c.id);
  assert.deepEqual(stampIds, ["rotate", "delete"]);
  for (const id of PDF_STAMP_ENGINE_GAPS) assert.ok(!stampIds.includes(id));
  assert.equal(pdfSelectionPatch("stamp", {}, "bold", true), null);
  assert.equal(pdfSelectionPatch("stamp", {}, "opacity", 40), null);
  assert.equal(pdfSelectionPatch("freetext", {}, "rotate"), null);
});

test("PDFium writes native case/reset/rotated STAMP appearances, renders and reopens without loss", async () => {
  const wasm = await servePdfiumWasm();
  const { createPdfiumEngine } = await import(require.resolve("@embedpdf/engines/pdfium-direct-engine"));
  let engine, doc, reopened;
  try {
    engine = await createPdfiumEngine(wasm.url);
    const pdf = await PDFDocument.create(); pdf.addPage([300, 300]);
    doc = await engine.openDocumentBuffer({ id: "pdf-toolbar", content: Uint8Array.from(await pdf.save()).buffer }).toPromise();
    let annotation = { id: "text", type: 3, pageIndex: 0, rect: { origin: { x: 20, y: 30 }, size: { width: 180, height: 50 } },
      contents: "Hello Pdf", fontFamily: 5, fontSize: 20, fontColor: "#ff0000", textAlign: 0, verticalAlign: 0, opacity: 1, flags: ["print"] };
    annotation.id = await engine.createPageAnnotation(doc, doc.pages[0], annotation).toPromise();
    for (const [id, value] of [["case", "upper"], ["clear-format"]]) {
      const original = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: 1, dpr: 1, withAnnotations: true }).toPromise();
      annotation = { ...annotation, ...pdfSelectionPatch("freetext", annotation, id, value) };
      assert.equal(await engine.updatePageAnnotation(doc, doc.pages[0], annotation).toPromise(), true);
      const changed = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: 1, dpr: 1, withAnnotations: true }).toPromise();
      assert.equal(Buffer.from(changed.data).equals(Buffer.from(original.data)), false, `${id} changes actual rendered glyphs`);
      // Same portable JSON that the working-copy autosave/reopen pipeline stores.
      annotation = pdfWorkingJson(annotation);
    }
    const opaqueText = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: 1, dpr: 1, withAnnotations: true }).toPromise();
    annotation = { ...annotation, ...pdfSelectionPatch("freetext", annotation, "opacity", 40) };
    assert.equal(await engine.updatePageAnnotation(doc, doc.pages[0], annotation).toPromise(), true);
    const fadedText = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: 1, dpr: 1, withAnnotations: true }).toPromise();
    assert.equal(Buffer.from(opaqueText.data).equals(Buffer.from(fadedText.data)), false, "native FreeText opacity changes pixels");
    // An asymmetric PNG makes a 90° rotation observable in the raster, not just metadata.
    const upng = createRequire(require.resolve("pdf-lib"))("@pdf-lib/upng").default;
    const png = new Uint8Array(upng.encode([new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]).buffer], 2, 1, 0));
    let stamp = { id: "stamp", type: 13, pageIndex: 0, rect: { origin: { x: 30, y: 150 }, size: { width: 80, height: 40 } }, flags: ["print"], opacity: 1 };
    stamp.id = await engine.createPageAnnotation(doc, doc.pages[0], stamp, { data: png.buffer, mimeType: "image/png" }).toPromise();
    const unrotated = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: 1, dpr: 1, withAnnotations: true }).toPromise();
    const { patching: { patchStamp } } = await import("@embedpdf/plugin-annotation");
    // AnnotationPlugin.buildPatch does this before committing the toolbar's rotation.
    stamp = { ...stamp, ...patchStamp(stamp, { type: "property-update", changes: pdfSelectionPatch("stamp", stamp, "rotate") }) };
    assert.equal(await engine.updatePageAnnotation(doc, doc.pages[0], stamp).toPromise(), true);
    const before = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: 1, dpr: 1, withAnnotations: true }).toPromise();
    assert.equal(Buffer.from(before.data).equals(Buffer.from(unrotated.data)), false, "rotate changes the stamp pixels");
    const top = (145 * before.width + 70) * 4;
    const bottom = (195 * before.width + 70) * 4;
    assert.ok(before.data[top] > 200 && before.data[top + 2] < 50, "clockwise rotation puts the original red left half at the top");
    assert.ok(before.data[bottom] < 50 && before.data[bottom + 2] > 200, "the original blue right half rotates to the bottom rather than merely stretching");
    assert.equal(await engine.updatePageAnnotation(doc, doc.pages[0], { ...stamp, opacity: 0.4 }).toPromise(), true);
    const ignoredOpacity = await engine.renderPageRaw(doc, doc.pages[0], { scaleFactor: 1, dpr: 1, withAnnotations: true }).toPromise();
    assert.equal(Buffer.from(before.data).equals(Buffer.from(ignoredOpacity.data)), true, "STAMP opacity is ignored, so the adapter must not expose it");
    const bytes = await engine.saveAsCopy(doc).toPromise();
    reopened = await engine.openDocumentBuffer({ id: "reopened-toolbar", content: bytes }).toPromise();
    const annotations = await engine.getPageAnnotations(reopened, reopened.pages[0]).toPromise();
    const text = annotations.find(a => a.type === 3);
    assert.deepEqual([text.contents, text.fontFamily, text.fontSize, text.fontColor], ["HELLO PDF", 4, 12, "#000000"]);
    assert.ok(Math.abs(text.opacity - 0.4) < 1 / 255);
    assert.equal(annotations.find(a => a.type === 13).rotation, 90);
    assert.equal(annotations.find(a => a.type === 13).opacity, undefined);
    const after = await engine.renderPageRaw(reopened, reopened.pages[0], { scaleFactor: 1, dpr: 1, withAnnotations: true }).toPromise();
    assert.equal(Buffer.from(after.data).equals(Buffer.from(before.data)), true, "live AP and saved/reopened AP draw exactly the same pixels");
    assert.ok(after.data.some((n, index) => index % 4 !== 3 && n < 100), "appearance is not a blank page");
  } finally {
    if (reopened) await engine.closeDocument(reopened).toPromise();
    if (doc) await engine.closeDocument(doc).toPromise();
    await wasm.close();
  }
});
