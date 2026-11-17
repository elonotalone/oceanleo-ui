import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { document, window } from "./helpers/remote-desktop-dom.mjs";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

globalThis.__rdDefaultClient = {};
globalThis.__rdStandbyLog = [];
const stubs = {
  "../api/remote-desktop-webrtc-standby": dataModule(`export function prepareRemoteDesktopStandby(id) { globalThis.__rdStandbyLog.push(["prepare", id]); return () => globalThis.__rdStandbyLog.push(["close", id]); }`),
  "../facades/devices": dataModule(`export const devicesFacade = globalThis.__rdDevicesClient;`),
  "../api/remote-desktop": dataModule(`export const remoteDesktopClient = globalThis.__rdDefaultClient;`),
  "../i18n/ui/useUI": dataModule(`
    export function useUI() {
      return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
    }
  `),
  "../ui": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function ConfirmDialog() { return null; }
  `),
  "./PageHeader": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function PageHeader({ title }) { return React.createElement("h1", null, title); }
  `),
  "./AuthDialog": dataModule(`export function AuthDialog() { return null; }`),
  "./devices/CloudDeviceGrid": dataModule(`
    export function CloudDeviceGrid() { return null; }
    export function CloudComputersPage() { return null; }
  `),
  "../shell/cloud-computer/CreateComputerDialog": dataModule(`export function CreateComputerDialog() { return null; }`),
  "../shell/cloud-computer/ConnectServerDialog": dataModule(`export function ConnectServerDialog() { return null; }`),
};
const { DevicesPage } = await import(await compileModule("src/pages/DevicesPage.tsx", stubs));

test.beforeEach(() => { window.history.replaceState(null, "", "/devices"); });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async (n = 4) => {
  for (let i = 0; i < n; i += 1) await act(async () => {});
};

function device(overrides = {}) {
  return {
    device_id: "pc-1",
    platform: "windows",
    device_name: "工作室",
    online: true,
    local_exec_enabled: true,
    granted_kinds: ["read"],
    last_seen_at: "2026-10-24T00:00:00Z",
    ...overrides,
  };
}

function devicesClient(list) {
  return {
    async listDevices() {
      return { ok: true, data: list.map((d) => ({ ...d })) };
    },
    async pairDevice() {
      return { ok: true, data: null };
    },
    async renameDevice() {
      return { ok: true, data: null };
    },
    async revokeDevice() {
      return { ok: true, data: null };
    },
  };
}

function rdClient(statusById = {}) {
  const log = { status: [], create: [], closes: [] };
  return {
    log,
    async getStatus(deviceId, options) {
      log.status.push({ deviceId, signal: options?.signal });
      const status = statusById[deviceId];
      return status ? { ok: true, data: status } : { ok: false, error: "network_error", status: 0 };
    },
    async createSession(deviceId) {
      log.create.push(deviceId);
      return { ok: true, data: { session_id: "s-1", state: "connecting", expires_at: "" } };
    },
    async getFrame() {
      await wait(5);
      return { ok: true, data: { state: "active", frame: { image: "data:image/jpeg;base64,AAAA", width: 800, height: 600, sequence: Date.now() } } };
    },
    async sendInput(deviceId, sessionId, seq) {
      return { ok: true, data: { accepted: true, seq } };
    },
    async closeSession(deviceId, sessionId) {
      log.closes.push(sessionId);
      return { ok: true, data: { closed: true } };
    },
  };
}

const READY = { supported: true, enabled: true, online: true, session_id: null };

async function render(list, remote, props = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(DevicesPage, {
        client: devicesClient(list),
        remoteDesktopClient: remote,
        remoteStatusIntervalMs: 20,
        ...props,
      }),
    );
  });
  await flush();
  return {
    host,
    text: () => document.body.textContent || "",
    entries: () => [...host.querySelectorAll("[data-oceanleo-remote-entry]")],
    enter: () => [...host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "进入桌面"),
    button: (label) => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === label),
    async tick(ms = 70) {
      await act(async () => {
        await wait(ms);
      });
    },
    async click(node) {
      assert.ok(node, "expected button");
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test("Enter desktop is actionable with no prior permission and requests consent", async () => {
  const remote = rdClient({ "pc-1": { ...READY, enabled: false, availability: "online" } });
  const view = await render([device()], remote);
  try {
    assert.equal(view.enter().disabled, false);
    assert.doesNotMatch(view.text(), /只能在那台电脑|还没有允许远程桌面/);
    await view.click(view.enter());
    assert.deepEqual(remote.log.create, ["pc-1"]);
    assert.ok(document.querySelector("[data-oceanleo-remote-desktop]"));
  } finally { await view.unmount(); }
});

test("signed-out target is never Online even when its background heartbeat is alive", async () => {
  const remote = rdClient({ "pc-1": { ...READY, availability: "signed_out", online: true } });
  const view = await render([device()], remote);
  try {
    const status = view.host.querySelector("[data-device-availability]");
    assert.equal(status.getAttribute("data-device-availability"), "signed_out");
    assert.equal(status.textContent.trim(), "未登录");
    assert.equal(view.enter().disabled, false);
  } finally { await view.unmount(); }
});

test("legacy heartbeat without authenticated availability remains unknown", async () => {
  const remote = rdClient({ "pc-1": READY });
  const view = await render([device()], remote);
  try { assert.equal(view.host.querySelector("[data-device-availability]").getAttribute("data-device-availability"), "unknown"); }
  finally { await view.unmount(); }
});

test("offline and unsupported targets remain actionable and show server's concrete response", async () => {
  for (const error of ["device_offline", "remote_desktop_unsupported"]) {
    const remote = rdClient({ "pc-1": { ...READY, supported: false, online: false, availability: "offline" } });
    remote.createSession = async (id) => { remote.log.create.push(id); return { ok: false, error, status: 409 }; };
    const view = await render([device()], remote);
    try {
      assert.equal(view.enter().disabled, false);
      await view.click(view.enter());
      await view.tick(30);
      assert.deepEqual(remote.log.create, ["pc-1"]);
      assert.equal(document.querySelector("[data-oceanleo-remote-desktop]").getAttribute("data-remote-phase"), "error");
      assert.match(view.text(), error === "device_offline" ? /不在线|离线/ : /不支持/);
      assert.equal(document.querySelector("[data-remote-frame]"), null);
    } finally { await view.unmount(); }
  }
});

test("phones are controllers, never target desktop buttons/status polls", async () => {
  const remote = rdClient({ "pc-1": { ...READY, availability: "online" } });
  const view = await render([device(), device({ device_id: "phone-1", platform: "ios" })], remote);
  try {
    assert.equal(view.host.querySelectorAll("[data-remote-device-icon]").length, 1);
    assert.ok(remote.log.status.every((call) => call.deviceId === "pc-1"));
    assert.ok(view.host.querySelector('[data-device-card="phone-1"]'));
  } finally { await view.unmount(); }
});

test("fresh authenticated availability updates independently of permission without reload", async () => {
  const statuses = { "pc-1": { ...READY, online: false, availability: "offline" } };
  const remote = rdClient(statuses);
  const view = await render([device()], remote);
  try {
    assert.ok(view.host.querySelector('[data-device-availability="offline"]'));
    statuses["pc-1"] = { ...READY, enabled: false, availability: "online" };
    await view.tick(100);
    assert.ok(view.host.querySelector('[data-device-availability="online"]'));
    assert.equal(view.enter().disabled, false);
    statuses["pc-1"] = { ...READY, availability: "signed_out" };
    await view.tick(100);
    assert.ok(view.host.querySelector('[data-device-availability="signed_out"]'));
  } finally { await view.unmount(); }
});

test("status polling is bounded, non-overlapping and aborts immediately on unmount", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const remote = rdClient();
  remote.getStatus = async (deviceId, options) => {
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    remote.log.status.push({ deviceId, signal: options?.signal });
    await wait(30);
    inFlight -= 1;
    return { ok: true, data: { ...READY, availability: "online" } };
  };
  const view = await render([device()], remote);
  await view.tick(250);
  assert.equal(maxInFlight, 1);
  const signal = remote.log.status[0].signal;
  assert.ok(remote.log.status.length >= 2 && remote.log.status.length <= 8);
  await view.unmount();
  assert.equal(signal.aborted, true);
  const count = remote.log.status.length;
  await wait(100);
  assert.equal(remote.log.status.length, count);
});

test("desktop enters synchronously from the click, writes its URL, and closes its session once", async () => {
  const remote = rdClient({ "pc-1": { ...READY, availability: "online" } });
  const view = await render([device()], remote);
  const previousFullscreen = window.HTMLElement.prototype.requestFullscreen;
  const fullscreen = [];
  window.HTMLElement.prototype.requestFullscreen = function () {
    fullscreen.push({ id: this.id, query: new URLSearchParams(window.location.search).get("desktop"), creates: remote.log.create.length });
    return Promise.resolve();
  };
  try {
    await view.click(view.enter());
    await view.tick(60);
    assert.ok(document.querySelector("[data-oceanleo-remote-desktop]"));
    assert.equal(new URLSearchParams(window.location.search).get("desktop"), "pc-1");
    assert.equal(window.location.pathname, "/devices");
    assert.deepEqual(fullscreen, [{ id: "oceanleo-remote-desktop-screen", query: null, creates: 0 }]);
    assert.equal(document.querySelector('[data-device-dialog="remote-desktop"]'), null, "dedicated desktop has no DeviceDialog wrapper");
    await view.click(document.querySelector("[data-remote-toolbar-handle]"));
    await view.click(view.button("退出桌面"));
    await view.tick(30);
    assert.deepEqual(remote.log.closes, ["s-1"]);
    assert.equal(document.querySelector("[data-oceanleo-remote-desktop]"), null);
    assert.equal(new URLSearchParams(window.location.search).get("desktop"), null);
    assert.ok(view.enter());
  } finally { window.HTMLElement.prototype.requestFullscreen = previousFullscreen; await view.unmount(); }
});

test("browser back/forward follows the desktop query and refresh restores only a current-account device", async () => {
  const remote = rdClient({ "pc-1": { ...READY, availability: "online" } });
  const view = await render([device()], remote);
  try {
    await view.click(view.enter());
    assert.equal(remote.log.create.length, 1);
    await act(async () => { window.history.back(); await wait(25); });
    await flush();
    assert.equal(document.querySelector("[data-oceanleo-remote-desktop]"), null);
    assert.equal(remote.log.closes.length, 1);
    await act(async () => { window.history.forward(); await wait(25); });
    await flush();
    assert.ok(document.querySelector("[data-oceanleo-remote-desktop]"));
    // C11-FW (W 2026-10-27): navigation restores the view, only a click asks the computer.
    assert.equal(document.querySelector("[data-oceanleo-remote-desktop]").getAttribute("data-remote-phase"), "idle");
    assert.equal(remote.log.create.length, 1);
    await view.click(document.querySelector("[data-remote-toolbar-handle]"));
    await view.click(view.button("连接"));
    assert.equal(remote.log.create.length, 2);
  } finally { await view.unmount(); }
  window.history.replaceState(null, "", "/devices?desktop=pc-1");
  const refreshed = await render([device()], remote);
  try {
    assert.ok(document.querySelector("[data-oceanleo-remote-desktop]"));
    assert.equal(remote.log.create.length, 2, "a refreshed page asks nothing until 连接");
    await refreshed.click(document.querySelector("[data-remote-toolbar-handle]"));
    await refreshed.click(refreshed.button("退出桌面"));
    assert.equal(new URLSearchParams(window.location.search).get("desktop"), null);
  } finally { await refreshed.unmount(); }
  window.history.replaceState(null, "", "/devices?desktop=other-owner");
  const unknown = await render([device()], remote);
  try {
    assert.equal(document.querySelector("[data-oceanleo-remote-desktop]"), null);
    assert.match(unknown.text(), /当前账号找不到这台电脑/);
    await unknown.click(unknown.button("返回设备"));
    assert.equal(new URLSearchParams(window.location.search).get("desktop"), null);
  } finally { await unknown.unmount(); }
});

test("reference cards expose Settings/Tasks, not permission switches or old explainer", async () => {
  const remote = rdClient({ "pc-1": { ...READY, availability: "online" } });
  const view = await render([device()], remote);
  try {
    assert.ok(view.button("设置"));
    assert.ok(view.button("任务"));
    assert.ok(view.host.querySelector("[data-device-cover]"));
    assert.doesNotMatch(view.text(), /设备权限如何保护你|网页端只能给设备下单|还没有允许远程桌面/);
  } finally { await view.unmount(); }
});

test("device page never copies local switch APIs, device secrets or pair-code issuance", async () => {
  const source = await readFile(resolve("src/pages/DevicesPage.tsx"), "utf8");
  for (const forbidden of ["device_secret", "local_exec_enabled: true", "remote_desktop_enabled", "enableRemote"]) assert.ok(!source.includes(forbidden));
});

test("standby observes real cards and prepares only one visible online owner-approved computer", async t => {
  const errors=[]; t.mock.method(console,"error",(...args)=>errors.push(args));
  const observers=[];
  class Observer {
    targets=[]; constructor(callback){this.callback=callback;observers.push(this);}
    observe(node){this.targets.push(node);} disconnect(){this.disconnected=true;}
    emit(id,visible=true){const target=this.targets.find(node=>node.dataset.deviceCard===id);assert.ok(target);this.callback([{target,isIntersecting:visible,intersectionRatio:visible?1:0}]);}
  }
  const previous=Object.getOwnPropertyDescriptor(globalThis,"IntersectionObserver");Object.defineProperty(globalThis,"IntersectionObserver",{configurable:true,value:Observer});
  const oldVisibility=Object.getOwnPropertyDescriptor(document,"visibilityState");let visibility="visible";Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>visibility});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,"IntersectionObserver",previous);else delete globalThis.IntersectionObserver;if(oldVisibility)Object.defineProperty(document,"visibilityState",oldVisibility);else delete document.visibilityState;});
  const eligible={...READY,availability:"online",standby_allowed:true,capabilities:["remote-desktop-standby-v1"]};
  const statuses={"pc-1":eligible,"pc-2":{...eligible},"ask-pc":{...eligible,standby_allowed:false}};
  const remote=globalThis.__rdDefaultClient;Object.assign(remote,rdClient(statuses));globalThis.__rdStandbyLog=[];
  const view=await render([device(),device({device_id:"pc-2"}),device({device_id:"ask-pc"})],remote);
  try {
    const observer=observers.at(-1);assert.deepEqual(observer.targets.map(node=>node.dataset.deviceCard).sort(),["pc-1","pc-2"]);
    assert.deepEqual(globalThis.__rdStandbyLog,[],"cards outside viewport do not prepare");
    await act(async()=>observer.emit("pc-1"));assert.deepEqual(globalThis.__rdStandbyLog,[["prepare","pc-1"]]);
    await act(async()=>observer.emit("pc-2"));assert.equal(globalThis.__rdStandbyLog.length,1,"second visible card cannot accumulate another peer");
    visibility="hidden";await act(async()=>document.dispatchEvent(new Event("visibilitychange")));assert.deepEqual(globalThis.__rdStandbyLog.at(-1),["close","pc-1"]);
    visibility="visible";await act(async()=>document.dispatchEvent(new Event("visibilitychange")));assert.deepEqual(globalThis.__rdStandbyLog.at(-1),["prepare","pc-1"]);
    await act(async()=>observer.emit("pc-1",false));assert.deepEqual(globalThis.__rdStandbyLog.slice(-2),[["close","pc-1"],["prepare","pc-2"]]);
    statuses["pc-1"]={...eligible,standby_allowed:false};statuses["pc-2"]={...eligible,standby_allowed:false};await view.tick();
    assert.deepEqual(globalThis.__rdStandbyLog.at(-1),["close","pc-2"]);
    await view.click(view.host.querySelector('[data-remote-device-icon="pc-1"]'));assert.ok(document.querySelector("[data-oceanleo-remote-desktop]"));assert.deepEqual(remote.log.create,["pc-1"]);
  } finally {await view.unmount();}
  assert.deepEqual(errors,[],"real page loading, permission updates and desktop click must not emit React errors");
});
