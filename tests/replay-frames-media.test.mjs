import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { writeJsonStateRoot, readJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// 六个画法放一个测试文件。useUI 换成「原样返回并做 {x} 插值」的替身（真的要 next-intl 的 provider）。
const useUIStub = dataModule(`export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }`);
const stubs = { "../../../../i18n/ui/useUI": useUIStub };
const load = async (name) => (await import(await compileModule(`src/shell/replay/work/frames/${name}.tsx`, stubs))).default;
const R = {};
for (const name of ["game", "model3d", "audio", "pdf", "video", "workflow"]) R[name] = await load(name);

const html = (renderer, snapshot, prev, extra = {}) =>
  renderToStaticMarkup(createElement(renderer.Frame, { snapshot, prev, width: 360, height: 200, authorColor: "#ff00aa", ...extra }));
const assertSafe = (markup) => {
  assert.ok(!/<iframe/i.test(markup), "不许 iframe");
  assert.ok(!/<script/i.test(markup), "用户内容不得变成 script 元素");
  assert.ok(!/dangerouslySetInnerHTML/.test(markup));
};
const sync = (root, shape) => {
  const doc = new Y.Doc();
  writeShape(doc, root, shape);
  return doc;
};
// 用 W11 的真实现（collab/bind-json-state.ts）读写实体根：`writeJsonStateRoot` / `readJsonStateRoot`。
// 适配器自己的 `readEntityRoot`（鸭子类型）要和它读出同样的东西，下面各测试里都有对照。
const writeShape = (doc, root, shape, origin) => writeJsonStateRoot(doc, root, shape, origin);
const readShape = (doc, root) => readJsonStateRoot(doc, root);

function connect(a, b) {
  // 双向同步一次：各自把对方没有的更新发过去
  const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, ua);
  Y.applyUpdate(a, ub);
}

function seededPair(root, shape) {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeShape(a, root, shape);
  connect(a, b);
  return [a, b];
}


import { gameToEntities, gameTextName, GAME_ROOT } from "../src/shell/collab/adapters/game.ts";
import { videoToEntities, VIDEO_ROOT } from "../src/shell/collab/adapters/video.ts";
import { model3dToEntities, MODEL3D_ROOT } from "../src/shell/collab/adapters/model3d.ts";
import { audioToEntities, AUDIO_ROOT } from "../src/shell/collab/adapters/audio.ts";
import { pdfToEntities, PDF_ROOT } from "../src/shell/collab/adapters/pdf.ts";
import { workflowToEntities, WORKFLOW_ROOT } from "../src/shell/collab/adapters/workflow.ts";

test("六个画法的 kind 与四个函数齐全", () => {
  for (const [name, renderer] of Object.entries(R)) {
    assert.equal(renderer.kind, name);
    for (const fn of ["fromY", "fromRevision", "describeChange", "toArtifactJson"]) assert.equal(typeof renderer[fn], "function", `${name}.${fn}`);
    assert.equal(typeof renderer.Frame, "function");
  }
});

// ── 游戏 ────────────────────────────────────────────────────────────────
test("game：代码快照只读；改动的行用作者颜色标在行号旁；代码里的 <script> 只当文字", () => {
  const prev = R.game.fromRevision({ source: "a\nb\nc", origin: "ai" });
  const next = R.game.fromRevision({ source: "a\nB<script>alert(1)</script>\nc\nd", origin: "ai" });
  const markup = html(R.game, next, prev);
  assertSafe(markup);
  assert.ok(markup.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.equal((markup.match(/data-changed="true"/g) || []).length, 2); // 第 2 行、第 4 行
  assert.ok(markup.includes("#ff00aa"));
  assert.ok(!html(R.game, next, undefined).includes("data-changed"));
  assert.ok(html(R.game, R.game.fromRevision({ source: "" })).includes("还没有代码"));
});

test("game：fromY 与 fromRevision 对同一内容得到等价快照；describeChange；toArtifactJson 往返", () => {
  const doc = sync(GAME_ROOT, gameToEntities({ pages: [{ id: "main", label: "main" }], origin: "ai" }));
  doc.getText(gameTextName("main")).insert(0, "let x = 1;\nlet y = 2;");
  const fromY = R.game.fromY(doc);
  const fromRev = R.game.fromRevision({ source: "let x = 1;\nlet y = 2;", origin: "ai" });
  assert.deepEqual(fromY, fromRev);
  assert.match(R.game.describeChange(R.game.fromRevision({ source: "let x = 1;" }), fromRev), /改了 1 行代码/);
  const json = R.game.toArtifactJson(fromY);
  assert.deepEqual(R.game.fromRevision(json), fromRev);
});

// ── 3D ──────────────────────────────────────────────────────────────────
const scene = () => ({
  checkpointUrl: "https://m/a.glb",
  operations: [
    { id: "o1", kind: "transform", target: "Chair", value: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { id: "o2", kind: "visibility", target: "Lamp", visible: false },
  ],
  posterUrl: "https://m/poster.png",
  view: { sourceUrl: "https://m/a.glb", azimuth: 35, elevation: 65, zoom: 110, autoRotate: false, annotations: [{ id: "n1", label: "x" }] },
});

test("model3d：场景节点树 + 缩略图（只认 https）+ 动过的节点用作者颜色标出", () => {
  const prev = R.model3d.fromRevision(scene());
  const nextJson = scene(); nextJson.operations[0].value.position = [9, 0, 0];
  const next = R.model3d.fromRevision(nextJson);
  const markup = html(R.model3d, next, prev);
  assertSafe(markup);
  assert.ok(markup.includes("Chair") && markup.includes("Lamp") && markup.includes("已隐藏"));
  assert.ok(markup.includes('<img') && markup.includes("https://m/poster.png"));
  assert.equal((markup.match(/data-changed="true"/g) || []).length, 1);
  assert.ok(markup.includes("1 条批注"));
  const bad = R.model3d.fromRevision({ ...scene(), posterUrl: "javascript:alert(1)" });
  assert.ok(!html(R.model3d, bad).includes("<img"));
  assert.ok(html(R.model3d, R.model3d.fromRevision({ checkpointUrl: "", operations: [], view: {} })).includes("场景里还没有改动"));
});

test("model3d：fromY 与 fromRevision 等价；describeChange；toArtifactJson 往返", () => {
  const x = R.model3d.fromRevision(scene());
  const doc = sync(MODEL3D_ROOT, model3dToEntities(x));
  const fromY = R.model3d.fromY(doc);
  // 视口是每个人自己的，不进协同文档；比较时取同一份默认视口
  for (const key of ["azimuth", "elevation", "zoom", "autoRotate"]) x.view[key] = fromY.view[key];
  delete x.posterUrl; // 缩略图不在协同文档里，只在版本里
  assert.deepEqual(fromY, x);
  const changed = scene(); changed.operations[0].value.position = [5, 5, 5];
  assert.match(R.model3d.describeChange(x, R.model3d.fromRevision(changed)), /动了 1 个场景节点/);
  assert.deepEqual(R.model3d.fromRevision(R.model3d.toArtifactJson(x)).operations, x.operations);
});

// ── 音频 ────────────────────────────────────────────────────────────────
const audioJson = () => ({ sourceUrl: "https://m/a.mp3", operations: [{ type: "crop", start: 1, end: 6 }, { type: "fade", edge: "in", duration: 1 }] });

test("audio：轨道与片段示意；新增的片段用作者颜色描边", () => {
  const prev = R.audio.fromRevision(audioJson());
  const nextJson = audioJson(); nextJson.operations.push({ type: "delete", start: 2, end: 3 });
  const markup = html(R.audio, R.audio.fromRevision(nextJson), prev);
  assertSafe(markup);
  assert.equal((markup.match(/data-segment-id/g) || []).length, 3);
  assert.equal((markup.match(/data-changed="true"/g) || []).length, 1);
  assert.ok(markup.includes("裁剪") && markup.includes("淡入淡出") && markup.includes("删除"));
  assert.ok(html(R.audio, R.audio.fromRevision({ sourceUrl: "", operations: [] })).includes("还没有剪辑操作"));
});

test("audio：fromY 与 fromRevision 等价；describeChange；toArtifactJson 往返", () => {
  const x = R.audio.fromRevision(audioJson());
  const doc = sync(AUDIO_ROOT, audioToEntities(x));
  assert.deepEqual(R.audio.fromY(doc), x);
  const y = audioJson(); y.operations.push({ type: "gain", multiplier: 2 });
  assert.match(R.audio.describeChange(x, R.audio.fromRevision(y)), /加了 1 个剪辑操作/);
  assert.deepEqual(R.audio.fromRevision(R.audio.toArtifactJson(x)), x);
});

// ── PDF ─────────────────────────────────────────────────────────────────
const rect = (x, y, w, h) => ({ origin: { x, y }, size: { width: w, height: h } });
const pdfJson = () => ({
  schema: "pdf-annotations@2",
  pages: [{ index: 0, widthPt: 612, heightPt: 792 }, { index: 1, widthPt: 612, heightPt: 792 }],
  annotations: [
    { id: "a1", pageIndex: 0, typeName: "HIGHLIGHT", rect: rect(50, 60, 200, 20), contents: "", strokeColor: "#ffe066" },
    { id: "a2", pageIndex: 1, typeName: "TEXT", rect: rect(80, 100, 24, 24), contents: "<b>注</b>", strokeColor: "javascript:evil" },
  ],
  fields: { name: "张三" },
});

test("pdf：页面缩略 + 批注框；新增/改过的批注描边；批注文字当纯文本；颜色白名单", () => {
  const prev = R.pdf.fromRevision(pdfJson());
  const nextJson = pdfJson(); nextJson.annotations[1].contents = "改了";
  nextJson.annotations.push({ id: "a3", pageIndex: 0, typeName: "SQUARE", rect: rect(10, 10, 50, 50), contents: "" });
  const markup = html(R.pdf, R.pdf.fromRevision(nextJson), prev, { width: 420 });
  assertSafe(markup);
  assert.equal((markup.match(/data-annotation-id/g) || []).length, 3);
  assert.equal((markup.match(/data-changed="true"/g) || []).length, 2);
  assert.ok(markup.includes("第 1 页") && markup.includes("第 2 页"));
  assert.ok(!markup.includes("javascript:"));
  const escaped = html(R.pdf, R.pdf.fromRevision(pdfJson()), undefined, { width: 420 });
  assert.ok(escaped.includes("&lt;b&gt;注&lt;/b&gt;"));
  assert.ok(html(R.pdf, R.pdf.fromRevision({ annotations: [] })).includes("还没有批注"));
});

test("pdf：fromY 与 fromRevision 等价；describeChange；toArtifactJson 往返", () => {
  const x = R.pdf.fromRevision(pdfJson());
  const doc = sync(PDF_ROOT, pdfToEntities(x));
  assert.deepEqual(R.pdf.fromY(doc), x);
  const y = pdfJson(); y.annotations.push({ id: "a9", pageIndex: 1, typeName: "TEXT", rect: rect(1, 1, 5, 5), contents: "" });
  assert.match(R.pdf.describeChange(x, R.pdf.fromRevision(y)), /第 2 页新增了 1 条批注/);
  assert.deepEqual(R.pdf.fromRevision(R.pdf.toArtifactJson(x)), x);
});

// ── 视频 ────────────────────────────────────────────────────────────────
const timeline = () => ({
  width: 1280, height: 720, fps: 30,
  tracks: [
    { id: "tv", kind: "video", clips: [{ id: "c1", start_ms: 0, duration_ms: 2000, source_url: "https://m/a.mp4" }, { id: "c2", start_ms: 2000, duration_ms: 1000, source_url: "https://m/b.mp4" }] },
    { id: "tt", kind: "text", clips: [{ id: "c3", start_ms: 500, duration_ms: 1000, text: "<i>你好</i>" }] },
  ],
});

test("video：时间线示意；变过的片段描边；字幕文字当纯文本", () => {
  const prev = R.video.fromRevision(timeline());
  const nextJson = timeline(); nextJson.tracks[0].clips[0].duration_ms = 1500;
  nextJson.tracks[0].clips.push({ id: "c9", start_ms: 3000, duration_ms: 500, source_url: "https://m/c.mp4" });
  const markup = html(R.video, R.video.fromRevision(nextJson), prev);
  assertSafe(markup);
  assert.equal((markup.match(/data-clip-id/g) || []).length, 4);
  assert.equal((markup.match(/data-changed="true"/g) || []).length, 2);
  assert.ok(markup.includes("&lt;i&gt;你好&lt;/i&gt;"));
  assert.ok(html(R.video, R.video.fromRevision({ tracks: [] })).includes("时间线是空的"));
});

test("video：fromY 与 fromRevision 等价；describeChange；toArtifactJson 往返", () => {
  const x = R.video.fromRevision(timeline());
  const doc = sync(VIDEO_ROOT, videoToEntities(x));
  assert.deepEqual(R.video.fromY(doc), x);
  const y = timeline(); y.tracks[0].clips.pop();
  assert.match(R.video.describeChange(x, R.video.fromRevision(y)), /删掉了 1 段/);
  assert.deepEqual(R.video.fromRevision(R.video.toArtifactJson(x)), x);
});

// ── 流程图 ──────────────────────────────────────────────────────────────
const flow = () => ({
  nodes: [
    { id: "n1", kind: "source", label: "素材", x: 0, y: 0, ports: {} },
    { id: "n2", kind: "trim", label: "<b>裁剪</b>", x: 220, y: 0, ports: {} },
    { id: "n3", kind: "output", label: "输出", x: 440, y: 60, ports: {} },
  ],
  edges: [{ id: "e1", fromNodeId: "n1", fromPort: "out", toNodeId: "n2", toPort: "in" }, { id: "e2", fromNodeId: "n2", fromPort: "out", toNodeId: "n3", toPort: "in" }],
});

test("workflow：节点与连线示意（SVG 元素）；新增/改过的节点与连线描边；标签当纯文本", () => {
  const prev = R.workflow.fromRevision(flow());
  const nextJson = flow(); nextJson.nodes[0].x = 20;
  nextJson.nodes.push({ id: "n4", kind: "text", label: "字幕", x: 220, y: 120, ports: {} });
  nextJson.edges.push({ id: "e3", fromNodeId: "n4", fromPort: "out", toNodeId: "n3", toPort: "in" });
  const markup = html(R.workflow, R.workflow.fromRevision(nextJson), prev);
  assertSafe(markup);
  assert.ok(markup.startsWith("<svg"));
  assert.equal((markup.match(/data-node-id/g) || []).length, 4);
  assert.equal((markup.match(/data-edge-id/g) || []).length, 3);
  assert.equal((markup.match(/data-changed="true"/g) || []).length, 3); // n1、n4、e3
  assert.ok(markup.includes("&lt;b&gt;裁剪&lt;/b&gt;"));
  assert.ok(html(R.workflow, R.workflow.fromRevision({ nodes: [], edges: [] })).includes("流程图是空的"));
});

test("workflow：fromY 与 fromRevision 等价；describeChange；toArtifactJson 往返", () => {
  const x = R.workflow.fromRevision(flow());
  const doc = sync(WORKFLOW_ROOT, workflowToEntities(x));
  assert.deepEqual(R.workflow.fromY(doc), x);
  const y = flow(); y.edges.pop();
  assert.match(R.workflow.describeChange(x, R.workflow.fromRevision(y)), /断了 1 条线/);
  assert.deepEqual(R.workflow.fromRevision(R.workflow.toArtifactJson(x)), x);
});

// ── 文案 ────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from "node:fs";
test("六个画法里出现的中文字面量，要么在 W14 分表里（17 种语言写全），要么已在基础词典里", async () => {
  const { COLLAB_MEDIA_MESSAGES } = await import("../src/i18n/ui/messages/collab-media-copy.ts");
  const { LOCALES } = await import("../src/i18n/config.ts");
  const own = COLLAB_MEDIA_MESSAGES.zh;
  const keys = Object.keys(own);
  assert.ok(keys.length >= 19);
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(COLLAB_MEDIA_MESSAGES[locale]).sort(), [...keys].sort(), `${locale} 少词条`);
    for (const key of keys) {
      assert.ok(String(COLLAB_MEDIA_MESSAGES[locale][key]).trim(), `${locale}:${key} 为空`);
      // 占位符必须原样保留
      for (const ph of key.match(/\{\w+\}/g) ?? []) assert.ok(COLLAB_MEDIA_MESSAGES[locale][key].includes(ph), `${locale}:${key} 丢了 ${ph}`);
    }
  }
  const dir = new URL("../src/i18n/ui/messages/", import.meta.url);
  const others = readdirSync(dir).filter((file) => file.endsWith(".ts") && file !== "collab-media-copy.ts").map((file) => readFileSync(new URL(file, dir), "utf8")).join("\n");
  for (const key of keys) assert.ok(!others.includes(`"${key}":`), `「${key}」别的词典里已有，不要重复定义`);
  for (const name of ["game", "model3d", "audio", "pdf", "video", "workflow"]) {
    const source = readFileSync(new URL(`../src/shell/replay/work/frames/${name}.tsx`, import.meta.url), "utf8");
    const literals = source.split("\n").filter((line) => !/^\s*(\/\/|\*)/.test(line)).join("\n").match(/"[^"\n]*[\u4e00-\u9fff][^"\n]*"/g) ?? [];
    for (const literal of literals) {
      const key = JSON.parse(literal);
      assert.ok(key in own || others.includes(`"${key}":`), `${name}.tsx 里的「${key}」没有词条`);
    }
  }
});
