// C7-U5: the web UI for the cloud assistant using the user's own computer.
// Contract: oceanleo-app/docs/react-client-rebuild/device-link/protocol.md §12–§13
// (+ bridge doc §17.9 texts). Old gateways (no driver/health, 405 on the
// availability route) must keep today's UI.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { document, window } from "./helpers/remote-desktop-dom.mjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const HAN = /[一-鿿]/;

const target = await import(await compileModule("src/lib/execution-target.ts"));
const model = await import(await compileModule("src/lib/local-agent-task.ts"));
const authStub = dataModule('export async function getUserId(){return "owner"} export async function accessToken(){return Object.hasOwn(globalThis, "__u5Token") ? globalThis.__u5Token : "test"} export function cachedAccessToken(){return "test"}');
const configStub = dataModule('export const GATEWAY_BASE="https://api.dev.oceanleo.com";');
const transport = await import(await compileModule("src/lib/agent.ts", {
  "./auth/client": authStub,
  "./auth/config": configStub,
  "./history-events": dataModule("export function notifyHistoryChanged(){}"),
}));
const api = await import(await compileModule("src/lib/cloud-agent-api.ts", { "./auth/client": authStub, "./auth/config": configStub }));

/** `tt` with interpolation, as useUI does. */
const tt = (value, vars) => vars ? value.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : value;
const ttStub = dataModule(`export function useUI(){ return (v, vars) => vars ? v.replace(/\\{(\\w+)\\}/g, (m, k) => k in vars ? String(vars[k]) : m) : v; }`);
const clock = (ms) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

const wire = (fields = {}) => ({ run_id: "run-1", device_id: "mac-1", state: "running", desired_state: "run", control_revision: 3, report_seq: 4, ...fields });
const cloudWire = (fields = {}) => wire({
  driver: "cloud", session_id: "cas_01JD00000000000000000000AB", owner: "ai",
  health: { kind: "ok", since: "2026-10-27T08:00:00Z", last_contact_at: "2026-10-27T08:00:00Z" }, ...fields,
});

function jsonResponse(status, body) { return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

test("execution target carries driver:'cloud' only for a paired computer, and sends it only when set", () => {
  assert.deepEqual(target.normalizeExecutionTarget({ kind: "device", id: "mac-1", name: "Mac", driver: "cloud" }), { kind: "device", id: "mac-1", name: "Mac", driver: "cloud" });
  assert.deepEqual(target.normalizeExecutionTarget({ kind: "device", id: "mac-1", name: "Mac", driver: "device" }), { kind: "device", id: "mac-1", name: "Mac" });
  assert.deepEqual(target.normalizeExecutionTarget({ kind: "computer", id: "cc_1", name: "Box", driver: "cloud" }), { kind: "computer", id: "cc_1", name: "Box" });
  assert.deepEqual(target.executionTargetRequestFields({ kind: "device", id: "mac-1", name: "Mac", driver: "cloud" }).execution_target, { kind: "device", id: "mac-1", driver: "cloud" });
  // Old gateways answer 422 to an unknown member: the default never travels.
  assert.deepEqual(target.executionTargetRequestFields({ kind: "device", id: "mac-1", name: "Mac" }).execution_target, { kind: "device", id: "mac-1" });
});

test("availability rows (§12.4) decide one mode per computer; no row = today's choice", () => {
  const now = Date.parse("2026-10-27T08:00:00Z");
  const rows = target.parseCloudAgentAvailability({ devices: [
    { device_id: "mac-1", link: "online", available: true, reason: null, until: 1793095049, gui: true },
    { device_id: "pc-2", available: false, reason: "cloud_agent_disabled", until: null },
    { device_id: "../bad", available: true }, { device_id: "x", available: "yes" }, "junk",
  ] });
  assert.deepEqual([...rows.keys()], ["mac-1", "pc-2"]);
  assert.equal(rows.get("mac-1").until, 1793095049 * 1000, "the link's until is epoch seconds");
  const online = { online: true, availability: "online", local_exec_enabled: true };
  assert.equal(target.computerRunMode(online, rows.get("mac-1"), now), "cloud");
  assert.equal(target.computerRunMode(online, rows.get("pc-2"), now), "device");
  assert.equal(target.computerRunMode(online, undefined, now), null);
  assert.equal(target.computerRunMode(online, { ...rows.get("mac-1"), until: now - 1 }, now), "device", "expired permission");
  assert.equal(target.computerRunMode({ ...online, local_exec_enabled: false }, rows.get("mac-1"), now), "device");
  assert.equal(target.computerRunMode({ ...online, availability: "offline" }, rows.get("mac-1"), now), "device");
  const mac = { kind: "device", id: "mac-1", name: "Mac" };
  const cloud = target.withRunMode(mac, "cloud");
  assert.deepEqual(cloud, { ...mac, driver: "cloud" });
  assert.equal(target.withRunMode(cloud, "cloud"), cloud, "unchanged target is the same object");
  assert.deepEqual(target.withRunMode(cloud, null), mac);
  assert.deepEqual(target.withRunMode(cloud, "device"), mac);
});

test("cloud projection (§13) parses; on-device and old rows are unchanged; every report_seq bump is applied", () => {
  assert.equal(model.parseLocalAgentRun(wire()).driver, undefined);
  assert.deepEqual(Object.keys(model.parseLocalAgentRun(wire())).sort(), ["desiredState", "deviceId", "reportSeq", "revision", "runId", "state"]);
  const run = model.parseLocalAgentRun(cloudWire({ owner: "human", health: { kind: "human_in_control", since: "2026-10-27T08:01:00Z", last_contact_at: null } }));
  assert.equal(run.driver, "cloud");
  assert.equal(run.sessionId, "cas_01JD00000000000000000000AB");
  assert.equal(run.owner, "human");
  assert.deepEqual(run.health, { kind: "human_in_control", since: Date.parse("2026-10-27T08:01:00Z"), lastContactAt: null });
  assert.equal(model.parseLocalAgentRun(cloudWire({ session_id: "../x", owner: "robot", health: { kind: "Bad Kind" } })).sessionId, undefined);
  // Health-only change: protocol §16 D13 bumps report_seq, so the newer read wins.
  const ok = model.parseLocalAgentRun(cloudWire());
  const offline = model.parseLocalAgentRun(cloudWire({ report_seq: 5, health: { kind: "offline", since: "2026-10-27T08:05:00Z", last_contact_at: "2026-10-27T08:04:45Z" } }));
  assert.equal(model.newerLocalAgentRun(ok, offline), offline);
  assert.equal(model.newerLocalAgentRun(offline, ok), offline, "a stale poll cannot undo it");
  // Equal counters but a different live view is still shown; an identical view keeps the same object.
  const sameCounters = { ...ok, health: { ...offline.health } };
  assert.equal(model.newerLocalAgentRun(ok, sameCounters), sameCounters);
  assert.equal(model.newerLocalAgentRun(ok, model.parseLocalAgentRun(cloudWire())), ok);
  assert.equal(model.localAgentRunLive(ok), true);
  assert.equal(model.localAgentRunLive(model.parseLocalAgentRun(cloudWire({ state: "cancelled" }))), false);
  assert.equal(model.localAgentRunLive(null), false);
});

test("health and status lines use the bridge §17.9 texts and the viewer's clock", () => {
  const now = Date.parse("2026-10-27T08:06:00Z");
  const contact = Date.parse("2026-10-27T08:04:00Z");
  const offline = model.parseLocalAgentRun(cloudWire({ health: { kind: "offline", since: "2026-10-27T08:04:15Z", last_contact_at: "2026-10-27T08:04:00Z" } }));
  assert.equal(model.cloudRunStatus(offline, tt, now), `你的电脑 2 分钟没有回应，可能已离线或休眠 · 上次联系 ${clock(contact)}`);
  assert.equal(model.cloudHealthLine({ kind: "offline", since: null, lastContactAt: null }, tt, now), "你的电脑没有回应，可能已离线或休眠。");
  const hung = model.parseLocalAgentRun(cloudWire({ health: { kind: "hung", since: "2026-10-27T08:05:00Z" } }));
  assert.equal(model.cloudRunStatus(hung, tt, now, { currentElapsedMs: 185_000 }), "你的电脑卡住了：这一步已经 3 分钟没有完成");
  assert.equal(model.cloudRunStatus(hung, tt, now), "你的电脑卡住了：这一步已经 1 分钟没有完成", "falls back to the health's since");
  const human = model.parseLocalAgentRun(cloudWire({ state: "paused", owner: "human", health: { kind: "human_in_control" } }));
  assert.equal(model.cloudRunStatus(human, tt, now), "你正在控制电脑，AI 已暂停；点「交还给 AI」继续。");
  assert.equal(model.cloudOwnerLine(human), null, "the health line already says who is in control");
  const confirm = model.parseLocalAgentRun(cloudWire({ state: "awaiting_approval", health: { kind: "needs_local_confirm" } }));
  assert.equal(model.cloudRunStatus(confirm, tt, now), "这一步需要你在电脑前确认。");
  assert.equal(model.cloudRunStatus(model.parseLocalAgentRun(cloudWire({ state: "paused", desired_state: "pause" })), tt, now), "任务已暂停；继续后 AI 会先重新查看屏幕。");
  assert.equal(model.cloudRunStatus(model.parseLocalAgentRun(cloudWire({ state: "paused" })), tt, now), "正在交还给 AI，它会先重新查看屏幕。");
  const running = model.parseLocalAgentRun(cloudWire());
  assert.equal(model.cloudRunStatus(running, tt, now), "云端助手正在使用你的电脑");
  assert.equal(model.cloudOwnerLine(running), "AI 正在操作");
  assert.equal(model.cloudRunStatus(model.parseLocalAgentRun(cloudWire({ state: "queued" })), tt, now), "正在连接你的电脑…");
  // Intents are never shown as done.
  assert.equal(model.cloudRunStatus(model.parseLocalAgentRun(cloudWire({ desired_state: "stop" })), tt, now), "正在请求电脑停止，等待执行端确认");
  assert.equal(model.cloudRunStatus(model.parseLocalAgentRun(cloudWire({ state: "succeeded" })), tt, now), "电脑任务已完成");
  // device_status notices (§13): the fixed text of the kind, else the stored text.
  assert.equal(model.deviceStatusNoticeText("ok", "x"), "电脑已恢复，AI 会先重新查看屏幕再继续。");
  assert.equal(model.deviceStatusNoticeText("signed_out", "x"), "你的电脑上已退出 OceanLeo 账号，任务已暂停。");
  assert.equal(model.deviceStatusNoticeText("brand_new_kind", "服务器写的话"), "服务器写的话");
  assert.equal(model.deviceStatusNoticeText("constructor", ""), model.CLOUD_AGENT_COPY.healthOther, "no prototype lookups");
  assert.deepEqual(["ok", "needs_local_confirm", "human_in_control", "offline"].map(model.cloudHealthTone), ["ok", "pause", "pause", "stuck"]);
});

test("controls: 交还给 AI for a person in control, 继续 for an owner pause, 暂停 while working; 接管 and 停止 while live", () => {
  assert.deepEqual(model.cloudRunActions(model.parseLocalAgentRun(cloudWire())), ["pause", "takeOver", "stop"]);
  assert.deepEqual(model.cloudRunActions(model.parseLocalAgentRun(cloudWire({ state: "paused", desired_state: "pause" }))), ["resume", "takeOver", "stop"]);
  assert.deepEqual(model.cloudRunActions(model.parseLocalAgentRun(cloudWire({ state: "paused" }))), ["takeOver", "stop"], "a resume is already pending");
  assert.deepEqual(model.cloudRunActions(model.parseLocalAgentRun(cloudWire({ state: "paused", owner: "human", health: { kind: "human_in_control" } }))), ["handBack", "takeOver", "stop"]);
  assert.deepEqual(model.cloudRunActions(model.parseLocalAgentRun(cloudWire({ desired_state: "stop" }))), []);
  assert.deepEqual(model.cloudRunActions(model.parseLocalAgentRun(cloudWire({ state: "failed" }))), []);
  assert.deepEqual(model.cloudRunActions(model.parseLocalAgentRun(wire())), [], "on-device runs keep today's buttons");
  assert.deepEqual(model.remoteDesktopAgentBanner(model.parseLocalAgentRun(cloudWire())), { text: "AI 正在操作这台电脑；你一操作，AI 就会停手。", handBack: false });
  assert.deepEqual(model.remoteDesktopAgentBanner(model.parseLocalAgentRun(cloudWire({ state: "paused", owner: "human", health: { kind: "human_in_control" } }))),
    { text: "你正在控制电脑，AI 已暂停；点「交还给 AI」继续。", handBack: true });
  assert.deepEqual(model.remoteDesktopAgentBanner(model.parseLocalAgentRun(cloudWire({ state: "paused", desired_state: "pause" }))), { text: "任务已暂停；继续后 AI 会先重新查看屏幕。", handBack: true });
  assert.equal(model.remoteDesktopAgentBanner(model.parseLocalAgentRun(wire())), null);
  assert.equal(model.remoteDesktopAgentBanner(model.parseLocalAgentRun(cloudWire({ state: "cancelled" }))), null);
});

test("cloud refusals become the reason's sentence; unconfirmed keeps the same task; definite drafts may be discarded", () => {
  const refused = (reason) => model.localAgentFailure(transport.agentApiFailureFromPayload(409, { detail: { code: "cloud_agent_unavailable", ...(reason ? { reason } : {}) } }), true);
  assert.deepEqual(refused("envelope_expired"), { kind: "refused", text: model.CLOUD_AGENT_COPY.refusedExpired, definite: true });
  assert.equal(refused("cloud_agent_disabled").text, model.CLOUD_AGENT_COPY.refusedDisabled);
  assert.equal(refused("ai_busy").text, model.CLOUD_AGENT_COPY.refusedBusy);
  assert.equal(refused("outside_envelope").text, model.CLOUD_AGENT_COPY.refusedScope);
  assert.equal(refused("local_exec_disabled").text, model.LOCAL_AGENT_COPY.localExecDisabled);
  assert.equal(refused("link_lost").text, model.LOCAL_AGENT_COPY.deviceOffline);
  assert.equal(refused(null).text, model.CLOUD_AGENT_COPY.refusedUnavailable);
  assert.equal(refused("constructor").text, model.CLOUD_AGENT_COPY.refusedUnavailable, "no prototype lookups");
  for (const sentence of [refused("envelope_expired").text, refused(null).text]) assert.match(sentence, /任务没有开始，也没有改到云端/);
  const unconfirmed = transport.agentApiFailureFromPayload(503, { detail: { code: "cloud_agent_dispatch_unconfirmed", task_id: "task-7", message: "x" } });
  assert.equal(unconfirmed.detail.task_id, "task-7", "agent.ts keeps the task identity");
  assert.deepEqual(model.localAgentFailure(unconfirmed, true), { kind: "unconfirmed", text: model.LOCAL_AGENT_COPY.dispatchUnconfirmed, taskId: "task-7" });
  assert.equal(model.localAgentFailure(transport.agentApiFailureFromPayload(502, { detail: { code: "cloud_agent_dispatch_failed", task_id: "t" } }), true).definite, true);
  assert.equal(transport.agentApiFailureFromPayload(409, { detail: { code: "cloud_agent_unavailable", reason: "Bad Reason!" } }).detail.reason, undefined);
  assert.equal(model.localAgentRefusalText("CLOUD_AGENT_UNAVAILABLE"), model.CLOUD_AGENT_COPY.refusedUnavailable);
  // Branching a computer task into a skill/team mode (task_service, U4).
  assert.deepEqual(model.localAgentFailure(transport.agentApiFailureFromPayload(422, { detail: { code: "local_agent_mode_unsupported", message: "x" } }), true),
    { kind: "refused", text: model.LOCAL_AGENT_COPY.modeUnsupported, definite: true });
});

test("a cloud-driver send is confirmed by GET /v1/devices/cloud-agent first; otherwise nothing is sent", async () => {
  const original = globalThis.fetch;
  const calls = [];
  let availability = { status: 405 };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, init });
    if (String(url).endsWith("/v1/devices/cloud-agent")) return jsonResponse(availability.status, availability.body);
    return jsonResponse(200, { task_id: "t1", status: "running" });
  };
  const mac = { kind: "device", id: "mac-1", name: "Mac", driver: "cloud" };
  try {
    // Today's gateway: 405 → route absent → no POST, no on-device fallback.
    let result = await transport.createTask({ prompt: "做一个待办 App", orgId: "", executionTarget: mac });
    assert.equal(result.ok, false);
    assert.equal(result.error, "CLOUD_AGENT_UNAVAILABLE");
    assert.deepEqual(result.executionTarget, mac);
    assert.deepEqual(calls.map((c) => c.method), ["GET"]);
    assert.equal(calls[0].init.cache, "no-store");
    assert.deepEqual(model.localAgentFailure(result, true), { kind: "refused", text: model.CLOUD_AGENT_COPY.refusedUnavailable, definite: true });
    // The computer's permission ran out after the label was shown.
    calls.length = 0;
    availability = { status: 200, body: { devices: [{ device_id: "mac-1", available: false, reason: "envelope_expired", until: 1 }] } };
    result = await transport.createTask({ prompt: "x", orgId: "", executionTarget: mac });
    assert.equal(model.localAgentFailure(result, true).text, model.CLOUD_AGENT_COPY.refusedExpired);
    assert.equal(calls.filter((c) => c.method === "POST").length, 0);
    // Confirmed: the POST carries driver:"cloud".
    calls.length = 0;
    availability = { status: 200, body: { devices: [{ device_id: "mac-1", available: true, reason: null, until: Math.floor(Date.now() / 1000) + 3600 }] } };
    result = await transport.createTask({ prompt: "x", orgId: "", executionTarget: mac });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.find((c) => c.method === "POST").body.execution_target, { kind: "device", id: "mac-1", driver: "cloud" });
    // On-device (no driver): no extra request, today's body.
    calls.length = 0;
    await transport.createTask({ prompt: "x", orgId: "", executionTarget: { kind: "device", id: "mac-1", name: "Mac" } });
    assert.deepEqual(calls.map((c) => c.method), ["POST"]);
    assert.deepEqual(calls[0].body.execution_target, { kind: "device", id: "mac-1" });
  } finally { globalThis.fetch = original; }
});

test("session and observation routes: owner token, no cache, no cookies; 404 = gone, 204 = none, anything else is not an image", async () => {
  const original = globalThis.fetch;
  const seen = [];
  let next;
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), init }); return next(); };
  try {
    next = () => jsonResponse(200, { session_id: "cas_A", state: "stuck", reason: "offline", owner: "ai", link: "offline",
      last_contact_at: "2026-10-27T08:41:08Z", current: { seq: 43, method: "exec.shell", elapsed_ms: 8123 },
      latest_observation: { available: true, width: 1280, height: 707, at: "2026-10-27T08:41:05Z" } });
    const ok = await api.getAgentSession("mac-1", "cas_A");
    assert.equal(ok.kind, "ok");
    assert.deepEqual(ok.session.current, { seq: 43, method: "exec.shell", elapsedMs: 8123 });
    assert.deepEqual(ok.session.observation, { width: 1280, height: 707, at: Date.parse("2026-10-27T08:41:05Z") });
    assert.equal(seen[0].url, "https://api.dev.oceanleo.com/v1/devices/mac-1/agent-sessions/cas_A");
    assert.equal(seen[0].init.cache, "no-store");
    assert.equal(seen[0].init.credentials, "omit");
    assert.equal(seen[0].init.headers.Authorization, "Bearer test");
    next = () => jsonResponse(404, { detail: { code: "session_unknown" } });
    assert.equal((await api.getAgentSession("mac-1", "cas_A")).kind, "gone");
    next = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "content-type": "image/jpeg" } });
    const image = await api.getAgentObservation("mac-1", "cas_A");
    assert.equal(image.kind, "image");
    assert.equal(seen.at(-1).url.endsWith("/agent-sessions/cas_A/observation"), true);
    next = () => new Response(null, { status: 204 });
    assert.equal((await api.getAgentObservation("mac-1", "cas_A")).kind, "none");
    next = () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
    assert.equal((await api.getAgentObservation("mac-1", "cas_A")).kind, "error");
    const before = seen.length;
    assert.equal((await api.getAgentSession("../x", "cas_A")).kind, "gone");
    assert.equal(seen.length, before, "a bad id never becomes a request");
    // Account failures and missing routes are distinct from transient server failures.
    for (const [status, reason] of [[401, "unauthorized"], [403, "forbidden"], [404, "unsupported"], [405, "unsupported"], [501, "unsupported"]]) {
      next = () => jsonResponse(status, { detail: "x" });
      assert.deepEqual(await api.listCloudAgentAvailability(), { kind: "absent", reason, status });
    }
    for (const status of [429, 500, 503]) {
      next = () => jsonResponse(status, { detail: "x" });
      assert.deepEqual(await api.listCloudAgentAvailability(), { kind: "error", status });
    }
    next = () => { throw new TypeError("network"); };
    assert.equal((await api.listCloudAgentAvailability()).kind, "error", "no answer keeps what the page knew");
    globalThis.__u5Token = null;
    assert.deepEqual(await api.listCloudAgentAvailability(), { kind: "absent", reason: "signed_out" });
  } finally { globalThis.fetch = original; delete globalThis.__u5Token; }
});

test("every cloud-assistant sentence is translated in all 16 locales, identical in the runtime loader, placeholders kept", async () => {
  const { LOCALES } = await import("../src/i18n/config.ts");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const { loadUiMessages } = await import("../src/i18n/ui/messages/load.ts");
  const entries = Object.entries(model.CLOUD_AGENT_COPY);
  // 39 from U5 + 7 from C11-FW (local_exec_disabled notice, last contact, 我的设备 banner, consent lines, idle desktop).
  assert.equal(entries.length, 46);
  assert.equal(new Set(entries.map(([, zh]) => zh)).size, entries.length, "no two keys share a source sentence");
  for (const locale of LOCALES.filter((locale) => locale !== "zh")) {
    const runtime = await loadUiMessages(locale);
    for (const [key, zh] of entries) {
      const text = UI_MESSAGES[locale][zh];
      // zh-TW may legitimately equal the source ("AI 正在操作" has no Traditional-only characters).
      assert.ok(text?.trim() && (text !== zh || locale === "zh-TW"), `${locale} misses ${key}`);
      assert.equal(runtime[zh], text, `${locale} runtime differs: ${key}`);
      for (const slot of zh.match(/\{\w+\}/g) || []) assert.ok(text.includes(slot), `${locale} ${key} lost ${slot}`);
      if (!["zh-TW", "ja"].includes(locale)) assert.doesNotMatch(text, HAN, `${locale}: ${text}`);
    }
  }
  // The how-to quotes the desktop app's own switch (device_link/surfaces.rs).
  assert.match(UI_MESSAGES.en[model.CLOUD_AGENT_COPY.refusedDisabled], /“Allow the cloud assistant to use this computer”/);
  assert.match(model.CLOUD_AGENT_COPY.needsYouHint, /「允许云端助手使用这台电脑」/);
  // T3a's 19 sentences + C11-FW's History sentence for a refused delete (local_agent_stop_pending).
  assert.equal(Object.keys(model.LOCAL_AGENT_COPY).length, 20);
});

// ---------------------------------------------------------------- components

async function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  for (let i = 0; i < 6; i += 1) await act(async () => {});
  return { host, root, async flush(n = 6) { for (let i = 0; i < n; i += 1) await act(async () => {}); },
    unmount() { act(() => root.unmount()); host.remove(); } };
}
function buttons(host) { return [...host.querySelectorAll("button")]; }
/** Lazy imports and Suspense settle over a few macrotasks; poll (bounded) instead of a fixed flush count. */
async function waitFor(check, ms = 3000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) return check();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  return check();
}
async function click(node) { assert.ok(node, "control exists"); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); for (let i = 0; i < 6; i += 1) await act(async () => {}); }

const { LocalAgentTaskStatus } = await import(await compileModule("src/shell/LocalAgentTaskStatus.tsx", {
  "../i18n/ui/useUI": ttStub,
  "../lib/cloud-agent-api": dataModule(`
    export async function getAgentSession(...args) { (globalThis.__u5SessionReads ||= []).push(args); return globalThis.__u5Session ?? { kind: "gone" }; }
    export async function getAgentObservation(...args) { (globalThis.__u5ImageReads ||= []).push(args); return globalThis.__u5Image ?? { kind: "none" }; }
    // C11-FW: 接管电脑's consent line reads availability; no route = today's block.
    export async function listCloudAgentAvailability() { return { kind: "absent" }; }
  `),
  "../pages/RemoteDesktopPanel": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function RemoteDesktopPanel(props) {
      globalThis.__u5Panel = props;
      return React.createElement("div", { "data-fake-remote": props.deviceId, "data-name": props.deviceName }, props.agent ? props.agent.text : "");
    }
  `),
  "../api/devices": dataModule(`export async function listDevices() { return { ok: true, data: [{ device_id: "mac-1", device_name: "Studio Mac" }] }; }`),
}));

test("task page, cloud run: health and owner lines, latest screen from memory, and the five controls", async () => {
  globalThis.__u5SessionReads = []; globalThis.__u5ImageReads = []; globalThis.__u5Panel = null;
  globalThis.__u5Session = { kind: "ok", session: { sessionId: "cas_01JD00000000000000000000AB", state: "running", reason: null, owner: "ai", link: "online",
    lastContactAt: null, current: null, observation: { width: 1280, height: 707, at: Date.parse("2026-10-27T08:41:05Z") } } };
  globalThis.__u5Image = { kind: "image", image: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }) };
  const controls = [];
  const render = (run, extra = {}) => React.createElement(LocalAgentTaskStatus, { run, artifacts: [], busy: false, readOnly: false, onControl: (action) => controls.push(action), ...extra });
  const running = model.parseLocalAgentRun(cloudWire());
  const view = await mount(render(running));
  try {
    const section = view.host.querySelector("[data-local-agent-driver='cloud']");
    assert.ok(section);
    assert.equal(view.host.querySelector("[role='status']").textContent, "云端助手正在使用你的电脑");
    assert.equal(view.host.querySelector("[data-cloud-agent-owner]").textContent, "AI 正在操作");
    const img = await waitFor(() => view.host.querySelector("[data-cloud-agent-screen] img"));
    assert.ok(img, "latest screen shown");
    assert.match(img.getAttribute("src"), /^blob:/, "an in-memory object URL, never a stored or model URL");
    assert.equal(img.getAttribute("alt"), "电脑屏幕的最新画面");
    assert.match(view.host.querySelector("[data-cloud-agent-screen] figcaption").textContent, /只在服务器内存里，只有你能看到/);
    assert.equal(globalThis.__u5SessionReads.length, 1);
    assert.equal(globalThis.__u5ImageReads.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await view.flush();
    assert.equal(globalThis.__u5SessionReads.length, 1, "no polling faster than every 10 s");
    assert.deepEqual(buttons(view.host).map((b) => b.textContent), ["暂停", "接管电脑", "停止"]);
    await click(buttons(view.host).find((b) => b.textContent === "停止"));
    assert.deepEqual(controls, ["stop"]);
    // 接管电脑: pause first, then the remote desktop in place, with the AI banner.
    await click(buttons(view.host).find((b) => b.textContent === "接管电脑"));
    assert.deepEqual(controls, ["stop", "pause"]);
    const panel = await waitFor(() => view.host.querySelector("[data-fake-remote='mac-1']"));
    assert.ok(panel, "remote desktop opened for run.deviceId");
    await waitFor(() => globalThis.__u5Panel?.deviceName === "Studio Mac");
    assert.equal(globalThis.__u5Panel.deviceName, "Studio Mac");
    assert.equal(globalThis.__u5Panel.agent.text, "AI 正在操作这台电脑；你一操作，AI 就会停手。");
    // A person took over at the computer: 交还给 AI everywhere, which is a resume.
    const human = model.parseLocalAgentRun(cloudWire({ state: "paused", report_seq: 9, owner: "human", health: { kind: "human_in_control", since: "2026-10-27T08:01:00Z" } }));
    await act(async () => view.root.render(render(human)));
    await view.flush();
    assert.equal(view.host.querySelector("[role='status']").textContent, "你正在控制电脑，AI 已暂停；点「交还给 AI」继续。");
    assert.equal(view.host.querySelector("[data-cloud-agent-owner]"), null);
    assert.equal(globalThis.__u5Panel.agent.handBack, true);
    globalThis.__u5Panel.agent.onHandBack();
    assert.deepEqual(controls, ["stop", "pause", "resume"]);
    await click(buttons(view.host).find((b) => b.textContent === "交还给 AI"));
    assert.deepEqual(controls, ["stop", "pause", "resume", "resume"]);
    // Stuck: the live line, in the viewer's clock.
    const contact = Date.now() - 125_000;
    const offline = model.parseLocalAgentRun(cloudWire({ report_seq: 10, health: { kind: "offline", since: new Date(contact + 15_000).toISOString(), last_contact_at: new Date(contact).toISOString() } }));
    await act(async () => view.root.render(render(offline)));
    await view.flush();
    assert.equal(view.host.querySelector("[role='status']").textContent, `你的电脑 2 分钟没有回应，可能已离线或休眠 · 上次联系 ${clock(contact)}`);
    assert.equal(view.host.querySelector("[data-cloud-agent-health]").getAttribute("data-cloud-agent-health"), "offline");
    // Terminal: no controls, no screen.
    await act(async () => view.root.render(render(model.parseLocalAgentRun(cloudWire({ state: "succeeded", report_seq: 11 })))));
    await view.flush();
    assert.equal(view.host.querySelector("[role='status']").textContent, "电脑任务已完成");
    assert.equal(view.host.querySelector("[data-cloud-agent-screen]"), null);
    assert.deepEqual(buttons(view.host).map((b) => b.textContent), []);
  } finally { view.unmount(); }
});

test("task page: an on-device run and a read-only view keep today's block", async () => {
  globalThis.__u5SessionReads = [];
  const device = await mount(React.createElement(LocalAgentTaskStatus, { run: model.parseLocalAgentRun(wire()), artifacts: [], busy: false, readOnly: false, onControl() {} }));
  try {
    assert.equal(device.host.querySelector("[data-local-agent-driver]"), null);
    assert.deepEqual(buttons(device.host).map((b) => b.textContent), ["暂停电脑任务", "停止电脑任务"]);
    assert.equal(device.host.querySelector("[role='status']").textContent, "电脑上的 AI 正在执行");
    assert.equal(globalThis.__u5SessionReads.length, 0, "no session route for on-device runs");
  } finally { device.unmount(); }
  const shared = await mount(React.createElement(LocalAgentTaskStatus, { run: model.parseLocalAgentRun(cloudWire()), artifacts: [], busy: false, readOnly: true, onControl() {} }));
  try { assert.deepEqual(buttons(shared.host).map((b) => b.textContent), []); } finally { shared.unmount(); }
});

test("polling continues while the computer run is live even if the task row is not running", async () => {
  const { useAgentThreadPolling } = await import(await compileModule("src/shell/agent-thread/useAgentThreadPolling.ts"));
  const reads = [];
  const Probe = ({ status, keepAlive }) => {
    useAgentThreadPolling("task-1", status, async (id) => { reads.push(id); return { status, changed: false }; }, 0, keepAlive);
    return null;
  };
  const view = await mount(React.createElement(Probe, { status: "stopped", keepAlive: true }));
  try {
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.ok(reads.length >= 2, `kept polling a paused/stopping run (${reads.length})`);
    await act(async () => view.root.render(React.createElement(Probe, { status: "stopped", keepAlive: false })));
    const settled = reads.length;
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(reads.length, settled, "stops once the run is terminal and the task is not running");
  } finally { view.unmount(); }
});

test("transcript: device_status renders the kind's fixed sentence as a notice; unknown kinds keep the stored text", async () => {
  const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
    "../i18n/ui/useUI": ttStub,
    "./share/share-clipboard": dataModule("export async function writeClipboardText(){ return true; }"),
  }));
  const notice = (meta, content = "你的电脑没有回应，可能已离线或休眠。") => React.createElement(AgentTranscriptBubble, {
    message: { id: 9, role: "assistant", kind: "device_status", content, meta },
  });
  const view = await mount(notice({ text: "你的电脑没有回应，可能已离线或休眠。", health: { kind: "offline", since: "2026-10-27T08:41:23Z" }, local_run: { run_id: "r", driver: "cloud" } }));
  try {
    const node = view.host.querySelector("[data-device-status]");
    assert.equal(node.getAttribute("data-device-status"), "offline");
    assert.equal(node.getAttribute("role"), "status");
    // C11-FW: the sentence, then its time from meta.health in the viewer's clock.
    assert.ok(node.textContent.startsWith("你的电脑没有回应，可能已离线或休眠。"), node.textContent);
    assert.ok(node.querySelector("[data-device-status-time]"));
    assert.equal(view.host.querySelectorAll("button").length, 0, "a notice has no copy/regenerate/share actions");
    await act(async () => view.root.render(notice({ text: "新的服务器提示", health: { kind: "brand_new" } }, "新的服务器提示")));
    assert.equal(view.host.querySelector("[data-device-status]").textContent, "新的服务器提示");
    await act(async () => view.root.render(notice({ text: "x", health: { kind: "ok" } }, "x")));
    assert.equal(view.host.querySelector("[data-device-status]").textContent, "电脑已恢复，AI 会先重新查看屏幕再继续。");
  } finally { view.unmount(); }
});

test("remote desktop opened from a task: AI banner and 交还给 AI only; hand back releases this viewer's input first", async () => {
  const { RemoteDesktopPanel } = await import(await compileModule("src/pages/RemoteDesktopPanel.tsx", { "../i18n/ui/useUI": ttStub }));
  const sent = [];
  const client = {
    async createSession() { return { ok: true, data: { session_id: "rd-1", state: "pending_consent", expires_at: "2099-01-01T00:00:00Z" } }; },
    async getFrame() { await new Promise((resolve) => setTimeout(resolve, 20)); return { ok: true, data: { state: "pending_consent", frame: null } }; },
    async sendInput(...args) { sent.push(args); return { ok: true, data: { accepted: true } }; },
    async closeSession() { return { ok: true, data: { closed: true } }; },
  };
  const handBacks = [];
  const panel = (agent) => React.createElement(RemoteDesktopPanel, { deviceId: "mac-1", deviceName: "Studio Mac", client, onClose() {}, agent });
  const view = await mount(panel({ text: "你正在控制电脑，AI 已暂停；点「交还给 AI」继续。", handBack: true, busy: false, onHandBack: () => handBacks.push(1) }));
  try {
    const banner = document.querySelector("[data-remote-agent-banner]");
    assert.ok(banner, "banner shown over the remote screen");
    assert.match(banner.textContent, /你正在控制电脑，AI 已暂停/);
    await click(document.querySelector("[data-remote-agent-hand-back]"));
    assert.deepEqual(handBacks, [1]);
    await act(async () => view.root.render(panel({ text: "AI 正在操作这台电脑；你一操作，AI 就会停手。", handBack: false, busy: false, onHandBack() {} })));
    assert.equal(document.querySelector("[data-remote-agent-hand-back]"), null);
    await act(async () => view.root.render(panel(undefined)));
    assert.equal(document.querySelector("[data-remote-agent-banner]"), null, "opened from 我的设备: today's panel");
    assert.deepEqual(sent, [], "the banner never sends input");
  } finally { view.unmount(); }
});

test("source: the panel's media/input paths are untouched and the thumbnail is never cached", () => {
  const status = readFileSync(new URL("../src/shell/LocalAgentTaskStatus.tsx", import.meta.url), "utf8");
  assert.match(status, /const SCREEN_POLL_MS = 10_000;/);
  assert.match(status, /URL\.revokeObjectURL/);
  assert.doesNotMatch(status, /localStorage|sessionStorage|indexedDB|caches\./);
  const transportSource = readFileSync(new URL("../src/lib/cloud-agent-api.ts", import.meta.url), "utf8");
  assert.match(transportSource, /cache: "no-store"/);
  assert.match(transportSource, /credentials: "omit"/);
  const chat = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.match(chat, /useAgentThreadPolling\(taskId, status, refresh, pollEpoch, isLocalExecution && localAgentRunLive\(localRun\)\)/);
});

// ------------------------------------------------------------------ portal gap
// T3a found that the portal's createAgentTask (meeting minutes, project
// workspace) returned `detail` objects as `error` ("[object Object]" toasts).
const PORTAL = new URL("../../oceanleo/lib/oceanleo-ai.ts", import.meta.url);
test("portal createAgentTask: refusals are the translated sentence, unconfirmed opens the same task, cloud sends are confirmed", {
  skip: !(await import("node:fs")).existsSync(PORTAL),
}, async () => {
  const uiLib = new URL("../src/lib/", import.meta.url);
  const { createAgentTask } = await import(await compileModule("../oceanleo/lib/oceanleo-ai.ts", {
    "@/lib/oceanleo-auth": dataModule(`
      export const GATEWAY_BASE = "https://api.dev.oceanleo.com";
      export function browserClient() { return { auth: { async getSession() { return { data: { session: { access_token: "t", user: { id: "u1" } } } }; } } }; }
      export async function accessToken() { return "t"; }
      export function oceanleoConfigured() { return true; }
      export function normalizeCnPhone() {} export async function sendPhoneOtp() {} export async function verifyPhoneOtp() {}
      export function wechatLoginUrl() { return ""; } export async function signOutEverywhere() {}
    `),
    "@/lib/money": dataModule("export function currencySymbol(){return '$'} export function majorToMinor(v){return v} export function minorToMajor(v){return v} export function normalizeCurrency(v){return v}"),
    "@/lib/payer-storage": dataModule("export function payerRequestFields(){ return {}; }"),
    "@oceanleo/ui/lib": dataModule(`
      export { executionTargetRequestFields, readExecutionTarget } from ${JSON.stringify(new URL("execution-target.ts", uiLib).href)};
      export { localAgentFailure } from ${JSON.stringify(new URL("local-agent-task.ts", uiLib).href)};
      export async function cloudDriverPreflight(target) { (globalThis.__portalPreflight ||= []).push(target); return globalThis.__portalRefusal ?? null; }
    `),
    "@oceanleo/ui": dataModule(["connectMcp", "disconnectMcp", "getMcpConnections", "getMcpRegistry", "mcpGatewayDetail", "mcpOauthMessageOrigin",
      "mcpOauthOpensPortalPage", "mcpOauthPortalPageHref", "mcpOauthReturnOrigin", "probeMcp", "startMcpOauth", "toggleMcp"].map((name) => `export function ${name}() {}`).join("\n")),
  }));
  const original = globalThis.fetch;
  let reply;
  const posts = [];
  globalThis.fetch = async (url, init) => { posts.push(JSON.parse(init.body)); return reply(); };
  const mac = { kind: "device", id: "mac-1", name: "Mac" };
  try {
    reply = () => jsonResponse(409, { detail: { code: "local_exec_disabled" } });
    assert.deepEqual(await createAgentTask({ prompt: "会议纪要", mode: "agent", executionTarget: mac }),
      { error: model.LOCAL_AGENT_COPY.localExecDisabled, refusal: model.LOCAL_AGENT_COPY.localExecDisabled });
    reply = () => jsonResponse(409, { detail: { code: "cloud_agent_unavailable", reason: "ai_busy" } });
    assert.equal((await createAgentTask({ prompt: "x", mode: "agent", executionTarget: mac })).refusal, model.CLOUD_AGENT_COPY.refusedBusy);
    reply = () => jsonResponse(503, { detail: { code: "local_agent_dispatch_unconfirmed", task_id: "task-9" } });
    assert.deepEqual(await createAgentTask({ prompt: "x", mode: "agent", executionTarget: mac }), { task_id: "task-9", refusal: model.LOCAL_AGENT_COPY.dispatchUnconfirmed });
    reply = () => jsonResponse(402, { detail: { code: "insufficient_credits", message: "余额不足" } });
    assert.deepEqual(await createAgentTask({ prompt: "x", mode: "agent", executionTarget: { kind: "cloud" } }), { error: "余额不足" }, "a cloud task keeps its own words, never an object");
    reply = () => { throw new TypeError("network"); };
    assert.equal((await createAgentTask({ prompt: "x", mode: "agent", executionTarget: mac })).refusal, model.LOCAL_AGENT_COPY.receiptLost);
    // driver:"cloud": the route must confirm first; a refusal sends nothing.
    posts.length = 0;
    globalThis.__portalRefusal = { code: "CLOUD_AGENT_UNAVAILABLE", reason: "envelope_expired" };
    const cloudMac = { ...mac, driver: "cloud" };
    assert.equal((await createAgentTask({ prompt: "x", mode: "agent", executionTarget: cloudMac })).refusal, model.CLOUD_AGENT_COPY.refusedExpired);
    assert.equal(posts.length, 0);
    globalThis.__portalRefusal = null;
    reply = () => jsonResponse(200, { task_id: "t1" });
    assert.deepEqual(await createAgentTask({ prompt: "x", mode: "agent", executionTarget: cloudMac }), { task_id: "t1" });
    assert.deepEqual(posts[0].execution_target, { kind: "device", id: "mac-1", driver: "cloud" });
  } finally { globalThis.fetch = original; delete globalThis.__portalRefusal; delete globalThis.__portalPreflight; }
  // Both portal paths render the sentence through tt.
  const home = readFileSync(new URL("../../oceanleo/app/_components/home-content.tsx", import.meta.url), "utf8");
  assert.match(home, /result\.refusal \? tt\(result\.refusal\)/);
  const workspace = readFileSync(new URL("../../oceanleo/components/project/ProjectWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /result\.refusal\s*\?\s*tt\(result\.refusal\)/);
});
