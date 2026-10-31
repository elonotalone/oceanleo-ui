// R2 (2026-10-30 redo): the composer's Device control is the only switcher.
// Computer → OceanLeo / Codex / Claude Code / Cursor / Hermes / 终端, agent →
// 对话 / 命令行, all inside the existing ComputerDock popover. The dock only
// emits a ConversationTarget: it never creates a session or navigates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
  CustomEvent: window.CustomEvent, localStorage: window.localStorage, PointerEvent: window.PointerEvent || window.MouseEvent,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
class NoopResizeObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = NoopResizeObserver;
window.ResizeObserver = NoopResizeObserver;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }`);
const popoverStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AnchoredPopover({ open, children, panelRef }) {
    if (!open) return null;
    return React.createElement("div", { ref: panelRef, "data-anchored-popover": "1" }, children);
  }
`);

const { ComputerDock } = await import(await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
  "../../i18n/ui/useUI": uiStub,
  "../../contracts/domain-family": dataModule(`export function portalHref(path) { return path; }`),
  "../../lib/cloud-computer-api": dataModule(`
    export const cloudComputerApi = {};
    export function writeMountedComputerId(id) { globalThis.__cdMounted = id || ""; }
    export function writeMountedComputerName() {}
  `),
  // Any runtime use of the session API from the dock is a regression.
  "../../lib/computer-task-api": dataModule(`
    export async function createComputerTaskSession() { globalThis.__cdCreates = (globalThis.__cdCreates || 0) + 1; throw new Error("dock must not create"); }
    export async function listComputerTaskSessions() { globalThis.__cdCreates = (globalThis.__cdCreates || 0) + 1; return { sessions: [] }; }
  `),
  "../../api/devices": dataModule(`export async function listDevices() { return { ok: true, data: globalThis.__cdDevices || [] }; }`),
  "../../lib/auth/client": dataModule(`export async function getUserId() { return globalThis.__cdUserGate ?? "account-a"; }`),
  "../../lib/cloud-agent-api": dataModule(`export async function listCloudAgentAvailability() { return { kind: "absent" }; }`),
  "../anchored-popover": popoverStub,
  "next/navigation": dataModule(`export function useRouter() { return { push(href) { (globalThis.__cdPushes ||= []).push(href); }, replace() {}, refresh() {}, back() {} }; }`),
}));
const { readExecutionTarget, writeExecutionTarget } = await import("../src/lib/execution-target.ts");

function computer(overrides = {}) {
  return { id: "cc_1", name: "elon", source: "aliyun", status: "running", edition: "com", node_online: true,
    enrolled_at: "2026-09-20T00:00:00Z", confirmed_at: "2026-09-20T00:00:00Z", created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", ...overrides };
}
function session(overrides) {
  return { id: "s", task_id: "t1", computer_id: "cc_1", computer_name: "elon", kind: "acp", program: "codex", native_session_id: null,
    created_at: "2026-10-30T00:00:00Z", updated_at: "2026-10-30T00:00:00Z", sync_status: "saved", ...overrides };
}
function client(programs = [{ id: "codex", installed: true }, { id: "claude", installed: false }, { id: "cursor", installed: true, logged_in: false }, { id: "hermes", installed: true }]) {
  return {
    async listComputers() { return { items: [] }; },
    async listCliPrograms() { globalThis.__cdProgramReads = (globalThis.__cdProgramReads || 0) + 1; return { programs: programs.map((row) => ({ label: row.id, version: "", supports_resume: true, options: [], ...row })) }; },
  };
}
async function flush(count = 8) { for (let i = 0; i < count; i += 1) await act(async () => {}); }

test.beforeEach(() => { window.localStorage.clear(); globalThis.__cdCreates = 0; globalThis.__cdPushes = []; globalThis.__cdDevices = []; globalThis.__cdProgramReads = 0; });

async function renderDock(props = {}) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  const picks = [];
  const render = async (next = {}) => {
    Object.assign(props, next);
    await act(async () => root.render(React.createElement(ComputerDock, { client: client(), computers: [computer()], onConversationChange: (c) => picks.push(c), ...props })));
    await flush();
  };
  await render();
  const q = (selector) => host.querySelector(selector);
  const click = async (node) => { assert.ok(node, "expected control"); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await flush(); };
  return {
    host, picks, q, click, render,
    trigger: () => q("[data-oceanleo-cc-dock-trigger]"),
    async open() { await click(q("[data-oceanleo-cc-dock-trigger]")); },
    // Opens at the current computer's list when a native conversation is shown; otherwise drill in.
    async openComputer(id = "cc_1") {
      await click(q("[data-oceanleo-cc-dock-trigger]"));
      if (q(`[data-dock-computer="${id}"]`)) return;
      await click(q(`[data-oceanleo-cc-switch-item="${id}"]`));
    },
    async cleanup() { await act(async () => root.unmount()); host.remove(); },
  };
}

test("computer → Codex → 对话 emits a native chat target; 命令行 emits cli; the dock never creates or navigates", async () => {
  const view = await renderDock();
  try {
    await view.openComputer();
    const level = view.q('[data-dock-level="computer"]');
    assert.ok(level, "the computer's own list opens inside the same popover");
    assert.deepEqual([...level.querySelectorAll("[data-dock-program-row]")].map((n) => n.getAttribute("data-dock-program-row")),
      ["oceanleo", "codex", "claude", "cursor", "hermes", "terminal"]);
    assert.match(view.q("[data-dock-back]").textContent, /elon/);
    await view.click(view.q('[data-dock-program-row="codex"]'));
    assert.ok(view.q('[data-dock-level="program"][data-dock-program="codex"]'));
    assert.deepEqual([...view.host.querySelectorAll("[data-dock-view]")].map((n) => n.getAttribute("data-dock-view")), ["chat", "cli"], "对话 first");
    assert.match(view.q('[data-dock-view="cli"]').textContent, /命令行在电脑的命令行窗口里继续，和这里的对话分开记录/);
    await view.click(view.q('[data-dock-view="chat"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" });
    assert.equal(view.q("[data-anchored-popover]"), null, "picking closes the menu");
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="codex"]'));
    await view.click(view.q('[data-dock-view="cli"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "cli" });
    assert.equal(globalThis.__cdCreates, 0);
    assert.deepEqual(globalThis.__cdPushes, []);
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "cloud" }, "a native pick does not move the OceanLeo target");
  } finally { await view.cleanup(); }
});

test("终端 emits a terminal target and OceanLeo emits the existing computer execution target", async () => {
  const targets = [];
  const view = await renderDock({ onTargetChange: (t) => targets.push(t) });
  try {
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="terminal"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "terminal", computerId: "cc_1", computerName: "elon" });
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="oceanleo"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "oceanleo", target: { kind: "computer", id: "cc_1", name: "elon" } });
    assert.deepEqual(targets.at(-1), { kind: "computer", id: "cc_1", name: "elon" });
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "computer", id: "cc_1", name: "elon" });
    assert.equal(globalThis.__cdMounted, "cc_1");
    assert.equal(globalThis.__cdCreates, 0);
    assert.deepEqual(globalThis.__cdPushes, []);
  } finally { await view.cleanup(); }
});

test("program rows show plain status only when not ready; back rows walk up one level", async () => {
  const view = await renderDock();
  try {
    await view.openComputer();
    const text = (id) => view.q(`[data-dock-program-row="${id}"]`).textContent;
    assert.ok(globalThis.__cdProgramReads >= 1);
    assert.doesNotMatch(text("codex"), /未安装|需要登录|离线|已安装/);
    assert.match(text("claude"), /未安装/);
    assert.match(text("cursor"), /需要登录/);
    await view.click(view.q('[data-dock-program-row="hermes"]'));
    assert.match(view.q("[data-dock-back]").textContent, /Hermes/);
    await view.click(view.q("[data-dock-back]"));
    assert.ok(view.q('[data-dock-level="computer"]'));
    await view.click(view.q("[data-dock-back]"));
    assert.ok(view.q('[data-oceanleo-cc-switch-item="cc_1"]'), "back to the computer list");
    assert.doesNotMatch(view.host.textContent, /图形|独立 CLI|ACP|Conversation|用此电脑执行/);
  } finally { await view.cleanup(); }
});

test("existing task conversations are marked and reused by sessionId", async () => {
  const taskSessions = [
    session({ id: "acp-old", kind: "acp", program: "codex", updated_at: "2026-10-30T01:00:00Z" }),
    session({ id: "acp-new", kind: "acp", program: "codex", updated_at: "2026-10-30T02:00:00Z" }),
    session({ id: "term-1", kind: "terminal", program: null }),
    session({ id: "other-pc", computer_id: "cc_2", kind: "cli", program: "claude" }),
  ];
  const conversation = { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat", sessionId: "acp-new" };
  const view = await renderDock({ taskSessions, conversation });
  try {
    assert.equal(view.trigger().textContent, "elon · Codex");
    await view.open();
    assert.ok(view.q('[data-dock-level="computer"]'), "opens at the current computer's list");
    const codex = view.q('[data-dock-program-row="codex"]');
    assert.equal(codex.getAttribute("aria-pressed"), "true");
    assert.match(codex.textContent, /✓/);
    assert.ok(view.q('[data-dock-program-row="terminal"] [data-dock-exists]'), "terminal exists in this task");
    assert.equal(view.q('[data-dock-program-row="claude"] [data-dock-exists]'), null, "another computer's session is not this one's");
    await view.click(codex);
    assert.match(view.q('[data-dock-view="chat"]').textContent, /✓/);
    assert.equal(view.q('[data-dock-view="cli"] [data-dock-exists]'), null);
    await view.click(view.q('[data-dock-view="chat"]'));
    assert.deepEqual(view.picks.at(-1), { ...conversation, sessionId: "acp-new" }, "the most recent one is reused");
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="terminal"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "terminal", computerId: "cc_1", computerName: "elon", sessionId: "term-1" });
    assert.equal(globalThis.__cdCreates, 0);
  } finally { await view.cleanup(); }
});

test("trigger label follows the conversation", async () => {
  const view = await renderDock({ conversation: { kind: "native", computerId: "cc_1", computerName: "elon", program: "claude", view: "cli" } });
  try {
    assert.equal(view.trigger().textContent, "elon · Claude Code · 命令行");
    await view.render({ conversation: { kind: "terminal", computerId: "cc_1", computerName: "elon" } });
    assert.equal(view.trigger().textContent, "elon · 终端");
    await view.render({ conversation: { kind: "oceanleo", target: { kind: "cloud" } } });
    assert.equal(view.trigger().textContent, "云端");
  } finally { await view.cleanup(); }
});

test("bound task: the OceanLeo target stays locked but native conversations can be added", async () => {
  writeExecutionTarget("account-a", { kind: "device", id: "mac", name: "Remembered Mac" });
  globalThis.__cdDevices = [{ device_id: "mac", platform: "macos", device_name: "Remembered Mac", online: true, availability: "online" }];
  const bound = { kind: "computer", id: "cc_1", name: "elon" };
  const targets = [];
  const view = await renderDock({ boundTarget: bound, onTargetChange: (t) => targets.push(t), computers: [computer(), computer({ id: "cc_2", name: "second" })] });
  try {
    assert.equal(view.trigger().textContent, "elon", "the task's target, not the remembered draft one");
    assert.match(view.trigger().getAttribute("title"), /新任务/);
    await view.open();
    const cloud = [...view.host.querySelectorAll("button")].find((b) => b.textContent.startsWith("默认云端"));
    assert.equal(cloud.disabled, true);
    assert.match(cloud.getAttribute("title"), /新建任务/);
    assert.equal(view.q("[data-dock-locked-hint]").textContent, "要换执行位置，请新建任务", "the reason is visible in the menu, not only on hover");
    await view.click(view.q('[data-oceanleo-cc-switch-item="cc_2"]'));
    assert.equal(view.q('[data-dock-program-row="oceanleo"]').disabled, true, "another computer cannot take over this task");
    assert.match(view.q('[data-dock-program-row="oceanleo"] [data-dock-locked-hint]').textContent, /新建任务/);
    assert.equal(view.q('[data-dock-program-row="codex"]').disabled, false);
    await view.click(view.q('[data-dock-program-row="codex"]'));
    await view.click(view.q('[data-dock-view="chat"]'));
    assert.deepEqual(view.picks.at(-1), { kind: "native", computerId: "cc_2", computerName: "second", program: "codex", view: "chat" });
    await view.render({ conversation: view.picks.at(-1) });
    await view.open();
    await view.click(view.q("[data-dock-back]"));
    const local = [...view.host.querySelectorAll("button")].find((b) => b.getAttribute("aria-expanded") !== null && b.textContent.includes("本地电脑"));
    await view.click(local);
    assert.equal(view.q('[data-oceanleo-device-client="mac"]').disabled, true, "local devices are locked too");
    assert.ok(view.q("[data-dock-locked-hint]"), "local list says why too");
    const cloudGroup = [...view.host.querySelectorAll("button")].find((b) => b.getAttribute("aria-expanded") !== null && b.textContent.includes("云端"));
    await view.click(cloudGroup);
    await view.click(view.q('[data-oceanleo-cc-switch-item="cc_1"]'));
    const ocean = view.q('[data-dock-program-row="oceanleo"]');
    assert.equal(ocean.disabled, false);
    assert.ok(ocean.querySelector("[data-dock-exists]"), "the task's OceanLeo conversation is marked as existing");
    await view.click(ocean);
    assert.deepEqual(view.picks.at(-1), { kind: "oceanleo", target: bound }, "switching back to the task's OceanLeo conversation");
    assert.deepEqual(targets, [], "a bound task never reports a new target");
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "device", id: "mac", name: "Remembered Mac" });
  } finally { await view.cleanup(); }
});

test("without onConversationChange a computer row is a plain execution choice (no drill-down)", async () => {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(ComputerDock, { client: client(), computers: [computer()] })));
    await flush();
    await act(async () => host.querySelector("[data-oceanleo-cc-dock-trigger]").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
    await act(async () => host.querySelector('[data-oceanleo-cc-switch-item="cc_1"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await flush();
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "computer", id: "cc_1", name: "elon" });
    assert.equal(host.querySelector("[data-dock-program-row]"), null);
    assert.equal(globalThis.__cdProgramReads, 0);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("controlled: a pick the host does not apply leaves the label as it was; the host's prop decides", async () => {
  const view = await renderDock();
  try {
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="codex"]'));
    await view.click(view.q('[data-dock-view="chat"]'));
    assert.equal(view.picks.length, 1);
    assert.equal(view.trigger().textContent, "云端", "host failed to open it: nothing changes");
    assert.equal(view.q("[data-oceanleo-cc-dock]").getAttribute("data-conversation"), "oceanleo");
    await view.open();
    assert.ok(view.q('[data-oceanleo-cc-switch-item="cc_1"]'), "menu reopens at the top, not at a conversation that never opened");
    await view.click(view.trigger());
    await view.render({ conversation: view.picks[0] });
    assert.equal(view.trigger().textContent, "elon · Codex");
    await view.render({ conversation: undefined });
    assert.equal(view.trigger().textContent, "云端", "undefined = the draft OceanLeo target");
  } finally { await view.cleanup(); }
});

test("native trigger is labelled as switching conversations, not as the run location", async () => {
  const view = await renderDock({ conversation: { kind: "terminal", computerId: "cc_1", computerName: "elon" } });
  try {
    assert.equal(view.trigger().getAttribute("title"), "切换对话");
    assert.equal(view.trigger().getAttribute("aria-label"), "切换对话 · elon · 终端");
    await view.render({ conversation: { kind: "oceanleo", target: { kind: "cloud" } } });
    assert.equal(view.trigger().getAttribute("aria-label"), "任务执行位置");
  } finally { await view.cleanup(); }
});

test("oceanleoDisabledReason disables every OceanLeo row with a visible reason; programs and 终端 stay open", async () => {
  globalThis.__cdDevices = [{ device_id: "mac", platform: "macos", device_name: "Mac", online: true, availability: "online" }];
  const reason = "这个任务属于 elon 上的程序";
  const targets = [];
  const view = await renderDock({ oceanleoDisabledReason: reason, boundTarget: { kind: "computer", id: "cc_1", name: "elon" }, onTargetChange: (t) => targets.push(t),
    conversation: { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat", sessionId: "s1" } });
  try {
    await view.open();
    const ocean = view.q('[data-dock-program-row="oceanleo"]');
    assert.equal(ocean.disabled, true, "even the task's own computer");
    assert.equal(ocean.querySelector("[data-dock-locked-hint]").textContent, reason);
    await view.click(ocean);
    assert.deepEqual(view.picks, []);
    assert.equal(view.q('[data-dock-program-row="codex"]').disabled, false);
    assert.equal(view.q('[data-dock-program-row="terminal"]').disabled, false);
    await view.click(view.q("[data-dock-back]"));
    const cloud = [...view.host.querySelectorAll("button")].find((b) => b.textContent.startsWith("默认云端"));
    assert.equal(cloud.disabled, true);
    assert.equal(view.q("[data-dock-locked-hint]").textContent, reason);
    const local = [...view.host.querySelectorAll("button")].find((b) => b.getAttribute("aria-expanded") !== null && b.textContent.includes("本地电脑"));
    await view.click(local);
    assert.equal(view.q('[data-oceanleo-device-client="mac"]').disabled, true);
    assert.equal(view.q("[data-dock-locked-hint]").textContent, reason);
    await view.click(view.q('[data-oceanleo-device-client="mac"]'));
    assert.deepEqual(view.picks, []);
    assert.deepEqual(targets, []);
  } finally { await view.cleanup(); }
  const draft = await renderDock({ oceanleoDisabledReason: reason, onConversationChange: undefined });
  try {
    await draft.open();
    assert.equal(draft.q('[data-oceanleo-cc-switch-item="cc_1"]').disabled, true, "plain picker rows are disabled too");
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "cloud" });
  } finally { await draft.cleanup(); }
});

test("session reuse follows lib/computer-task-api findComputerTaskSession exactly", async () => {
  const { findComputerTaskSession } = await import(await compileModule("src/lib/computer-task-api.ts", {
    "./cloud-computer-api": dataModule("export function cloudComputerRequest(){ throw new Error('no network'); }"),
  }));
  const taskSessions = [
    session({ id: "a", kind: "cli", program: "claude", updated_at: "2026-10-30T01:00:00Z" }),
    session({ id: "b", kind: "cli", program: "claude", updated_at: "", created_at: "2026-10-30T03:00:00Z" }),
    session({ id: "c", kind: "cli", program: "claude", updated_at: "2026-10-30T02:00:00+08:00" }),
    session({ id: "d", kind: "terminal", program: null, updated_at: "2026-10-30T01:00:00Z" }),
    session({ id: "e", kind: "terminal", program: "codex", updated_at: "2026-10-30T05:00:00Z" }),
  ];
  const view = await renderDock({ taskSessions });
  try {
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="claude"]'));
    await view.click(view.q('[data-dock-view="cli"]'));
    assert.equal(view.picks.at(-1).sessionId, findComputerTaskSession(taskSessions, { computerId: "cc_1", kind: "cli", program: "claude" }).id);
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="terminal"]'));
    assert.equal(view.picks.at(-1).sessionId, findComputerTaskSession(taskSessions, { computerId: "cc_1", kind: "terminal", program: null }).id);
    await view.openComputer();
    await view.click(view.q('[data-dock-program-row="hermes"]'));
    await view.click(view.q('[data-dock-view="chat"]'));
    assert.equal(findComputerTaskSession(taskSessions, { computerId: "cc_1", kind: "acp", program: "hermes" }), null);
    assert.equal("sessionId" in view.picks.at(-1), false);
  } finally { await view.cleanup(); }
});

// C-3 (2026-10-31): a draft shows the account's last 「电脑 · 程序」 chat pick, not 云端 every time.
const REMEMBERED_KEY = "oceanleo.dock-conversation.v1:account-a";
test("C-3: a new draft restores the last computer + program chat pick (never a session id)", async () => {
  const first = await renderDock();
  try {
    await first.openComputer();
    await first.click(first.q('[data-dock-program-row="codex"]'));
    await first.click(first.q('[data-dock-view="chat"]'));
  } finally { await first.cleanup(); }
  assert.deepEqual(JSON.parse(window.localStorage.getItem(REMEMBERED_KEY)),
    { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" });
  // A stored session id (older / tampered value) is never restored.
  window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify({ kind: "native", computerId: "cc_1", computerName: "old name", program: "codex", view: "chat", sessionId: "acp-old" }));
  const second = await renderDock();
  try {
    // W7: shown at once from memory (no sessionId), then renamed once the computer list says so.
    assert.deepEqual(second.picks, [
      { kind: "native", computerId: "cc_1", computerName: "old name", program: "codex", view: "chat" },
      { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" },
    ], "restored with no sessionId, then the computer's current name");
    second.picks.splice(0, 1);
    await second.render({ conversation: second.picks[0] });
    assert.equal(second.trigger().textContent, "elon · Codex");
    assert.equal(second.trigger().getAttribute("title"), "切换对话");
    assert.equal(globalThis.__cdCreates, 0);
    assert.deepEqual(globalThis.__cdPushes, []);
  } finally { await second.cleanup(); }
});

test("C-3: a pick that no longer exists (computer gone / program not installed) falls back to 云端 and is forgotten", async () => {
  window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify({ kind: "native", computerId: "cc_gone", computerName: "old", program: "codex", view: "chat" }));
  const gone = await renderDock();
  try {
    // W7: the pick is shown at once, then the check takes it back to the OceanLeo target.
    assert.deepEqual(gone.picks, [
      { kind: "native", computerId: "cc_gone", computerName: "old", program: "codex", view: "chat" },
      { kind: "oceanleo", target: { kind: "cloud" } },
    ]);
    assert.equal(gone.trigger().textContent, "云端");
    assert.equal(window.localStorage.getItem(REMEMBERED_KEY), null);
  } finally { await gone.cleanup(); }
  // The default client reports Claude Code as not installed on cc_1.
  window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify({ kind: "native", computerId: "cc_1", computerName: "elon", program: "claude", view: "chat" }));
  const missing = await renderDock();
  try {
    assert.deepEqual(missing.picks, [
      { kind: "native", computerId: "cc_1", computerName: "elon", program: "claude", view: "chat" },
      { kind: "oceanleo", target: { kind: "cloud" } },
    ]);
    assert.equal(missing.trigger().textContent, "云端");
    assert.equal(window.localStorage.getItem(REMEMBERED_KEY), null);
  } finally { await missing.cleanup(); }
});

test("C-3: a task never borrows the draft memory; going back to an OceanLeo row forgets it", async () => {
  const remembered = { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" };
  window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(remembered));
  const task = await renderDock({ boundTarget: { kind: "cloud" } });
  try {
    assert.deepEqual(task.picks, [], "a bound task keeps its own conversation");
    await task.openComputer();
    await task.click(task.q('[data-dock-program-row="hermes"]'));
    await task.click(task.q('[data-dock-view="chat"]'));
    assert.deepEqual(JSON.parse(window.localStorage.getItem(REMEMBERED_KEY)), remembered, "a pick inside a task does not move the draft default");
  } finally { await task.cleanup(); }
  const draft = await renderDock();
  try {
    assert.deepEqual(draft.picks, [remembered]);
    await draft.render({ conversation: remembered });
    await draft.openComputer();
    await draft.click(draft.q('[data-dock-program-row="oceanleo"]'));
    assert.equal(window.localStorage.getItem(REMEMBERED_KEY), null);
  } finally { await draft.cleanup(); }
  const after = await renderDock();
  try { assert.deepEqual(after.picks, []); } finally { await after.cleanup(); }
});

// W7 (2026-10-31 evening): the real home mount order — account id late, computer list late,
// program probe (a shell probe on the computer, seconds) later still. The pick must show as
// soon as the account is known, not after the probe.
test("W7: refresh shows the remembered pick before the computer list and program probe arrive", async () => {
  const remembered = { kind: "native", computerId: "cc_1", computerName: "elon", program: "claude", view: "chat" };
  window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(remembered));
  let releaseUser; globalThis.__cdUserGate = new Promise((resolve) => { releaseUser = resolve; });
  let releaseList; let releasePrograms;
  const slow = {
    listComputers: () => new Promise((resolve) => { releaseList = resolve; }),
    listCliPrograms: () => new Promise((resolve) => { releasePrograms = resolve; }),
  };
  const view = await renderDock({ client: slow, computers: undefined });
  try {
    assert.deepEqual(view.picks, [], "account not known yet: nothing restored");
    await act(async () => { releaseUser("account-a"); }); await flush();
    assert.deepEqual(view.picks, [remembered], "shown as soon as the account is known");
    await view.render({ conversation: view.picks[0] });
    assert.equal(view.trigger().textContent, "elon · Claude Code");
    assert.equal(typeof releaseList, "function", "the computer list is read only to check the pick");
    await act(async () => { releaseList({ items: [computer()] }); }); await flush();
    assert.equal(typeof releasePrograms, "function");
    await act(async () => { releasePrograms({ programs: [{ id: "claude", label: "Claude Code", installed: true, version: "", supports_resume: true, options: [] }] }); }); await flush();
    assert.deepEqual(view.picks, [remembered], "the checks confirm it: no second pick");
    assert.equal(view.trigger().textContent, "elon · Claude Code");
    assert.deepEqual(JSON.parse(window.localStorage.getItem(REMEMBERED_KEY)), remembered);
  } finally { delete globalThis.__cdUserGate; await view.cleanup(); }
});

test("W7: a late probe that finds the program gone takes a shown pick back to the OceanLeo target", async () => {
  const remembered = { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" };
  window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(remembered));
  let releasePrograms;
  const slow = { listComputers: async () => ({ items: [] }), listCliPrograms: () => new Promise((resolve) => { releasePrograms = resolve; }) };
  const view = await renderDock({ client: slow });
  try {
    assert.deepEqual(view.picks, [remembered]);
    await view.render({ conversation: remembered });
    await act(async () => { releasePrograms({ programs: [{ id: "codex", label: "Codex", installed: false, version: "", supports_resume: true, options: [] }] }); }); await flush();
    assert.deepEqual(view.picks.at(-1), { kind: "oceanleo", target: { kind: "cloud" } });
    assert.equal(window.localStorage.getItem(REMEMBERED_KEY), null);
  } finally { await view.cleanup(); }
  // The user picked something else before the probe came back: their pick stays.
  window.localStorage.setItem(REMEMBERED_KEY, JSON.stringify(remembered));
  const waiting = [];
  releasePrograms = (value) => { for (const resolve of waiting.splice(0)) resolve(value); };
  const picked = await renderDock({ client: { listComputers: async () => ({ items: [] }), listCliPrograms: () => new Promise((resolve) => { waiting.push(resolve); }) } });
  try {
    await picked.openComputer();
    await picked.click(picked.q('[data-dock-program-row="hermes"]'));
    await picked.click(picked.q('[data-dock-view="chat"]'));
    const hermes = { kind: "native", computerId: "cc_1", computerName: "elon", program: "hermes", view: "chat" };
    await picked.render({ conversation: hermes });
    assert.equal(waiting.length >= 1, true, "the restore probe is still out");
    await act(async () => { releasePrograms({ programs: [{ id: "codex", label: "Codex", installed: false, version: "", supports_resume: true, options: [] }, { id: "hermes", label: "Hermes", installed: true, version: "", supports_resume: true, options: [] }] }); }); await flush();
    assert.deepEqual(picked.picks, [remembered, hermes], "no fallback over the user's own pick");
    assert.deepEqual(JSON.parse(window.localStorage.getItem(REMEMBERED_KEY)), hermes, "and the newer pick stays remembered");
  } finally { await picked.cleanup(); }
});

test("dock source: no session creation, no navigation besides Manage devices, no emoji glyphs", () => {
  const source = readFileSync(new URL("../src/shell/cloud-computer/ComputerDock.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /createComputerTaskSession|computerSession=|\/tasks\//);
  assert.equal(source.match(/router\.push\(/g)?.length, 1);
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2699}]/u);
});

// ── LeoComposer + ConversationBar ────────────────────────────────────────────

const lazyStub = dataModule("const noop = () => undefined;\nexport default new Proxy(noop, { get: () => noop });\nexport const __stub = true;\n");
const dockStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ComputerDock(props) { globalThis.__cdDockProps = props; return React.createElement("button", { type: "button", "data-oceanleo-cc-dock-trigger": "" }, "dock"); }
`);
const { LeoComposer } = await import(await compileModule("src/shell/LeoComposer.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./composer-skill-slash": dataModule(`export function useComposerSkillSlash(){ return { onKeyDown: () => false, popover: null }; } export function composerSlashAdapter(){ return {}; }`),
  "./usePluginsCatalog": dataModule(`export const PLUGINS_SETTINGS_HREF = "/settings/plugins"; export function buildPopoverConnectors(){ return []; } export function usePluginsCatalog(){ return { items: [], loading: false, orgs: [], orgConnections: [] }; }`),
  "../lib/auth": dataModule("export async function getUserEmail(){ return null; }"),
  "../pages/AuthDialog": dataModule("export function AuthDialog(){ return null; }"),
  "./cloud-computer/ComputerDock": dockStub,
  "./ModelPicker": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ModelGroupPicker(){ return React.createElement("span", { "data-model-group-picker": "" }); }`),
  "./PayerSelector": dataModule("export function PayerSelector(){ return null; }"),
  "./mcp-apps": dataModule("export function ComposerAppsBar(){ return null; }"),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const TemplateFillArea = forwardRef(function TemplateFillArea(props, _ref){
      return createElement("textarea", { "data-editor": "", value: props.value || "", readOnly: true, onKeyDown: props.onKeyDown });
    });
    export const PromptHighlightArea = TemplateFillArea;
  `),
}, { missingPackageStub: lazyStub }));
test("LeoComposer passes oceanleoDisabledReason to the Device control", async () => {
  const m = await mount(React.createElement(LeoComposer, { ...composerBase, onConversationChange() {}, oceanleoDisabledReason: "这个任务属于 elon 上的程序" }));
  try { assert.equal(globalThis.__cdDockProps.oceanleoDisabledReason, "这个任务属于 elon 上的程序"); }
  finally { await m.unmount(); }
});

const { ConversationBar } = await import(await compileModule("src/shell/cloud-computer/ConversationBar.tsx", {
  "../../i18n/ui/useUI": uiStub,
  "./ComputerDock": dockStub,
  "./native-surface/computer-settings-rows": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function ComputerConversationSettings(props) { globalThis.__cdSettingsProps = props; return React.createElement("div", { "data-conversation-settings-pill": "" }); }
  `),
}));

async function mount(element) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    async rerender(next) { await act(async () => root.render(next)); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}
const composerBase = { value: "hi", onChange() {}, onSubmit() {}, showPlugins: false, showAppsBar: false, showPayerSelector: false };
const NATIVE = { kind: "native", computerId: "cc_1", computerName: "elon", program: "codex", view: "chat" };

// 2026-10-31 night: the gear and its right-pane panel are gone; every setting lives
// in the composer's model pill (native chat) or the bar's settings pill (CLI / terminal).
test("LeoComposer: the Device control gets the host's lists; no settings gear for any conversation", async () => {
  const props = { ...composerBase, onConversationChange() {}, taskSessions: [session({ id: "x" })] };
  const m = await mount(React.createElement(LeoComposer, { ...props, conversation: { kind: "oceanleo", target: { kind: "cloud" } } }));
  try {
    assert.deepEqual(globalThis.__cdDockProps.taskSessions, props.taskSessions, "taskSessions reach the dock");
    assert.equal(globalThis.__cdDockProps.onConversationChange, props.onConversationChange, "the host's own callback, no composer memory in between");
    assert.equal(globalThis.__cdDockProps.conversation.kind, "oceanleo");
    for (const conversation of [NATIVE, { kind: "terminal", computerId: "cc_1", computerName: "elon" }]) {
      await m.rerender(React.createElement(LeoComposer, { ...props, conversation }));
      assert.equal(m.container.querySelector("[data-conversation-settings]"), null, `no gear: ${conversation.kind}`);
    }
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, conversation: NATIVE }));
    assert.equal(globalThis.__cdDockProps.onConversationChange, undefined, "no drill-down for hosts that cannot switch");
  } finally { await m.unmount(); }
});

test("LeoComposer: modelPickerSlot replaces ModelGroupPicker; null hides it", async () => {
  const m = await mount(React.createElement(LeoComposer, composerBase));
  try {
    assert.ok(m.container.querySelector("[data-model-group-picker]"));
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, modelPickerSlot: React.createElement("span", { "data-native-model": "" }) }));
    assert.equal(m.container.querySelector("[data-model-group-picker]"), null);
    assert.ok(m.container.querySelector("[data-native-model]"));
    await m.rerender(React.createElement(LeoComposer, { ...composerBase, modelPickerSlot: null }));
    assert.equal(m.container.querySelector("[data-model-group-picker]"), null);
  } finally { await m.unmount(); }
});

test("ConversationBar: composer bottom-bar row with the same Device control and, for CLI / terminal, the settings pill", async () => {
  const picks = [];
  const CLI = { ...NATIVE, view: "cli" };
  const computer = { id: "cc_1", name: "elon", node_online: true };
  const props = { conversation: CLI, onConversationChange: (c) => picks.push(c), taskSessions: [], boundTarget: { kind: "cloud" }, computer, oceanleoDisabledReason: "原因" };
  const m = await mount(React.createElement(ConversationBar, props));
  try {
    const bar = m.container.querySelector("[data-conversation-bar]");
    assert.ok(bar);
    assert.match(bar.className, /flex items-center justify-between px-4 pb-3\.5/);
    assert.ok(bar.querySelector("[data-oceanleo-cc-dock-trigger]"));
    assert.deepEqual(globalThis.__cdDockProps.boundTarget, { kind: "cloud" });
    assert.equal(globalThis.__cdDockProps.conversation, CLI);
    assert.equal(globalThis.__cdDockProps.oceanleoDisabledReason, "原因");
    globalThis.__cdDockProps.onConversationChange({ kind: "oceanleo", target: { kind: "cloud" } });
    assert.deepEqual(picks, [{ kind: "oceanleo", target: { kind: "cloud" } }]);
    assert.equal(bar.querySelector("[data-conversation-settings]"), null, "no gear");
    const pill = bar.querySelector("[data-conversation-settings-pill]");
    assert.ok(pill, "the settings pill sits in the bar");
    assert.equal(pill.parentElement, bar, "on the right, outside the Device group");
    assert.equal(globalThis.__cdSettingsProps.computer, computer);
    assert.equal(globalThis.__cdSettingsProps.conversation, CLI);
    await m.rerender(React.createElement(ConversationBar, { ...props, conversation: { kind: "terminal", computerId: "cc_1", computerName: "elon" } }));
    assert.ok(m.container.querySelector("[data-conversation-settings-pill]"), "terminal too");
    await m.rerender(React.createElement(ConversationBar, { ...props, conversation: { kind: "oceanleo", target: { kind: "cloud" } } }));
    assert.equal(m.container.querySelector("[data-conversation-settings-pill]"), null);
  } finally { await m.unmount(); }
});
