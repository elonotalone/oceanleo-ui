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
  HTMLInputElement: window.HTMLInputElement,
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
const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const domainStubUrl = dataModule(`
  export function currentDomainFamily() { return "com"; }
`);
const dialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CreateComputerDialog() { return null; }
  export function ConnectServerDialog() { return null; }
`);
const terminalStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function TerminalPanel() { return React.createElement("div", { "data-testid": "term" }); }
  export function encodeTermText(t) { return t; }
  export function decodeTermB64(t) { return t; }
`);

let storedMounted = "";
const apiStubUrl = dataModule(`
  export const cloudComputerApi = globalThis.__ccApi;
  export function readMountedComputerId() { return globalThis.__ccMounted || ""; }
  export function writeMountedComputerId(id) { globalThis.__ccMounted = id || ""; }
`);

const { ComputerDock } = await import(
  await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
    "../../i18n/ui/useUI": uiTextStubUrl,
    "../../contracts/domain-family": domainStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
    "./CreateComputerDialog": dialogStubUrl,
    "./ConnectServerDialog": dialogStubUrl,
    "./TerminalPanel": terminalStubUrl,
  })
);

const { pickMountedId, newShellEnabled } = await import(
  await compileModule("src/shell/cloud-computer/useCloudComputers.ts", {
    "../../lib/cloud-computer-api": apiStubUrl,
  })
);

function pc(overrides = {}) {
  return {
    id: "cc_1",
    name: "新加坡",
    source: "aliyun",
    status: "running",
    edition: "com",
    node_online: true,
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

function makeClient(items) {
  return {
    async listComputers() {
      return { items: items.map((item) => ({ ...item })) };
    },
    async openTerminal() {
      return { id: "sid_1" };
    },
  };
}

async function flush(count = 6) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function render(computers, client = makeClient(computers)) {
  globalThis.__ccApi = client;
  globalThis.__ccMounted = storedMounted;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ComputerDock, { client, computers }));
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
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("pickMountedId：零台 → 未挂载", () => {
  assert.equal(pickMountedId([], "cc_1"), null);
  assert.equal(pickMountedId([pc({ status: "released" })], null), null);
});

test("pickMountedId：恰一台在线 → 自动挂那台", () => {
  const a = pc({ id: "cc_a", node_online: true });
  const b = pc({ id: "cc_b", node_online: false });
  assert.equal(pickMountedId([a, b], "cc_b"), "cc_a");
});

test("pickMountedId：多台在线 → 上次选择，没有则第一台在线", () => {
  const a = pc({ id: "cc_a", node_online: true });
  const b = pc({ id: "cc_b", node_online: true });
  assert.equal(pickMountedId([a, b], "cc_b"), "cc_b");
  assert.equal(pickMountedId([a, b], null), "cc_a");
  assert.equal(pickMountedId([a, b], "missing"), "cc_a");
});

test("零台时显示电脑入口，没有新建 Shell", async () => {
  storedMounted = "";
  const view = await render([]);
  assert.ok(view.host.querySelector("[data-oceanleo-cc-dock-empty]"));
  assert.equal(view.button("电脑")?.textContent.trim(), "电脑");
  assert.equal(view.button("新建 Shell"), undefined);
  view.cleanup();
});

test("一台在线时显示名字，新建 Shell 可点", async () => {
  storedMounted = "";
  const view = await render([pc({ name: "新加坡一号" })]);
  assert.ok(view.text().includes("新加坡一号"));
  const shell = view.host.querySelector("[data-oceanleo-cc-new-shell]");
  assert.ok(shell);
  assert.equal(shell.disabled, false);
  view.cleanup();
});

test("挂载电脑离线时新建 Shell 不可点", async () => {
  storedMounted = "cc_1";
  const view = await render([pc({ node_online: false, status: "stopped" })]);
  const shell = view.host.querySelector("[data-oceanleo-cc-new-shell]");
  assert.ok(shell);
  assert.equal(shell.disabled, true);
  assert.equal(newShellEnabled(pc({ node_online: false })), false);
  view.cleanup();
});
