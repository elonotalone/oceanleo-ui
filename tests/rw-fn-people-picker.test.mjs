// FN (wave 2026-11-20 roles): the shared people picker in task Collaborate and Share "Send to",
// email invites, and invite notifications shown in the reader's language.
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { TaskAccessMock } from "./helpers/task-access-mock.ts";
import { LOCALES } from "../src/i18n/config.ts";
import { RW_FN_COPY, rwFnCopy } from "../src/i18n/ui/messages/rw-fn-copy.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// react-dom must load after the jsdom globals, or controlled inputs never see input events.
const { createRoot } = await import("react-dom/client");
window.scrollTo = () => {};
for (const key of ["HTMLButtonElement", "HTMLInputElement", "KeyboardEvent", "CustomEvent", "Event"]) globalThis[key] = window[key];

const MIRA = { user_id: "u-mira", username: null, name: "Mira", avatar_url: null, following: false, follows_me: false, blocked: false };
const GUEST = { ...MIRA, user_id: "u-guest", name: "Guest Person" };
const requests = [];
globalThis.__rwFnFetch = async (path) => {
  requests.push(path);
  if (path.includes("follow-suggestions")) return { groups: [{ key: "project", title_key: "", people: [MIRA] }] };
  if (path.startsWith("/v1/im/follows")) return { people: [], next_cursor: null };
  const q = decodeURIComponent(new URL(path, "https://x.test").searchParams.get("q") || "");
  if (q === "Mira") return { people: [MIRA] };
  if (q.toLowerCase() === "guest@example.test") return { people: [GUEST] }; // the server matches case-insensitively
  return { people: [] };
};
const ui = dataModule("export function useUI(){return (text, params={}) => text.replace(/\\{(\\w+)\\}/g,(_,k)=>params[k] ?? k);}");
const clientUrl = await compileModule("src/shell/access/task-access-client.ts", {
  "../../lib/auth/client": dataModule("export async function accessToken(){return 't';}"),
  "../../lib/auth/config": dataModule("export const GATEWAY_BASE='https://gateway.test';"),
});
const { TaskSharePanel } = await import(await compileModule("src/shell/share/TaskSharePanel.tsx", {
  "../../i18n/ui/useUI": ui,
  "../access/task-access-client": clientUrl,
  "../../lib/im/client": dataModule("export async function imFetch(path, init){ return globalThis.__rwFnFetch(path, init); }"),
}));
const { noticeText } = await import(await compileModule("src/shell/messages/notices/notice-text.ts"));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function mount(props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(TaskSharePanel, props)));
  return { host, async close() { await act(async () => root.unmount()); host.remove(); } };
}
async function click(node) { assert.ok(node, "element exists"); await act(async () => { node.click(); await sleep(0); }); }
async function type(input, value, wait) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => { await sleep(wait); });
  await act(async () => { await sleep(0); });
}
const button = text => [...document.querySelectorAll("button")].find(node => node.textContent === text || node.getAttribute("aria-label") === text);
const shareState = (extra = {}) => ({ active: false, selectable: [{ id: 1 }], selectedCount: 1, selectedIds: new Set([1]), allSelected: true, busy: null, notice: null,
  enter() {}, exit() {}, toggleAll() {}, snapshotLink: null, async loadSnapshot() {}, async setSnapshotEnabled() {}, copyText() {}, generateImage() {}, generateDocument() {}, ...extra });

test("Collaborate finds people by name and invites the picked account by user_id", async () => {
  const client = new TaskAccessMock();
  const view = await mount({ taskId: "t", taskUrl: "/tasks/t", access: client.access, share: shareState(), client });
  try {
    await click(view.host.querySelector("[data-share-entry]"));
    await click(button("共同协作"));
    await act(async () => { await sleep(0); });
    const search = document.querySelector("[data-collaborate-picker] input[type='search']");
    assert.equal(search.placeholder, RW_FN_COPY.findPlaceholder);
    assert.match(document.querySelector("[data-people-suggestions]").textContent, /Mira/, "follow suggestions are offered");
    await type(search, "Mira", 300);
    assert.ok(requests.some(path => path.startsWith("/v1/im/users/search?q=Mira")));
    await click(document.querySelector("[data-collaborate-picker] [data-person='u-mira'] button"));
    assert.deepEqual(client.calls.filter(call => call.action === "inviteUser").map(call => call.body), [{ userId: "u-mira" }]);
    assert.match(document.querySelector("[data-member-panel]").textContent, /Name u-mira/);
    // The invited account cannot be picked twice.
    const again = document.querySelector("[data-collaborate-picker] [data-person='u-mira'] button");
    assert.ok(!again || again.disabled);
  } finally { await view.close(); }
});

test("a complete email finds the person card; an unknown email still makes an email invite; parts are never sent", async () => {
  const client = new TaskAccessMock();
  const view = await mount({ taskId: "t", taskUrl: "/tasks/t", access: client.access, share: shareState(), client });
  try {
    await click(view.host.querySelector("[data-share-entry]"));
    await click(button("共同协作"));
    const search = () => document.querySelector("[data-collaborate-picker] input[type='search']");
    const before = requests.length;
    await type(search(), "guest@exa", 750);
    assert.equal(requests.slice(before).filter(path => path.includes("users/search")).length, 0, "partial address is not looked up");
    assert.equal(document.querySelector("[data-invite-email]"), null);
    await type(search(), "Guest@Example.test", 750);
    assert.ok(requests.some(path => path.includes("users/search?q=Guest%40Example.test")));
    assert.match(document.querySelector("[data-people-search]").textContent, /Guest Person/);
    assert.doesNotMatch(document.querySelector("[data-people-search] ul").textContent, /example/);
    await type(search(), "new@example.test", 750);
    assert.match(document.querySelector("[data-people-search]").textContent, /没有找到/);
    await click(document.querySelector("[data-invite-email]"));
    assert.deepEqual(client.calls.filter(call => call.action === "invite").map(call => call.body), [{ email: "new@example.test", role: "collaborate" }]);
    assert.equal(search().value, "", "the picker resets after an invite");
  } finally { await view.close(); }
});

test("Share link: Send to… notifies picked people with the snapshot only", async () => {
  const client = new TaskAccessMock(), sent = [];
  const share = shareState({ snapshotLink: { shareId: "abc123", url: "https://oceanleo.test/share/abc123" } });
  let fail = null;
  const sendShare = async (shareId, ids) => { if (fail) throw fail; sent.push([shareId, ids]); };
  const view = await mount({ taskId: "t", taskUrl: "/tasks/t", access: client.access, share, client, sendShare });
  try {
    await click(view.host.querySelector("[data-share-entry]"));
    await click(button("分享链接"));
    await click(document.querySelector("[data-share-send-entry]"));
    assert.match(document.querySelector("[data-share-send]").textContent, /不会获得任务的其他权限/);
    assert.equal(button("发送给 0 人").disabled, true);
    await act(async () => { await sleep(0); });
    await click(document.querySelector("[data-share-send] [data-person='u-mira'] button"));
    assert.match(document.querySelector("[data-share-recipients]").textContent, /Mira/);
    fail = Object.assign(new Error("x"), { status: 500 });
    await click(button("发送给 1 人"));
    assert.match(document.querySelector("[data-task-share-page] [role='alert']").textContent, /发送失败/);
    fail = null;
    await click(button("发送给 1 人"));
    assert.deepEqual(sent, [["abc123", ["u-mira"]]]);
    assert.match(document.querySelector("[data-task-share-page]").textContent, /已发送给 1 人。/);
    assert.equal(document.querySelector("[data-task-share-page]").getAttribute("data-task-share-page"), "snapshot");
    assert.equal(client.calls.filter(call => /invite/.test(call.action)).length, 0, "sending grants no task access");
  } finally { await view.close(); }
});

test("invite notifications render in the reader's language from meta.text; others unchanged", () => {
  const de = rwFnCopy("de");
  const tt = (text, vars = {}) => (de[text] ?? text).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
  const item = { title: "Owner 邀请你协作任务「Plan」", body: "打开任务后可以接受或拒绝邀请。",
    meta: { text: { title: RW_FN_COPY.taskInvite, body: RW_FN_COPY.taskInviteBody, vars: { name: "Owner", title: "Plan" } } } };
  assert.equal(noticeText(item, "title", tt), "Owner lädt dich ein, an der Aufgabe „Plan“ mitzuarbeiten");
  assert.equal(noticeText(item, "body", tt), de[RW_FN_COPY.taskInviteBody]);
  assert.equal(noticeText({ title: "其它通知", meta: {} }, "title", tt), "其它通知");
  assert.equal(noticeText({ title: "x", meta: { text: { title: "{name}", vars: { name: { evil: 1 } } } } }, "title", tt), "{name}");
});

test("every FN string exists in all 17 locales with the same placeholders, and matches the server sentences", async () => {
  const placeholders = text => [...text.matchAll(/\{\w+\}/g)].map(m => m[0]).sort();
  for (const locale of LOCALES) {
    const table = rwFnCopy(locale);
    for (const source of Object.values(RW_FN_COPY)) {
      assert.ok(table[source]?.trim(), `${locale}: ${source}`);
      assert.deepEqual(placeholders(table[source]), placeholders(source), `${locale}: ${source}`);
    }
  }
  const { readFileSync, existsSync } = await import("node:fs");
  const server = new URL("../../../oceanleo-wt/RW-FN/backend/app/invite_notices.py", import.meta.url);
  if (existsSync(server)) {
    const py = readFileSync(server, "utf8");
    for (const key of ["taskInvite", "taskInviteUntitled", "taskInviteBody", "projectInvite", "projectInviteUntitled",
      "projectInviteBody", "shareSent", "shareSentUntitled", "shareSentBody"]) assert.ok(py.includes(`"${RW_FN_COPY[key]}"`), key);
  }
});
