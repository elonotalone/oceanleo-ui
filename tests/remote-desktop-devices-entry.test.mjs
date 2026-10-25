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

const stubs = {
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
  "./CloudComputersPage": dataModule(`
    export function CloudComputersSection() { return null; }
    export function CloudComputersPage() { return null; }
  `),
  "../shell/cloud-computer/CreateComputerDialog": dataModule(`export function CreateComputerDialog() { return null; }`),
  "../shell/cloud-computer/ConnectServerDialog": dataModule(`export function ConnectServerDialog() { return null; }`),
};
const { DevicesPage } = await import(await compileModule("src/pages/DevicesPage.tsx", stubs));

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
      assert.ok(document.querySelector("[data-remote-error]"));
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

test("desktop opens over Devices without route change and closes its session once", async () => {
  const remote = rdClient({ "pc-1": { ...READY, availability: "online" } });
  const view = await render([device()], remote);
  try {
    const before = window.location.href;
    await view.click(view.enter());
    await view.tick(60);
    assert.ok(document.querySelector("[data-oceanleo-remote-desktop]"));
    assert.equal(window.location.href, before);
    await view.click(view.button("断开"));
    assert.deepEqual(remote.log.closes, ["s-1"]);
    assert.equal(document.querySelector("[data-oceanleo-remote-desktop]"), null);
    assert.ok(view.enter());
  } finally { await view.unmount(); }
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
