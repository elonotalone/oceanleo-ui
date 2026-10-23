// calls-v2 W08 · 聊天里的通话卡片（任务书 P6；合同 §1 A2/A3/A12/A13、§3.4；仲裁 A-4 meta 白名单、A-13 录制失败）。
// 判据：每种 meta.kind 画对的东西、按钮做对的事；开始卡片的「进行中 / 已结束」以 GET …/call 与实时 call 事件为准，不靠改消息；
// 录像只放 https 签名地址；纪要正文走现成的 Markdown 组件、不用 dangerouslySetInnerHTML；meta 缺省时退回一行字。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  CALL_MESSAGE_KINDS,
  callMetaOf,
  callMetaUserIds,
  formatBytes,
  formatCallDuration,
  secondsBetween,
} from "../src/shell/messages/call/chat/call-meta.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://www.oceanleo.com/library" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  CustomEvent: dom.window.CustomEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

function sys(meta, extra = {}) {
  return {
    id: `m-${Math.random().toString(36).slice(2, 8)}`,
    conversation_id: "c1",
    seq: 7,
    sender_id: null,
    sender_kind: "system",
    kind: "system",
    body: "中文兜底",
    created_at: "2026-10-23T01:00:00Z",
    meta,
    ...extra,
  };
}

// ── 纯逻辑：meta 规整 ───────────────────────────────────────────────────────

test("callMetaOf：合同 §3.4 的十种 + A-13 的 call_recording_failed 都认", () => {
  assert.equal(CALL_MESSAGE_KINDS.length, 11);
  assert.ok(CALL_MESSAGE_KINDS.includes("call_recording_failed"));
  for (const kind of CALL_MESSAGE_KINDS) {
    const meta = callMetaOf(sys({ kind, call_id: "call-1" }));
    assert.ok(meta, kind);
    assert.equal(meta.kind, kind);
    assert.equal(meta.callId, "call-1");
  }
});

test("callMetaOf：防御——非系统消息、meta 缺省 / null / 数组、不认识的 kind、坏 call_id 都返回 null", () => {
  assert.equal(callMetaOf(sys(undefined)), null);
  assert.equal(callMetaOf(sys(null)), null);
  assert.equal(callMetaOf(sys(["call_started"])), null);
  assert.equal(callMetaOf(sys({ kind: "call_party", call_id: "x" })), null);
  assert.equal(callMetaOf(sys({ kind: "call_started" })), null, "没有 call_id");
  assert.equal(callMetaOf(sys({ kind: "call_started", call_id: "../../etc" })), null);
  assert.equal(callMetaOf(sys({ kind: "call_started", call_id: "x" }, { sender_kind: "user", kind: "text" })), null);
  assert.equal(callMetaOf(null), null);
});

test("callMetaOf：字段逐个规整（数字、id 列表去重限长、短标记白名单）", () => {
  const meta = callMetaOf(
    sys({
      kind: "call_ended",
      call_id: "call-1",
      duration_seconds: "65",
      participant_ids: ["u1", "u1", "u2", "bad id", 7, "u3"],
      reason: "empty",
      error: "<script>",
    }),
  );
  assert.equal(meta.durationSeconds, 65);
  assert.deepEqual(meta.participantIds, ["u1", "u2", "u3"]);
  assert.equal(meta.reason, "empty");
  assert.equal(meta.error, null, "error 只认 [A-Za-z0-9._-]");
  assert.deepEqual(callMetaUserIds(callMetaOf(sys({ kind: "call_missed", call_id: "c", caller_id: "a", callee_ids: ["b", "a"] }))), ["a", "b"]);
  assert.equal(callMetaOf(sys({ kind: "call_ended", call_id: "c", duration_seconds: -3 })).durationSeconds, null);
});

test("时长 / 大小 / 起止秒数的格式", () => {
  assert.equal(formatCallDuration(0), "0:00");
  assert.equal(formatCallDuration(65), "1:05");
  assert.equal(formatCallDuration(3725), "1:02:05");
  assert.equal(formatCallDuration(null), "");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(25 * 1024 * 1024), "25 MB");
  assert.equal(formatBytes(undefined), "");
  assert.equal(secondsBetween("2026-10-23T01:00:00Z", "2026-10-23T01:01:05Z"), 65);
  assert.equal(secondsBetween("2026-10-23T01:01:05Z", "2026-10-23T01:00:00Z"), null);
});

// ── 组件 ────────────────────────────────────────────────────────────────────

const engineStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  const listeners = new Set();
  const state = (globalThis.__W08C = globalThis.__W08C ?? {});
  state.calls = state.calls ?? [];
  export const callStore = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return state.snapshot; },
  };
  state.emitCall = () => { for (const l of Array.from(listeners)) l(); };
  export function useCall() { return useSyncExternalStore(callStore.subscribe, callStore.getSnapshot, callStore.getSnapshot); }
  const record = (name) => async (...args) => { state.calls.push([name, ...args]); };
  export const callActions = { startOrJoin: record("startOrJoin"), join: record("join"), leave: record("leave") };
`);
const servicesStub = dataModule(`
  const state = (globalThis.__W08C = globalThis.__W08C ?? {});
  export const recordingApi = {
    async play(id) { state.calls.push(["play", id]); return state.playResult ?? { url: "https://oss.example.com/rec.mp4?sig=1", expires_at: "2026-10-23T02:00:00Z" }; },
  };
  export const transcriptionApi = {
    async transcript(callId) { state.calls.push(["transcript", callId]); return state.transcript ?? { segments: [], minutes: null }; },
  };
`);
const markdownStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function Markdown({ children }) { return React.createElement("div", { "data-markdown": "" }, children); }
`);
const callsApiStub = dataModule(`
  const state = (globalThis.__W08C = globalThis.__W08C ?? {});
  export const callsApi = {
    async status(cid) { state.calls.push(["status", cid]); return state.status?.[cid] ?? { call: null }; },
    async decline(id) { state.calls.push(["decline", id]); return { ok: true }; },
  };
`);
const hooksStub = dataModule(`
  const state = (globalThis.__W08C = globalThis.__W08C ?? {});
  state.handlers = state.handlers ?? { call: new Set(), resync: new Set() };
  export function imStore() {
    return {
      onEvent(type, handler) { const set = state.handlers[type] ?? (state.handlers[type] = new Set()); set.add(handler); return () => set.delete(handler); },
      onResync(handler) { state.handlers.resync.add(handler); return () => state.handlers.resync.delete(handler); },
      inbox() { return { items: state.inboxItems ?? [] }; },
    };
  }
`);
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }",
);
const toastStub = dataModule(`export function useToast(){ return { error(t){ (globalThis.__W08C.toasts ??= []).push(t); }, success(){}, info(){} }; }`);
const confirmStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, onConfirm, onCancel }){
    return React.createElement("div", { "data-confirm": title },
      React.createElement("button", { type: "button", "data-confirm-ok": "", onClick: onConfirm }, "ok"),
      React.createElement("button", { type: "button", "data-confirm-cancel": "", onClick: onCancel }, "cancel"));
  }
`);

const STUBS = {
  "../../../../i18n/ui/useUI": uiStub,
  "../engine": engineStub,
  "../services": servicesStub,
  "../../../Markdown": markdownStub,
  "../../../../ui": confirmStub,
  "../../../../ui/Toast": toastStub,
  "../../../../lib/im/calls-api": callsApiStub,
  "../../realtime/hooks": hooksStub,
};

const IDLE = { phase: "idle", conversationId: null, callId: null, incoming: null, server: null, participants: [] };
globalThis.__W08C = { snapshot: { ...IDLE }, calls: [], handlers: { call: new Set(), resync: new Set() } };

const chat = await import(await compileModule("src/shell/messages/call/chat/index.ts", STUBS));
const cardModule = await import(await compileModule("src/shell/messages/call/chat/CallMessageCard.tsx", STUBS));
const { SystemLine } = await import(
  await compileModule("src/shell/messages/conversation/SystemLine.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../call/engine": engineStub,
    "../call/services": servicesStub,
    "../../Markdown": markdownStub,
    "../../../ui": confirmStub,
    "../../../ui/Toast": toastStub,
    "../../../lib/im/calls-api": callsApiStub,
    "../realtime/hooks": hooksStub,
  })
);
const { CallMessageCard, CallChatProvider } = chat;
const { startedCardStatus, callEventText, recordingFailureReason, transcriptRows, playableUrl } = cardModule;

const PROFILES = {
  me: { user_id: "me", display_name: "我自己", avatar_url: null },
  u1: { user_id: "u1", display_name: "张三", avatar_url: "https://img.example.com/u1.png" },
  u2: { user_id: "u2", display_name: "李四", avatar_url: null },
};

function context(overrides = {}) {
  return {
    viewerId: "me",
    conversationId: "c1",
    conversationKind: "group",
    conversationTitle: "设计组",
    profileOf: (id) => (id ? PROFILES[id] : undefined),
    nameOf: (id) => (id && PROFILES[id] ? PROFILES[id].display_name : ""),
    endedMetaOf: () => undefined,
    canJoin: true,
    ...overrides,
  };
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountCard(message, ctx = context()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(CallChatProvider, { value: ctx }, React.createElement(CallMessageCard, { message })));
  });
  await flush();
  return {
    host,
    q: (s) => host.querySelector(s),
    text: () => host.textContent,
    async click(selector) {
      const node = host.querySelector(selector);
      assert.ok(node, `missing ${selector}`);
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

function reset(snapshot = {}) {
  globalThis.__W08C.calls = [];
  globalThis.__W08C.toasts = [];
  globalThis.__W08C.snapshot = { ...IDLE, ...snapshot };
  globalThis.__W08C.playResult = undefined;
  globalThis.__W08C.transcript = undefined;
  globalThis.__W08C.emitCall?.();
}

function activeCall(cid, callId, users) {
  return {
    call_id: callId,
    conversation_id: cid,
    status: "active",
    started_by: users[0],
    started_at: "2026-10-23T01:00:00Z",
    ended_at: null,
    ended_reason: null,
    participants: users.map((u, i) => ({
      participant_id: `p-${i}`,
      user_id: u,
      joined_at: "2026-10-23T01:00:00Z",
      last_seen_at: "2026-10-23T01:00:30Z",
      media: { mic: true, camera: false, screen: false },
    })),
    participant_count: users.length,
    ring: null,
    recording: null,
    transcription: null,
    controls: [],
  };
}

async function emitCallEvent(event) {
  await act(async () => {
    for (const handler of Array.from(globalThis.__W08C.handlers.call)) handler({ type: "call", ...event });
  });
  await flush();
}

test("startedCardStatus：我在这通 / 当前通话就是这通 → active；有条目但不是这通、见过结束、有结束消息 → ended；都不知道 → unknown", () => {
  const base = { callId: "x", mineLive: false, currentCallId: null, hasEntry: false, seenEnded: false, hasEndedMessage: false };
  assert.equal(startedCardStatus({ ...base, mineLive: true }), "active");
  assert.equal(startedCardStatus({ ...base, currentCallId: "x", hasEntry: true }), "active");
  assert.equal(startedCardStatus({ ...base, currentCallId: "y", hasEntry: true }), "ended");
  assert.equal(startedCardStatus({ ...base, hasEntry: true }), "ended");
  assert.equal(startedCardStatus({ ...base, seenEnded: true }), "ended");
  assert.equal(startedCardStatus({ ...base, hasEndedMessage: true }), "ended");
  assert.equal(startedCardStatus(base), "unknown");
});

test("call_started 进行中：按 GET …/call 显示人数与头像叠，「加入通话」= join(那一通)", async () => {
  reset();
  globalThis.__W08C.status = { "c-active": { call: activeCall("c-active", "call-1", ["u1", "u2"]) } };
  const view = await mountCard(sys({ kind: "call_started", call_id: "call-1", started_by: "u1" }, { conversation_id: "c-active" }));
  assert.ok(globalThis.__W08C.calls.some(([name, cid]) => name === "status" && cid === "c-active"), "取了一次会话通话状态");
  assert.ok(view.q('[data-call-card="call_started"] [data-call-status="active"]'));
  assert.match(view.text(), /通话进行中 · 2 人/);
  assert.match(view.text(), /张三 发起了通话/);
  assert.equal(view.q("[data-call-avatars]").getAttribute("data-call-avatars"), "2");
  const join = view.q("[data-call-join]");
  assert.equal(join.textContent, "加入通话");
  await view.click("[data-call-join]");
  assert.deepEqual(globalThis.__W08C.calls.filter(([n]) => n === "join"), [["join", "call-1", "c-active", { title: "设计组" }]]);
  await view.unmount();
});

test("call_started 实时变化：call 事件人数变了就跟着变；收到已结束的 CallView → 卡片变「通话已结束」、没有加入按钮", async () => {
  reset();
  globalThis.__W08C.status = { "c-live": { call: activeCall("c-live", "call-2", ["u1"]) } };
  const view = await mountCard(sys({ kind: "call_started", call_id: "call-2", started_by: "me" }, { conversation_id: "c-live" }));
  assert.match(view.text(), /通话进行中 · 1 人/);
  assert.match(view.text(), /你发起了通话/);
  await emitCallEvent({ conversation_id: "c-live", call: activeCall("c-live", "call-2", ["u1", "u2", "me"]) });
  assert.match(view.text(), /通话进行中 · 3 人/);
  const ended = { ...activeCall("c-live", "call-2", []), status: "ended", ended_at: "2026-10-23T01:10:00Z", participant_count: 0 };
  await emitCallEvent({ conversation_id: "c-live", call: ended });
  assert.ok(view.q('[data-call-status="ended"]'));
  assert.match(view.text(), /通话已结束 · 10:00/, "起止时间算出时长");
  assert.equal(view.q("[data-call-join]"), null, "结束后没有加入按钮，不再出现「进行中 · 0 人」");
  await view.unmount();
});

test("call_started 已结束：有 call_ended 消息时用它的时长与参与者", async () => {
  reset();
  globalThis.__W08C.status = { "c-ended": { call: null } };
  const endedMeta = callMetaOf(sys({ kind: "call_ended", call_id: "call-3", duration_seconds: 65, participant_ids: ["u1", "u2"] }));
  const view = await mountCard(
    sys({ kind: "call_started", call_id: "call-3", started_by: "u2" }, { conversation_id: "c-ended" }),
    context({ conversationId: "c-ended", endedMetaOf: (id) => (id === "call-3" ? endedMeta : undefined) }),
  );
  assert.ok(view.q('[data-call-status="ended"]'));
  assert.match(view.text(), /通话已结束 · 1:05/);
  assert.match(view.text(), /李四 发起了通话 · 2 人参与/);
  assert.equal(view.q("[data-call-join]"), null);
  await view.unmount();
});

test("call_started 我正在这通：按钮写「通话中」，点击只展开小窗", async () => {
  reset({ phase: "connected", conversationId: "c-mine", callId: "call-4" });
  globalThis.__W08C.status = { "c-mine": { call: activeCall("c-mine", "call-4", ["me"]) } };
  let focus = 0;
  const onFocus = () => { focus += 1; };
  window.addEventListener(chat.CALL_DOCK_FOCUS_EVENT, onFocus);
  const view = await mountCard(sys({ kind: "call_started", call_id: "call-4", started_by: "me" }, { conversation_id: "c-mine" }));
  const button = view.q("[data-call-join]");
  assert.equal(button.getAttribute("data-call-join"), "mine");
  assert.equal(button.textContent, "通话中");
  await view.click("[data-call-join]");
  assert.equal(focus, 1);
  assert.equal(globalThis.__W08C.calls.filter(([n]) => n === "join" || n === "startOrJoin").length, 0);
  window.removeEventListener(chat.CALL_DOCK_FOCUS_EVENT, onFocus);
  await view.unmount();
});

test("一行文字：结束 / 未接通 / 拒绝（区分本人）/ 录制与转写开关（本人用「你…」句子）/ 录制失败原因", () => {
  const nameOf = (id) => (id === "me" ? "你" : id === "u1" ? "张三" : "一位成员");
  const line = (meta, viewer = "me") => callEventText(tt, callMetaOf(sys({ call_id: "c", ...meta })), nameOf, viewer);
  assert.equal(line({ kind: "call_ended", duration_seconds: 125, participant_ids: ["u1", "u2"] }), "通话已结束 · 2:05 · 2 人参与");
  assert.equal(line({ kind: "call_ended", duration_seconds: 5 }), "通话已结束 · 0:05");
  assert.equal(line({ kind: "call_ended" }), "通话已结束");
  assert.equal(line({ kind: "call_missed", caller_id: "u1", callee_ids: ["me"] }), "未接通");
  assert.equal(line({ kind: "call_declined", callee_id: "u1" }), "对方已拒绝");
  assert.equal(line({ kind: "call_declined", callee_id: "me" }), "你已拒接");
  assert.equal(line({ kind: "call_recording_started", user_id: "u1" }), "张三 开始了录制");
  assert.equal(line({ kind: "call_recording_stopped", user_id: "u1" }), "张三 停止了录制");
  assert.equal(line({ kind: "call_recording_started", user_id: "me" }), "你开始了录制");
  assert.equal(line({ kind: "call_recording_stopped", user_id: "me" }), "你停止了录制");
  assert.equal(line({ kind: "call_transcription_started", user_id: "u1" }), "张三 开启了转写");
  assert.equal(line({ kind: "call_transcription_stopped", user_id: "me" }), "你关闭了转写");
  assert.equal(line({ kind: "call_recording_failed", error: "no_media" }), "录制失败 · 没有录到内容");
  assert.equal(line({ kind: "call_recording_failed", error: "files_timeout" }), "录制失败 · 录像文件未能生成");
  assert.equal(line({ kind: "call_recording_failed", error: "storage_unavailable" }), "录制失败 · 录制存储不可用");
  assert.equal(line({ kind: "call_recording_failed", error: "provider_failed" }), "录制失败 · 录制服务出错");
  assert.equal(line({ kind: "call_recording_failed", error: "weird" }), "录制失败");
  assert.equal(recordingFailureReason(tt, null), "");
});

test("一行文字的渲染：未接通 / 对方已拒绝 是警示色；录制失败一行、没有播放按钮", async () => {
  reset();
  const missed = await mountCard(sys({ kind: "call_missed", call_id: "c", caller_id: "u1", callee_ids: ["me"] }));
  assert.ok(missed.q('[data-call-line="call_missed"]'));
  assert.match(missed.text(), /未接通/);
  await missed.unmount();
  const failed = await mountCard(sys({ kind: "call_recording_failed", call_id: "c", recording_id: "r1", error: "storage_unavailable" }));
  assert.ok(failed.q('[data-call-line="call_recording_failed"]'));
  assert.match(failed.text(), /录制失败 · 录制存储不可用/);
  assert.equal(failed.q("[data-recording-play]"), null);
  assert.equal(failed.q("video"), null);
  await failed.unmount();
});

test("录像卡片：时长 · 大小 · 格式；点「播放」取签名地址后用 <video> 播放", async () => {
  reset();
  const view = await mountCard(
    sys({ kind: "call_recording_ready", call_id: "c", recording_id: "rec-1", duration_seconds: 754, size_bytes: 26214400, format: "mp4" }),
  );
  assert.match(view.q("[data-recording-details]").textContent, /12:34 · 25 MB · MP4/);
  assert.equal(view.q("video"), null, "点之前不取地址、不放 video");
  assert.equal(globalThis.__W08C.calls.filter(([n]) => n === "play").length, 0);
  await view.click("[data-recording-play]");
  assert.deepEqual(globalThis.__W08C.calls.filter(([n]) => n === "play"), [["play", "rec-1"]]);
  const video = view.q('video[data-recording-player="video"]');
  assert.ok(video);
  assert.equal(video.getAttribute("src"), "https://oss.example.com/rec.mp4?sig=1");
  assert.ok(video.hasAttribute("controls"));
  await view.unmount();
});

test("录像卡片：非 https 地址不放进播放器；音频格式用 <audio>；生成失败 / 没有 id 时不给播放按钮", async () => {
  reset();
  globalThis.__W08C.playResult = { url: "javascript:alert(1)", expires_at: "x" };
  const bad = await mountCard(sys({ kind: "call_recording_ready", call_id: "c", recording_id: "rec-2", format: "mp4" }));
  await bad.click("[data-recording-play]");
  assert.equal(bad.q("video"), null);
  assert.match(bad.text(), /录像暂时无法播放，请稍后再试/);
  await bad.unmount();

  reset();
  const audio = await mountCard(sys({ kind: "call_recording_ready", call_id: "c", recording_id: "rec-3", format: "mp3" }));
  await audio.click("[data-recording-play]");
  assert.ok(audio.q('audio[data-recording-player="audio"]'));
  await audio.unmount();

  const failed = await mountCard(sys({ kind: "call_recording_ready", call_id: "c", recording_id: "rec-4", error: "no_media" }));
  assert.match(failed.text(), /录像生成失败/);
  assert.equal(failed.q("[data-recording-play]"), null);
  await failed.unmount();

  const noId = await mountCard(sys({ kind: "call_recording_ready", call_id: "c" }));
  assert.match(noId.text(), /录像暂不可用/);
  assert.equal(noId.q("[data-recording-play]"), null);
  await noId.unmount();

  assert.equal(playableUrl("https://a.example.com/x.mp4"), "https://a.example.com/x.mp4");
  for (const raw of ["http://a.example.com/x.mp4", "data:video/mp4;base64,AA", "/relative.mp4", "", null, 42]) {
    assert.equal(playableUrl(raw), null, String(raw));
  }
});

test("Leo 纪要卡片：正文交给 Markdown 组件；「查看转写全文」调 GET /transcript 并按时间列出、再点收起", async () => {
  reset();
  globalThis.__W08C.transcript = {
    segments: [
      { participant_id: "p2", user_id: "u2", text: "第二句", begin_at: "2026-10-23T01:00:12Z", end_at: "2026-10-23T01:00:14Z" },
      { participant_id: "p1", user_id: "u1", text: "第一句", begin_at: "2026-10-23T01:00:00Z", end_at: "2026-10-23T01:00:03Z" },
      { participant_id: "p1", user_id: "u1", text: "   ", begin_at: "2026-10-23T01:00:20Z", end_at: "2026-10-23T01:00:21Z" },
    ],
    minutes: { message_id: "m1" },
  };
  const view = await mountCard(
    sys({ kind: "call_minutes", call_id: "call-9", segment_count: 2, duration_seconds: 300, language: "zh" }, { body: "## 结论\n- 周五上线" }),
  );
  assert.match(view.text(), /Leo 纪要/);
  assert.match(view.text(), /通话 5:00 · 2 段转写/);
  const markdown = view.q("[data-markdown]");
  assert.ok(markdown, "正文交给 Markdown 组件");
  assert.equal(markdown.textContent, "## 结论\n- 周五上线");
  await view.click("[data-call-transcript-toggle]");
  assert.deepEqual(globalThis.__W08C.calls.filter(([n]) => n === "transcript"), [["transcript", "call-9"]]);
  const rows = Array.from(view.host.querySelectorAll("[data-call-transcript] li")).map((li) => li.textContent);
  assert.deepEqual(rows, ["0:00张三第一句", "0:12李四第二句"]);
  await view.click("[data-call-transcript-toggle]");
  assert.equal(view.q("[data-call-transcript]"), null);
  await view.unmount();

  const card = src("shell/messages/call/chat/CallMessageCard.tsx");
  assert.doesNotMatch(card, /dangerouslySetInnerHTML|innerHTML\s*=|\beval\(|new Function/);
  assert.match(card, /import \{ Markdown \} from "\.\.\/\.\.\/\.\.\/Markdown";/);
});

test("transcriptRows：丢空文本、按开始时间排序、偏移写成 m:ss；坏数据不崩", () => {
  assert.deepEqual(transcriptRows(null), []);
  assert.deepEqual(
    transcriptRows([
      { user_id: "a", text: "后", begin_at: "2026-10-23T01:01:05Z" },
      { user_id: "b", text: "先", begin_at: "2026-10-23T01:00:00Z" },
      { user_id: "c", text: "", begin_at: "2026-10-23T01:00:01Z" },
      { user_id: "d", text: "没有时间" },
    ]).map((r) => [r.userId, r.text, r.offset]),
    [["d", "没有时间", ""], ["b", "先", "0:00"], ["a", "后", "1:05"]],
  );
});

test("meta 缺省或不认识：退回普通系统行，只画 body 的中文兜底文字", async () => {
  reset();
  const view = await mountCard(sys(undefined, { body: "张三 发起了通话" }));
  assert.ok(view.q("[data-system-line]"));
  assert.equal(view.q("[data-call-card]"), null);
  assert.match(view.text(), /张三 发起了通话/);
  await view.unmount();
});

test("SystemLine：认出通话 meta 交给卡片，别的系统消息照旧一行字", async () => {
  reset();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        "div",
        null,
        React.createElement(SystemLine, { message: sys({ kind: "call_missed", call_id: "c" }) }),
        React.createElement(SystemLine, { message: sys(undefined, { body: "张三 加入了群聊" }) }),
      ),
    );
  });
  assert.ok(host.querySelector('[data-call-line="call_missed"]'));
  const plain = Array.from(host.querySelectorAll("[data-system-line]")).find((el) => !el.hasAttribute("data-call-line"));
  assert.match(plain.textContent, /张三 加入了群聊/);
  await act(async () => root.unmount());
  host.remove();
});

test("D5 call_started：已不在这个会话里（canJoin=false，被移出 / 解散 / 非成员）→ 照样显示进行中与人数，但没有「加入通话」", async () => {
  reset();
  globalThis.__W08C.status = { "c-removed": { call: activeCall("c-removed", "call-r", ["u1", "u2"]) } };
  const view = await mountCard(
    sys({ kind: "call_started", call_id: "call-r", started_by: "u1" }, { conversation_id: "c-removed" }),
    context({ conversationId: "c-removed", canJoin: false }),
  );
  assert.ok(view.q('[data-call-status="active"]'));
  assert.equal(view.q('[data-call-status="active"]').getAttribute("data-call-joinable"), "false");
  assert.match(view.text(), /通话进行中 · 2 人/);
  assert.equal(view.q("[data-call-join]"), null);
  assert.doesNotMatch(view.text(), /加入通话/);
  await view.unmount();
});

