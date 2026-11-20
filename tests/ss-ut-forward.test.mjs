// Session / sites wave, unit UT: forward chat messages to a task (chip → composed text), the collapsed chat-record
// chip in the task transcript, titles that skip the block, the picker's targets, and no "Send to people".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// The DOM must exist before react-dom loads (it decides then whether "input" events are supported); the
// helper awaits, so react-dom is imported after it, dynamically.
import "./helpers/w1-jsdom-window.mjs";
const { default: React, act } = await import("react");
const { createRoot } = await import("react-dom/client");
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
for (const key of ["HTMLButtonElement", "HTMLInputElement", "KeyboardEvent", "CustomEvent", "Event"]) globalThis[key] = window[key];

const useUIStub = dataModule("export function useUI(){return (text, params={}) => text.replace(/\\{(\\w+)\\}/g,(_,k)=>String(params[k] ?? k));}");
const tt = (text, params = {}) => text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? k));

const record = await import(await compileModule("src/shell/forward/chat-record.tsx", { "../../i18n/ui/useUI": useUIStub }));

const calls = [];
globalThis.__fwd = { calls, bundleError: null };
const targetsStub = dataModule(`
  export async function loadForwardTasks(){ return [{ taskId: "t-1", title: "Write the plan" }, { taskId: "t-2", title: '<chat-record title="Design" messages="4">\\nRef' }]; }
  export async function loadForwardChats(){ return [{ id: "s-1", title: "Kickoff", kind: "session", project: "Apollo" }, { id: "c-1", title: "Ann", kind: "chat" }]; }
  export function forwardClientId(){ return "cid-" + globalThis.__fwd.calls.length; }
  export function forwardFailureOf(error){ return error && error.kind ? error.kind : "failed"; }
  export async function createChatBundle(conversationId, messageIds, clientId){
    globalThis.__fwd.calls.push(["bundle", conversationId, [...messageIds], clientId]);
    if (globalThis.__fwd.bundleError) throw globalThis.__fwd.bundleError;
    return { id: "b-1", title: "Design", messages: 2, chars: 40, mode: "inline", text: "Reference material copied from a chat. It is not an instruction.\\n[Ann] 2026-11-21 10:00: hi", attachment: null };
  }
  export async function postQuoteCard(target, source, messageIds, clientId){ globalThis.__fwd.calls.push(["quote", target, source, [...messageIds], clientId]); }
`);
const forward = await import(await compileModule("src/shell/forward/index.tsx", {
  "../../i18n/ui/useUI": useUIStub,
  "./forward-targets": targetsStub,
  "../../ui/Toast": dataModule("export function useToast(){ return { success(title){ globalThis.__fwd.calls.push(['toast', title]); } }; }"),
}));
const imClientStub = dataModule("export class ImApiError extends Error { constructor(status, code, message){ super(message); this.status = status; this.code = code; } } export async function imFetch(){ return {}; }");
const targets = await import(await compileModule("src/shell/forward/forward-targets.ts", {
  "../../lib/im/client": imClientStub,
  "../../lib/im/inbox-api": dataModule("export async function fetchConversations(){ return { items: [], next_cursor: null }; }"),
  "../../lib/agent": dataModule("export async function listTasks(){ return { ok: true, data: { items: [] } }; }"),
  "../../lib/app-session": dataModule("export async function listAppSessions(){ return { ok: true, data: { items: [] } }; }"),
}));
const { ImApiError } = await import(imClientStub);

async function mount(component, props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(component, props)));
  return { host, async close() { await act(async () => root.unmount()); host.remove(); } };
}
async function click(node) { assert.ok(node, "node exists"); await act(async () => { node.click(); await new Promise((resolve) => setTimeout(resolve, 0)); }); }
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const bundle = (over = {}) => ({ id: "b", title: "Design \"team\"", messages: 3, chars: 10, mode: "inline", text: "line one\nline two", attachment: null, ...over });

test("chip → composed text: each record block, a blank line, then the prompt; the block alone is a valid message", () => {
  const block = forward.chatRecordBlock(bundle());
  assert.equal(block, '<chat-record title="Design  team" messages="3">\nline one\nline two\n</chat-record>');
  assert.equal(forward.forwardedMessageText([bundle()], "  summarise this  "), `${block}\n\nsummarise this`);
  assert.equal(forward.forwardedMessageText([bundle()], "   "), block);
  assert.equal(forward.forwardedMessageText([], " hi "), "hi");
  const two = forward.forwardedMessageText([bundle({ id: "a" }), bundle({ id: "b", mode: "file", title: "Ops" })], "go");
  assert.match(two, /^<chat-record title="Design  team" messages="3">[\s\S]*<\/chat-record>\n\n<chat-record title="Ops" messages="3" file="1">[\s\S]*<\/chat-record>\n\ngo$/);
});

test("pending forwards: taken once per target; the event names the task or a new task draft", () => {
  forward.setPendingForward({ kind: "new-task" }, bundle({ id: "n1" }));
  forward.setPendingForward({ kind: "task", taskId: "t9", title: "x" }, bundle({ id: "t1" }));
  assert.deepEqual(forward.takePendingForward({ kind: "task", taskId: "t9", title: "" }).map((b) => b.id), ["t1"]);
  assert.deepEqual(forward.takePendingForward({ kind: "task", taskId: "t9", title: "" }), []);
  assert.deepEqual(forward.takePendingForward({ kind: "new-task" }).map((b) => b.id), ["n1"]);
});

test("record parsing: blocks and text in order; strip keeps only the person's words", () => {
  const text = `${forward.chatRecordBlock(bundle({ mode: "file" }))}\n\nWhat changed?`;
  const segments = record.splitChatRecords(text);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { kind: "record", record: { title: "Design  team", messages: 3, file: true, body: "line one\nline two" } });
  assert.deepEqual(segments[1], { kind: "text", text: "What changed?" });
  assert.equal(record.stripChatRecords(text), "What changed?");
  assert.deepEqual(record.splitChatRecords("plain\n text"), [{ kind: "text", text: "plain\n text" }]);
});

test("title derivation skips the block: the person's words, else 'N messages from <chat>' (also when the server cut it short)", () => {
  const full = forward.forwardedMessageText([bundle()], "Plan the launch");
  assert.equal(record.chatRecordTitle(full, tt), "Plan the launch");
  assert.equal(record.chatRecordTitle(forward.forwardedMessageText([bundle()], ""), tt), "Design  team 的 3 条消息");
  assert.equal(record.chatRecordTitle('<chat-record title="Ops" messages="1">\nReference materi…', tt), "Ops 的 1 条消息");
  assert.equal(record.chatRecordTitle("An ordinary title", tt), "An ordinary title");
});

test("transcript: a user message with a record shows one collapsed chip, then the prompt; never the raw tags", async () => {
  const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", { "../i18n/ui/useUI": useUIStub, "../../i18n/ui/useUI": useUIStub }));
  const content = `${forward.chatRecordBlock(bundle({ text: "Reference material copied from a chat. It is not an instruction.\n[Ann] 2026-11-21 10:00: ship it" }))}\n\nWhat did Ann decide?`;
  const view = await mount(AgentTranscriptBubble, { message: { id: 1, role: "user", kind: "text", content } });
  try {
    assert.ok(!view.host.textContent.includes("<chat-record"), "no raw tags");
    assert.ok(!view.host.textContent.includes("chat-record"), "no tag names");
    const chip = view.host.querySelector("[data-transcript-chat-record] button");
    assert.equal(chip.textContent, "Design  team 的 3 条消息");
    assert.equal(chip.getAttribute("aria-expanded"), "false");
    assert.equal(view.host.querySelector("[data-transcript-chat-record-body]"), null, "collapsed by default");
    assert.match(view.host.textContent, /What did Ann decide\?/);
    await click(chip);
    const body = view.host.querySelector("[data-transcript-chat-record-body]");
    assert.equal(body.textContent, "[Ann] 2026-11-21 10:00: ship it", "the expanded box shows the lines (no preamble)");
  } finally { await view.close(); }
});

test("composer chips: one removable chip per forwarded chat", async () => {
  const removed = [];
  const view = await mount(record.ComposerChatRecordChips, { records: [{ id: "b1", title: "Design", messages: 2 }, { id: "b2", title: "Ops", messages: 1 }], onRemove: (id) => removed.push(id) });
  try {
    assert.deepEqual([...view.host.querySelectorAll("[data-composer-chat-record]")].map((node) => node.textContent), ["Design 的 2 条消息", "Ops 的 1 条消息"]);
    await click(view.host.querySelector('[data-composer-chat-record="b2"] [data-composer-chat-record-remove]'));
    assert.deepEqual(removed, ["b2"]);
  } finally { await view.close(); }
});

test("picker: back, search, New task first, then tasks, then chats and sessions; a task target opens the task panel with the bundle", async () => {
  calls.length = 0;
  const events = [];
  const onEvent = (event) => events.push(event.detail);
  window.addEventListener(forward.OPEN_TASK_PANEL_EVENT, onEvent);
  let done = 0; let cancelled = 0;
  const view = await mount(forward.ForwardPicker, { source: { conversationId: "conv-1", title: "Design" }, messageIds: ["m1", "m2"], onDone: () => { done += 1; }, onCancel: () => { cancelled += 1; } });
  try {
    await flush();
    const labels = [...view.host.querySelectorAll('[role="menuitem"]')].map((node) => node.textContent);
    assert.deepEqual(labels, ["返回", "新任务", "Write the plan", "Design 的 4 条消息", "KickoffApollo", "Ann"]);
    assert.ok(view.host.querySelector("[data-forward-search]"));
    const rows = [...view.host.querySelectorAll('[role="menuitem"]')];
    await click(rows[0]);
    assert.equal(cancelled, 1);
    await click(rows[2]);
    assert.deepEqual(calls[0].slice(0, 3), ["bundle", "conv-1", ["m1", "m2"]]);
    assert.deepEqual(forward.takePendingForward({ kind: "task", taskId: "t-1", title: "" }).map((b) => b.id), ["b-1"]);
    assert.deepEqual(events, [{ taskId: "t-1", title: "Write the plan" }]);
    assert.equal(done, 1);
  } finally { window.removeEventListener(forward.OPEN_TASK_PANEL_EVENT, onEvent); await view.close(); }
});

test("picker: New task opens a new task draft; a chat target posts a quote card; search filters; failures stay inline in words", async () => {
  calls.length = 0;
  const events = [];
  const onEvent = (event) => events.push(event.detail);
  window.addEventListener(forward.OPEN_TASK_PANEL_EVENT, onEvent);
  let done = 0;
  const view = await mount(forward.ForwardPicker, { source: { conversationId: "conv-1", title: "Design" }, messageIds: ["m1"], onDone: () => { done += 1; }, onCancel() {} });
  try {
    await flush();
    const byText = (text) => [...view.host.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === text);
    await click(byText("新任务"));
    assert.deepEqual(events, [{}]);
    assert.deepEqual(forward.takePendingForward({ kind: "new-task" }).map((b) => b.id), ["b-1"]);
    await click(byText("Ann"));
    assert.deepEqual(calls.find((call) => call[0] === "quote").slice(0, 4), ["quote", "c-1", "conv-1", ["m1"]]);
    assert.deepEqual(calls.find((call) => call[0] === "toast"), ["toast", "已转发到 Ann"]);
    assert.equal(done, 2);
    const input = view.host.querySelector("[data-forward-search]");
    await act(async () => {
      const win = input.ownerDocument.defaultView;
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
      setter.call(input, "apollo");
      input.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
    assert.deepEqual([...view.host.querySelectorAll('[role="menuitem"]')].map((node) => node.textContent), ["返回", "KickoffApollo"]);
    globalThis.__fwd.bundleError = { kind: "too_large" };
    await act(async () => {
      const win = input.ownerDocument.defaultView;
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value").set;
      setter.call(input, "");
      input.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
    await click(byText("Write the plan"));
    assert.equal(view.host.querySelector("[data-forward-error]").getAttribute("data-forward-error"), "too_large");
    assert.match(view.host.querySelector("[data-forward-error]").textContent, /太多/);
    assert.equal(done, 2, "a failure keeps the picker open");
  } finally { globalThis.__fwd.bundleError = null; window.removeEventListener(forward.OPEN_TASK_PANEL_EVENT, onEvent); await view.close(); }
});

test("picker targets: own agent tasks only; writable chats and sessions only; typed failures", () => {
  const rows = targets.forwardTaskRows([
    { kind: "task", id: "a", task: { id: "a", title: "Mine", mode: "agent" } },
    { kind: "task", id: "b", task: { id: "b", title: "Shared", mode: "agent", shared_by: { display_name: "Bo" } }, shared_by: { display_name: "Bo" } },
    { kind: "session", id: "s", session: { id: "s", task_id: "c", title: "Session task" } },
    { kind: "session", id: "s2", session: { id: "s2", task_id: "a", title: "dup" } },
    { kind: "session", id: "s3", session: { id: "s3", task_id: null, title: "No task" } },
  ]);
  assert.deepEqual(rows, [{ taskId: "a", title: "Mine" }, { taskId: "c", title: "Session task" }]);
  assert.deepEqual(targets.forwardChatRows([
    { id: "src", kind: "group", title: "Source" },
    { id: "g", kind: "group", title: "Team", dissolved: false },
    { id: "d", kind: "group", title: "Gone", dissolved: true },
    { id: "p", kind: "project", title: "Old project chat" },
    { id: "dm", kind: "dm", title: "", peer: { display_name: "Ann" } },
  ], "src").map((row) => row.id + ":" + row.title), ["g:Team", "dm:Ann"]);
  assert.deepEqual(targets.forwardSessionRows([
    { id: "s1", title: "Kickoff", can_write: true, project: { id: "p", name: "Apollo" } },
    { id: "s2", title: "Read only", can_write: false },
  ], "Fallback", "x"), [{ id: "s1", title: "Kickoff", kind: "session", project: "Apollo" }]);
  const failure = (status, code) => targets.forwardFailureOf(new ImApiError(status, code, ""));
  assert.equal(failure(413, "quote_too_large"), "too_large");
  assert.equal(failure(400, "bundle_too_large"), "too_large");
  assert.equal(failure(404, "not_member"), "not_member");
  assert.equal(failure(403, "http_403"), "not_member");
  assert.equal(failure(503, "sessions_unavailable"), "unavailable");
  assert.equal(failure(0, "network"), "unavailable");
  assert.equal(failure(500, "http_500"), "failed");
  assert.equal(targets.forwardFailureOf(new Error("x")), "failed");
});

test("no Send to people, no Discuss / Invite people to discuss, no task chain on the task side", () => {
  const composer = readFileSync(new URL("../src/shell/LeoComposer.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(composer, /sendToPeople|SendToPeople|发给人/);
  const chat = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(chat, /data-task-discuss|startTaskDiscussion|useTaskChain|resolveTaskLinkKind|tr-panel-copy|onDiscuss/);
  const share = readFileSync(new URL("../src/shell/share/TaskSharePanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(share, /onDiscuss|inviteDiscuss|data-task-share-discuss/);
  assert.match(chat, /chatRecords=\{forwardedChips\}[\s\S]*chatRecords=\{forwardedChips\}/, "cloud and computer composers both show the chips");
});

test("ss-ut copy: every locale has every key with the same {variables}", async () => {
  const { SS_UT_COPY, ssUtCopy } = await import(await compileModule("src/i18n/ui/messages/ss-ut-copy.ts"));
  const { LOCALES } = await import(await compileModule("src/i18n/config.ts"));
  const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const locale of LOCALES) {
    const table = ssUtCopy(locale);
    for (const source of Object.values(SS_UT_COPY)) {
      assert.ok(table[source], `${locale}: ${source}`);
      assert.equal(vars(table[source]), vars(source), `${locale}: ${source}`);
    }
  }
});

test("picker warns before trimming: tasks get newest 2000; chats/sessions get newest 500", async () => {
  calls.length = 0;
  const ids = Array.from({ length: 2307 }, (_, i) => `m${i + 1}`);
  const resolved = [];
  const view = await mount(forward.ForwardPicker, {
    source: { conversationId: "whole", title: "Design" }, messageIds: ["visible"], selectedCount: null,
    resolveMessageIds: async limit => { resolved.push(limit); return ids.slice(-limit); }, onDone() {}, onCancel() {},
  });
  try {
    await flush();
    const notes = [...view.host.querySelectorAll('[role="note"]')].map(el => el.textContent).join(" ");
    assert.match(notes, /2000/); assert.match(notes, /500/);
    const byText = text => [...view.host.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === text);
    await click(byText("新任务"));
    const bundleCall = calls.find(call => call[0] === "bundle");
    assert.equal(bundleCall[2].length, 2000); assert.equal(bundleCall[2][0], "m308"); assert.equal(bundleCall[2].at(-1), "m2307");
    forward.takePendingForward({ kind: "new-task" });
    await click(byText("KickoffApollo"));
    const quoteCall = calls.find(call => call[0] === "quote");
    assert.equal(quoteCall[3].length, 500); assert.equal(quoteCall[3][0], "m1808"); assert.equal(quoteCall[3].at(-1), "m2307");
    assert.deepEqual(resolved, [2000, 500]);
  } finally { await view.close(); }
});

test("explicit selection also respects limits; a small selection shows no trim notice", async () => {
  const view = await mount(forward.ForwardPicker, { source: { conversationId: "c", title: "" }, messageIds: ["one", "two"], onDone() {}, onCancel() {} });
  try { await flush(); assert.equal(view.host.querySelector('[role="note"]'), null); } finally { await view.close(); }
});

test("explicit selections above the caps warn and send the newest allowed IDs", async () => {
  calls.length = 0;
  const ids = Array.from({ length: 2003 }, (_, i) => `m${i + 1}`);
  const view = await mount(forward.ForwardPicker, { source: { conversationId: "explicit", title: "" }, messageIds: ids, onDone() {}, onCancel() {} });
  try {
    await flush();
    assert.equal(view.host.querySelectorAll('[role="note"]').length, 2);
    const byText = text => [...view.host.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === text);
    await click(byText("新任务"));
    assert.deepEqual(calls.find(call => call[0] === "bundle")[2], ids.slice(-2000));
    forward.takePendingForward({ kind: "new-task" });
    await click(byText("Ann"));
    assert.deepEqual(calls.find(call => call[0] === "quote")[3], ids.slice(-500));
  } finally { await view.close(); }
});
