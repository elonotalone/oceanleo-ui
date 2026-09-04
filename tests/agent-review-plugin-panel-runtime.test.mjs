// ============================================================================
// W02 · `PARENT-red-1` 的闸 —— 锁的是**产品接线**，不是闸函数自己
// ----------------------------------------------------------------------------
// 为什么要有这份文件（2026-09-04）
//
// 上一棒交卷时 `tests/agent-review-install.test.mjs` 12/12 绿，但那 12 例在断言之前
// **自己先调了 `installAgentReviewGate()`**。于是「闸装上之后有效」被证明了，
// 「闸一定装上了」一次都没被证明；`FunctionAgentChat` 取面处那条
// `readEditorCommandSurface(...) || currentPluginCommandSurface()` 在测试里永远走不到。
// 而 `currentPluginCommandSurface()` 返回的是 `guarded(surface)` —— 只有参数校验层、
// **没有审阅闸**。`PluginAgentPanel`（13 件编辑器共用的「AI 助手」抽屉）既不传
// `editorCommandSurface`、也不调 `installAgentReviewGate()`，正好落在那条回落上：
// 用户以为改动会先给他看，实际文档当场就变了。
//
// 所以这份判据的形状是反过来的：**不许在断言前把被测的前提装好**。
// 它原样复刻 PluginAgentPanel 的处境——真起一棵 React 树、真挂
// `useEditorCommandBridge`、不传 reader、不装闸——然后把「模型下一条会改文档的指令
// → 用户点『就这么改』」这条完整的人的动作走完，读底层 `run` 到底被调了几次。
//
// 判据就一条：**底层 `run` 零调用**，改动停在审阅会话里。
// 把取面处改回 `|| currentPluginCommandSurface()`，第一例当场红（实测输出见
// `verdicts/W02-redfix.md`）。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

/* --------------------------------- jsdom --------------------------------- */
// 经 fabric 的依赖树拿到（本仓没有直接装 jsdom，不许为测试引新依赖）；
// 样板与 `pdf-workbench-hook-runtime.test.mjs` 同源。

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://grid.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
// jsdom 没有这三个（对话区挂载时会滚到底）。
window.Element.prototype.scrollTo = function () {};
window.Element.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
// 本判据整条路上一个网络请求都不该发（没有 taskId，就没有轮询）。
globalThis.fetch = async () => {
  throw new Error("这条路不该发网络请求");
};

/* ------------------------- 生产模块（jsdom 之后再拉） ------------------------ */

const { EDITOR_COMMAND_FENCE, readEditorCommandSurface, registerEditorCommandSurfaceReader } =
  await import("../src/lib/fn-agent.ts");
const { registerPluginCommandSurface, resetPluginCommandSurface } = await import(
  "../src/shell/plugin-command/registry.ts"
);
const { hostReviewSession } = await import("../src/shell/agent-review/session.ts");
const { resetAgentReviewInbox } = await import("../src/shell/agent-review/inbox.ts");

// `.tsx` 进不了类型剥离，按仓里的惯例走编译台；只打一个 `useUI` 桩（真 `useUI()` 要
// next-intl 的 provider，而这份测试是直接挂 hook 的）。指令面、闸、审阅会话都是 `.ts`，
// 编译台照 `file://` 引真模块 —— 所以测试里 reset 的就是产品里那一份状态。
const uiStubUrl = dataModule("export function useUI(){ return (value) => value; }");
const chatUrl = await compileModule("src/shell/FunctionAgentChat.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  // 输入框整棵子树（tiptap/ProseMirror）与本判据无关，且它的 CJS 互操作在
  // 类型剥离下加载不进来。本台架不渲染输入框，只渲染确认卡。
  "./LeoComposer": dataModule("export function LeoComposer(){ return null; }"),
});
const { useEditorCommandBridge, AgentReviewDock } = await import(chatUrl);

/* --------------------------------- 台架 ---------------------------------- */

/** 一个会真写文档的编辑器指令面：`calls` 就是「文档被改了几次」。 */
function stubSurface() {
  const calls = [];
  let revision = 3;
  const surface = {
    editorId: "grid",
    describe: () => [
      {
        id: "grid.set-cell",
        label: "改单元格",
        summary: "写入一个格子",
        mutates: true,
        params: [{ key: "value", label: "值", type: "string", required: true }],
      },
      {
        id: "grid.read-cell",
        label: "读单元格",
        summary: "只读一个格子",
        mutates: false,
      },
    ],
    state: () => ({ revision }),
    async run(id, params) {
      calls.push({ id, params });
      if (id === "grid.set-cell") revision += 1;
      return { ok: true, message: "已直接写入文档", revision };
    },
  };
  return { surface, calls, revisionNow: () => revision };
}

const block = (payload) =>
  ["```" + EDITOR_COMMAND_FENCE, JSON.stringify(payload), "```"].join("\n");

/**
 * `PluginAgentPanel` 渲染 `FunctionAgentChat` 时的入参原样：
 * 开着指令面（`enableEditorCommands`）、**不传** `editorCommandSurface`、无 taskId。
 */
function PanelBed({ sink }) {
  const bridge = useEditorCommandBridge({ enabled: true, taskId: null });
  sink.bridge = bridge;
  return React.createElement(
    "div",
    { "data-bed": "plugin-agent-panel" },
    React.createElement(AgentReviewDock),
    bridge.card,
  );
}

async function mountPanel(sink) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(PanelBed, { sink }));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** 模型说了一句带指令块的话，宿主把它喂进桥（`ingest` 的真入口）。 */
async function agentSays(sink, payload, messageId = 1, taskKey = "task-1") {
  await act(async () => {
    sink.bridge.noteOwnTask(taskKey);
  });
  await act(async () => {
    sink.bridge.ingest(
      [{ id: messageId, role: "assistant", kind: "text", content: block(payload) }],
      taskKey,
    );
  });
}

function freshWorld() {
  hostReviewSession.reset();
  resetAgentReviewInbox();
  resetPluginCommandSurface();
  // 明确**不装**闸：这正是 PluginAgentPanel 的处境，也是本判据的全部要害。
  registerEditorCommandSurfaceReader(null);
}

/* --------------------------------- 判据 ---------------------------------- */

test("PluginAgentPanel 的处境（没人装闸）：agent 的 mutates 指令一个字都写不进文档", async () => {
  freshWorld();
  const { surface, calls, revisionNow } = stubSurface();
  const unregister = registerPluginCommandSurface(surface);
  const sink = {};
  const panel = await mountPanel(sink);
  try {
    assert.equal(
      readEditorCommandSurface(),
      null,
      "本例的前提：闸没装（PluginAgentPanel 不调 installAgentReviewGate）",
    );
    await agentSays(sink, { id: "grid.set-cell", params: { value: "9" } });

    const confirmButton = panel.container.querySelector(
      '[data-editor-command-action="confirm"]',
    );
    assert.ok(confirmButton, "会改文档的指令必须先出确认卡");
    await act(async () => {
      confirmButton.click();
    });

    assert.equal(calls.length, 0, "底层 run 一次都不许被调到 —— PARENT-red-1 的判据");
    assert.equal(revisionNow(), 3, "文档 revision 不许前进");
    const snapshot = hostReviewSession.snapshot();
    assert.ok(snapshot.parked, "改动必须停在审阅会话里等人点头");
    assert.equal(snapshot.parked.proposal.commandId, "grid.set-cell");
    assert.equal(snapshot.parked.editorId, "grid");
    const lastNote = sink.bridge.notes[sink.bridge.notes.length - 1];
    assert.ok(lastNote, "执行结果必须回写一句人话");
    assert.match(lastNote.text, /审阅/);
    const accept = panel.container.querySelector(
      '[data-agent-review-action="accept"]',
    );
    assert.ok(accept, "抽屉里必须出现审阅面板的接受按钮，人才能点头");
  } finally {
    await panel.unmount();
    unregister();
    freshWorld();
  }
});

test("同一条路上只读指令仍然立刻执行（失败即关闭不等于把人锁死）", async () => {
  freshWorld();
  const { surface, calls } = stubSurface();
  const unregister = registerPluginCommandSurface(surface);
  const sink = {};
  const panel = await mountPanel(sink);
  try {
    await agentSays(sink, { id: "grid.read-cell" }, 2, "task-read");
    assert.equal(
      panel.container.querySelector('[data-editor-command-action="confirm"]'),
      null,
      "只读指令不该出确认卡",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, "grid.read-cell");
    assert.equal(hostReviewSession.snapshot().parked, null, "只读不该产生提案");
  } finally {
    await panel.unmount();
    unregister();
    freshWorld();
  }
});

test("右边真的没开编辑器时，取面就是 null，agent 被明确告知做不了", async () => {
  freshWorld();
  const sink = {};
  const panel = await mountPanel(sink);
  try {
    await agentSays(sink, { id: "grid.set-cell", params: { value: "9" } }, 3, "task-empty");
    assert.equal(
      panel.container.querySelector('[data-editor-command-action="confirm"]'),
      null,
      "没有编辑器就不该出确认卡",
    );
    const lastNote = sink.bridge.notes[sink.bridge.notes.length - 1];
    assert.ok(lastNote);
    assert.match(lastNote.text, /没有打开编辑器/);
    assert.equal(hostReviewSession.snapshot().parked, null);
  } finally {
    await panel.unmount();
    freshWorld();
  }
});

test("取面处不许再出现「回落到没包闸的原始面」这条写法", () => {
  const source = readFileSync(
    new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
    "utf8",
  );
  // `currentPluginCommandSurface` 在这份文件里连调用都不该出现：它一出现就意味着
  // 取面处又能拿到只包了参数校验的原始面。
  // 断言只报命中的行，不把整份源码倒进 TAP 输出里。
  const offending = source
    .split("\n")
    .map((line, index) => [index + 1, line])
    .filter(
      ([, line]) =>
        /currentPluginCommandSurface\s*\(/.test(line) ||
        /from "\.\/plugin-command"/.test(line),
    )
    .map(([lineNumber, line]) => `${lineNumber}: ${line.trim()}`);
  assert.deepEqual(
    offending,
    [],
    "取面处不许再引 W1 注册表的原始面（那是 PARENT-red-1 的失败即开放）",
  );
  assert.equal(
    (source.match(/readAgentCommandSurface\(liveRef\.current\.surfaceReader\)/g) || [])
      .length,
    2,
    "执行路径（handleMessage）与上下文路径（contextFor）两处都要走同一个就地包闸的取面口",
  );
  assert.match(
    source,
    /assembleAgentEditorContext\(/,
    "PluginAgentPanel 主路径必须把选区块拼进 agent 上下文，不能只给指令清单",
  );
});

test("PluginAgentPanel 路径：选区从 edit bar DOM 进上下文，测试自己不许 publish", async () => {
  freshWorld();
  const bar = document.createElement("div");
  bar.setAttribute("data-selection-kind", "grid-column");
  bar.setAttribute("data-selection-id", "col-B");
  bar.setAttribute("aria-label", "B 列销售额");
  document.body.append(bar);
  const { surface } = stubSurface();
  const unregister = registerPluginCommandSurface(surface);
  const sink = {};
  const panel = await mountPanel(sink);
  try {
    const ctx = sink.bridge.contextFor("请清洗 @B列");
    assert.match(ctx, /〔当前选区〕/);
    assert.match(ctx, /kind=grid-column/);
    assert.match(ctx, /id=col-B/);
    assert.match(ctx, /摘要=/);
    assert.match(ctx, /〔提到的对象〕/);
    assert.match(ctx, /col-B/);
  } finally {
    await panel.unmount();
    unregister();
    bar.remove();
    freshWorld();
  }
});
