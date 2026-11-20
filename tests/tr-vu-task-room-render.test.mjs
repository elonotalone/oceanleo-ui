// Task rooms wave, acceptance (unit VU): jsdom renders of the task page pieces with the API client stubbed.
//   - RoomView: trail, children strip with status, "Ask an agent" entries (header, before send, @ list), a project
//     viewer's disabled entries with the reason, the select-bar actions (its own new-task entry replaces LeoChat's);
//   - SummonDialog: the server's default selection, computer/program required for a new sub task, the exact body
//     (create = the create-task fields only, mode, client_id), an existing sub task gets no `create`, error words;
//   - SpinOffDialog: the task's members start selected, I am never sent, title optional;
//   - TaskStackPanel: only the top entry shows; a sub task is the embedded agent chat, a task its panel view; cards
//     and links inside push, Back pops.
//
// node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//   --experimental-loader ./tests/ts-extension-loader.mjs --test tests/tr-vu-task-room-render.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Stubs are `data:` modules (no bare imports there): they read React from here.
globalThis.__vuReact = React;
const { createRoot } = await import("react-dom/client");
for (const key of ["HTMLButtonElement", "HTMLInputElement", "HTMLTextAreaElement", "CustomEvent", "Event"]) globalThis[key] = window[key];

const ui = dataModule("export function useUI(){return (text, params={}) => String(text).replace(/\\{(\\w+)\\}/g,(_,k)=>params[k] ?? k);}");
const dialogFrame = dataModule(`
  const React = globalThis.__vuReact;
  export const PRIMARY = "primary"; export const QUIET = "quiet";
  export function MessageSettingsDialog({ title, children }) {
    return React.createElement("div", { "data-dialog": title }, children);
  }
`);
// One stub client for every component: each test sets the answers and reads the calls.
globalThis.__vu = { calls: [], answers: {} };
const api = dataModule(`
  const answer = (name, args) => {
    globalThis.__vu.calls.push([name, ...args]);
    const value = globalThis.__vu.answers[name];
    return Promise.resolve(typeof value === "function" ? value(...args) : value ?? { ok: false, unavailable: true, status: 503, code: "task_rooms_unavailable", message: "" });
  };
  export const taskRoomsApi = new Proxy({}, { get: (_, name) => (...args) => answer(name, args) });
`);

async function mount(element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return {
    host,
    async rerender(next) { await act(async () => root.render(next)); },
    async close() { await act(async () => root.unmount()); host.remove(); },
  };
}

async function flush(ms = 0) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function typeInto(element, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

const child = (extra = {}) => ({
  kind: "agent_task", id: "t1", title: "Fix login", card_message_id: "m9", mode: "view",
  owner: { id: "u1", name: "Ann" }, program: "codex", status: "working", updated_at: "", my_access: "owner", ...extra,
});
const roomOf = (extra = {}) => ({
  id: "r1", title: "Launch", origin: "new", project: null, created_by: "u1", my_role: "owner", can_summon: true,
  chain: [{ kind: "room", id: "r0", title: "Q4" }, { kind: "room", id: "r1", title: "Launch" }],
  children: [child(), child({ id: "t2", title: "Read only", my_access: "view", status: "idle" }), { ...child({ kind: "room", id: "r5", title: "Side talk", program: null, status: null, my_access: "collaborate" }) }],
  members_count: 3, ...extra,
});

// ---------------------------------------------------------------------------------------------- RoomView
globalThis.__vuRoom = null;
globalThis.__vuConversation = null;
globalThis.__vuSummon = null;
const { RoomView } = await import(await compileModule("src/shell/task-room/RoomView.tsx", {
  "../../i18n/ui/useUI": ui,
  "../../lib/im/groups-api": dataModule("export async function getConversationDetail(){ return { members: [{ user_id: 'u1', profile: {} }, { user_id: 'u2', profile: {} }], member_count: 2 }; }"),
  "../../lib/task-rooms-api": api,
  "../messages/conversation/ConversationView": dataModule(`
    const React = globalThis.__vuReact;
    export function useViewerId(){ return "u1"; }
    export function ConversationView(props){
      globalThis.__vuConversation = props;
      return React.createElement("div", { "data-conversation": props.conversationId },
        React.createElement("div", { "data-title-slot": "" }, props.titleSlot),
        React.createElement("div", { "data-header-actions": "" }, props.headerActions),
        React.createElement("div", { "data-below-header": "" }, props.belowHeader),
        React.createElement("div", { "data-send-accessory": "" }, props.composerExtras?.sendAccessory ?? null));
    }
  `),
  "../messages/groups/ConversationInfoPanel": dataModule("export function ConversationInfoPanel(){ return null; }"),
  "../messages/conversation/MessageItem": dataModule("export function Avatar(){ return null; }"),
  "../messages/realtime/hooks": dataModule("export function useImEvent(){} export function useImResync(){}"),
  "../messages/host-state": dataModule("export function openMessages(){}"),
  "./useTaskRoom": dataModule("export function useTaskRoom(){ return { room: globalThis.__vuRoom, state: globalThis.__vuRoom ? 'ready' : 'loading', reload(){} }; } export function readTaskRoom(){ return Promise.resolve(); }"),
  "./SummonDialog": dataModule(`
    export function newSummonDraft(target = "new", messageIds = null){ return { target, messageIds, priorTaskIds: [], imported: [], text: "", attachments: [], mode: "view" }; }
    export function SummonDialog(props){ globalThis.__vuSummon = props; return null; }
  `),
  "./SpinOffDialog": dataModule("export function SpinOffDialog(){ return null; }"),
  "./TaskCardView": dataModule("export function openTaskChildAnywhere(d){ (globalThis.__vuAnywhere ??= []).push(d); }"),
}));

test("RoomView: trail, children with status, Ask an agent opens a new sub task draft, a chip opens beside", async () => {
  globalThis.__vuRoom = roomOf();
  globalThis.__vuSummon = null;
  globalThis.__vu.answers = { listHandoffs: { ok: true, data: { handoffs: [] } } };
  const opened = [];
  const view = await mount(React.createElement(RoomView, { roomId: "r1", surface: "page", onOpenChild: (d) => opened.push(d) }));
  try {
    const trail = view.host.querySelector("[data-title-slot]");
    assert.match(trail.textContent, /Q4/);
    assert.match(trail.textContent, /Launch/);
    const chips = [...view.host.querySelectorAll("[data-task-child]")];
    assert.deepEqual(chips.map((chip) => chip.textContent), ["Codex · Fix login", "Codex · Read only", "Side talk"]);
    assert.ok(view.host.querySelector("[data-task-children-agents] [aria-label='正在工作']"), "working dot");
    await act(async () => chips[2].click());
    assert.deepEqual(opened, [{ kind: "room", id: "r5", title: "Side talk" }]);

    const ask = view.host.querySelector("[data-task-header-ask-agent]");
    assert.equal(ask.disabled, false);
    assert.equal(ask.textContent, "叫智能体");
    await act(async () => ask.click());
    assert.equal(globalThis.__vuSummon.draft.target, "new");
    assert.equal(globalThis.__vuSummon.draft.messageIds, null, "the server's default selection (rule 3)");
    assert.ok(view.host.querySelector("[data-send-accessory] [data-task-ask-agent]"), "Ask an agent before send");

    const extras = globalThis.__vuConversation.composerExtras.extraMentions;
    assert.deepEqual(extras.map((row) => row.key), ["new", "t1"], "@ list: new + sub tasks I may send to");
    const ids = globalThis.__vuConversation.selectionActions.map((action) => action.id);
    assert.deepEqual(ids, ["task-room.select-all", "task-room.ask-agent", "task-room.spin-off"]);
    const spin = globalThis.__vuConversation.selectionActions.find((action) => action.id === "task-room.spin-off");
    assert.deepEqual(spin.replaces, ["tu3.start-task"], "one new-task entry in a task's (or project chat's) bar");

    // Done: the sub task opens beside, the as-file notice shows.
    await act(async () => globalThis.__vuSummon.onDone({ task_id: "t7", card_message_id: "m7", handoff_id: "h", chars: 9, as_file: true }, "Draft"));
    assert.deepEqual(opened.at(-1), { kind: "agent_task", id: "t7", title: "Draft" });
    assert.match(view.host.textContent, /内容较多，已作为一个文件交给智能体。/);
  } finally { await view.close(); }
});

test("RoomView: a project viewer can talk but every agent entry is disabled with the reason", async () => {
  globalThis.__vuRoom = roomOf({ can_summon: false, project: { id: "p1", name: "Apollo" } });
  globalThis.__vu.answers = { listHandoffs: { ok: true, data: { handoffs: [] } } };
  const view = await mount(React.createElement(RoomView, { roomId: "r1", surface: "panel", onBack() {} }));
  try {
    const reason = "项目的查看者可以在这里交流，但不能叫智能体。";
    const header = view.host.querySelector("[data-task-header-ask-agent]");
    assert.equal(header.disabled, true);
    assert.equal(header.title, reason);
    assert.equal(view.host.querySelector("[data-send-accessory] [data-task-ask-agent]").disabled, true);
    assert.equal(view.host.querySelector("[data-task-summon-blocked]").textContent, reason);
    assert.deepEqual(globalThis.__vuConversation.composerExtras.extraMentions, [], "no agent rows in the @ list");
    assert.equal(globalThis.__vuConversation.layout, "docked");
    assert.equal(typeof globalThis.__vuConversation.onBack, "function", "panel Back");
  } finally { await view.close(); }
});

test("RoomView: Given-to marks under messages come from the handoffs", async () => {
  globalThis.__vuRoom = roomOf();
  globalThis.__vu.answers = { listHandoffs: { ok: true, data: { handoffs: [
    { id: "h1", agent_task_id: "t1", sender: { id: "u1", name: "Ann" }, message_ids: ["a", "b"], created_at: "2026-11-20T10:00:00Z" },
  ] } } };
  const view = await mount(React.createElement(RoomView, { roomId: "r1", surface: "page" }));
  try {
    await flush();
    assert.deepEqual(globalThis.__vuConversation.messageMarks, { a: "已交给 Fix login", b: "已交给 Fix login" });
  } finally { await view.close(); }
});

// ---------------------------------------------------------------------------------------------- SummonDialog
const { SummonDialog, newSummonDraft } = await import(await compileModule("src/shell/task-room/SummonDialog.tsx", {
  "../../i18n/ui/useUI": ui,
  "../../lib/task-rooms-api": api,
  "../../lib/im/inbox-api": dataModule("export async function fetchConversations(){ return { items: [] }; }"),
  "../../lib/im/messages-api": dataModule("export const messagesApi = { listMessages: async () => ({ items: [] }) };"),
  "../../lib/im/people-api": dataModule("export function conversationDisplayTitle(c){ return c.title || ''; }"),
  "../messages/MessageSettingsFrame": dialogFrame,
  "../messages/conversation/message-format": dataModule("export function plainTextOf(v){ return String(v ?? ''); }"),
  "../cloud-computer/ComputerDock": dataModule(`
    const React = globalThis.__vuReact;
    export function ComputerDock({ onConversationChange }) {
      return React.createElement("button", { type: "button", "data-pick-computer": "", onClick: () => onConversationChange({ kind: "native", computerId: "pc1", computerName: "Mac", program: "codex", view: "chat" }) }, "pick");
    }
  `),
  "../acp-task/useAcpCatalogPicker": dataModule("export function useAcpCatalogPicker(){ return { picker: null, choice: {}, forSend: () => ({ model: 'gpt-x' }) }; }"),
  "../composer-upload": dataModule("export async function uploadComposerFile(){ return { ok: false, error: 'x' }; }"),
}));

function SummonHarness({ room, initial, onDone, onClose }) {
  const [draft, setDraft] = useState(initial);
  return React.createElement(SummonDialog, { room, draft, onDraftChange: setDraft, onChooseMessages() {}, onClose: onClose ?? (() => {}), onDone });
}

test("SummonDialog: default selection from the preview; a new sub task needs a computer and text; exact body", async () => {
  globalThis.__vu.calls = [];
  globalThis.__vu.answers = {
    summonPreview: { ok: true, data: { messages: 2, chars: 40, as_file: false, limit_chars: 2_000_000, default_message_ids: ["m1", "m2"] } },
    summon: { ok: true, data: { task_id: "t9", card_message_id: "c9", handoff_id: "h9", chars: 40, as_file: false } },
  };
  const done = [];
  const room = roomOf({ project: { id: "p1", name: "Apollo" } });
  const view = await mount(React.createElement(SummonHarness, { room, initial: newSummonDraft("new", null), onDone: (r, t) => done.push([r, t]) }));
  try {
    await flush(300);
    const preview = globalThis.__vu.calls.find(([name]) => name === "summonPreview");
    assert.deepEqual(preview, ["summonPreview", "r1", { target: "new", message_ids: null, prior_task_ids: [], imported: [] }]);
    assert.match(view.host.querySelector("[data-summon-selection]").textContent, /这个任务里的 2 条消息，40 个字/);
    const submit = view.host.querySelector("[data-summon-submit]");
    assert.equal(submit.disabled, true, "no computer, no text");
    await act(async () => view.host.querySelector("[data-pick-computer]").click());
    assert.equal(submit.disabled, true, "still no text");
    await typeInto(view.host.querySelector("textarea"), "Write the launch post\nwith numbers");
    assert.equal(view.host.querySelector("textarea").maxLength, 32000);
    assert.equal(submit.disabled, false);
    await act(async () => submit.click());
    await flush();
    const sent = globalThis.__vu.calls.find(([name]) => name === "summon");
    assert.equal(sent[1], "r1");
    const body = sent[2];
    assert.deepEqual({ ...body, client_id: typeof body.client_id }, {
      target: "new", message_ids: ["m1", "m2"], prior_task_ids: [], imported: [], text: "Write the launch post\nwith numbers",
      create: { computer_id: "pc1", program: "codex", title: "Write the launch post", project_id: "p1", model: "gpt-x" },
      mode: "view", client_id: "string",
    });
    assert.equal("kind" in body.create, false, "the create fields only (the server forbids extras)");
    assert.equal("attachments" in body, false, "no files: no attachments key");
    assert.deepEqual(done, [[{ task_id: "t9", card_message_id: "c9", handoff_id: "h9", chars: 40, as_file: false }, "Write the launch post"]]);
  } finally { await view.close(); }
});

test("SummonDialog: a follow-up to an existing sub task sends no create; a refusal reads as plain words", async () => {
  globalThis.__vu.calls = [];
  globalThis.__vu.answers = {
    summonPreview: { ok: true, data: { messages: 1, chars: 5, as_file: false, limit_chars: 2_000_000, default_message_ids: ["m3"] } },
    summon: { ok: false, unavailable: false, status: 403, code: "cannot_send", message: "" },
  };
  const view = await mount(React.createElement(SummonHarness, { room: roomOf(), initial: newSummonDraft("t1", null), onDone() {} }));
  try {
    await flush(300);
    assert.equal(view.host.querySelector("[data-summon-runner]"), null, "no computer picker for a follow-up");
    assert.equal(view.host.querySelector("[data-summon-mode]"), null);
    await typeInto(view.host.querySelector("textarea"), "Also check the footer");
    await act(async () => view.host.querySelector("[data-summon-submit]").click());
    await flush();
    const body = globalThis.__vu.calls.find(([name]) => name === "summon")[2];
    assert.equal(body.target, "t1");
    assert.deepEqual(body.message_ids, ["m3"], "after the last handoff (server default)");
    assert.equal("create" in body, false);
    assert.equal("mode" in body, false);
    assert.equal(view.host.querySelector("[role=alert]").textContent, "你不能给这个子任务发消息。");
  } finally { await view.close(); }
});

test("SummonDialog: before the database change the dialog says so and cannot submit", async () => {
  globalThis.__vu.answers = {};
  const view = await mount(React.createElement(SummonHarness, { room: roomOf(), initial: newSummonDraft("t1", null), onDone() {} }));
  try {
    await flush(300);
    await typeInto(view.host.querySelector("textarea"), "x");
    assert.match(view.host.querySelector("[data-summon-selection]").textContent, /任务功能暂未开放。/);
    assert.equal(view.host.querySelector("[data-summon-submit]").disabled, true);
  } finally { await view.close(); }
});

// ---------------------------------------------------------------------------------------------- SpinOffDialog
const { SpinOffDialog } = await import(await compileModule("src/shell/task-room/SpinOffDialog.tsx", {
  "../../i18n/ui/useUI": ui,
  "../../lib/task-rooms-api": api,
  "../messages/MessageSettingsFrame": dialogFrame,
  "../messages/people/PeopleDiscovery": dataModule("export function PeopleSuggestions(){ return null; }"),
}));

test("SpinOffDialog: members start selected, I am never sent, an unticked member is left out", async () => {
  globalThis.__vu.calls = [];
  globalThis.__vu.answers = { spinOff: { ok: true, data: { room_id: "r8", card_message_id: "c8" } } };
  const members = ["u1", "u2", "u3"].map((id) => ({ user_id: id, nickname: id.toUpperCase(), profile: { display_name: id } }));
  const done = [];
  const view = await mount(React.createElement(SpinOffDialog, {
    roomId: "r1", messageIds: ["m1", "m2"], members, viewerId: "u1", onClose() {}, onDone: (...args) => done.push(args),
  }));
  try {
    assert.equal(view.host.querySelector("[data-dialog]").getAttribute("data-dialog"), "用所选消息新建任务");
    const boxes = [...view.host.querySelectorAll("[data-spin-off-members] input[type=checkbox]")];
    assert.deepEqual(boxes.map((box) => [box.checked, box.disabled]), [[true, true], [true, false], [true, false]]);
    await act(async () => boxes[2].click());
    await typeInto(view.host.querySelector("input:not([type])"), "  Side plan ");
    await act(async () => view.host.querySelector("[data-spin-off-submit]").click());
    await flush();
    const [, roomId, body] = globalThis.__vu.calls.find(([name]) => name === "spinOff");
    assert.equal(roomId, "r1");
    assert.deepEqual({ ...body, client_id: typeof body.client_id }, { message_ids: ["m1", "m2"], member_ids: ["u2"], title: "Side plan", client_id: "string" });
    assert.deepEqual(done, [["r8", "Side plan"]]);
  } finally { await view.close(); }
});

// ---------------------------------------------------------------------------------------------- TaskStackPanel
globalThis.__vuStack = [];
const { TaskStackPanel } = await import(await compileModule("src/shell/workspace-panels/TaskStackPanel.tsx", {
  "../AgentChat": dataModule(`
    const React = globalThis.__vuReact;
    export function AgentChat(props){ globalThis.__vuStack.push(["agent", props]); return React.createElement("div", { "data-agent-chat": props.taskId }); }
  `),
  "../task-room": dataModule(`
    const React = globalThis.__vuReact;
    export function RoomView(props){ globalThis.__vuStack.push(["room", props]); return React.createElement("div", { "data-room-view": props.roomId, "data-surface": props.surface }); }
  `),
}));

test("TaskStackPanel: only the top entry shows; inside it cards push and Back pops; empty shows nothing", async () => {
  const pushes = [];
  let backs = 0;
  const host = { onNavigateTask() {} };
  const props = (stack) => ({ stack, onPush: (entry) => pushes.push(entry), onBack: () => { backs += 1; }, host });
  const view = await mount(React.createElement(TaskStackPanel, props([
    { kind: "room", id: "r1", title: "Launch" },
    { kind: "agent_task", id: "t1", title: "Fix login" },
  ])));
  try {
    const panel = view.host.querySelector("[data-task-stack-panel]");
    assert.equal(panel.getAttribute("data-task-stack-depth"), "2");
    assert.ok(view.host.querySelector("[data-agent-chat='t1']"));
    assert.equal(view.host.querySelector("[data-room-view]"), null, "only the top entry");
    const agent = globalThis.__vuStack.filter(([kind]) => kind === "agent").at(-1)[1];
    assert.equal(agent.initialTitle, "Fix login");
    agent.onBack();
    agent.sidebarHost.onNavigateTask("t5");
    assert.equal(backs, 1);
    assert.deepEqual(pushes, [{ kind: "agent_task", id: "t5", title: "" }]);

    await view.rerender(React.createElement(TaskStackPanel, props([{ kind: "room", id: "r1", title: "Launch" }])));
    const room = view.host.querySelector("[data-room-view='r1']");
    assert.equal(room.getAttribute("data-surface"), "panel");
    const roomProps = globalThis.__vuStack.filter(([kind]) => kind === "room").at(-1)[1];
    roomProps.onOpenChild({ kind: "room", id: "r5", title: "Side talk" });
    assert.deepEqual(pushes.at(-1), { kind: "room", id: "r5", title: "Side talk" });
    roomProps.onBack();
    assert.equal(backs, 2);

    await view.rerender(React.createElement(TaskStackPanel, props([])));
    assert.equal(view.host.querySelector("[data-task-stack-panel]"), null);
  } finally { await view.close(); }
});
