// Social wave: public people discovery, following, message requests and username states.
// 网关请求全部走替身 imFetch（路由表，记录每次调用），不联网。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/sw-hu-people.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
// jsdom 只在 fabric 的依赖里；先给 canvas 打空壳再取（照 org-membership.test.mjs 的做法）。
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/" });
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window, document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement, HTMLSelectElement: window.HTMLSelectElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, InputEvent: window.InputEvent,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
// react-dom 必须在 JSDOM 全局就位之后再加载（受控 input 的 onChange 才认 input 事件）。
const { createRoot } = await import("react-dom/client");

const reactUrl = pathToFileURL(require.resolve("react")).href;

// 恒等 tt：断言直接读中文原文；{x} 插值规则与真 useUI 一致。
const uiHookStub = dataModule(`
  const tt = (value, vars) => (globalThis.__FX2_COPY?.[value] ?? value).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  export function useUI() { return tt; }
`);

// 外壳原语的替身：Modal 就地渲染，Switch / ConfirmDialog 保留可点的按钮。
const uiPrimitivesStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  const h = React.createElement;
  export function Modal({ children, onClose }) { return h("div", { role: "dialog", "data-modal": "" }, children); }
  export function Switch({ checked, onChange, disabled, label }) {
    return h("button", { type: "button", role: "switch", "aria-checked": checked, "aria-label": label, disabled, onClick: () => onChange(!checked) });
  }
  export function ConfirmDialog({ title, body, confirmLabel = "确认", onConfirm, onCancel }) {
    return h("div", { "data-confirm": title },
      h("button", { type: "button", "data-confirm-ok": "", onClick: () => onConfirm() }, confirmLabel),
      h("button", { type: "button", "data-confirm-cancel": "", onClick: () => onCancel() }, "取消"));
  }
`);

// W08 的 imFetch：全部请求进 globalThis.__IM.fetch(path, init)，测试按路由回数据。
const imClientStub = dataModule(`
  export class ImApiError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }
  export async function imFetch(path, init = {}) { return globalThis.__IM.fetch(path, init); }
`);

// W08 的 hooks：usePresence 读 __IM.presence；useImEvent 把处理函数登记到 __IM.handlers。
const imHooksStub = dataModule(`
  export function useImEvent(type, handler) { globalThis.__IM.handlers[type] = handler; }
  export function usePresence() { return globalThis.__IM.presence; }
  export function useImUnread() { return null; }
  export function useImResync() {}
  export function useImInbox() { return { items: [], loaded: true, loading: false, error: null, nextCursor: null }; }
  export function useImConnection() { return "open"; }
  export function imStore() { return { inbox: () => ({ filter: "all", loaded: true }), loadInbox: async () => {} }; }

`);

const nullComponentStub = (name) => dataModule(`export function ${name}() { return null; }`);

function apiError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/** 路由表：键 "METHOD /path"（路径不含 query）→ 返回值或函数；记录全部请求。 */
function router(routes) {
  const calls = [];
  const fn = async (path, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const key = `${method} ${path.split("?")[0]}`;
    calls.push({ method, path, json: init.json });
    const route = routes[key];
    if (route === undefined) throw apiError(404, "not_found", "没有这个测试路由：" + key);
    return typeof route === "function" ? route({ path, json: init.json }) : route;
  };
  fn.calls = calls;
  return fn;
}

async function settle(times = 8) {
  for (let i = 0; i < times; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function mount(element, im) {
  globalThis.__IM = { fetch: im.fetch, presence: im.presence ?? {}, handlers: {} };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await settle();
  const api = {
    host,
    text: () => host.textContent || "",
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    async click(node) {
      assert.ok(node, "要点的元素不存在");
      await act(async () => { node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
      await settle();
    },
    async type(input, value) {
      await act(async () => {
        const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
      await settle();
    },
    async choose(select, value) {
      await act(async () => {
        select.value = String(value);
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      await settle();
    },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
  return api;
}

const STUBS = {
  "../../../i18n/ui/useUI": uiHookStub,
  "../../../ui": uiPrimitivesStub,
  "../../../lib/im/client": imClientStub,
  "../../../contracts/domain-family": dataModule('export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }'),
  "../realtime/hooks": imHooksStub,
  "../report/ReportDialog": nullComponentStub("ReportDialog"),
  "../nav-source/route-boundary": nullComponentStub("RoutePageSkeleton"),
  "./search/SearchView": nullComponentStub("SearchView"),
  "./call/chat/InboxCallBadge": nullComponentStub("InboxCallDecor"),
  "./notices/InboxNoticesRow": nullComponentStub("InboxNoticesRow"),
  "./InboxRow": nullComponentStub("InboxRow"),
  "./InviteQrCode": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function InviteQrCode({url, fileLabel}) { return React.createElement("a", { "data-profile-qr": url, download: fileLabel }, fileLabel); }`),
};
// Stub keys are resolved relative to each source; provide equivalent roots for Inbox and PeopleDiscovery.
const components = {};
for (const [name, file] of Object.entries({
  PeopleView: "people/PeopleView", NewConversationDialog: "groups/NewConversationDialog",
  ProfileCard: "people/ProfileCard", MemberPicker: "people/MemberPicker",
  FindPeople: "people/PeopleDiscovery", MyUsername: "people/PeopleDiscovery", Inbox: "Inbox",
})) {
  components[name] = (await import(await compileModule(`src/shell/messages/${file}.tsx`, STUBS)))[name];
}
const { PeopleView, NewConversationDialog, ProfileCard, MemberPicker, FindPeople, MyUsername, Inbox } = components;
const { peopleMessageError, sortContacts, useLoader, listFollows } = await import(await compileModule("src/lib/im/people-api.ts", STUBS));
const { swHuCopy } = await import("../src/i18n/ui/messages/sw-hu-copy.ts");
const { LOCALES } = await import("../src/i18n/config.ts");
const card = (id, name, more = {}) => ({ user_id: id, name, username: id, avatar_url: null, following: false, follows_me: false, blocked: false, ...more });
const alice = card("alice", "Alice");
const bob = card("bobby", "Bob", { following: true, follows_me: true });
const profile = p => ({ user_id: p.user_id, display_name: p.name, avatar_url: null, relation: "none" });
const group = { id: "group-1", title: "Design", kind: "group", avatar_url: null };
function baseRoutes(overrides = {}) {
  return {
    "GET /v1/im/username": { username: "my_name", suggested: "my_name" },
    "GET /v1/im/username/availability": { available: true },
    "PUT /v1/im/username": ({ json }) => ({ username: json.username }),
    "GET /v1/im/follows": { people: [bob], next_cursor: null },
    "POST /v1/im/follows": { following: true, mutual: false },
    "DELETE /v1/im/follows/bobby": { following: false },
    "GET /v1/im/follow-suggestions": { groups: [{ key: "team", title_key: "team", people: [alice] }, { key: "project", title_key: "project", people: [] }, { key: "bay", title_key: "bay", people: [] }] },
    "GET /v1/im/users/search": { people: [alice] },
    "GET /v1/im/contacts": { items: [{ user_id: "bobby", profile: { ...profile(bob), remark: "Designer" }, source: "invite", since: "2026-01-01" }] },
    "GET /v1/im/remarks": { items: [{ user_id: "bobby", remark: "Designer" }] },
    "GET /v1/im/contacts/groups": { items: [group] },
    "GET /v1/im/blocks": { items: [] },
    "POST /v1/im/blocks": {},
    "GET /v1/im/me": { profile: profile(card("myself", "Me")) },
    "GET /v1/im/profiles": { items: [profile(alice)] },
    "GET /v1/im/drafts": { items: [] },
    "GET /v1/im/conversations": { items: [{ id: "request-1", title: "Request sender", kind: "dm", peer: { display_name: "Request sender", avatar_url: null } }], next_cursor: null },
    "POST /v1/im/conversations/dm": { conversation_id: "dm-1" },
    "POST /v1/im/conversations": { conversation: { id: "new-group", member_count: 3 }, pending_invites: 0 },
    ...overrides,
  };
}
async function open(Component, props = {}, overrides = {}) {
  const fetch = router(baseRoutes(overrides));
  return { view: await mount(React.createElement(Component, props), { fetch }), fetch };
}
const button = (view, text) => view.qa("button").find(node => node.textContent === text);
const delay = ms => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

 test("Chat + opens New chat directly; a single pick opens DM and reopening resets search", async () => {
  const opened = [];
  const { view, fetch } = await open(Inbox, { onNew: () => assert.fail("old host dialog must not open"), onOpenConversation: id => opened.push(id), onOpenNotices() {}, activeConversationId: null });
  try {
    await view.click(view.q("[data-leochat-plus]"));
    assert.equal(view.q("[data-leochat-plus-menu]"), null);
    assert.equal(view.q("[data-people-page] h2").textContent, "新建聊天");
    assert.equal(view.q("[role=dialog]"), null);
    assert.ok(button(view, "新建群组"));
    await view.type(view.q("input[type=search]"), "alice"); await delay(280);
    await view.click(view.q('[data-person="alice"] button'));
    assert.deepEqual(opened, ["dm-1"]);
    assert.deepEqual(fetch.calls.find(c => c.path === "/v1/im/conversations/dm").json, { user_id: "alice" });
    await view.click(view.q("[data-leochat-plus]"));
    assert.equal(view.q("input[type=search]").value, "");
    assert.equal(view.q("[data-picker-chips]"), null);
    assert.ok(!fetch.calls.some(c => c.path.includes("contact-requests")));
  } finally { view.cleanup(); }
});

test("Contact + opens Find people directly with Follow/Following and profile link/QR", async () => {
  let followed = false;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { globalThis.__copied = value; } } });
  const { view, fetch } = await open(PeopleView, { onOpenConversation() {} }, { "POST /v1/im/follows": () => { followed = true; return { following: true, mutual: false }; } });
  try {
    await view.click(view.q("[data-leochat-plus]"));
    assert.equal(view.q("[data-leochat-plus-menu]"), null);
    assert.equal(view.q("h2").textContent, "找人");
    assert.match(view.text(), /我的用户名/);
    await view.click(button(view, "复制资料链接"));
    assert.equal(globalThis.__copied, "https://oceanleo.com/leochat?find=1&username=my_name");
    await view.click(button(view, "显示二维码"));
    assert.equal(view.q("[data-profile-qr]").getAttribute("data-profile-qr"), globalThis.__copied);
    await view.click(view.qa('[data-person="alice"] button').at(-1));
    assert.equal(followed, true);
    assert.match(view.q('[data-person="alice"]').textContent, /已关注/);
    assert.deepEqual(fetch.calls.find(c => c.method === "POST").json, { user_id: "alice" });
    await view.type(view.q("input[type=search]"), "stale");
    await view.click(view.q('button[aria-label="返回"]'));
    await view.click(view.q("[data-leochat-plus]"));
    assert.equal(view.q("input[type=search]").value, "");
  } finally { view.cleanup(); }
});

test("New friends expands inline once; Blocked is the next entry and request opens conversation", async () => {
  const opened = [];
  const { view, fetch } = await open(PeopleView, { onOpenConversation: id => opened.push(id) });
  try {
    const entry = view.q("[data-new-friends-entry]");
    assert.equal(entry.nextElementSibling, view.q("[data-blocked-entry]"));
    await view.click(entry);
    assert.equal((view.text().match(/新的朋友/g) ?? []).length, 1);
    assert.equal(view.q("[data-message-requests] h2"), null);
    assert.equal(view.q('[data-message-requests] button[aria-label="返回"]'), null);
    assert.ok(fetch.calls.some(c => c.path.includes("box=requests")));
    await view.click(view.q("[data-request-conversation]"));
    assert.deepEqual(opened, ["request-1"]);
    await view.click(entry);
    assert.equal(view.q("[data-message-requests]"), null);
    assert.match(view.text(), /正在关注/);
    assert.match(view.text(), /互相关注/);
    await view.type(view.q("input[type=search]"), "designer");
    assert.ok(view.q('[data-contact="bobby"]'));
  } finally { view.cleanup(); }
});

test("request and block errors never become empty lists; contacts survive people_unavailable", async () => {
  const { view } = await open(PeopleView, { onOpenConversation() {} }, {
    "GET /v1/im/follows": () => { throw apiError(503, "people_unavailable", "pending"); },
    "GET /v1/im/conversations": () => { throw Error("request list failed"); },
    "GET /v1/im/blocks": () => { throw Error("block list failed"); },
  });
  try {
    assert.match(view.text(), /找人功能暂不可用/);
    assert.ok(view.q('[data-contact="bobby"]'));
    await view.click(view.q("[data-new-friends-entry]"));
    assert.match(view.q("[data-message-requests]").textContent, /找人功能暂不可用，正在自动恢复/);
    assert.doesNotMatch(view.q("[data-message-requests]").textContent, /没有消息请求/);
    await view.click(view.q("[data-blocked-entry]"));
    assert.match(view.text(), /找人功能暂不可用，正在自动恢复/);
    assert.equal(view.q("[data-blocked-empty]"), null);
  } finally { view.cleanup(); }
});

test("username is required first, checks live validity and availability, and saves before discovery", async () => {
  const { view, fetch } = await open(FindPeople, { onBack() {}, onOpenConversation() {} }, {
    "GET /v1/im/username": { username: null, suggested: "suggested" },
    "GET /v1/im/username/availability": ({ path }) => ({ available: !path.includes("taken") }),
  });
  try {
    assert.equal(view.q("[data-people-discovery]"), null);
    await view.type(view.q("input"), "X");
    assert.match(view.text(), /3–32/);
    assert.equal(view.q("button[type=submit]").disabled, true);
    await view.type(view.q("input"), "taken"); await delay(330);
    assert.match(view.text(), /这个用户名已被使用/);
    assert.equal(view.q("button[type=submit]").disabled, true);
    await view.type(view.q("input"), "valid_name"); await delay(330);
    assert.match(view.text(), /这个用户名可以使用/);
    await act(async () => view.q("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); await settle();
    assert.deepEqual(fetch.calls.find(c => c.method === "PUT").json, { username: "valid_name" });
    assert.ok(view.q("[data-people-discovery]"));
    assert.match(view.text(), /@valid_name/);
  } finally { view.cleanup(); }
});

test("username availability and save failures remain explicit and keep the draft", async () => {
  let failCheck = true;
  const { view } = await open(MyUsername, { value: null, suggested: "valid_name", onSaved: () => assert.fail("failed save") }, {
    "GET /v1/im/username/availability": () => { if (failCheck) throw apiError(503, "people_unavailable", "pending"); return { available: true }; },
    "PUT /v1/im/username": () => { throw apiError(409, "username_taken", "taken"); },
  });
  try {
    await delay(330);
    assert.match(view.text(), /找人功能暂不可用/);
    assert.equal(view.q("button[type=submit]").disabled, true);
    failCheck = false;
    await view.type(view.q("input"), "other_name"); await delay(330);
    await act(async () => view.q("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); await settle();
    assert.match(view.text(), /这个用户名已被使用/);
    assert.equal(view.q("input").value, "other_name");
    assert.equal(view.q("button[type=submit]").disabled, true);
  } finally { view.cleanup(); }
});

test("search failure clears previous results; suggestion failure leaves following usable", async () => {
  let fail = false;
  const { view } = await open(NewConversationDialog, { open: true, onClose() {}, onCreated() {} }, {
    "GET /v1/im/follow-suggestions": () => { throw Error("suggestions failed"); },
    "GET /v1/im/users/search": () => { if (fail) throw Error("search failed"); return { people: [alice] }; },
  });
  try {
    assert.match(view.text(), /找人功能暂不可用，正在自动恢复/);
    assert.ok(view.q('[data-person="bobby"]'));
    await view.type(view.q("input[type=search]"), "alice"); await delay(280);
    assert.ok(view.q('[data-person="alice"]'));
    fail = true;
    await view.type(view.q("input[type=search]"), "bob"); await delay(280);
    assert.match(view.text(), /找人功能暂不可用，正在自动恢复/);
    assert.equal(view.q('[data-person="alice"]'), null);
    assert.doesNotMatch(view.text(), /没有找到/);
  } finally { view.cleanup(); }
});

test("New group retains multi-select, existing groups, creation result, and explicit group-list error", async () => {
  const opened = [];
  const { view, fetch } = await open(NewConversationDialog, { open: true, onClose() {}, onCreated: id => opened.push(id) });
  try {
    await view.click(button(view, "新建群组"));
    assert.equal(view.q("h2").textContent, "新建群组");
    assert.ok(button(view, "Design"));
    await view.click(view.q('[data-person="alice"] button'));
    await view.click(view.q('[data-person="bobby"] button'));
    assert.equal(view.qa("[data-picker-chips] button").length, 2);
    await view.click(view.q('[data-action="create-group"]'));
    assert.deepEqual(fetch.calls.find(c => c.path === "/v1/im/conversations").json.member_ids, ["alice", "bobby"]);
    await view.click(button(view, "进入群聊"));
    assert.deepEqual(opened, ["new-group"]);
  } finally { view.cleanup(); }
  const failed = await open(NewConversationDialog, { open: true, onClose() {}, onCreated() {} }, { "GET /v1/im/contacts/groups": () => { throw Error("groups failed"); } });
  try { await failed.view.click(button(failed.view, "新建群组")); assert.match(failed.view.q("[data-existing-groups]").textContent, /找人功能暂不可用，正在自动恢复/); assert.doesNotMatch(failed.view.q("[data-existing-groups]").textContent, /还没有已有群/); } finally { failed.view.cleanup(); }
});

test("profile follows without approval, sends DM and blocks; no friend-request actions", async () => {
  const opened = [];
  const { view, fetch } = await open(ProfileCard, { userId: "alice", onClose() {}, onOpenConversation: id => opened.push(id) });
  try {
    assert.ok(view.q('[data-action="follow"]'));
    assert.equal(view.q('[data-action="add-contact"]'), null);
    await view.click(view.q('[data-action="follow"]'));
    assert.ok(fetch.calls.some(c => c.method === "POST" && c.path === "/v1/im/follows"));
    await view.click(view.q('[data-action="dm"]'));
    assert.deepEqual(opened, ["dm-1"]);
    await view.click(view.q('[data-action="block"]'));
    assert.ok(fetch.calls.some(c => c.method === "POST" && c.path === "/v1/im/blocks"));
  } finally { view.cleanup(); }
});

test("member picker can select a non-contact; existing members are disabled", async () => {
  let picked = [];
  function Host() { const [selected, change] = React.useState([]); return React.createElement(MemberPicker, { selected, onChange: ids => { picked = ids; change(ids); }, existingIds: ["bobby"] }); }
  const { view } = await open(Host);
  try {
    assert.equal(view.q('[data-person="bobby"] button').disabled, true);
    await view.click(view.q('[data-person="alice"] button'));
    assert.deepEqual(picked, ["alice"]);
    assert.equal(view.q('[data-person="alice"] button').getAttribute("aria-pressed"), "true");
    await view.click(view.q('[data-person="alice"] button'));
    assert.deepEqual(picked, []);
  } finally { view.cleanup(); }
});

test("find deep link opens discovery and searches the shared username", async () => {
  window.history.replaceState(null, "", "/leochat?find=1&username=alice");
  const { view, fetch } = await open(PeopleView, { onOpenConversation() {} });
  try {
    assert.equal(view.q("h2").textContent, "找人");
    assert.equal(view.q("input[type=search]").value, "alice");
    assert.ok(fetch.calls.some(c => c.path.includes("users/search?q=alice")));
  } finally { view.cleanup(); window.history.replaceState(null, "", "/leochat"); }
});

test("copy covers every locale and reply_limit formatter gives the required line", () => {
  const reference = Object.keys(swHuCopy("zh"));
  for (const locale of LOCALES) {
    const copy = swHuCopy(locale);
    assert.deepEqual(Object.keys(copy), reference);
    for (const key of reference) assert.ok(typeof copy[key] === "string" && copy[key].trim(), `${locale}: ${key}`);
  }
  assert.equal(peopleMessageError({ code: "reply_limit" }, key => swHuCopy("en")[key] ?? key), "You can send 3 messages a week until they reply");
  const rows = [{ user_id: "b", profile: { display_name: "Bob", remark: "Designer" } }, { user_id: "a", profile: { display_name: "Alice" } }];
  assert.deepEqual(sortContacts(rows, { b: "online", a: "offline" }).map(p => p.user_id), ["b", "a"]);
  assert.deepEqual(sortContacts(rows, {}, "designer").map(p => p.user_id), ["b"]);
});

test("following pagination keeps later people reachable and profile state uses all pages", async () => {
  const { view, fetch } = await open(FindPeople, { onBack() {}, onOpenConversation() {} }, {
    "GET /v1/im/follows": ({ path }) => path.includes("cursor=page-2") ? { people: [card("later", "Later", { following: true })], next_cursor: null } : { people: [bob], next_cursor: "page-2" },
  });
  try {
    await view.click(button(view, "加载更多"));
    assert.ok(view.q('[data-person="later"]'));
    assert.ok(fetch.calls.some(c => c.path.includes("cursor=page-2")));
  } finally { view.cleanup(); }
  const detail = await open(ProfileCard, { userId: "later", onClose() {}, onOpenConversation() {} }, {
    "GET /v1/im/profiles": { items: [] },
    "GET /v1/im/follows": ({ path }) => path.includes("cursor=page-2") ? { people: [card("later", "Later", { following: true })], next_cursor: null } : { people: [bob], next_cursor: "page-2" },
  });
  try {
    assert.equal(detail.view.q('[data-action="follow"]').textContent, "已关注");
    assert.match(detail.view.text(), /Later/);
  } finally { detail.view.cleanup(); }
});

test("changing a username saves the edited handle and updates its shared profile link", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { globalThis.__copied = value; } } });
  const { view, fetch } = await open(FindPeople, { onBack() {}, onOpenConversation() {} });
  try {
    await view.click(button(view, "修改"));
    await view.type(view.q("[data-my-username] input"), "new_name"); await delay(330);
    await act(async () => view.q("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); await settle();
    assert.deepEqual(fetch.calls.find(c => c.method === "PUT").json, { username: "new_name" });
    await view.click(button(view, "复制资料链接"));
    assert.equal(globalThis.__copied, "https://oceanleo.com/leochat?find=1&username=new_name");
  } finally { view.cleanup(); }
});


const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");

for (const [label, failure] of [
  ["people_unavailable", () => apiError(503, "people_unavailable", "pending migration")],
  ["generic 503", () => apiError(503, "http_503", "temporarily unavailable")],
  ["unavailable code", () => apiError(409, "username_unavailable", "unavailable")],
  ["network failure", () => new TypeError("Failed to fetch")],
]) {
  test(`English Find people labels ${label} and automatically recovers without a follow action`, async () => {
    globalThis.__FX2_COPY = UI_MESSAGES.en;
    let fail = true;
    const { view, fetch } = await open(FindPeople, { onBack() {}, onOpenConversation() {} }, {
      "GET /v1/im/username": () => { if (fail) throw failure(); return { username: "my_name", suggested: "my_name" }; },
    });
    try {
      assert.equal(view.q("h2").textContent, "Find people");
      assert.match(view.q('[role="alert"]').textContent, /unavailable.*automatically/);
      assert.doesNotMatch(view.text(), /Loading|Couldn’t update your follow|don.t follow anyone yet/);
      assert.equal(view.qa("button").length, 1, "only Back; no Retry control");
      fail = false;
      await act(async () => window.dispatchEvent(new window.Event("online")));
      await settle();
      assert.ok(view.q("[data-my-username]"));
      assert.ok(view.q("[data-people-discovery]"));
      assert.equal(view.q('[role="alert"]'), null);
      assert.equal(view.q("h2").textContent, "Find people");
      assert.ok(fetch.calls.filter(c => c.path === "/v1/im/username").length >= 2);
      assert.equal(fetch.calls.filter(c => c.method !== "GET").length, 0);
    } finally { view.cleanup(); delete globalThis.__FX2_COPY; }
  });
}

test("503 suggestions and following settle into labelled states, recover on focus, and follow errors appear only after a click", async () => {
  globalThis.__FX2_COPY = UI_MESSAGES.en;
  let fail = true;
  const { view, fetch } = await open(FindPeople, { onBack() {}, onOpenConversation() {} }, {
    "GET /v1/im/follows": () => { if (fail) throw apiError(503, "follows_unavailable", "pending"); return { people: [bob], next_cursor: null }; },
    "GET /v1/im/follow-suggestions": () => { if (fail) throw new TypeError("Failed to fetch"); return { groups: [{ key: "team", people: [alice] }] }; },
    "POST /v1/im/follows": () => { throw apiError(503, "people_unavailable", "pending"); },
  });
  try {
    assert.equal(view.q("h2").textContent, "Find people");
    for (const region of ["[data-people-suggestions]", "[data-people-following]"]) {
      assert.match(view.q(region).textContent, /unavailable.*automatically/);
      assert.doesNotMatch(view.q(region).textContent, /Loading|Couldn’t update your follow|don.t follow anyone yet/);
    }
    fail = false;
    await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
    assert.ok(view.q('[data-person="alice"]'));
    assert.ok(view.q('[data-person="bobby"]'));
    assert.doesNotMatch(view.text(), /Couldn’t update your follow/);
    await view.click(view.qa('[data-person="alice"] button').at(-1));
    assert.equal(view.q("h2").textContent, "Find people");
    assert.match(view.q('[data-person="alice"] [role="alert"]').textContent, /Couldn’t update your follow/);
    await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
    assert.equal(fetch.calls.filter(c => c.method === "POST").length, 1, "recovery never repeats a mutation");
    assert.equal(view.qa('[data-person="alice"] button').at(-1).textContent, "Follow");
  } finally { view.cleanup(); delete globalThis.__FX2_COPY; }
});

test("Contact exposes 503 failure while retaining real contacts, then updates after recovery", async () => {
  let fail = true;
  const { view } = await open(PeopleView, { onOpenConversation() {} }, {
    "GET /v1/im/follows": () => { if (fail) throw apiError(503, "http_503", "unavailable"); return { people: [card("later", "Later", { following: true })], next_cursor: null }; },
  });
  try {
    assert.match(view.text(), /找人功能暂不可用，正在自动恢复/);
    assert.ok(view.q('[data-contact="bobby"]'));
    assert.equal(view.q("[data-contacts-empty]"), null);
    fail = false;
    await act(async () => window.dispatchEvent(new window.Event("online"))); await settle();
    assert.ok(view.q('[data-contact="later"]'));
    assert.equal(view.q('[data-contact="bobby"]'), null);
    assert.equal(view.q('[role="alert"]'), null);
  } finally { view.cleanup(); }
});

test("following and followers reads back off automatically and pause offline", async () => {
  for (const box of ["following", "followers"]) {
    let fail = true;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    function Probe() {
      const load = useLoader(() => listFollows(box), [box]);
      return React.createElement("p", { "data-state": load.loading ? "loading" : load.error ? "unavailable" : "ready" }, load.data?.people[0]?.name);
    }
    const { view, fetch } = await open(Probe, {}, {
      "GET /v1/im/follows": () => { if (fail) throw new TypeError("Failed to fetch"); return { people: [bob], next_cursor: null }; },
    });
    try {
      assert.equal(view.q("[data-state]").dataset.state, "unavailable");
      await delay(1100);
      assert.equal(fetch.calls.length, 1, "offline reads do not retry");
      Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
      await act(async () => window.dispatchEvent(new window.Event("online"))); await settle();
      assert.equal(fetch.calls.length, 2);
      fail = false;
      await delay(2100); // second recovery uses the 2-second backoff, without an event or button
      assert.equal(view.q("[data-state]").dataset.state, "ready");
      assert.ok(fetch.calls.every(c => c.path.includes(`box=${box}`)));
    } finally { view.cleanup(); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); }
  }
});

test("username availability recovers automatically and stale recovery cannot overwrite an edited draft", async () => {
  let fail = true;
  let release;
  const { view } = await open(MyUsername, { value: null, suggested: "valid_name", onSaved() {} }, {
    "GET /v1/im/username/availability": ({ path }) => {
      if (fail) throw apiError(503, "people_unavailable", "unavailable");
      if (path.includes("valid_name")) return new Promise(resolve => { release = resolve; });
      return { available: false };
    },
  });
  try {
    await delay(330);
    assert.match(view.text(), /找人功能暂不可用，正在自动恢复/);
    assert.equal(view.q("input").value, "valid_name");
    fail = false;
    await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
    assert.equal(typeof release, "function");
    await view.type(view.q("input"), "taken_name"); await delay(330);
    await act(async () => release({ available: true })); await settle();
    assert.equal(view.q("input").value, "taken_name");
    assert.match(view.text(), /这个用户名已被使用/);
    assert.equal(view.q("button[type=submit]").disabled, true);
    await view.type(view.q("input"), "recovered_name"); await delay(330);
    assert.equal(view.q('[role="alert"]'), null);
  } finally { view.cleanup(); }
});
