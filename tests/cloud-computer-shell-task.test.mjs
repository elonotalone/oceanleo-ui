import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  isShellTask,
  shellPlanOf,
  shellSessionFromTask,
} from "../src/shell/history-model.ts";

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
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/",
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
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const navStubUrl = dataModule(`
  export function useRouter() {
    return globalThis.__shellRouter || { push() {}, replace() {}, refresh() {}, back() {} };
  }
`);
const apiStubUrl = dataModule(`
  export const cloudComputerApi = globalThis.__shellApi;
  export function agentDialogWsUrl(id, sessionId, token) {
    return "ws://example.test/v1/computers/" + id + "/agent-dialog?session_id=" + sessionId + "&token=" + token;
  }
`);
const terminalStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function useComputerTerminal() {
    return { hostRef: { current: null }, ready: true, status: "live", detail: undefined };
  }
  export function encodeTermText(t) { return t; }
  export function decodeTermB64(t) { return t; }
  export function TerminalPanel() { return null; }
`);
const stateStubUrl = dataModule(`
  export function computerDisplayState(computer) {
    if (!computer) return "offline";
    if (computer.node_online) return "ready";
    return "offline";
  }
  export function canOpenShell(computer) {
    return Boolean(computer && computer.node_online);
  }
`);

const { ShellTaskView } = await import(
  await compileModule("src/shell/cloud-computer/ShellTaskView.tsx", {
    "../../i18n/ui/useUI": uiTextStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
    "./TerminalPanel": terminalStubUrl,
    "./computer-state": stateStubUrl,
    "next/navigation": navStubUrl,
  })
);

function makeClient(overrides = {}) {
  return {
    async getComputer() {
      return {
        id: "cc_1",
        name: "新加坡一号",
        node_online: true,
        status: "running",
      };
    },
    async closeTerminal() {
      return { ok: true };
    },
    async openTerminal(_id, body) {
      globalThis.__shellOpenBody = body;
      return { id: "sid_new", task_id: "task-new" };
    },
    ...overrides,
  };
}

async function flush(count = 8) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function render(props, client = makeClient()) {
  globalThis.__shellApi = client;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(ShellTaskView, {
        client,
        taskId: "task-1",
        computerId: "cc_1",
        sessionId: "sid_1",
        computerName: "新加坡一号",
        ...props,
      }),
    );
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("shellPlanOf / shellSessionFromTask：缺字段视为已结束", () => {
  assert.equal(isShellTask({ mode: "shell" }), true);
  assert.equal(isShellTask({ mode: "agent" }), false);
  assert.equal(shellPlanOf({ plan: null }), null);
  assert.deepEqual(
    shellPlanOf({
      plan: {
        shell: {
          computer_id: "cc_1",
          session_id: "sid_1",
          computer_name: "新加坡",
        },
      },
    }),
    { computer_id: "cc_1", session_id: "sid_1", computer_name: "新加坡" },
  );
  assert.equal(
    shellSessionFromTask({
      id: "t1",
      status: "running",
      mode: "shell",
      plan: { shell: { computer_id: "cc_1" } },
    }),
    null,
  );
  assert.deepEqual(
    shellSessionFromTask({
      id: "t1",
      status: "running",
      mode: "shell",
      computer_id: "cc_from_col",
      plan: { shell: { session_id: "sid_1", computer_name: "新加坡" } },
    }),
    { computerId: "cc_from_col", sessionId: "sid_1", computerName: "新加坡" },
  );
});

test("缺 sessionId 时显示这个 Shell 已结束", async () => {
  const view = await render({ sessionId: "" });
  assert.match(view.text(), /这个 Shell 已结束/);
  assert.ok(view.host.querySelector("[data-oceanleo-cc-reopen-shell]"));
  assert.equal(view.host.querySelector("[data-oceanleo-cc-end-shell]"), null);
  view.cleanup();
});

test("进行中的 Shell 显示结束按钮，点了调用 closeTerminal", async () => {
  let closed = null;
  const client = makeClient({
    async closeTerminal(computerId, sessionId) {
      closed = { computerId, sessionId };
      return { ok: true };
    },
  });
  const view = await render({}, client);
  const root = view.host.querySelector("[data-oceanleo-cc-shell-task]");
  assert.equal(root.getAttribute("data-ended"), "0");
  const end = view.host.querySelector("[data-oceanleo-cc-end-shell]");
  assert.ok(end);
  await act(async () => {
    end.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.deepEqual(closed, { computerId: "cc_1", sessionId: "sid_1" });
  assert.match(view.text(), /这个 Shell 已结束/);
  view.cleanup();
});

test("进行中的 Shell 能改用对话界面，终端节点仍留在页面上", async () => {
  const view = await render({});
  assert.match(view.text(), /用对话界面继续/);
  const open = view.host.querySelector("[data-oceanleo-cc-agent-dialog]");
  assert.ok(open);
  await act(async () => {
    open.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  const cursor = view.host.querySelector("[data-oceanleo-cc-dialog-cursor]");
  assert.ok(cursor);
  await act(async () => {
    cursor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.ok(view.host.querySelector("[data-oceanleo-cc-dialog-input]"));
  assert.ok(view.host.querySelector("[data-oceanleo-cc-xterm]"));
  view.cleanup();
});

test("再开一个会带 as_task 并 push /history?task=", async () => {
  const pushes = [];
  globalThis.__shellRouter = {
    push(href) {
      pushes.push(href);
    },
    replace() {},
    refresh() {},
    back() {},
  };
  const view = await render({ sessionId: "" });
  const reopen = view.host.querySelector("[data-oceanleo-cc-reopen-shell]");
  await act(async () => {
    reopen.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.equal(globalThis.__shellOpenBody.as_task, true);
  assert.deepEqual(pushes, ["/history?task=task-new"]);
  view.cleanup();
});
