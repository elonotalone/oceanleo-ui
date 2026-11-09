// 2026-11-07 UX wave (DU): the Devices page computer card line, the device panel
// (usage, programs, terminals, End / End all) and the node upgrade confirm.
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
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/devices" });
const { window } = dom;
const { document } = window;
window.scrollTo = () => {};
for (const [name, value] of Object.entries({
  window, document, navigator: window.navigator, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement, Element: window.Element, Node: window.Node, Event: window.Event,
  InputEvent: window.InputEvent, MouseEvent: window.MouseEvent,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const domainStubUrl = dataModule(`
  export const CONFIGURED_DOMAIN_FAMILY = "com";
  export function currentDomainFamily() { return "com"; }
  export function currentDomainProfile() {
    return { family: "com", portalOrigin: "https://oceanleo.com", gatewayOrigin: "", cookieDomain: "", registrableDomain: "oceanleo.com" };
  }
  export function domainProfileForHost() { return currentDomainProfile(); }
  export function familyForHost() { return "com"; }
  export function runtimePageOrigin() { return "https://oceanleo.com"; }
  export function portalHref(path) { return path; }
  export function sharedCookieDomainFor() { return undefined; }
`);
const dialogStubUrl = dataModule(`
  export function ConnectServerDialog() { return null; }
`);
const authDialogStubUrl = dataModule(`
  export function AuthDialog() { return null; }
`);

const { CloudDeviceGrid } = await import(await compileModule("src/pages/devices/CloudDeviceGrid.tsx", {
  "../../i18n/ui/useUI": uiTextStubUrl,
  "../../contracts/domain-family": domainStubUrl,
  "../../shell/cloud-computer/ConnectServerDialog": dialogStubUrl,
  "../AuthDialog": authDialogStubUrl,
}));
const { upgradeConfirmList, runningPrograms, memoryPercent } = await import(await compileModule("src/lib/computer-activity-api.ts", {
  "./auth/client": dataModule(`export async function accessToken() { return null; }`),
}));

function computer(overrides = {}) {
  return {
    id: "cc_1", name: "elon", source: "byo", status: "active", edition: "com", node_online: true,
    enrolled_at: "2026-09-20T00:00:00Z", confirmed_at: "2026-09-20T00:00:00Z",
    created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", ...overrides,
  };
}

const STARTED = new Date(Date.now() - 65 * 60 * 1000).toISOString();

function program(overrides = {}) {
  return {
    slot: "acp-s1", program: "claude", pid: 101, alive: true, started_at: STARTED, rss_bytes: 512 * 1024 * 1024,
    cpu_percent: 3.4, task_id: "t1", task_title: "整理发票", session_id: "s1", ...overrides,
  };
}

function activity(overrides = {}) {
  return {
    online: true, node_version: "c553c95", latest_version: "d000001", update_available: true,
    usage: { cpu_percent: 12.4, mem_used_bytes: 8 * 1024 ** 3, mem_total_bytes: 16 * 1024 ** 3, sampled_at: "2026-11-07T16:00:00Z" },
    programs: [
      program(),
      program({ slot: "acp-s2", program: "codex", pid: 102, task_id: "t2", task_title: null, session_id: "s2", rss_bytes: null, cpu_percent: null }),
      program({ slot: "acp-dead", pid: 103, alive: false, task_id: "t3", task_title: "已退出" }),
    ],
    terminals: [{ session_id: "term-1", task_id: "t9", title: "bash", started_at: STARTED }],
    ...overrides,
  };
}

function cloudClient(items = [computer()]) {
  return {
    async listComputers() { return { items: items.map((item) => ({ ...item })) }; },
    async listComputerEvents() { return { items: [] }; },
  };
}

/** A recording activity client; `answers` overrides each method's behaviour. */
function activityClient(answers = {}) {
  const calls = [];
  let current = answers.initial ?? activity();
  const client = {
    calls,
    set(next) { current = next; },
    async getActivity(id) { calls.push(["get", id]); return answers.get ? answers.get(id) : current; },
    async endActivity(id, target) { calls.push(["end", id, target]); return answers.end ? answers.end(id, target) : current; },
    async endAll(id) { calls.push(["endAll", id]); return answers.endAll ? answers.endAll(id) : current; },
    async upgradeNode(id, options) { calls.push(["upgrade", id, options]); return answers.upgrade(id, options); },
  };
  return client;
}

async function flush(count = 8) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function render(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(CloudDeviceGrid, props)); });
  await flush();
  return {
    host,
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

function panel() { return document.querySelector('[data-device-dialog="activity"]'); }

async function click(element) {
  assert.ok(element, "element to click exists");
  await act(async () => { element.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  await flush();
}

test("card line counts live programs and shows memory, CPU and the update badge", async () => {
  const client = activityClient();
  const view = await render({ client: cloudClient(), activityClient: client });
  try {
    const line = view.host.querySelector('[data-device-activity-open="cc_1"]');
    assert.ok(line, "the card has the activity line");
    assert.equal(line.textContent, "2 个程序在运行 · 内存 50% · CPU 12%", "dead processes are not counted");
    assert.equal(view.host.querySelector('[data-device-update-badge="cc_1"]').textContent, "有更新");
    assert.deepEqual(client.calls, [["get", "cc_1"]], "one read with the list, no loop of its own");
    assert.equal(panel(), null, "the panel opens only on a click");
  } finally { view.cleanup(); }
});

test("an old node (usage null) shows only the count; no badge without an update; offline shows nothing", async () => {
  const old = activityClient({ initial: activity({ usage: null, update_available: false }) });
  let view = await render({ client: cloudClient(), activityClient: old });
  try {
    assert.equal(view.host.querySelector('[data-device-activity-open="cc_1"]').textContent, "2 个程序在运行");
    assert.equal(view.host.querySelector('[data-device-update-badge="cc_1"]'), null);
  } finally { view.cleanup(); }
  view = await render({ client: cloudClient(), activityClient: activityClient({ initial: activity({ online: false }) }) });
  try {
    assert.equal(view.host.querySelector('[data-device-activity-open="cc_1"]'), null);
    assert.equal(view.host.querySelector('[data-device-update-badge="cc_1"]'), null);
  } finally { view.cleanup(); }
  const failing = activityClient({ get: async () => { throw new Error("not found"); } });
  view = await render({ client: cloudClient(), activityClient: failing });
  try {
    assert.equal(view.host.querySelector('[data-device-activity-open="cc_1"]'), null, "a failed read hides the line");
  } finally { view.cleanup(); }
});

test("a node held by another gateway stays online but disables dashboard actions", async () => {
  const client = activityClient({ initial: activity({ reachable: false, gateway: "api.oceanbizs.com" }) });
  const view = await render({ client: cloudClient(), activityClient: client });
  try {
    const cardLine = view.host.querySelector('[data-device-activity-open="cc_1"]');
    assert.equal(cardLine.textContent, "在线，但当前版本连不到它");
    await click(cardLine);
    const dialog = panel();
    assert.ok(dialog);
    assert.ok(dialog.querySelector("[data-device-activity-unreachable]"));
    assert.equal(dialog.querySelector("[data-device-activity-unreachable]").textContent, "在线，但当前版本连不到它");
    assert.equal(dialog.querySelector("[data-device-activity-gateway]").textContent, "网关 api.oceanbizs.com");
    assert.match(dialog.querySelector("[data-device-activity-unreachable-reason]").textContent, /当前版本无法控制/);
    assert.equal(dialog.querySelector("[data-device-activity-offline]"), null);
    assert.equal(dialog.querySelector("[data-device-upgrade]").disabled, true);
    assert.equal(dialog.querySelector("[data-device-end-all]").disabled, true);
    assert.equal(dialog.querySelector('[data-activity-end="acp-s1"]').disabled, true);
  } finally { view.cleanup(); }
});

test("pending computers are not asked for activity", async () => {
  const client = activityClient();
  const view = await render({ client: cloudClient([computer({ id: "cc_new", enrolled_at: null, confirmed_at: null, node_online: false })]), activityClient: client });
  try {
    assert.deepEqual(client.calls, []);
  } finally { view.cleanup(); }
});

test("panel lists machine usage, programs with task links, running time, memory, and terminals", async () => {
  const client = activityClient();
  const view = await render({ client: cloudClient(), activityClient: client });
  try {
    await click(view.host.querySelector('[data-device-activity-open="cc_1"]'));
    const dialog = panel();
    assert.ok(dialog, "the device panel is open");
    assert.ok(client.calls.filter(([kind]) => kind === "get").length >= 2, "opening the panel re-reads activity");
    const text = dialog.textContent;
    assert.match(dialog.querySelector("[data-device-activity-usage]").textContent, /CPU 12% · 内存 50% 8\.0 GB \/ 16 GB/);
    assert.match(text, /节点版本 c553c95/);
    const rows = [...dialog.querySelectorAll("[data-activity-program]")];
    assert.deepEqual(rows.map((row) => row.getAttribute("data-activity-program")), ["acp-s1", "acp-s2"], "only live programs");
    assert.match(rows[0].textContent, /Claude Code · 整理发票/);
    assert.match(rows[0].textContent, /已运行 1:05:0\d · 内存 512 MB · CPU 3%/);
    assert.equal(rows[0].querySelector('[data-activity-task="t1"]').getAttribute("href"), "/tasks/t1");
    assert.match(rows[1].textContent, /Codex · 未命名任务/);
    assert.doesNotMatch(rows[1].textContent, /内存|CPU/, "no per-process numbers from an old node");
    const terminal = dialog.querySelector('[data-activity-terminal="term-1"]');
    assert.match(terminal.textContent, /bash/);
    assert.equal(terminal.querySelector('[data-activity-task="t9"]').getAttribute("href"), "/tasks/t9");
    assert.match(text, /结束后对话不丢，再发消息会接着聊/);
    assert.ok(dialog.querySelector("[data-device-end-all]"));
  } finally { view.cleanup(); }
});

test("End ends one program by slot and one terminal by session id; the returned body replaces the list and the card", async () => {
  const after = activity({ programs: [program({ slot: "acp-s2", program: "codex", task_id: "t2", task_title: "第二个" })], terminals: [] });
  const client = activityClient({ end: async () => after });
  const view = await render({ client: cloudClient(), activityClient: client });
  try {
    await click(view.host.querySelector('[data-device-activity-open="cc_1"]'));
    await click(panel().querySelector('[data-activity-end="acp-s1"]'));
    assert.deepEqual(client.calls.find(([kind]) => kind === "end"), ["end", "cc_1", { slot: "acp-s1" }]);
    assert.deepEqual([...panel().querySelectorAll("[data-activity-program]")].map((row) => row.getAttribute("data-activity-program")), ["acp-s2"]);
    assert.equal(panel().querySelector("[data-device-activity-terminals]"), null);
    assert.equal(view.host.querySelector('[data-device-activity-open="cc_1"]').textContent, "1 个程序在运行 · 内存 50% · CPU 12%", "the card follows the panel");
  } finally { view.cleanup(); }

  const terminalClient = activityClient();
  const second = await render({ client: cloudClient(), activityClient: terminalClient });
  try {
    await click(second.host.querySelector('[data-device-activity-open="cc_1"]'));
    await click(panel().querySelector('[data-activity-end="term-1"]'));
    assert.deepEqual(terminalClient.calls.find(([kind]) => kind === "end"), ["end", "cc_1", { session_id: "term-1" }]);
  } finally { second.cleanup(); }
});

test("End all calls end-all once and shows the empty list it returns; errors are shown verbatim", async () => {
  const empty = activity({ programs: [], terminals: [] });
  const client = activityClient({ endAll: async () => empty });
  const view = await render({ client: cloudClient(), activityClient: client });
  try {
    await click(view.host.querySelector('[data-device-activity-open="cc_1"]'));
    await click(panel().querySelector("[data-device-end-all]"));
    assert.deepEqual(client.calls.filter(([kind]) => kind === "endAll"), [["endAll", "cc_1"]]);
    assert.match(panel().textContent, /没有程序在运行/);
    assert.equal(panel().querySelector("[data-device-end-all]"), null);
    assert.doesNotMatch(panel().textContent, /结束后对话不丢/, "nothing to end, no line about ending");
  } finally { view.cleanup(); }

  const failing = activityClient({ end: async () => { throw Object.assign(new Error("node_offline: the computer is offline"), { status: 409 }); } });
  const second = await render({ client: cloudClient(), activityClient: failing });
  try {
    await click(second.host.querySelector('[data-device-activity-open="cc_1"]'));
    await click(panel().querySelector('[data-activity-end="acp-s1"]'));
    assert.equal(panel().querySelector("[data-device-activity-error]").textContent, "node_offline: the computer is offline");
    assert.ok(panel().querySelector('[data-activity-end="acp-s1"]'), "the list stays as it was");
  } finally { second.cleanup(); }
});

test("升级节点 asks the gateway first, lists what it says will end, and upgrades only after 结束并升级", async () => {
  const refusal = Object.assign(new Error("confirm_required"), {
    status: 409, code: "confirm_required",
    detail: { code: "confirm_required", running_agents: 1, running_terminals: 1, programs: [program()], terminals: [{ session_id: "term-1", task_id: null, title: "bash", started_at: null }] },
  });
  const client = activityClient({
    upgrade: async (_id, options) => {
      if (!options.confirm) throw refusal;
      return { ok: true, from: "c553c95", to: "d000001" };
    },
  });
  const view = await render({ client: cloudClient(), activityClient: client });
  try {
    await click(view.host.querySelector('[data-device-update-badge="cc_1"]'));
    await click(panel().querySelector("[data-device-upgrade]"));
    assert.deepEqual(client.calls.filter(([kind]) => kind === "upgrade"), [["upgrade", "cc_1", {}]], "the first click never confirms");
    const confirm = document.querySelector('[data-device-dialog="upgrade-confirm"]');
    assert.ok(confirm, "the confirm opens");
    assert.match(confirm.textContent, /升级会结束这些程序和终端/);
    assert.match(confirm.querySelector('[data-upgrade-ends-program="acp-s1"]').textContent, /Claude Code · 整理发票/);
    assert.match(confirm.querySelector('[data-upgrade-ends-terminal="term-1"]').textContent, /bash/);
    await click(confirm.querySelector("[data-device-upgrade-confirm]"));
    assert.deepEqual(client.calls.filter(([kind]) => kind === "upgrade").at(-1), ["upgrade", "cc_1", { confirm: true }]);
    assert.equal(document.querySelector('[data-device-dialog="upgrade-confirm"]'), null);
    const button = panel().querySelector("[data-device-upgrade]");
    assert.equal(button.textContent, "正在升级…");
    assert.equal(button.disabled, true);
  } finally { view.cleanup(); }
});

test("cancel in the upgrade confirm upgrades nothing; with nothing running the first click upgrades", async () => {
  const refusal = Object.assign(new Error("confirm_required"), { status: 409, code: "confirm_required", detail: { code: "confirm_required", programs: [program()] } });
  const client = activityClient({ upgrade: async () => { throw refusal; } });
  const view = await render({ client: cloudClient(), activityClient: client });
  try {
    await click(view.host.querySelector('[data-device-activity-open="cc_1"]'));
    await click(panel().querySelector("[data-device-upgrade]"));
    const confirm = document.querySelector('[data-device-dialog="upgrade-confirm"]');
    await click([...confirm.querySelectorAll("button")].find((button) => button.textContent === "取消"));
    assert.equal(document.querySelector('[data-device-dialog="upgrade-confirm"]'), null);
    assert.equal(client.calls.filter(([kind]) => kind === "upgrade").length, 1);
  } finally { view.cleanup(); }

  const idle = activityClient({ initial: activity({ programs: [], terminals: [] }), upgrade: async () => ({ ok: true, from: "c553c95", to: "d000001" }) });
  const second = await render({ client: cloudClient(), activityClient: idle });
  try {
    await click(second.host.querySelector('[data-device-activity-open="cc_1"]'));
    await click(panel().querySelector("[data-device-upgrade]"));
    assert.deepEqual(idle.calls.filter(([kind]) => kind === "upgrade"), [["upgrade", "cc_1", {}]]);
    assert.equal(document.querySelector('[data-device-dialog="upgrade-confirm"]'), null);
    assert.equal(panel().querySelector("[data-device-upgrade]").textContent, "正在升级…");
    idle.set(activity({ programs: [], terminals: [], node_version: "d000001", update_available: false }));
  } finally { second.cleanup(); }
});

test("the panel re-reads while open and stops when closed; the upgrade button goes once the new version is read", async () => {
  const client = activityClient({ initial: activity({ programs: [], terminals: [] }), upgrade: async () => ({ ok: true, from: "c553c95", to: "d000001" }) });
  const { DeviceActivityPanel } = await import(await compileModule("src/pages/devices/DeviceActivityPanel.tsx", {
    "../../i18n/ui/useUI": uiTextStubUrl,
    "../../contracts/domain-family": domainStubUrl,
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let closed = false;
  await act(async () => { root.render(React.createElement(DeviceActivityPanel, { computerId: "cc_1", name: "elon", client, refreshMs: 15, onClose: () => { closed = true; } })); });
  await flush();
  await click(panel().querySelector("[data-device-upgrade]"));
  assert.equal(panel().querySelector("[data-device-upgrade]").textContent, "正在升级…");
  client.set(activity({ programs: [], terminals: [], node_version: "d000001", update_available: false }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
  await flush();
  const reads = client.calls.filter(([kind]) => kind === "get").length;
  assert.ok(reads >= 3, `re-read while open (${reads})`);
  assert.equal(panel().querySelector("[data-device-upgrade]"), null, "upgraded: no button");
  assert.match(panel().textContent, /节点版本 d000001/);
  await click(document.querySelector('[data-device-dialog="activity"] button[aria-label="关闭"]'));
  assert.equal(closed, true);
  act(() => root.unmount());
  host.remove();
  const settled = client.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(client.calls.length, settled, "no read after the panel is gone");
});

test("a refresh that started before End cannot overwrite what End returned", async () => {
  let releaseRead;
  let reads = 0;
  const after = activity({ programs: [], terminals: [] });
  const client = activityClient({
    get: () => (++reads === 2 ? new Promise((resolve) => { releaseRead = () => resolve(activity()); }) : Promise.resolve(activity())),
    end: async () => after,
  });
  const view = await render({ client: cloudClient(), activityClient: client });
  try {
    await click(view.host.querySelector('[data-device-activity-open="cc_1"]'));
    await click(panel().querySelector('[data-activity-end="acp-s1"]'));
    assert.match(panel().textContent, /没有程序在运行/);
    await act(async () => { releaseRead(); });
    await flush();
    assert.match(panel().textContent, /没有程序在运行/, "the older read is dropped");
  } finally { view.cleanup(); }
});

test("client helpers: live programs, memory percent, and the upgrade refusal list", () => {
  assert.deepEqual(runningPrograms(activity()).map((item) => item.slot), ["acp-s1", "acp-s2"]);
  assert.equal(memoryPercent({ cpu_percent: 0, mem_used_bytes: 1, mem_total_bytes: 3, sampled_at: "" }), 33);
  assert.equal(memoryPercent({ cpu_percent: 0, mem_used_bytes: 1, mem_total_bytes: 0, sampled_at: "" }), null);
  assert.equal(upgradeConfirmList(Object.assign(new Error("x"), { status: 409, code: "no_update" })), null);
  assert.equal(upgradeConfirmList(new Error("network")), null);
  assert.deepEqual(upgradeConfirmList(Object.assign(new Error("x"), { status: 409, code: "confirm_required", detail: { programs: [program()] } })), { programs: [program()], terminals: [] });
});
