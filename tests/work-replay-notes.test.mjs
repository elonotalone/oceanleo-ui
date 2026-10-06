// F04：回放里「这一步改了什么」的说明文字，全部走 tt 模板，且每个模板都有 16 种非中文译文。
//   ① 源码里每个说明模板（适配器的 *ChangeNote、各画法的 describe*Change）都登记在 REPLAY_NOTE_TEMPLATES；
//   ② 登记的每个模板在 16 个非中文语种里都有译文，且占位符与中文源一致；
//   ③ 十三个画法各取两三种典型改动，用「非中文 tt」跑一遍，输出里不再有中文、也没有残留的 {占位符}。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { REPLAY_NOTE_TEMPLATES } from "../src/i18n/ui/messages/work-replay-copy.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const NON_ZH = LOCALES.filter((locale) => locale !== "zh");
const HAN = /[\u3400-\u9fff]/;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// ---- ① 源码里的模板都已登记 ---------------------------------------------------
const ADAPTERS = ["chart", "image", "vector", "deck", "richdoc", "grid", "pdf"].map((n) => `src/shell/collab/adapters/${n}.ts`);
const FRAMES = ["video", "audio", "model3d", "game", "pdf", "workflow"].map((n) => `src/shell/replay/work/frames/${n}.tsx`);

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
function literalsIn(source) {
  source = stripComments(source);
  const out = new Set();
  for (const re of [/\bzh:\s*"([^"]+)"/g, /\b(?:tt|t)\(\s*"([^"]+)"/g, /^\s+\w+:\s*"(新增了一个[^"]*)",?$/gm]) {
    for (const m of source.matchAll(re)) if (HAN.test(m[1])) out.add(m[1]);
  }
  return out;
}
function describeBodies(source) {
  // 只取 `export function describeXxxChange(...) { ... }` 这一段，免得把画面上的标签（tt("音量")）当成说明模板
  return [...source.matchAll(/export function describe\w+Change[\s\S]*?\n\}\n/g)].map((m) => m[0]).join("\n");
}

/** 源码里扫到的全部说明模板（含各适配器里早就有译文的，和这次新加的）。 */
function scanTemplates() {
  const found = new Set();
  for (const path of ADAPTERS) for (const lit of literalsIn(read(path))) found.add(lit);
  for (const path of FRAMES) for (const lit of literalsIn(describeBodies(read(path)))) found.add(lit);
  found.add("{a}，{b}");
  return [...found].sort();
}

test("说明模板：这次新增的模板都登记进 REPLAY_NOTE_TEMPLATES，且都是源码里真在用的", () => {
  const found = new Set(scanTemplates());
  assert.ok(found.size >= 60, `扫到的模板数太少（${found.size}），扫描规则可能失效`);
  const replayUi = read("src/shell/replay/work/WorkReplayTimeline.tsx") + read("src/shell/replay/work/WorkReplayPlayer.tsx") + read("src/shell/replay/work/fork-artifact.ts");
  for (const template of REPLAY_NOTE_TEMPLATES) {
    assert.ok(found.has(template) || replayUi.includes(`"${template}"`), `登记了但源码里没用：${template}`);
  }
  assert.equal(new Set(REPLAY_NOTE_TEMPLATES).size, REPLAY_NOTE_TEMPLATES.length, "不重复登记");
});

// ---- ② 每个模板 16 种非中文译文 -------------------------------------------------
test("说明模板：源码里逐个列举，每个都有 16 种非中文译文、占位符一致", () => {
  assert.equal(NON_ZH.length, 16);
  const templates = scanTemplates();
  assert.ok(templates.length >= 60);
  const problems = [];
  for (const template of templates) {
    for (const locale of NON_ZH) {
      const text = UI_MESSAGES[locale]?.[template];
      if (typeof text !== "string" || !text.trim()) {
        problems.push(`${locale} 缺：${template}`);
        continue;
      }
      // 繁体中文、日文本来就含汉字：只要求与简体中文源不同；其余语种不许有汉字
      // （繁体里很多句子与简体写法一样，所以 zh-TW 只要求有译文条目）
      if (locale === "ja") {
        if (text === template) problems.push(`${locale} 与中文源相同：${template}`);
      } else if (locale === "zh-TW") {
        // 只要求存在
      } else if (HAN.test(text)) problems.push(`${locale} 仍含中文：${template} → ${text}`);
      if (placeholders(text).join() !== placeholders(template).join()) problems.push(`${locale} 占位符不一致：${template} → ${text}`);
    }
  }
  assert.deepEqual(problems, []);
});

// ---- ③ 十三个画法：非中文 tt 下的输出 --------------------------------------------
const makeTt = (locale) => (zh, vars) => {
  const template = UI_MESSAGES[locale]?.[zh] ?? zh;
  return vars ? template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : template;
};
const sample = ["en", "de", "ar", "es-419", "ko", "th", "hi", "vi"];

const useUIStub = dataModule(`export function useUI(){ return (zh, vars) => zh; }`);
const stubs = { "../../../../i18n/ui/useUI": useUIStub };
const frame = async (name) => (await import(await compileModule(`src/shell/replay/work/frames/${name}.tsx`, stubs))).default;
const R = {};
for (const name of ["chart", "image", "vector", "deck", "richdoc", "grid", "video", "audio", "model3d", "game", "pdf", "workflow"]) R[name] = await frame(name);

function assertTranslated(label, produce) {
  const zh = produce(makeTt("zh"));
  assert.ok(typeof zh === "string" && HAN.test(zh), `${label}：中文输出应非空 → ${zh}`);
  for (const locale of sample) {
    const out = produce(makeTt(locale));
    assert.ok(typeof out === "string" && out.length > 0, `${label}/${locale} 无输出`);
    assert.ok(!HAN.test(out), `${label}/${locale} 仍含中文：${out}`);
    assert.ok(!/\{\w+\}/.test(out), `${label}/${locale} 残留占位符：${out}`);
  }
}

test("画法说明：richdoc / grid（原来就带 tt，确认链路没断）", () => {
  const para = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const before = R.richdoc.fromRevision({ type: "doc", content: [para("一"), para("二")] });
  const after = R.richdoc.fromRevision({ type: "doc", content: [para("一"), para("二"), para("三"), para("四")] });
  assertTranslated("richdoc 新增", (tt) => R.richdoc.describeChange(before, after, tt));
  const edited = R.richdoc.fromRevision({ type: "doc", content: [para("一"), para("改了")] });
  assertTranslated("richdoc 改段落", (tt) => R.richdoc.describeChange(before, edited, tt));

  const sheets = (extra) => ({
    id: "wb", name: "预算", sheetOrder: ["s1", ...(extra ? ["s2"] : [])], styles: {},
    sheets: {
      s1: { id: "s1", name: "收入", rowCount: 100, columnCount: 26, cellData: { 0: { 0: { v: "项目", t: 1 } } } },
      ...(extra ? { s2: { id: "s2", name: "支出", rowCount: 20, columnCount: 8, cellData: {} } } : {}),
    },
  });
  const g1 = R.grid.fromRevision(sheets(false));
  const g2 = R.grid.fromRevision(sheets(true));
  assertTranslated("grid 新增工作表", (tt) => R.grid.describeChange(g1, g2, tt));
});

test("画法说明：video", () => {
  const clip = (id, start = 0) => ({ id, start_ms: start, duration_ms: 1000 });
  const doc = (tracks) => ({ width: 1280, height: 720, fps: 30, tracks });
  const a = R.video.fromRevision(doc([{ id: "t1", kind: "video", clips: [clip("c1")] }]));
  const added = R.video.fromRevision(doc([{ id: "t1", kind: "video", clips: [clip("c1"), clip("c2", 1000)] }, { id: "t2", kind: "audio", clips: [] }]));
  const removed = R.video.fromRevision(doc([{ id: "t1", kind: "video", clips: [] }]));
  assertTranslated("video 新增段+轨道", (tt) => R.video.describeChange(a, added, tt));
  assertTranslated("video 删段", (tt) => R.video.describeChange(a, removed, tt));
  const oneClip = R.video.fromRevision(doc([{ id: "t1", kind: "video", clips: [clip("c1"), clip("c2", 1000)] }]));
  assert.equal(R.video.describeChange(a, oneClip, (zh, v) => `[${zh}|${JSON.stringify(v ?? {})}]`), '[新增了 {n} 段|{"n":1}]');
});

test("画法说明：audio", () => {
  const op = (id, start) => ({ id, type: "crop", start, end: start + 2 });
  const a = R.audio.fromRevision({ sourceUrl: "https://m/a.mp3", operations: [op("o1", 0)] });
  const more = R.audio.fromRevision({ sourceUrl: "https://m/a.mp3", operations: [op("o1", 0), op("o2", 3)] });
  const fewer = R.audio.fromRevision({ sourceUrl: "https://m/a.mp3", operations: [] });
  assertTranslated("audio 加操作", (tt) => R.audio.describeChange(a, more, tt));
  assertTranslated("audio 撤操作", (tt) => R.audio.describeChange(a, fewer, tt));
});

test("画法说明：game / model3d / pdf / workflow", () => {
  const g1 = R.game.fromRevision({ source: "let x = 1;" });
  const g2 = R.game.fromRevision({ source: "let x = 2;\nlet y = 3;" });
  assertTranslated("game 改代码", (tt) => R.game.describeChange(g1, g2, tt));

  const scene = () => ({
    checkpointUrl: "https://m/a.glb",
    operations: [{ id: "o1", kind: "transform", target: "Chair", value: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }],
    view: { sourceUrl: "https://m/a.glb", azimuth: 35, elevation: 65, zoom: 110, autoRotate: false },
  });
  const moved = scene();
  moved.operations[0].value.position = [5, 5, 5];
  assertTranslated("model3d 动节点", (tt) => R.model3d.describeChange(R.model3d.fromRevision(scene()), R.model3d.fromRevision(moved), tt));

  const rect = (x, y, w, h) => ({ origin: { x, y }, size: { width: w, height: h } });
  const pdfJson = () => ({
    schema: "pdf-annotations@2",
    pages: [{ index: 0, widthPt: 612, heightPt: 792 }, { index: 1, widthPt: 612, heightPt: 792 }],
    annotations: [{ id: "a1", pageIndex: 0, typeName: "HIGHLIGHT", rect: rect(50, 60, 200, 20), contents: "" }],
    fields: {},
  });
  const pdfNext = pdfJson();
  pdfNext.annotations.push({ id: "a9", pageIndex: 1, typeName: "TEXT", rect: rect(1, 1, 5, 5), contents: "" });
  assertTranslated("pdf 批注", (tt) => R.pdf.describeChange(R.pdf.fromRevision(pdfJson()), R.pdf.fromRevision(pdfNext), tt));

  const flow = () => ({
    nodes: [
      { id: "n1", kind: "source", label: "素材", x: 0, y: 0, ports: {} },
      { id: "n2", kind: "trim", label: "裁剪", x: 220, y: 0, ports: {} },
    ],
    edges: [{ id: "e1", fromNodeId: "n1", fromPort: "out", toNodeId: "n2", toPort: "in" }],
  });
  const cut = flow();
  cut.edges.pop();
  assertTranslated("workflow 断线", (tt) => R.workflow.describeChange(R.workflow.fromRevision(flow()), R.workflow.fromRevision(cut), tt));
  const grown = flow();
  grown.nodes.push({ id: "n3", kind: "output", label: "输出", x: 440, y: 0, ports: {} });
  assertTranslated("workflow 加节点", (tt) => R.workflow.describeChange(R.workflow.fromRevision(flow()), R.workflow.fromRevision(grown), tt));
});

test("画法说明：chart / image / vector / deck（*ChangeNote 家族走 tt(note.zh, note.vars)）", () => {
  const chart = (series) => R.chart.fromRevision({ option: { series } });
  const c1 = chart([{ id: "s1", name: "Sales", data: [1] }]);
  assertTranslated("chart 改数据", (tt) => R.chart.describeChange(c1, chart([{ id: "s1", name: "Sales", data: [1, 2] }]), tt));
  assertTranslated("chart 新增系列", (tt) => R.chart.describeChange(c1, chart([{ id: "s1", name: "Sales", data: [1] }, { id: "s2", name: "Profit", data: [2] }]), tt));
  assertTranslated("chart 创建", (tt) => R.chart.describeChange(null, c1, tt));

  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="4" height="4"/></svg>';
  const v1 = R.vector.fromRevision(SVG);
  const v2 = R.vector.fromRevision(SVG.replace("</svg>", '<circle r="2"/></svg>'));
  assertTranslated("vector 新增图形", (tt) => R.vector.describeChange(v1, v2, tt));
  assertTranslated("vector 创建", (tt) => R.vector.describeChange(null, v1, tt));

  const slide = (id, title) => ({ id, title, elements: [] });
  const deck = (slides) => R.deck.fromRevision({ title: "年报", slides, theme: "default", aspect: "16:9" });
  const d1 = deck([slide("a", "封面")]);
  assertTranslated("deck 新增页", (tt) => R.deck.describeChange(d1, deck([slide("a", "封面"), slide("b", "目录")]), tt));
  assertTranslated("deck 改标题", (tt) => R.deck.describeChange(d1, deck([slide("a", "新标题")]), tt));

  const image = (objects) => ({
    json: { version: "6.0.0", objects: [{ type: "Rect", oceanleoId: "bg", left: 0, top: 0, width: 1080, height: 1080 }, ...objects] },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#ffffff",
  });
  const i1 = image([]);
  assertTranslated("image 新增文字图层", (tt) => R.image.describeChange(i1, image([{ type: "Textbox", oceanleoId: "t1", text: "hi" }]), tt));
  assertTranslated("image 新增多个图层", (tt) => R.image.describeChange(i1, image([{ type: "Textbox", oceanleoId: "t1" }, { type: "Circle", oceanleoId: "t2" }]), tt));
  assertTranslated("image 创建", (tt) => R.image.describeChange(null, i1, tt));
});

test("画法说明：不带 tt 时仍是原来的中文（向后兼容）", () => {
  const a = R.audio.fromRevision({ sourceUrl: "https://m/a.mp3", operations: [] });
  const b = R.audio.fromRevision({ sourceUrl: "https://m/a.mp3", operations: [{ id: "o1", type: "crop", start: 0, end: 2 }] });
  assert.equal(R.audio.describeChange(a, b), "加了 1 个剪辑操作");
  assert.equal(R.audio.describeChange(a, a), null);
  assert.equal(R.audio.describeChange(null, null), null);
});
