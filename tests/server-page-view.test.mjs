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
  url: "https://oceanleo.com/computers/cc_1",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLSelectElement: window.HTMLSelectElement,
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
const apiStubUrl = dataModule(`
  export const cloudComputerApi = globalThis.__serverDefaultClient;
`);
const uiStubUrl = dataModule(`
  export function useUI() { return (value, values) => {
    if (!values) return value;
    return Object.entries(values).reduce(
      (text, [key, replacement]) => text.replaceAll("{" + key + "}", String(replacement)),
      value,
    );
  }; }
`);
const domainStubUrl = dataModule(`
  export function currentDomainFamily() { return globalThis.__serverDomain || "com"; }
`);
const navigationStubUrl = dataModule(`
  export function useRouter() { return globalThis.__serverRouter; }
  export function useSearchParams() {
    return { get(name) { return globalThis.__serverQuery?.[name] ?? null; } };
  }
`);
const computersStubUrl = dataModule(`
  export function useCloudComputers(options = {}) {
    return {
      computers: options.computers || [],
      loading: false,
      refresh: async () => { globalThis.__serverRefreshes += 1; },
      setMountedId: (id) => { globalThis.__serverMounted = id; },
    };
  }
`);
const acpStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AcpCard(props) {
    return React.createElement("div", {
      "data-test-acp-card": props.computer.id,
      "data-program": props.initialProgram || "",
      "data-session": props.initialSessionId || "",
    });
  }
`);
const cliStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CliCard(props) {
    return React.createElement("div", {
      "data-test-cli-card": props.computer.id,
      "data-program": props.initialProgram || "",
      "data-session": props.initialSessionId || "",
    });
  }
`);
const terminalStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function TerminalCard(props) {
    return React.createElement("div", {
      "data-test-terminal-card": props.computer.id,
      "data-session": props.initialSessionId || "",
    });
  }
`);

const { ServerPage } = await import(
  await compileModule("src/shell/cloud-computer/server-page/ServerPage.tsx", {
    "../../../lib/cloud-computer-api": apiStubUrl,
    "../../../contracts/domain-family": domainStubUrl,
    "../../../i18n/ui/useUI": uiStubUrl,
    "../agent-dialog/AcpCard": acpStubUrl,
    "../terminal-card/CliCard": cliStubUrl,
    "../terminal-card/TerminalCard": terminalStubUrl,
    "../useCloudComputers": computersStubUrl,
    "next/navigation": navigationStubUrl,
  })
);

function computer(overrides = {}) {
  return {
    id: "cc_1",
    name: "新加坡服务器",
    source: "aliyun",
    status: "running",
    edition: "com",
    charge_status: "ok",
    node_online: true,
    enrolled_at: "2026-09-20T00:00:00Z",
    confirmed_at: "2026-09-20T00:00:00Z",
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

function client(overrides = {}) {
  return {
    async getNodeInfo() {
      return {
        version: "v1",
        latest_version: "v1",
        update_available: false,
        features: [],
        online: true,
      };
    },
    async upgradeNode() {
      return { ok: true, from: "v1", to: "v2" };
    },
    async startComputer() {
      return { ok: true };
    },
    ...overrides,
  };
}

async function flush(count = 6) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {});
  }
}

async function renderPage({
  computers = [computer()],
  query = {},
  domain = "com",
  api = client(),
  props = {},
} = {}) {
  const pushes = [];
  const replaces = [];
  globalThis.__serverQuery = query;
  globalThis.__serverDomain = domain;
  globalThis.__serverRefreshes = 0;
  globalThis.__serverMounted = null;
  globalThis.__serverRouter = {
    push(href) {
      pushes.push(href);
    },
    replace(href) {
      replaces.push(href);
    },
  };
  globalThis.__serverDefaultClient = api;

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(ServerPage, {
        computerId: "cc_1",
        client: api,
        computers,
        upgradePollIntervalMs: 0,
        upgradePollAttempts: 4,
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

test("服务器落地页按 AI 对话、AI 命令行、终端显示说明并进入对应 URL", async () => {
  const view = await renderPage();
  try {
    const choices = [...view.host.querySelectorAll("[data-oceanleo-server-card-choice]")];
    assert.deepEqual(
      choices.map((node) => node.getAttribute("data-oceanleo-server-card-choice")),
      ["acp", "cli", "terminal"],
    );
    assert.deepEqual(
      choices.map((node) => (node.textContent || "").replace(/\s+/g, " ").trim()),
      [
        "AI 对话用聊天让 AI 在这台服务器上做事。",
        "AI 命令行在终端里用这些 AI 程序的原版界面，功能最全，比如 /model。",
        "终端最原始的命令行。",
      ],
    );
    await act(async () => {
      choices[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(view.pushes, ["/computers/cc_1?card=cli"]);
  } finally {
    view.cleanup();
  }
});

test("卡片视图保留 program/session，并用 replace 在三张卡间切换", async () => {
  const view = await renderPage({
    query: { card: "acp", program: "cursor", session: "chat /1" },
  });
  try {
    const card = view.host.querySelector("[data-test-acp-card]");
    assert.ok(card);
    assert.equal(card.getAttribute("data-program"), "cursor");
    assert.equal(card.getAttribute("data-session"), "chat /1");
    const terminal = view.host.querySelector('[data-oceanleo-server-tab="terminal"]');
    assert.ok(terminal);
    await act(async () => {
      terminal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(view.replaces, ["/computers/cc_1?card=terminal"]);
  } finally {
    view.cleanup();
  }
});

test("离线服务器的三张卡不可点，直接卡片 URL 也只显示原因", async () => {
  const offline = computer({ node_online: false });
  const picker = await renderPage({ computers: [offline] });
  try {
    const choices = [...picker.host.querySelectorAll("[data-oceanleo-server-card-choice]")];
    assert.equal(choices.length, 3);
    assert.equal(choices.every((node) => node.disabled), true);
    assert.match(picker.host.textContent || "", /这台服务器离线/);
  } finally {
    picker.cleanup();
  }

  const direct = await renderPage({
    computers: [offline],
    query: { card: "terminal", session: "sid_1" },
  });
  try {
    assert.equal(direct.host.querySelector("[data-test-terminal-card]"), null);
    assert.ok(direct.host.querySelector('[data-oceanleo-server-unavailable="offline"]'));
    assert.equal(
      [...direct.host.querySelectorAll("[data-oceanleo-server-tab]")].every(
        (node) => node.disabled,
      ),
      true,
    );
  } finally {
    direct.cleanup();
  }
});

test("页头只列已接入服务器，切换时保留当前卡片", async () => {
  const second = computer({ id: "cc /2", name: "东京服务器" });
  const pending = computer({
    id: "cc_pending",
    name: "尚未接入",
    source: "byo",
    status: "pending",
    enrolled_at: null,
    confirmed_at: null,
    node_online: false,
  });
  const view = await renderPage({
    computers: [computer(), second, pending],
    query: { card: "cli" },
  });
  try {
    const select = view.host.querySelector("[data-oceanleo-server-switch]");
    assert.ok(select);
    assert.deepEqual(
      [...select.options].map((option) => option.value),
      ["cc_1", "cc /2"],
    );
    await act(async () => {
      select.value = "cc /2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(globalThis.__serverMounted, "cc /2");
    assert.deepEqual(view.pushes, ["/computers/cc%20%2F2?card=cli"]);
  } finally {
    view.cleanup();
  }
});

test("未接入机器禁用卡片；已停机的阿里云机器可以发起开机", async () => {
  const pending = await renderPage({
    computers: [
      computer({
        source: "byo",
        status: "pending",
        enrolled_at: null,
        confirmed_at: null,
        node_online: false,
      }),
    ],
  });
  try {
    assert.equal(
      [...pending.host.querySelectorAll("[data-oceanleo-server-card-choice]")].every(
        (node) => node.disabled,
      ),
      true,
    );
    assert.match(pending.host.textContent || "", /还没有接入/);
  } finally {
    pending.cleanup();
  }

  const starts = [];
  const stopped = await renderPage({
    computers: [computer({ status: "stopped", node_online: false })],
    api: client({
      async startComputer(id) {
        starts.push(id);
        return { ok: true };
      },
    }),
  });
  try {
    const action = stopped.host.querySelector("[data-oceanleo-server-start]");
    assert.ok(action);
    await act(async () => {
      action.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.deepEqual(starts, ["cc_1"]);
    assert.equal(globalThis.__serverRefreshes, 1);
    assert.match(stopped.host.textContent || "", /开机请求已发送/);
  } finally {
    stopped.cleanup();
  }
});

test("节点升级先确认，再请求升级并轮询到在线且版本变化", async () => {
  let nodeReads = 0;
  let upgradeCalls = 0;
  const api = client({
    async getNodeInfo() {
      nodeReads += 1;
      if (nodeReads === 1) {
        return {
          version: "v1",
          latest_version: "v2",
          update_available: true,
          features: ["records"],
          online: true,
        };
      }
      if (nodeReads === 2) {
        return {
          version: "v1",
          latest_version: "v2",
          update_available: true,
          features: ["records"],
          online: false,
        };
      }
      return {
        version: "v2",
        latest_version: "v2",
        update_available: false,
        features: ["records"],
        online: true,
      };
    },
    async upgradeNode(id) {
      upgradeCalls += 1;
      assert.equal(id, "cc_1");
      return { ok: true, from: "v1", to: "v2" };
    },
  });
  const view = await renderPage({ api });
  try {
    assert.match(view.host.textContent || "", /节点有新版本 v2/);
    const action = view.host.querySelector("[data-oceanleo-node-upgrade-action]");
    assert.ok(action);
    await act(async () => {
      action.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    assert.equal(upgradeCalls, 0);
    const dialog = document.querySelector('[role="dialog"]');
    assert.match(
      dialog?.textContent || "",
      /更新时这台服务器上正在运行的终端会被关掉，过去的记录会保留/,
    );
    const confirm = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "更新",
    );
    assert.ok(confirm);
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush(10);
    assert.equal(upgradeCalls, 1);
    assert.equal(nodeReads, 3);
    assert.equal(globalThis.__serverRefreshes, 1);
    assert.equal(
      view.host.querySelector("[data-oceanleo-node-upgrade]")?.getAttribute(
        "data-oceanleo-node-upgrade",
      ),
      "complete",
    );
    assert.match(view.host.textContent || "", /节点更新完成/);
  } finally {
    view.cleanup();
  }
});

test(".cn 版本不渲染云电脑页面并回首页", async () => {
  const view = await renderPage({ domain: "cn" });
  try {
    assert.equal(view.host.innerHTML, "");
    assert.deepEqual(view.replaces, ["/"]);
  } finally {
    view.cleanup();
  }
});
