// F05 追加：PDF 路由的 Leo 指令面在只读时挡住会改文档的指令；可编辑时与改动前一致。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { guardPluginSurface, VIEW_ONLY_REFUSAL } from "../src/shell/collab/adapters/visual-readonly.ts";
import { buildPdfCommandSurface } from "../src/shell/doc-editors/doc-family-commands.ts";

function pdfEditor(calls) {
  const record = (name) => async (...args) => {
    calls.push([name, ...args]);
  };
  return {
    readerState: "text-ready",
    failure: null,
    textLayer: { status: "ready", present: true, totalCharacters: 900, coveragePageRatio: 1, extractor: "pdfjs" },
    manifest: null,
    searchFullText: () => [],
    pageNumber: 2,
    pageCount: 6,
    rotation: 0,
    zoom: 100,
    annotations: [],
    loading: false,
    rendering: false,
    processing: false,
    dirty: false,
    editRevision: 1,
    error: "",
    notice: "",
    goToPage: (...args) => calls.push(["goToPage", ...args]),
    extractPages: record("extractPages"),
    deleteCurrentPage: record("deleteCurrentPage"),
    rotateCurrentPage: record("rotateCurrentPage"),
    addBlankPage: record("addBlankPage"),
    moveCurrentPage: record("moveCurrentPage"),
    movePage: record("movePage"),
    save: record("save"),
    saveCopy: record("saveCopy"),
    download: () => calls.push(["download"]),
  };
}

const deps = { download: async () => "" };

test("只读：会改文档的指令被挡住且不碰编辑器；只看的指令照常", async () => {
  const calls = [];
  const raw = buildPdfCommandSurface(pdfEditor(calls), deps);
  const surface = guardPluginSurface(raw, true);
  const specs = surface.describe();
  assert.deepEqual(specs, raw.describe(), "describe 原样，agent 仍看得到有哪些指令");
  const mutating = specs.filter((spec) => spec.mutates);
  assert.ok(mutating.length >= 5, "PDF 有一批会改文档的指令");
  for (const spec of mutating) {
    const params = spec.id === "pdf.move-page" ? { from: 1, to: 3 } : spec.id === "pdf.extract-pages" ? { pages: "1-2" } : {};
    const result = await surface.run(spec.id, params);
    assert.equal(result.ok, false, `${spec.id} 只读时必须被拒`);
    assert.equal(result.message, VIEW_ONLY_REFUSAL);
  }
  assert.deepEqual(calls, [], "被拒的指令一个都不许进编辑器");
  const goTo = await surface.run("pdf.go-to-page", { page: 3 });
  assert.equal(goTo.ok, true);
  assert.deepEqual(calls, [["goToPage", 3]]);
});

test("可编辑：指令面就是原来那一份（行为与未包装一致）", async () => {
  const callsA = [];
  const callsB = [];
  const raw = buildPdfCommandSurface(pdfEditor(callsA), deps);
  const guarded = guardPluginSurface(buildPdfCommandSurface(pdfEditor(callsB), deps), false);
  assert.deepEqual(guarded.describe(), raw.describe());
  for (const [id, params] of [["pdf.delete-page", {}], ["pdf.rotate-page", { degrees: 90 }], ["pdf.go-to-page", { page: 3 }]]) {
    const a = await raw.run(id, params);
    const b = await guarded.run(id, params);
    assert.deepEqual(b, a, `${id} 结果一致`);
  }
  assert.deepEqual(callsB, callsA);
  assert.ok(callsB.some((call) => call[0] === "deleteCurrentPage"), "确实调到了编辑器");
});

test("PdfRoute 的指令面经过只读闸，新旧两核共用这一处", async () => {
  const route = await readFile(resolve("src/shell/advanced-routes/PdfRoute.tsx"), "utf8");
  assert.match(route, /from "\.\.\/collab\/adapters\/visual-readonly"/);
  assert.match(
    route,
    /usePluginCommandSurface\(\s*useMemo\(\s*\(\) =>\s*guardPluginSurface\(\s*buildPdfCommandSurface\(nextCoreEditor,[^)]*\),\s*collabReadOnly,\s*\),\s*\[nextCoreEditor, downloadAs, collabReadOnly\]/,
  );
  assert.equal((route.match(/usePluginCommandSurface\(/g) ?? []).length, 1, "PDF 路由只有这一处指令面");
});
