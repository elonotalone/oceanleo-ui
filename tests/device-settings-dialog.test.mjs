import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { document, window } from "./helpers/remote-desktop-dom.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

window.scrollTo = () => {};
const ui = dataModule(`export function useUI() { return (text, vars) => text.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{"+key+"}")); }`);
const { DeviceSettingsDialog } = await import(await compileModule("src/pages/devices/DeviceSettingsDialog.tsx", { "../../i18n/ui/useUI": ui }));
const { DeviceFolderPicker } = await import(await compileModule("src/pages/devices/DeviceFolderPicker.tsx", { "../../i18n/ui/useUI": ui }));

const device = { device_id: "mac-target", device_name: "My Mac", platform: "macos", availability: "online", online: true, local_exec_enabled: false, granted_kinds: ["read"], last_seen_at: null };
function fakeClient() {
  const calls = { revoke: [], expiry: [], operations: [], reads: 0 };
  const settings = { controller_id: "viewer-1", availability: "online", preferences_available: true, controllers: [{ grant_id: "grant-1", controller_id: "viewer-1", label: "Chrome · Windows", is_current: true, last_used_at: "2026-10-25T00:00:00Z", expires_at: null, created_at: "2026-10-25T00:00:00Z" }], roots: ["/allowed"], preferences: { default_task_directory: "/allowed/OceanLeo", task_folders: ["/allowed/Projects"] } };
  return { calls, settings,
    async getSettings() { calls.reads += 1; return { ok: true, data: structuredClone(settings) }; },
    async revokeController(id, grantId) { calls.revoke.push([id, grantId]); settings.controllers = []; return { ok: true }; },
    async shortenControllerExpiry(id, grantId, expiresAt) { calls.expiry.push([id, grantId, expiresAt]); settings.controllers[0].expires_at = expiresAt; return { ok: true }; },
    async startOperation(id, op) {
      calls.operations.push([id, op]);
      if (op.kind === "preferences.update") { settings.preferences = { default_task_directory: op.default_task_directory ?? "/allowed/OceanLeo", task_folders: op.task_folders }; return { ok: true, data: { state: "succeeded", result: { preferences: structuredClone(settings.preferences) } } }; }
      if (op.path === "/outside") return { ok: true, data: { state: "failed", error: "path_outside_grant" } };
      const listing = op.path === null ? { path: null, parent: null, entries: [{ name: "Allowed", path: "/allowed" }], roots: ["/allowed"] } : { path: op.path, parent: op.path === "/allowed" ? null : "/allowed", entries: op.path === "/allowed" ? [{ name: "Projects", path: "/allowed/Projects" }] : [], roots: ["/allowed"] };
      return { ok: true, data: { state: "succeeded", result: listing } };
    },
  };
}
async function flush() { for (let i = 0; i < 5; i += 1) await act(async () => {}); }
async function mount(Component, props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  await flush();
  return {
    text: () => document.body.textContent,
    button(label) { return [...document.querySelectorAll("button")].find((node) => node.textContent.trim().replace(/^[＋+]\s*/, "") === label); },
    async click(node) { assert.ok(node); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await flush(); },
    async input(node, value) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; await act(async () => { setter.call(node, value); node.dispatchEvent(new window.Event("input", { bubbles: true })); }); await flush(); },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

test("target details show real controller/current-device/expiry and revoke persists before refresh", async () => {
  const client = fakeClient();
  let control = 0;
  const view = await mount(DeviceSettingsDialog, { device, availability: "online", client, onClose() {}, onControl() { control += 1; }, onRename: async () => true, onRevoke() {} });
  try {
    assert.ok(view.text().includes("Chrome · Windows当前设备"));
    assert.ok(view.text().includes("永不过期"));
    assert.ok(view.text().includes("/allowed/OceanLeo"));
    await view.click(view.button("添加当前设备"));
    assert.equal(control, 1);
    await view.click(view.button("撤销"));
    assert.deepEqual(client.calls.revoke, [["mac-target", "grant-1"]]);
    assert.equal(client.calls.reads, 2);
    assert.ok(view.text().includes("暂无已授权设备"));
  } finally { view.cleanup(); }
});

test("expiry only shortens through the real endpoint, never grants permanent access on web", async () => {
  const client = fakeClient();
  const view = await mount(DeviceSettingsDialog, { device, availability: "online", client, onClose() {}, onControl() {}, onRename: async () => true, onRevoke() {} });
  try {
    await view.click(view.button("有效期"));
    assert.ok(document.querySelector('[data-device-dialog="controller-expiry"]'));
    assert.equal(view.button("永久同意"), undefined);
    await view.click(view.button("1 小时"));
    assert.equal(client.calls.expiry[0][0], "mac-target");
    assert.equal(client.calls.expiry[0][1], "grant-1");
    assert.ok(Date.parse(client.calls.expiry[0][2]) > Date.now());
    assert.equal(document.querySelector('[data-device-dialog="controller-expiry"]'), null);
  } finally { view.cleanup(); }
});

test("folder picker browses target's consented roots and saves target preferences without widening grants", async () => {
  const client = fakeClient();
  const view = await mount(DeviceSettingsDialog, { device, availability: "online", client, onClose() {}, onControl() {}, onRename: async () => true, onRevoke() {} });
  try {
    await view.click(view.button("修改"));
    assert.ok(document.querySelector('[data-device-dialog="folder-picker"]'));
    assert.ok(view.text().includes("My Mac"));
    await view.click(document.querySelector('[data-device-folder-path="/allowed"]'));
    assert.equal(document.querySelector('button[aria-label="上一级"]').disabled, true, "root boundary cannot go to target's parent");
    await view.click(document.querySelector('[data-device-folder-path="/allowed/Projects"]'));
    await view.click(view.button("使用此文件夹"));
    assert.equal(document.querySelector('[data-device-default-folder]').textContent, "/allowed/Projects");
    const last = client.calls.operations.at(-1);
    assert.deepEqual(last, ["mac-target", { kind: "preferences.update", default_task_directory: "/allowed/Projects", task_folders: ["/allowed/Projects"] }]);
    assert.ok(client.calls.operations.every(([id]) => id === "mac-target"));
    assert.equal(client.settings.controllers.length, 1, "changing a folder never creates or widens controller grants");
  } finally { view.cleanup(); }
});

test("out-of-grant target path fails closed and cannot be selected", async () => {
  const client = fakeClient();
  const selected = [];
  const view = await mount(DeviceFolderPicker, { deviceId: "mac-target", deviceName: "My Mac", title: "Add folder", client, onSelect: (path) => selected.push(path), onClose() {} });
  try {
    await view.input(document.querySelector('input[aria-label="文件夹路径"]'), "/outside");
    await view.click(view.button("前往"));
    assert.ok(view.text().includes("这个文件夹未获授权。"));
    assert.equal(view.button("使用此文件夹").disabled, true);
    assert.deepEqual(selected, []);
  } finally { view.cleanup(); }
});

test("Escape closes only the nested folder picker and restores focus to target details", async () => {
  const client = fakeClient();
  let closed = 0;
  const view = await mount(DeviceSettingsDialog, { device, availability: "online", client, onClose() { closed += 1; }, onControl() {}, onRename: async () => true, onRevoke() {} });
  try {
    await view.click(view.button("添加文件夹"));
    const picker = document.querySelector('[data-device-dialog="folder-picker"]');
    await act(async () => picker.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    await flush();
    assert.equal(document.querySelector('[data-device-dialog="folder-picker"]'), null);
    assert.ok(document.querySelector('[data-device-dialog="settings"]'));
    assert.equal(closed, 0);
  } finally { view.cleanup(); }
});
