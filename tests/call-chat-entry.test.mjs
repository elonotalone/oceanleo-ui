// calls-v2 W08 · 会话顶栏的「通话」入口（任务书 P1/P2；合同 §1 A1、A20）。
// 判据：交易会话 / 会话未加载不显示；点一下直接进（不弹任何设置框、不预览、不检查麦克风）；
// 已在这通 → 「通话中」，点击只发展开小窗事件；在别的通话里 → 先确认「离开当前通话并加入这里？」再离开并加入；
// 旧的会议入口（◉、openMeeting、MeetingPanel、会议邀请处理）从会话视图与全局宿主里移除。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  callEntryState,
  callErrorCode,
  enterCall,
  entryHidden,
  isLivePhase,
  CALL_DOCK_FOCUS_EVENT,
} from "../src/shell/messages/call/chat/call-entry.ts";

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

// ── 纯逻辑 ──────────────────────────────────────────────────────────────────

test("entryHidden：交易会话、会话还没加载出来（kind 为空）都不显示；列表 / 卡片只按 id 判交易会话", () => {
  assert.equal(entryHidden("c1", "dm"), false);
  assert.equal(entryHidden("c1", "group"), false);
  assert.equal(entryHidden("c1", "team"), false);
  assert.equal(entryHidden("c1", "project"), false);
  assert.equal(entryHidden("c1", "talent"), true);
  assert.equal(entryHidden("c1", null), true, "会话详情没回来之前不画按钮");
  assert.equal(entryHidden("talent:t1", null, false), true);
  assert.equal(entryHidden("c1", null, false), false);
  assert.equal(entryHidden("", "dm"), true);
});

test("callEntryState：idle / 在这通 / 在别的通话 / 正在离开 / 隐藏", () => {
  const base = { conversationId: "c1", hidden: false, activeConversationId: null };
  assert.equal(callEntryState({ ...base, phase: "idle" }), "idle");
  assert.equal(callEntryState({ ...base, phase: "ended" }), "idle", "上一通结束后可以再点");
  assert.equal(callEntryState({ ...base, phase: "error" }), "idle");
  for (const phase of ["joining", "connected", "reconnecting"]) {
    assert.equal(isLivePhase(phase), true);
    assert.equal(callEntryState({ ...base, phase, activeConversationId: "c1" }), "in_this_call", phase);
    assert.equal(callEntryState({ ...base, phase, activeConversationId: "c2" }), "in_other_call", phase);
  }
  assert.equal(callEntryState({ ...base, phase: "leaving", activeConversationId: "c2" }), "busy");
  assert.equal(callEntryState({ ...base, hidden: true, phase: "idle" }), "hidden");
  assert.equal(callEntryState({ ...base, conversationId: "talent:x", phase: "idle" }), "hidden", "交易会话没有通话");
});

function fakeActions() {
  const calls = [];
  return {
    calls,
    actions: {
      startOrJoin: async (...args) => calls.push(["startOrJoin", ...args]),
      join: async (...args) => calls.push(["join", ...args]),
      leave: async (...args) => calls.push(["leave", ...args]),
    },
  };
}

test("enterCall idle：直接 startOrJoin（带标题），不问任何问题、不展开小窗", async () => {
  const { calls, actions } = fakeActions();
  let asked = 0;
  let focused = 0;
  const out = await enterCall(
    { actions, confirmSwitch: async () => { asked += 1; return true; }, focusDock: () => { focused += 1; } },
    "idle",
    { conversationId: "c1", title: "设计组" },
  );
  assert.equal(out, "entered");
  assert.deepEqual(calls, [["startOrJoin", "c1", { title: "设计组" }]]);
  assert.equal(asked, 0, "不弹任何确认 / 设置框");
  assert.equal(focused, 0);
});

test("enterCall 给了 callId（卡片 / 列表标记）→ join 那一通", async () => {
  const { calls, actions } = fakeActions();
  await enterCall({ actions, confirmSwitch: async () => true, focusDock() {} }, "idle", {
    conversationId: "c1",
    callId: "call-9",
  });
  assert.deepEqual(calls, [["join", "call-9", "c1", undefined]]);
});

test("enterCall 已在这通：只展开小窗，不碰引擎", async () => {
  const { calls, actions } = fakeActions();
  let focused = 0;
  const out = await enterCall(
    { actions, confirmSwitch: async () => true, focusDock: () => { focused += 1; } },
    "in_this_call",
    { conversationId: "c1" },
  );
  assert.equal(out, "focused");
  assert.equal(focused, 1);
  assert.deepEqual(calls, []);
});

test("enterCall 在别的通话里：确认后先离开再加入；取消则什么都不做", async () => {
  const yes = fakeActions();
  const out = await enterCall({ actions: yes.actions, confirmSwitch: async () => true, focusDock() {} }, "in_other_call", {
    conversationId: "c1",
    title: "乙",
  });
  assert.equal(out, "entered");
  assert.deepEqual(yes.calls, [["leave", "switch"], ["startOrJoin", "c1", { title: "乙" }]]);

  const no = fakeActions();
  const cancelled = await enterCall({ actions: no.actions, confirmSwitch: async () => false, focusDock() {} }, "in_other_call", {
    conversationId: "c1",
  });
  assert.equal(cancelled, "cancelled");
  assert.deepEqual(no.calls, []);

  const busy = fakeActions();
  assert.equal(await enterCall({ actions: busy.actions, confirmSwitch: async () => true, focusDock() {} }, "busy", { conversationId: "c1" }), "ignored");
  assert.deepEqual(busy.calls, []);
});

test("callErrorCode：ImApiError.code、{detail:{code}}、Error('not_ready')", () => {
  assert.equal(callErrorCode({ code: "call_full", status: 409 }), "call_full");
  assert.equal(callErrorCode({ detail: { code: "talent_not_supported" } }), "talent_not_supported");
  assert.equal(callErrorCode(new Error("not_ready")), "not_ready");
  assert.equal(callErrorCode(new Error("Something broke badly")), "");
  assert.equal(callErrorCode(null), "");
});

// ── CallButton 组件 ─────────────────────────────────────────────────────────

const IDLE = {
  phase: "idle",
  conversationId: null,
  callId: null,
  incoming: null,
  server: null,
  participants: [],
};

const engineStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  const listeners = new Set();
  globalThis.__W08_CALL = globalThis.__W08_CALL ?? { snapshot: null };
  export const callStore = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return globalThis.__W08_CALL.snapshot; },
  };
  globalThis.__W08_CALL.emit = () => { for (const l of Array.from(listeners)) l(); };
  export function useCall() { return useSyncExternalStore(callStore.subscribe, callStore.getSnapshot, callStore.getSnapshot); }
  const record = (name) => async (...args) => { globalThis.__W08_CALL.calls.push([name, ...args]); if (globalThis.__W08_CALL.fail) throw globalThis.__W08_CALL.fail; };
  export const callActions = {
    startOrJoin: record("startOrJoin"),
    join: record("join"),
    leave: record("leave"),
    acceptIncoming: record("acceptIncoming"),
    declineIncoming: record("declineIncoming"),
  };
`);

function setCall(patch) {
  globalThis.__W08_CALL.snapshot = { ...IDLE, ...patch };
  globalThis.__W08_CALL.emit?.();
}

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }",
);
const toastStub = dataModule(`
  export function useToast(){ return { error(title){ (globalThis.__W08_TOASTS ??= []).push(title); }, success(){}, info(){} }; }
`);
const confirmStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, confirmLabel, onConfirm, onCancel }){
    return React.createElement("div", { "data-confirm": title },
      React.createElement("button", { type: "button", "data-confirm-ok": "", onClick: onConfirm }, confirmLabel),
      React.createElement("button", { type: "button", "data-confirm-cancel": "", onClick: onCancel }, "cancel"));
  }
`);

globalThis.__W08_CALL = { snapshot: { ...IDLE }, calls: [] };
const { CallButton } = await import(
  await compileModule("src/shell/messages/call/chat/CallButton.tsx", {
    "../../../../i18n/ui/useUI": uiStub,
    "../engine": engineStub,
    "../../../../ui": confirmStub,
    "../../../../ui/Toast": toastStub,
  })
);

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return {
    host,
    q: (selector) => host.querySelector(selector),
    async click(selector) {
      const node = host.querySelector(selector);
      assert.ok(node, `missing ${selector}`);
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function reset() {
  globalThis.__W08_CALL.calls = [];
  globalThis.__W08_CALL.fail = null;
  globalThis.__W08_TOASTS = [];
  setCall({});
}

test("CallButton：交易会话不渲染任何东西", async () => {
  reset();
  const view = await mount(React.createElement(CallButton, { conversationId: "c1", title: "交易", kind: "talent" }));
  assert.equal(view.host.innerHTML, "");
  await view.unmount();
});

test("CallButton idle：耳机图标 +「通话」，aria-label 同文案；点一下直接 startOrJoin，不出任何对话框", async () => {
  reset();
  const view = await mount(React.createElement(CallButton, { conversationId: "c1", title: "设计组", kind: "group" }));
  const button = view.q("button[data-call-button]");
  assert.ok(button);
  assert.equal(button.getAttribute("data-call-button"), "idle");
  assert.equal(button.getAttribute("aria-label"), "通话");
  assert.match(button.textContent, /通话/);
  assert.ok(button.querySelector('svg[data-call-icon="headphones"]'), "图标是耳机");
  await view.click("button[data-call-button]");
  assert.deepEqual(globalThis.__W08_CALL.calls, [["startOrJoin", "c1", { title: "设计组" }]]);
  assert.equal(document.querySelector("[data-confirm]"), null, "没有确认框");
  assert.equal(document.querySelector('[role="dialog"]'), null, "没有设置 / 预览 / 检查麦克风的对话框");
  await view.unmount();
});

test("CallButton 已在这通：写「通话中」，点击只发展开小窗事件", async () => {
  reset();
  setCall({ phase: "connected", conversationId: "c1", callId: "call-1" });
  let focusEvents = 0;
  const onFocus = () => { focusEvents += 1; };
  window.addEventListener(CALL_DOCK_FOCUS_EVENT, onFocus);
  const view = await mount(React.createElement(CallButton, { conversationId: "c1", title: "设计组", kind: "group" }));
  const button = view.q("button[data-call-button]");
  assert.equal(button.getAttribute("data-call-button"), "in_this_call");
  assert.equal(button.getAttribute("aria-label"), "通话中");
  await view.click("button[data-call-button]");
  assert.equal(focusEvents, 1);
  assert.deepEqual(globalThis.__W08_CALL.calls, [], "不重复入会");
  window.removeEventListener(CALL_DOCK_FOCUS_EVENT, onFocus);
  await view.unmount();
});

test("CallButton 在别的会话通话里：先问「离开当前通话并加入这里？」，同意 → 离开再加入；取消 → 不动", async () => {
  reset();
  setCall({ phase: "connected", conversationId: "other", callId: "call-x" });
  const view = await mount(React.createElement(CallButton, { conversationId: "c1", title: "乙", kind: "dm" }));
  await view.click("button[data-call-button]");
  const dialog = view.q("[data-confirm]");
  assert.ok(dialog, "出现切换确认");
  assert.equal(dialog.getAttribute("data-confirm"), "离开当前通话并加入这里？");
  assert.deepEqual(globalThis.__W08_CALL.calls, [], "确认之前不离开");
  await view.click("[data-confirm-ok]");
  assert.deepEqual(globalThis.__W08_CALL.calls, [["leave", "switch"], ["startOrJoin", "c1", { title: "乙" }]]);

  globalThis.__W08_CALL.calls = [];
  await view.click("button[data-call-button]");
  await view.click("[data-confirm-cancel]");
  assert.deepEqual(globalThis.__W08_CALL.calls, []);
  assert.equal(view.q("[data-confirm]"), null);
  await view.unmount();
});

test("CallButton 入会失败（例如满员）：给一条站内提示，不弹原生对话框", async () => {
  reset();
  globalThis.__W08_CALL.fail = Object.assign(new Error("full"), { code: "call_full", status: 409 });
  const view = await mount(React.createElement(CallButton, { conversationId: "c1", title: "设计组", kind: "group" }));
  await view.click("button[data-call-button]");
  assert.deepEqual(globalThis.__W08_TOASTS, ["通话人数已满（最多 50 人）"]);
  await view.unmount();
});

test("CallButton 与 Leo 实时通话互斥（引擎 busy_leo_realtime）：提示先结束 Leo 通话", async () => {
  reset();
  globalThis.__W08_CALL.fail = Object.assign(new Error("busy"), { code: "busy_leo_realtime" });
  const view = await mount(React.createElement(CallButton, { conversationId: "c1", title: "设计组", kind: "group" }));
  await view.click("button[data-call-button]");
  assert.deepEqual(globalThis.__W08_TOASTS, ["正在与 Leo 实时通话，请先结束"]);
  await view.unmount();
});

test("引擎进了 error 阶段（小窗自己写原因）时不再重复弹提示", async () => {
  reset();
  globalThis.__W08_CALL.fail = Object.assign(new Error("join"), { code: "artc_join_failed" });
  const view = await mount(React.createElement(CallButton, { conversationId: "c1", title: "设计组", kind: "group" }));
  globalThis.__W08_CALL.snapshot = { ...IDLE, phase: "error" };
  await view.click("button[data-call-button]");
  assert.deepEqual(globalThis.__W08_TOASTS, []);
  await view.unmount();
});

// ── 接线（源码断言）─────────────────────────────────────────────────────────

test("会话顶栏：◉ 会议按钮与 openMeeting 已移除；通话按钮只在非交易、未解散、是成员时渲染", () => {
  const view = src("shell/messages/conversation/ConversationView.tsx");
  assert.doesNotMatch(view, /openMeeting|meeting-host-state|◉/);
  assert.doesNotMatch(view, /tt\("会议"\)/);
  assert.match(
    view,
    /const showCallButton = Boolean\(conversation\) && conversation\?\.kind !== "talent" && !dissolved && !notMember;/,
  );
  assert.match(view, /\{showCallButton && conversation \? \(\s*<CallButton conversationId=\{conversationId\} title=\{title\} kind=\{conversation\.kind\} \/>/);
});

test("全局宿主（A20）：没有会议面板与会议邀请处理；可用时挂 CallHost / IncomingCallHost / CallControlHost；不可用时只挂登录框宿主", () => {
  const host = src("shell/messages/MessagesHost.tsx");
  assert.doesNotMatch(host, /MeetingPanel|openMeeting|closeMeeting|createMeetingInvitationHandler|useMeetingHostRequest|meeting_invitation/);
  assert.match(host, /import \{ CallHost \} from "\.\/call\/ui";/);
  assert.match(host, /import \{ IncomingCallHost \} from "\.\/call\/incoming";/);
  assert.match(host, /import \{ CallControlHost \} from "\.\/call\/control";/);
  assert.match(host, /if \(!enabled\) return <BayAuthHost \/>;/);
  const enabledBranch = host.slice(host.indexOf("if (!enabled) return <BayAuthHost />;"));
  assert.match(enabledBranch, /<CallHost \/>\s*<IncomingCallHost \/>\s*<CallControlHost \/>/);
  assert.doesNotMatch(host, /CallDiagnosticsHost/, "诊断宿主由 CallHost 自己挂（A-7）");
  // Leo 实时通话两种状态下是同一个实例（不随可用与否换位置重挂）。
  assert.match(host, /export function MessagesHost\(\) \{\s*return \(\s*<>\s*<MessagesHostBody \/>\s*<RealtimeCallHost \/>/);
});
