// C11-FW, W's findings on the dev website (C11-W-journal.md, 13:36–13:48 UTC, 2026-10-27):
// (B) a remote-desktop session request was sent with nobody clicking: a reloaded
//     `/devices?desktop=<id>` page (the dev slot hot-reloads on every shared-UI save) opened the
//     desktop and asked the computer again, and the first same-person auth event (a token refresh)
//     was read as an account switch and closed the desktop. Now only a click asks the computer.
// (C) the 我的设备 cards swapped places between polls (the gateway lists rows in storage order),
//     so a click aimed a moment earlier hit another computer. Now the order holds while the page is open.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { document, window } from "./helpers/remote-desktop-dom.mjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const ttStub = dataModule(`export function useUI(){ return (v, vars) => vars ? v.replace(/\\{(\\w+)\\}/g, (m, k) => k in vars ? String(vars[k]) : m) : v; }`);

const { DevicesPage, stableDeviceOrder } = await import(await compileModule("src/pages/DevicesPage.tsx", {
  "../facades/devices": dataModule(`export const devicesFacade = { async listDevices(){ return { ok: true, data: [] }; } };`),
  "../api/remote-desktop": dataModule(`export const remoteDesktopClient = globalThis.__fwDefaultRd;`),
  "../i18n/ui/useUI": ttStub,
  "../ui": dataModule(`export function ConfirmDialog() { return null; }`),
  "./PageHeader": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function PageHeader({ title }) { return React.createElement("h1", null, title); }`),
  "./devices/CloudDeviceGrid": dataModule(`export function CloudDeviceGrid() { return null; }`),
  "./AuthDialog": dataModule(`export function AuthDialog() { return null; }`),
  "../shell/cloud-computer/CreateComputerDialog": dataModule(`export function CreateComputerDialog() { return null; }`),
  "../shell/cloud-computer/ConnectServerDialog": dataModule(`export function ConnectServerDialog() { return null; }`),
}));
const { RemoteDesktopPanel, remoteDesktopTicket } = await import(await compileModule("src/pages/RemoteDesktopPanel.tsx", { "../i18n/ui/useUI": ttStub }));
const model = await import(await compileModule("src/lib/local-agent-task.ts"));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function flush(n = 6) { for (let i = 0; i < n; i += 1) await act(async () => {}); }
async function tick(ms) { await act(async () => { await wait(ms); }); await flush(); }
async function click(node) {
  assert.ok(node, "control exists");
  await act(async () => { node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
  await flush();
}
const button = (label) => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === label);
const panelNode = () => document.querySelector("[data-oceanleo-remote-desktop]");
const phase = () => panelNode()?.getAttribute("data-remote-phase") ?? null;
const stageStatus = () => document.querySelector("[data-remote-stage] [role='status']")?.textContent ?? "";

function rdClient({ state = "pending_consent", fail = null } = {}) {
  const log = { create: [], closes: [], status: 0 };
  return {
    log,
    async getStatus() { log.status += 1; return { ok: true, data: { supported: true, enabled: true, online: true, session_id: null, availability: "online" } }; },
    async createSession(deviceId) {
      log.create.push(deviceId);
      return fail ? { ok: false, error: fail, status: 409 } : { ok: true, data: { session_id: `s-${log.create.length}`, state, expires_at: "" } };
    },
    async getFrame() { await wait(5); return { ok: true, data: { state, frame: null } }; },
    async sendInput(deviceId, sessionId, seq) { return { ok: true, data: { accepted: true, seq } }; },
    async closeSession(deviceId, sessionId) { log.closes.push(sessionId); return { ok: true, data: { closed: true } }; },
  };
}
globalThis.__fwDefaultRd = rdClient();

async function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await flush();
  return { host, root, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}

// ------------------------------------------------------------------ the panel

test("the panel sends one session request per click ticket; remounted with the spent ticket it waits for 连接", async () => {
  const client = rdClient();
  const ticket = remoteDesktopTicket();
  const panel = () => React.createElement(RemoteDesktopPanel, { deviceId: "pc-1", deviceName: "PC", client, onClose() {}, ticket });
  let view = await mount(panel());
  await tick(30);
  assert.deepEqual(client.log.create, ["pc-1"]);
  assert.equal(ticket.spent, true);
  assert.equal(phase(), "waiting");
  await view.unmount();
  // The page re-rendered the slot (or React remounted it): nothing reaches the computer.
  view = await mount(panel());
  await tick(60);
  assert.deepEqual(client.log.create, ["pc-1"], "a remount never asks the computer again");
  assert.equal(phase(), "idle");
  assert.equal(stageStatus(), model.CLOUD_AGENT_COPY.remoteIdle);
  assert.equal(button("重新连接"), undefined);
  await click(button("连接"));
  await tick(30);
  assert.deepEqual(client.log.create, ["pc-1", "pc-1"], "the click is the request");
  assert.equal(phase(), "waiting");
  await view.unmount();
});

test("React's dev double effect (StrictMode) sends exactly one request and does not strand the panel", async () => {
  const client = rdClient();
  const ticket = remoteDesktopTicket();
  const view = await mount(React.createElement(React.StrictMode, null,
    React.createElement(RemoteDesktopPanel, { deviceId: "pc-1", deviceName: "PC", client, onClose() {}, ticket })));
  try {
    await tick(40);
    assert.deepEqual(client.log.create, ["pc-1"]);
    assert.equal(phase(), "waiting");
  } finally { await view.unmount(); }
});

test("no ticket (restored, not clicked) shows 连接; an omitted ticket keeps today's connect-on-open", async () => {
  const client = rdClient();
  let view = await mount(React.createElement(RemoteDesktopPanel, { deviceId: "pc-1", deviceName: "PC", client, onClose() {}, ticket: null }));
  await tick(40);
  assert.deepEqual(client.log.create, []);
  assert.equal(phase(), "idle");
  await click(button("连接"));
  await tick(30);
  assert.deepEqual(client.log.create, ["pc-1"]);
  await view.unmount();
  // Older consumers that mount the panel from their own click and pass no ticket.
  view = await mount(React.createElement(RemoteDesktopPanel, { deviceId: "pc-2", deviceName: "PC", client, onClose() {} }));
  await tick(40);
  assert.deepEqual(client.log.create, ["pc-1", "pc-2"]);
  await view.unmount();
});

test("a panel left in an error state sends nothing more until 重新连接 is clicked", async () => {
  const client = rdClient({ fail: "device_offline" });
  const view = await mount(React.createElement(RemoteDesktopPanel, { deviceId: "pc-1", deviceName: "PC", client, onClose() {}, ticket: remoteDesktopTicket() }));
  try {
    await tick(40);
    assert.equal(phase(), "error");
    for (let i = 0; i < 5; i += 1) {
      window.dispatchEvent(new window.Event("focus"));
      document.dispatchEvent(new window.Event("visibilitychange"));
      await tick(40);
    }
    assert.deepEqual(client.log.create, ["pc-1"]);
    await click(button("重新连接"));
    await tick(30);
    assert.deepEqual(client.log.create, ["pc-1", "pc-1"]);
  } finally { await view.unmount(); }
});

// ------------------------------------------------------------ 我的设备 page

function device(overrides = {}) {
  return { device_id: "pc-1", platform: "windows", device_name: "工作室", online: true, availability: "online",
    local_exec_enabled: true, granted_kinds: ["read"], last_seen_at: "2026-10-27T00:00:00Z", ...overrides };
}
function devicesClient(lists) {
  let calls = 0;
  const next = () => { const list = typeof lists === "function" ? lists(calls) : lists; calls += 1; return list; };
  return {
    get calls() { return calls; },
    async listDevices() { return { ok: true, data: next().map((item) => ({ ...item })) }; },
    async pairDevice() { return { ok: true, data: null }; },
    async renameDevice() { return { ok: true, data: null }; },
    async revokeDevice() { return { ok: true, data: null }; },
  };
}
const noCloud = { async availability() { return { kind: "absent" }; }, async taskRun() { return { kind: "error" }; },
  async control() { return { ok: false, run: null }; }, async standingGrant() { return null; } };

async function renderPage(props) {
  const view = await mount(React.createElement(DevicesPage, {
    cloudAgentClient: noCloud, remoteStatusIntervalMs: 20, listIntervalMs: 25,
    currentUser: async () => ({ known: true, userId: "owner-1" }), ...props,
  }));
  await tick(30);
  return view;
}
const cardOrder = (host) => [...host.querySelectorAll("[data-device-card]")].map((node) => node.getAttribute("data-device-card"));
const authEvent = (detail) => window.dispatchEvent(detail === undefined ? new window.Event("oceanleo:auth-state") : new window.CustomEvent("oceanleo:auth-state", { detail }));

test("a reloaded /devices?desktop=<id> shows the desktop but asks the computer only after 连接", async () => {
  window.history.replaceState(null, "", "/devices?desktop=pc-1");
  const remote = rdClient();
  const view = await renderPage({ client: devicesClient([device()]), remoteDesktopClient: remote });
  try {
    assert.ok(panelNode(), "the desktop view is restored");
    assert.equal(phase(), "idle");
    await tick(80);
    assert.deepEqual(remote.log.create, [], "no request without a click");
    await click(button("连接"));
    await tick(30);
    assert.deepEqual(remote.log.create, ["pc-1"]);
  } finally { await view.unmount(); window.history.replaceState(null, "", "/devices"); }
});

test("进入桌面 asks once; back closes; forward restores the view without asking again", async () => {
  window.history.replaceState(null, "", "/devices");
  const remote = rdClient();
  const view = await renderPage({ client: devicesClient([device()]), remoteDesktopClient: remote });
  try {
    await click(button("进入桌面"));
    await tick(30);
    assert.deepEqual(remote.log.create, ["pc-1"]);
    await act(async () => { window.history.back(); await wait(25); });
    await flush();
    assert.equal(panelNode(), null);
    assert.deepEqual(remote.log.closes, ["s-1"]);
    await act(async () => { window.history.forward(); await wait(25); });
    await tick(60);
    assert.ok(panelNode());
    assert.equal(phase(), "idle");
    assert.deepEqual(remote.log.create, ["pc-1"], "navigation is not a request");
    await click(button("连接"));
    await tick(30);
    assert.deepEqual(remote.log.create, ["pc-1", "pc-1"]);
  } finally { await view.unmount(); window.history.replaceState(null, "", "/devices"); }
});

test("an open desktop survives polls and same-person auth events; only another account closes it", async () => {
  window.history.replaceState(null, "", "/devices");
  const remote = rdClient({ fail: "input_ack_unknown" });
  let user = "owner-1";
  const devices = devicesClient([device()]);
  const view = await renderPage({ client: devices, remoteDesktopClient: remote, currentUser: async () => ({ known: true, userId: user }) });
  try {
    await click(button("进入桌面"));
    await tick(30);
    assert.equal(phase(), "error", "left open in an error state, as W's panel was");
    const lists = devices.calls;
    // Polls (list every 25 ms, status every 20 ms) and token refreshes for the same person.
    authEvent({ event: "TOKEN_REFRESHED", userId: "owner-1" });
    await tick(120);
    authEvent();
    await tick(60);
    authEvent({ event: "SIGNED_IN", userId: "owner-1" });
    await tick(60);
    assert.ok(devices.calls > lists, "the list kept polling");
    assert.ok(panelNode(), "the desktop stays open");
    assert.equal(new URLSearchParams(window.location.search).get("desktop"), "pc-1");
    assert.deepEqual(remote.log.create, ["pc-1"], "nothing reached the computer without a click");
    // A different account is a real switch.
    user = "owner-2";
    authEvent({ event: "SIGNED_IN", userId: "owner-2" });
    await tick(40);
    assert.equal(panelNode(), null);
    assert.equal(new URLSearchParams(window.location.search).get("desktop"), null);
    assert.deepEqual(remote.log.create, ["pc-1"]);
  } finally { await view.unmount(); window.history.replaceState(null, "", "/devices"); }
});

test("a sign-out clears the page even before the account was learned", async () => {
  window.history.replaceState(null, "", "/devices");
  const remote = rdClient();
  const devices = devicesClient((call) => call === 0 ? [device({ device_name: "Account A computer" })] : []);
  const view = await renderPage({ client: devices, remoteDesktopClient: remote, listIntervalMs: 60_000, currentUser: async () => ({ known: false, userId: null }) });
  try {
    assert.match(view.host.textContent, /Account A computer/);
    authEvent({ event: "SIGNED_OUT", userId: null });
    await tick(40);
    assert.doesNotMatch(view.host.textContent, /Account A computer/);
  } finally { await view.unmount(); }
});

test("cards keep their order across polls: online first on the first load, new ones at the end", async () => {
  window.history.replaceState(null, "", "/devices");
  const alpha = device({ device_id: "pc-a", device_name: "Alpha", online: false, availability: "offline" });
  const beta = device({ device_id: "pc-b", device_name: "Beta" });
  const phone = device({ device_id: "ph-c", device_name: "Cell", platform: "ios" });
  const delta = device({ device_id: "pc-d", device_name: "Delta" });
  // The gateway answers in a different storage order on every call, and availability changes.
  const answers = [
    [alpha, phone, beta],
    [beta, alpha, phone],
    [phone, { ...alpha, online: true, availability: "online" }, beta],
    [delta, beta, phone, alpha],
    [alpha, delta, beta],
  ];
  const devices = devicesClient((call) => answers[Math.min(call, answers.length - 1)]);
  const view = await renderPage({ client: devices, remoteDesktopClient: rdClient(), listIntervalMs: 30 });
  try {
    assert.deepEqual(cardOrder(view.host), ["pc-b", "ph-c", "pc-a"], "online first, then computers before phones, then by name");
    const seen = [];
    for (let i = 0; i < 6; i += 1) { await tick(35); seen.push(cardOrder(view.host).join(",")); }
    assert.ok(devices.calls >= 5, `polled ${devices.calls} times`);
    for (const order of seen) {
      assert.ok(["pc-b,ph-c,pc-a", "pc-b,ph-c,pc-a,pc-d", "pc-b,pc-a,pc-d"].includes(order), `stable: ${order}`);
    }
    assert.deepEqual(cardOrder(view.host), ["pc-b", "pc-a", "pc-d"], "a removed card leaves, the new one stays at the end");
  } finally { await view.unmount(); }
});

test("stableDeviceOrder: known cards keep their places, removed ones go, new ones follow the first-load rule", () => {
  const d = (id, name, extra = {}) => device({ device_id: id, device_name: name, ...extra });
  const first = stableDeviceOrder([], [d("z", "Zed", { online: false, availability: "offline" }), d("p", "Phone", { platform: "android" }), d("a", "Able")]);
  assert.deepEqual(first.map((x) => x.device_id), ["a", "p", "z"]);
  const later = stableDeviceOrder(first.map((x) => x.device_id), [d("z", "Zed"), d("n", "New"), d("a", "Able"), d("m", "Mid", { online: false, availability: "offline" })]);
  assert.deepEqual(later.map((x) => x.device_id), ["a", "z", "n", "m"]);
  assert.deepEqual(stableDeviceOrder(["a"], []), []);
});
