import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
  url: "https://oceanleo.com/computers/cc_1?card=terminal",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
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
const apiStubUrl = dataModule("export const cloudComputerApi = {};");
const uiStubUrl = dataModule(`
  export function useUI() { return (value, values) => {
    if (!values) return value;
    return Object.entries(values).reduce(
      (text, [key, replacement]) => text.replaceAll("{" + key + "}", String(replacement)),
      value,
    );
  }; }
`);
const navigationStubUrl = dataModule(`
  export function useRouter() { return globalThis.__terminalCardRouter; }
`);
const appearanceStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AppearancePanel() {
    return React.createElement("div", { "data-test-appearance": "" });
  }
`);
const viewportStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function TerminalViewport(props) {
    return React.createElement("div", {
      "data-test-terminal-viewport": props.record.id,
      "data-read-only": props.readOnly ? "1" : "0",
    });
  }
`);

const { TerminalCard } = await import(
  await compileModule("src/shell/cloud-computer/terminal-card/TerminalCard.tsx", {
    "../../../lib/cloud-computer-api": apiStubUrl,
    "../../../i18n/ui/useUI": uiStubUrl,
    "next/navigation": navigationStubUrl,
    "./AppearancePanel": appearanceStubUrl,
    "./TerminalViewport": viewportStubUrl,
  })
);

function computer(overrides = {}) {
  return {
    id: "cc_1",
    name: "测试服务器",
    node_online: true,
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    id: "shell-1",
    title: "Shell 1",
    created_at: "2026-09-23T08:00:00Z",
    alive: true,
    ended_at: null,
    exit_code: null,
    end_reason: null,
    kind: "shell",
    program: null,
    cwd: null,
    record_bytes: 0,
    ...overrides,
  };
}

async function flush(count = 6) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {});
  }
}

function createClient({ recordsSupported = true, initialRecords = [] } = {}) {
  let sessions = [...initialRecords];
  const calls = {
    close: [],
    deleteRecord: [],
    open: [],
    list: 0,
  };
  return {
    calls,
    async listTerminalsWithRecords(id) {
      calls.list += 1;
      assert.equal(id, "cc_1");
      return { sessions: [...sessions], records_supported: recordsSupported };
    },
    async closeTerminal(id, sessionId) {
      calls.close.push({ id, sessionId });
      sessions = sessions.map((item) =>
        item.id === sessionId
          ? {
              ...item,
              alive: false,
              ended_at: "2026-09-23T12:00:00Z",
              end_reason: "closed",
            }
          : item,
      );
      return { ok: true };
    },
    async deleteTerminalRecord(id, sessionId) {
      calls.deleteRecord.push({ id, sessionId });
      sessions = sessions.filter((item) => item.id !== sessionId);
      return { ok: true };
    },
    async openTerminalSession(id, body) {
      calls.open.push({ id, body });
      const session = record({
        id: `new-${calls.open.length}`,
        title: "新终端",
        created_at: "2026-09-23T13:00:00Z",
      });
      sessions = [session, ...sessions];
      return { session };
    },
  };
}

async function renderCard({ api, props = {} }) {
  const pushes = [];
  const replaces = [];
  globalThis.__terminalCardRouter = {
    push(href) {
      pushes.push(href);
    },
    replace(href) {
      replaces.push(href);
    },
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(TerminalCard, {
        computer: computer(),
        client: api,
        refreshIntervalMs: 0,
        ...props,
      }),
    );
  });
  await flush();
  return {
    host,
    pushes,
    replaces,
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("终端卡排序、只读回放、关闭、二次确认删除与 URL 更新", async () => {
  const api = createClient({
    initialRecords: [
      record({
        id: "ended",
        title: "过去的 Shell",
        alive: false,
        ended_at: "2026-09-23T11:00:00Z",
        exit_code: 7,
        end_reason: "exit",
      }),
      record({ id: "live-old", created_at: "2026-09-23T08:00:00Z" }),
      record({ id: "live-new", created_at: "2026-09-23T10:00:00Z" }),
      record({ id: "cli", kind: "cli", program: "cursor" }),
    ],
  });
  const view = await renderCard({ api, props: { initialSessionId: "ended" } });
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = () => 1;
  try {
    assert.deepEqual(
      [...view.host.querySelectorAll("[data-oceanleo-terminal-row]")].map((node) =>
        node.getAttribute("data-oceanleo-terminal-row"),
      ),
      ["live-new", "live-old", "ended"],
    );
    const replay = view.host.querySelector("[data-test-terminal-viewport]");
    assert.equal(replay?.getAttribute("data-test-terminal-viewport"), "ended");
    assert.equal(replay?.getAttribute("data-read-only"), "1");
    assert.ok(view.host.querySelector("[data-oceanleo-ended-terminal-banner]"));
    assert.equal(view.replaces.length, 0);
    assert.equal(window.location.search, "?card=terminal&session=ended");

    const liveRow = view.host.querySelector(
      '[data-oceanleo-terminal-row="live-new"]',
    );
    const close = liveRow?.querySelector('[aria-label="关闭终端"]');
    assert.ok(close);
    await act(async () => close.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.deepEqual(api.calls.close, [{ id: "cc_1", sessionId: "live-new" }]);
    assert.match(view.host.textContent || "", /已关闭，记录保留/);

    const endedMenu = view.host.querySelector(
      '[data-oceanleo-terminal-row="ended"] [data-oceanleo-record-menu] button',
    );
    assert.ok(endedMenu);
    const dialogButton = (label) =>
      [...(document.querySelector('[role="dialog"]')?.querySelectorAll("button") ?? [])].find(
        (button) => button.textContent === label,
      );
    await act(async () => endedMenu.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.match(
      document.querySelector('[role="dialog"]')?.textContent || "",
      /确定删除这条终端记录吗？/,
    );
    const cancel = dialogButton("取消");
    assert.ok(cancel);
    await act(async () => cancel.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.equal(api.calls.deleteRecord.length, 0);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await act(async () => endedMenu.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const confirm = dialogButton("删除");
    assert.ok(confirm);
    await act(async () => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.deepEqual(api.calls.deleteRecord, [{ id: "cc_1", sessionId: "ended" }]);
    assert.equal(
      view.host.querySelector('[data-oceanleo-terminal-row="ended"]'),
      null,
    );

    const create = view.host.querySelector("[data-oceanleo-new-terminal]");
    assert.ok(create);
    await act(async () => create.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.deepEqual(api.calls.open, [
      { id: "cc_1", body: { cols: 120, rows: 36, kind: "shell" } },
    ]);
    assert.equal(view.replaces.length, 0);
    assert.equal(window.location.search, "?card=terminal&session=new-1");
  } finally {
    window.setTimeout = originalSetTimeout;
    view.cleanup();
  }
});

test("缓存列表首帧可用，地址更新不触发 router，重渲染不重拉", async () => {
  const api = createClient({ initialRecords: [record({ id: "cached" })] });
  const first = await renderCard({ api });
  assert.equal(api.calls.list, 1);
  first.cleanup();
  const before = api.calls.list;
  const second = await renderCard({ api, props: { initialSessionId: "cached" } });
  try {
    assert.equal(api.calls.list, before + 1);
    assert.ok(second.host.querySelector('[data-oceanleo-terminal-row="cached"]'));
    assert.equal(second.host.querySelector("[data-oceanleo-new-terminal]")?.textContent?.includes("+"), false);
    assert.equal(second.replaces.length, 0);
  } finally {
    second.cleanup();
  }
});

test("旧节点只显示活终端并提示更新后才能保留记录", async () => {
  const api = createClient({
    recordsSupported: false,
    initialRecords: [
      record({ id: "live" }),
      record({
        id: "ended",
        alive: false,
        ended_at: "2026-09-23T10:00:00Z",
        end_reason: "closed",
      }),
    ],
  });
  const view = await renderCard({ api });
  try {
    assert.deepEqual(
      [...view.host.querySelectorAll("[data-oceanleo-terminal-row]")].map((node) =>
        node.getAttribute("data-oceanleo-terminal-row"),
      ),
      ["live"],
    );
    assert.ok(view.host.querySelector("[data-oceanleo-records-unsupported]"));
    assert.match(view.host.textContent || "", /更新节点程序后才能保留终端记录/);
  } finally {
    view.cleanup();
  }
});
