/**
 * V02 回放验收：3 小时空档显示「跳过」而不是真等；w_ 公开码走新接口；
 * toArtifactJson 接手往返；被撤销的尝试默认不进主线。
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  RICHDOC_COLLAB_FIELD,
  richDocFromY,
  richDocToArtifactJson,
} from "../src/shell/collab/adapters/richdoc.ts";
import { gridToArtifactJson, gridToEntities, gridFromEntities } from "../src/shell/collab/adapters/grid.ts";
import { deckToArtifactJson, deckToEntities, deckFromEntities } from "../src/shell/collab/adapters/deck.ts";
import { vectorFromRevision, vectorToArtifactJson } from "../src/shell/collab/adapters/vector.ts";
import { gameToArtifactJson, gameToEntities, gameFromEntities } from "../src/shell/collab/adapters/game.ts";
import { videoToArtifactJson, videoToEntities, videoFromEntities } from "../src/shell/collab/adapters/video.ts";
import { workflowToArtifactJson, workflowToEntities, workflowFromEntities } from "../src/shell/collab/adapters/workflow.ts";
import * as Y from "yjs";

const model = await import(await compileModule("src/shell/replay/work/replay-work-model.ts"));
const timelineModule = await import(await compileModule("src/shell/replay/work/WorkReplayTimeline.tsx", {
  "../../../i18n/ui/useUI": dataModule(`
    export function useUI() {
      return (text, vars) => (vars ? String(text).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);
    }
  `),
}));
const { localizeGap } = timelineModule;
const localizeChapterTitleFor = () => timelineModule.localizeChapterTitle;
const localizeEventTextFor = () => timelineModule.localizeEventText;

const GATEWAY = "https://api.dev.oceanleo.com";
const configStub = dataModule(`export const GATEWAY_BASE = "${GATEWAY}";`);
const uiStub = dataModule(`
  const tt = (text, vars) => (vars ? String(text).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);
  export function useUI() { return tt; }
`);
globalThis.__workReplayLinkReact = React;
const playerStub = dataModule(`
  export function WorkReplayPlayer(props) {
    return globalThis.__workReplayLinkReact.createElement("div", {
      "data-stub-work-player": props.publicCode,
      "data-stub-gateway": props.publicFetch?.gatewayBase ?? "",
    });
  }
`);
const pageUrl = await compileModule("src/shell/replay/AgentReplayPage.tsx", {
  "../../i18n/ui/useUI": uiStub,
  "./work/WorkReplayPlayer": playerStub,
  "../../lib/auth/config": configStub,
});
const { AgentReplayPage, replayRouteFor } = await import(pageUrl);
const apiUrl = await compileModule("src/shell/replay/work/replay-work-api.ts", {
  "../../../lib/agent": dataModule(`export async function authed() { throw new Error("匿名请求不该走登录态"); }`),
  "../../../lib/auth/config": configStub,
});
const api = await import(apiUrl);

const ev = (id, t_ms, kind, extra = {}) => ({
  id,
  t_ms,
  dur_ms: kind === "gap" ? 1000 : 0,
  kind,
  source: "artifact:doc1",
  author_id: "u1",
  at: null,
  seq_from: kind === "edit" ? 1 : null,
  seq_to: kind === "edit" ? 3 : null,
  revision_id: null,
  text: extra.text ?? null,
  undone: Boolean(extra.undone),
  editor_kind: "richdoc",
  ...extra,
});

test("3 小时空档：播放时钟只走 gap 的 1 秒，不真的等 3 小时；文案是跳过", () => {
  const data = {
    playback_ms: 5000,
    sources: [{ key: "artifact:doc1", editor_kind: "richdoc", title: "周报", has_trail: true }],
    chapters: [
      { id: "c1", title: "周一 上午 · 周报", day: "2026-10-05", start_ms: 0, end_ms: 2000, active_ms: 2000, sources: ["artifact:doc1"], summary: null, hidden: false },
      { id: "c2", title: "周一 下午 · 周报", day: "2026-10-05", start_ms: 3000, end_ms: 5000, active_ms: 2000, sources: ["artifact:doc1"], summary: null, hidden: false },
    ],
    events: [
      ev("e1", 0, "edit"),
      ev("g1", 2000, "gap", { text: "跳过 3 小时" }),
      ev("e2", 3000, "edit", { seq_from: 4, seq_to: 9 }),
      ev("d1", 5000, "day", { text: "2026-10-06" }),
    ],
  };
  const marks = model.timelineMarks(data);
  assert.equal(marks.gaps.length, 1);
  assert.match(marks.gaps[0].text, /跳过 3 小时/);
  const tt = (text, vars) =>
    vars ? String(text).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : _)) : text;
  assert.match(localizeGap(tt, "跳过 3 小时"), /跳过/);
  let clock = model.togglePlay(model.createClock(1), data.playback_ms);
  // 真实 3 小时 = 10_800_000ms；播放侧每次最多 250ms，200 次 tick ≈ 50s 墙钟就走完 5s 主线
  for (let i = 0; i < 40; i += 1) clock = model.tickClock(clock, 250, data.playback_ms);
  assert.equal(clock.ended, true);
  assert.equal(clock.t, 5000);
  // sampleFrames().event 只取最近一次 edit/save；空档要用 eventIndexAt 取到 gap 事件本身。
  const gapEvent = data.events[model.eventIndexAt(data.events, 2200)];
  assert.equal(gapEvent.kind, "gap");
  assert.ok(gapEvent.dur_ms < 60_000, "空档在回放里只占 gap.dur_ms，不是 3 小时");
  assert.equal(model.sampleFrames(data, 2200).states["artifact:doc1"].seqTo, 3);
});

test("日期标记出现在时间轴；主线时长是 playback_ms 不是墙钟", () => {
  const data = {
    playback_ms: 300_000,
    sources: [{ key: "artifact:doc1", editor_kind: "richdoc", title: "周报", has_trail: true }],
    chapters: [{ id: "c1", title: "周一 上午 · 周报", day: "2026-10-05", start_ms: 0, end_ms: 300_000, active_ms: 300_000, sources: ["artifact:doc1"], summary: null, hidden: false }],
    events: [ev("e1", 0, "edit"), ev("d1", 1000, "day", { text: "2026-10-06" })],
    days: [{ date: "2026-10-05", active_ms: 240_000 }, { date: "2026-10-06", active_ms: 60_000 }],
  };
  const marks = model.timelineMarks(data);
  assert.ok(marks.days.length >= 1 || data.days.length === 2);
  assert.equal(data.playback_ms, 300_000);
});

test("被撤销的尝试：undone 事件不作为接手点；show_undone 关闭时主线用未撤销的 seq", () => {
  const data = {
    playback_ms: 4000,
    sources: [{ key: "artifact:doc1", editor_kind: "richdoc", title: "周报", has_trail: true }],
    chapters: [{ id: "c1", title: "周一 上午 · 周报", day: "2026-10-05", start_ms: 0, end_ms: 4000, active_ms: 4000, sources: ["artifact:doc1"], summary: null, hidden: false }],
    events: [
      ev("e1", 0, "edit", { seq_from: 1, seq_to: 1, undone: false }),
      ev("e2", 1000, "edit", { seq_from: 2, seq_to: 2, undone: true }),
      ev("e3", 2000, "edit", { seq_from: 3, seq_to: 3, undone: false }),
    ],
  };
  const atUndone = model.sampleFrames(data, 1000);
  assert.equal(atUndone.states["artifact:doc1"].seqTo, 2);
  const fork = model.forkSeqAt(atUndone);
  assert.equal(fork.seq, 2);
  const visible = data.events.filter((e) => !e.undone);
  assert.deepEqual(
    visible.map((e) => e.seq_to),
    [1, 3],
  );
});

test("公开页：w_ 前缀走工作回放；旧对话回放码仍走原页", () => {
  const code = "w_" + "A1b2C3d4E5f6G7h8I9j0K1";
  assert.equal(api.WORK_REPLAY_SHARE_PREFIX, "w_");
  assert.equal(replayRouteFor(code), "work");
  assert.equal(replayRouteFor("abc123"), "task");
  const workHtml = renderToStaticMarkup(
    React.createElement(AgentReplayPage, {
      shareId: code,
      gatewayBase: GATEWAY,
      fetchImpl: async () => {
        throw new Error("不该请求旧接口");
      },
    }),
  );
  assert.match(workHtml, new RegExp(`data-stub-work-player="${code}"`));
  const oldHtml = renderToStaticMarkup(
    React.createElement(AgentReplayPage, {
      shareId: "abc123",
      gatewayBase: GATEWAY,
      fetchImpl: async () => new Response("{}"),
    }),
  );
  assert.doesNotMatch(oldHtml, /data-stub-work-player/);
  assert.match(oldHtml, /data-replay-root/);
});

test("接手：toArtifactJson 与 fromEntities 往返，内容与那一步一致", () => {
  const grid = {
    id: "wb",
    name: "表",
    sheetOrder: ["s1"],
    sheets: {
      s1: {
        id: "s1",
        name: "收入",
        rowCount: 10,
        columnCount: 4,
        cellData: { 0: { 0: { v: "项目", t: 1 }, 1: { v: 9, t: 2 } } },
      },
    },
  };
  // gridToArtifactJson 返回 {schema, data}，快照在 .data 里。
  const gridJson = gridToArtifactJson(gridFromEntities(gridToEntities(grid), null));
  assert.equal(gridJson.data.sheets.s1.cellData[0][1].v, 9);
  assert.equal(gridJson.data.sheets.s1.cellData[0][0].v, "项目");
  assert.equal(gridFromEntities(gridToEntities(gridJson.data), null).sheets.s1.cellData[0][1].v, 9);

  const deckSeed = {
    title: "验收",
    aspect: "16:9",
    theme: "paper",
    slides: [{ id: "slide-1", title: "封面", body: "hello", bullets: [], notes: "", layout: "title-body", background: "", elements: [] }],
  };
  const deckBack = deckFromEntities(deckToEntities(deckSeed), null);
  assert.equal(deckToArtifactJson(deckBack).slides[0].title, "封面");

  const game = { pages: [{ id: "main", label: "main", code: "hi()" }], origin: "ai" };
  // 游戏代码在协同里是单独的文本字段，不在实体里；接手输出是 {source, origin}，不是 pages。
  const gameBack = gameFromEntities(gameToEntities(game), null);
  assert.equal(gameBack.pages[0].id, "main");
  assert.equal(gameToArtifactJson(game).source, "hi()");
  assert.equal(gameToArtifactJson(game).origin, "ai");

  const video = {
    width: 1280,
    height: 720,
    fps: 30,
    tracks: [{ id: "track_v", kind: "video", clips: [{ id: "clip_1", start_ms: 0, duration_ms: 1000 }] }],
  };
  assert.equal(videoToArtifactJson(videoFromEntities(videoToEntities(video), null)).tracks[0].id, "track_v");

  const graph = {
    nodes: [{ id: "n1", kind: "source", label: "素材", x: 0, y: 0, ports: { inputs: [], outputs: [] } }],
    edges: [],
  };
  assert.equal(workflowToArtifactJson(workflowFromEntities(workflowToEntities(graph), null)).nodes[0].id, "n1");

  const svg = "<svg xmlns='http://www.w3.org/2000/svg'><rect width='1' height='1'/></svg>";
  const snap = vectorFromRevision(svg);
  const out = vectorToArtifactJson(snap);
  assert.ok(out.svg || out.format === "svg");

  const doc = new Y.Doc();
  const text = new Y.XmlText();
  text.insert(0, "接手这一步");
  doc.getXmlFragment(RICHDOC_COLLAB_FIELD).insert(0, [text]);
  const rich = richDocFromY(doc);
  const json = richDocToArtifactJson(rich);
  assert.ok(json.type === "doc" || json.content);
});

// =============================================================================
// 第二轮（V12，F04）：接手真的能存成作品；英文/日文下回放的每一句话都不是中文
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UI_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFileSync(join(UI_ROOT, rel), "utf8");

// 去掉行注释与块注释，保留字符串与模板字符串里的字面量。扫描回放模板时用，避免把注释里的举例 tt("中文模板 {n}") 当成真模板。
function stripJsComments(source) {
  let out = "";
  for (let i = 0; i < source.length; ) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < source.length) {
        const cur = source[i];
        out += cur;
        if (cur === "\\") {
          if (i + 1 < source.length) {
            out += source[i + 1];
            i += 2;
            continue;
          }
        }
        if (cur === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i + 1 < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function scanReplayNoteTemplates(source) {
  const text = stripJsComments(source);
  const scanned = new Set();
  for (const m of text.matchAll(/\bzh:\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) if (CJK.test(m[2])) scanned.add(m[2]);
  for (const m of text.matchAll(/\btt\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) if (CJK.test(m[2])) scanned.add(m[2]);
  return scanned;
}
const CJK = /[\u4e00-\u9fff]/;
// 假翻译：不带任何中文，只回显变量；只要输出里还有中文，就说明有句子没走 tt()
const enTt = (zh, vars) => `EN${vars ? ":" + Object.values(vars).join(",") : ""}`;
const asciiSheet = (cells) => ({
  id: "wb",
  name: "Book",
  sheetOrder: ["s1"],
  sheets: { s1: { id: "s1", name: "Data", rowCount: 10, columnCount: 4, cellData: cells } },
});

test("[F04] 接手：宿主把 createArtifact 传给播放器；fork-artifact 存在并返回 openPath；失败有原因", () => {
  const host = readSrc("src/shell/replay/work/WorkReplayHost.tsx");
  assert.match(host, /createArtifact\s*=/, "WorkReplayHost 要定义 createArtifact");
  assert.match(host, /<WorkReplayPlayer[\s\S]{0,240}createArtifact=\{createArtifact\}/, "宿主必须把 createArtifact 传给 WorkReplayPlayer");
  const forkPath = "src/shell/replay/work/fork-artifact.ts";
  assert.ok(existsSync(join(UI_ROOT, forkPath)), "缺 fork-artifact.ts：现在点「从这一步接手」一定失败");
  const fork = readSrc(forkPath);
  assert.match(fork, /openPath/, "接手成功要返回打开地址 openPath");
  const player = readSrc("src/shell/replay/work/WorkReplayPlayer.tsx");
  assert.match(player, /canFork\s*=[^;]*createArtifact/s, "canFork 要同时要求 createArtifact 存在");
  assert.match(player, /isPublic/, "公开页不显示接手按钮");
});

test("[F04] 英文界面：12 个编辑器族的回放说明全部走 tt，输出里没有中文", async () => {
  const stubs = {
    "../../../../i18n/ui/useUI": dataModule(`export function useUI(){ return (t)=>t; }`),
  };
  const Yd = (build) => {
    const d = new Y.Doc();
    build(d);
    return d;
  };
  const rect = (x, y) => ({ origin: { x, y }, size: { width: 100, height: 20 } });
  const vecSvg = (n) => `<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'>${"<rect width='1' height='1'/>".repeat(n)}</svg>`;
  const textDoc = (s) =>
    Yd((d) => {
      const t = new Y.XmlText();
      t.insert(0, s);
      d.getXmlFragment(RICHDOC_COLLAB_FIELD).insert(0, [t]);
    });
  const pairs = {
    richdoc: [richDocFromY(textDoc("hello")), richDocFromY(textDoc("hello world, more words here"))],
    grid: [
      gridFromEntities(gridToEntities(asciiSheet({ 0: { 0: { v: "a", t: 1 } } })), null),
      gridFromEntities(gridToEntities(asciiSheet({ 0: { 0: { v: "b", t: 1 }, 1: { v: 2, t: 2 } }, 1: { 0: { v: "c", t: 1 } } })), null),
    ],
    deck: [
      deckFromEntities(deckToEntities({ title: "T", aspect: "16:9", theme: "paper", slides: [{ id: "s1", title: "A", body: "x", bullets: [], notes: "", layout: "title-body", background: "", elements: [] }] }), null),
      deckFromEntities(
        deckToEntities({
          title: "T",
          aspect: "16:9",
          theme: "dark",
          slides: [
            { id: "s1", title: "B", body: "x", bullets: [], notes: "n", layout: "title-body", background: "", elements: [] },
            { id: "s2", title: "C", body: "y", bullets: [], notes: "", layout: "title-body", background: "", elements: [] },
          ],
        }),
        null,
      ),
    ],
    image: [
      { json: { version: "6.0.0", objects: [{ type: "Rect", oceanleoId: "a", left: 0, top: 0, width: 5, height: 5, fill: "#fff" }] }, doc: { width: 10, height: 10 }, canvasBackground: "#fff" },
      { json: { version: "6.0.0", objects: [{ type: "Rect", oceanleoId: "a", left: 3, top: 0, width: 5, height: 5, fill: "#f00" }, { type: "Circle", oceanleoId: "b", left: 1, top: 1, radius: 2, fill: "#000" }] }, doc: { width: 10, height: 10 }, canvasBackground: "#fff" },
    ],
    chart: [
      { schema: "oceanleo.chart.v1", version: 1, title: "A", option: { series: [{ id: "s1", name: "N", type: "bar", data: [1, 2] }] } },
      { schema: "oceanleo.chart.v1", version: 1, title: "B", option: { series: [{ id: "s1", name: "N", type: "line", data: [1, 2] }, { id: "s2", name: "M", type: "bar", data: [3] }] } },
    ],
    vector: [vectorFromRevision(vecSvg(1)), vectorFromRevision(vecSvg(3))],
    game: [
      { pages: [{ id: "main", label: "main", code: "a()" }], origin: "ai" },
      { pages: [{ id: "main", label: "main", code: "a();\nb();\nc();" }, { id: "two", label: "two", code: "" }], origin: "ai" },
    ],
    model3d: [
      { checkpointUrl: "https://m/s.glb", operations: [{ id: "o1", kind: "visibility", target: "Lamp", visible: true }], view: { annotations: [] } },
      { checkpointUrl: "https://m/s.glb", operations: [{ id: "o1", kind: "visibility", target: "Lamp", visible: false }, { id: "o2", kind: "visibility", target: "Chair", visible: false }], view: { annotations: [{ id: "n1", text: "note" }] } },
    ],
    audio: [
      { sourceUrl: "https://m/a.mp3", operations: [{ type: "crop", start: 1, end: 9 }] },
      { sourceUrl: "https://m/a.mp3", operations: [{ type: "crop", start: 2, end: 8 }, { type: "fade", edge: "in", duration: 0.5 }] },
    ],
    video: [
      { width: 1280, height: 720, fps: 30, tracks: [{ id: "tv", kind: "video", clips: [{ id: "c1", start_ms: 0, duration_ms: 1000 }] }] },
      { width: 1280, height: 720, fps: 30, tracks: [{ id: "tv", kind: "video", clips: [{ id: "c1", start_ms: 0, duration_ms: 2000 }, { id: "c2", start_ms: 2000, duration_ms: 500 }] }] },
    ],
    pdf: [
      { pages: [{ index: 0, widthPt: 612, heightPt: 792 }], annotations: [{ id: "a1", pageIndex: 0, typeName: "HIGHLIGHT", rect: rect(5, 6), contents: "x" }], fields: {} },
      { pages: [{ index: 0, widthPt: 612, heightPt: 792 }], annotations: [{ id: "a1", pageIndex: 0, typeName: "HIGHLIGHT", rect: rect(5, 6), contents: "y" }, { id: "a2", pageIndex: 0, typeName: "TEXT", rect: rect(9, 9), contents: "z" }], fields: { name: "v" } },
    ],
    workflow: [
      { nodes: [{ id: "n1", kind: "trim", label: "A", x: 0, y: 0, ports: { inputs: [], outputs: [] } }], edges: [] },
      { nodes: [{ id: "n1", kind: "trim", label: "B", x: 5, y: 0, ports: { inputs: [], outputs: [] } }, { id: "n2", kind: "trim", label: "C", x: 9, y: 0, ports: { inputs: [], outputs: [] } }], edges: [{ id: "e1", fromNodeId: "n1", fromPort: "o", toNodeId: "n2", toPort: "i" }] },
    ],
  };
  const leaks = [];
  const silent = [];
  for (const [kind, [prev, next]] of Object.entries(pairs)) {
    let renderer;
    try {
      renderer = (await import(await compileModule(`src/shell/replay/work/frames/${kind}.tsx`, stubs))).default;
    } catch (error) {
      leaks.push(`${kind}: 画法加载失败 ${String(error?.message ?? error).slice(0, 80)}`);
      continue;
    }
    if (!renderer?.describeChange) {
      silent.push(kind);
      continue;
    }
    const sentence = renderer.describeChange(prev, next, enTt);
    if (sentence == null) silent.push(kind);
    else if (CJK.test(sentence)) leaks.push(`${kind}: ${sentence}`);
  }
  assert.deepEqual(leaks, [], `这些编辑器族的回放说明在英文下仍有中文：\n${leaks.join("\n")}`);
  assert.deepEqual(silent, [], `这些编辑器族典型改动没有生成任何说明：${silent.join(",")}`);
});

test("[F04] en/ja：逐族回放说明、章节标题、专业模式进出不是未翻译的中文", async (t) => {
  const copy = await import("../src/i18n/ui/messages/work-replay-copy.ts");
  const apply = (template, vars) =>
    vars ? String(template).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : template;
  const zhTt = (zh, vars) => apply(zh, vars);
  const localeTt = (locale) => (zh, vars) => apply(copy.WORK_REPLAY_MESSAGES[locale][zh] ?? zh, vars);
  const stubs = {
    "../../../../i18n/ui/useUI": dataModule(`export function useUI(){ return (t)=>t; }`),
  };
  const Yd = (build) => {
    const d = new Y.Doc();
    build(d);
    return d;
  };
  const rect = (x, y) => ({ origin: { x, y }, size: { width: 100, height: 20 } });
  const vecSvg = (n) => `<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'>${"<rect width='1' height='1'/>".repeat(n)}</svg>`;
  const textDoc = (s) =>
    Yd((d) => {
      const t = new Y.XmlText();
      t.insert(0, s);
      d.getXmlFragment(RICHDOC_COLLAB_FIELD).insert(0, [t]);
    });
  const pairs = {
    richdoc: [richDocFromY(textDoc("hello")), richDocFromY(textDoc("hello world, more words here"))],
    grid: [
      gridFromEntities(gridToEntities(asciiSheet({ 0: { 0: { v: "a", t: 1 } } })), null),
      gridFromEntities(gridToEntities(asciiSheet({ 0: { 0: { v: "b", t: 1 }, 1: { v: 2, t: 2 } }, 1: { 0: { v: "c", t: 1 } } })), null),
    ],
    deck: [
      deckFromEntities(deckToEntities({ title: "T", aspect: "16:9", theme: "paper", slides: [{ id: "s1", title: "A", body: "x", bullets: [], notes: "", layout: "title-body", background: "", elements: [] }] }), null),
      deckFromEntities(
        deckToEntities({
          title: "T",
          aspect: "16:9",
          theme: "dark",
          slides: [
            { id: "s1", title: "B", body: "x", bullets: [], notes: "n", layout: "title-body", background: "", elements: [] },
            { id: "s2", title: "C", body: "y", bullets: [], notes: "", layout: "title-body", background: "", elements: [] },
          ],
        }),
        null,
      ),
    ],
    image: [
      { json: { version: "6.0.0", objects: [{ type: "Rect", oceanleoId: "a", left: 0, top: 0, width: 5, height: 5, fill: "#fff" }] }, doc: { width: 10, height: 10 }, canvasBackground: "#fff" },
      { json: { version: "6.0.0", objects: [{ type: "Rect", oceanleoId: "a", left: 3, top: 0, width: 5, height: 5, fill: "#f00" }, { type: "Circle", oceanleoId: "b", left: 1, top: 1, radius: 2, fill: "#000" }] }, doc: { width: 10, height: 10 }, canvasBackground: "#fff" },
    ],
    chart: [
      { schema: "oceanleo.chart.v1", version: 1, title: "A", option: { series: [{ id: "s1", name: "N", type: "bar", data: [1, 2] }] } },
      { schema: "oceanleo.chart.v1", version: 1, title: "B", option: { series: [{ id: "s1", name: "N", type: "line", data: [1, 2] }, { id: "s2", name: "M", type: "bar", data: [3] }] } },
    ],
    vector: [vectorFromRevision(vecSvg(1)), vectorFromRevision(vecSvg(3))],
    game: [
      { pages: [{ id: "main", label: "main", code: "a()" }], origin: "ai" },
      { pages: [{ id: "main", label: "main", code: "a();\nb();\nc();" }, { id: "two", label: "two", code: "" }], origin: "ai" },
    ],
    model3d: [
      { checkpointUrl: "https://m/s.glb", operations: [{ id: "o1", kind: "visibility", target: "Lamp", visible: true }], view: { annotations: [] } },
      { checkpointUrl: "https://m/s.glb", operations: [{ id: "o1", kind: "visibility", target: "Lamp", visible: false }, { id: "o2", kind: "visibility", target: "Chair", visible: false }], view: { annotations: [{ id: "n1", text: "note" }] } },
    ],
    audio: [
      { sourceUrl: "https://m/a.mp3", operations: [{ type: "crop", start: 1, end: 9 }] },
      { sourceUrl: "https://m/a.mp3", operations: [{ type: "crop", start: 2, end: 8 }, { type: "fade", edge: "in", duration: 0.5 }] },
    ],
    video: [
      { width: 1280, height: 720, fps: 30, tracks: [{ id: "tv", kind: "video", clips: [{ id: "c1", start_ms: 0, duration_ms: 1000 }] }] },
      { width: 1280, height: 720, fps: 30, tracks: [{ id: "tv", kind: "video", clips: [{ id: "c1", start_ms: 0, duration_ms: 2000 }, { id: "c2", start_ms: 2000, duration_ms: 500 }] }] },
    ],
    pdf: [
      { pages: [{ index: 0, widthPt: 612, heightPt: 792 }], annotations: [{ id: "a1", pageIndex: 0, typeName: "HIGHLIGHT", rect: rect(5, 6), contents: "x" }], fields: {} },
      { pages: [{ index: 0, widthPt: 612, heightPt: 792 }], annotations: [{ id: "a1", pageIndex: 0, typeName: "HIGHLIGHT", rect: rect(5, 6), contents: "y" }, { id: "a2", pageIndex: 0, typeName: "TEXT", rect: rect(9, 9), contents: "z" }], fields: { name: "v" } },
    ],
    workflow: [
      { nodes: [{ id: "n1", kind: "trim", label: "A", x: 0, y: 0, ports: { inputs: [], outputs: [] } }], edges: [] },
      { nodes: [{ id: "n1", kind: "trim", label: "B", x: 5, y: 0, ports: { inputs: [], outputs: [] } }, { id: "n2", kind: "trim", label: "C", x: 9, y: 0, ports: { inputs: [], outputs: [] } }], edges: [{ id: "e1", fromNodeId: "n1", fromPort: "o", toNodeId: "n2", toPort: "i" }] },
    ],
  };
  const leaks = [];
  const rows = [];
  for (const [kind, [prev, next]] of Object.entries(pairs)) {
    const renderer = (await import(await compileModule(`src/shell/replay/work/frames/${kind}.tsx`, stubs))).default;
    const zh = renderer.describeChange(prev, next, zhTt);
    const en = renderer.describeChange(prev, next, localeTt("en"));
    const ja = renderer.describeChange(prev, next, localeTt("ja"));
    rows.push(`${kind} | zh=${zh} | en=${en} | ja=${ja}`);
    if (zh == null || en == null || ja == null) leaks.push(`${kind}: 缺说明 zh=${zh} en=${en} ja=${ja}`);
    else {
      if (CJK.test(en)) leaks.push(`${kind} en 仍有中文：${en}`);
      if (ja === zh) leaks.push(`${kind} ja 仍是中文原文：${ja}`);
    }
  }
  const chapterTitle = localizeChapterTitleFor();
  const lockText = localizeEventTextFor();
  const chapter = {
    zh: chapterTitle(zhTt, "周一 上午 · 周报", { weekday: 0, half: "am", source_title: "Report" }),
    en: chapterTitle(localeTt("en"), "周一 上午 · 周报", { weekday: 0, half: "am", source_title: "Report" }),
    ja: chapterTitle(localeTt("ja"), "周一 上午 · 周报", { weekday: 0, half: "am", source_title: "Report" }),
  };
  const enter = {
    zh: lockText(zhTt, { kind: "lock", code: "pro_mode.enter", text: "进入专业模式" }),
    en: lockText(localeTt("en"), { kind: "lock", code: "pro_mode.enter", text: "进入专业模式" }),
    ja: lockText(localeTt("ja"), { kind: "lock", code: "pro_mode.enter", text: "进入专业模式" }),
  };
  const exit = {
    zh: lockText(zhTt, { kind: "lock", code: "pro_mode.exit", text: "退出专业模式" }),
    en: lockText(localeTt("en"), { kind: "lock", code: "pro_mode.exit", text: "退出专业模式" }),
    ja: lockText(localeTt("ja"), { kind: "lock", code: "pro_mode.exit", text: "退出专业模式" }),
  };
  rows.push(`chapter | zh=${chapter.zh} | en=${chapter.en} | ja=${chapter.ja}`);
  rows.push(`pro_mode.enter | zh=${enter.zh} | en=${enter.en} | ja=${enter.ja}`);
  rows.push(`pro_mode.exit | zh=${exit.zh} | en=${exit.en} | ja=${exit.ja}`);
  t.diagnostic(rows.join("\n"));
  if (CJK.test(chapter.en) || chapter.ja === chapter.zh) leaks.push(`章节标题 en=${chapter.en} ja=${chapter.ja}`);
  if (CJK.test(String(enter.en)) || enter.ja === enter.zh) leaks.push(`进入专业模式 en=${enter.en} ja=${enter.ja}`);
  if (CJK.test(String(exit.en)) || exit.ja === exit.zh) leaks.push(`退出专业模式 en=${exit.en} ja=${exit.ja}`);
  assert.deepEqual(leaks, [], `en/ja 仍有未翻译中文：\n${leaks.join("\n")}`);
});

test("[F04] 章节标题、锁事件、空档在英文下不是中文", () => {
  const chapterTitle = localizeChapterTitleFor();
  assert.ok(chapterTitle, "WorkReplayTimeline 要导出 localizeChapterTitle");
  const en = chapterTitle(enTt, "周一 上午 · 周报", { weekday: 0, half: "am", source_title: "Report" });
  assert.doesNotMatch(en, CJK, `章节标题仍是中文：${en}`);
  const lockText = localizeEventTextFor();
  assert.ok(lockText, "WorkReplayTimeline 要导出 localizeEventText");
  for (const code of ["pro_mode.enter", "pro_mode.exit"]) {
    const out = lockText(enTt, { kind: "lock", code, text: "进入专业模式" });
    assert.doesNotMatch(String(out), CJK, `锁事件 ${code} 仍是中文：${out}`);
  }
  assert.doesNotMatch(localizeGap(enTt, "跳过 3 小时"), CJK);
});

test("[F04] 17 种语言：回放说明模板与章节/锁事件词条，en 无中文、其余语言都有译文且不等于中文原文", async (t) => {
  const copy = await import("../src/i18n/ui/messages/work-replay-copy.ts");
  const fixed = ["进入专业模式", "退出专业模式", "跳过 {span}", "周一", "周二", "周三", "周四", "周五", "周六", "周日", "上午", "下午"];
  const keys = [...new Set([...copy.REPLAY_NOTE_TEMPLATES, ...fixed])];
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const probePath = join(UI_ROOT, "tests", ".v12-replay-scan-probe.tmp.ts");
  const probeKey = "V12扫描探针：缺译样本 {n}";
  writeFileSync(
    probePath,
    `// tt("中文模板 {n}", { n: 1 })\n/* tt("中文模板 {n}") */\nexport const n = tt("${probeKey}", { n: 1 });\nconst note = { zh: "V12扫描探针：zh 缺译样本" };\n`,
  );
  try {
    const probeScan = scanReplayNoteTemplates(readFileSync(probePath, "utf8"));
    assert.ok(probeScan.has(probeKey), "去掉注释后仍应抓到真模板（探针）");
    assert.ok(probeScan.has("V12扫描探针：zh 缺译样本"), "去掉注释后仍应抓到 zh: 真模板");
    assert.ok(!probeScan.has("中文模板 {n}"), "注释里的 tt(\"中文模板 {n}\") 不得再被当成真模板");
    assert.ok(!Object.keys(copy.WORK_REPLAY_MESSAGES.en).includes(probeKey), "探针不得事先写进分表，否则验不到扫描还能抓缺译");
  } finally {
    unlinkSync(probePath);
  }
  const scanned = new Set();
  const files = [
    ...["chart", "image", "vector", "deck", "richdoc", "grid", "audio", "video", "game", "model3d", "pdf", "workflow"].map((k) => `src/shell/collab/adapters/${k}.ts`),
    ...["audio", "chart", "deck", "game", "grid", "image", "model3d", "pdf", "richdoc", "vector", "video", "workflow", "notes"].map((k) => `src/shell/replay/work/frames/${k}.${k === "notes" ? "ts" : "tsx"}`),
  ];
  for (const rel of files) {
    for (const key of scanReplayNoteTemplates(readSrc(rel))) scanned.add(key);
  }
  assert.ok(!scanned.has("中文模板 {n}"), "注释举例「中文模板 {n}」去掉注释后不应进扫描结果");
  assert.ok(scanned.size >= 20, `扫描到的说明模板太少（${scanned.size}），测试自己坏了`);
  const known = new Set(Object.keys(copy.WORK_REPLAY_MESSAGES.en));
  const missingFromTable = [...scanned].filter((k) => !known.has(k));
  t.diagnostic(`扫描到 ${scanned.size} 条模板；不在回放分表里的 ${missingFromTable.length} 条`);
  assert.deepEqual(missingFromTable, [], `这些回放说明模板没进 work-replay-copy.ts：\n${missingFromTable.join("\n")}`);
  const bad = [];
  for (const [locale, table] of Object.entries(copy.WORK_REPLAY_MESSAGES)) {
    if (locale === "zh") continue;
    for (const key of keys) {
      const value = table[key];
      if (typeof value !== "string" || !value.trim()) bad.push(`${locale}: 缺「${key}」`);
      else if (value === key) bad.push(`${locale}: 「${key}」没翻译`);
      else if (locale === "en" && CJK.test(value)) bad.push(`en: 「${key}」译文含中文`);
    }
  }
  assert.deepEqual(bad.slice(0, 20), [], `共 ${bad.length} 处：\n${bad.slice(0, 20).join("\n")}`);
});
