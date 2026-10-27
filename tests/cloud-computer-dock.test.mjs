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
  url: "https://oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  CustomEvent: window.CustomEvent,
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
const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const domainStubUrl = dataModule(`
  export function currentDomainFamily() { return globalThis.__ccDomainFamily || "com"; }
  export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
  export function portalHref(path) { return window.location.origin === "https://oceanleo.com" ? path : "https://oceanleo.com" + path; }
`);
const dialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CreateComputerDialog() { return null; }
  export function ConnectServerDialog() { return null; }
`);
const popoverStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AnchoredPopover({ open, children, attributes }) {
    if (!open) return null;
    return React.createElement("div", { ...(attributes || {}), "data-anchored-popover": "1" }, children);
  }
`);
const navStubUrl = dataModule(`
  export function useRouter() {
    return globalThis.__ccRouter || { push() {}, replace() {}, refresh() {}, back() {} };
  }
`);

let storedMounted = "";
const apiStubUrl = dataModule(`
  export const cloudComputerApi = globalThis.__ccApi;
  export function readMountedComputerId() { return globalThis.__ccMounted || ""; }
  export function writeMountedComputerId(id) { globalThis.__ccMounted = id || ""; }
  export function writeMountedComputerName(name) { globalThis.__ccMountedName = name || ""; }
  export function isMountable(computer) {
    return (computer.status === "active" || computer.status === "running") && Boolean(computer.confirmed_at);
  }
`);

const { ComputerDock } = await import(
  await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
    "../../i18n/ui/useUI": uiTextStubUrl,
    "../../contracts/domain-family": domainStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
    "../../api/devices": dataModule(`
      export function listDevices() { return Promise.resolve({ ok: true, data: globalThis.__ccDevices || [] }); }
    `),
    "../../lib/auth/client": dataModule(`export async function getUserId() { return globalThis.__ccOwner ?? null; }`),
    "../account/SettingsModalHost": dataModule(`export function openSettingsModal(tab) { globalThis.__openSettingsTab = tab; }`),
    "./CreateComputerDialog": dialogStubUrl,
    "./ConnectServerDialog": dialogStubUrl,
    "../anchored-popover": popoverStubUrl,
    "next/navigation": navStubUrl,
  })
);

const { pickMountedId, newShellEnabled } = await import(
  await compileModule("src/shell/cloud-computer/useCloudComputers.ts", {
    "../../lib/cloud-computer-api": apiStubUrl,
  })
);
const { readExecutionTarget, writeExecutionTarget } = await import("../src/lib/execution-target.ts");

test.beforeEach(() => { window.localStorage.clear(); globalThis.__ccOwner = "account-a"; globalThis.__ccDevices = []; globalThis.__ccRouter = { push() {}, replace() {}, refresh() {}, back() {} }; });

function pc(overrides = {}) {
  return {
    id: "cc_1",
    name: "新加坡",
    source: "aliyun",
    status: "running",
    edition: "com",
    node_online: true,
    enrolled_at: "2026-09-20T00:00:00Z",
    confirmed_at: "2026-09-20T00:00:00Z",
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

function makeClient(items, openImpl) {
  return {
    async listComputers() {
      return { items: items.map((item) => ({ ...item })) };
    },
    async openTerminal(id, body) {
      if (openImpl) return openImpl(id, body);
      return { id: "sid_1", task_id: "task_1" };
    },
  };
}

async function flush(count = 6) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function render(computers, client = makeClient(computers || []), props = {}) {
  globalThis.__ccApi = client;
  globalThis.__ccMounted = storedMounted;
  if (!globalThis.__ccRouter) {
    globalThis.__ccRouter = { push() {}, replace() {}, refresh() {}, back() {} };
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ComputerDock, { client, ...(computers ? { computers } : {}), ...props }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    button(label) {
      return [...host.querySelectorAll("button")].find(
        (node) => { const content = node.cloneNode(true); for (const decorative of content.querySelectorAll('[aria-hidden="true"], [aria-hidden=""]')) decorative.remove(); return (content.textContent || "").trim() === label; },
      );
    },
    async click(node) { assert.ok(node, "expected target control"); await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true }))); await flush(); },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function openDock(view) {
  const btn = view.host.querySelector("[data-oceanleo-cc-dock-trigger]");
  assert.ok(btn, "找不到设备按钮");
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  return btn;
}

test("pickMountedId：零台已接入 → 未挂载", () => {
  assert.equal(pickMountedId([], "cc_1"), null);
  assert.equal(pickMountedId([pc({ status: "released" })], null), null);
  assert.equal(
    pickMountedId(
      [pc({ status: "enrolled", confirmed_at: null, enrolled_at: "t" })],
      null,
    ),
    null,
  );
});

test("pickMountedId：恰一台 ready → 自动挂那台", () => {
  const a = pc({ id: "cc_a", node_online: true });
  const b = pc({ id: "cc_b", node_online: false });
  assert.equal(pickMountedId([a, b], "cc_b"), "cc_a");
});

test("pickMountedId：多台 ready → 上次选择，没有则第一台 ready", () => {
  const a = pc({ id: "cc_a", node_online: true });
  const b = pc({ id: "cc_b", node_online: true });
  assert.equal(pickMountedId([a, b], "cc_b"), "cc_b");
  assert.equal(pickMountedId([a, b], null), "cc_a");
  assert.equal(pickMountedId([a, b], "missing"), "cc_a");
});

test("no machine does not imply auto-selection: picker has Cloud/Local columns and Manage", async () => {
  const view = await render([]);
  try {
    assert.equal(view.host.querySelector("[data-execution-target]").getAttribute("data-execution-target"), "cloud");
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-trigger]").textContent.trim(), "云端");
    await openDock(view);
    assert.ok(view.text().includes("在此设备上运行任务"));
    assert.ok(view.text().includes("本地电脑"));
    assert.ok(view.button("管理设备"));
    const columns = [...view.host.querySelectorAll("div")].find((node) => node.classList.contains("grid") && [...node.classList].some((name) => name.startsWith("grid-cols-")));
    assert.ok(columns);
    assert.equal(columns.children.length, 2);
    assert.match(columns.children[0].textContent, /本地电脑/);
    assert.match(columns.children[1].textContent, /默认云端/);
    assert.equal(view.button("新建 Shell"), undefined);
  } finally { view.cleanup(); }
});

test("pending, unconfirmed and legacy rows never become executable choices", async () => {
  const pending = pc({ id: "pending", status: "provisioning", enrolled_at: null, confirmed_at: null });
  const enrolled = pc({ id: "enrolled", status: "enrolled", confirmed_at: null });
  const legacy = pc({ id: "legacy", status: "active", enrolled_at: null, confirmed_at: null });
  assert.equal(pickMountedId([pending, enrolled, legacy], null), null);
  const view = await render([pending, enrolled, legacy]);
  try {
    await openDock(view);
    assert.equal(view.host.querySelectorAll("[data-oceanleo-cc-switch-item]").length, 0);
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "cloud" });
  } finally { view.cleanup(); }
});

test("selecting a ready cloud computer changes actual persisted target, not location or a Shell task", async () => {
  const pushes = [];
  globalThis.__ccRouter.push = (href) => pushes.push(href);
  let terminals = 0;
  const client = makeClient([pc()], async () => { terminals += 1; });
  const selected = [];
  const view = await render([pc()], client, { onTargetChange: (target) => selected.push(target) });
  try {
    await openDock(view);
    await view.click(view.host.querySelector('[data-oceanleo-cc-switch-item="cc_1"]'));
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "computer", id: "cc_1", name: "新加坡" });
    assert.equal(globalThis.__ccMounted, "cc_1");
    assert.equal(globalThis.__ccMountedName, "新加坡");
    assert.deepEqual(pushes, []);
    assert.equal(terminals, 0);
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-trigger]").textContent, "新加坡");
    assert.deepEqual(selected.at(-1), { kind: "computer", id: "cc_1", name: "新加坡" }, "submit snapshot receives the real selection immediately");
    await openDock(view);
    assert.equal(view.host.querySelector('[data-oceanleo-cc-switch-item="cc_1"]').getAttribute("aria-pressed"), "true");
  } finally { view.cleanup(); }
});

test("offline cloud computers are visible but disabled; legacy shell utility keeps its contract", async () => {
  const offline = pc({ node_online: false });
  assert.equal(newShellEnabled(offline), false);
  const view = await render([offline]);
  try {
    await openDock(view);
    const row = view.host.querySelector('[data-oceanleo-cc-switch-item="cc_1"]');
    assert.equal(row.disabled, true);
    await view.click(row);
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "cloud" });
    assert.match(row.textContent, /离线/);
  } finally { view.cleanup(); }
});

test("local selection requires authenticated availability, not a raw heartbeat or phone", async () => {
  globalThis.__ccDevices = [
    { device_id: "ready-pc", platform: "windows", device_name: "Ready PC", online: true, availability: "online" },
    { device_id: "signed-out", platform: "macos", device_name: "Signed Out Mac", online: true, availability: "signed_out" },
    { device_id: "offline", platform: "linux", device_name: "Offline PC", online: false, availability: "offline" },
    { device_id: "legacy", platform: "windows", device_name: "Heartbeat Only", online: true },
    { device_id: "phone", platform: "ios", device_name: "iPhone", online: true, availability: "online" },
  ];
  const view = await render([]);
  try {
    await openDock(view);
    await view.click([...view.host.querySelectorAll("button")].find((button) => button.textContent.includes("本地电脑")));
    assert.equal(view.host.querySelectorAll("[data-oceanleo-device-client]").length, 4);
    assert.equal(view.host.querySelector('[data-oceanleo-device-client="ready-pc"]').disabled, false);
    for (const id of ["signed-out", "offline", "legacy"]) assert.equal(view.host.querySelector('[data-oceanleo-device-client="' + id + '"]').disabled, true);
    assert.match(view.host.querySelector('[data-oceanleo-device-client="signed-out"]').textContent, /未登录/);
    await view.click(view.host.querySelector('[data-oceanleo-device-client="ready-pc"]'));
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "device", id: "ready-pc", name: "Ready PC" });
    assert.equal(globalThis.__ccMounted, "");
    assert.equal(globalThis.__ccMountedName, "");
    await openDock(view);
    assert.equal(view.host.querySelector('[data-oceanleo-device-client="ready-pc"]').getAttribute("aria-pressed"), "true");
  } finally { view.cleanup(); }
});

test("returning to default Cloud clears stale legacy mount fields and retains explicit cloud choice", async () => {
  writeExecutionTarget("account-a", { kind: "computer", id: "cc_1", name: "Saved" });
  const view = await render([pc()]);
  try {
    await openDock(view);
    await view.click([...view.host.querySelectorAll("button")].find((button) => button.textContent.startsWith("默认云端")));
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "cloud" });
    assert.equal(globalThis.__ccMounted, "");
    assert.equal(globalThis.__ccMountedName, "");
  } finally { view.cleanup(); }
});

test("account switch restores only that account's execution target and clears a prior open menu", async () => {
  writeExecutionTarget("account-a", { kind: "device", id: "pc-a", name: "A PC" });
  writeExecutionTarget("account-b", { kind: "computer", id: "cc_b", name: "B PC" });
  const view = await render([pc()]);
  try {
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-trigger]").textContent, "A PC");
    await openDock(view);
    globalThis.__ccOwner = "account-b";
    await act(async () => window.dispatchEvent(new window.CustomEvent("oceanleo:auth-state", { detail: { userId: "account-b" } })));
    await flush();
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-trigger]").textContent, "B PC");
    assert.equal(view.host.querySelector("[data-anchored-popover]"), null);
    assert.equal(readExecutionTarget("account-a").name, "A PC");
    globalThis.__ccOwner = null;
    await act(async () => window.dispatchEvent(new window.CustomEvent("oceanleo:auth-state", { detail: { userId: null } })));
    await flush();
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-trigger]").textContent, "云端");
    await openDock(view);
    assert.ok(view.text().includes("请先登录"));
    assert.equal(view.host.querySelector("[data-oceanleo-cc-switch-item]"), null);
  } finally { view.cleanup(); }
});

test("Manage devices is the only navigation, uses canonical Devices route on portal/subsite", async () => {
  const pushes = [];
  globalThis.__ccRouter.push = (href) => pushes.push(href);
  const view = await render([pc()]);
  try { await openDock(view); await view.click(view.button("管理设备")); assert.deepEqual(pushes, ["/devices"]); }
  finally { view.cleanup(); }
  dom.reconfigure({ url: "https://website.oceanleo.com/" });
  const subsite = await render([]);
  try { await openDock(subsite); await subsite.click(subsite.button("管理设备")); assert.equal(pushes.at(-1), "https://oceanleo.com/devices"); }
  finally { subsite.cleanup(); dom.reconfigure({ url: "https://oceanleo.com/" }); }
});

test("loading never invents another target or overwrites a remembered explicit selection", async () => {
  writeExecutionTarget("account-a", { kind: "computer", id: "saved", name: "Saved PC" });
  let finish;
  const client = { listComputers: () => new Promise((resolve) => { finish = resolve; }) };
  const view = await render(undefined, client);
  try {
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-trigger]").textContent, "Saved PC");
    await openDock(view);
    assert.ok(view.text().includes("加载中"));
    assert.equal(readExecutionTarget("account-a").id, "saved");
    await act(async () => finish({ items: [] }));
    await flush();
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-trigger]").textContent, "Saved PC", "unavailable selection never silently falls back");
    assert.equal(readExecutionTarget("account-a").id, "saved");
  } finally { view.cleanup(); }
});

test("cloud list failure still shows actual local devices and preserves a selected offline computer", async () => {
  globalThis.__ccDevices = [{ device_id: "saved-mac", platform: "macos", device_name: "Saved Mac", online: false, availability: "offline" }];
  writeExecutionTarget("account-a", { kind: "device", id: "saved-mac", name: "Saved Mac" });
  const view = await render(undefined, { async listComputers() { throw new Error("unavailable"); } });
  try {
    await openDock(view);
    const selected = view.host.querySelector('[data-oceanleo-device-client="saved-mac"]');
    assert.ok(selected);
    assert.equal(selected.disabled, true);
    assert.equal(selected.getAttribute("aria-pressed"), "true");
    assert.match(selected.textContent, /离线.*✓/);
    assert.deepEqual(readExecutionTarget("account-a"), { kind: "device", id: "saved-mac", name: "Saved Mac" });
  } finally { view.cleanup(); }
});

test("CN family has the same two-group execution choice and Manage entry", async () => {
  globalThis.__ccDomainFamily = "cn";
  const view = await render([]);
  try {
    await openDock(view);
    assert.ok(view.text().includes("本地电脑"));
    assert.ok(view.text().includes("默认云端"));
    assert.ok(view.button("管理设备"));
    assert.doesNotMatch(view.text(), /此功能在当前站点不可用/);
  } finally { view.cleanup(); globalThis.__ccDomainFamily = "com"; }
});

test("C5-T3a: a chosen computer with local execution off says so before Send, stays selectable, and cloud is untouched", async () => {
  globalThis.__ccDevices = [
    { device_id: "mac-off", platform: "macos", device_name: "Office Mac", online: true, availability: "online", local_exec_enabled: false },
    { device_id: "pc-on", platform: "windows", device_name: "Home PC", online: true, availability: "online", local_exec_enabled: true },
    { device_id: "legacy", platform: "linux", device_name: "Old Gateway", online: true, availability: "online" },
  ];
  writeExecutionTarget("account-a", { kind: "device", id: "mac-off", name: "Office Mac" });
  const view = await render([pc()]);
  const trigger = () => view.host.querySelector("[data-oceanleo-cc-dock-trigger]");
  try {
    assert.match(trigger().textContent, /^Office Mac本机执行未开启$/, "hint shows without opening the picker");
    assert.match(trigger().getAttribute("title"), /设备与授权.*允许云端下发本机任务/);
    assert.match(trigger().getAttribute("aria-label"), /本机执行未开启/);
    await openDock(view);
    const off = view.host.querySelector('[data-oceanleo-device-client="mac-off"]');
    assert.equal(off.disabled, false, "the switch lives on that computer; the row stays selectable");
    assert.equal(off.getAttribute("data-local-exec-off"), "true");
    assert.match(off.textContent, /本机执行未开启/);
    assert.equal(view.host.querySelector('[data-oceanleo-device-client="pc-on"]').getAttribute("data-local-exec-off"), null);
    assert.equal(view.host.querySelector('[data-oceanleo-device-client="legacy"]').getAttribute("data-local-exec-off"), null, "a missing field is not 'off'");
    assert.ok(view.host.querySelector("[data-local-exec-hint]"));
    await view.click(view.host.querySelector('[data-oceanleo-device-client="pc-on"]'));
    assert.equal(trigger().textContent, "Home PC");
    await openDock(view);
    await view.click([...view.host.querySelectorAll("button")].find((button) => button.textContent.includes("云端") && button.getAttribute("aria-expanded") !== null));
    await view.click([...view.host.querySelectorAll("button")].find((button) => button.textContent.startsWith("默认云端")));
    assert.equal(trigger().textContent, "云端");
    assert.equal(view.host.querySelector("[data-local-exec-off]"), null);
  } finally { view.cleanup(); }
});

test("C5-T3a: the hint clears when the page regains focus after the switch was turned on", async () => {
  globalThis.__ccDevices = [{ device_id: "mac", platform: "macos", device_name: "Mac", online: true, availability: "online", local_exec_enabled: false }];
  writeExecutionTarget("account-a", { kind: "device", id: "mac", name: "Mac" });
  const view = await render([]);
  try {
    assert.ok(view.host.querySelector("[data-oceanleo-cc-dock-trigger] [data-local-exec-off]"));
    globalThis.__ccDevices = [{ ...globalThis.__ccDevices[0], local_exec_enabled: true }];
    await act(async () => window.dispatchEvent(new window.Event("focus")));
    await flush();
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-trigger]").textContent, "Mac");
  } finally { view.cleanup(); }
});
