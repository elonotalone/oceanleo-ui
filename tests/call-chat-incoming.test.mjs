// calls-v2 W08 · 来电（任务书 P3/P4；合同 §1 A2、§3.1 RING_TIMEOUT=45s、§3.3 推送深链）。
// 判据：卡片两种来源（实时 call_ring / 推送深链）、45 秒自动收起、接听 / 拒接分派对、已在这通不弹；
// 铃声是 Web Audio 合成的双音、自动播放被拦时有可见提示且点一下能开；多标签页只响一次；深链只在通话仍在进行时弹卡片。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  HANDLED_MAX,
  MIN_VISIBLE_MS,
  RING_TIMEOUT_MS,
  acceptIncomingCard,
  answerFromPush,
  callerDisplayName,
  declineIncomingCard,
  pickIncoming,
  ringCallerOf,
  ringDeadline,
  withHandled,
} from "../src/shell/messages/call/incoming/incoming-model.ts";
import { RING_BURSTS, RING_PERIOD_S, RING_TONES_HZ, createRingtone } from "../src/shell/messages/call/incoming/ringtone.ts";
import { HIDDEN_DELAY_MS, RING_LOCK_PREFIX, claimRing } from "../src/shell/messages/call/incoming/ring-leader.ts";
import { parseCallDeepLink, stripCallDeepLink } from "../src/shell/messages/call/incoming/deep-link.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://www.oceanleo.com/leochat" });
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

const iso = (ms) => new Date(ms).toISOString();

// ── 卡片状态机（纯）────────────────────────────────────────────────────────

test("ringDeadline：本地首见 + 45 秒为上限；服务端 expires_at 更早用它；已过期也至少留 3 秒；坏值用上限", () => {
  const t0 = 1_000_000;
  assert.equal(RING_TIMEOUT_MS, 45_000);
  assert.equal(ringDeadline(iso(t0 + 45_000), t0), t0 + 45_000);
  assert.equal(ringDeadline(iso(t0 + 20_000), t0), t0 + 20_000, "深链晚开：只剩 20 秒");
  assert.equal(ringDeadline(iso(t0 + 600_000), t0), t0 + 45_000, "时钟偏差也不会挂太久");
  assert.equal(ringDeadline(iso(t0 - 60_000), t0), t0 + MIN_VISIBLE_MS);
  assert.equal(ringDeadline("not a date", t0), t0 + 45_000);
  assert.equal(ringDeadline(null, t0), t0 + 45_000);
});

const ENGINE = { callId: "call-1", conversationId: "c1", callerId: "u1", callerName: "张三", expiresAt: iso(2_000_000 + 45_000) };
const LINK = { callId: "call-2", conversationId: "c2", callerId: "u2", callerName: "李四", seenAt: 2_000_000 };

test("pickIncoming：实时来电优先；处理过的、已经在这通里的不弹；45 秒后收起；深链同样 45 秒", () => {
  const base = { engine: ENGINE, engineFirstSeenAt: 2_000_000, link: LINK, handled: new Set(), liveCallId: null, now: 2_000_000 };
  assert.equal(pickIncoming(base).source, "ring");
  assert.equal(pickIncoming(base).callerName, "张三");
  assert.equal(pickIncoming({ ...base, handled: new Set(["call-1"]) }).source, "link", "拒接了实时来电后，深链那张还在");
  assert.equal(pickIncoming({ ...base, liveCallId: "call-1", link: null }), null, "已经在这通里");
  assert.equal(pickIncoming({ ...base, now: 2_000_000 + 45_000, link: null }), null, "45 秒到点");
  assert.equal(pickIncoming({ ...base, now: 2_000_000 + 44_999, link: null }).callId, "call-1");
  assert.equal(pickIncoming({ ...base, engine: null, now: 2_000_000 + 45_000 }), null, "深链卡片也是 45 秒");
  assert.equal(pickIncoming({ ...base, engine: null, link: null }), null);
});

test("withHandled：已处理集合有上限，最新的留着", () => {
  let set = new Set();
  for (let i = 0; i < HANDLED_MAX + 10; i += 1) set = withHandled(set, `c${i}`);
  assert.equal(set.size, HANDLED_MAX);
  assert.ok(set.has(`c${HANDLED_MAX + 9}`));
  assert.ok(!set.has("c0"));
});

test("接听 / 拒接按来源分派；拒接失败不抛（卡片照样收起）", async () => {
  const calls = [];
  const actions = {
    acceptRing: async () => calls.push("acceptRing"),
    declineRing: async () => { calls.push("declineRing"); throw new Error("offline"); },
    joinLink: async (card) => calls.push(`joinLink:${card.callId}`),
    declineLink: async (id) => calls.push(`declineLink:${id}`),
  };
  await acceptIncomingCard(actions, { source: "ring", callId: "a" });
  await acceptIncomingCard(actions, { source: "link", callId: "b" });
  await declineIncomingCard(actions, { source: "ring", callId: "a" });
  await declineIncomingCard(actions, { source: "link", callId: "b" });
  assert.deepEqual(calls, ["acceptRing", "joinLink:b", "declineRing", "declineLink:b"]);
});

// ── 铃声（假 AudioContext）──────────────────────────────────────────────────

function fakeAudio({ state = "running", resume = "ok" } = {}) {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    oscillators: [],
    closed: false,
    resumes: 0,
    resume() {
      ctx.resumes += 1;
      if (resume === "hang") return new Promise(() => {});
      if (resume === "reject") return Promise.reject(new Error("NotAllowedError"));
      ctx.state = "running";
      return Promise.resolve();
    },
    close() {
      ctx.closed = true;
      ctx.state = "closed";
      return Promise.resolve();
    },
    createOscillator() {
      const osc = { type: "", frequency: param(), connect() {}, start(at) { osc.startAt = at; }, stop(at) { osc.stopAt = at; } };
      ctx.oscillators.push(osc);
      return osc;
    },
    createGain() {
      return { gain: param(), connect() {} };
    },
  };
  return ctx;
}

function ringtoneDeps(ctx) {
  const timers = { active: new Set(), cleared: 0 };
  return {
    timers,
    deps: {
      createContext: () => ctx,
      setInterval(fn) {
        const handle = { fn };
        timers.active.add(handle);
        return handle;
      },
      clearInterval(handle) {
        timers.active.delete(handle);
        timers.cleared += 1;
      },
      wait: () => Promise.resolve(),
    },
  };
}

test("铃声：上下文可用就响——双音（C5 + E5）两声一轮，预排 3 秒；stop 关掉上下文与计时器", async () => {
  const ctx = fakeAudio();
  const { deps, timers } = ringtoneDeps(ctx);
  const tone = createRingtone(deps);
  assert.equal(await tone.start(), "playing");
  assert.equal(tone.playing(), true);
  const rounds = Math.ceil((3 - 0.05) / RING_PERIOD_S);
  assert.equal(ctx.oscillators.length, rounds * RING_BURSTS.length * RING_TONES_HZ.length);
  assert.deepEqual(new Set(ctx.oscillators.map((o) => o.frequency.value)), new Set(RING_TONES_HZ));
  assert.ok(ctx.oscillators.every((o) => o.type === "sine" && o.stopAt > o.startAt));
  assert.equal(timers.active.size, 1, "每秒补排一次");
  // 时间往前走，补排下一轮。
  ctx.currentTime = 2;
  for (const handle of timers.active) handle.fn();
  assert.ok(ctx.oscillators.length > rounds * RING_BURSTS.length * RING_TONES_HZ.length);
  tone.stop();
  assert.equal(ctx.closed, true);
  assert.equal(timers.active.size, 0);
  assert.equal(tone.playing(), false);
});

test("铃声：浏览器拦了自动播放（resume 不落定）→ blocked、一声不出；用户点一下 unlock → 响", async () => {
  const ctx = fakeAudio({ state: "suspended", resume: "hang" });
  const { deps } = ringtoneDeps(ctx);
  const tone = createRingtone(deps);
  assert.equal(await tone.start(), "blocked");
  assert.equal(ctx.oscillators.length, 0);
  // 用户手势里的 resume 会成功。
  ctx.resume = () => {
    ctx.state = "running";
    return Promise.resolve();
  };
  assert.equal(await tone.unlock(), "playing");
  assert.ok(ctx.oscillators.length > 0);
  tone.stop();
});

test("铃声：没有 Web Audio → unsupported；resume 被拒 → blocked", async () => {
  const none = createRingtone({ ...ringtoneDeps(null).deps, createContext: () => null });
  assert.equal(await none.start(), "unsupported");
  const rejected = fakeAudio({ state: "suspended", resume: "reject" });
  const tone = createRingtone(ringtoneDeps(rejected).deps);
  assert.equal(await tone.start(), "blocked");
  assert.equal(await tone.unlock(), "blocked");
});

// ── 多标签页只响一次 ────────────────────────────────────────────────────────

function sharedLocks() {
  const held = new Set();
  return {
    held,
    request(name, options, callback) {
      if (held.has(name)) {
        return Promise.resolve(callback(null));
      }
      held.add(name);
      return Promise.resolve(callback({ name })).then(() => {
        held.delete(name);
      });
    },
  };
}

function leaderDeps({ locks = null, tabId, visible = true }) {
  const timers = [];
  return {
    tabId,
    timers,
    deps: {
      locks,
      isVisible: () => visible,
      setTimeout(fn, ms) {
        const handle = { fn, ms };
        timers.push(handle);
        return handle;
      },
      clearTimeout(handle) {
        const i = timers.indexOf(handle);
        if (i >= 0) timers.splice(i, 1);
      },
    },
  };
}

test("Web Locks：两个标签页同时来电，只有一个拿到锁响铃；响的那个停了，锁放掉", async () => {
  const locks = sharedLocks();
  const a = claimRing(leaderDeps({ locks, tabId: "a" }).deps, "call-1");
  const b = claimRing(leaderDeps({ locks, tabId: "b" }).deps, "call-1");
  const [wa, wb] = await Promise.all([a.won, b.won]);
  assert.deepEqual([wa, wb].sort(), [false, true]);
  assert.ok(locks.held.has(`${RING_LOCK_PREFIX}call-1`));
  (wa ? a : b).release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(locks.held.size, 0, "铃声停了锁就放掉");
  b.release();
  a.release();
});

test("Web Locks：后台标签页晚 120 毫秒去拿锁（用户正看着的那页优先响）", async () => {
  const locks = sharedLocks();
  const hidden = leaderDeps({ locks, tabId: "h", visible: false });
  const claimHidden = claimRing(hidden.deps, "call-2");
  assert.equal(hidden.timers.length, 1);
  assert.equal(hidden.timers[0].ms, HIDDEN_DELAY_MS);
  const visible = claimRing(leaderDeps({ locks, tabId: "v" }).deps, "call-2");
  assert.equal(await visible.won, true);
  hidden.timers[0].fn();
  assert.equal(await claimHidden.won, false);
  visible.release();
  claimHidden.release();
});

test("没有 Web Locks（很老的浏览器）：照响，宁可多响一次", async () => {
  const claim = claimRing(leaderDeps({ tabId: "solo" }).deps, "call-4");
  assert.equal(await claim.won, true);
});

// ── 深链（纯）───────────────────────────────────────────────────────────────

test("parseCallDeepLink / stripCallDeepLink：只认 c 与 call 两个参数；坏值、交易会话一律当没有", () => {
  assert.deepEqual(parseCallDeepLink("?c=conv-1&call=call-9"), { conversationId: "conv-1", callId: "call-9" });
  assert.deepEqual(parseCallDeepLink("?c=conv-1"), { conversationId: "conv-1", callId: null });
  assert.deepEqual(parseCallDeepLink("?c=conv-1&call=..%2Fx"), { conversationId: "conv-1", callId: null });
  assert.equal(parseCallDeepLink("?c=talent:t1&call=x"), null);
  assert.equal(parseCallDeepLink("?c=&call=x"), null);
  assert.equal(parseCallDeepLink("?im=conv-1"), null);
  assert.equal(parseCallDeepLink(""), null);
  assert.equal(stripCallDeepLink("?c=conv-1&call=call-9&tab=x"), "?tab=x");
  assert.equal(stripCallDeepLink("?c=conv-1&call=call-9"), "");
});

// ── IncomingCallHost 组件 ───────────────────────────────────────────────────

const engineStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  const listeners = new Set();
  const state = (globalThis.__W08I = globalThis.__W08I ?? {});
  export const callStore = {
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    getSnapshot() { return state.snapshot; },
  };
  state.emit = () => { for (const l of Array.from(listeners)) l(); };
  export function useCall() { return useSyncExternalStore(callStore.subscribe, callStore.getSnapshot, callStore.getSnapshot); }
  const record = (name) => async (...args) => { state.calls.push([name, ...args]); };
  export const callActions = {
    acceptIncoming: record("acceptIncoming"),
    declineIncoming: record("declineIncoming"),
    join: record("join"),
    leave: record("leave"),
    startOrJoin: record("startOrJoin"),
  };
`);
const ringLeaderStub = dataModule(`
  const state = (globalThis.__W08I = globalThis.__W08I ?? {});
  export function browserRingLeaderDeps() { return {}; }
  export function claimRing(_deps, callId) {
    state.calls.push(["claimRing", callId]);
    return { won: Promise.resolve(state.ringWins !== false), release() { state.calls.push(["release", callId]); } };
  }
`);
const ringtoneStub = dataModule(`
  const state = (globalThis.__W08I = globalThis.__W08I ?? {});
  export function browserRingtoneDeps() { return {}; }
  export function createRingtone() {
    return {
      async start() { state.calls.push(["ringStart"]); return state.ringResult ?? "playing"; },
      async unlock() { state.calls.push(["ringUnlock"]); return "playing"; },
      stop() { state.calls.push(["ringStop"]); },
      playing() { return false; },
    };
  }
`);
const callsApiStub = dataModule(`
  const state = (globalThis.__W08I = globalThis.__W08I ?? {});
  export const callsApi = {
    async status(cid) { state.calls.push(["status", cid]); return state.status?.[cid] ?? { call: null }; },
    async decline(id) { state.calls.push(["declineApi", id]); return { ok: true }; },
  };
`);
const messagesApiStub = dataModule(`
  const state = (globalThis.__W08I = globalThis.__W08I ?? {});
  export const messagesApi = {
    async profiles(ids) {
      state.calls.push(["profiles", ids.join(",")]);
      // D4 用例：资料接口还没回来（主叫名字未到）时，卡片不能写占位词。
      if (state.profilesHang) await new Promise((resolve) => { state.releaseProfiles = resolve; });
      return ids.map((id) => ({ user_id: id, display_name: state.names?.[id] ?? id, avatar_url: null }));
    },
  };
`);
const hooksStub = dataModule(`
  import { useEffect, useRef } from ${JSON.stringify(reactUrl)};
  const state = (globalThis.__W08I = globalThis.__W08I ?? {});
  state.imHandlers = state.imHandlers ?? {};
  export function useImEvent(type, handler) {
    const ref = useRef(handler);
    ref.current = handler;
    useEffect(() => {
      const set = state.imHandlers[type] ?? (state.imHandlers[type] = new Set());
      const fn = (event) => ref.current(event);
      set.add(fn);
      return () => set.delete(fn);
    }, [type]);
  }
`);
const authStub = dataModule(`export async function getUserId(){ return "me"; }`);
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }",
);
const toastStub = dataModule(`export function useToast(){ return { error(t){ (globalThis.__W08I.toasts ??= []).push(t); }, success(){}, info(){} }; }`);
const confirmStub = dataModule(`export function ConfirmDialog(){ return null; }`);

const IDLE = { phase: "idle", conversationId: null, callId: null, incoming: null, server: null, participants: [] };
globalThis.__W08I = { snapshot: { ...IDLE }, calls: [] };

const incoming = await import(
  await compileModule("src/shell/messages/call/incoming/index.ts", {
    "../../../../i18n/ui/useUI": uiStub,
    "../engine": engineStub,
    "./ring-leader": ringLeaderStub,
    "./ringtone": ringtoneStub,
    "../../../../lib/im/calls-api": callsApiStub,
    "../../../../lib/im/messages-api": messagesApiStub,
    "../../realtime/hooks": hooksStub,
    "../../../../lib/auth/client": authStub,
    "../../../../ui/Toast": toastStub,
    "../../../../ui": confirmStub,
  })
);
const { IncomingCallHost, consumeCallDeepLink } = incoming;

function setCall(patch) {
  globalThis.__W08I.snapshot = { ...IDLE, ...patch };
  globalThis.__W08I.emit?.();
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountHost() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(IncomingCallHost)));
  await flush();
  return {
    host,
    q: (s) => host.querySelector(s),
    async click(selector) {
      const node = host.querySelector(selector);
      assert.ok(node, `missing ${selector}`);
      await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await flush();
    },
    async set(patch) {
      await act(async () => setCall(patch));
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function reset() {
  globalThis.__W08I.profilesHang = false;
  globalThis.__W08I.releaseProfiles?.();
  globalThis.__W08I.releaseProfiles = null;
  globalThis.__W08I.calls = [];
  globalThis.__W08I.toasts = [];
  globalThis.__W08I.ringWins = true;
  globalThis.__W08I.ringResult = "playing";
  globalThis.__W08I.status = {};
  globalThis.__W08I.names = {};
  setCall({});
}

const ring = (callId, extra = {}) => ({
  callId,
  conversationId: "dm-1",
  callerId: "u1",
  callerName: "张三",
  expiresAt: iso(Date.now() + 45_000),
  ...extra,
});

test("没有来电：什么都不渲染（每个页面都挂它，空闲时不出东西）", async () => {
  reset();
  const view = await mountHost();
  assert.equal(view.host.innerHTML, "");
  await view.unmount();
});

test("实时来电：卡片写主叫名字与「邀请你通话」，层级 1160，响铃；接听 = acceptIncoming，卡片收起、铃声停", async () => {
  reset();
  const view = await mountHost();
  await view.set({ incoming: ring("call-a") });
  const card = view.q('[data-incoming-call="ring"]');
  assert.ok(card, "弹出来电卡片");
  assert.equal(card.getAttribute("role"), "dialog");
  assert.match(card.textContent, /张三/);
  assert.match(card.textContent, /邀请你通话/);
  assert.equal(view.q("[data-incoming-call-layer]").style.zIndex, "1160");
  assert.equal(card.getAttribute("data-ring"), "playing");
  assert.ok(globalThis.__W08I.calls.some(([n, id]) => n === "claimRing" && id === "call-a"));
  assert.ok(globalThis.__W08I.calls.some(([n]) => n === "ringStart"));
  await view.click('[data-incoming-action="accept"]');
  assert.ok(globalThis.__W08I.calls.some(([n]) => n === "acceptIncoming"));
  assert.equal(view.q("[data-incoming-call]"), null, "接听后卡片收起");
  assert.ok(globalThis.__W08I.calls.some(([n]) => n === "ringStop"), "铃声停");
  assert.ok(globalThis.__W08I.calls.some(([n, id]) => n === "release" && id === "call-a"), "放掉跨标签的响铃权");
  await view.unmount();
});

test("拒接 = declineIncoming；卡片收起后同一通不会再弹", async () => {
  reset();
  const view = await mountHost();
  await view.set({ incoming: ring("call-b") });
  await view.click('[data-incoming-action="decline"]');
  assert.ok(globalThis.__W08I.calls.some(([n]) => n === "declineIncoming"));
  assert.equal(view.q("[data-incoming-call]"), null);
  await view.set({ incoming: ring("call-b") });
  assert.equal(view.q("[data-incoming-call]"), null, "已处理过的来电不重复弹");
  await view.unmount();
});

test("自动播放被拦：卡片里有可见提示，点一下开启声音", async () => {
  reset();
  globalThis.__W08I.ringResult = "blocked";
  const view = await mountHost();
  await view.set({ incoming: ring("call-c") });
  assert.equal(view.q("[data-incoming-call]").getAttribute("data-ring"), "blocked");
  const unlock = view.q("[data-ring-unlock]");
  assert.ok(unlock);
  assert.match(unlock.textContent, /浏览器拦住了铃声，点这里开启声音/);
  await view.click("[data-ring-unlock]");
  assert.ok(globalThis.__W08I.calls.some(([n]) => n === "ringUnlock"));
  assert.equal(view.q("[data-incoming-call]").getAttribute("data-ring"), "playing");
  assert.equal(view.q("[data-ring-unlock]"), null);
  await view.unmount();
});

test("别的标签页在响：本页卡片照样弹，但自己不出声", async () => {
  reset();
  globalThis.__W08I.ringWins = false;
  const view = await mountHost();
  await view.set({ incoming: ring("call-d") });
  assert.equal(view.q("[data-incoming-call]").getAttribute("data-ring"), "other_tab");
  assert.equal(globalThis.__W08I.calls.filter(([n]) => n === "ringStart").length, 0);
  await view.unmount();
});

test("已经在这通里（多端）不弹；在别的通话里弹，并写明「接听将离开当前通话」", async () => {
  reset();
  const view = await mountHost();
  await view.set({ phase: "connected", conversationId: "dm-1", callId: "call-e", incoming: ring("call-e") });
  assert.equal(view.q("[data-incoming-call]"), null);
  await view.set({ phase: "connected", conversationId: "g-9", callId: "call-other", incoming: ring("call-f") });
  assert.ok(view.q("[data-incoming-switch]"));
  assert.match(view.q("[data-incoming-switch]").textContent, /接听将离开当前通话/);
  await view.unmount();
});

test("到点自动收起：服务端到期时间已过 → 最多再留 3 秒就收起，铃声停", async () => {
  reset();
  const view = await mountHost();
  await view.set({ incoming: ring("call-g", { expiresAt: iso(Date.now() - 1_000) }) });
  assert.ok(view.q("[data-incoming-call]"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, MIN_VISIBLE_MS + 200));
  });
  await flush();
  assert.equal(view.q("[data-incoming-call]"), null);
  assert.ok(globalThis.__W08I.calls.some(([n]) => n === "ringStop"));
  await view.unmount();
});

function linkEnv(search) {
  const opened = [];
  const replaced = [];
  return {
    opened,
    replaced,
    env: {
      location: { pathname: "/leochat", search, hash: "" },
      history: { state: { keep: 1 }, replaceState: (state, _t, url) => replaced.push([state, url]) },
      open: (id) => opened.push(id),
      now: () => Date.now(),
    },
  };
}

test("推送深链：打开该会话、清掉参数；核实通话仍在进行 → 弹接听卡片（不响铃）；接听 = join 那一通", async () => {
  reset();
  // 主叫资料按 id 缓存（模块级）：用一个前面用例没见过的 id。
  globalThis.__W08I.names = { u7: "张三" };
  globalThis.__W08I.status = {
    "dm-7": {
      call: {
        call_id: "call-7",
        conversation_id: "dm-7",
        status: "active",
        started_by: "u7",
        started_at: iso(Date.now() - 5_000),
        ended_at: null,
        participants: [{ participant_id: "p1", user_id: "u7", joined_at: iso(Date.now()), last_seen_at: iso(Date.now()), media: { mic: true, camera: false, screen: false } }],
        participant_count: 1,
        ring: { caller_id: "u7", callee_ids: ["me"], expires_at: iso(Date.now() + 40_000), state: "ringing" },
        recording: null,
        transcription: null,
        controls: [],
      },
    },
  };
  const view = await mountHost();
  const link = linkEnv("?c=dm-7&call=call-7&tab=x");
  await act(async () => {
    assert.equal(consumeCallDeepLink(link.env), true);
  });
  await flush(10);
  assert.deepEqual(link.opened, ["dm-7"]);
  assert.deepEqual(link.replaced, [[{ keep: 1 }, "/leochat?tab=x"]]);
  const card = view.q('[data-incoming-call="link"]');
  assert.ok(card, "核实后弹卡片");
  assert.match(card.textContent, /张三/);
  assert.equal(globalThis.__W08I.calls.filter(([n]) => n === "claimRing").length, 0, "深链卡片不响铃");
  await view.click('[data-incoming-action="accept"]');
  assert.deepEqual(globalThis.__W08I.calls.filter(([n]) => n === "join"), [["join", "call-7", "dm-7", { title: "张三" }]]);
  assert.equal(view.q("[data-incoming-call]"), null);
  await view.unmount();
});

test("推送深链：通话已结束 / 主叫是自己 → 只打开会话，不弹卡片；拒接走 POST /decline", async () => {
  reset();
  globalThis.__W08I.status = { "dm-8": { call: null } };
  const view = await mountHost();
  const ended = linkEnv("?c=dm-8&call=call-8");
  await act(async () => consumeCallDeepLink(ended.env));
  await flush(10);
  assert.deepEqual(ended.opened, ["dm-8"]);
  assert.equal(view.q("[data-incoming-call]"), null);

  const active = (cid, callId, caller) => ({
    call: {
      call_id: callId, conversation_id: cid, status: "active", started_by: caller, started_at: iso(Date.now()), ended_at: null,
      participants: [], participant_count: 1, ring: null, recording: null, transcription: null, controls: [],
    },
  });
  globalThis.__W08I.status = { "dm-9": active("dm-9", "call-9", "me"), "dm-10": active("dm-10", "call-10", "u2") };
  const mine = linkEnv("?c=dm-9&call=call-9");
  await act(async () => consumeCallDeepLink(mine.env));
  await flush(10);
  assert.equal(view.q("[data-incoming-call]"), null, "自己发起的通话不给自己弹来电");

  const other = linkEnv("?c=dm-10&call=call-10");
  await act(async () => consumeCallDeepLink(other.env));
  await flush(10);
  assert.ok(view.q('[data-incoming-call="link"]'));
  await view.click('[data-incoming-action="decline"]');
  assert.ok(globalThis.__W08I.calls.some(([n, id]) => n === "declineApi" && id === "call-10"));
  assert.equal(view.q("[data-incoming-call]"), null);
  await view.unmount();

  assert.equal(consumeCallDeepLink(linkEnv("?im=dm-1").env), false, "不是通话深链就不动");
});

// ── 门户已开着时点来电推送：一键接听（仲裁 A-20）──────────────────────────

function pushDeps({ phase = "idle", callId = null, incoming = null, current = null } = {}) {
  const calls = [];
  const state = { phase, callId, incoming };
  return {
    calls,
    deps: {
      snapshot: () => state,
      isLive: (p) => p === "joining" || p === "connected" || p === "reconnecting",
      acceptIncoming: async () => calls.push(["acceptIncoming"]),
      join: async (id, cid) => calls.push(["join", id, cid]),
      leave: async (reason) => {
        calls.push(["leave", reason]);
        state.phase = "idle";
      },
      currentCall: async (cid) => {
        calls.push(["currentCall", cid]);
        return current;
      },
      focusDock: () => calls.push(["focusDock"]),
    },
  };
}

test("answerFromPush：本页还在响 → acceptIncoming；没响但通话仍在进行 → join；已结束 → 什么都不做；没有 callId → 忽略", async () => {
  const ringing = pushDeps({ incoming: { callId: "call-1", conversationId: "dm-1" } });
  assert.equal(await answerFromPush(ringing.deps, { conversationId: "dm-1", callId: "call-1" }), "accepted");
  assert.deepEqual(ringing.calls, [["acceptIncoming"]]);

  const active = pushDeps({ current: { callId: "call-2", status: "active" } });
  assert.equal(await answerFromPush(active.deps, { conversationId: "dm-2", callId: "call-2" }), "joined");
  assert.deepEqual(active.calls, [["currentCall", "dm-2"], ["join", "call-2", "dm-2"]]);

  const switching = pushDeps({ phase: "connected", callId: "call-other", current: { callId: "call-3", status: "active" } });
  assert.equal(await answerFromPush(switching.deps, { conversationId: "dm-3", callId: "call-3" }), "joined");
  assert.deepEqual(switching.calls, [["currentCall", "dm-3"], ["leave", "switch"], ["join", "call-3", "dm-3"]]);

  const gone = pushDeps({ current: null });
  assert.equal(await answerFromPush(gone.deps, { conversationId: "dm-4", callId: "call-4" }), "gone");
  assert.deepEqual(gone.calls, [["currentCall", "dm-4"]]);
  const other = pushDeps({ current: { callId: "call-new", status: "active" } });
  assert.equal(await answerFromPush(other.deps, { conversationId: "dm-5", callId: "call-old" }), "gone", "会话里已经是另一通了");
  assert.deepEqual(other.calls.filter(([n]) => n === "join"), []);

  const already = pushDeps({ phase: "connected", callId: "call-6" });
  assert.equal(await answerFromPush(already.deps, { conversationId: "dm-6", callId: "call-6" }), "already");
  assert.deepEqual(already.calls, [["focusDock"]]);

  const plain = pushDeps();
  assert.equal(await answerFromPush(plain.deps, { conversationId: "dm-7" }), "ignored");
  assert.equal(await answerFromPush(plain.deps, null), "ignored");
  assert.deepEqual(plain.calls, []);
});

const notifyApiStub = dataModule(`
  export async function fetchPushConfig(){ return null; }
  export async function registerPushSubscription(){ return null; }
  export async function removePushSubscription(){ return null; }
  export async function saveImSettings(){ return { ok: true }; }
`);
const { installImOpenBridge, IM_OPEN_EVENT } = await import(
  await compileModule("src/shell/messages/notify/push-subscribe.ts", { "../../../lib/im/notify-api": notifyApiStub })
);

test("推送桥：SW 发来的 call_id 按 ^[A-Za-z0-9-]{1,64}$ 校验后放进 detail.callId；坏值丢掉、只打开会话；别处来的消息不认", async () => {
  const listeners = new Set();
  const container = {
    addEventListener: (_type, l) => listeners.add(l),
    removeEventListener: (_type, l) => listeners.delete(l),
  };
  Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: container });
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: window.navigator });
  const seen = [];
  const onOpen = (event) => seen.push(event.detail);
  window.addEventListener(IM_OPEN_EVENT, onOpen);
  const off = installImOpenBridge();
  const sw = { scriptURL: `${window.location.origin}/im-sw.js` };
  const send = (data, source = sw, origin = window.location.origin) => {
    for (const l of Array.from(listeners)) l({ data, source, origin });
  };
  const uuid = "8f0c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f";
  send({ type: "im.open", conversation_id: "dm-1", call_id: uuid });
  send({ type: "im.open", conversation_id: "dm-2" });
  send({ type: "im.open", conversation_id: "dm-3", call_id: "../../etc/passwd" });
  send({ type: "im.open", conversation_id: "dm-4", call_id: "x".repeat(65) });
  send({ type: "im.open", conversation_id: "dm-5", call_id: 42 });
  send({ type: "im.open", conversation_id: "dm-6", call_id: uuid }, { scriptURL: "https://evil.example.com/im-sw.js" });
  send({ type: "im.open", conversation_id: "dm-7", call_id: uuid }, sw, "https://evil.example.com");
  send({ type: "other", conversation_id: "dm-8", call_id: uuid });
  assert.deepEqual(seen, [
    { conversationId: "dm-1", callId: uuid },
    { conversationId: "dm-2" },
    { conversationId: "dm-3" },
    { conversationId: "dm-4" },
    { conversationId: "dm-5" },
  ]);
  off();
  window.removeEventListener(IM_OPEN_EVENT, onOpen);
  delete window.navigator.serviceWorker;
});

test("来电宿主：收到带 callId 的 oceanleo:im-open → 卡片收起、直接接听（本页在响）或核实后加入（本页没响）", async () => {
  reset();
  const view = await mountHost();
  await view.set({ incoming: ring("call-p1", { conversationId: "dm-p1" }) });
  assert.ok(view.q('[data-incoming-call="ring"]'));
  await act(async () => {
    window.dispatchEvent(new window.CustomEvent(IM_OPEN_EVENT, { detail: { conversationId: "dm-p1", callId: "call-p1" } }));
  });
  await flush(8);
  assert.ok(globalThis.__W08I.calls.some(([n]) => n === "acceptIncoming"));
  assert.equal(view.q("[data-incoming-call]"), null);

  reset();
  globalThis.__W08I.status = {
    "dm-p2": {
      call: {
        call_id: "call-p2", conversation_id: "dm-p2", status: "active", started_by: "u2", started_at: iso(Date.now()), ended_at: null,
        participants: [], participant_count: 1, ring: null, recording: null, transcription: null, controls: [],
      },
    },
  };
  await act(async () => {
    window.dispatchEvent(new window.CustomEvent(IM_OPEN_EVENT, { detail: { conversationId: "dm-p2", callId: "call-p2" } }));
  });
  await flush(8);
  assert.deepEqual(globalThis.__W08I.calls.filter(([n]) => n === "join"), [["join", "call-p2", "dm-p2"]]);

  reset();
  await act(async () => {
    window.dispatchEvent(new window.CustomEvent(IM_OPEN_EVENT, { detail: { conversationId: "dm-p3" } }));
  });
  await flush(4);
  assert.deepEqual(globalThis.__W08I.calls, [], "普通的打开会话事件不碰通话");
  await view.unmount();
});

// ── 主叫名字（V02 D4，仲裁 A-34）───────────────────────────────────────────

test("ringCallerOf / callerDisplayName：响铃载荷的名字当纯文本、头像只认 https；引擎名字优先，其次载荷，最后资料", () => {
  assert.deepEqual(ringCallerOf({ caller_name: "  测试‮甲\n ", caller_avatar_url: "https://img.example.com/a.png" }), {
    name: "测试 甲",
    avatarUrl: "https://img.example.com/a.png",
  });
  assert.deepEqual(ringCallerOf({ caller_name: "乙", caller_avatar_url: "http://img.example.com/a.png" }), { name: "乙", avatarUrl: null });
  assert.equal(ringCallerOf({ caller_name: 42 }), null);
  assert.equal(ringCallerOf({}), null);
  assert.equal(ringCallerOf(null), null);
  assert.equal(ringCallerOf({ caller_name: "x".repeat(200) }).name.length, 80);
  assert.equal(callerDisplayName("引擎名", { name: "载荷名", avatarUrl: null }, "资料名"), "引擎名");
  assert.equal(callerDisplayName("", { name: "载荷名", avatarUrl: null }, "资料名"), "载荷名");
  assert.equal(callerDisplayName("", null, "资料名"), "资料名");
  assert.equal(callerDisplayName("", null, null), "", "都没有就是空串，界面不写占位词");
});

async function emitRing(event) {
  await act(async () => {
    for (const handler of Array.from(globalThis.__W08I.imHandlers.call_ring ?? [])) handler({ type: "call_ring", ...event });
  });
  await flush();
}

test("来电卡片：call_ring 带了 caller_name / caller_avatar_url 就直接显示，不等资料接口，也不出现「来电者」", async () => {
  reset();
  globalThis.__W08I.profilesHang = true;
  const view = await mountHost();
  await emitRing({ conversation_id: "dm-d4", call_id: "call-d4", caller_id: "u-d4a", caller_name: "测试甲", caller_avatar_url: "https://img.example.com/jia.png", expires_at: iso(Date.now() + 45_000) });
  await view.set({ incoming: ring("call-d4", { callerId: "u-d4a", callerName: "", conversationId: "dm-d4" }) });
  const card = view.q('[data-incoming-call="ring"]');
  assert.ok(card);
  assert.equal(view.q("[data-caller-name]").getAttribute("data-caller-name"), "ready");
  assert.match(card.textContent, /测试甲/);
  assert.doesNotMatch(card.textContent, /来电者/);
  assert.equal(card.querySelector("img").getAttribute("src"), "https://img.example.com/jia.png");
  assert.equal(card.getAttribute("aria-labelledby"), "incoming-call-title-call-d4");
  await view.unmount();
});

test("来电卡片：名字还没到（引擎没有、载荷没带、资料接口在路上）→ 只画占位条，不写任何占位词；资料回来后换成名字", async () => {
  reset();
  globalThis.__W08I.profilesHang = true;
  globalThis.__W08I.names = { "u-d4b": "测试乙" };
  const view = await mountHost();
  await view.set({ incoming: ring("call-d4b", { callerId: "u-d4b", callerName: "", conversationId: "dm-d4b" }) });
  const card = view.q('[data-incoming-call="ring"]');
  assert.ok(card, "卡片照样马上弹（铃声不等名字）");
  assert.equal(view.q("[data-caller-name]").getAttribute("data-caller-name"), "pending");
  assert.doesNotMatch(card.textContent, /来电者/);
  assert.match(card.textContent, /邀请你通话/);
  assert.equal(card.getAttribute("aria-label"), "邀请你通话", "名字未到时读屏用这句");
  assert.equal(card.querySelector("img"), null);
  await act(async () => {
    globalThis.__W08I.releaseProfiles?.();
  });
  await flush(8);
  assert.equal(view.q("[data-caller-name]").getAttribute("data-caller-name"), "ready");
  assert.match(view.q('[data-incoming-call="ring"]').textContent, /测试乙/);
  await view.unmount();
});

