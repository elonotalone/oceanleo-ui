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
  url: "https://oceanleo.com/computers",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  InputEvent: window.InputEvent,
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
const pageHeaderStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function PageHeader({ title }) {
    return React.createElement("h1", null, title);
  }
`);
const confirmDialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }) {
    return React.createElement(
      "div",
      { "data-testid": "confirm-dialog" },
      React.createElement("h2", null, title),
      React.createElement("p", null, body),
      React.createElement("button", { onClick: onConfirm }, confirmLabel),
      React.createElement("button", { onClick: onCancel }, "取消"),
    );
  }
`);
const dialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CreateComputerDialog() { return null; }
  export function ConnectServerDialog() { return null; }
`);

const { CloudComputersPage, CloudComputersSection } = await import(
  await compileModule("src/pages/CloudComputersPage.tsx", {
    "../i18n/ui/useUI": uiTextStubUrl,
    "../ui": confirmDialogStubUrl,
    "./PageHeader": pageHeaderStubUrl,
    "../shell/cloud-computer/CreateComputerDialog": dialogStubUrl,
    "../shell/cloud-computer/ConnectServerDialog": dialogStubUrl,
  })
);

function pc(overrides = {}) {
  return {
    id: "cc_1",
    name: "新加坡一号",
    source: "aliyun",
    status: "running",
    edition: "com",
    public_ip: "1.2.3.4",
    node_online: true,
    enrolled_at: "2026-09-20T00:00:00Z",
    confirmed_at: "2026-09-20T00:00:00Z",
    cost_to_date: { amount_minor: 120, currency: "USD" },
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

function makeClient(initial, overrides = {}) {
  let items = initial.map((item) => ({ ...item }));
  return {
    async listComputers() {
      return { items: items.map((item) => ({ ...item })) };
    },
    async listComputerEvents() {
      return { items: [{ id: 1, computer_id: "cc_1", kind: "lifecycle.running", detail: {}, created_at: "t" }] };
    },
    async getUsage() {
      return {
        items: [],
        total: { amount_minor: 120, currency: "USD" },
        hourly_now: { amount_minor: 4, currency: "USD" },
      };
    },
    ...overrides,
  };
}

async function flush(count = 6) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function render(client) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(CloudComputersPage, { client }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    button(label) {
      return [...host.querySelectorAll("button")].find(
        (node) => (node.textContent || "").trim() === label,
      );
    },
    async click(node) {
      assert.ok(node, "expected clickable element");
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("空态直接放购买云电脑和连接我的服务器两个入口", async () => {
  const view = await render(makeClient([]));
  assert.ok(view.host.querySelector("[data-oceanleo-cc-empty]"));
  assert.ok(view.text().includes("还没有云电脑"));
  assert.ok(view.button("购买云电脑"));
  assert.ok(view.button("连接我的服务器"));
  view.cleanup();
});

test("已接入卡片渲染名字、来源、在线芯片、公网 IP、费用", async () => {
  const view = await render(makeClient([pc()]));
  const card = view.host.querySelector('[data-oceanleo-cc-card="cc_1"]');
  assert.ok(card);
  assert.equal(card.getAttribute("data-oceanleo-cc-card-kind"), "connected");
  assert.equal(card.getAttribute("data-oceanleo-cc-display-state"), "ready");
  const text = view.text();
  assert.ok(text.includes("新加坡一号"));
  assert.ok(text.includes("阿里云"));
  assert.ok(text.includes("在线"));
  assert.ok(text.includes("1.2.3.4"));
  assert.equal(view.host.querySelector("[data-oceanleo-cc-pending-list]"), null);
  view.cleanup();
});

test("接入中与资产卡按 computerDisplayState 拆开，gone 不渲染", async () => {
  const items = [
    pc({
      id: "cc_p",
      name: "待装",
      source: "byo",
      status: "pending",
      enrolled_at: null,
      confirmed_at: null,
      node_online: false,
      public_ip: null,
    }),
    pc({
      id: "cc_e",
      name: "待确认机",
      source: "byo",
      status: "enrolled",
      enrolled_at: "t",
      confirmed_at: null,
      node_online: true,
      node_fingerprint: "SHA256:ffffeeee",
    }),
    pc({
      id: "cc_a",
      name: "在用机",
      source: "byo",
      status: "active",
      enrolled_at: "t",
      confirmed_at: "t",
      node_online: true,
      node_fingerprint: "SHA256:aaaabbbb",
      node_run_as: "oceanleo",
    }),
    pc({
      id: "cc_legacy",
      name: "elon",
      source: "byo",
      status: "active",
      enrolled_at: null,
      confirmed_at: null,
      node_online: false,
    }),
    pc({
      id: "cc_gone",
      name: "已删",
      source: "byo",
      status: "removed",
      enrolled_at: "t",
      confirmed_at: "t",
    }),
    pc({
      id: "cc_released",
      name: "已释放",
      source: "aliyun",
      status: "released",
    }),
    pc({
      id: "cc_off",
      name: "离线机",
      source: "aliyun",
      status: "running",
      node_online: false,
      enrolled_at: "t",
      confirmed_at: "t",
    }),
  ];
  const view = await render(makeClient(items));
  const pendingInstall = view.host.querySelector('[data-oceanleo-cc-card="cc_p"]');
  const pendingConfirm = view.host.querySelector('[data-oceanleo-cc-card="cc_e"]');
  const legacy = view.host.querySelector('[data-oceanleo-cc-card="cc_legacy"]');
  const active = view.host.querySelector('[data-oceanleo-cc-card="cc_a"]');
  const offline = view.host.querySelector('[data-oceanleo-cc-card="cc_off"]');
  assert.ok(pendingInstall);
  assert.ok(pendingConfirm);
  assert.ok(legacy);
  assert.ok(active);
  assert.ok(offline);
  assert.equal(pendingInstall.getAttribute("data-oceanleo-cc-card-kind"), "pending");
  assert.equal(pendingInstall.getAttribute("data-oceanleo-cc-display-state"), "pending_install");
  assert.equal(legacy.getAttribute("data-oceanleo-cc-card-kind"), "pending");
  assert.equal(legacy.getAttribute("data-oceanleo-cc-display-state"), "pending_install");
  assert.equal(pendingConfirm.getAttribute("data-oceanleo-cc-display-state"), "pending_confirm");
  assert.equal(active.getAttribute("data-oceanleo-cc-card-kind"), "connected");
  assert.equal(active.getAttribute("data-oceanleo-cc-display-state"), "ready");
  assert.equal(offline.getAttribute("data-oceanleo-cc-card-kind"), "connected");
  assert.equal(offline.getAttribute("data-oceanleo-cc-display-state"), "offline");
  assert.ok((pendingInstall.textContent || "").includes("安装命令还没在服务器上运行"));
  assert.ok(pendingInstall.querySelector("[data-oceanleo-cc-view-command]"));
  assert.match(
    pendingInstall.querySelector("[data-oceanleo-cc-view-command]").textContent || "",
    /查看安装命令/,
  );
  assert.ok((pendingConfirm.textContent || "").includes("节点已上线，请核对指纹后确认"));
  assert.equal(
    (pendingConfirm.querySelector("[data-oceanleo-cc-confirm-open]").textContent || "").trim(),
    "核对并确认",
  );
  assert.ok((offline.textContent || "").includes("离线"));
  assert.equal(view.host.querySelector('[data-oceanleo-cc-card="cc_gone"]'), null);
  assert.equal(view.host.querySelector('[data-oceanleo-cc-card="cc_released"]'), null);
  assert.ok(view.host.querySelector("[data-oceanleo-cc-pending-list]"));
  assert.ok(view.host.querySelector("[data-oceanleo-cc-connected-list]"));
  view.cleanup();
});

test("CloudComputersSection 单独渲染时同样拆开接入中与资产卡", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(CloudComputersSection, {
        client: makeClient([
          pc({
            id: "cc_legacy",
            name: "elon",
            source: "byo",
            status: "active",
            enrolled_at: null,
            confirmed_at: null,
          }),
        ]),
      }),
    );
  });
  for (let i = 0; i < 6; i += 1) await act(async () => {});
  const card = host.querySelector('[data-oceanleo-cc-card="cc_legacy"]');
  assert.ok(card);
  assert.equal(card.getAttribute("data-oceanleo-cc-card-kind"), "pending");
  assert.equal(host.querySelector("[data-oceanleo-cc-connected-list]"), null);
  act(() => root.unmount());
  host.remove();
});
