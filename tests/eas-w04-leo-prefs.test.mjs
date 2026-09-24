import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ============================================================================
// W04 · 登录把停用 / 位置写到 /v1/personalization；未登录只写本机。
// ============================================================================

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://ppt.oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  CustomEvent: window.CustomEvent,
  localStorage: window.localStorage,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactNs = await import("react");
const React = reactNs.createElement ? reactNs : reactNs.default;
const { act } = reactNs.act ? reactNs : React;
const { createRoot } = await import("react-dom/client");

const agentStubUrl = dataModule(`
  export async function authed(path, init) {
    if (!globalThis.__w04Token) return { ok: false, error: "未登录", status: 401 };
    let res;
    try {
      res = await fetch("https://gateway.test" + path, { method: (init && init.method) || "GET", body: init && init.body });
    } catch {
      return { ok: false, error: "网络错误", status: 0 };
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      return { ok: false, error: data && typeof data.detail === "string" ? data.detail : "HTTP " + res.status, status: res.status };
    }
    return { ok: true, data };
  }
`);
const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");
const authClientStubUrl = dataModule("export async function accessToken(){ return globalThis.__w04Token || null; }");
const authConfigStubUrl = dataModule('export const GATEWAY_BASE = "https://gateway.test";');
const STUBS = {
  "../i18n/ui/useUI": uiStubUrl,
  "../../i18n/ui/useUI": uiStubUrl,
  "../lib/agent": agentStubUrl,
  "../../lib/agent": agentStubUrl,
  "../lib/auth/client": authClientStubUrl,
  "../../lib/auth/client": authClientStubUrl,
  "../lib/auth/config": authConfigStubUrl,
  "../../lib/auth/config": authConfigStubUrl,
};

const { LeoAssistant } = await import(await compileModule("src/shell/LeoAssistant.tsx", STUBS));
const {
  LEO_ENABLED_KEY,
  LEO_POS_KEY,
  LEO_PREFS_MIGRATED_KEY,
  persistLeoPanelPos,
  pullLeoPrefsFromServer,
  setLeoEnabled,
} = await import(await compileModule("src/shell/leo/leo-prefs.ts", STUBS));

const calls = [];
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function installGateway({ token = "test-token", prefs = null } = {}) {
  calls.length = 0;
  globalThis.__w04Token = token;
  const store = {
    memory_enabled: true,
    custom_instructions: "",
    leo_enabled: prefs?.leo_enabled !== false,
    leo_panel: prefs?.leo_panel && typeof prefs.leo_panel === "object" ? prefs.leo_panel : {},
  };
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    if (call.url.includes("/v1/personalization")) {
      if (call.method === "PATCH") {
        if (typeof call.body?.leo_enabled === "boolean") store.leo_enabled = call.body.leo_enabled;
        if (call.body?.leo_panel && typeof call.body.leo_panel === "object") store.leo_panel = call.body.leo_panel;
        return jsonResponse(200, { ...store });
      }
      return jsonResponse(200, { ...store });
    }
    if (call.url.includes("/v1/assistant/leo-sessions")) {
      return jsonResponse(200, { sessions: [] });
    }
    if (call.url.includes("/v1/assistant/leo-transcript")) return jsonResponse(200, { entries: [] });
    return jsonResponse(404, { detail: "Not Found" });
  };
}

function clearLocal() {
  window.localStorage.removeItem(LEO_ENABLED_KEY);
  window.localStorage.removeItem(LEO_POS_KEY);
  window.localStorage.removeItem(LEO_PREFS_MIGRATED_KEY);
}

async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const ANCHOR = { left: 460, top: 600, right: 500, bottom: 628, width: 40, height: 28 };

test("未登录：停用和位置只写 localStorage，不打 /v1/personalization", async () => {
  clearLocal();
  installGateway({ token: null });
  setLeoEnabled(false);
  persistLeoPanelPos({ left: 40, top: 60 });
  await settle(4);
  assert.equal(window.localStorage.getItem(LEO_ENABLED_KEY), "0");
  assert.equal(window.localStorage.getItem(LEO_POS_KEY), JSON.stringify({ left: 40, top: 60 }));
  assert.equal(calls.filter((c) => c.url.includes("/v1/personalization")).length, 0);
});

test("登录：停用 / 位置写 PATCH /v1/personalization", async () => {
  clearLocal();
  installGateway();
  setLeoEnabled(false);
  persistLeoPanelPos({ left: 88, top: 120 });
  await settle(6);
  const patches = calls.filter((c) => c.method === "PATCH" && c.url.includes("/v1/personalization"));
  assert.ok(patches.some((c) => c.body?.leo_enabled === false), "停用写 leo_enabled");
  assert.ok(
    patches.some((c) => c.body?.leo_panel?.pos?.left === 88 && c.body?.leo_panel?.pos?.top === 120),
    "位置写 leo_panel.pos",
  );
  assert.equal(window.localStorage.getItem(LEO_ENABLED_KEY), "0");
  assert.equal(window.localStorage.getItem(LEO_POS_KEY), JSON.stringify({ left: 88, top: 120 }));
});

test("登录：本机旧键迁移一次到服务端", async () => {
  clearLocal();
  window.localStorage.setItem(LEO_ENABLED_KEY, "0");
  window.localStorage.setItem(LEO_POS_KEY, JSON.stringify({ left: 12, top: 34 }));
  installGateway({ prefs: { leo_enabled: true, leo_panel: {} } });
  const pulled = await pullLeoPrefsFromServer();
  assert.equal(pulled.ok, true);
  if (pulled.ok) {
    assert.equal(pulled.enabled, false);
    assert.deepEqual(pulled.panel.pos, { left: 12, top: 34 });
  }
  const patch = calls.find((c) => c.method === "PATCH" && c.url.includes("/v1/personalization"));
  assert.ok(patch, "迁移发 PATCH");
  assert.equal(patch.body.leo_enabled, false);
  assert.deepEqual(patch.body.leo_panel.pos, { left: 12, top: 34 });
  assert.equal(window.localStorage.getItem(LEO_PREFS_MIGRATED_KEY), "1");
});

test("面板点停用：登录态发出 PATCH leo_enabled=false", async () => {
  clearLocal();
  installGateway();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(LeoAssistant, { siteId: "ppt", docType: "ppt" }));
  });
  await settle();
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent("oceanleo:open-leo", {
        detail: { toggle: true, source: "input", anchor: ANCHOR, context: { page: "home" } },
      }),
    );
  });
  await settle();
  const disable = host.querySelector('[aria-label="停用"]');
  assert.ok(disable, "停用按钮");
  calls.length = 0;
  await act(async () => {
    disable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle(6);
  const patch = calls.find((c) => c.method === "PATCH" && c.url.includes("/v1/personalization"));
  assert.ok(patch, "停用打了 personalization");
  assert.equal(patch.body.leo_enabled, false);
  assert.equal(window.localStorage.getItem(LEO_ENABLED_KEY), "0");
  await act(async () => {
    root.unmount();
  });
  host.remove();
});
