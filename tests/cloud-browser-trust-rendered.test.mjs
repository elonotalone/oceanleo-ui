import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const ttModule = dataModule(`
  const tt = (text, vars) => text.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? key));
  export function useUI() { return tt; }
`);
const apiModule = dataModule(`
  export const cloudBrowserTrustApi = new Proxy({}, {
    get(_, key) { return (...args) => globalThis.__cloudBrowserTrustTest[key](...args); },
  });
`);
const stateModule = await compileModule("src/shell/cloud-browser-trust-state.tsx", { "../lib/browser-trust": apiModule });
const panelModule = await compileModule("src/shell/cloud-browser-trust.tsx", {
  "../i18n/ui/useUI": ttModule,
  "./cloud-browser-trust-state": stateModule,
});
const { CloudBrowserTrustPanel } = await import(panelModule);
const uiModule = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function Switch({ checked, disabled, label, onChange }) {
    return createElement("button", { type: "button", role: "switch", "aria-label": label,
      "aria-checked": checked, disabled, onClick: () => onChange(!checked) });
  }
`);
const settingsModule = await compileModule("src/pages/settings/CloudBrowserSettingsSection.tsx", {
  "../../i18n/ui/useUI": ttModule,
  "../../lib/browser-trust": apiModule,
  "../../shell/cloud-browser-trust": panelModule,
  "../../ui": uiModule,
  "./CloudBrowserFlowsSection": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function CloudBrowserFlowsSection() { return createElement("div", { "data-default-flows-test": true }); }
  `),
});
const { CloudBrowserSettingsSection } = await import(settingsModule);
const mounted = [];
const observers = [];
globalThis.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
  emit(isIntersecting) { this.callback([{ isIntersecting }]); }
};

const approval = (id = "request-1", origin = "https://shop.example") => ({
  request_id: id, origin, action_kind: "payment", summary: "支付订单 123", reason: "付款后无法撤回",
});
const empty = () => ({ pending_approvals: [], login_candidates: [], privacy_active: false, can_offer_login: false });
const timestamp = "2026-11-04T00:00:00.000Z";

function runtime(status = empty()) {
  const calls = [];
  const value = {
    status, calls, preferences: { save_logins: true },
    savedLogins: [1, 2].map(id => ({ id: `login-${id}`, origin: `https://site${id}.example`, saved_at: timestamp, last_used_at: null })),
    grants: [1, 2].map(id => ({ id: `grant-${id}`, origin: `https://site${id}.example`, action_kind: "payment", scope: "site_action", task_id: null, created_at: timestamp })),
    session: async (id, signal) => { calls.push({ method: "session", id, signal }); return { ok: true, data: value.status }; },
    offerLogin: async (id, signal) => {
      calls.push({ method: "offer", id, signal });
      value.status = { ...value.status, can_offer_login: false, login_candidates: [{ id: "offered-1", origin: "https://sso.example" }] };
      return { ok: true, data: { ok: true } };
    },
    decideApproval: async (...args) => { calls.push({ method: "approval", args }); value.status.pending_approvals = value.status.pending_approvals.filter(row => row.request_id !== args[1]); return { ok: true, data: { ok: true } }; },
    decideLogin: async (...args) => { calls.push({ method: "login", args }); value.status.login_candidates = value.status.login_candidates.filter(row => row.id !== args[1]); return { ok: true, data: { ok: true } }; },
    settings: async () => ({ ok: true, data: value.preferences }),
    logins: async () => ({ ok: true, data: { logins: value.savedLogins } }),
    approvals: async () => ({ ok: true, data: { approvals: value.grants } }),
    updateSettings: async (enabled) => { calls.push({ method: "settings", enabled }); value.preferences = { save_logins: enabled }; return { ok: true, data: value.preferences }; },
    deleteLogin: async (id) => { calls.push({ method: "deleteLogin", id }); return { ok: true }; },
    deleteAllLogins: async () => { calls.push({ method: "deleteAllLogins" }); return { ok: true }; },
    revokeApproval: async (id) => { calls.push({ method: "revokeApproval", id }); return { ok: true }; },
    revokeAllApprovals: async () => { calls.push({ method: "revokeAllApprovals" }); return { ok: true }; },
  };
  globalThis.__cloudBrowserTrustTest = value;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  return value;
}

async function render(Component, props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ host, root });
  await act(async () => { root.render(React.createElement(Component, props)); });
  return { host, rerender: async (next) => { await act(async () => { root.render(React.createElement(Component, next)); }); } };
}

async function click(element) {
  assert.ok(Boolean(element), "button exists");
  await act(async () => { element.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
}
function named(host, label) { return [...host.querySelectorAll("button")].find(button => button.textContent === label); }
async function flush() { await act(async () => { await Promise.resolve(); }); }

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) { await act(async () => root.unmount()); host.remove(); }
  observers.length = 0;
  delete globalThis.__cloudBrowserTrustTest;
});

test("approval card renders site, summary, reason and sends each exact approval scope or deny", async () => {
  for (const choice of ["once", "task", "site_action", "deny"]) {
    const api = runtime({ ...empty(), pending_approvals: [approval()] });
    const { host } = await render(CloudBrowserTrustPanel, { sessionId: "session-1", taskId: "task-1", liveRequested: true, userTakeover: false });
    assert.equal(host.querySelector("[data-cloud-browser-trust-origin]")?.textContent, "https://shop.example");
    assert.equal(host.querySelector("[data-cloud-browser-trust-summary]")?.textContent, "支付订单 123");
    assert.equal(host.querySelector("[data-cloud-browser-trust-reason]")?.textContent, "付款后无法撤回");
    assert.deepEqual([...host.querySelectorAll("[data-cloud-browser-approval-scope]")].map(button => button.textContent), ["只这一次", "这个任务", "以后都允许（此网站此动作）"]);
    await click(host.querySelector(choice === "deny" ? "[data-cloud-browser-approval-deny]" : `[data-cloud-browser-approval-scope="${choice}"]`));
    const decision = api.calls.find(call => call.method === "approval");
    assert.deepEqual(decision.args.slice(0, 4), ["session-1", "request-1", choice === "deny" ? "deny" : "approve", choice === "deny" ? "once" : choice]);
    assert.equal(Boolean(host.querySelector("[data-cloud-browser-trust-prompt]")), false);
    const mountedItem = mounted.pop();
    await act(async () => mountedItem.root.unmount()); mountedItem.host.remove();
  }
});

test("standalone browsers explain unavailable task scope while once and site-action remain usable", async () => {
  const api = runtime({ ...empty(), pending_approvals: [approval()] });
  const { host } = await render(CloudBrowserTrustPanel, { sessionId: "standalone", liveRequested: true, userTakeover: false });
  assert.equal(host.querySelector('[data-cloud-browser-approval-scope="task"]')?.disabled, true);
  assert.equal(host.querySelector('[data-cloud-browser-approval-scope="once"]')?.disabled, false);
  assert.equal(host.querySelector('[data-cloud-browser-approval-scope="site_action"]')?.disabled, false);
  assert.equal(host.querySelector("[data-cloud-browser-task-scope-unavailable]")?.textContent, "此浏览器未绑定任务，无法按任务授权。");
  await click(host.querySelector('[data-cloud-browser-approval-scope="site_action"]'));
  assert.deepEqual(api.calls.find(call => call.method === "approval").args.slice(0, 4), ["standalone", "request-1", "approve", "site_action"]);
});

test("save-login prompt saves or dismisses its candidate in the current browser only", async () => {
  for (const save of [true, false]) {
    const api = runtime({ ...empty(), login_candidates: [{ id: "candidate-1", origin: "https://mail.example" }] });
    const { host } = await render(CloudBrowserTrustPanel, { sessionId: "session-1", liveRequested: true, userTakeover: false });
    assert.equal(host.querySelector("h3")?.textContent, "保存这个网站的登录吗？");
    await click(host.querySelector(save ? "[data-cloud-browser-login-save]" : "[data-cloud-browser-login-dismiss]"));
    assert.deepEqual(api.calls.find(call => call.method === "login").args.slice(0, 3), ["session-1", "candidate-1", save]);
    assert.equal(Boolean(host.querySelector("[data-cloud-browser-trust-prompt]")), false);
    const mountedItem = mounted.pop();
    await act(async () => mountedItem.root.unmount()); mountedItem.host.remove();
  }
});

test("privacy status only claims capture has stopped after server confirmation", async () => {
  const api = runtime();
  const props = { sessionId: "session-1", liveRequested: true, userTakeover: true };
  const { host, rerender } = await render(CloudBrowserTrustPanel, props);
  assert.equal(host.querySelector("[data-cloud-browser-trust-privacy]")?.getAttribute("data-cloud-browser-trust-privacy"), "takeover");
  assert.equal(host.textContent.includes("画面采集与录制已暂停"), false);
  api.status = { ...empty(), privacy_active: true };
  await rerender({ ...props, sessionId: "session-2" });
  assert.equal(host.querySelector("[data-cloud-browser-trust-privacy]")?.getAttribute("data-cloud-browser-trust-privacy"), "active");
  assert.equal(host.textContent.includes("画面采集与录制已暂停"), true);
});

test("explicit login offers under ordinary takeover reuse the same site's save or dismiss prompt without saving silently", async () => {
  for (const save of [true, false]) {
    const api = runtime({ ...empty(), can_offer_login: true });
    const { host } = await render(CloudBrowserTrustPanel, { sessionId: "session-sso", liveRequested: true, userTakeover: true });
    const offer = host.querySelector("[data-cloud-browser-login-offer]");
    assert.equal(offer?.textContent, "保存此网站的登录");
    assert.equal(host.querySelector("[data-cloud-browser-trust-privacy]")?.getAttribute("data-cloud-browser-trust-privacy"), "takeover");
    assert.equal(host.textContent.includes("画面采集与录制已暂停"), false);
    await click(offer);
    assert.equal(api.calls.filter(call => call.method === "offer").length, 1);
    assert.equal(api.calls.find(call => call.method === "offer").id, "session-sso");
    assert.equal(api.calls.filter(call => call.method === "login").length, 0);
    assert.equal(host.querySelector("h3")?.textContent, "保存这个网站的登录吗？");
    assert.equal(host.querySelector("[data-cloud-browser-trust-origin]")?.textContent, "https://sso.example");
    assert.equal(Boolean(host.querySelector("[data-cloud-browser-login-offer]")), false);
    await click(host.querySelector(save ? "[data-cloud-browser-login-save]" : "[data-cloud-browser-login-dismiss]"));
    assert.deepEqual(api.calls.find(call => call.method === "login").args.slice(0, 3), ["session-sso", "offered-1", save]);
    const mountedItem = mounted.pop();
    await act(async () => mountedItem.root.unmount()); mountedItem.host.remove();
  }
});

test("login-offer fallback stays hidden for old gateways, server-disabled saving, sensitive entry and existing prompts", async () => {
  const { can_offer_login: _missing, ...legacyStatus } = empty();
  for (const status of [
    legacyStatus,
    { ...empty(), can_offer_login: false }, // The backend folds save_logins into this closed flag.
    { ...empty(), can_offer_login: true, privacy_active: true },
    { ...empty(), can_offer_login: true, pending_approvals: [approval()] },
    { ...empty(), can_offer_login: true, login_candidates: [{ id: "already-offered", origin: "https://sso.example" }] },
  ]) {
    const api = runtime(status);
    const { host } = await render(CloudBrowserTrustPanel, { sessionId: "session-1", liveRequested: true, userTakeover: true });
    assert.equal(Boolean(host.querySelector("[data-cloud-browser-login-offer]")), false);
    assert.equal(api.calls.some(call => call.method === "offer"), false);
    const mountedItem = mounted.pop();
    await act(async () => mountedItem.root.unmount()); mountedItem.host.remove();
  }
});

test("duplicate offer clicks submit once and a pre-offer poll cannot erase the confirmation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const api = runtime({ ...empty(), can_offer_login: true });
  let resolvePoll;
  let resolveOffer;
  let reads = 0;
  api.session = (id, signal) => {
    api.calls.push({ method: "session", id, signal });
    return ++reads === 2 ? new Promise(resolve => { resolvePoll = resolve; }) : Promise.resolve({ ok: true, data: api.status });
  };
  api.offerLogin = (id, signal) => {
    api.calls.push({ method: "offer", id, signal });
    return new Promise(resolve => { resolveOffer = resolve; });
  };
  const { host } = await render(CloudBrowserTrustPanel, { sessionId: "session-1", liveRequested: true, userTakeover: false });
  await act(async () => { t.mock.timers.tick(2_000); });
  const offer = host.querySelector("[data-cloud-browser-login-offer]");
  await act(async () => {
    offer.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    offer.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(api.calls.filter(call => call.method === "offer").length, 1);
  assert.equal(offer.disabled, true);
  assert.equal(host.textContent.includes("正在请求保存确认…"), true);
  api.status = { ...empty(), login_candidates: [{ id: "offered-1", origin: "https://sso.example" }] };
  await act(async () => { resolveOffer({ ok: true }); });
  await act(async () => { resolvePoll({ ok: true, data: { ...empty(), can_offer_login: true } }); });
  assert.equal(host.querySelector("[data-cloud-browser-trust-origin]")?.textContent, "https://sso.example");
  assert.equal(Boolean(host.querySelector("[data-cloud-browser-login-offer]")), false);
  assert.equal(api.calls.some(call => call.method === "login"), false);
});

test("late login-offer completion or follow-up reads cannot insert another session's login", async () => {
  for (const lateStage of ["offer", "read"]) {
    const api = runtime({ ...empty(), can_offer_login: true });
    let resolveLate;
    let oldReads = 0;
    api.session = (id, signal) => {
      api.calls.push({ method: "session", id, signal });
      if (id === "new") return Promise.resolve({ ok: true, data: { ...empty(), login_candidates: [{ id: "new-login", origin: "https://new.example" }] } });
      if (++oldReads > 1) return new Promise(resolve => { resolveLate = resolve; });
      return Promise.resolve({ ok: true, data: api.status });
    };
    api.offerLogin = (id, signal) => {
      api.calls.push({ method: "offer", id, signal });
      return lateStage === "offer" ? new Promise(resolve => { resolveLate = resolve; }) : Promise.resolve({ ok: true });
    };
    const props = { sessionId: "old", liveRequested: true, userTakeover: false };
    const { host, rerender } = await render(CloudBrowserTrustPanel, props);
    await click(host.querySelector("[data-cloud-browser-login-offer]"));
    await rerender({ ...props, sessionId: "new" });
    await act(async () => { resolveLate({ ok: true, data: { ...empty(), login_candidates: [{ id: "old-login", origin: "https://old.example" }] } }); });
    assert.equal(api.calls.find(call => call.method === "offer").signal.aborted, true);
    assert.equal(host.querySelector("[data-cloud-browser-trust-origin]")?.textContent, "https://new.example");
    assert.equal(host.textContent.includes("https://old.example"), false);
    assert.equal(oldReads, lateStage === "offer" ? 1 : 2);
    assert.equal(api.calls.some(call => call.method === "login"), false);
    const mountedItem = mounted.pop();
    await act(async () => mountedItem.root.unmount()); mountedItem.host.remove();
  }
});

test("hidden and inactive panels do not poll, and hiding aborts the current selected-session request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const api = runtime({ ...empty(), can_offer_login: true });
  const props = { sessionId: "session-1", liveRequested: false, userTakeover: false };
  const { host, rerender } = await render(CloudBrowserTrustPanel, props);
  assert.equal(api.calls.length, 0);
  assert.equal(Boolean(host.querySelector("[data-cloud-browser-login-offer]")), false);
  await rerender({ ...props, liveRequested: true });
  assert.equal(api.calls.length, 1);
  assert.equal(Boolean(host.querySelector("[data-cloud-browser-login-offer]")), true);
  await act(async () => { observers.at(-1).emit(false); });
  assert.equal(api.calls[0].signal.aborted, true);
  assert.equal(Boolean(host.querySelector("[data-cloud-browser-login-offer]")), false);
  await act(async () => { t.mock.timers.tick(20_000); });
  assert.equal(api.calls.length, 1);
  await act(async () => { observers.at(-1).emit(true); });
  assert.equal(api.calls.length, 2);
  await act(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new window.Event("visibilitychange"));
  });
  assert.equal(api.calls[1].signal.aborted, true);
  assert.equal(Boolean(host.querySelector("[data-cloud-browser-login-offer]")), false);
  await act(async () => { t.mock.timers.tick(20_000); });
  assert.equal(api.calls.length, 2);
});

test("late status from a previous browser cannot insert its approval into the newly selected browser", async () => {
  const api = runtime({ ...empty(), pending_approvals: [approval("new-request", "https://new.example")] });
  let resolveOld;
  api.session = (id, signal) => {
    api.calls.push({ method: "session", id, signal });
    return id === "old" ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ ok: true, data: api.status });
  };
  const props = { sessionId: "old", liveRequested: true, userTakeover: false };
  const { host, rerender } = await render(CloudBrowserTrustPanel, props);
  await rerender({ ...props, sessionId: "new" });
  await act(async () => { resolveOld({ ok: true, data: { ...empty(), pending_approvals: [approval("old-request", "https://old.example")] } }); });
  assert.equal(host.textContent.includes("https://new.example"), true);
  assert.equal(host.textContent.includes("https://old.example"), false);
  await click(host.querySelector('[data-cloud-browser-approval-scope="once"]'));
  assert.deepEqual(api.calls.find(call => call.method === "approval").args.slice(0, 2), ["new", "new-request"]);
});

test("duplicate clicks submit once and a pre-decision poll cannot resurrect the consumed approval", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const api = runtime({ ...empty(), pending_approvals: [approval()] });
  let resolvePoll;
  let resolveDecision;
  const originalSession = api.session;
  api.session = (...args) => api.calls.length ? new Promise(resolve => { resolvePoll = resolve; }) : originalSession(...args);
  api.decideApproval = (...args) => { api.calls.push({ method: "approval", args }); return new Promise(resolve => { resolveDecision = resolve; }); };
  const { host } = await render(CloudBrowserTrustPanel, { sessionId: "session-1", liveRequested: true, userTakeover: false });
  await act(async () => { t.mock.timers.tick(2_000); });
  const approve = host.querySelector('[data-cloud-browser-approval-scope="once"]');
  await act(async () => {
    approve.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    approve.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(api.calls.filter(call => call.method === "approval").length, 1);
  await act(async () => { resolveDecision({ ok: true }); });
  await act(async () => { resolvePoll({ ok: true, data: { ...empty(), pending_approvals: [approval()] } }); });
  assert.equal(Boolean(host.querySelector("[data-cloud-browser-trust-prompt]")), false);
});

test("Settings switches saving, views safe metadata, deletes one/all and revokes one/all", async () => {
  const api = runtime();
  const { host } = await render(CloudBrowserSettingsSection, { flows: React.createElement("div", { "data-flows-test": true }, "Saved flows") });
  assert.equal(host.querySelector('[role="switch"]')?.getAttribute("aria-checked"), "true");
  await click(host.querySelector('[role="switch"]'));
  assert.equal(api.calls.find(call => call.method === "settings")?.enabled, false);
  assert.equal(host.querySelector('[role="switch"]')?.getAttribute("aria-checked"), "false");
  await click(named(host.querySelector("[data-cloud-browser-saved-logins]"), "查看"));
  assert.equal(host.textContent.includes("保存于"), true);
  assert.equal(host.textContent.includes("尚未使用"), true);
  await click(host.querySelector('[aria-label="删除 https://site1.example 的登录"]'));
  assert.equal(host.querySelectorAll("[data-cloud-browser-saved-login]").length, 1);
  await click(named(host, "删除全部登录"));
  assert.equal(api.calls.some(call => call.method === "deleteAllLogins"), false);
  await click(named(host, "确认删除全部"));
  assert.equal(host.querySelectorAll("[data-cloud-browser-saved-login]").length, 0);
  await click(host.querySelector('[aria-label="撤销 https://site1.example 的操作授权"]'));
  assert.equal(host.querySelectorAll("[data-cloud-browser-approval-grant]").length, 1);
  await click(named(host, "撤销全部授权"));
  await click(named(host, "确认撤销全部"));
  assert.equal(host.querySelectorAll("[data-cloud-browser-approval-grant]").length, 0);
  assert.equal(Boolean(host.querySelector("[data-flows-test]")), true);
});

test("failed Settings mutations preserve saved state and never display raw server errors", async () => {
  const api = runtime();
  api.updateSettings = async () => ({ ok: false, status: 503, error: "password=must-not-render" });
  api.deleteLogin = async () => ({ ok: false, status: 503, error: "cookie=must-not-render" });
  const { host } = await render(CloudBrowserSettingsSection);
  assert.equal(Boolean(host.querySelector("[data-default-flows-test]")), true);
  await click(host.querySelector('[role="switch"]'));
  assert.equal(host.querySelector('[role="switch"]')?.getAttribute("aria-checked"), "true");
  await click(host.querySelector('[aria-label="删除 https://site1.example 的登录"]'));
  assert.equal(host.querySelectorAll("[data-cloud-browser-saved-login]").length, 2);
  assert.equal(host.textContent.includes("must-not-render"), false);
  assert.ok(Boolean(host.querySelector('[role="alert"]')));
  await flush();
});
