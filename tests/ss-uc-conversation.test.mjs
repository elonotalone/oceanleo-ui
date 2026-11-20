import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  everythingSelected,
  isSelectableMessage,
  orderedSelection,
  recordLine,
  selectionText,
} from "../src/shell/messages/conversation/message-selection.ts";

// Session / sites wave 2026-11-21, book UC: Forward / Copy select mode, right-click-only message menu, copy text.
const require = createRequire(import.meta.url);
const reactUrl = JSON.stringify(pathToFileURL(require.resolve("react")).href);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.HTMLElement.prototype.scrollIntoView = function () {};
window.scrollTo = () => {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { createRoot } = await import("react-dom/client");

test.beforeEach((t) => {
  t.mock.method(console, "error", (...args) => {
    // jsdom 20 cannot parse the shared overlay's motion stylesheet (as device-settings-dialog.test). React errors still fail.
    if (String(args[0]).startsWith("Error: Could not parse CSS stylesheet")) return;
    assert.fail(args.map(String).join(" "));
  });
});

const ui = dataModule('export function useUI(){return (key,vars={})=>String(key).replace(/\\{(\\w+)\\}/g,(m,k)=>vars[k]??m)}');
const nil = (...names) => dataModule(names.map((name) => `export function ${name}(){return null}`).join("\n"));
const settle = async () => { for (let i = 0; i < 4; i += 1) await act(async () => {}); };
async function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
  return { host, root, async rerender(next) { await act(async () => root.render(next)); await settle(); }, async unmount() { await act(async () => root.unmount()); host.remove(); } };
}

function message(over = {}) {
  return {
    id: "m1", conversation_id: "c1", seq: 3, sender_id: "peer", sender_kind: "user", kind: "text", body: "hello there",
    mentions: [], mention_all: false, mention_leo: false, quote: null, thread_root_id: null, thread: null, attachments: [],
    card: null, transcript: null, pinned: false, edited_at: null, recalled_at: null, recalled_by: null, hidden_reason: null,
    leo: null, mention_reads: null, client_id: null, created_at: new Date(2026, 10, 21, 15, 30).toISOString(), ...over,
  };
}

// ── Copy text ────────────────────────────────────────────────────────────────
test("copy text: one `[Name] YYYY-MM-DD HH:MM: text` line per message, attachments and cards named", () => {
  assert.equal(recordLine(message({ body: "hello\n  there" }), "Ann"), "[Ann] 2026-11-21 15:30: hello there");
  assert.equal(
    recordLine(message({ body: "", kind: "image", attachments: [{ kind: "image", url: "u", name: "a.png", size: 1, mime: "image/png" }, { kind: "file", url: "u", name: "b.pdf", size: 1, mime: "application/pdf" }] }), "Ann"),
    "[Ann] 2026-11-21 15:30: (image: a.png) (file: b.pdf)",
  );
  assert.equal(recordLine(message({ body: "", kind: "voice", attachments: [{ kind: "voice", url: "u", name: "v", size: 1, mime: "audio/ogg", duration_ms: 12_000 }] }), "Ann"),
    "[Ann] 2026-11-21 15:30: (voice 0:12)");
  assert.equal(recordLine(message({ kind: "task", body: "[子任务] Report", card: { type: "task", id: "t", title: "Report" } }), "Bo"),
    "[Bo] 2026-11-21 15:30: (task: Report)");
  assert.equal(recordLine(message({ body: "", card: { type: "quote", id: "q", title: "", source_title: "Design", count: 4 } }), "Bo"),
    "[Bo] 2026-11-21 15:30: (quote: 4 messages from Design)");
  const text = selectionText([message({ id: "a", body: "one" }), message({ id: "b", body: "two", sender_id: "me" })], (m) => (m.sender_id === "me" ? "Me" : "Peer"));
  assert.equal(text, "[Peer] 2026-11-21 15:30: one\n[Me] 2026-11-21 15:30: two");
});

test("select mode: system lines, recalled, hidden and unsent messages are never selected; order is oldest first", () => {
  assert.equal(isSelectableMessage(message()), true);
  assert.equal(isSelectableMessage(message({ kind: "system", sender_kind: "system" })), false);
  assert.equal(isSelectableMessage(message({ recalled_at: "x" })), false);
  assert.equal(isSelectableMessage(message({ hidden_reason: "moderation" })), false);
  assert.equal(isSelectableMessage(message({ seq: 0 })), false);
  const list = [message({ id: "b", seq: 5 }), message({ id: "a", seq: 2 }), message({ id: "r", seq: 3, recalled_at: "x" })];
  assert.deepEqual(orderedSelection(list, new Set(["a", "b", "r"])).map((m) => m.id), ["a", "b"]);
  assert.equal(everythingSelected(list, new Set(["a", "b"]), false), true);
  assert.equal(everythingSelected(list, new Set(["a", "b"]), true), false, "older pages left: Select all still offered");
  assert.equal(everythingSelected(list, new Set(["a"]), false), false);
  assert.equal(everythingSelected([], new Set(Array.from({ length: 500 }, (_, i) => String(i))), true), false);
});

// ── The right-click message menu (real MessageActions + FloatingMenu) ──────
const { MessageItem } = await import(await compileModule("src/shell/messages/conversation/MessageItem.tsx", {
  "next-intl": dataModule('export function useLocale(){return "en"}'),
  "../../../i18n/ui/useUI": ui,
  "../../i18n/ui/useUI": ui,
  "../../../ui/Toast": dataModule("export function useToast(){return {success(){},error(){}}}"),
  "../MessageSettingsFrame": nil("MessageConfirmDialog"),
  "../../../lib/im/client": dataModule("export async function imFetch(){return {result:''}}"),
  "../leo/LeoMessageBody": nil("LeoMessageBody", "LeoNoticeLine"),
  "./ArtifactCardView": nil("ArtifactCardView"),
  "./AttachmentView": dataModule("export function AttachmentView(){return null}; export function safeMediaUrl(url){return url}"),
  "./MessageBody": dataModule(`import {createElement as h} from ${reactUrl}; export function MessageBody(p){return h("div",{"data-message-body":""},p.message.body)}`),
  "./ReadReceipt": nil("DmReadReceipt", "MentionReadReceipt"),
  "../../bay/orders/BayOrderCard": nil("BayOrderCard"),
  "./ReplayCardView": nil("ReplayCardView"),
  "./SystemLine": nil("SystemLine"),
  "../../task-room/TaskCardView": nil("TaskCardView"),
  "../../task-room/QuoteCardView": nil("QuoteCardView"),
  "../../../lib/im/people-api": dataModule("export function visiblePersonName(p){return p.display_name}"),
}));

function item({ message: messageOver, ...props } = {}) {
  const calls = { forward: [], select: [], toggle: [] };
  const handlers = {
    onQuote() {}, onEdit() {}, onRecall() {}, onTogglePin() {}, onReport() {}, onCopyText() {}, onCopyLink() {},
    onTranslate: async () => "", onOpenProfile() {}, onJumpToMessage() {}, onRetry() {}, onDiscard() {},
    onForward: (m) => calls.forward.push(m.id), onMultiSelect: (m) => calls.select.push(m.id),
  };
  const element = (over = {}) => React.createElement(MessageItem, {
    message: message(messageOver), grouped: false, viewerId: "me", isAdmin: false,
    profiles: { me: { user_id: "me", display_name: "Me" }, peer: { user_id: "peer", display_name: "Peer" } },
    conversation: { kind: "group", members: [] }, handlers,
    onToggleSelected: (m) => calls.toggle.push(m.id), ...props, ...over,
  });
  return { calls, element };
}

function contextMenu(target, x = 40, y = 60) {
  const event = new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y });
  target.dispatchEvent(event);
  return event;
}

test("the message menu opens only on right click, at the pointer, with the FloatingMenu rows", async () => {
  const { calls, element } = item();
  const view = await mount(element());
  try {
    const row = view.host.querySelector("[data-message-row]");
    assert.equal(document.querySelector("[data-message-actions]"), null);
    assert.equal(view.host.querySelector('[aria-label="更多操作"]'), null, "no … button");
    row.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
    await settle();
    assert.equal(document.querySelector("[data-message-actions]"), null, "hover opens nothing");

    let event;
    await act(async () => { event = contextMenu(row, 40, 60); });
    await settle();
    assert.equal(event.defaultPrevented, true);
    const menu = document.querySelector("[data-message-actions]");
    assert.ok(menu, "right click opens the menu");
    assert.equal(menu.getAttribute("role"), "menu");
    assert.match(menu.className, /rounded-xl/);
    const anchor = view.host.querySelector("[data-message-menu-anchor]");
    assert.equal(anchor.style.left, "40px");
    assert.equal(anchor.style.top, "60px");
    const labels = [...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);
    assert.deepEqual(labels, ["复制", "翻译", "转发", "多选", "引用"], "someone else's message: no Delete");

    const forward = [...menu.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "转发");
    await act(async () => forward.click());
    await settle();
    assert.deepEqual(calls.forward, ["m1"]);
  } finally { await view.unmount(); }
});

test("own message menu ends with Delete in the danger style", async () => {
  const { element } = item({ message: { sender_id: "me" } });
  const view = await mount(element());
  try {
    await act(async () => { contextMenu(view.host.querySelector("[data-message-row]")); });
    await settle();
    const rows = [...document.querySelectorAll('[data-message-actions] [role="menuitem"]')];
    const del = rows[rows.length - 1];
    assert.equal(del.textContent, "删除");
    assert.match(del.className, /text-rose-600/);
  } finally { await view.unmount(); }
});

test("select mode: whole row toggles once, the circle toggles once, right click opens no menu", async () => {
  const { calls, element } = item({ selectionMode: true, selected: false });
  const view = await mount(element());
  try {
    const row = view.host.querySelector("[data-message-row]");
    assert.ok(row.hasAttribute("data-message-select-row"));
    await act(async () => row.click());
    assert.deepEqual(calls.toggle, ["m1"]);
    await act(async () => view.host.querySelector('[role="checkbox"]').click());
    assert.deepEqual(calls.toggle, ["m1", "m1"], "the circle does not also toggle through the row");
    let event;
    await act(async () => { event = contextMenu(row); });
    await settle();
    assert.equal(event.defaultPrevented, false);
    assert.equal(document.querySelector("[data-message-actions]"), null);
  } finally { await view.unmount(); }
});

// ── The header's Forward / Copy menu ────────────────────────────────────────
const { ForwardCopyMenu } = await import(await compileModule("src/shell/messages/conversation/ForwardCopyMenu.tsx", {
  "../../../i18n/ui/useUI": ui,
  "../../i18n/ui/useUI": ui,
  "../../share/share-clipboard": dataModule("export async function writeClipboardText(text){globalThis.__ucCopied=text;return true}"),
  "../../forward": dataModule(`import {createElement as h} from ${reactUrl};
    export function ForwardPicker(p){globalThis.__ucPicker=p;return h("div",{"data-test-picker":""},h("button",{type:"button","data-test-done":"",onClick:p.onDone},"done"),h("button",{type:"button","data-test-cancel":"",onClick:p.onCancel},"cancel"))}`),
}));

function menuProps(over = {}) {
  const calls = { page: [], close: 0, toggleAll: 0, toggle: 0 };
  const props = {
    conversationId: "c1", title: "Design chat", open: true, page: "actions",
    onToggle: () => { calls.toggle += 1; }, onClose: () => { calls.close += 1; }, onPage: (page) => calls.page.push(page),
    selectedCount: 3, allSelected: false, selectingAll: false, onToggleAll: () => { calls.toggleAll += 1; },
    copyText: () => ({ text: "[A] 2026-11-21 15:30: hi", count: 3 }), messageIds: ["a", "b", "c"], ...over,
  };
  return { calls, props };
}

test("Forward / Copy: the task Share entry's button, a menu with Forward, Copy, N selected, Select all", async () => {
  const { calls, props } = menuProps();
  const view = await mount(React.createElement(ForwardCopyMenu, props));
  try {
    const button = view.host.querySelector("[data-forward-copy-entry]");
    assert.equal(button.getAttribute("aria-label"), "转发或复制");
    assert.match(button.className, /rounded-lg p-1\.5/);
    assert.match(button.className, /bg-stone-100 text-stone-800/, "pressed while select mode is on");
    const menu = document.querySelector("[data-forward-copy-actions]");
    assert.ok(menu);
    const labels = [...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);
    assert.deepEqual(labels, ["转发", "复制", "全选"]);
    assert.match(menu.textContent, /已选 3 条/);

    const copy = [...menu.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "复制");
    await act(async () => copy.click());
    await settle();
    assert.equal(globalThis.__ucCopied, "[A] 2026-11-21 15:30: hi");
    assert.match(document.querySelector("[data-forward-copy-actions]").textContent, /已复制 3 条消息。/);

    const forward = [...menu.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "转发");
    await act(async () => forward.click());
    assert.deepEqual(calls.page, ["forward"]);
    const all = [...menu.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === "全选");
    await act(async () => all.click());
    assert.equal(calls.toggleAll, 1);
  } finally { await view.unmount(); }
});

test("Forward / Copy: nothing selected disables Forward and Copy; all selected offers Clear selection", async () => {
  const { props } = menuProps({ selectedCount: 0, allSelected: true });
  const view = await mount(React.createElement(ForwardCopyMenu, props));
  try {
    const rows = [...document.querySelectorAll('[data-forward-copy-actions] [role="menuitem"]')];
    assert.equal(rows[0].disabled, true);
    assert.equal(rows[1].disabled, true);
    assert.equal(rows[2].textContent, "取消全选");
  } finally { await view.unmount(); }
});

test("Forward page renders the ForwardPicker with the source and the selected ids; done closes, cancel goes back", async () => {
  const { calls, props } = menuProps({ page: "forward" });
  const view = await mount(React.createElement(ForwardCopyMenu, props));
  try {
    assert.ok(document.querySelector('[data-forward-copy-page="forward"] [data-test-picker]'));
    assert.deepEqual(globalThis.__ucPicker.source, { conversationId: "c1", title: "Design chat" });
    assert.deepEqual([...globalThis.__ucPicker.messageIds], ["a", "b", "c"]);
    await act(async () => document.querySelector("[data-test-cancel]").click());
    assert.deepEqual(calls.page, ["actions"]);
    await act(async () => document.querySelector("[data-test-done]").click());
    assert.equal(calls.close, 1);
  } finally { await view.unmount(); }
});


test("mouse and pen long presses do nothing; touch long press opens the message menu", async () => {
  const { element } = item();
  const view = await mount(element());
  const press = (type, pointerType) => {
    const event = new window.Event(type, { bubbles: true });
    Object.defineProperties(event, { pointerType: { value: pointerType }, clientX: { value: 30 }, clientY: { value: 50 } });
    view.host.querySelector("[data-message-row]").dispatchEvent(event);
  };
  try {
    for (const pointer of ["mouse", "pen"]) {
      await act(async () => { press("pointerdown", pointer); await new Promise(resolve => setTimeout(resolve, 470)); });
      assert.equal(document.querySelector("[data-message-actions]"), null, pointer);
      await act(async () => press("pointerup", pointer));
    }
    await act(async () => { press("pointerdown", "touch"); await new Promise(resolve => setTimeout(resolve, 470)); });
    assert.ok(document.querySelector("[data-message-actions]"));
    await act(async () => press("pointerup", "touch"));
  } finally { await view.unmount(); }
});

test("whole-conversation count stays unknown until history loads; Copy shows progress and waits", async () => {
  let finish;
  globalThis.__ucCopied = null;
  const { props } = menuProps({ selectedCount: null, allSelected: true, copyText: () => new Promise(resolve => { finish = resolve; }) });
  const view = await mount(React.createElement(ForwardCopyMenu, props));
  try {
    assert.match(document.querySelector("[data-forward-copy-actions]").textContent, /全部消息/);
    const copy = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === "复制");
    await act(async () => copy.click());
    assert.match(document.querySelector('[role="status"]').textContent, /载入|加载/);
    assert.equal(globalThis.__ucCopied, null);
    assert.equal(copy.disabled, true);
    await act(async () => finish({ text: "whole record", count: 2400 }));
    assert.equal(globalThis.__ucCopied, "whole record");
    assert.match(document.querySelector("[data-forward-copy-actions]").textContent, /2400/);
  } finally { await view.unmount(); }
});

test("Copy history failure reports failure and writes no partial clipboard", async () => {
  globalThis.__ucCopied = null;
  const { props } = menuProps({ copyText: async () => { throw new Error("offline"); } });
  const view = await mount(React.createElement(ForwardCopyMenu, props));
  try {
    await act(async () => [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === "复制").click());
    assert.equal(globalThis.__ucCopied, null);
    assert.match(document.querySelector('[role="status"]').textContent, /复制失败/);
  } finally { await view.unmount(); }
});
