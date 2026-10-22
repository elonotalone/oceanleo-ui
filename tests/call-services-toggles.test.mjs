// calls-v2 W06：转写/录制开关、状态徽标、字幕行、服务宿主（合同 §3.5 / §3.6 / §3.9；验收 A12、A13、A17）。
// 覆盖：API 调用形状（路径、方法、载荷）、错误文案映射（存储未开通 = 原话「录制存储尚未开通」）、
//       17 语文案齐全、状态仓（以服务端为准 + 请求结果短暂覆盖、进行中、错误自动消失、换通话丢弃迟到结果、
//       隐藏字幕记住选择、说话人名册）、上行编排（何时采集、静音停、换设备重开、失败不死循环、帧送达）、
//       组件（jsdom 真渲染：徽标、开关文案与可读名、存储未开通的说明、字幕一行/两行与说话人、隐藏/显示）、
//       宿主接线（字幕事件、控制器 update/dispose）、源码约束（采集优先 clone 引擎轨道、只用 ui.css 已有工具类）。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const SERVICES_DIR = new URL("../src/shell/messages/call/services/", import.meta.url);

const errors = await import("../src/shell/messages/call/services/errors.ts");
const storeMod = await import("../src/shell/messages/call/services/store.ts");
const controllerMod = await import("../src/shell/messages/call/services/controller.ts");
const uplinkMod = await import("../src/shell/messages/call/services/uplink.ts");
const ids = await import("../src/shell/messages/call/services/ids.ts");
const { CALL_SERVICES_MESSAGES } = await import("../src/i18n/ui/messages/call-services-copy.ts");
const { LOCALES } = await import("../src/i18n/config.ts");
const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
const { default: BASE_EN } = await import("../src/i18n/ui/messages/en.ts");

const TRANSLATED = LOCALES.filter((locale) => locale !== "zh");

// ---------------------------------------------------------------------------
// 编译台：API（假 imFetch）与组件（假引擎 / 假状态仓入口 / 假 IM 事件 / 假翻译）
// ---------------------------------------------------------------------------

const clientStub = dataModule(`
  export class ImApiError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }
  export async function imFetch(path, init = {}) {
    (globalThis.__W06_fetches ||= []).push({ path, init });
    const reply = globalThis.__W06_reply;
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(path, init) : reply;
  }
`);
const uiStub = dataModule(`
  export function useUI() {
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);
const engineStub = dataModule(`
  export function useCall() { return globalThis.__W06_call; }
`);
const runtimeStub = dataModule(`
  export const servicesStore = new Proxy({}, { get(_target, prop) { return globalThis.__W06_store[prop]; } });
  export function createBrowserCaptionsController() { return globalThis.__W06_makeController(); }
`);
const imHooksStub = dataModule(`
  export function useImEvent(type, handler) { (globalThis.__W06_im ||= {})[type] = handler; }
`);

const api = await import(
  await compileModule("src/shell/messages/call/services/api.ts", { "../../../../lib/im/client": clientStub })
);
const services = await import(
  await compileModule("src/shell/messages/call/services/index.ts", {
    "../../../../lib/im/client": clientStub,
    "../../../../i18n/ui/useUI": uiStub,
    "../engine": engineStub,
    "./runtime": runtimeStub,
    "../../realtime/hooks": imHooksStub,
  })
);

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function fakeClock() {
  let now = 1_000_000;
  const timers = new Map();
  let seq = 1;
  return {
    now: () => now,
    setTimer(fn, ms) {
      const id = seq++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(ms) {
      now += ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [id, t] = due[0];
        timers.delete(id);
        t.fn();
      }
    },
    pending: () => timers.size,
  };
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function makeStore({ clock = fakeClock(), storage = memoryStorage(), api: apiImpl } = {}) {
  const calls = [];
  const defaultApi = {
    async setTranscription(callId, enabled) {
      calls.push(["transcription", callId, enabled]);
      return { transcription: { enabled, started_by: enabled ? "u-me" : null, started_at: enabled ? "2026-10-23T00:00:00Z" : null } };
    },
    async startRecording(callId) {
      calls.push(["start", callId]);
      return { recording: recordingView("starting") };
    },
    async stopRecording(callId) {
      calls.push(["stop", callId]);
      return { recording: recordingView("stopping") };
    },
  };
  const store = storeMod.createServicesStore({
    api: apiImpl ? apiImpl(calls) : defaultApi,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    storage: () => storage,
  });
  return { store, calls, clock, storage };
}

function recordingView(state, extra = {}) {
  return {
    recording_id: "rec-1",
    state,
    started_by: "u-a",
    started_at: "2026-10-23T00:00:00Z",
    stopped_by: null,
    stopped_at: null,
    error: null,
    ...extra,
  };
}

const ME = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

function snapshot(over = {}) {
  const server = {
    call_id: "call-1",
    conversation_id: "conv-1",
    status: "active",
    started_by: "u-a",
    started_at: "2026-10-23T00:00:00Z",
    ended_at: null,
    ended_reason: null,
    participants: [],
    participant_count: 2,
    ring: null,
    recording: null,
    transcription: null,
    controls: [],
    ...(over.server ?? {}),
  };
  return {
    phase: "connected",
    conversationId: "conv-1",
    conversationTitle: "群",
    callId: "call-1",
    startedAt: "2026-10-23T00:00:00Z",
    participants: [
      { participantId: ME, userId: "u-me", displayName: "测试甲", avatarUrl: null, isMe: true, mic: true, camera: false, screen: false, speaking: false, level: 0, network: 5, connection: "connected", locallyMuted: false },
      { participantId: OTHER.replace(/-/g, ""), userId: "u-b", displayName: "测试乙", avatarUrl: null, isMe: false, mic: true, camera: false, screen: false, speaking: false, level: 0, network: 5, connection: "connected", locallyMuted: false },
    ],
    order: [],
    visibleIds: [],
    overflowCount: 0,
    screenSharerId: null,
    me: { mic: true, camera: false, screen: false, audioOnly: false, micDeviceId: "mic-1", cameraDeviceId: null, speakerDeviceId: null, network: 5 },
    aloneDeadline: null,
    issues: [],
    incoming: null,
    error: null,
    limits: { maxParticipants: 50, maxVideo: 25 },
    ...over,
    server: over.server === null ? null : server,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------
// A. API 调用形状
// ---------------------------------------------------------------------------

test("录制 API：开始/停止 = POST /v1/im/calls/{id}/recording {action}；详情与播放 = GET", async () => {
  const seen = [];
  const recording = api.createRecordingApi(async (path, init = {}) => {
    seen.push({ path, method: init.method ?? "GET", json: init.json });
    return { ok: true };
  });
  await recording.start("call 1");
  await recording.stop("call-1");
  await recording.get("rec/1");
  await recording.play("rec-1");
  assert.deepEqual(seen, [
    { path: "/v1/im/calls/call%201/recording", method: "POST", json: { action: "start" } },
    { path: "/v1/im/calls/call-1/recording", method: "POST", json: { action: "stop" } },
    { path: "/v1/im/calls/recordings/rec%2F1", method: "GET", json: undefined },
    { path: "/v1/im/calls/recordings/rec-1/play", method: "GET", json: undefined },
  ]);
});

test("转写 API：开关 = POST /v1/im/calls/{id}/transcription {enabled: 布尔}；全文 = GET /transcript", async () => {
  const seen = [];
  const transcription = api.createTranscriptionApi(async (path, init = {}) => {
    seen.push({ path, method: init.method ?? "GET", json: init.json });
    return {};
  });
  await transcription.setEnabled("call-1", true);
  await transcription.setEnabled("call-1", 0);
  await transcription.transcript("call-1");
  assert.deepEqual(seen, [
    { path: "/v1/im/calls/call-1/transcription", method: "POST", json: { enabled: true } },
    { path: "/v1/im/calls/call-1/transcription", method: "POST", json: { enabled: false } },
    { path: "/v1/im/calls/call-1/transcript", method: "GET", json: undefined },
  ]);
});

test("默认实例走 IM 请求客户端（带 token 与网关地址），返回体原样不拆包", async () => {
  globalThis.__W06_fetches = [];
  globalThis.__W06_reply = { recording: recordingView("starting") };
  const out = await api.recordingApi.start("c1");
  assert.equal(out.recording.state, "starting");
  globalThis.__W06_reply = { url: "https://oss.example/x.mp4?sig", expires_at: "2026-10-23T00:10:00Z" };
  const play = await api.recordingApi.play("r1");
  assert.equal(play.url, "https://oss.example/x.mp4?sig");
  globalThis.__W06_reply = { segments: [], minutes: null };
  assert.deepEqual(await api.transcriptionApi.transcript("c1"), { segments: [], minutes: null });
  assert.deepEqual(
    globalThis.__W06_fetches.map((f) => f.path),
    ["/v1/im/calls/c1/recording", "/v1/im/calls/recordings/r1/play", "/v1/im/calls/c1/transcript"],
  );
  assert.equal(services.recordingApi.start.length, 1, "index 再导出的就是同一套方法");
  assert.equal(typeof services.transcriptionApi.setEnabled, "function");
});

// ---------------------------------------------------------------------------
// B. 错误文案映射
// ---------------------------------------------------------------------------

test("错误映射：存储未开通原话「录制存储尚未开通」；其余按码、再按 HTTP 状态归类", () => {
  const map = (status, code) => errors.toServiceError(new ApiError(status, code));
  assert.deepEqual(map(503, "recording_storage_unavailable"), { code: "recording_storage_unavailable", message: "录制存储尚未开通" });
  assert.equal(map(503, "asr_unavailable").message, "实时转写暂不可用，请稍后再试");
  assert.equal(map(429, "rate_limited").message, "操作太频繁，请稍后再试");
  assert.equal(map(403, "not_participant").message, "你已不在通话中");
  assert.equal(map(404, "call_unavailable").message, "这通通话已经结束");
  assert.equal(map(403, "not_member").message, "你已不在这个会话里");
  assert.equal(map(403, "removed_from_conversation").message, "你已不在这个会话里");
  assert.equal(map(0, "network").message, "网络不通，请稍后再试");
  assert.equal(map(401, "unauthorized").message, "登录已过期，请重新登录");
  assert.equal(map(401, "http_401").message, "登录已过期，请重新登录");
  assert.equal(map(429, "quota_exceeded").message, "今天的录制次数已用完，请明天再试", "默认按录制开关（W02 的每日次数上限）");
  assert.equal(map(404, "http_404").message, "这通通话已经结束");
  assert.equal(map(500, "http_500").message, "操作没有成功，请稍后再试");
  assert.deepEqual(errors.toServiceError(new Error("boom")), { code: "unknown", message: "操作没有成功，请稍后再试" });
  assert.deepEqual(errors.toServiceError(null), { code: "unknown", message: "操作没有成功，请稍后再试" });
});

test("错误映射：W02 / W03 后端实际会给的码（graph.fail）逐条有专门说明，按开关区分", () => {
  const rec = (status, code) => errors.toServiceError(new ApiError(status, code), "recording").message;
  const tr = (status, code) => errors.toServiceError(new ApiError(status, code), "transcription").message;
  // W02 call_recording.py
  assert.equal(rec(429, "quota_exceeded"), "今天的录制次数已用完，请明天再试");
  assert.equal(rec(409, "conflict"), "录制状态刚刚变了，请再试一次");
  assert.equal(rec(503, "unavailable"), "录制暂时无法开始，请稍后再试");
  assert.equal(rec(409, "recording_start_failed"), "通话里还没有人连上，稍后再试");
  assert.equal(rec(503, "recording_start_failed"), "录制服务暂时不可用，请稍后再试");
  assert.equal(rec(503, "recording_unavailable"), "录制服务繁忙，请稍后再试");
  assert.equal(rec(404, "recording_unavailable"), "没有进行中的录制");
  assert.equal(rec(503, "artc_not_configured"), "实时音视频尚未配置，暂时无法录制");
  assert.equal(rec(429, "rate_limited"), "操作太频繁，请稍后再试");
  // W03 call_captions.py
  assert.equal(tr(503, "unavailable"), "转写暂时不可用，请稍后再试");
  assert.equal(tr(503, "asr_unavailable"), "实时转写暂不可用，请稍后再试");
  assert.equal(tr(429, "rate_limited"), "操作太频繁，请稍后再试");
  assert.equal(tr(429, "quota_exceeded"), "操作太频繁，请稍后再试");
  // W01 call_events.py require_live_participant
  assert.equal(tr(403, "not_participant"), "你已不在通话中");
  assert.equal(tr(404, "call_unavailable"), "这通通话已经结束");
  // 映射的每个出口都在 SERVICE_ERROR_MESSAGES 里（下一条用例据此核 17 语）。
  const outputs = new Set(errors.SERVICE_ERROR_MESSAGES);
  for (const [status, code, kind] of [[429, "quota_exceeded", "recording"], [409, "conflict", "transcription"], [418, "teapot", "recording"], [0, "network", "recording"]]) {
    assert.ok(outputs.has(errors.serviceErrorMessage(code, status, kind)));
  }
});

// ---------------------------------------------------------------------------
// C. 文案：17 种语言
// ---------------------------------------------------------------------------

function serviceSourceFiles() {
  return readdirSync(SERVICES_DIR)
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .map((name) => ({ name, text: readFileSync(new URL(name, SERVICES_DIR), "utf8") }));
}

function literalTtKeys() {
  const keys = new Set();
  for (const { text } of serviceSourceFiles()) {
    for (const match of text.matchAll(/\btt\(\s*"([^"]+)"/g)) keys.add(match[1]);
  }
  return keys;
}

test("文案：界面里每一条 tt() 原文与每一条错误文案，16 个非中文语种都有译文", () => {
  const keys = new Set([...literalTtKeys(), ...errors.SERVICE_ERROR_MESSAGES]);
  assert.ok(keys.size >= 20, `只收到 ${keys.size} 条，扫描失效`);
  for (const must of ["录制中", "转写中", "录制存储尚未开通", "开启转写", "开始录制", "隐藏字幕", "我"]) {
    assert.ok(keys.has(must), `没扫到「${must}」`);
  }
  const missing = [];
  for (const key of keys) {
    if (UI_MESSAGES.zh[key] !== undefined) assert.equal(UI_MESSAGES.zh[key], key, `中文站 key 等于值：${key}`);
    for (const locale of TRANSLATED) {
      const value = UI_MESSAGES[locale]?.[key];
      if (!value) missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("文案：本表 17 语齐全、不把中文抄进非中日韩语种、日韩不整句照抄；不改写基础英文词典", () => {
  const source = CALL_SERVICES_MESSAGES.zh;
  const keys = Object.keys(source);
  assert.ok(keys.length >= 24);
  const HAN = /[一-鿿]/;
  for (const key of keys) {
    assert.equal(source[key], key);
    for (const locale of TRANSLATED) {
      const value = CALL_SERVICES_MESSAGES[locale][key];
      assert.ok(value && value.trim(), `${locale} 缺：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) assert.ok(!HAN.test(value), `${locale} 里有汉字：${value}`);
      if (locale === "ja" || locale === "ko") assert.notEqual(value, key, `${locale} 照抄了中文：${key}`);
    }
    if (Object.hasOwn(BASE_EN, key)) {
      assert.equal(CALL_SERVICES_MESSAGES.en[key], BASE_EN[key], `与基础英文词典冲突：${key}`);
    }
  }
  assert.equal(CALL_SERVICES_MESSAGES.en["录制存储尚未开通"], "Recording storage isn’t set up yet");
  assert.equal(Object.hasOwn(source, "我"), false, "「我」用基础词典，不在本表重复");
});

test("文案：其他通话分表若用了同一条中文原文，译文必须一致（聚合时后者会悄悄覆盖前者）", async () => {
  const others = ["call-ui-copy", "call-chat-copy", "call-control-copy", "call-diagnostics-copy"];
  const conflicts = [];
  for (const name of others) {
    const mod = await import(`../src/i18n/ui/messages/${name}.ts`);
    const table = Object.values(mod).find((value) => value && typeof value === "object" && value.en);
    if (!table) continue;
    for (const key of Object.keys(CALL_SERVICES_MESSAGES.zh)) {
      for (const locale of TRANSLATED) {
        const theirs = table[locale]?.[key];
        if (theirs && theirs !== CALL_SERVICES_MESSAGES[locale][key]) conflicts.push(`${name} ${locale} ${key}`);
      }
    }
  }
  assert.deepEqual(conflicts, []);
});

// ---------------------------------------------------------------------------
// D. 状态仓
// ---------------------------------------------------------------------------

test("转写开关：按当前状态取反调 API；进行中；请求结果顶到服务端快照变化为止（最多 10 秒）", async () => {
  const { store, calls, clock } = makeStore();
  store.setCall("call-1");
  const pending = store.toggleTranscription("call-1", null);
  assert.equal(store.getState().transcription.busy, true);
  await pending;
  assert.deepEqual(calls, [["transcription", "call-1", true]]);
  const slot = store.getState().transcription;
  assert.equal(slot.busy, false);
  assert.equal(storeMod.effectiveView(null, slot.override, clock.now()).enabled, true, "广播未到：用请求结果");
  const fromServer = { enabled: false, started_by: null, started_at: null };
  assert.equal(storeMod.effectiveView(fromServer, slot.override, clock.now()), fromServer, "快照变了：以服务端为准");
  clock.advance(10_000);
  assert.equal(store.getState().transcription.override, null, "10 秒后覆盖自动清掉");
  // 再点一次：服务端说开着 → 关。
  await store.toggleTranscription("call-1", { enabled: true, started_by: "u-a", started_at: "x" });
  assert.deepEqual(calls[1], ["transcription", "call-1", false]);
});

test("录制开关：没在录（null/ready/failed/processing）→ 开始；starting/recording → 停止；stopping → 不动", async () => {
  for (const [server, expected] of [
    [null, "start"],
    [recordingView("ready"), "start"],
    [recordingView("failed"), "start"],
    [recordingView("processing"), "start"],
    [recordingView("starting"), "stop"],
    [recordingView("recording"), "stop"],
  ]) {
    const { store, calls } = makeStore();
    store.setCall("call-1");
    await store.toggleRecording("call-1", server);
    assert.equal(calls[0][0], expected, `${server?.state ?? "null"} → ${expected}`);
  }
  const { store, calls } = makeStore();
  store.setCall("call-1");
  await store.toggleRecording("call-1", recordingView("stopping"));
  assert.equal(calls.length, 0);
  assert.equal(storeMod.recordingIsActive(recordingView("starting")), true);
  assert.equal(storeMod.recordingIsActive(recordingView("processing")), false);
});

test("录制存储未开通：不假装成功——没有覆盖成「录制中」，错误原话、常驻标记；之后成功则清掉标记", async () => {
  let fail = true;
  const { store, clock } = makeStore({
    api: (calls) => ({
      async setTranscription() {
        return undefined;
      },
      async startRecording(callId) {
        calls.push(["start", callId]);
        if (fail) throw new ApiError(503, "recording_storage_unavailable");
        return { recording: recordingView("starting") };
      },
      async stopRecording() {
        return { recording: recordingView("stopping") };
      },
    }),
  });
  store.setCall("call-1");
  await store.toggleRecording("call-1", null);
  const slot = store.getState().recording;
  assert.equal(slot.override, null, "没有任何「录制中」的覆盖");
  assert.equal(slot.error.code, "recording_storage_unavailable");
  assert.equal(slot.error.message, "录制存储尚未开通");
  assert.equal(slot.storageUnavailable, true);
  clock.advance(8_000);
  assert.equal(store.getState().recording.error, null, "气泡 8 秒后消失");
  assert.equal(store.getState().recording.storageUnavailable, true, "说明常驻（本通话内）");
  fail = false;
  await store.toggleRecording("call-1", null);
  assert.equal(store.getState().recording.storageUnavailable, false);
  assert.equal(store.getState().recording.override.value.state, "starting");
});

test("换通话：清空字幕/错误/覆盖；迟到的开关结果丢弃；同一时刻只有一个请求", async () => {
  let resolve;
  const { store } = makeStore({
    api: () => ({
      setTranscription: () => new Promise((r) => (resolve = r)),
      startRecording: async () => undefined,
      stopRecording: async () => undefined,
    }),
  });
  store.setCall("call-1");
  const first = store.toggleTranscription("call-1", null);
  await store.toggleTranscription("call-1", null); // busy：直接返回
  store.setCall("call-2");
  resolve({ transcription: { enabled: true, started_by: "u", started_at: "t" } });
  await first;
  assert.equal(store.getState().callId, "call-2");
  assert.equal(store.getState().transcription.override, null);
  assert.equal(store.getState().transcription.busy, false);
  await store.toggleTranscription("call-1", null);
  assert.equal(store.getState().transcription.busy, false, "不是当前通话的 callId 不发请求");
});

test("隐藏字幕：写进本地存储并在下次读出；存储不可用也不报错", () => {
  const storage = memoryStorage();
  const { store } = makeStore({ storage });
  assert.equal(store.getState().captionsHidden, false);
  store.setCaptionsHidden(true);
  assert.equal(storage.data.get(storeMod.CAPTIONS_HIDDEN_KEY), "1");
  const again = makeStore({ storage }).store;
  assert.equal(again.getState().captionsHidden, true, "刷新后记得");
  again.setCall("call-9");
  assert.equal(again.getState().captionsHidden, true, "换通话不忘");
  const broken = storeMod.createServicesStore({
    api: {},
    now: () => 0,
    setTimer: () => 0,
    clearTimer: () => undefined,
    storage: () => ({
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    }),
  });
  broken.setCaptionsHidden(true);
  assert.equal(broken.getState().captionsHidden, true);
});

test("字幕与说话人：只收当前通话；名册合并不删、换通话清空；淡出", () => {
  const { store, clock } = makeStore();
  store.setCall("call-1");
  store.rememberSpeakers([{ participantId: OTHER, userId: "u-b", displayName: "测试乙", isMe: false }]);
  store.rememberSpeakers([{ participantId: ME, userId: "u-me", displayName: "测试甲", isMe: true }]);
  assert.deepEqual(Object.keys(store.getState().speakers).sort(), [ids.participantKey(ME), ids.participantKey(OTHER)].sort());
  const before = store.getState();
  store.rememberSpeakers([{ participantId: ME, userId: "u-me", displayName: "测试甲", isMe: true }]);
  assert.equal(store.getState(), before, "名册没变化不通知");
  store.applyCaption({ call_id: "other", participant_id: OTHER, user_id: "u-b", sentence_id: 1, text: "别的通话", is_final: true });
  assert.equal(store.getState().captions.entries.length, 0);
  store.applyCaption({ call_id: "call-1", participant_id: OTHER, user_id: "u-b", sentence_id: 1, text: "你好", is_final: true });
  assert.equal(store.getState().captions.entries.length, 1);
  clock.advance(8_000);
  store.prune();
  assert.equal(store.getState().captions.entries.length, 0);
  store.setCall("call-2");
  assert.deepEqual(store.getState().speakers, {});
});

test("参与者 id 两种写法：去连字符比较；上行鉴权补回 UUID", () => {
  assert.equal(ids.participantKey("AB-cd"), "abcd");
  assert.equal(ids.participantUuid(ME.replace(/-/g, "")), ME);
  assert.equal(ids.participantUuid(ME), ME);
  assert.equal(ids.participantUuid(""), null);
  assert.equal(ids.participantUuid(null), null);
  assert.equal(ids.participantUuid("custom-id"), "custom-id");
});

// ---------------------------------------------------------------------------
// E. 上行编排（真上行状态机 + 假 WebSocket + 假采集）
// ---------------------------------------------------------------------------

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = null;
    this.bufferedAmount = 0;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
  }
  send(data) {
    this.sent.push(data);
  }
  close(code) {
    this.closed = code ?? 1000;
  }
}

function controllerHarness({ failCapture = null } = {}) {
  const clock = fakeClock();
  const sockets = [];
  const uplink = uplinkMod.createCaptionsUplink({
    url: (callId) => `wss://gw.test/v1/im/calls/${callId}/captions/ws`,
    getToken: async () => "jwt",
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    random: () => 0.5,
    now: clock.now,
  });
  const captures = [];
  const startCapture = async (request) => {
    const handle = { sampleRate: 48000, stopped: false, request, stop() { this.stopped = true; } };
    captures.push(handle);
    if (startCapture.fail) throw new Error(startCapture.fail);
    return handle;
  };
  startCapture.fail = failCapture;
  const captureStates = [];
  const uplinkStates = [];
  const controller = controllerMod.createCaptionsController({
    uplink,
    startCapture,
    onCapture: (state) => captureStates.push(state),
    onUplink: (status) => uplinkStates.push(status.state),
  });
  return { controller, uplink, sockets, captures, startCapture, captureStates, uplinkStates, clock };
}

const TARGET = { callId: "call-1", participantId: ME, inCall: true, transcription: true, mic: true, micDeviceId: "mic-1" };

function sine48k(ms) {
  const n = Math.round(48 * ms);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 48000);
  return out;
}

test("编排：要转写 + 开麦 → 开采集、建上行；ready 后 48 kHz 采样变成 3200 字节的帧送出", async () => {
  const h = controllerHarness();
  h.controller.update(TARGET);
  await flush();
  assert.equal(h.captures.length, 1);
  assert.equal(h.captures[0].request.deviceId, "mic-1", "采同一个麦克风设备");
  assert.equal(h.controller.captureState(), "running");
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ type: "ready", sample_rate: 16000 }) });
  h.captures[0].request.onSamples(sine48k(250));
  const frames = socket.sent.filter((item) => typeof item !== "string");
  assert.equal(frames.length, 2, "250 ms → 两个完整的 100 ms 帧（余 50 ms 等下一块）");
  for (const frame of frames) assert.equal(frame.byteLength, 3200);
});

test("编排：没开转写 / 静音 / 不在通话 → 不采集；静音后开麦重新采集（不在静音时占着麦克风）", async () => {
  const h = controllerHarness();
  h.controller.update({ ...TARGET, transcription: false });
  h.controller.update({ ...TARGET, mic: false });
  h.controller.update({ ...TARGET, inCall: false });
  await flush();
  assert.equal(h.captures.length, 0);
  h.controller.update(TARGET);
  await flush();
  assert.equal(h.captures.length, 1);
  h.controller.update({ ...TARGET, mic: false });
  assert.equal(h.captures[0].stopped, true, "静音即停采集");
  assert.equal(h.controller.captureState(), "off");
  h.controller.update(TARGET);
  await flush();
  assert.equal(h.captures.length, 2);
  assert.equal(h.captures[1].stopped, false);
});

test("编排：换麦克风设备 → 停旧采集、按新设备重开；轨道自己结束 → 立刻再开一次，再结束才判失败、同一设备不死循环", async () => {
  const h = controllerHarness();
  h.controller.update(TARGET);
  await flush();
  h.controller.update({ ...TARGET, micDeviceId: "mic-2" });
  await flush();
  assert.equal(h.captures[0].stopped, true);
  assert.equal(h.captures[1].request.deviceId, "mic-2");
  h.captures[1].request.onEnded(); // 引擎换了轨道：clone 的源没了
  await flush();
  assert.equal(h.captures[1].stopped, true);
  assert.equal(h.captures.length, 3, "同一设备立刻再开一次（拿引擎的新轨道）");
  assert.equal(h.controller.captureState(), "running");
  h.captures[2].request.onEnded(); // 又结束：真没了
  await flush();
  assert.equal(h.controller.captureState(), "failed");
  h.controller.update({ ...TARGET, micDeviceId: "mic-2" });
  await flush();
  assert.equal(h.captures.length, 3, "同一设备不原地死循环");
  h.controller.update({ ...TARGET, micDeviceId: "mic-3" });
  await flush();
  assert.equal(h.captures.length, 4, "引擎换了设备 → 重开");
});

test("编排：采集失败不死循环；这台设备不另开采集 = unsupported；静音再开麦会再试一次", async () => {
  const h = controllerHarness({ failCapture: "capture_unsupported" });
  h.controller.update(TARGET);
  await flush();
  assert.equal(h.controller.captureState(), "unsupported");
  for (let i = 0; i < 5; i += 1) h.controller.update({ ...TARGET });
  await flush();
  assert.equal(h.captures.length, 1);
  h.startCapture.fail = null;
  h.controller.update({ ...TARGET, mic: false });
  h.controller.update(TARGET);
  await flush();
  assert.equal(h.captures.length, 2);
  assert.equal(h.controller.captureState(), "running");
  assert.equal(controllerMod.captureFailureState(new Error("NotAllowedError")), "failed");
});

test("编排：服务端说转写已关 → 停采集；dispose → 关上行、停采集、不再响应", async () => {
  const h = controllerHarness();
  h.controller.update(TARGET);
  await flush();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ type: "error", code: "transcription_off" }) });
  assert.equal(h.captures[0].stopped, true);
  h.controller.update({ ...TARGET, transcription: false });
  h.controller.update(TARGET);
  await flush();
  assert.equal(h.captures.length, 2);
  h.controller.dispose();
  assert.equal(h.captures[1].stopped, true);
  assert.equal(h.sockets[1].closed, 1000);
  h.controller.update(TARGET);
  await flush();
  assert.equal(h.captures.length, 2);
  assert.equal(h.sockets.length, 2);
});

test("编排：采集还没起来就静音/离开 → 起来的那一路立刻被收掉", async () => {
  const h = controllerHarness();
  let release;
  const slow = new Promise((r) => (release = r));
  const handle = { sampleRate: 48000, stopped: false, stop() { this.stopped = true; } };
  const controller = controllerMod.createCaptionsController({
    uplink: h.uplink,
    startCapture: async () => {
      await slow;
      return handle;
    },
  });
  controller.update(TARGET);
  controller.update({ ...TARGET, mic: false });
  release();
  await flush();
  await flush();
  assert.equal(handle.stopped, true);
  assert.equal(controller.captureState(), "off");
});

// ---------------------------------------------------------------------------
// F. 组件（jsdom 真渲染）
// ---------------------------------------------------------------------------

async function installDom() {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/leochat" });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  restore.push(() => {
    if (previousAct === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  return {
    window,
    restore() {
      for (const undo of restore.reverse()) undo();
      window.close();
    },
  };
}

async function mount(element, { call = snapshot(), store = makeStore().store } = {}) {
  globalThis.__W06_call = call;
  globalThis.__W06_store = store;
  const { window, restore } = await installDom();
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    store,
    async rerender(next, nextCall) {
      if (nextCall) globalThis.__W06_call = nextCall;
      await act(async () => {
        root.render(next);
      });
    },
    async click(selector) {
      await act(async () => {
        container.querySelector(selector).click();
      });
      await act(async () => {
        await flush();
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      restore();
    },
  };
}

const h = React.createElement;

test("徽标：什么都没开 → 不渲染；录制中 / 转写中 按服务端状态显示（所有人可见，role=status）", async () => {
  const off = await mount(h(services.CallServiceBadges, { mode: "dock" }));
  assert.equal(off.container.innerHTML, "");
  await off.unmount();

  const on = await mount(h(services.CallServiceBadges, { mode: "stage" }), {
    call: snapshot({ server: { recording: recordingView("recording"), transcription: { enabled: true, started_by: "u-b", started_at: "t" } } }),
  });
  const box = on.container.querySelector("[data-call-service-badges]");
  assert.equal(box.getAttribute("role"), "status");
  assert.equal(box.getAttribute("data-call-service-badges"), "stage");
  assert.match(on.container.querySelector('[data-call-badge="recording"]').textContent, /录制中/);
  assert.match(on.container.querySelector('[data-call-badge="transcription"]').textContent, /转写中/);
  await on.unmount();

  const starting = await mount(h(services.CallServiceBadges, {}), { call: snapshot({ server: { recording: recordingView("starting") } }) });
  assert.ok(starting.container.querySelector('[data-call-badge="recording"]'), "starting 也算录制中");
  await starting.unmount();

  const done = await mount(h(services.CallServiceBadges, {}), { call: snapshot({ server: { recording: recordingView("ready") } }) });
  assert.equal(done.container.innerHTML, "", "录完了（ready）不再显示录制中");
  await done.unmount();

  const notLive = await mount(h(services.CallServiceBadges, {}), {
    call: snapshot({ phase: "joining", server: { recording: recordingView("recording") } }),
  });
  assert.equal(notLive.container.innerHTML, "", "不在通话中不显示");
  await notLive.unmount();
});

test("转写开关：文案随状态、aria-pressed；点了调 API；小窗只有图标但有可读名", async () => {
  const { store, calls } = makeStore();
  store.setCall("call-1");
  const view = await mount(h(services.CallTranscriptionToggle, { mode: "stage" }), { store });
  const button = () => view.container.querySelector('[data-call-service-toggle="transcription"] button');
  assert.equal(button().textContent, "开启转写");
  assert.equal(button().getAttribute("aria-pressed"), "false");
  assert.match(button().getAttribute("title"), /所有人都会看到字幕/);
  await view.click('[data-call-service-toggle="transcription"] button');
  assert.deepEqual(calls, [["transcription", "call-1", true]]);
  assert.equal(button().textContent, "关闭转写", "广播未到：先按请求结果显示");
  assert.equal(button().getAttribute("aria-pressed"), "true");
  await view.unmount();

  const dock = await mount(h(services.CallTranscriptionToggle, { mode: "dock" }), {
    call: snapshot({ server: { transcription: { enabled: true, started_by: "u-b", started_at: "t" } } }),
  });
  const icon = dock.container.querySelector("button");
  assert.equal(icon.getAttribute("aria-label"), "关闭转写");
  assert.equal(icon.textContent, "", "小窗只有图标");
  await dock.unmount();

  const menu = await mount(h(services.CallTranscriptionToggle, { variant: "menuitem" }));
  assert.equal(menu.container.querySelector("button").getAttribute("role"), "menuitemcheckbox");
  await menu.unmount();

  const away = await mount(h(services.CallTranscriptionToggle, {}), { call: snapshot({ phase: "ended" }) });
  assert.equal(away.container.innerHTML, "", "不在通话中不出开关");
  await away.unmount();
});

test("录制开关：开始 → 停止 → 正在停止（不可点）；存储未开通给出原话说明，且不出现「录制中」", async () => {
  const idle = await mount(h(services.CallRecordingToggle, {}));
  assert.equal(idle.container.querySelector("button").textContent, "开始录制");
  await idle.unmount();

  const active = await mount(h(services.CallRecordingToggle, {}), { call: snapshot({ server: { recording: recordingView("recording") } }) });
  assert.equal(active.container.querySelector("button").textContent, "停止录制");
  assert.equal(active.container.querySelector("button").getAttribute("aria-pressed"), "true");
  await active.unmount();

  const stopping = await mount(h(services.CallRecordingToggle, {}), { call: snapshot({ server: { recording: recordingView("stopping") } }) });
  assert.equal(stopping.container.querySelector("button").textContent, "正在停止录制");
  assert.equal(stopping.container.querySelector("button").disabled, true);
  await stopping.unmount();

  const { store } = makeStore({
    api: (calls) => ({
      async setTranscription() {},
      async startRecording(callId) {
        calls.push(["start", callId]);
        throw new ApiError(503, "recording_storage_unavailable");
      },
      async stopRecording() {},
    }),
  });
  store.setCall("call-1");
  const view = await mount(
    h(React.Fragment, null, h(services.CallRecordingToggle, { mode: "stage" }), h(services.CallServiceBadges, { mode: "stage" })),
    { store },
  );
  await view.click('[data-call-service-toggle="recording"] button');
  const alert = view.container.querySelector('[role="alert"]');
  assert.ok(alert, "有明确的提示");
  assert.equal(alert.textContent, "录制存储尚未开通");
  assert.equal(view.container.querySelector('[data-call-badge="recording"]'), null, "不假装成功");
  const button = view.container.querySelector('[data-call-service-toggle="recording"] button');
  assert.equal(button.textContent, "开始录制");
  assert.ok(button.getAttribute("aria-describedby"), "按钮的可读说明指向这句话");
  assert.match(button.getAttribute("title"), /录制存储尚未开通/);
  await view.unmount();
});

function captionEvent(over) {
  return { type: "call_caption", call_id: "call-1", conversation_id: "conv-1", participant_id: OTHER, user_id: "u-b", sentence_id: 1, text: "", is_final: false, begin_ms: 0, end_ms: 0, ...over };
}

test("字幕行：转写关着不出现；小窗一行、放大视图两行；标说话人（自己是「我」，不认识的是「参与者」）", async () => {
  const { store } = makeStore();
  store.setCall("call-1");
  store.applyCaption(captionEvent({ participant_id: ME, user_id: "u-me", sentence_id: 1, text: "我们开始吧。", is_final: true }));
  store.applyCaption(captionEvent({ sentence_id: 1, text: "好的，先看数据" }));

  const off = await mount(h(services.CallCaptionsLine, { mode: "stage" }), { store });
  assert.equal(off.container.innerHTML, "", "转写没开：不显示");
  await off.unmount();

  const transcribing = snapshot({ server: { transcription: { enabled: true, started_by: "u-a", started_at: "t" } } });
  const stage = await mount(h(services.CallCaptionsLine, { mode: "stage" }), { store, call: transcribing });
  const rows = [...stage.container.querySelectorAll("[data-caption-speaker]")];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /^我/);
  assert.match(rows[0].textContent, /我们开始吧。/);
  assert.match(rows[1].textContent, /^测试乙/, "按 participantId（去连字符）对上名字");
  assert.equal(rows[1].getAttribute("data-caption-final"), "0");
  assert.equal(stage.container.querySelector("[data-call-captions]").getAttribute("role"), "region");
  await stage.unmount();

  const dock = await mount(h(services.CallCaptionsLine, { mode: "dock" }), { store, call: transcribing });
  const one = [...dock.container.querySelectorAll("[data-caption-speaker]")];
  assert.equal(one.length, 1, "小窗只一行");
  assert.match(one[0].textContent, /测试乙/);
  await dock.unmount();

  store.applyCaption(captionEvent({ participant_id: "stranger", user_id: "u-x", sentence_id: 5, text: "路过" }));
  const unknown = await mount(h(services.CallCaptionsLine, { mode: "dock" }), { store, call: transcribing });
  assert.match(unknown.container.querySelector("[data-caption-speaker]").textContent, /^参与者/);
  await unknown.unmount();
});

test("字幕行：本地隐藏（记住选择）→ 只剩「显示字幕」按钮；W07 菜单用 useCaptions().hidden/setHidden 是同一开关", async () => {
  const storage = memoryStorage();
  const { store } = makeStore({ storage });
  store.setCall("call-1");
  store.applyCaption(captionEvent({ sentence_id: 1, text: "大家好", is_final: true }));
  const call = snapshot({ server: { transcription: { enabled: true, started_by: "u-a", started_at: "t" } } });
  // 照 W07 CallControls 的用法：菜单项读 hidden、调 setHidden(!hidden)。
  function MenuLikeW07() {
    const captions = services.useCaptions();
    return h(
      "button",
      { type: "button", role: "menuitemcheckbox", "aria-checked": !captions.hidden, "data-w07-menu": "", onClick: () => captions.setHidden(!captions.hidden) },
      "显示字幕",
    );
  }
  const view = await mount(h(React.Fragment, null, h(services.CallCaptionsLine, { mode: "stage" }), h(MenuLikeW07)), { store, call });
  const menu = () => view.container.querySelector("[data-w07-menu]");
  assert.equal(menu().getAttribute("aria-checked"), "true");
  assert.ok(view.container.querySelector("[data-caption-speaker]"));
  await view.click('button[aria-label="隐藏字幕"]');
  assert.equal(storage.data.get(storeMod.CAPTIONS_HIDDEN_KEY), "1", "记住选择");
  assert.equal(view.container.querySelector("[data-caption-speaker]"), null);
  const show = view.container.querySelector('[data-call-captions="hidden"]');
  assert.equal(show.getAttribute("aria-label"), "显示字幕");
  assert.equal(menu().getAttribute("aria-checked"), "false");
  await view.click("[data-w07-menu]");
  assert.ok(view.container.querySelector("[data-caption-speaker]"), "菜单把字幕打开");
  assert.equal(storage.data.get(storeMod.CAPTIONS_HIDDEN_KEY), "0");
  await view.click('[data-call-captions] button[aria-label="隐藏字幕"]');
  await view.click('[data-call-captions="hidden"]');
  assert.ok(view.container.querySelector("[data-caption-speaker]"), "「显示字幕」按钮也能打开");
  await view.unmount();
});

test("字幕行：识别服务不可用时给出说明", async () => {
  const { store } = makeStore();
  store.setCall("call-1");
  store.setUplink({ state: "retrying", sampleRate: 16000, error: "asr_unavailable" });
  const call = snapshot({ server: { transcription: { enabled: true, started_by: "u-a", started_at: "t" } } });
  const view = await mount(h(services.CallCaptionsLine, { mode: "dock" }), { store, call });
  assert.match(view.container.textContent, /实时转写暂不可用/);
  await view.unmount();
});

test("宿主：通话中 → 控制器拿到 callId / 自己的 participant UUID / 转写 / 麦克风 / 设备；字幕事件进状态仓；卸载即停", async () => {
  const updates = [];
  let disposed = 0;
  globalThis.__W06_makeController = () => ({
    update: (target) => updates.push(target),
    captureState: () => "off",
    dispose: () => {
      disposed += 1;
    },
  });
  globalThis.__W06_im = {};
  const { store } = makeStore();
  const call = snapshot({
    participants: snapshot().participants.map((p) => (p.isMe ? { ...p, participantId: ME.replace(/-/g, "") } : p)),
    server: { transcription: { enabled: true, started_by: "u-a", started_at: "t" } },
  });
  const view = await mount(h(services.CallServicesHost, {}), { store, call });
  assert.equal(view.container.innerHTML, "", "宿主不渲染任何东西");
  assert.equal(store.getState().callId, "call-1");
  assert.deepEqual(updates.at(-1), { callId: "call-1", participantId: ME, inCall: true, transcription: true, mic: true, micDeviceId: "mic-1" });
  assert.equal(typeof globalThis.__W06_im.call_caption, "function", "订阅了 call_caption");
  await act(async () => {
    globalThis.__W06_im.call_caption(captionEvent({ sentence_id: 3, text: "收到", is_final: true }));
  });
  assert.equal(store.getState().captions.entries.length, 1);
  await act(async () => {
    globalThis.__W06_im.call_caption(captionEvent({ call_id: "old-call", sentence_id: 4, text: "旧通话", is_final: true }));
  });
  assert.equal(store.getState().captions.entries.length, 1, "别的通话的字幕不收");
  assert.ok(Object.keys(store.getState().speakers).length >= 2, "记下了说话人名册");

  await view.rerender(h(services.CallServicesHost, {}), { ...call, me: { ...call.me, mic: false } });
  assert.equal(updates.at(-1).mic, false, "静音传给控制器（它会发 pause、停采集）");
  await view.rerender(h(services.CallServicesHost, {}), { ...call, phase: "leaving" });
  assert.deepEqual(
    { callId: updates.at(-1).callId, inCall: updates.at(-1).inCall, transcription: updates.at(-1).transcription },
    { callId: null, inCall: false, transcription: false },
  );
  await view.unmount();
  assert.equal(disposed, 1);
  assert.equal(store.getState().callId, null, "卸载归零");
});

// ---------------------------------------------------------------------------
// G. 源码约束
// ---------------------------------------------------------------------------

test("采集：优先 clone 引擎的麦克风轨道（A-9），只 stop 自己的轨道；iOS 不另开采集；回声消除；AudioWorklet + 回落", () => {
  const capture = readFileSync(new URL("capture.ts", SERVICES_DIR), "utf8");
  assert.match(capture, /getLocalMicTrack/);
  assert.match(capture, /track\.clone\(\)/);
  assert.ok(capture.indexOf("engineMicTrackClone()") < capture.indexOf("openOwnMicTrack(deviceId)"), "先引擎轨道，后自己开");
  assert.match(capture, /isIosWebKit\(\)\) throw new Error\("capture_unsupported"\)/);
  assert.match(capture, /echoCancellation: true/);
  assert.match(capture, /deviceId: \{ exact: deviceId \}/);
  assert.match(capture, /audioWorklet\.addModule/);
  assert.match(capture, /createScriptProcessor/);
  assert.doesNotMatch(capture, /getter[^;]*\.stop\(\)/, "引擎原轨道从不 stop");
  const host = readFileSync(new URL("CallServicesHost.tsx", SERVICES_DIR), "utf8");
  assert.match(host, /useImEvent\("call_caption"/);
  assert.match(host, /micDeviceId/);
});

test("安全：服务目录不新增 innerHTML / dangerouslySetInnerHTML / eval / new Function / postMessage(*)", () => {
  for (const { name, text } of serviceSourceFiles()) {
    assert.doesNotMatch(text, /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/, name);
    assert.doesNotMatch(text, /postMessage\([^)]*["']\*["']/, name);
  }
});

test("样式：组件只用 ui.css 里已有的工具类（ui.css 是共享产物，不在 W06 独占面），其余走行内样式", () => {
  const css = readFileSync(new URL("../src/theme/ui.css", import.meta.url), "utf8");
  const escape = (cls) => cls.replace(/([:[\]./%#(),])/g, "\\$1");
  // 只认长得像工具类的词：变体前缀（hover:/dark:/…）+ 已知工具类前缀。行内样式的值（如 max-content）不在其列。
  const UTILITY = /^(?:[a-z-]+:)*(?:-?(?:bg|text|px|py|pt|pb|pl|pr|p|mx|my|mt|mb|ml|mr|m|gap|rounded|h|w|size|min-h|min-w|max-w|max-h|inset|top|bottom|left|right|z|items|justify|self|font|leading|tracking|opacity|shrink|grow|basis|border|ring|shadow|overflow|whitespace|animate|outline|cursor|select|pointer-events|line-clamp|break|flex|inline|grid|order|col|row|place|content|decoration|underline|transition|duration|ease|translate|scale|rotate|fill|stroke)(?:-[a-z0-9.[\]/%#(),-]+)?|flex|block|hidden|truncate|relative|absolute|fixed|sticky|sr-only|italic|uppercase|underline)$/;
  const missing = [];
  let checked = 0;
  for (const { name, text } of serviceSourceFiles().filter((f) => f.name.endsWith(".tsx"))) {
    for (const literal of text.matchAll(/"([^"\n]*)"|`([^`]*)`/g)) {
      const raw = (literal[1] ?? literal[2] ?? "").replace(/\$\{[^}]*\}/g, " ");
      for (const token of raw.split(/\s+/).filter(Boolean)) {
        if (!UTILITY.test(token)) continue;
        checked += 1;
        if (!css.includes(`.${escape(token)}`)) missing.push(`${name}: ${token}`);
      }
    }
  }
  assert.ok(checked > 40, `只检查到 ${checked} 个工具类，抽取失效`);
  assert.deepEqual([...new Set(missing)], []);
});
