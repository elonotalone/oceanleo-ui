import assert from "node:assert/strict";
import test from "node:test";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {document, window} from "./helpers/remote-desktop-dom.mjs";
import {compileModule, dataModule} from "./helpers/module-bench.mjs";

const {DeviceSettingsPanel} = await import(await compileModule("src/pages/settings/DeviceSettingsSection.tsx", {
  "../../i18n/ui/useUI": dataModule('export function useUI() { return (text) => text; }'),
}));
const api = await import(await compileModule("src/api/device-settings.ts", {
  "../lib/auth/client": dataModule('export async function accessToken() { return "scoped-test-owner"; }'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE = "https://scope-intent.test";'),
}));
const {runDeviceSettingsOperation} = await import(await compileModule("src/pages/devices/device-settings-state.ts"));
const device = {device_id: "owned-scoped-target", device_name: "Scope test", platform: "macos", availability: "online"};
const snapshot = {controller_id: "viewer", controllers: [], preferences: {default_task_directory: null, task_folders: []}, roots: [], availability: "online", preferences_available: true, remote_access: {enabled: true, input_allowed: true, expires_at: null, agent_control_allowed: true, agent_always_ask: true}};
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => {}); };
const response = (value) => new Response(JSON.stringify(value));
async function mount(settings = snapshot, operations = api.deviceSettingsClient) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(DeviceSettingsPanel, {
    device, availability: "online", client: {...operations, getSettings: async () => ({ok: true, data: structuredClone(settings)})},
    onControl() {}, onRename: async () => true, onRevoke() {},
  })));
  await flush();
  return {
    host,
    checked(label) { return host.querySelector(`button[role="switch"][aria-label="${label}"]`).getAttribute("aria-checked"); },
    async click(label) { const node = host.querySelector(`button[aria-label="${label}"]`) ?? [...host.querySelectorAll("button")].find((item) => item.textContent.trim() === label); assert.ok(node); await act(async () => node.dispatchEvent(new window.MouseEvent("click", {bubbles: true}))); await flush(); },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

for (const [label, field] of [["允许远程访问", "enabled"], ["允许操作屏幕（查看、点击、输入）", "input_allowed"], ["每次询问", "agent_always_ask"]]) {
  // UC-NONE
  // Owner device preferences must not replay cached Agent consent; this is separate from UGC origin or database-table isolation.
  test(`actual component and serializer send only ${field} after an external Agent revoke`, async () => {
    const wire = [];
    const server = {...snapshot.remote_access, agent_control_allowed: false};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (url.endsWith("/controllers")) return response({controller_id: "viewer"});
      const body = JSON.parse(init.body); wire.push(body);
      const {kind: _kind, ...fields} = body;
      Object.assign(server, fields);
      return response({state: "succeeded", result: {remote_access: fields}});
    };
    const view = await mount();
    try {
      assert.equal(view.checked("允许远程 Agent 控制"), "true", "the source panel intentionally has a stale snapshot");
      await view.click(label);
      assert.deepEqual(wire, [{kind: "remote_access.preferences.update", [field]: false}]);
      assert.equal(server.agent_control_allowed, false, "an unrelated click cannot recreate a grant");
      assert.equal(view.checked(label), "false");
    } finally { view.cleanup(); globalThis.fetch = originalFetch; }
  });
}

// UC-NONE
// An explicit owner Agent grant must preserve unrelated device preferences rather than replay a cached full snapshot.
test("actual Agent-on click and serializer omit cached Ask and owner access fields", async () => {
  const wire = [];
  const server = {...snapshot.remote_access, enabled: false, input_allowed: false, agent_control_allowed: false, agent_always_ask: false};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith("/controllers")) return response({controller_id: "viewer"});
    const body = JSON.parse(init.body); wire.push(body);
    server.agent_control_allowed = body.agent_control_allowed;
    return response({state: "succeeded", result: {remote_access: {...server, expires_at: null}}});
  };
  const view = await mount({...snapshot, remote_access: {...snapshot.remote_access, agent_control_allowed: false}});
  try {
    await view.click("允许远程 Agent 控制");
    assert.deepEqual(wire, [{kind: "remote_access.update", agent_control_allowed: true}]);
    assert.equal(server.enabled, false); assert.equal(server.input_allowed, false); assert.equal(server.agent_always_ask, false);
    assert.equal(view.checked("允许远程 Agent 控制"), "true");
  } finally { view.cleanup(); globalThis.fetch = originalFetch; }
});

// UC-NONE
// These are strict native-device receipt fields, not browser UGC origin, cookie or embedding assertions.
test("scoped replies reject Agent, expiry, revisions, extra fields and non-booleans", () => {
  const intent = {kind: "remote_access.preferences.update", input_allowed: false};
  for (const fields of [{input_allowed: false, agent_control_allowed: true}, {input_allowed: false, expires_at: null}, {input_allowed: false, revision: 2}, {input_allowed: false, duration_minutes: 5}, {input_allowed: false, operation_expires_at: 42}, {input_allowed: false, agent_always_ask: false}, {input_allowed: "false"}, {}]) {
    assert.equal(api.parseSettingsOperation({state: "succeeded", result: {remote_access: fields}}, intent), null);
  }
  assert.deepEqual(api.parseSettingsOperation({state: "succeeded", result: {remote_access: {input_allowed: false}}}, intent)?.result, {remote_access: {input_allowed: false}});
});

// UC-NONE
// Invalid owner preference intents must fail before transport; no untrusted-content capability is exercised.
test("scoped requests require a nonempty strict boolean subset without Agent or read-only fields", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("invalid intent reached transport"); };
  try {
    for (const fields of [{}, {enabled: "false"}, {enabled: false, agent_control_allowed: true}, {enabled: false, expires_at: null}, {enabled: false, policy_revision: 2}, {enabled: false, operation_expires_at: 42}]) {
      assert.equal((await api.deviceSettingsClient.startOperation(device.device_id, {kind: "remote_access.preferences.update", ...fields})).ok, false);
    }
    assert.equal((await api.deviceSettingsClient.startOperation(device.device_id, {kind: "remote_access.update", agent_control_allowed: true, operation_expires_at: 42})).ok, false);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

// UC-NONE
// A native Agent grant acknowledgement must report the complete applied device policy rather than infer omitted consent preferences.
test("minimal Agent requests still require a full successful grant acknowledgement", () => {
  assert.equal(api.parseSettingsOperation({state: "succeeded", result: {remote_access: {agent_control_allowed: true, expires_at: null}}}), null);
  assert.ok(api.parseSettingsOperation({state: "succeeded", result: {remote_access: snapshot.remote_access}}));
  assert.equal(api.parseSettingsOperation({state: "succeeded", result: {remote_access: {...snapshot.remote_access, operation_expires_at: 42}}}), null);
});

// UC-NONE
// Preference updates require a device ACK and cannot borrow a durable Agent revocation receipt to settle early.
test("scoped operations await their receipt and reject a forged Agent result on that receipt", async () => {
  let polls = 0;
  const intent = {kind: "remote_access.preferences.update", enabled: false};
  const pending = {state: "pending", operation_id: "scope-1"};
  const good = await runDeviceSettingsOperation({startOperation: async () => ({ok: true, data: pending}), getOperation: async () => { polls += 1; return {ok: true, data: {state: "succeeded", result: {remote_access: {enabled: false}}}}; }}, device.device_id, intent, new AbortController().signal, {intervalMs: 1});
  assert.equal(polls, 1); assert.equal(good.data.state, "succeeded");
  const bad = await runDeviceSettingsOperation({startOperation: async () => ({ok: true, data: pending}), getOperation: async () => ({ok: true, data: {state: "succeeded", result: {remote_access: {enabled: false, agent_control_allowed: true}}}})}, device.device_id, intent, new AbortController().signal, {intervalMs: 1});
  assert.equal(bad.error, "response_malformed");
  const forged = await runDeviceSettingsOperation({startOperation: async () => ({ok: true, data: {...pending, revocation_effective: true, device_sync_pending: true, result: {remote_access: {agent_control_allowed: false, expires_at: null}}}})}, device.device_id, intent, new AbortController().signal);
  assert.equal(forged.error, "response_malformed");
});

// UC-NONE
// A late device-preference receipt must not restore consent after the owner submits a newer minimal revoke.
test("a late scoped reply cannot undo a newer Agent revoke", async (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const calls = [];
  let lateScope;
  let aborted = false;
  const view = await mount(snapshot, {
    async startOperation(_id, operation) {
      calls.push(operation);
      return {ok: true, data: operation.kind === "remote_access.preferences.update" ? {state: "pending", operation_id: "scope-1"} : {state: "pending", operation_id: "revoke-2", revocation_effective: true, device_sync_pending: true, result: {remote_access: {agent_control_allowed: false, expires_at: null}}}};
    },
    getOperation(_id, _operation, signal) { signal.addEventListener("abort", () => { aborted = true; }, {once: true}); return new Promise((resolve) => { lateScope = resolve; }); },
  });
  try {
    await view.click("允许操作屏幕（查看、点击、输入）");
    await act(async () => t.mock.timers.tick(750)); await flush();
    assert.equal(typeof lateScope, "function");
    await view.click("撤销 Agent 控制");
    assert.equal(aborted, true);
    assert.deepEqual(calls, [{kind: "remote_access.preferences.update", input_allowed: false}, {kind: "remote_access.update", agent_control_allowed: false}]);
    await act(async () => lateScope({ok: true, data: {state: "succeeded", result: {remote_access: {...snapshot.remote_access, agent_control_allowed: true}}}})); await flush();
    assert.equal(view.checked("允许远程 Agent 控制"), "false");
    assert.equal(view.checked("允许操作屏幕（查看、点击、输入）"), "true", "the cancelled scope receipt is not merged");
  } finally { view.cleanup(); }
});
