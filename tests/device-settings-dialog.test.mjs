import assert from "node:assert/strict";
import test from "node:test";

test.beforeEach((t) => {
  t.mock.method(console, "error", (...args) => {
    // jsdom 20 cannot parse the existing overlay @starting-style rule. React errors still fail.
    if (String(args[0]).startsWith("Error: Could not parse CSS stylesheet") && String(args[1]).includes("@starting-style")) return;
    assert.fail(args.map(String).join(" "));
  });
});
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { document, window } from "./helpers/remote-desktop-dom.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

window.scrollTo = () => {};
const ui = dataModule(`export function useUI() { return (text, vars) => text.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{"+key+"}")); }`);
const { DeviceSettingsDialog } = await import(await compileModule("src/pages/devices/DeviceSettingsDialog.tsx", { "../../i18n/ui/useUI": ui }));
const { DeviceSettingsSection, DeviceSettingsPanel } = await import(await compileModule("src/pages/settings/DeviceSettingsSection.tsx", { "../../i18n/ui/useUI": ui }));
const { DeviceFolderPicker } = await import(await compileModule("src/pages/devices/DeviceFolderPicker.tsx", { "../../i18n/ui/useUI": ui }));

const device = { device_id: "mac-target", device_name: "My Mac", platform: "macos", availability: "online", online: true, local_exec_enabled: false, granted_kinds: ["read"], last_seen_at: null };
function fakeClient() {
  const calls = { revoke: [], expiry: [], operations: [], reads: 0 };
  const settings = { controller_id: "viewer-1", availability: "online", preferences_available: true, controllers: [{ grant_id: "grant-1", controller_id: "viewer-1", label: "Chrome · Windows", is_current: true, last_used_at: "2026-10-25T00:00:00Z", expires_at: null, created_at: "2026-10-25T00:00:00Z" }], roots: ["/allowed"], preferences: { default_task_directory: "/allowed/OceanLeo", task_folders: ["/allowed/Projects"] }, remote_access: { enabled: false, input_allowed: true, expires_at: null, agent_control_allowed: false, agent_always_ask: true } };
  return { calls, settings,
    async getSettings() { calls.reads += 1; return { ok: true, data: structuredClone(settings) }; },
    async revokeController(id, grantId) { calls.revoke.push([id, grantId]); settings.controllers = []; return { ok: true }; },
    async shortenControllerExpiry(id, grantId, expiresAt) { calls.expiry.push([id, grantId, expiresAt]); settings.controllers[0].expires_at = expiresAt; return { ok: true }; },
    async startOperation(id, op) {
      calls.operations.push([id, op]);
      if (op.kind === "preferences.update") { settings.preferences = { default_task_directory: op.default_task_directory ?? "/allowed/OceanLeo", task_folders: op.task_folders }; return { ok: true, data: { state: "succeeded", result: { preferences: structuredClone(settings.preferences) } } }; }
      if (op.kind === "remote_access.update") { settings.remote_access = { ...settings.remote_access, ...op, expires_at: null }; delete settings.remote_access.kind; return { ok: true, data: { state: "succeeded", result: { remote_access: structuredClone(settings.remote_access) } } }; }
      if (op.kind === "remote_access.preferences.update") { const {kind: _kind, ...fields} = op; settings.remote_access = {...settings.remote_access, ...fields}; return {ok: true, data: {state: "succeeded", result: {remote_access: structuredClone(fields)}}}; }
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
    agentSwitch() { return document.querySelector('button[role="switch"][aria-label="允许远程 Agent 控制"]'); },
    button(label) { return [...document.querySelectorAll("button")].find((node) => node.textContent.trim().replace(/^[＋+]\s*/, "") === label); },
    async click(node) { assert.ok(node); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await flush(); },
    async input(node, value) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; await act(async () => { setter.call(node, value); node.dispatchEvent(new window.Event("input", { bubbles: true })); }); await flush(); },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

// UC-NONE
// Controller grant display and revocation are first-party device policy, outside the UGC browser and new-table isolation rules.
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

test("device settings persist both Agent policy switches through the target operation", async () => {
  const client = fakeClient();
  const view = await mount(DeviceSettingsDialog, { device, availability: "online", client, onClose() {}, onControl() {}, onRename: async () => true, onRevoke() {} });
  try {
    const switches = [...document.querySelectorAll('button[role="switch"]')];
    assert.equal(switches.length, 4);
    await view.click(switches[2]);
    assert.deepEqual(client.calls.operations.at(-1), ["mac-target", { kind: "remote_access.update", agent_control_allowed: true }]);
  } finally { view.cleanup(); }
});

test("owner enables remote access with a Settings switch and no duration", async () => {
  const client = fakeClient();
  const view = await mount(DeviceSettingsDialog, { device, availability: "online", client, onClose() {}, onControl() {}, onRename: async () => true, onRevoke() {} });
  try {
    await view.click([...document.querySelectorAll('button[role="switch"]')][0]);
    assert.deepEqual(client.calls.operations.at(-1), ["mac-target", { kind: "remote_access.preferences.update", enabled: true }]);
    assert.equal(document.querySelector('input[type="checkbox"]'), null);
    assert.equal(document.querySelector('select[aria-label="允许时长"]'), null);
  } finally { view.cleanup(); }
});

// UC-NONE
// This protects native-controller consent from web-side extension; it does not assert a UGC origin boundary or a new database table's policy.
test("controller expiry remains reported state with revoke, without a duration choice or grant widening", async () => {
  const client = fakeClient();
  client.settings.controllers[0].expires_at = "2026-12-25T12:00:00Z";
  const view = await mount(DeviceSettingsDialog, { device, availability: "online", client, onClose() {}, onControl() {}, onRename: async () => true, onRevoke() {} });
  try {
    assert.ok(view.text().includes("有效期至"));
    assert.equal(view.button("有效期"), undefined);
    assert.equal(view.button("永久同意"), undefined);
    assert.deepEqual(client.calls.expiry, []);
    await view.click(view.button("撤销"));
    assert.deepEqual(client.calls.revoke, [["mac-target", "grant-1"]]);
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

// UC-NONE
// Native-device folder consent limits path selection; this is separate from UGC origin, iframe and database-table isolation.
test("out-of-grant target path fails closed and cannot be selected", async () => {
  const client = fakeClient();
  const selected = [];
  const view = await mount(DeviceFolderPicker, { deviceId: "mac-target", deviceName: "My Mac", title: "Add folder", client, onSelect: (path) => selected.push(path), onClose() {} });
  try {
    await view.input(document.querySelector('input[aria-label="文件夹路径"]'), "/outside");
    await view.click(view.button("前往"));
    assert.ok(view.text().includes("这个文件夹未获授权。"));
    assert.ok(view.button("授权这个文件夹"));
    assert.equal(view.button("使用此文件夹").disabled, true);
    assert.deepEqual(selected, []);
  } finally { view.cleanup(); }
});

test("granting a typed folder retries Go and leaves the existing default-save action usable", async () => {
  const operations = [];
  let denied = true;
  const client = {
    async startOperation(id, operation) {
      operations.push(operation);
      if (operation.kind === "folders.grant") return { ok: true, data: { state: "succeeded", result: { grant: { path: "/outside" }, roots: ["/outside"] } } };
      if (operation.kind === "folders.list" && operation.path === "/outside" && denied) {
        denied = false;
        return { ok: true, data: { state: "failed", error: "path_outside_grant" } };
      }
      const path = operation.path;
      return { ok: true, data: { state: "succeeded", result: { path, parent: null, entries: [], roots: path ? [path] : [] } } };
    },
    async getOperation() { throw new Error("poll not expected for immediate receipts"); },
  };
  const selected = [];
  const view = await mount(DeviceFolderPicker, { deviceId: "mac-target", deviceName: "My Mac", title: "Add folder", client, onSelect: (path) => selected.push(path), onClose() {} });
  try {
    await view.input(document.querySelector('input[aria-label="文件夹路径"]'), "/outside");
    await view.click(view.button("前往"));
    assert.ok(view.button("授权这个文件夹"));
    await view.click(view.button("授权这个文件夹"));
    assert.deepEqual(operations.slice(-2), [
      { kind: "folders.grant", path: "/outside" },
      { kind: "folders.list", path: "/outside" },
    ]);
    assert.equal(view.button("使用此文件夹").disabled, false);
    await view.click(view.button("使用此文件夹"));
    assert.deepEqual(selected, ["/outside"]);
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

test("device controls render inside the existing Settings pane and device removal keeps its confirmation", async () => {
  const client = fakeClient();
  const removals = [];
  const view = await mount(DeviceSettingsSection, { client: {
    async listDevices() { return {ok: true, data: [device]}; },
    async revokeDevice(id) { removals.push(id); return {ok: true}; },
  }, settingsClient: client });
  try {
    assert.ok(document.querySelector('[data-settings-pane="device-settings"]'));
    assert.ok(document.querySelector('[data-device-settings-panel="mac-target"]'));
    assert.equal(document.querySelector('[data-device-dialog="settings"]'), null);
    assert.equal(document.querySelector('input[type="checkbox"]'), null);
    assert.equal(document.querySelectorAll('button[role="switch"]').length, 4);
    assert.equal(document.querySelector("[data-revoke-agent-control]"), null);
    assert.equal(view.button("撤销 Agent 控制"), undefined);
    await view.click(view.button("撤销设备"));
    assert.ok(view.text().includes("撤销后这台电脑立刻不再接收任何任务，需要重新配对。"));
    assert.deepEqual(removals, []);
    await view.click(view.button("确认撤销"));
    assert.deepEqual(removals, ["mac-target"]);
    assert.ok(view.text().includes("还没有连接设备。"));
  } finally { view.cleanup(); }
});

// UC-NONE
// This fences stale first-party consent reads after owner revocation, without loading UGC or crossing a browser trust boundary.
test("Settings revoke is one click, preserves owner access, and rejects a pre-mutation stale poll", async (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const client = fakeClient();
  client.settings.remote_access.enabled = true;
  client.settings.remote_access.agent_control_allowed = true;
  let staleReply;
  const read = client.getSettings;
  client.getSettings = (...args) => client.calls.reads === 0 ? read(...args) : new Promise((resolve) => { staleReply = resolve; });
  const view = await mount(DeviceSettingsPanel, {device, availability: "online", client, onControl() {}, onRename: async () => true, onRevoke() {}});
  try {
    const oldSettings = structuredClone(client.settings);
    await act(async () => t.mock.timers.tick(5_000));
    await flush();
    assert.equal(typeof staleReply, "function", "the old poll must be in flight before revoke");
    await view.click(view.agentSwitch());
    assert.deepEqual(client.calls.operations, [["mac-target", {kind: "remote_access.update", agent_control_allowed: false}]]);
    assert.ok(view.text().includes("Agent 控制已撤销。"));
    const agentSwitch = document.querySelector('button[role="switch"][aria-label="允许远程 Agent 控制"]');
    assert.equal(agentSwitch.getAttribute("aria-checked"), "false");
    await act(async () => staleReply({ok: true, data: oldSettings}));
    await flush();
    assert.equal(agentSwitch.getAttribute("aria-checked"), "false", "a stale read cannot restore withdrawn consent");
    assert.equal(client.settings.remote_access.enabled, true);
  } finally { view.cleanup(); }
});

test("Settings ignores same-account token refresh and cancels private state on an account switch", async () => {
  const settingsClient = fakeClient();
  settingsClient.settings.remote_access.agent_control_allowed = true;
  let userId = "owner-a";
  let reads = 0;
  let aborted = 0;
  let lateReply;
  settingsClient.startOperation = (_id, _operation, signal) => new Promise((resolve) => {
    lateReply = resolve;
    signal.addEventListener("abort", () => { aborted += 1; }, {once: true});
  });
  const view = await mount(DeviceSettingsSection, {
    currentUser: async () => ({known: true, userId}),
    client: {async listDevices() { reads += 1; return {ok: true, data: [{...device, device_id: userId, device_name: userId}]}; }},
    settingsClient,
  });
  try {
    await view.click(view.agentSwitch());
    await act(async () => window.dispatchEvent(new window.CustomEvent("oceanleo:auth-state", {detail: {userId}})));
    await flush();
    assert.equal(reads, 1, "token renewal must not restart device loading");
    assert.equal(aborted, 0, "token renewal must not cancel a consent mutation");
    assert.ok(document.querySelector('[data-device-settings-panel="owner-a"]'));
    userId = "owner-b";
    await act(async () => window.dispatchEvent(new window.CustomEvent("oceanleo:auth-state", {detail: {userId}})));
    await flush();
    assert.equal(aborted, 1);
    assert.equal(document.querySelector('[data-device-settings-panel="owner-a"]'), null);
    assert.ok(document.querySelector('[data-device-settings-panel="owner-b"]'));
    await act(async () => lateReply({ok: true, data: {state: "succeeded", result: {remote_access: {...settingsClient.settings.remote_access, agent_control_allowed: false}}}}));
    await flush();
    assert.ok(!view.text().includes("Agent 控制已撤销。"), "the old account's reply cannot change the new account's pane");
  } finally { view.cleanup(); }
});

// UC-NONE
// Partial offline consent receipts must preserve existing device preferences; no UGC origin or database schema is involved.
test("offline Settings revoke merges only confirmed partial fields and keeps own/input/Ask values", async () => {
  const client = fakeClient();
  client.settings.remote_access = {enabled: true, input_allowed: false, agent_control_allowed: true, agent_always_ask: false, expires_at: 42};
  client.startOperation = async (id, operation) => {
    client.calls.operations.push([id, operation]);
    return {ok: true, data: {state: "pending", operation_id: "offline-revoke", revocation_effective: true, device_sync_pending: true, result: {remote_access: {agent_control_allowed: false, expires_at: null}}}};
  };
  client.getOperation = () => { throw new Error("offline revoke must not wait for the target"); };
  const view = await mount(DeviceSettingsPanel, {device, availability: "offline", client, onControl() {}, onRename: async () => true, onRevoke() {}});
  try {
    assert.equal(view.agentSwitch().disabled, false);
    await view.click(view.agentSwitch());
    assert.deepEqual(client.calls.operations, [["mac-target", {kind: "remote_access.update", agent_control_allowed: false}]]);
    const checked = (label) => document.querySelector(`button[role="switch"][aria-label="${label}"]`).getAttribute("aria-checked");
    assert.equal(checked("允许远程访问"), "true");
    assert.equal(checked("允许操作屏幕（查看、点击、输入）"), "false");
    assert.equal(checked("每次询问"), "false");
    assert.equal(checked("允许远程 Agent 控制"), "false");
    assert.ok(view.text().includes("Agent 控制权限已撤销。设备重新连接后会同步。"));
    assert.ok(!view.text().includes("Agent 控制已撤销。"), "pending device sync is not presented as an applied target ACK");
    assert.equal(view.agentSwitch().disabled, true, "OFF cannot be turned back ON while offline");
  } finally { view.cleanup(); }
});

test("a missing Settings policy shows retry without inventing an Agent switch state", async () => {
  const client = fakeClient();
  const read = client.getSettings;
  let unavailable = true;
  client.getSettings = (...args) => unavailable ? Promise.resolve({ok: false, error: "network_error"}) : read(...args);
  client.settings.remote_access.agent_control_allowed = true;
  const view = await mount(DeviceSettingsPanel, {device, availability: "offline", client, onControl() {}, onRename: async () => true, onRevoke() {}});
  try {
    assert.equal(view.agentSwitch(), null);
    assert.equal(view.button("撤销 Agent 控制"), undefined);
    assert.ok(document.querySelector('[role="alert"]'));
    unavailable = false;
    await view.click(view.button("重试"));
    assert.equal(view.agentSwitch().disabled, false);
    await view.click(view.agentSwitch());
    assert.deepEqual(client.calls.operations, [["mac-target", {kind: "remote_access.update", agent_control_allowed: false}]]);
  } finally { view.cleanup(); }
});

test("Agent OFF cannot be switched ON while offline, signed out or unknown", async () => {
  for (const availability of ["offline", "signed_out", "unknown"]) {
    const client = fakeClient();
    client.settings.availability = availability;
    const view = await mount(DeviceSettingsPanel, {device, availability, client, onControl() {}, onRename: async () => true, onRevoke() {}});
    try {
      assert.equal(view.agentSwitch().getAttribute("aria-checked"), "false");
      assert.equal(view.agentSwitch().disabled, true);
      await view.click(view.agentSwitch());
      assert.deepEqual(client.calls.operations, []);
    } finally { view.cleanup(); }
  }
});

test("failed offline OFF keeps the switch ON and reports a retryable error", async () => {
  const client = fakeClient();
  client.settings.remote_access.agent_control_allowed = true;
  client.startOperation = async () => ({ok: false, error: "network_error"});
  const view = await mount(DeviceSettingsPanel, {device, availability: "offline", client, onControl() {}, onRename: async () => true, onRevoke() {}});
  try {
    await view.click(view.agentSwitch());
    assert.equal(view.agentSwitch().getAttribute("aria-checked"), "true");
    assert.equal(view.agentSwitch().disabled, false);
    assert.ok(document.querySelector('[role="alert"]'));
    assert.ok(view.button("重试"));
    assert.equal(view.button("撤销 Agent 控制"), undefined);
  } finally { view.cleanup(); }
});
