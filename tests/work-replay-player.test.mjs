// 工作回放播放器（work-chat W05）挂到真 DOM 之后的契约：
//   ① 时钟与抽帧：点播放后进度条前进、画面聚焦到当前有编辑的来源；
//   ② 章节跳转：点章节 → 进度跳到该章开头，气泡与画面跟着变；
//   ③ AI 气泡只进文本节点（一段带 <img onerror> 的话不许长出 img）；
//   ④ 只读边界：查看者不是 owner 时没有「剪辑 / 谁看过 / 显示被撤销的尝试」，link 查看者没有「从这一步接手」；
//   ⑤ 还原：用注入的 yjs 逐帧重放更新，往回拖会从头重来。
// 计时器用真实 rAF（jsdom pretendToBeVisual）；数值断言不依赖具体帧数，只看「前进了 / 没前进」。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const uiStub = dataModule(`
  const tt = (zh, vars) =>
    vars ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  export function useUI() { return tt; }
`);
const agentStub = dataModule(`
  export async function authed() { return { ok: false, error: "stub", status: 0 }; }
`);
const configStub = dataModule(`export const GATEWAY_BASE = "https://api.dev.oceanleo.com";`);
const imClientStub = dataModule(`export async function imFetch() { return { ok: false, status: 0 }; }`);
// data: 模块里引不到裸包名 react，所以把 React 挂在 globalThis 上给替身用。
globalThis.__workReplayTestReact = React;
const markdownStub = dataModule(`
  const h = (props, text) => globalThis.__workReplayTestReact.createElement("div", { "data-md": "" }, text ?? props.children);
  export function Markdown(props) { return h(props, props.text ?? props.content); }
  export function TypewriterMarkdown(props) { return h(props, props.text ?? props.content); }
`);
const framesStub = dataModule(`
  export async function loadFrameRenderer() { return null; }
  export function resetFrameRendererCache() {}
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../../i18n/ui/useUI": uiStub,
  "../../../lib/agent": agentStub,
  "../../../lib/auth/config": configStub,
  "../../../lib/im/client": imClientStub,
  "../../Markdown": markdownStub,
  "./frames": framesStub,
};

const playerUrl = await compileModule("src/shell/replay/work/WorkReplayPlayer.tsx", stubs);
const { WorkReplayPlayer } = await import(playerUrl);
const reconUrl = await compileModule("src/shell/replay/work/trail-reconstruct.ts");
const { createTrailReconstructor, snapshotAt } = await import(reconUrl);

async function installDom() {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://oceanleo.com/replay/demo",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  restore.push(() => {
    if (previousAct === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  return {
    window,
    restore() {
      for (const undo of restore.reverse()) undo();
      window.close();
    },
  };
}

async function mount(element) {
  const dom = await installDom();
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async wait(ms) {
      await act(async () => {
        await new Promise((done) => setTimeout(done, ms));
      });
    },
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      dom.restore();
    },
  };
}

const ev = (id, t_ms, kind, extra = {}) => ({
  id,
  t_ms,
  dur_ms: 0,
  kind,
  source: "artifact:doc1",
  author_id: "u1",
  at: null,
  seq_from: null,
  seq_to: null,
  revision_id: null,
  text: null,
  undone: false,
  editor_kind: "richdoc",
  ...extra,
});

function replayData({ via = "owner", isOwner = true, canFork = true, evilText = "好的" } = {}) {
  return {
    replay: {
      id: "r1",
      title: "周报回放",
      owner_id: "u1",
      scope: "personal",
      visibility: "private",
      share_url: null,
      trim: null,
      show_exact_times: false,
      show_undone: false,
      created_at: "2026-10-05T00:00:00Z",
    },
    viewer: { is_owner: isOwner, can_fork: canFork, via },
    people: [{ user_id: "u1", display_name: "小王", avatar_url: null, color: "hsl(10, 70%, 45%)", consent: "self" }],
    days: [{ date: "2026-10-05", active_ms: 600_000 }],
    active_ms: 600_000,
    playback_ms: 20_000,
    chapters: [
      { id: "c1", title: "周一 上午 · 周报", day: "2026-10-05", start_ms: 0, end_ms: 8000, active_ms: 8000, sources: ["artifact:doc1"], summary: null, hidden: false },
      { id: "c2", title: "周一 下午 · 周报", day: "2026-10-05", start_ms: 10_000, end_ms: 20_000, active_ms: 10_000, sources: ["artifact:doc1"], summary: null, hidden: false },
    ],
    events: [
      ev("e1", 500, "edit", { seq_from: 1, seq_to: 3 }),
      ev("e2", 1500, "ai_input", { source: "task:t1", text: "把标题改短", editor_kind: null }),
      ev("e3", 2000, "ai_output", { source: "task:t1", text: evilText, editor_kind: null }),
      ev("g1", 8000, "gap", { text: "跳过 2 小时 13 分" }),
      ev("e4", 10_500, "ai_input", { source: "task:t1", text: "第二章的提问", editor_kind: null }),
      ev("e5", 11_000, "edit", { seq_from: 4, seq_to: 9 }),
    ],
    sources: [
      { key: "artifact:doc1", editor_kind: "richdoc", title: "周报", has_trail: true },
      { key: "task:t1", editor_kind: null, title: "AI", has_trail: false },
    ],
  };
}

const q = (container, selector) => container.querySelector(selector);
const clockText = (container) => q(container, "[data-replay-clock]")?.textContent ?? "";
const bubbleTexts = (container) => [...container.querySelectorAll("[data-replay-bubble]")].map((n) => n.textContent);

test("打开后停在 0:00；点播放后进度前进；再点暂停就停住", async () => {
  const view = await mount(React.createElement(WorkReplayPlayer, { data: replayData(), autoPlay: false }));
  try {
    assert.match(clockText(view.container), /^0:00 \/ 0:20$/);
    assert.equal(q(view.container, "[data-replay-toggle]").textContent, "播放");
    await view.click(q(view.container, "[data-replay-toggle]"));
    assert.equal(q(view.container, "[data-replay-toggle]").textContent, "暂停");
    await view.click(q(view.container, "[data-replay-speed='4']"));
    await view.wait(900);
    const moved = clockText(view.container);
    assert.notEqual(moved.split(" / ")[0], "0:00", `进度应该前进，实际 ${moved}`);
    await view.click(q(view.container, "[data-replay-toggle]"));
    const frozen = clockText(view.container);
    await view.wait(400);
    assert.equal(clockText(view.container), frozen);
  } finally {
    await view.unmount();
  }
});

test("章节跳转：点第二章 → 进度到该章开头，气泡只剩到那时为止的对话", async () => {
  const view = await mount(React.createElement(WorkReplayPlayer, { data: replayData(), autoPlay: false }));
  try {
    const chapters = [...view.container.querySelectorAll("[data-replay-chapter]")];
    assert.equal(chapters.length, 2);
    assert.deepEqual(bubbleTexts(view.container), []);
    await view.click(chapters[1]);
    assert.equal(clockText(view.container).split(" / ")[0], "0:10");
    assert.deepEqual(bubbleTexts(view.container), ["把标题改短", "好的"]);
    await view.click(chapters[0]);
    assert.equal(clockText(view.container).split(" / ")[0], "0:00");
    assert.deepEqual(bubbleTexts(view.container), []);
  } finally {
    await view.unmount();
  }
});

test("AI 气泡只进文本节点：带 <img onerror> 的输出不会长出 img", async () => {
  const evil = '<img src=x onerror="globalThis.__pwned=1">';
  const view = await mount(React.createElement(WorkReplayPlayer, { data: replayData({ evilText: evil }), autoPlay: false }));
  try {
    await view.click([...view.container.querySelectorAll("[data-replay-chapter]")][1]);
    assert.equal(view.container.querySelectorAll("img").length, 0);
    assert.ok(bubbleTexts(view.container).includes(evil));
    assert.equal(globalThis.__pwned, undefined);
  } finally {
    await view.unmount();
  }
});

test("只读边界：owner 有剪辑/谁看过；公开链接查看者都没有，也没有「从这一步接手」", async () => {
  const owner = await mount(React.createElement(WorkReplayPlayer, { data: replayData(), autoPlay: false }));
  try {
    assert.ok(q(owner.container, "[data-replay-trim-open]"));
    assert.ok(q(owner.container, "[data-replay-views-open]"));
    assert.ok(q(owner.container, "[data-replay-share-open]"));
    assert.equal(q(owner.container, "[data-work-replay-player]").getAttribute("data-replay-via"), "owner");
  } finally {
    await owner.unmount();
  }
  const link = await mount(
    React.createElement(WorkReplayPlayer, {
      data: replayData({ via: "link", isOwner: false, canFork: false }),
      autoPlay: false,
    }),
  );
  try {
    assert.equal(q(link.container, "[data-replay-trim-open]"), null);
    assert.equal(q(link.container, "[data-replay-views-open]"), null);
    assert.equal(q(link.container, "[data-replay-share-open]"), null);
    assert.equal(q(link.container, "[data-replay-toggle-undone]"), null);
    assert.equal(q(link.container, "[data-replay-fork]"), null);
  } finally {
    await link.unmount();
  }
});

test("没有数据也没有 id：显示加载失败而不是白屏", async () => {
  const view = await mount(React.createElement(WorkReplayPlayer, { autoPlay: false }));
  try {
    await view.wait(20);
    assert.ok(q(view.container, "[data-work-replay-error]") || q(view.container, "[data-work-replay-loading]"));
  } finally {
    await view.unmount();
  }
});

// ---- 还原：注入一个假的 yjs，验证「往前增量、往回从头」 ------------------------

function fakeYjs() {
  const log = [];
  class Doc {
    constructor() {
      this.applied = [];
      log.push("new");
    }
    destroy() {
      log.push("destroy");
    }
  }
  return {
    log,
    Y: {
      Doc,
      applyUpdate(doc, bytes) {
        doc.applied.push(Buffer.from(bytes).toString("utf8"));
        log.push(`apply:${Buffer.from(bytes).toString("utf8")}`);
      },
    },
  };
}
const b64 = (text) => Buffer.from(text, "utf8").toString("base64");

test("还原：往前走增量应用，往回拖会从基础状态重来；取快照失败给 null 不抛", () => {
  const { Y, log } = fakeYjs();
  const frames = {
    kind: "trail",
    base_seq: 0,
    base_state: b64("base"),
    updates: [1, 2, 3].map((seq) => ({ seq, update: b64(`u${seq}`), author_id: "u1", t_ms: seq * 100 })),
  };
  const recon = createTrailReconstructor(Y, frames);
  assert.deepEqual(recon.docAt(2).applied, ["base", "u1", "u2"]);
  assert.equal(recon.currentSeq, 2);
  assert.deepEqual(recon.docAt(3).applied, ["base", "u1", "u2", "u3"]);
  const before = log.length;
  assert.deepEqual(recon.docAt(1).applied, ["base", "u1"]);
  assert.ok(log.slice(before).includes("destroy"), "往回拖应销毁旧文档重建");
  assert.equal(snapshotAt(recon, 2, (doc) => doc.applied.length), 3);
  assert.equal(snapshotAt(recon, 2, () => { throw new Error("boom"); }), null);
  assert.equal(snapshotAt(recon, 2, undefined), null);
  recon.dispose();
});
