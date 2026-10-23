// 10-23 编辑器整改 W06：PDF 的 agent 指令面（D4 之后只暴露新能力）。
import assert from "node:assert/strict";
import test from "node:test";

import { PDF_SUBTYPE } from "../src/shell/media-editors/pdf-viewer-bridge.ts";
import {
  PDF_COMMAND_SPECS,
  buildPdfCommandSurface,
} from "../src/shell/media-editors/pdf-command-surface.ts";

const named = (calls, name) => calls.filter((call) => call[0] === name);

// ---------------------------------------------------------------------------
// agent 指令面：只有新能力

function commandEditor(calls, overrides = {}) {
  return {
    bridge: {
      goToPage: (page) => calls.push(["goToPage", page]),
      searchHits: async (query) =>
        query === "none"
          ? []
          : [{ pageIndex: 1, rects: [{ origin: { x: 10, y: 20 }, size: { width: 30, height: 10 } }] }],
      revealHit: () => undefined,
      createAnnotation: (pageIndex, annotation) => {
        calls.push(["createAnnotation", pageIndex, annotation]);
        return true;
      },
      pages: () => Array.from({ length: 4 }, (_, index) => ({ index, size: { width: 600, height: 800 }, rotation: 0 })),
      annotationCount: () => 7,
    },
    loading: false,
    processing: false,
    pageCount: 4,
    currentPage: 2,
    zoom: 100,
    dirty: false,
    editRevision: 3,
    error: "",
    rotatePage: async (...args) => {
      calls.push(["rotatePage", ...args]);
      return true;
    },
    deletePage: async (...args) => {
      calls.push(["deletePage", ...args]);
      return true;
    },
    ...overrides,
  };
}
const commandDeps = (calls) => ({
  download: async () => {
    calls.push(["download"]);
    return "";
  },
  save: async () => {
    calls.push(["save"]);
    return { ok: true, message: "saved" };
  },
});

test("the PDF command surface lists only the new abilities", () => {
  assert.deepEqual(PDF_COMMAND_SPECS.map((spec) => spec.id), [
    "pdf.go-to-page",
    "pdf.find-text",
    "pdf.add-highlight",
    "pdf.add-text",
    "pdf.add-check",
    "pdf.rotate-page",
    "pdf.delete-page",
    "pdf.export",
    "pdf.save",
  ]);
  const calls = [];
  const surface = buildPdfCommandSurface(commandEditor(calls), commandDeps(calls));
  assert.equal(surface.describe().length, PDF_COMMAND_SPECS.length);
  // 没载入时只剩下载（只读）。
  const loading = buildPdfCommandSurface(commandEditor(calls, { loading: true }), commandDeps(calls));
  assert.deepEqual(loading.describe().map((spec) => spec.id), ["pdf.export"]);
  assert.equal(JSON.parse(JSON.stringify(surface.state())).annotationCount, 7);
});

test("PDF commands create standard annotations and refuse what they cannot do", async () => {
  const calls = [];
  const surface = buildPdfCommandSurface(commandEditor(calls), commandDeps(calls));
  const check = await surface.run("pdf.add-check", { page: 3, x: 50, y: 60 });
  assert.equal(check.ok, true);
  assert.equal(check.revision, 3);
  const created = named(calls, "createAnnotation")[0];
  assert.equal(created[1], 2);
  assert.equal(created[2].type, PDF_SUBTYPE.INK);
  const text = await surface.run("pdf.add-text", { text: "张三", x: 40, y: 50 });
  assert.equal(text.ok, true);
  assert.equal(named(calls, "createAnnotation")[1][2].type, PDF_SUBTYPE.FREETEXT);
  assert.equal(named(calls, "createAnnotation")[1][2].contents, "张三");
  const highlight = await surface.run("pdf.add-highlight", { text: "abc" });
  assert.equal(highlight.ok, true);
  assert.equal(named(calls, "createAnnotation")[2][2].type, PDF_SUBTYPE.HIGHLIGHT);
  assert.equal((await surface.run("pdf.add-highlight", { text: "none" })).ok, false);
  const rotate = await surface.run("pdf.rotate-page", { page: 4, direction: "ccw" });
  assert.equal(rotate.ok, true);
  assert.deepEqual(named(calls, "rotatePage")[0], ["rotatePage", 3, false]);
  const outside = await surface.run("pdf.go-to-page", { page: 9 });
  assert.equal(outside.ok, false);
  assert.match(outside.message, /只有 4 页/);
  const offPage = await surface.run("pdf.add-text", { text: "x", x: 9999, y: 1 });
  assert.equal(offPage.ok, false);
  for (const removed of ["pdf.add-blank-page", "pdf.merge", "pdf.extract-pages", "pdf.move-page"]) {
    const result = await surface.run(removed, {});
    assert.equal(result.ok, false, removed);
  }
  const onePage = buildPdfCommandSurface(commandEditor(calls, { pageCount: 1, currentPage: 1 }), commandDeps(calls));
  assert.equal((await onePage.run("pdf.delete-page", {})).ok, false);
  assert.equal((await surface.run("pdf.save", {})).ok, true);
  assert.equal((await surface.run("pdf.export", {})).ok, true);
});

