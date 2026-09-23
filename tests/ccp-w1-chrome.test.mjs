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
  remembered,
} = {}) {
  localStorage.clear();
  if (remembered) localStorage.setItem("oceanleo.serverPage.lastCard.cc_1", remembered);
  window.history.replaceState(null, "", "/computers/cc_1?" + new URLSearchParams(query));
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
    async rerenderComputers(next) {
      await act(async () => root.render(React.createElement(ServerPage, {
        computerId: "cc_1", client: api, computers: next,
        upgradePollIntervalMs: 0, upgradePollAttempts: 4, ...props,
      })));
      await flush();
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}


const { ProgramStrip } = await import(await compileModule("src/shell/cloud-computer/server-page/ProgramStrip.tsx", {
  "../../../i18n/ui/useUI": uiStubUrl,
}));
const { IconSettings } = await import(await compileModule("src/shell/cloud-computer/server-page/chrome-icons.tsx"));
const { replaceServerPageUrl } = await import("../src/shell/cloud-computer/server-page/url-state.ts");

async function click(node) {
  assert.ok(node);
  await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

test("three cards stay mounted and switch through history with no router calls", async () => {
  const view = await renderPage({ query: { card: "acp", program: "cursor", session: "s1" } });
  const original = view.host.querySelector("[data-test-acp-card]");
  const replace = window.history.replaceState;
  let writes = 0;
  window.history.replaceState = function (...args) { writes++; return replace.apply(this, args); };
  try {
    const tab = (id) => view.host.querySelector(`[data-oceanleo-server-tab="${id}"]`);
    assert.equal(tab("acp").textContent, "AI 对话");
    assert.equal(tab("cli").textContent, "");
    assert.equal(tab("terminal").textContent, "");
    await click(tab("terminal"));
    assert.equal(window.location.search, "?card=terminal");
    const hidden = original.closest('[role="tabpanel"]');
    assert.ok(hidden.classList.contains("invisible"));
    assert.ok(hidden.classList.contains("pointer-events-none"));
    assert.ok(hidden.hasAttribute("inert"));
    assert.equal(hidden.getAttribute("aria-hidden"), "true");
    await click(tab("cli"));
    await click(tab("acp"));
    assert.equal(view.host.querySelector("[data-test-acp-card]"), original);
    assert.equal(original.getAttribute("data-session"), "s1");
    assert.equal(view.host.querySelectorAll('[role="tabpanel"]').length, 3);
    assert.deepEqual(view.pushes, []);
    assert.deepEqual(view.replaces, []);
    assert.equal(writes, 3);
    assert.equal(tab("acp").getAttribute("aria-selected"), "true");
    assert.equal(hidden.hasAttribute("inert"), false);
    assert.ok(view.host.querySelector("[data-oceanleo-server-program-row]"));
    assert.equal(view.host.querySelector("[data-oceanleo-server-card-tabs]"), null);
  } finally { window.history.replaceState = replace; view.cleanup(); }
});

test("header supports arrow navigation, selected label and last-card preference", async () => {
  const view = await renderPage({ remembered: "cli" });
  try {
    const cli = view.host.querySelector('[data-oceanleo-server-tab="cli"]');
    assert.equal(cli.getAttribute("aria-selected"), "true");
    assert.ok(view.host.querySelector("[data-test-cli-card]"));
    await act(async () => cli.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    const terminal = view.host.querySelector('[data-oceanleo-server-tab="terminal"]');
    assert.equal(document.activeElement, terminal);
    assert.equal(terminal.textContent, "终端");
    assert.equal(cli.textContent, "");
    assert.equal(localStorage.getItem("oceanleo.serverPage.lastCard.cc_1"), "terminal");
    assert.deepEqual(view.replaces, []);
  } finally { view.cleanup(); }
});

test("list polling does not repeat node probes or reset initial card parameters", async () => {
  let probes = 0;
  const api = client({ async getNodeInfo() {
    probes++;
    return { version: "v1", latest_version: "v1", online: true, update_available: false, features: [] };
  } });
  const view = await renderPage({ api, query: { card: "acp", program: "cursor", session: "initial" } });
  try {
    const original = view.host.querySelector("[data-test-acp-card]");
    assert.equal(probes, 1);
    globalThis.__serverQuery = { card: "acp", program: "codex", session: "changed" };
    await view.rerenderComputers([computer()]);
    assert.equal(probes, 1);
    assert.equal(view.host.querySelector("[data-test-acp-card]"), original);
    assert.equal(original.getAttribute("data-program"), "cursor");
    assert.equal(original.getAttribute("data-session"), "initial");
    await view.rerenderComputers([computer({ node_version: "v2" })]);
    assert.equal(probes, 2);
  } finally { view.cleanup(); }
});

test("URL patch preserves unrelated query, hash and history state; null removes only its key", () => {
  window.history.replaceState({ next: true }, "", "/computers/cc_1?card=acp&program=cursor&session=s1&x=2#settings");
  replaceServerPageUrl("cc_1", { session: null });
  assert.equal(window.location.search, "?card=acp&program=cursor&x=2");
  assert.equal(window.location.hash, "#settings");
  assert.deepEqual(window.history.state, { next: true });
  replaceServerPageUrl("cc_1", { card: "cli", program: "claude code" });
  assert.equal(new URLSearchParams(window.location.search).get("program"), "claude code");
});

test("program strip wraps, collapses accessibly, persists and keeps selected item on first row", async () => {
  localStorage.clear();
  let availableWidth = 280;
  const observers = new Set();
  globalThis.ResizeObserver = class {
    constructor(fn) { this.fn = fn; observers.add(this); }
    observe() {}
    disconnect() { observers.delete(this); }
  };
  const top = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() {
    if (this.dataset.programId) return 100;
    if (this.querySelector?.('[aria-label="上移"]')) return 80;
    return 0;
  } });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() {
    return availableWidth - (host.querySelector('[aria-label="上移"]') ? 80 : 0);
  } });
  Object.defineProperty(HTMLElement.prototype, "offsetTop", { configurable: true, get() {
    if (!this.dataset.programId) return 0;
    const ordered = [...this.parentElement.children].sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0));
    return Math.floor(ordered.indexOf(this) / Math.max(1, Math.floor(this.parentElement.clientWidth / 100))) * 40;
  } });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return 40; } });
  const host = document.createElement("div"); document.body.append(host);
  let root = createRoot(host);
  const selected = [], settings = [];
  const props = { items: ["OceanLeo", "Cursor", "Hermes"].map((id) => ({ id, label: id })), selected: "Hermes",
    onSelect: (id) => selected.push(id), onSettings: (id) => settings.push(id), storageKey: "test.strip" };
  const render = () => act(async () => root.render(React.createElement(ProgramStrip, props)));
  try {
    await render();
    const up = () => host.querySelector('[aria-label="上移"]');
    const down = () => host.querySelector('[aria-label="下移"]');
    assert.ok(up()); assert.ok(down());
    assert.equal(down().disabled, true);
    assert.equal(host.querySelectorAll('[data-oceanleo-program-strip-settings][aria-label]').length, 3);
    await click(up());
    assert.equal(localStorage.getItem("test.strip"), "collapsed");
    assert.equal(host.querySelector('[data-program-strip-rows]').style.maxHeight, "40px");
    const hermes = host.querySelector('[data-program-id="Hermes"]');
    assert.equal(hermes.offsetTop, 0);
    assert.equal(hermes.hasAttribute("inert"), false);
    const secondRow = [...host.querySelectorAll('[data-program-id]')].filter((node) => node.offsetTop > 0);
    assert.equal(secondRow.length, 1);
    assert.ok(secondRow.every((node) => node.hasAttribute("inert") && node.getAttribute("aria-hidden") === "true"));
    await click(host.querySelector('[data-oceanleo-program-strip-settings="Hermes"]'));
    assert.deepEqual(settings, ["Hermes"]);
    await act(async () => root.unmount()); root = createRoot(host); await render();
    assert.equal(up().disabled, true);
    await click(down());
    assert.equal(host.querySelector('[data-program-strip-rows]').style.maxHeight, "");
    assert.equal(host.querySelectorAll('[data-program-id][inert]').length, 0);
    assert.equal(localStorage.getItem("test.strip"), "expanded");
    // The controls themselves still make three items wrap at 240px. The strip
    // must reclaim their 80px and discover that the full 320px fits one row.
    availableWidth = 320;
    await act(async () => { for (const observer of observers) observer.fn(); });
    assert.equal(up(), null); assert.equal(down(), null);
    await click(host.querySelector('[data-oceanleo-program-strip-item="Cursor"]'));
    assert.deepEqual(selected, ["Cursor"]);
  } finally {
    act(() => root.unmount()); host.remove();
    Object.defineProperty(HTMLElement.prototype, "offsetTop", top);
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
    else delete HTMLElement.prototype.clientWidth;
    delete globalThis.ResizeObserver;
  }
});

test("settings icon uses two horizontal sliders in a 24px viewBox", async () => {
  const host = document.createElement("div"), root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(IconSettings)));
    assert.equal(host.querySelector("svg").getAttribute("viewBox"), "0 0 24 24");
    assert.equal(host.querySelectorAll("path").length, 1);
    assert.equal(host.querySelector("path").getAttribute("d"), "M3 7h3m4 0h11M3 17h11m4 0h3");
    assert.deepEqual([...host.querySelectorAll("circle")].map((node) => [node.getAttribute("cx"), node.getAttribute("cy")]), [["8", "7"], ["16", "17"]]);
  } finally { act(() => root.unmount()); }
});
