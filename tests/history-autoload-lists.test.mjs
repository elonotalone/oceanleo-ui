// Mount the real three lists. Only unavailable browser geometry/observers and the network are replaced.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "MutationObserver"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? dom.window : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { NextIntlClientProvider } = await import("next-intl");
const { act } = React;

// Deterministic animation frames: tests explicitly flush one frame, as the browser would.
let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (fn) => { frames.set(++frameId, fn); return frameId; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
class Observer {
  constructor(callback) { this.callback = callback; }
  observe() {}
  disconnect() {}
}
globalThis.IntersectionObserver = Observer;
globalThis.ResizeObserver = Observer;

const SCROLLER = "[data-message-list], [data-deal-messages], [data-talent-messages]";
function scrollerOf(el) { return el.matches(SCROLLER) ? el : el.closest(SCROLLER); }
function rowsOf(root) {
  const keyed = root.querySelectorAll("[data-history-key]");
  return [...(keyed.length ? keyed : root.querySelectorAll("[data-message-id], [data-seq]"))];
}
const tops = new WeakMap();
const rect = (top, height) => ({ x: 0, y: top, top, bottom: top + height, left: 0, right: 600, width: 600, height, toJSON() {} });
Object.defineProperties(HTMLElement.prototype, {
  clientHeight: { configurable: true, get() { return this.matches(SCROLLER) ? 400 : 0; } },
  scrollHeight: { configurable: true, get() {
    if (!this.matches(SCROLLER)) return 0;
    return rowsOf(this).length * 100 + (this.querySelector("[data-older-history-top]") ? 32 : 0);
  } },
  scrollTop: { configurable: true, get() { return tops.get(this) ?? 0; }, set(value) {
    tops.set(this, Math.max(0, Math.min(Number(value), Math.max(0, this.scrollHeight - this.clientHeight))));
  } },
});
HTMLElement.prototype.getBoundingClientRect = function () {
  const root = scrollerOf(this);
  if (!root) return rect(0, 0);
  if (root === this) return rect(100, 400);
  const rows = rowsOf(root);
  const index = rows.indexOf(this);
  if (index >= 0) return rect(100 + (root.querySelector("[data-older-history-top]") ? 32 : 0) + index * 100 - root.scrollTop, 100);
  return rect(100 - root.scrollTop, 0); // history sentinel
};
HTMLElement.prototype.scrollIntoView = function ({ block } = {}) {
  const root = scrollerOf(this);
  if (!root) return;
  if (block === "end") root.scrollTop = root.scrollHeight;
  else root.scrollTop += this.getBoundingClientRect().top - 200;
};

const networkStubs = {
  "../realtime/hooks": dataModule('export function useImEvent(){}; export function useImConnection(){return "open"}; export function useImInbox(){return {}}; export function imStore(){return {}}; export function attachImRealtime(){return ()=>{}}; export function publishImDisabled(){}; export function useImResync(){}; export function useImUnread(){return null}; export function usePresence(){return {}}; export function sendTyping(){}'),
  "../../../lib/im/client": dataModule('export class ImApiError extends Error{}; export function imEnabledHere(){return false}; export function useImEnabled(){return false}; export function subscribeImEnabled(){return ()=>{}}; export async function imFetch(path, init){if(globalThis.__historyThreadNetwork) return globalThis.__historyThreadNetwork(path, init);throw new Error("Unexpected network")}'),
};
const { MessageList } = await import(await compileModule("src/shell/messages/conversation/MessageList.tsx", networkStubs));
const { DealMessageList } = await import(await compileModule("src/shell/bay/deal/DealMessageList.tsx", { ...networkStubs, "../../messages/realtime/hooks": networkStubs["../realtime/hooks"] }));
const { TalentMessageList } = await import(await compileModule("src/shell/messages/talent/TalentMessageList.tsx", networkStubs));
const { ConversationStore } = await import("../src/shell/messages/conversation/conversation-store.ts");

function message(seq, extra = {}) {
  return { id: `m${seq}`, seq, conversation_id: "c1", thread_id: "t1", sender_id: "peer", user_id: "peer", sender_kind: "user", kind: seq === 85 ? "system" : "text", body: `message ${seq}`, created_at: new Date(Date.UTC(2026, 9, 6, 0, 0, seq)).toISOString(), mentions: [], attachments: [], reactions: [], meta: {}, ...extra };
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => message(a + i));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function frame() {
  await act(async () => { const batch = [...frames.values()]; frames.clear(); for (const fn of batch) fn(0); await Promise.resolve(); });
}
async function scroll(root, top) { await act(async () => { root.scrollTop = top; root.dispatchEvent(new Event("scroll")); }); await frame(); }
const wrap = (node) => React.createElement(NextIntlClientProvider, { locale: "zh", timeZone: "UTC", messages: {} }, node);

async function mount(kind) {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(" ")); };
  const calls = [];
  const request = () => { const gate = deferred(); calls.push(gate); return gate.promise; };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let update;
  let store;
  const handlers = { onOpenProfile() {} };
  if (kind === "LeoChat") {
    store = new ConversationStore({ conversationId: "c1", viewerId: "me", api: {
      async listMessages(id, params) { return params.before_seq ? request() : { items: range(100, 119), has_more_before: true, has_more_after: false }; },
    } });
    await store.loadLatest();
  }
  function Harness() {
    const [state, setState] = React.useState({ messages: range(100, 119), hasMore: true });
    const snapshot = React.useSyncExternalStore(store?.subscribe ?? (() => () => {}), store?.getSnapshot ?? (() => null));
    update = (extra) => {
      if (store) for (const item of extra) store.applyEvent({ type: "message.created", conversation_id: "c1", message: item });
      else setState((prev) => ({ ...prev, messages: [...prev.messages, ...extra] }));
    };
    const load = async () => {
      const page = await request();
      setState((prev) => ({ messages: [...page.items, ...prev.messages], hasMore: page.has_more_before }));
    };
    if (kind === "LeoChat") return React.createElement(MessageList, { store, snapshot, profiles: {}, conversation: { kind: "dm", members: [] }, viewerId: "me", isAdmin: false, unreadAfterSeq: null, handlers });
    const Component = kind === "Deal" ? DealMessageList : TalentMessageList;
    return React.createElement(Component, { messages: state.messages, hasMore: state.hasMore, onLoadMore: load, offers: {}, viewerId: "me", contractId: null, onOfferAct() {} });
  }
  try {
    await act(async () => { root.render(wrap(React.createElement(Harness))); });
    await frame();
    return { host, scroller: host.querySelector(SCROLLER), calls, update, async close() {
      await act(async () => root.unmount()); host.remove(); console.error = originalError;
      assert.deepEqual(errors, [], "real component render must not log console.error");
    } };
  } catch (error) {
    await act(async () => root.unmount()); host.remove(); console.error = originalError;
    throw new Error(`${error.message}\nconsole.error: ${errors.join("\n")}`, { cause: error });
  }
}
async function finish(gate, items, hasMore = true) {
  await act(async () => gate.resolve({ items, has_more_before: hasMore, has_more_after: false }));
}
const noHistoryText = (host) => {
  assert.equal(host.querySelector('[data-action="load-more"]'), null);
  assert.doesNotMatch(host.textContent, /加载更早的消息|正在加载更早|这是会话的开头|加载中…/);
};

for (const kind of ["LeoChat", "Deal", "Talent"]) {
  test(`${kind}: opening prefetches one page, shows only a top-edge spinner, and never offers a button`, async () => {
    const view = await mount(kind);
    try {
      noHistoryText(view.host);
      assert.equal(view.calls.length, 1, "one background prefetch on open");
      assert.equal(view.host.querySelector(".v-spinner"), null, "prefetch at bottom is silent");
      await scroll(view.scroller, 500);
      assert.equal(view.calls.length, 1, "scroll cannot duplicate an in-flight request");
      assert.equal(view.host.querySelector(".v-spinner"), null, "near top still has no spinner");
      await scroll(view.scroller, 0);
      assert.ok(view.host.querySelector(".v-spinner"));
      await finish(view.calls[0], range(80, 99), false); await frame();
      assert.equal(view.host.querySelector("[data-older-history-top]"), null, "beginning has no slot or text");
      noHistoryText(view.host);
    } finally { await view.close(); }
  });

  test(`${kind}: a 1.5-screen buffer loads early, anchors the visible message across a prepend and a concurrent append`, async () => {
    const view = await mount(kind);
    try {
      await finish(view.calls[0], range(80, 99)); await frame();
      assert.equal(view.calls.length, 1, "a deep buffer does not drain history");
      await scroll(view.scroller, 550);
      assert.equal(view.calls.length, 2, "loads with 550px left, before reaching the 400px viewport top");
      const anchor = rowsOf(view.scroller).find((row) => row.getBoundingClientRect().bottom > 100);
      const before = anchor.getBoundingClientRect().top;
      await act(async () => {
        view.update([message(120)]);
        view.calls[1].resolve({ items: range(60, 79), has_more_before: true, has_more_after: false });
      }); await frame();
      assert.equal(anchor.getBoundingClientRect().top, before, "newer messages do not enter the prepend compensation");
      assert.equal(view.calls.length, 2, "twenty older messages fill the buffer");
      if (kind === "LeoChat") assert.equal(view.host.querySelector("[data-new-messages]").textContent, "1 条新消息");
      noHistoryText(view.host);
    } finally { await view.close(); }
  });

  test(`${kind}: short pages chain automatically until 1.5 screens are available above the reading position`, async () => {
    const view = await mount(kind);
    try {
      await scroll(view.scroller, 0);
      const anchor = rowsOf(view.scroller)[0];
      const before = anchor.getBoundingClientRect().top;
      await finish(view.calls[0], range(98, 99)); await frame();
      assert.equal(view.calls.length, 2);
      await finish(view.calls[1], range(96, 97)); await frame();
      assert.equal(view.calls.length, 3);
      await finish(view.calls[2], range(92, 95)); await frame();
      assert.equal(view.calls.length, 3, "buffer is now full; wait for another scroll");
      assert.equal(anchor.getBoundingClientRect().top, before);
      assert.equal(view.host.querySelector(".v-spinner"), null);
    } finally { await view.close(); }
  });

  for (const retryPosition of ["near top", "background at bottom"]) test(`${kind}: a failed older page ${retryPosition} is invisible and retries after backoff`, async () => {
    const view = await mount(kind);
    try {
      if (retryPosition === "near top") await scroll(view.scroller, 550);
      await act(async () => view.calls[0].reject(new Error("offline")));
      noHistoryText(view.host);
      assert.equal(view.host.querySelector(".v-spinner"), null);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1050)); });
      await frame();
      assert.equal(view.calls.length, 2, "failed page retries without a click");
      await finish(view.calls[1], range(80, 99), false); await frame();
      noHistoryText(view.host);
    } finally { await view.close(); }
  });
}


test("LeoChat: an older-page network error rejects only after loadingBefore resets; the same page can retry", async () => {
  let fail = true;
  const store = new ConversationStore({ conversationId: "c1", viewerId: "me", api: {
    async listMessages(id, params) {
      if (!params.before_seq) return { items: range(100, 119), has_more_before: true, has_more_after: false };
      if (fail) throw new Error("offline");
      return { items: range(80, 99), has_more_before: false, has_more_after: false };
    },
  } });
  await store.loadLatest();
  await assert.rejects(store.loadBefore(), /offline/);
  assert.equal(store.getSnapshot().loadingBefore, false);
  assert.equal(store.getSnapshot().messages[0].id, "m100");
  fail = false;
  await store.loadBefore();
  assert.equal(store.getSnapshot().messages[0].id, "m80");
  assert.equal(store.getSnapshot().hasMoreBefore, false);
});


// Exercise the real view → real loader → real list chain, including a failed request.
const threadHttp = dataModule(`
  export class BayApiError extends Error {}
  export async function bayGet(path) { return globalThis.__historyThreadNetwork(path); }
  export async function bayPost(path, body) { return globalThis.__historyThreadNetwork(path, {method:"POST", body}); }
  export async function bayPatch() { throw new Error("Unexpected patch"); }
  export async function bayDelete() { throw new Error("Unexpected delete"); }
`);
const { TalentConversationView } = await import(await compileModule("src/shell/messages/talent/TalentConversationView.tsx", networkStubs));
const { DealConversationView } = await import(await compileModule("src/shell/bay/deal/DealConversationView.tsx", {
  ...networkStubs, "../../messages/realtime/hooks": networkStubs["../realtime/hooks"], "../../../lib/bay/http": threadHttp,
}));
for (const kind of ["Deal", "Talent"]) {
  test(`${kind}: real conversation loads, passes the older-page promise through, silently retries and displays the older rows`, async () => {
    const errors = [], calls = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.map(String).join(" "));
    const initial = deferred();
    globalThis.__historyThreadNetwork = (path, init) => {
      if (path.includes("/messages?")) {
        const url = new URL(path, "https://example.test");
        if (!url.searchParams.has("before")) return initial.promise;
        const gate = deferred(); calls.push({ ...gate, before: url.searchParams.get("before") }); return gate.promise;
      }
      if (path.endsWith("/read")) return Promise.resolve({ ok: true });
      if (path.includes("/blocks")) return Promise.resolve({ items: [] });
      throw new Error(`Unexpected request ${path}`);
    };
    const page = (messages) => ({ thread: { id: "t1", kind: "direct", title: "Conversation", counterparty: { user_id: "peer", display_name: "Peer" } }, messages, offers: [], contact_hint: false });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      const Component = kind === "Deal" ? DealConversationView : TalentConversationView;
      await act(async () => root.render(wrap(React.createElement(Component, { threadId: "t1", conversationId: "talent:t1", layout: "full" }))));
      assert.ok(host.querySelector(kind === "Deal" ? "[data-deal-loading]" : "[data-talent-loading]"));
      await act(async () => initial.resolve(page(range(100, 149)))); await frame();
      const scroller = host.querySelector(SCROLLER);
      assert.ok(scroller, "loaded view mounts the real scrolling list");
      assert.equal(calls.length, 1, "real container enables opening prefetch");
      assert.equal(calls[0].before, message(100).created_at);
      await scroll(scroller, 550);
      await act(async () => calls[0].reject(new Error("offline")));
      assert.equal(host.querySelector("[data-deal-error], [data-talent-error]"), null);
      noHistoryText(host);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1050)); }); await frame();
      assert.equal(calls.length, 2, "loader rejection reaches shared retry logic");
      await act(async () => calls[1].resolve(page(range(80, 99)))); await frame();
      assert.equal(scroller.querySelectorAll("[data-message-id]").length, 70);
      assert.equal(scroller.querySelector("[data-message-id]").getAttribute("data-message-id"), "m80");
      noHistoryText(host);
    } finally {
      await act(async () => root.unmount()); host.remove(); delete globalThis.__historyThreadNetwork; console.error = originalError;
      assert.deepEqual(errors, [], "real conversation must not log console.error");
    }
  });
}
