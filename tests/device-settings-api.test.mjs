import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const values = new Map();
const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
globalThis.window = { localStorage };
const api = await import(await compileModule("src/api/device-settings.ts", {
  "../lib/auth/client": dataModule(`export async function accessToken() { return globalThis.__deviceSettingsToken === null ? null : "owner-token"; }`),
  "../lib/auth/config": dataModule(`export const GATEWAY_BASE = "https://gateway.test";`),
}));
const state = await import(await compileModule("src/pages/devices/device-settings-state.ts"));
const settings = { controller_id: "controller-1", controllers: [{ grant_id: "grant-1", controller_id: "controller-1", label: "Chrome · Windows", is_current: true, last_used_at: null, expires_at: null, created_at: "2026-10-25T00:00:00Z" }], preferences: { default_task_directory: null, task_folders: [] }, roots: ["/allowed"], availability: "online", preferences_available: true };

test("controller identity is durable crypto-random, never a label/public id", () => {
  values.clear();
  const first = api.controllerHeaders()["X-OceanLeo-Controller"];
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(api.controllerHeaders()["X-OceanLeo-Controller"], first);
  assert.notEqual(first, settings.controller_id);
  values.clear();
  assert.notEqual(api.controllerHeaders()["X-OceanLeo-Controller"], first);
});

test("settings/grant/expiry/target folder routes use the same owner-bound controller credential", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const body = url.endsWith("/controllers") ? { controller_id: "viewer-1" } : url.endsWith("/settings") ? settings : url.includes("/operations/") ? { state: "succeeded", result: { path: "/allowed", parent: null, roots: ["/allowed"], entries: [{ name: "work", path: "/allowed/work" }] } } : url.endsWith("/operations") ? { operation_id: "op-1", state: "pending" } : url.includes("/tasks?") ? { tasks: [{ task_id: "t-1", action_kind: "fs.list", status: "succeeded", created_at: "2026-10-25T00:00:00Z" }] } : {};
    return new Response(JSON.stringify(body), { status: 200 });
  };
  assert.deepEqual((await api.deviceSettingsClient.getSettings("mac/id")).data, settings);
  await api.deviceSettingsClient.revokeController("mac/id", "grant/id");
  await api.deviceSettingsClient.shortenControllerExpiry("mac/id", "grant/id", "2026-10-25T12:00:00Z");
  await api.deviceSettingsClient.startOperation("mac/id", { kind: "folders.list", path: "/allowed/work" });
  const listing = await api.deviceSettingsClient.getOperation("mac/id", "op/id");
  assert.equal(listing.data.result.path, "/allowed");
  assert.equal((await api.deviceSettingsClient.listTasks("mac/id")).data[0].task_id, "t-1");
  assert.deepEqual(calls.map(({ url, init }) => [init.method ?? "GET", url]), [
    ["POST", "https://gateway.test/v1/devices/controllers"],
    ["GET", "https://gateway.test/v1/devices/mac%2Fid/settings"],
    ["DELETE", "https://gateway.test/v1/devices/mac%2Fid/controllers/grant%2Fid"],
    ["PATCH", "https://gateway.test/v1/devices/mac%2Fid/controllers/grant%2Fid"],
    ["POST", "https://gateway.test/v1/devices/mac%2Fid/settings/operations"],
    ["GET", "https://gateway.test/v1/devices/mac%2Fid/settings/operations/op%2Fid"],
    ["GET", "https://gateway.test/v1/devices/mac%2Fid/tasks?limit=20"],
  ]);
  assert.equal(new Set(calls.map(({ init }) => init.headers["X-OceanLeo-Controller"])).size, 1);
  for (const { init } of calls) assert.equal(init.headers.Authorization, "Bearer owner-token");
  assert.deepEqual(JSON.parse(calls[4].init.body), { kind: "folders.list", path: "/allowed/work" });
});

test("malformed settings/folders fail closed, missing auth/storage sends no request", async () => {
  assert.equal(api.parseDeviceSettings({ ...settings, availability: "signed_in" }), null);
  assert.equal(api.parseDeviceSettings({ ...settings, controllers: [{ label: "fake" }] }), null);
  assert.equal(api.parseSettingsOperation({ state: "succeeded", result: { path: "/anything", entries: [] } }), null);
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return new Response("{}"); };
  globalThis.__deviceSettingsToken = null;
  assert.equal((await api.deviceSettingsClient.getSettings("mac")).error, "unauthorized");
  delete globalThis.__deviceSettingsToken;
  window.localStorage = { getItem() { throw new Error("blocked"); } };
  try { assert.equal((await api.deviceSettingsClient.getSettings("mac")).error, "controller_identity_unavailable"); }
  finally { window.localStorage = localStorage; }
  assert.equal(requests, 0);
});

test("operations start once, poll only the receipt and preserve target failure/timeout", async () => {
  let starts = 0;
  let polls = 0;
  const client = {
    async startOperation(id, operation) { starts += 1; assert.equal(id, "mac"); assert.equal(operation.path, "/allowed"); return { ok: true, data: { state: "pending", operation_id: "op-1" } }; },
    async getOperation(id, operation) { polls += 1; assert.equal(id, "mac"); assert.equal(operation, "op-1"); return { ok: true, data: polls === 1 ? { state: "pending" } : { state: "failed", error: "path_outside_grant" } }; },
  };
  const result = await state.runDeviceSettingsOperation(client, "mac", { kind: "folders.list", path: "/allowed" }, new AbortController().signal, { intervalMs: 1 });
  assert.equal(result.error, "path_outside_grant");
  assert.equal(starts, 1);
  assert.equal(polls, 2);
  const timedOut = await state.runDeviceSettingsOperation({ ...client, getOperation: async () => ({ ok: true, data: { state: "pending" } }) }, "mac", { kind: "folders.list", path: "/allowed" }, new AbortController().signal, { intervalMs: 1, timeoutMs: 2 });
  assert.equal(timedOut.error, "request_expired");
});

test("wallpaper uses the authenticated settings receipt with no pathname or public image route", async () => {
  values.clear();
  const cover = { state: "available", image: "data:image/jpeg;base64,/9j/2Q==", width: 960, height: 600, observed_at: Math.floor(Date.now() / 1000) };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const body = url.endsWith("/controllers") ? { controller_id: "viewer-cover" }
      : init.method === "POST" ? { operation_id: "cover-op", state: "pending" }
      : { state: "succeeded", result: { cover } };
    return new Response(JSON.stringify(body));
  };
  const receipt = await api.deviceSettingsClient.startOperation("mac", { kind: "cover.read" });
  assert.equal(receipt.data.operation_id, "cover-op");
  const result = await api.deviceSettingsClient.getOperation("mac", "cover-op");
  assert.deepEqual(result.data.result, { cover });
  assert.deepEqual(calls.map(({ url }) => url), ["https://gateway.test/v1/devices/controllers", "https://gateway.test/v1/devices/mac/settings/operations", "https://gateway.test/v1/devices/mac/settings/operations/cover-op"]);
  assert.deepEqual(JSON.parse(calls[1].init.body), { kind: "cover.read" });
  for (const { init } of calls) {
    assert.equal(init.headers.Authorization, "Bearer owner-token");
    assert.match(init.headers["X-OceanLeo-Controller"], /^[a-f0-9]{64}$/);
    assert.equal(init.cache, "no-store");
  }
});
