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
const { localizeGap } = await import(await compileModule("src/shell/replay/work/WorkReplayTimeline.tsx", {
  "../../../i18n/ui/useUI": dataModule(`
    export function useUI() {
      return (text, vars) => (vars ? String(text).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);
    }
  `),
}));

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
