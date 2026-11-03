import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.window = {localStorage: {getItem: () => "1".repeat(64)}};
const api = await import(await compileModule("src/api/device-settings.ts", {
  "../lib/auth/client": dataModule('export async function accessToken() { return "owner-token"; }'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE = "https://gateway.test";'),
}));
const {runDeviceSettingsOperation} = await import(await compileModule("src/pages/devices/device-settings-state.ts"));

const revoke = {kind: "remote_access.update", agent_control_allowed: false};
const partial = {agent_control_allowed: false, expires_at: null};
const durable = {state: "pending", operation_id: "revoke-1", revocation_effective: true, device_sync_pending: true, result: {remote_access: partial}};

test("durable pending revocation keeps its partial result without inventing own/input/Ask settings", () => {
  const parsed = api.parseSettingsOperation(durable);
  assert.deepEqual(parsed, durable);
  assert.equal("enabled" in parsed.result.remote_access, false);
  assert.equal("input_allowed" in parsed.result.remote_access, false);
  assert.equal("agent_always_ask" in parsed.result.remote_access, false);
  assert.deepEqual(api.parseSettingsOperation({...durable, state: "succeeded", device_sync_pending: false}), {...durable, state: "succeeded", device_sync_pending: false});
});

test("a durable marker cannot turn a grant, stale success or malformed receipt into a revoke", () => {
  for (const changed of [
    {revocation_effective: "true"},
    {device_sync_pending: "true"},
    {device_sync_pending: false},
    {result: {remote_access: {...partial, agent_control_allowed: true}}},
    {result: {remote_access: {...partial, enabled: "true"}}},
    {state: "failed", error: "stale_operation"},
  ]) assert.equal(api.parseSettingsOperation({...durable, ...changed}), null);
});

test("minimal offline revoke sends only the false consent field and existing controller identity", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({url, init});
    return new Response(JSON.stringify(url.endsWith("/controllers") ? {controller_id: "viewer"} : durable));
  };
  const result = await api.deviceSettingsClient.startOperation("owned-offline", revoke);
  assert.equal(result.ok, true);
  const request = calls.find(({url}) => url.endsWith("/settings/operations"));
  assert.deepEqual(JSON.parse(request.init.body), revoke);
  assert.equal(request.init.headers["X-OceanLeo-Controller"], "1".repeat(64));
  assert.equal(request.init.headers.Authorization, "Bearer owner-token");
});

test("only an explicit minimal revoke returns before the offline device ACK", async () => {
  let polls = 0;
  const result = await runDeviceSettingsOperation({
    startOperation: async () => ({ok: true, data: durable}),
    getOperation() { polls += 1; return new Promise(() => {}); },
  }, "owned-offline", revoke, new AbortController().signal, {intervalMs: 1, timeoutMs: 20});
  assert.equal(result.ok, true);
  assert.equal(result.data.state, "pending");
  assert.equal(result.data.device_sync_pending, true);
  assert.equal(polls, 0);
});

test("full policy updates still await their ACK when an agent=false field is durable", async () => {
  let polls = 0;
  const acknowledged = {state: "succeeded", revocation_effective: true, device_sync_pending: false, result: {remote_access: {...partial, enabled: false, input_allowed: false, agent_always_ask: true}}};
  const result = await runDeviceSettingsOperation({
    startOperation: async () => ({ok: true, data: durable}),
    getOperation: async () => { polls += 1; return {ok: true, data: acknowledged}; },
  }, "owned-offline", {...revoke, enabled: false, input_allowed: false, agent_always_ask: true}, new AbortController().signal, {intervalMs: 1});
  assert.equal(polls, 1);
  assert.equal(result.data.state, "succeeded");
});

test("missing durable confirmation and a stale grant receipt do not finish a revoke early", async () => {
  let polls = 0;
  const result = await runDeviceSettingsOperation({
    startOperation: async () => ({ok: true, data: {...durable, revocation_effective: false}}),
    getOperation: async () => {
      polls += 1;
      return {ok: true, data: polls === 1 ? {...durable, result: {remote_access: {...partial, agent_control_allowed: true}}} : {...durable, state: "succeeded", device_sync_pending: false}};
    },
  }, "owned-offline", revoke, new AbortController().signal, {intervalMs: 1});
  assert.equal(polls, 2);
  assert.equal(result.data.state, "succeeded");
  assert.equal(result.data.result.remote_access.agent_control_allowed, false);
});

test("a stale enable ACK or a different operation receipt cannot complete revocation", async () => {
  for (const receipt of [
    {state: "succeeded", result: {remote_access: {agent_control_allowed: true, agent_always_ask: false, enabled: true, input_allowed: true, expires_at: null}}},
    {...durable, operation_id: "older-revoke"},
  ]) {
    const result = await runDeviceSettingsOperation({
      startOperation: async () => ({ok: true, data: {...durable, revocation_effective: false}}),
      getOperation: async () => ({ok: true, data: receipt}),
    }, "owned-offline", revoke, new AbortController().signal, {intervalMs: 1});
    assert.equal(result.ok, false);
    assert.ok(["operation_failed", "stale_operation"].includes(result.error));
  }
});
