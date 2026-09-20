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

const { CloudComputersPage } = await import(
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

test("空态直接放创建云电脑和接入我的服务器两个入口", async () => {
  const view = await render(makeClient([]));
  assert.ok(view.host.querySelector("[data-oceanleo-cc-empty]"));
  assert.ok(view.text().includes("还没有云电脑"));
  assert.ok(view.button("创建云电脑"));
  assert.ok(view.button("接入我的服务器"));
  view.cleanup();
});

test("列表卡片渲染名字、来源、状态、公网 IP、节点、费用", async () => {
  const view = await render(makeClient([pc()]));
  const text = view.text();
  assert.ok(text.includes("新加坡一号"));
  assert.ok(text.includes("阿里云"));
  assert.ok(text.includes("运行中"));
  assert.ok(text.includes("1.2.3.4"));
  assert.ok(text.includes("在线"));
  assert.ok(view.host.querySelector('[data-oceanleo-cc-card="cc_1"]'));
  view.cleanup();
});
