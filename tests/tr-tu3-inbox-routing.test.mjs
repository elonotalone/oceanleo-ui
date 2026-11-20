// Task rooms wave TU3: LeoChat knows about tasks — inbox rows of kind "task" carry a task mark and open
// the task (/tasks/{id}; inside the right panel the panel's task stack), the "Tasks" filter, the @leo
// button text, the task-room calls' "unavailable" reading, and the copy table.
//
// node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//   --experimental-loader ./tests/ts-extension-loader.mjs --test tests/tr-tu3-inbox-routing.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LOCALES } from "../src/i18n/config.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { conversationOpenAction } from "../src/shell/messages/host-state.ts";
import { inboxRowsFor, isTaskConversation } from "../src/shell/messages/inbox-view.ts";
import { insertLeoMention } from "../src/shell/messages/composer/leo-insert.ts";

const mentionPicker = await import(await compileModule("src/shell/messages/composer/MentionPicker.tsx"));
const { hasTypedLeoMention } = mentionPicker;

const uiHookStub = dataModule(`
  const tt = (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  export function useUI() { return tt; }
`);

test("open action: a task opens the task (page / window → /tasks/{id}, panel → task stack); others the conversation", () => {
  const task = { id: "c-task-1", kind: "task", title: "Launch" };
  assert.deepEqual(conversationOpenAction(task, "page"), { kind: "task-page", path: "/tasks/c-task-1", closeWindow: false });
  assert.deepEqual(conversationOpenAction(task, "window"), { kind: "task-page", path: "/tasks/c-task-1", closeWindow: true });
  assert.deepEqual(conversationOpenAction(task, "panel"), { kind: "task-panel", detail: { kind: "room", id: "c-task-1", title: "Launch" } });
  for (const kind of ["dm", "group", "team", "project", "talent", undefined]) {
    assert.deepEqual(conversationOpenAction({ id: "c2", kind }, "panel"), { kind: "conversation", conversationId: "c2" });
  }
});

test("Tasks filter keeps only task rows; All keeps everything in order", () => {
  const items = [{ id: "a", kind: "dm" }, { id: "b", kind: "task" }, { id: "c", kind: "group" }, { id: "d", kind: "task" }];
  assert.deepEqual(inboxRowsFor(items, "task").map((item) => item.id), ["b", "d"]);
  assert.equal(inboxRowsFor(items, "all"), items);
  assert.equal(isTaskConversation({ kind: "project" }), false);
});

test("runConversationOpen: window closes then navigates; panel uses the stack, falls back to the page when unhandled", async () => {
  const { runConversationOpen } = await import(await compileModule("src/shell/messages/tasks/open-task.ts", {
    "../../../contracts/domain-family": dataModule("export function portalHref(path) { return path; }"),
    "../notices/open-notice": dataModule("export function browserNoticeActions() { return { navigate() {} }; }"),
  }));
  const log = [];
  const effects = (handled) => ({
    openChild: (detail) => { log.push(["child", detail.id]); return handled; },
    navigate: (href) => log.push(["nav", href]),
    closeWindow: () => log.push(["close"]),
    showConversation: (id, seq) => log.push(["show", id, seq]),
  });
  runConversationOpen(conversationOpenAction({ id: "r1", kind: "task" }, "window"), null, effects(true));
  assert.deepEqual(log.splice(0), [["close"], ["nav", "/tasks/r1"]]);
  runConversationOpen(conversationOpenAction({ id: "r1", kind: "task" }, "panel"), null, effects(true));
  assert.deepEqual(log.splice(0), [["child", "r1"]]);
  runConversationOpen(conversationOpenAction({ id: "r1", kind: "task" }, "panel"), null, effects(false));
  assert.deepEqual(log.splice(0), [["child", "r1"], ["nav", "/tasks/r1"]]);
  runConversationOpen(conversationOpenAction({ id: "g1", kind: "group" }, "page"), 7, effects(true));
  assert.deepEqual(log.splice(0), [["show", "g1", 7]]);
});

test("InboxRow: a task row has the task mark and kind attribute; a group row has neither", async () => {
  const { InboxRow } = await import(await compileModule("src/shell/messages/InboxRow.tsx", {
    "../../i18n/ui/useUI": uiHookStub,
    "./realtime/store": dataModule(`export function formatBadge(n) { return n > 0 ? String(n) : ""; }`),
  }));
  const base = {
    id: "c1", title: "Launch plan", avatar_url: null, peer: null, member_count: 3, last_message: null,
    last_activity_at: "2026-11-20T10:00:00Z", unread_count: 0, mention_count: 0, muted: false, notify_level: "all",
    org_id: null, project_id: null, has_external: false, my_role: "member", dissolved: false,
  };
  const task = renderToStaticMarkup(React.createElement(InboxRow, { item: { ...base, kind: "task" }, active: false, hasDraft: false, onOpen() {} }));
  assert.match(task, /data-inbox-task-mark=""/);
  assert.match(task, /data-conversation-kind="task"/);
  const group = renderToStaticMarkup(React.createElement(InboxRow, { item: { ...base, kind: "group" }, active: false, hasDraft: false, onOpen() {} }));
  assert.doesNotMatch(group, /data-inbox-task-mark/);
  assert.doesNotMatch(group, /data-conversation-kind/);
});

test("@leo button inserts '@leo ' at the caret and the typed-mention rule recognises it", () => {
  assert.deepEqual(insertLeoMention("", 0), { text: "@leo ", caret: 5 });
  assert.deepEqual(insertLeoMention("hi", 2), { text: "hi @leo ", caret: 8 });
  assert.deepEqual(insertLeoMention("hi there", 3), { text: "hi @leo there", caret: 8 });
  assert.deepEqual(insertLeoMention("你好", 2), { text: "你好@leo ", caret: 7 });
  assert.deepEqual(insertLeoMention("abc xyz", 4, 7), { text: "abc @leo ", caret: 9 });
  for (const text of [insertLeoMention("hi", 2).text, insertLeoMention("你好", 2).text, insertLeoMention("", 0).text]) {
    assert.equal(hasTypedLeoMention(text), true, text);
  }
});

test("composer extra @ rows (task rooms) filter by label and picking removes the typed @query", async () => {
  const { extraMentionCandidates, removeMentionQuery } = mentionPicker;
  const extras = [{ key: "new", label: "New agent task…", onPick() {} }, { key: "t1", label: "Codex · Draft", onPick() {} }];
  assert.deepEqual(extraMentionCandidates(extras, "").map((c) => c.id), ["new", "t1"]);
  assert.deepEqual(extraMentionCandidates(extras, "draft").map((c) => [c.id, c.kind]), [["t1", "extra"]]);
  assert.deepEqual(extraMentionCandidates(undefined, "x"), []);
  assert.deepEqual(removeMentionQuery("ask @cod now", 8, { start: 4, query: "cod" }), { text: "ask  now", caret: 4 });
});

test("task-room calls ride the one client: unavailable / missing route read as unavailable; others carry their code", async () => {
  // The real client with a fake transport: the thin LeoChat calls add no second fetch path.
  const transport = dataModule(`
    export async function gatewayTransport(path, init) {
      globalThis.__tu3Calls.push([path, init?.method || "GET", init?.json]);
      return globalThis.__tu3Next;
    }
  `);
  const api = await compileModule("src/lib/task-rooms-api.ts", {
    "./auth/config": dataModule("export const GATEWAY_BASE = '';"),
    "./auth/client": dataModule("export async function accessToken() { return 't'; }"),
  });
  const apiStub = dataModule(`
    import { createTaskRoomsApi } from ${JSON.stringify(api)};
    import { gatewayTransport } from ${JSON.stringify(transport)};
    export const taskRoomsApi = createTaskRoomsApi(gatewayTransport);
  `);
  const calls = await import(await compileModule("src/shell/messages/tasks/task-room-calls.ts", { "../../../lib/task-rooms-api": apiStub }));
  globalThis.__tu3Calls = [];

  globalThis.__tu3Next = { status: 503, body: { detail: { code: "task_rooms_unavailable", message: "" } } };
  assert.deepEqual(await calls.listMyTaskRooms(), { ok: false, unavailable: true });
  globalThis.__tu3Next = { status: 404, body: { detail: "Not Found" } };
  assert.deepEqual(await calls.listMyTaskRooms(), { ok: false, unavailable: true });
  globalThis.__tu3Next = { status: 404, body: { detail: { code: "not_member", message: "no" } } };
  assert.deepEqual(await calls.listMyTaskRooms(), { ok: false, unavailable: false, status: 404, code: "not_member", message: "no" });

  globalThis.__tu3Next = { status: 200, body: { rooms: [{ id: "r1", title: "T", project: { id: "p1", name: "P" }, last_message_at: "2026-11-20T10:00:00Z", unread: 2, children_count: 3 }, { title: "no id" }] } };
  const listed = await calls.listMyTaskRooms();
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.data, [{ id: "r1", title: "T", project: { id: "p1", name: "P" }, last_message_at: "2026-11-20T10:00:00Z", last_preview: null, unread: 2, children_count: 3 }]);
  assert.deepEqual(globalThis.__tu3Calls.at(-1).slice(0, 2), ["/v1/task-rooms?scope=mine", "GET"]);

  globalThis.__tu3Calls = [];
  globalThis.__tu3Next = { status: 200, body: { room_id: "r9", card_message_id: "m9" } };
  const started = await calls.startTaskFromConversation("conv 1", { message_ids: ["m1", "m2"], member_ids: ["u2"], title: "T", client_id: "c1" });
  assert.deepEqual(started, { ok: true, data: { room_id: "r9", card_message_id: "m9" } });
  assert.deepEqual(globalThis.__tu3Calls[0], ["/v1/im/conversations/conv%201/start-task", "POST", { message_ids: ["m1", "m2"], member_ids: ["u2"], title: "T", client_id: "c1" }]);

  globalThis.__tu3Calls = [];
  globalThis.__tu3Next = { status: 200, body: { room: { id: "r10", title: "Hello" } } };
  const created = await calls.createTaskRoom({ member_ids: ["u2"], first_message: { body: "Hello" }, client_id: "c2" });
  assert.deepEqual(created, { ok: true, data: { id: "r10", title: "Hello" } });
  assert.deepEqual(globalThis.__tu3Calls[0].slice(0, 2), ["/v1/task-rooms", "POST"]);
  globalThis.__tu3Next = { status: 200, body: { room: {} } };
  assert.equal((await calls.createTaskRoom({ member_ids: [], client_id: "c3" })).ok, false);
});

test("start-task defaults: title from the first selected message, members = conversation members except me", async () => {
  const stub = dataModule("export const TASK_TITLE_MAX = 80; export function newClientId() { return \"c\"; } export async function startTaskFromConversation() { return { ok: false, unavailable: true }; }");
  const mod = await import(await compileModule("src/shell/messages/tasks/StartTaskDialog.tsx", {
    "../../../i18n/ui/useUI": uiHookStub,
    "../MessageSettingsFrame": dataModule("export const PRIMARY = ''; export const QUIET = ''; export function MessagePromptDialog() { return null; }"),
    "../people/MemberPicker": dataModule("export function MemberPicker() { return null; }"),
    "./task-room-calls": stub,
  }));
  assert.equal(mod.defaultStartTaskTitle([{ body: "", card: null, attachments: [] }, { body: "  Let's   ship\nthe beta  ", attachments: [] }]), "Let's ship the beta");
  assert.equal(mod.defaultStartTaskTitle([{ body: "x".repeat(200), attachments: [] }]).length, mod.START_TASK_TITLE_MAX);
  assert.equal(mod.defaultStartTaskTitle([]), "");
  const conversation = { members: [{ user_id: "me" }, { user_id: "u2" }, { user_id: "u3" }, { user_id: "u2" }] };
  assert.deepEqual(mod.defaultStartTaskMembers(conversation, "me"), ["u2", "u3"]);
  assert.deepEqual(mod.defaultStartTaskMembers(null, "me"), []);
});

test("start-task appears in ordinary conversations only (not tasks, deals or dissolved groups)", async () => {
  const { startTaskApplies } = await import(await compileModule("src/shell/messages/tasks/StartTaskSelectionAction.tsx", {
    "../../../i18n/ui/useUI": uiHookStub,
    "../conversation/selection-actions": dataModule("export function registerMessageSelectionAction() { return () => {}; }"),
    "./StartTaskDialog": dataModule("export function StartTaskDialog() { return null; }"),
    "./open-task": dataModule("export function openTaskRoom() {}"),
  }));
  for (const kind of ["dm", "group", "team", "project"]) assert.equal(startTaskApplies({ kind, dissolved: false }), true, kind);
  for (const kind of ["task", "talent"]) assert.equal(startTaskApplies({ kind, dissolved: false }), false, kind);
  assert.equal(startTaskApplies({ kind: "group", dissolved: true }), false);
  assert.equal(startTaskApplies(null), false);
});

test("tr-chat copy: every locale has every key, with the same {variables}", async () => {
  const { trChatCopy } = await import(await compileModule("src/i18n/ui/messages/tr-chat-copy.ts"));
  const zh = trChatCopy("zh");
  const keys = Object.keys(zh);
  assert.ok(keys.length >= 20);
  const vars = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of LOCALES) {
    const copy = trChatCopy(locale);
    assert.deepEqual(Object.keys(copy), keys, locale);
    for (const key of keys) {
      assert.ok(copy[key].trim(), `${locale}: ${key}`);
      assert.deepEqual(vars(copy[key]), vars(key), `${locale}: ${key}`);
    }
  }
  assert.equal(trChatCopy("en")["任务（列表筛选）"], "Tasks");
  assert.equal(trChatCopy("zh")["任务（列表筛选）"], "任务");
});
