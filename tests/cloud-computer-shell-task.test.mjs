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
  url: "https://oceanleo.com/history?task=task-1",
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

const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
const navStubUrl = dataModule(`
  export function useRouter() { return globalThis.__shellRouter; }
`);
const endedCopyStubUrl = dataModule(`
  export const SHELL_ENDED_ZH = {
    missingSession: "缺少会话，这个 Shell 没有开始。",
  };
`);

const { ShellTaskView } = await import(
  await compileModule("src/shell/cloud-computer/ShellTaskView.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../../i18n/ui/messages/shell-ended-copy": endedCopyStubUrl,
    "next/navigation": navStubUrl,
  })
);

async function flush(count = 6) {
  for (let index = 0; index < count; index += 1) await act(async () => {});
}

async function render(props = {}) {
  const replaces = [];
  globalThis.__shellRouter = {
    push() {},
    replace(href) {
      replaces.push(href);
    },
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(ShellTaskView, {
        taskId: "task-1",
        computerId: "cc /1",
        sessionId: "sid /2",
        ...props,
      }),
    );
  });
  await flush();
  return {
    host,
    replaces,
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("shellSessionFromTask 从旧任务 plan/列提取服务器和会话", () => {
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

test("旧 Shell 任务只 replace 到服务器页终端记录，不再渲染结束或对话操作", async () => {
  const view = await render();
  try {
    assert.deepEqual(view.replaces, [
      "/computers/cc%20%2F1?card=terminal&session=sid+%2F2",
    ]);
    assert.equal(view.host.innerHTML, "");
    assert.equal(view.host.querySelector("[data-oceanleo-cc-end-shell]"), null);
    assert.equal(view.host.querySelector("[data-oceanleo-cc-agent-dialog]"), null);
    assert.equal((view.host.textContent || "").includes("结束 Shell"), false);
    assert.equal((view.host.textContent || "").includes("用对话界面继续"), false);
  } finally {
    view.cleanup();
  }
});

test("旧任务缺服务器或会话时给说明和回首页，不猜测跳转", async () => {
  for (const props of [
    { computerId: "" },
    { sessionId: "" },
  ]) {
    const view = await render(props);
    try {
      assert.deepEqual(view.replaces, []);
      assert.ok(view.host.querySelector("[data-oceanleo-cc-shell-redirect-missing]"));
      assert.match(view.host.textContent || "", /缺少会话/);
      assert.equal(view.host.querySelector('a[href="/"]')?.textContent, "返回首页");
      assert.equal((view.host.textContent || "").includes("结束 Shell"), false);
      assert.equal((view.host.textContent || "").includes("用对话界面继续"), false);
    } finally {
      view.cleanup();
    }
  }
});
