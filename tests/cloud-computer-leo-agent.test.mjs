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
  KeyboardEvent: window.KeyboardEvent,
  localStorage: window.localStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      return String(value).replace(/\\{(\\w+)\\}/g, (_, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : "{" + key + "}",
      );
    };
  }
`);
const agentStubUrl = dataModule(`
  export async function authed(path, init) {
    const res = await fetch("https://gateway.test" + path, init || {});
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) return { ok: false, error: "fail", status: res.status };
    return { ok: true, data };
  }
  export function getTask(taskId) {
    return authed("/v1/agent/tasks/" + encodeURIComponent(taskId));
  }
`);

const { LeoAgentPanel } = await import(
  await compileModule("src/shell/cloud-computer/leo-agent/LeoAgentPanel.tsx", {
    "../../../i18n/ui/useUI": uiStubUrl,
    "../../../lib/agent": agentStubUrl,
  })
);

const calls = [];

function json(body) {
  return { ok: true, status: 200, json: async () => body };
}

function stateOf(overrides) {
  return {
    online: true,
    mode: "local",
    task_id: null,
    notes: [],
    prefs: {},
    running: [],
    last_seen_at: "2026-09-22T01:02:03Z",
    events: [{ kind: "node.confirmed", created_at: "2026-09-22T01:00:00Z", meta: {} }],
    ...overrides,
  };
}

function installFetch(handler) {
  calls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return json(handler(call));
  };
}

function callWhere(part, method) {
  return calls.find((call) => call.url.includes(part) && (!method || call.method === method));
}

async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPanel({
  state,
  computer,
  onType,
  tail = "TAIL",
  form = "card",
  computerId = "cc_leo",
} = {}) {
  localStorage.setItem(`oceanleo.cc.leo.${computerId}.form`, form);
  const sent = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const row = computer || {
    id: computerId,
    name: "新加坡一号",
    source: "aliyun",
    status: "running",
  };
  await act(async () => {
    root.render(
      React.createElement(LeoAgentPanel, {
        computerId,
        sessionId: "sid_1",
        computer: row,
        client: {
          async getComputer() {
            return row;
          },
          async startComputer() {
            return { ...row, status: "running" };
          },
        },
        terminal: {
          sendText(text) {
            sent.push(text);
            onType?.(text);
          },
          tail() {
            return tail;
          },
          ready: true,
        },
      }),
    );
  });
  await settle();
  return {
    host,
    sent,
    text: () => host.textContent || "",
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function route(call, state, extras = {}) {
  if (call.url.includes("/leo/turn") && call.method === "POST") {
    return { task_id: "task_leo", mode: state.online ? "local" : "remote" };
  }
  if (call.url.includes("/leo/state") && call.method === "PUT") return state;
  if (call.url.includes("/leo/state")) return state;
  if (call.url.includes("/leo/watches") && call.method === "POST") {
    return {
      watch: {
        id: "w1",
        computer_id: "cc_leo",
        kind: "process",
        program: call.body.program,
        shell_session_id: null,
        label: call.body.label,
        status: "armed",
        created_at: "2026-09-22T01:00:00Z",
        fired_at: null,
        last_seen_at: null,
      },
    };
  }
  if (call.url.includes("/leo/watches")) return { watches: [] };
  if (call.url.includes("/leo/notes") && call.method === "POST") {
    return { note: { id: "n1", text: call.body.text, created_at: "2026-09-22T01:00:00Z" } };
  }
  if (call.url.includes("/notifications/read")) return { updated: 1, unread_count: 0 };
  if (call.url.includes("kind=cloud_computer.offline")) return { items: [], unread_count: 0 };
  if (call.url.includes("/v1/notifications")) return extras.notifications || { items: [], unread_count: 0 };
  if (call.url.includes("/v1/agent/tasks/")) return extras.task || { task: { status: "done" }, messages: [], artifacts: [] };
  return {};
}

async function withPanel(options, fn) {
  const view = await renderPanel(options);
  try {
    await fn(view);
  } finally {
    view.cleanup();
  }
}

test("在线与离线的模式条文案", async () => {
  const online = stateOf({ online: true, mode: "local" });
  installFetch((call) => route(call, online));
  await withPanel({ state: online, computerId: "cc_on" }, async (up) => {
    assert.match(up.text(), /本机模式 · 这台机器上干活/);
  });

  const offline = stateOf({ online: false, mode: "remote", last_seen_at: "2026-09-21T00:00:00Z" });
  installFetch((call) => route(call, offline));
  await withPanel(
    {
      state: offline,
      computerId: "cc_off",
      computer: { id: "cc_off", name: "停着的", source: "aliyun", status: "stopped" },
    },
    async (down) => {
      assert.match(down.text(), /远程模式 · 机器离线，从 OceanLeo 这边帮你/);
      assert.ok(down.host.querySelector("[data-oceanleo-cc-leo-power]"));
    },
  );

  installFetch((call) => route(call, offline));
  await withPanel(
    {
      state: offline,
      computerId: "cc_byo",
      computer: { id: "cc_byo", name: "自己的", source: "byo", status: "active" },
    },
    async (byo) => {
      const link = byo.host.querySelector("[data-oceanleo-cc-leo-devices]");
      assert.equal(link?.getAttribute("href"), "/devices");
    },
  );
});

test("发一轮时请求体带上终端尾巴", async () => {
  const state = stateOf({ task_id: null });
  installFetch((call) => route(call, state));
  await withPanel({ state, tail: "DISK 90%\n", computerId: "cc_turn" }, async (view) => {
    const input = view.host.querySelector("[data-oceanleo-cc-leo-input]");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    const send = view.host.querySelector("[data-oceanleo-cc-leo-send]");
    await act(async () => {
      setter.call(input, "看看磁盘");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      send.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const turn = callWhere("/leo/turn", "POST");
    assert.ok(turn, JSON.stringify(calls.map((call) => `${call.method} ${call.url}`)));
    assert.equal(turn.body.text, "看看磁盘");
    assert.equal(turn.body.terminal_tail, "DISK 90%\n");
    assert.equal(turn.body.shell_session_id, "sid_1");
    assert.equal(Object.hasOwn(turn.body, "task_id"), false);
  });
});

test("提醒开关发出 process watch", async () => {
  const state = stateOf({ running: ["claude"] });
  installFetch((call) => route(call, state));
  await withPanel({ state, computerId: "cc_watch" }, async (view) => {
    const open = view.host.querySelector("[data-oceanleo-cc-leo-quick='watch']");
    await act(async () => {
      open.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const toggle = view.host.querySelector("[data-oceanleo-cc-leo-watch='claude']");
    assert.ok(toggle);
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const watch = callWhere("/leo/watches", "POST");
    assert.ok(watch);
    assert.deepEqual(watch.body, {
      kind: "process",
      program: "claude",
      label: "Claude Code",
    });
  });
});

test("通知出现 toast 后标已读", async () => {
  const state = stateOf();
  const note = {
    id: "note_1",
    kind: "cloud_computer.watch.done",
    title: "Claude Code 做好了",
    body: "可以看了",
    link: "/history?task=task-1",
    meta: {},
    read_at: null,
    created_at: "2026-09-22T01:00:00Z",
  };
  installFetch((call) => route(call, state, { notifications: { items: [note], unread_count: 1 } }));
  await withPanel({ state, computerId: "cc_note" }, async (view) => {
    assert.ok(view.host.querySelector("[data-oceanleo-cc-leo-toast='note_1']"));
    assert.match(view.text(), /Claude Code 做好了/);
    const read = callWhere("/notifications/read", "POST");
    assert.ok(read);
    assert.deepEqual(read.body, { ids: ["note_1"] });
  });
});

test("引导把命令送进终端且不带回车", async () => {
  const state = stateOf();
  installFetch((call) => route(call, state));
  await withPanel({ state, computerId: "cc_guide" }, async (view) => {
    localStorage.removeItem("oceanleo.cc.leo.cc_guide.guide.cursor");
    const teach = view.host.querySelector("[data-oceanleo-cc-leo-quick='teach']");
    await act(async () => {
      teach.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const cursor = view.host.querySelector("[data-oceanleo-cc-leo-program='cursor']");
    await act(async () => {
      cursor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const type = view.host.querySelector("[data-oceanleo-cc-leo-guide-send]");
    assert.ok(type);
    await act(async () => {
      type.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    assert.equal(view.sent.length, 1);
    assert.equal(view.sent[0].includes("\n"), false);
    assert.equal(view.sent[0], "cursor-agent update");
  });
});

test("agent 正文里的 script 只作为文字", async () => {
  const state = stateOf({ task_id: "task_xss" });
  installFetch((call) =>
    route(call, state, {
      task: {
        task: { id: "task_xss", status: "done" },
        messages: [
          {
            id: 7,
            role: "assistant",
            kind: "text",
            content: "结果 <script>alert(1)</script>",
          },
        ],
        artifacts: [],
      },
    }),
  );
  await withPanel({ state, computerId: "cc_xss" }, async (view) => {
    assert.equal(document.querySelector("script"), null);
    assert.match(view.text(), /<script>alert\(1\)<\/script>/);
  });
});
