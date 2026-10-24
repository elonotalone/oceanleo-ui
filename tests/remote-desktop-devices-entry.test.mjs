import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { document, window } from "./helpers/remote-desktop-dom.mjs";
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

async function render(list, remote) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(DevicesPage, { client: devicesClient(list), remoteDesktopClient: remote }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    entries: () => [...host.querySelectorAll("[data-oceanleo-remote-entry]")],
    enter: () => [...host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "进入桌面"),
    button: (label) => [...host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === label),
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

test("电脑卡出现「进入桌面」：新客户端、已开启、在线 ⇒ 可点", async () => {
  const remote = rdClient({ "pc-1": READY });
  const view = await render([device()], remote);
  assert.equal(view.entries().length, 1);
  assert.equal(view.enter().disabled, false);
  assert.match(view.text(), /查看这台电脑的屏幕/);
  await view.unmount();
});

test("离线：说明离线，按钮禁用，也不去问状态", async () => {
  const remote = rdClient({});
  const view = await render([device({ online: false })], remote);
  assert.equal(view.enter().disabled, true);
  assert.match(view.entries()[0].textContent, /不在线/);
  assert.equal(remote.log.status.length, 0);
  await view.unmount();
});

test("旧客户端（未上报支持）与本机未允许各自说明，网页没有替电脑打开权限的按钮", async () => {
  const remote = rdClient({
    "pc-1": { supported: false, enabled: false, online: true, session_id: null },
    "pc-2": { supported: true, enabled: false, online: true, session_id: null },
  });
  const view = await render(
    [device(), device({ device_id: "pc-2", device_name: "办公室", platform: "macos" })],
    remote,
  );
  const [first, second] = view.entries();
  assert.match(first.textContent, /还不支持远程桌面/);
  assert.equal(first.getAttribute("data-remote-blocker"), "unsupported");
  assert.match(second.textContent, /只能在那台电脑的 OceanLeo 里打开/);
  assert.equal(second.getAttribute("data-remote-blocker"), "disabled");
  assert.ok(view.host.querySelectorAll("button:disabled").length >= 2);
  assert.equal(view.button("开启"), undefined);
  assert.equal(create(remote), 0);
  await view.unmount();
});

function create(remote) {
  return remote.log.create.length;
}

test("手机是控制端：Android / iOS / 鸿蒙卡片不出现入口，也不查状态", async () => {
  const remote = rdClient({});
  const view = await render(
    [
      device({ device_id: "p1", platform: "android" }),
      device({ device_id: "p2", platform: "ios" }),
      device({ device_id: "p3", platform: "harmony" }),
    ],
    remote,
  );
  assert.equal(view.entries().length, 0);
  assert.equal(remote.log.status.length, 0);
  await view.unmount();
});

test("状态查不到（网络/旧网关）时不替用户下结论：按钮仍可点，由会话接口给明确原因", async () => {
  const remote = rdClient({});
  const view = await render([device()], remote);
  assert.equal(view.enter().disabled, false);
  assert.equal(view.entries()[0].getAttribute("data-remote-blocker"), "");
  await view.unmount();
});

test("已有活跃会话时说明占用", async () => {
  const remote = rdClient({ "pc-1": { ...READY, session_id: "other" } });
  const view = await render([device()], remote);
  assert.match(view.text(), /已有一个正在进行的远程会话/);
  await view.unmount();
});

test("点击就地打开查看面板（不换路由），断开后回到卡片入口并关闭会话", async () => {
  const remote = rdClient({ "pc-1": READY });
  const view = await render([device()], remote);
  const before = window.location.href;
  await view.click(view.enter());
  await act(async () => {
    await wait(60);
  });
  assert.ok(view.host.querySelector("[data-oceanleo-remote-desktop]"), "面板就地出现");
  assert.equal(window.location.href, before);
  assert.deepEqual(remote.log.create, ["pc-1"]);
  assert.match(view.text(), /「工作室」的桌面/);
  // 配对 / 改名 / 撤销仍在
  assert.ok(view.button("改名"));
  assert.ok(view.button("撤销设备"));

  await view.click(view.button("断开"));
  assert.deepEqual(remote.log.closes, ["s-1"]);
  assert.equal(view.host.querySelector("[data-oceanleo-remote-desktop]"), null);
  assert.ok(view.enter(), "回到入口");
  await view.unmount();
});

test("同一时刻只打开一台电脑的桌面", async () => {
  const remote = rdClient({ "pc-1": READY, "pc-2": READY });
  const view = await render(
    [device(), device({ device_id: "pc-2", device_name: "办公室", platform: "linux" })],
    remote,
  );
  const [first] = [...view.host.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "进入桌面");
  await view.click(first);
  await act(async () => {
    await wait(30);
  });
  assert.equal(view.host.querySelectorAll("[data-oceanleo-remote-desktop]").length, 1);
  await view.unmount();
});

test("卸载设备页会取消在途状态请求", async () => {
  const remote = rdClient({ "pc-1": READY });
  const view = await render([device()], remote);
  const signal = remote.log.status[0].signal;
  assert.equal(signal.aborted, false);
  await view.unmount();
  assert.equal(signal.aborted, true);
});

test("设备页仍不含生成配对码、远程改开关、设备密钥的路径", async () => {
  const source = await readFile(resolve("src/pages/DevicesPage.tsx"), "utf8");
  assert.ok(!source.includes("device_secret"));
  assert.ok(!source.includes("local_exec_enabled: true"));
  assert.ok(!source.includes("remote_desktop_enabled"));
  assert.ok(!source.includes("enableRemote"));
});
