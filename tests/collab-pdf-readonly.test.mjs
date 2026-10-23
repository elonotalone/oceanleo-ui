// F05 追加：PDF 路由的 Leo 指令面在只读时挡住会改文档的指令；可编辑时与改动前一致。
// 10-23 D4：指令面换成 `media-editors/pdf-command-surface.ts`（只有新能力），闸照旧。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { guardPluginSurface, VIEW_ONLY_REFUSAL } from "../src/shell/collab/adapters/visual-readonly.ts";
import { buildPdfCommandSurface } from "../src/shell/media-editors/pdf-command-surface.ts";

function pdfEditor(calls) {
  const bridge = {
    goToPage: (...args) => calls.push(["goToPage", ...args]),
    searchHits: async () => [{ pageIndex: 0, rects: [{ origin: { x: 10, y: 10 }, size: { width: 40, height: 12 } }] }],
    revealHit: () => undefined,
    createAnnotation: (...args) => {
      calls.push(["createAnnotation", args[0], args[1].type]);
      return true;
    },
    pages: () => Array.from({ length: 6 }, (_, index) => ({ index, size: { width: 600, height: 800 }, rotation: 0 })),
    annotationCount: () => 0,
  };
  return {
    bridge,
    loading: false,
    processing: false,
    pageCount: 6,
    currentPage: 2,
    zoom: 100,
    dirty: false,
    editRevision: 1,
    error: "",
    rotatePage: async (...args) => {
      calls.push(["rotatePage", ...args]);
      return true;
    },
    deletePage: async (...args) => {
      calls.push(["deletePage", ...args]);
      return true;
    },
  };
}

const deps = {
  download: async () => "",
  save: async () => ({ ok: true, message: "saved" }),
};

const PARAMS = {
  "pdf.add-highlight": { text: "abc" },
  "pdf.add-text": { text: "填表", x: 50, y: 60 },
  "pdf.add-check": { x: 50, y: 60 },
};

test("只读：会改文档的指令被挡住且不碰编辑器；只看的指令照常", async () => {
  const calls = [];
  const raw = buildPdfCommandSurface(pdfEditor(calls), deps);
  const surface = guardPluginSurface(raw, true);
  const specs = surface.describe();
  assert.deepEqual(specs, raw.describe(), "describe 原样，agent 仍看得到有哪些指令");
  const mutating = specs.filter((spec) => spec.mutates);
  assert.ok(mutating.length >= 5, "PDF 有一批会改文档的指令");
  for (const spec of mutating) {
    const params = PARAMS[spec.id] ?? {};
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
  for (const [id, params] of [["pdf.delete-page", {}], ["pdf.rotate-page", { direction: "ccw" }], ["pdf.go-to-page", { page: 3 }], ["pdf.add-check", PARAMS["pdf.add-check"]]]) {
    const a = await raw.run(id, params);
    const b = await guarded.run(id, params);
    assert.deepEqual(b, a, `${id} 结果一致`);
  }
  assert.deepEqual(callsB, callsA);
  assert.ok(callsB.some((call) => call[0] === "deletePage"), "确实调到了编辑器");
  assert.ok(callsB.some((call) => call[0] === "rotatePage" && call[2] === false), "逆时针传到了编辑器");
});

test("PdfRoute 的指令面经过只读闸，只有这一处", async () => {
  const route = await readFile(resolve("src/shell/advanced-routes/PdfRoute.tsx"), "utf8");
  assert.match(route, /from "\.\.\/collab\/adapters\/visual-readonly"/);
  assert.match(route, /from "\.\.\/media-editors\/pdf-command-surface"/);
  assert.match(
    route,
    /usePluginCommandSurface\(\s*useMemo\(\s*\(\) =>\s*guardPluginSurface\(\s*buildPdfCommandSurface\(editor,[\s\S]*?\),\s*readOnly,\s*\),/,
  );
  assert.equal((route.match(/usePluginCommandSurface\(/g) ?? []).length, 1, "PDF 路由只有这一处指令面");
});
