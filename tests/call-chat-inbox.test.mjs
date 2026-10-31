// calls-v2 W08 · 会话列表上的通话标记（任务书 P5；合同 §1 A3、§3.2 `active_call`、§3.3 `call` 事件）。
// 判据：列表行读 `active_call` 显示耳机 + 人数；实时 `call` 事件更新人数、结束即消失（不出现「进行中 · 0 人」）；
// 重连后回到列表数据；点标记直接加入那一通、不触发打开会话；标记不嵌在行按钮里；交易会话没有标记。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  STATUS_RETRY_MS,
  STATUS_STALE_MS,
  activeCallOf,
  createConversationCalls,
  sanitizeCallView,
  summaryOfCall,
} from "../src/shell/messages/call/chat/conversation-calls.ts";

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

function view(cid, callId, users, status = "active") {
  return {
    call_id: callId,
    conversation_id: cid,
    status,
    started_by: users[0] ?? "u1",
    started_at: "2026-10-23T01:00:00Z",
    ended_at: status === "ended" ? "2026-10-23T01:05:00Z" : null,
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

// ── 纯逻辑 ──────────────────────────────────────────────────────────────────

test("activeCallOf：列表行的 active_call 只当数据——形状不对、人数为 0 当没有；人数截到 999", () => {
  assert.deepEqual(activeCallOf({ call_id: "call-1", participant_count: 3, started_at: "2026-10-23T01:00:00Z" }), {
    call_id: "call-1",
    participant_count: 3,
    started_at: "2026-10-23T01:00:00Z",
  });
  assert.equal(activeCallOf({ call_id: "call-1", participant_count: 0 }), null, "不出现「进行中 · 0 人」");
  assert.equal(activeCallOf({ call_id: "bad id", participant_count: 2 }), null);
  assert.equal(activeCallOf(null), null);
  assert.equal(activeCallOf(undefined), null);
  assert.equal(activeCallOf([1, 2]), null);
  assert.equal(activeCallOf({ call_id: "c", participant_count: 1e9 }).participant_count, 999);
  assert.equal(activeCallOf({ call_id: "c", participant_count: 2, started_at: "nope" }).started_at, "");
});

test("summaryOfCall：进行中且有人 → 摘要；已结束、没人 → null", () => {
  assert.deepEqual(summaryOfCall(view("c1", "call-1", ["u1", "u2"])), {
    call_id: "call-1",
    participant_count: 2,
    started_at: "2026-10-23T01:00:00Z",
  });
  assert.equal(summaryOfCall(view("c1", "call-1", ["u1"], "ended")), null);
  assert.equal(summaryOfCall({ ...view("c1", "call-1", []), participant_count: 0 }), null);
  assert.equal(summaryOfCall(null), null);
});

test("sanitizeCallView：串台（会话 id 不符）、状态不对 → 忽略；null 是「没有通话」；参与者逐个核对", () => {
  assert.equal(sanitizeCallView(view("c2", "call-1", ["u1"]), "c1"), undefined);
  assert.equal(sanitizeCallView({ ...view("c1", "call-1", ["u1"]), status: "weird" }, "c1"), undefined);
  assert.equal(sanitizeCallView(null, "c1"), null);
  assert.equal(sanitizeCallView("x", "c1"), undefined);
  const raw = view("c1", "call-1", ["u1"]);
  raw.participants.push({ participant_id: "p-x", user_id: "bad id" }, "junk");
  const clean = sanitizeCallView(raw, "c1");
  assert.equal(clean.participants.length, 1);
  assert.equal(clean.participant_count, 1);
});

function harness() {
  const handlers = { call: new Set(), resync: new Set() };
  const fetches = [];
  let now = 1_000_000;
  let respond = (cid) => Promise.resolve({ call: null });
  const store = createConversationCalls({
    fetchStatus: (cid) => {
      fetches.push(cid);
      return respond(cid);
    },
    onCallEvent: (handler) => {
      handlers.call.add(handler);
      return () => handlers.call.delete(handler);
    },
    onResync: (handler) => {
      handlers.resync.add(handler);
      return () => handlers.resync.delete(handler);
    },
    now: () => now,
  });
  return {
    store,
    fetches,
    handlers,
    setNow: (value) => { now = value; },
    advance: (ms) => { now += ms; },
    respondWith: (fn) => { respond = fn; },
    emit: (event) => { for (const h of Array.from(handlers.call)) h(event); },
    resync: () => { for (const h of Array.from(handlers.resync)) h(); },
  };
}

test("状态仓：有人订阅才听事件；事件到了就以事件为准；已结束的通话也记得（结束卡片要用）", () => {
  const h = harness();
  assert.equal(h.store.listening(), false);
  const off = h.store.subscribe(() => {});
  assert.equal(h.store.listening(), true);
  h.emit({ type: "call", conversation_id: "c1", call: view("c1", "call-1", ["u1", "u2"]) });
  assert.equal(h.store.get("c1").call.participant_count, 2);
  assert.equal(h.store.get("c1").source, "event");
  h.emit({ type: "call", conversation_id: "c1", call: view("c1", "call-1", [], "ended") });
  assert.equal(h.store.get("c1").call, null, "结束 → 当前没有通话");
  assert.equal(h.store.callById("call-1").status, "ended");
  h.emit({ type: "call", conversation_id: "c1", call: view("c9", "call-x", ["u1"]) });
  assert.equal(h.store.get("c1").call, null, "串台的事件忽略");
  off();
  assert.equal(h.store.listening(), false);
  // 没在听的那段时间里事件可能丢了：再订阅时旧条目作废。
  h.store.subscribe(() => {});
  assert.equal(h.store.get("c1"), undefined);
});

test("状态仓：实时通道重连 → 条目全部作废（回到列表数据 / 重新取）", () => {
  const h = harness();
  h.store.subscribe(() => {});
  h.emit({ type: "call", conversation_id: "c1", call: view("c1", "call-1", ["u1"]) });
  assert.ok(h.store.get("c1"));
  h.resync();
  assert.equal(h.store.get("c1"), undefined);
});

test("状态仓 ensure：同一会话并发只发一个请求；有新鲜条目不再取；失败后 30 秒内不重试；过期再取", async () => {
  const h = harness();
  h.store.subscribe(() => {});
  h.respondWith((cid) => Promise.resolve({ call: view(cid, "call-1", ["u1"]) }));
  await Promise.all([h.store.ensure("c1"), h.store.ensure("c1")]);
  assert.deepEqual(h.fetches, ["c1"]);
  assert.equal(h.store.get("c1").source, "status");
  await h.store.ensure("c1");
  assert.deepEqual(h.fetches, ["c1"], "新鲜条目不再取");
  h.advance(STATUS_STALE_MS + 1);
  await h.store.ensure("c1");
  assert.deepEqual(h.fetches, ["c1", "c1"], "过期再取");

  h.respondWith(() => Promise.reject(new Error("offline")));
  await h.store.ensure("c2");
  await h.store.ensure("c2");
  assert.deepEqual(h.fetches.filter((c) => c === "c2"), ["c2"], "失败后不立刻重试");
  h.advance(STATUS_RETRY_MS + 1);
  await h.store.ensure("c2");
  assert.deepEqual(h.fetches.filter((c) => c === "c2"), ["c2", "c2"]);
});

test("状态仓 ensure：请求在路上时到了更新的事件 → 以事件为准，晚到的旧结果不覆盖", async () => {
  const h = harness();
  h.store.subscribe(() => {});
  let release;
  h.respondWith(() => new Promise((resolve) => { release = resolve; }));
  const pending = h.store.ensure("c1");
  h.advance(10);
  h.emit({ type: "call", conversation_id: "c1", call: view("c1", "call-2", ["u1", "u2", "u3"]) });
  release({ call: null });
  await pending;
  assert.equal(h.store.get("c1").call.call_id, "call-2");
  assert.equal(h.store.get("c1").source, "event");
});

// ── InboxRow 组件 ───────────────────────────────────────────────────────────

const engineStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  const listeners = new Set();
  const state = (globalThis.__W08N = globalThis.__W08N ?? {});
  export const callStore = { subscribe(l) { listeners.add(l); return () => listeners.delete(l); }, getSnapshot() { return state.snapshot; } };
  state.emit = () => { for (const l of Array.from(listeners)) l(); };
  export function useCall() { return useSyncExternalStore(callStore.subscribe, callStore.getSnapshot, callStore.getSnapshot); }
  const record = (name) => async (...args) => { state.calls.push([name, ...args]); };
  export const callActions = { startOrJoin: record("startOrJoin"), join: record("join"), leave: record("leave") };
`);
const hooksStub = dataModule(`
  const state = (globalThis.__W08N = globalThis.__W08N ?? {});
  state.handlers = state.handlers ?? { call: new Set(), resync: new Set() };
  export function imStore() {
    return {
      onEvent(type, handler) { const set = state.handlers[type] ?? (state.handlers[type] = new Set()); set.add(handler); return () => set.delete(handler); },
      onResync(handler) { state.handlers.resync.add(handler); return () => state.handlers.resync.delete(handler); },
      inbox() { return { items: state.items ?? [] }; },
    };
  }
`);
const callsApiStub = dataModule(`
  const state = (globalThis.__W08N = globalThis.__W08N ?? {});
  export const callsApi = { async status(cid) { state.calls.push(["status", cid]); return { call: null }; } };
`);
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }",
);
const toastStub = dataModule(`export function useToast(){ return { error(){}, success(){}, info(){} }; }`);
const confirmStub = dataModule(`export function ConfirmDialog(){ return null; } export function SkeletonCard(){ return null; } export function SkeletonLine(){ return null; }`);
const storeStub = dataModule(`export function formatBadge(n){ return n > 0 ? String(n) : ""; }`);

const IDLE = { phase: "idle", conversationId: null, callId: null, incoming: null, server: null, participants: [] };
globalThis.__W08N = { snapshot: { ...IDLE }, calls: [], handlers: { call: new Set(), resync: new Set() } };

// InboxRow 本身不静态依赖通话链路（标记组件由 Inbox 注入），所以行与装饰分开编译。
const { InboxRow } = await import(
  await compileModule("src/shell/messages/InboxRow.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "./realtime/store": storeStub,
  })
);
const { InboxCallDecor } = await import(
  await compileModule("src/shell/messages/call/chat/InboxCallBadge.tsx", {
    "../../../../i18n/ui/useUI": uiStub,
    "../../realtime/hooks": hooksStub,
    "../engine": engineStub,
    "../../../../lib/im/calls-api": callsApiStub,
    "../../../../ui": confirmStub,
    "../../../../ui/Toast": toastStub,
  })
);

function item(id, patch = {}) {
  return {
    id,
    kind: "group",
    title: "设计组",
    avatar_url: null,
    peer: null,
    member_count: 4,
    last_message: null,
    last_activity_at: "2026-10-23T01:00:00Z",
    unread_count: 0,
    mention_count: 0,
    muted: false,
    notify_level: "all",
    org_id: null,
    project_id: null,
    has_external: false,
    my_role: "member",
    dissolved: false,
    ...patch,
  };
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountRow(row, decor) {
  const opened = [];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(InboxRow, {
        item: row,
        active: false,
        hasDraft: false,
        onOpen: (id) => opened.push(id),
        callDecor: decor === undefined ? InboxCallDecor : decor,
      }),
    );
  });
  await flush();
  return {
    host,
    opened,
    badge: () => host.querySelector("[data-inbox-call-badge]"),
    async click(node) {
      await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await flush();
    },
    async emit(event) {
      await act(async () => {
        for (const h of Array.from(globalThis.__W08N.handlers.call)) h({ type: "call", ...event });
      });
      await flush();
    },
    async resync() {
      await act(async () => {
        for (const h of Array.from(globalThis.__W08N.handlers.resync)) h();
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
  globalThis.__W08N.calls = [];
  globalThis.__W08N.snapshot = { ...IDLE, ...snapshot };
  globalThis.__W08N.emit?.();
}

test("列表行：有 active_call 就在右列显示耳机 + 人数；标记不在行按钮里面（不嵌套按钮）", async () => {
  reset();
  const row = item("g-1", { active_call: { call_id: "call-1", participant_count: 3, started_at: "2026-10-23T01:00:00Z" } });
  globalThis.__W08N.items = [row];
  const view = await mountRow(row);
  const badge = view.badge();
  assert.ok(badge, "有标记");
  assert.equal(badge.tagName, "BUTTON");
  assert.equal(badge.getAttribute("data-call-count"), "3");
  assert.equal(badge.getAttribute("aria-label"), "通话进行中，3 人，点击加入");
  assert.ok(badge.querySelector('svg[data-call-icon="headphones"]'));
  assert.match(badge.textContent, /3/);
  const rowButton = view.host.querySelector('[data-testid="inbox-row"]');
  assert.equal(rowButton.tagName, "BUTTON");
  assert.equal(rowButton.contains(badge), false, "按钮里不套按钮");
  assert.equal(rowButton.querySelectorAll("button").length, 0);
  assert.ok(rowButton.querySelector("[data-inbox-call-slot]"), "右列给标记留了位置");
  assert.equal(globalThis.__W08N.calls.filter(([n]) => n === "status").length, 0, "列表行不逐个去取通话状态");
  await view.unmount();
});

test("点标记直接加入那一通（带会话标题），不会同时打开会话", async () => {
  reset();
  const row = item("g-2", { title: "产品组", active_call: { call_id: "call-2", participant_count: 2, started_at: "2026-10-23T01:00:00Z" } });
  globalThis.__W08N.items = [row];
  const view = await mountRow(row);
  await view.click(view.badge());
  assert.deepEqual(globalThis.__W08N.calls.filter(([n]) => n === "join"), [["join", "call-2", "g-2", { title: "产品组" }]]);
  assert.deepEqual(view.opened, [], "点标记不触发打开会话");
  await view.click(view.host.querySelector('[data-testid="inbox-row"]'));
  assert.deepEqual(view.opened, ["g-2"], "点行本身照旧打开会话");
  await view.unmount();
});

test("实时 call 事件：人数跟着变；通话结束 → 标记与占位一起消失；重连后回到列表数据", async () => {
  reset();
  const row = item("g-3", { active_call: { call_id: "call-3", participant_count: 2, started_at: "2026-10-23T01:00:00Z" } });
  const view = await mountRow(row);
  assert.equal(view.badge().getAttribute("data-call-count"), "2");
  await view.emit({ conversation_id: "g-3", call: view_("g-3", "call-3", ["u1", "u2", "u3", "u4", "u5"]) });
  assert.equal(view.badge().getAttribute("data-call-count"), "5");
  await view.emit({ conversation_id: "g-3", call: view_("g-3", "call-3", [], "ended") });
  assert.equal(view.badge(), null, "结束即消失，不出现 0 人");
  assert.equal(view.host.querySelector("[data-inbox-call-slot]"), null);
  await view.resync();
  assert.equal(view.badge().getAttribute("data-call-count"), "2", "重连后以重新拉到的列表数据为准");
  await view.unmount();
});

test("没有 active_call 的会话：收到 call 事件后出现标记", async () => {
  reset();
  const row = item("g-4");
  const view = await mountRow(row);
  assert.equal(view.badge(), null);
  await view.emit({ conversation_id: "g-4", call: view_("g-4", "call-4", ["u1"]) });
  assert.equal(view.badge().getAttribute("data-call-count"), "1");
  await view.unmount();
});

test("我就在这通里：标记写「通话中」，点击只展开小窗、不重复入会", async () => {
  reset({ phase: "connected", conversationId: "g-5", callId: "call-5" });
  const row = item("g-5", { active_call: { call_id: "call-5", participant_count: 2, started_at: "2026-10-23T01:00:00Z" } });
  let focus = 0;
  const onFocus = () => { focus += 1; };
  window.addEventListener("oceanleo:call-dock-focus", onFocus);
  const view = await mountRow(row);
  const badge = view.badge();
  assert.equal(badge.getAttribute("data-inbox-call-badge"), "mine");
  assert.equal(badge.getAttribute("aria-label"), "通话中，2 人");
  await view.click(badge);
  assert.equal(focus, 1);
  assert.equal(globalThis.__W08N.calls.filter(([n]) => n === "join").length, 0);
  window.removeEventListener("oceanleo:call-dock-focus", onFocus);
  await view.unmount();
});

test("交易会话：即使数据里带了 active_call 也不显示标记", async () => {
  reset();
  const row = item("talent:t1", { kind: "talent", active_call: { call_id: "call-6", participant_count: 2, started_at: "" } });
  const view = await mountRow(row);
  assert.equal(view.badge(), null);
  await view.unmount();
});

function view_(cid, callId, users, status) {
  return view(cid, callId, users, status);
}

test("没注入装饰（只为头像加载 InboxRow 的地方）：行照常画，没有任何通话元素", async () => {
  reset();
  const row = item("g-7", { active_call: { call_id: "call-7", participant_count: 2, started_at: "" } });
  const view = await mountRow(row, null);
  assert.ok(view.host.querySelector('[data-testid="inbox-row"]'));
  assert.equal(view.badge(), null);
  assert.equal(view.host.querySelector("[data-inbox-call-slot]"), null);
  await view.unmount();
});

test("接线：Inbox 把 InboxCallDecor 注入每一行；InboxRow 不静态引通话模块", () => {
  const inbox = readFileSync(new URL("../src/shell/messages/Inbox.tsx", import.meta.url), "utf8");
  assert.match(inbox, /import \{ InboxCallDecor \} from "\.\/call\/chat\/InboxCallBadge";/);
  assert.match(inbox, /callDecor=\{InboxCallDecor\}/);
  const row = readFileSync(new URL("../src/shell/messages/InboxRow.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(row, /from "\.\/call\//);
});

// ── V02 D1（仲裁 A-34）：实时层停 / 启之后收件箱不能一直空着 ─────────────────

const { createImStore } = await import("../src/shell/messages/realtime/store.ts");

function storeHarness(pages) {
  const socket = {
    started: 0,
    stopped: 0,
    start() { this.started += 1; },
    stop() { this.stopped += 1; },
    subscribe() { return () => {}; },
    state: () => "open",
    tokenChanged() {},
    noteActivity() {},
    noteVisibility() {},
    sendTyping() {},
  };
  const calls = [];
  const pending = [];
  const store = createImStore({
    socket,
    fetchUnread: async () => ({ total: 0, mentions: 0, requests: 0, by_conversation: {} }),
    fetchConversations: (filter) => {
      calls.push(filter);
      const next = pages.shift();
      if (next === "hold") return new Promise((resolve) => pending.push(resolve));
      return Promise.resolve(next ?? { items: [], next_cursor: null });
    },
    notifyDesktop() {},
    isHidden: () => false,
    selfId: async () => "me",
    fallbackTitle: () => "消息",
  });
  return { store, socket, calls, pending };
}

const page = (...ids) => ({ items: ids.map((id) => item(id)), next_cursor: null });
async function settled() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

test("D1 状态仓：列表加载过 → stop() 清空（换账号不留旧数据）→ start() 自己补拉回来", async () => {
  const h = storeHarness([page("a", "b"), page("a", "b", "c")]);
  h.store.start();
  await h.store.loadInbox("all");
  assert.deepEqual(h.store.inbox().items.map((i) => i.id).sort(), ["a", "b"]);
  h.store.stop();
  assert.equal(h.store.inbox().items.length, 0, "停的时候照旧清空");
  assert.equal(h.store.inbox().loaded, false);
  h.store.start();
  assert.equal(h.store.inbox().loading, true, "启动时就开始补拉");
  await settled();
  assert.deepEqual(h.calls, ["all", "all"]);
  assert.deepEqual(h.store.inbox().items.map((i) => i.id).sort(), ["a", "b", "c"]);
  assert.equal(h.store.inbox().loaded, true);
});

test("D1 状态仓：从没人要过列表时，start() 不多发请求", async () => {
  const h = storeHarness([]);
  h.store.start();
  h.store.stop();
  h.store.start();
  await settled();
  assert.deepEqual(h.calls, []);
});

test("D1 状态仓：stop() 之前发出的列表请求作废（结果可能属于上一个账号），以 start() 补拉的为准", async () => {
  const h = storeHarness(["hold", page("new-account-row")]);
  h.store.start();
  const first = h.store.loadInbox("all");
  h.store.stop();
  h.store.start();
  await settled();
  h.pending[0](page("old-account-row"));
  await first;
  await settled();
  assert.deepEqual(h.store.inbox().items.map((i) => i.id), ["new-account-row"]);
});

const inboxHooksStub = dataModule(`
  // 每次现读：测试会整体替换 globalThis.__W08D1。
  const S = () => globalThis.__W08D1;
  export function useImInbox() { return S().inbox; }
  export function useImConnection() { return "open"; }
  export function useImResync() {}
  export function imStore() {
    return {
      inbox: () => S().live ?? S().inbox,
      loadInbox: async (filter) => { S().loads.push(filter); S().live = { ...S().inbox, loading: true }; },
      loadMoreInbox: async () => {},
    };
  }
`);
const nullComponent = (name) => dataModule(`export function ${name}(){ return null; }`);
const { Inbox } = await import(
  await compileModule("src/shell/messages/Inbox.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "./realtime/hooks": inboxHooksStub,
    "../../lib/im/inbox-api": dataModule(`export async function fetchDraftConversationIds(){ return new Set(); }`),
    "../../lib/im/groups-api": dataModule(`export async function clearConversationHistory(){} export async function markConversationUnread(){} export async function patchMySettings(){}`),
    "../../lib/im/people-api": dataModule(`export function reasonOf(_e, fallback){ return fallback; }`),
    "../../lib/im/search-api": dataModule(`export function searchQueryReady(){ return false; }`),
    "../../ui": confirmStub,
    "../leochat/PanelToolbar": nullComponent("PanelToolbar"),
    "./InboxRow": nullComponent("InboxRow"),
    "./notices/InboxNoticesRow": nullComponent("InboxNoticesRow"),
    "./people/InviteLinkDialog": nullComponent("InviteLinkDialog"),
    "./search/SearchView": nullComponent("SearchView"),
    "./call/chat/InboxCallBadge": nullComponent("InboxCallDecor"),
  })
);

async function mountInbox(inboxState) {
  globalThis.__W08D1 = { inbox: inboxState, live: null, loads: [] };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Inbox, { activeConversationId: null, onOpenConversation() {}, onNew() {}, onOpenNotices() {} }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const EMPTY = { filter: "all", items: [], nextCursor: null, loaded: false, loading: false, error: null, needsRefresh: false };

test("D1 列表：空且还没加载（刚被实时层清空）→ 显示「正在加载…」并自己补拉一次，不留空白", async () => {
  const view = await mountInbox({ ...EMPTY });
  assert.ok(view.host.querySelector("[data-inbox-loading]"), "显示正在加载");
  // 2026-10-31 W5：加载态是页面级骨架（与 LeoChat 页 / 任务切换同一个），读屏念「正在加载…」。
  const skeleton = view.host.querySelector("[data-inbox-loading] [data-route-page-skeleton]");
  assert.ok(skeleton, "加载态用 RoutePageSkeleton");
  assert.equal(skeleton.getAttribute("role"), "status");
  assert.equal(skeleton.getAttribute("aria-label"), "正在加载…");
  assert.doesNotMatch(view.text(), /还没有会话/);
  assert.deepEqual(globalThis.__W08D1.loads, ["all"], "挂载与空闲补拉合起来只发一次");
  await view.unmount();
});

test("D1 列表：正在加载也显示「正在加载…」；加载完是空的才写「还没有会话」；出错显示重试、不显示加载中", async () => {
  const loading = await mountInbox({ ...EMPTY, loading: true });
  assert.ok(loading.host.querySelector("[data-inbox-loading]"));
  assert.deepEqual(globalThis.__W08D1.loads, [], "已经在加载就不重复发请求");
  await loading.unmount();

  const empty = await mountInbox({ ...EMPTY, loaded: true });
  assert.equal(empty.host.querySelector("[data-inbox-loading]"), null);
  assert.match(empty.text(), /还没有会话/);
  assert.deepEqual(globalThis.__W08D1.loads, []);
  await empty.unmount();

  const failed = await mountInbox({ ...EMPTY, error: "load_failed" });
  assert.equal(failed.host.querySelector("[data-inbox-loading]"), null);
  assert.match(failed.text(), /会话列表暂时打不开/);
  assert.deepEqual(globalThis.__W08D1.loads, ["all"], "挂载时照旧重试一次；空闲补拉不在出错时反复打");
  await failed.unmount();
});

