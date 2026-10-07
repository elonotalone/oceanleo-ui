// W09（oceanleo-bay）：设置四块、钱页没就绪没有可点按钮、openBaySettings、条款门、静态安全。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dom = new JSDOM("<!doctype html><html lang=\"zh\"><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://design.oceanleo.com/settings",
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import("react-dom/client");

const httpStub = dataModule(`
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function route(method, path, body, opts) {
    const bench = globalThis.__bayBench;
    bench.calls.push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
    const hit = bench.routes[method + " " + path.split("?")[0]];
    if (hit === undefined) throw new BayApiError("no route " + method + " " + path, 404);
    if (hit && hit.__status) throw new BayApiError(hit.message || "失败", hit.__status);
    return typeof hit === "function" ? hit(body, path) : JSON.parse(JSON.stringify(hit));
  }
  export const bayGet = (path, opts) => route("GET", path, undefined, opts);
  export const bayPost = (path, body) => route("POST", path, body);
  export const bayPatch = (path, body) => route("PATCH", path, body);
  export const bayDelete = (path) => route("DELETE", path);
`);
const stateStub = dataModule(`
  export function bayEnabledHere() { return globalThis.__bayEnabled !== false; }
  export function requireBayLogin() { globalThis.__bayLoginCalls = (globalThis.__bayLoginCalls || 0) + 1; return false; }
`);
const sellerStub = dataModule(`
  export function BaySellerProfileSection() { return null; }
  export function BayVettingSection() { return null; }
`);
const settingsTabsStub = dataModule(`
  export function openSettingsModal(tab) {
    globalThis.__bayOpenSettings = (globalThis.__bayOpenSettings || []).concat(tab);
  }
`);
const uiStub = dataModule(`
  export function useUI() {
    return (zh, vars) => {
      if (!vars) return zh;
      return zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    };
  }
`);

const DEV_CONFIG = {
  enabled: true,
  provider: "stripe_connect",
  currency: "USD",
  edition: "intl",
  channel_fee: { percent_bps: 390, fixed_minor: 30, note_zh: "支付通道费（覆盖 Stripe 收单成本，平台不以此盈利）" },
  buyer_ready: false,
  seller_ready: false,
  payout_countries: ["US"],
};

function bench(routes = {}) {
  globalThis.__bayBench = { calls: [], routes };
  globalThis.__bayEnabled = true;
  globalThis.__bayLoginCalls = 0;
  globalThis.__bayOpenSettings = [];
  return globalThis.__bayBench;
}

async function loadSection() {
  const url = await compileModule("src/shell/bay/settings/BaySettingsSection.tsx", {
    "../../../lib/bay/http": httpStub,
    "../shell/bay-state": stateStub,
    "../seller": sellerStub,
    "../../../i18n/ui/useUI": uiStub,
  });
  return import(`${url}?case=${Math.random().toString(36).slice(2)}`);
}

async function render(node) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

test("没就绪：钱页写「暂未开放」，没有任何可点的绑卡、开户、提现、付款按钮", async () => {
  bench({
    "GET /v1/talent/payments/config": DEV_CONFIG,
    "GET /v1/talent/ledger": { items: [], page: 1, limit: 20, total: 0, has_more: false, total_in_fen: 0, total_out_fen: 0, monthly: [] },
    "GET /v1/talent/ledger/summary": { currency: "USD", month: "2026-10", month_in_fen: 0, lifetime_in_fen: 0, ongoing_contract_amount_fen: 0, ongoing_contract_count: 0, monthly: [] },
    "GET /v1/talent/payout-account": { __status: 503, message: "未开放" },
    "GET /v1/talent/paid-work-eligibility": { eligible: false, reason: "", blockers: [] },
  });
  const { BaySettingsSection } = await loadSection();
  const { host, root } = await render(React.createElement(BaySettingsSection, { pane: "money" }));
  assert.match(host.textContent, /付款暂未开放/);
  assert.match(host.textContent, /收款暂未开放/);
  const buttons = [...host.querySelectorAll("button")].map((el) => el.textContent.trim());
  for (const label of ["绑卡", "开户", "提现", "付款"]) {
    assert.equal(
      buttons.some((text) => text === label || text.startsWith(label)),
      false,
      `出现了可点的「${label}」：${buttons.join(" | ")}`,
    );
  }
  assert.equal(globalThis.__bayBench.calls.some((call) => call.method === "POST"), false);
  root.unmount();
  host.remove();
});

test("openBaySettings('money') 记下这一块并打开设置窗的 bay 栏", async () => {
  globalThis.__bayOpenSettings = [];
  const url = await compileModule("src/shell/bay/settings/settings-open.ts", {
    "../../../pages/settings/settings-tabs": settingsTabsStub,
  });
  const { openBaySettings } = await import(`${url}?open=${Math.random().toString(36).slice(2)}`);
  openBaySettings("money");
  assert.deepEqual(globalThis.__bayOpenSettings, ["bay"]);
});

test("境内：设置栏整块不渲染", async () => {
  bench({ "GET /v1/talent/payments/config": DEV_CONFIG });
  globalThis.__bayEnabled = false;
  const { BaySettingsSection } = await loadSection();
  const { host, root } = await render(React.createElement(BaySettingsSection, { pane: "money" }));
  assert.equal(host.querySelector("[data-bay-settings-section]"), null);
  root.unmount();
  host.remove();
});

test("BayTermsGate：没同意先显示同意按钮；同意后才渲染 children", async () => {
  const current = {
    version: 3,
    effective_at: "2026-09-01T00:00:00Z",
    sections: [{ key: "fees", title_zh: "费用", body_md: "不抽佣。" }],
  };
  bench({
    "GET /v1/talent/terms/status": { current, acceptance: null, accepted: false },
    "POST /v1/talent/terms/accept": { current, acceptance: { version: 3, accepted_at: "2026-10-07T00:00:00Z" }, accepted: true },
  });
  const url = await compileModule("src/shell/bay/settings/BayTermsGate.tsx", {
    "../../../lib/bay/http": httpStub,
    "../shell/bay-state": stateStub,
    "../../../i18n/ui/useUI": uiStub,
  });
  const { BayTermsGate } = await import(`${url}?gate=${Math.random().toString(36).slice(2)}`);
  const { host, root } = await render(
    React.createElement(BayTermsGate, { scope: "buyer" }, React.createElement("p", { "data-bay-gate-child": "" }, "里面")),
  );
  assert.equal(host.querySelector("[data-bay-gate-child]"), null);
  const accept = host.querySelector("[data-bay-terms-gate-accept]");
  assert.ok(accept);
  await act(async () => {
    accept.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.ok(host.querySelector("[data-bay-gate-child]"));
  root.unmount();
  host.remove();
});

test("设置目录没有 HTML 注入点，也不出现 talent.oceanleo.com", () => {
  const dir = join(REPO, "src", "shell", "bay", "settings");
  const sinks = [/dangerouslySetInnerHTML/, /\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /document\.write/];
  for (const name of readdirSync(dir).filter((file) => /\.(ts|tsx)$/.test(file))) {
    const text = readFileSync(join(dir, name), "utf8");
    for (const sink of sinks) assert.equal(sink.test(text), false, `${name} 含 ${sink}`);
    assert.equal(text.includes("talent.oceanleo.com"), false, `${name} 含 talent.oceanleo.com`);
  }
});

test("设置导航有 bay 图标", () => {
  const text = readFileSync(join(REPO, "src", "pages", "settings", "SettingsNavIcons.tsx"), "utf8");
  assert.match(text, /\bbay:\s*\(/);
});
