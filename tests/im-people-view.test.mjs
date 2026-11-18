// W10 判据：联系人排序（在线 → 离开 → 离线）、按名字搜、请求（接受 / 拒绝 / 撤回）、拉群邀请（加入 / 拒绝）、拉黑名单（取消拉黑）。
// 网关请求全部走替身 imFetch（路由表，记录每次调用），不联网。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/im-people-view.test.mjs
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
  const tt = (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
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
  "../realtime/hooks": imHooksStub,
  "../../../lib/org-api": dataModule(`export async function listMyOrgs() { return globalThis.__IM.orgs ?? []; }`),
  "../report/ReportDialog": nullComponentStub("ReportDialog"),
};

const { PeopleView } = await import(await compileModule("src/shell/messages/people/PeopleView.tsx", STUBS));
const { sortContacts } = await import(await compileModule("src/lib/im/people-api.ts", STUBS));
const { NewConversationDialog } = await import(await compileModule("src/shell/messages/groups/NewConversationDialog.tsx", STUBS));
const { ProfileCard } = await import(await compileModule("src/shell/messages/people/ProfileCard.tsx", STUBS));

const person = (id, name, relation) => ({ user_id: id, display_name: name, avatar_url: null, relation });
const contact = (id, name) => ({ user_id: id, profile: person(id, name, "contact"), source: "invite", since: "2026-10-01T00:00:00Z" });

const CONTACTS = [contact("c-bob", "Bob"), contact("c-zed", "Zed"), contact("c-amy", "Amy"), contact("c-ann", "Ann")];
const PRESENCE = { "c-zed": "online", "c-ann": "online", "c-amy": "away" };

function baseRoutes(extra = {}) {
  return {
    "GET /v1/im/contacts": { items: CONTACTS },
    "GET /v1/im/contacts/groups": { items: [] },
    "GET /v1/im/contacts/teams": { items: [] },
    "GET /v1/im/invite-links": { items: [] },
    "GET /v1/im/directory": { items: [person("t-lee", "Lee", "teammate"), person("c-bob", "Bob", "contact")] },
    "GET /v1/im/contact-requests": ({ path }) => ({ items: path.includes("box=in") ? [] : [] }),
    "GET /v1/im/group-invites": { items: [] },
    "GET /v1/im/blocks": { items: [] },
    "GET /v1/im/conversations": { items: [], next_cursor: null },
    ...extra,
  };
}

test("排序：在线 → 离开 → 离线，同状态按名字；按名字或备注过滤不分大小写", () => {
  const order = sortContacts(CONTACTS, PRESENCE).map((c) => c.profile.display_name);
  assert.deepEqual(order, ["Ann", "Zed", "Amy", "Bob"]);
  assert.deepEqual(sortContacts(CONTACTS, PRESENCE, "  AM ").map((c) => c.profile.display_name), ["Amy"]);
  assert.deepEqual(sortContacts(CONTACTS, {}).map((c) => c.profile.display_name), ["Amy", "Ann", "Bob", "Zed"], "没有在线信息 = 全部按离线、按名字");
  const remarked = [{ user_id: "c-bob", profile: { ...CONTACTS[0].profile, remark: "老同学" }, source: "invite", since: "2026-10-01T00:00:00Z" }];
  assert.deepEqual(sortContacts(remarked, {}, "同学").map((c) => c.user_id), ["c-bob"]);
});

test("联系人页：新朋友在最上面，好友和群组分开，同事和工作联系人不混进好友", async () => {
  const im = { fetch: router(baseRoutes()), presence: PRESENCE };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation() {} }), im);
  try {
    const names = view.qa("[data-contacts] [data-contact]").map((li) => li.getAttribute("data-contact"));
    assert.deepEqual(names, ["c-ann", "c-zed", "c-amy", "c-bob"]);
    assert.equal(view.q('[data-contact="c-ann"]').getAttribute("data-presence"), "online");
    const others = view.qa("[data-contacts-others] [data-contact]").map((li) => li.getAttribute("data-contact"));
    assert.deepEqual(others, [], "没有加好友的同事不进入好友列表");
    assert.deepEqual(view.qa("[data-contact-list] h4").map((h) => h.textContent), ["好友", "群组"]);
    assert.ok(view.q("[data-new-friends-entry]").compareDocumentPosition(view.q("[data-contact-list]")) & window.Node.DOCUMENT_POSITION_FOLLOWING);

    await view.type(view.q('input[type="search"]'), "am");
    assert.deepEqual(view.qa("[data-contacts] [data-contact]").map((li) => li.getAttribute("data-contact")), ["c-amy"]);
  } finally {
    view.cleanup();
  }
});

test("请求页：接受 / 拒绝收到的请求，撤回发出的请求；页签上有待处理数", async () => {
  const incoming = [{ id: "r1", from: person("u-sam", "Sam"), to: person("me", "我"), message: "我是 Sam", status: "pending", created_at: "2026-10-05T00:00:00Z" },
    { id: "r2", from: person("u-kim", "Kim"), to: person("me", "我"), message: "", status: "pending", created_at: "2026-10-05T00:00:00Z" }];
  const outgoing = [{ id: "r3", from: person("me", "我"), to: person("u-ola", "Ola"), message: "", status: "pending", created_at: "2026-10-05T00:00:00Z" }];
  const im = {
    fetch: router(baseRoutes({
      "GET /v1/im/contact-requests": ({ path }) => ({ items: path.includes("box=in") ? incoming : outgoing }),
      "POST /v1/im/contact-requests/r1/accept": {},
      "POST /v1/im/contact-requests/r2/decline": {},
      "POST /v1/im/contact-requests/r3/cancel": {},
    })),
  };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation() {} }), im);
  try {
    assert.match(view.q("[data-new-friends-entry]")?.textContent, /2/, "新的朋友显示待处理数");
    assert.equal(view.q('[role="tablist"]'), null);
    await view.click(view.q('[data-new-friends-entry]'));
    assert.equal(view.qa('[data-section="incoming"] [data-request]').length, 2);
    assert.equal(view.qa('[data-section="outgoing"] [data-request]').length, 1);

    await view.click(view.q('[data-request="r1"] [data-action="accept"]'));
    await view.click(view.q('[data-request="r2"] [data-action="decline"]'));
    await view.click(view.q('[data-request="r3"] [data-action="cancel"]'));
    const posts = im.fetch.calls.filter((c) => c.method === "POST").map((c) => c.path);
    assert.deepEqual(posts, [
      "/v1/im/contact-requests/r1/accept",
      "/v1/im/contact-requests/r2/decline",
      "/v1/im/contact-requests/r3/cancel",
    ]);
  } finally {
    view.cleanup();
  }
});

test("新的朋友保留已处理状态，右键删除仅调用当前用户的历史接口", async () => {
  let history = [{ id: "old", from: person("u-old", "旧朋友"), to: person("me", "我"), status: "accepted", message: "你好", created_at: "2026-10-01T00:00:00Z" }];
  const im = { fetch: router(baseRoutes({
    "GET /v1/im/contact-requests": ({ path }) => ({ items: path.includes("box=in") ? history : [] }),
    "DELETE /v1/im/contact-requests/old": () => { history = []; return {}; },
  })) };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation() {} }), im);
  try {
    await view.click(view.q('[data-new-friends-entry]'));
    assert.match(view.text(), /已添加/);
    assert.equal(view.q('[data-action="accept"]'), null);
    await act(async () => { view.q('[data-request="old"]').dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true })); });
    await view.click(view.q('[role="menuitem"]'));
    assert.equal(view.q('[data-request="old"]'), null);
    assert.ok(im.fetch.calls.some((c) => c.method === "DELETE" && c.path === "/v1/im/contact-requests/old"));
  } finally { view.cleanup(); }
});

test("拉群邀请：加入会打开那个群，拒绝只回绝；后端拒绝时显示后端给的原因", async () => {
  const invite = (id, title) => ({ id, conversation: { id: "conv-" + id, title, avatar_url: null, member_count: 5 }, inviter: person("u-sam", "Sam"), created_at: "2026-10-05T00:00:00Z" });
  const opened = [];
  const im = {
    fetch: router(baseRoutes({
      "GET /v1/im/group-invites": { items: [invite("g1", "设计小组"), invite("g2", "吃饭群")] },
      "POST /v1/im/group-invites/g1/accept": { conversation_id: "conv-g1" },
      "POST /v1/im/group-invites/g2/decline": () => { throw apiError(409, "conflict", "邀请已经处理过了"); },
    })),
  };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation: (id) => opened.push(id) }), im);
  try {
    await view.click(view.q('[data-new-friends-entry]'));
    assert.equal(view.qa("[data-group-invite]").length, 2);
    await view.click(view.q('[data-group-invite="g1"] [data-action="accept-group"]'));
    assert.deepEqual(opened, ["conv-g1"]);
    await view.click(view.q('[data-group-invite="g2"] [data-action="decline-group"]'));
    assert.match(view.text(), /邀请已经处理过了/);
  } finally {
    view.cleanup();
  }
});

test("拉黑名单：列出被拉黑的人，取消拉黑", async () => {
  let blocks = [person("u-bad", "Mallory")];
  const im = {
    fetch: router(baseRoutes({
      "GET /v1/im/blocks": () => ({ items: blocks }),
      "DELETE /v1/im/blocks/u-bad": () => { blocks = []; },
    })),
  };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation() {} }), im);
  try {
    await view.click(view.q('[data-leochat-plus]'));
    await view.click(view.q('[data-leochat-action="blocked"]'));
    assert.equal(view.qa("[data-blocked]").length, 1);
    await view.click(view.q('[data-blocked="u-bad"] [data-action="unblock"]'));
    assert.ok(im.fetch.calls.some((c) => c.method === "DELETE" && c.path === "/v1/im/blocks/u-bad"));
    assert.equal(view.qa("[data-blocked]").length, 0);
    assert.ok(view.q("[data-blocked-empty]"));
  } finally {
    view.cleanup();
  }
});

test("新建群组：选两人后完成；名字选填；创建后告诉用户「已加入 N 人，M 人等待同意」，再进群", async () => {
  const created = [];
  const im = {
    fetch: router(baseRoutes({
      "GET /v1/im/directory": { items: [person("c-ann", "Ann", "contact"), person("c-zed", "Zed", "contact")] },
      "POST /v1/im/conversations": ({ json }) => ({
        conversation: { id: "conv-new", member_count: 2, title: json.title },
        pending_invites: 1,
      }),
    })),
  };
  const view = await mount(React.createElement(NewConversationDialog, { open: true, onClose() {}, onCreated: (id) => created.push(id) }), im);
  try {
    assert.equal(view.q('[data-action="start-dm"]').disabled, true, "没选人不能完成");
    await view.click(view.q('[data-candidate="c-ann"]'));
    await view.click(view.q('[data-candidate="c-zed"]'));
    await view.type(view.q('[data-field="title"]'), "周末活动");
    await view.click(view.q('[data-action="create-group"]'));
    const post = im.fetch.calls.find((c) => c.method === "POST" && c.path === "/v1/im/conversations");
    assert.deepEqual(post.json, { title: "周末活动", member_ids: ["c-ann", "c-zed"] });
    assert.equal(view.q("[data-create-result]").querySelector("p").textContent, "群已创建。已加入 1 人，1 人等待同意。");
    assert.deepEqual(created, [], "先让用户看到结果");
    await view.click(view.q('[data-action="enter"]'));
    assert.deepEqual(created, ["conv-new"]);
  } finally {
    view.cleanup();
  }
});

test("新建私聊：选一个人 → 取或建私聊 → onCreated", async () => {
  const created = [];
  const im = {
    fetch: router(baseRoutes({
      "GET /v1/im/directory": { items: [person("c-ann", "Ann", "contact")] },
      "POST /v1/im/conversations/dm": { conversation: { id: "dm-1" } },
    })),
  };
  const view = await mount(React.createElement(NewConversationDialog, { open: true, onClose() {}, onCreated: (id) => created.push(id) }), im);
  try {
    assert.equal(view.q('[data-action="start-dm"]').disabled, true);
    await view.click(view.q('[data-candidate="c-ann"]'));
    await view.click(view.q('[data-action="start-dm"]'));
    assert.deepEqual(im.fetch.calls.find((c) => c.path === "/v1/im/conversations/dm").json, { user_id: "c-ann" });
    assert.deepEqual(created, ["dm-1"]);
  } finally {
    view.cleanup();
  }
});

test("通讯录：按备注搜得到人；已保存的群单独一组", async () => {
  const contacts = [{
    user_id: "c-bob",
    profile: { ...person("c-bob", "Bob", "contact"), remark: "老同学" },
    source: "invite",
    since: "2026-10-01T00:00:00Z",
  }];
  const saved = [{
    id: "g-saved",
    kind: "group",
    title: "周末局",
    remark: "打球群",
    avatar_url: null,
    peer: null,
    member_count: 4,
    last_message: null,
    last_activity_at: "2026-10-05T00:00:00Z",
    unread_count: 0,
    mention_count: 0,
    muted: false,
    notify_level: "all",
    org_id: null,
    project_id: null,
    has_external: false,
    my_role: "member",
    dissolved: false,
    in_contacts: true,
  }];
  const im = {
    fetch: router(baseRoutes({
      "GET /v1/im/contacts": { items: contacts },
      "GET /v1/im/directory": { items: [] },
      "GET /v1/im/contacts/groups": { items: saved },
    })),
  };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation() {} }), im);
  try {
    assert.equal(view.q('[data-saved-group="g-saved"]').textContent.includes("打球群"), true);
    await view.type(view.q('input[type="search"]'), "同学");
    assert.deepEqual(view.qa("[data-contacts] [data-contact]").map((li) => li.getAttribute("data-contact")), ["c-bob"]);
  } finally {
    view.cleanup();
  }
});

test("非联系人和陌生人可以发出带留言的好友请求", async () => {
  const opened = [];
  const routesFor = (relation) => baseRoutes({
    "GET /v1/im/me": { profile: person("me", "我") },
    "GET /v1/im/profiles": { items: [{ ...person("u-x", "路人 X", relation) }] },
    "POST /v1/im/conversations/dm": () => { throw apiError(403, "need_contact", "先加联系人才能私聊") },
    "POST /v1/im/contact-requests": {},
  });
  {
    const im = { fetch: router(routesFor("member")), presence: { "u-x": "online" } };
    const view = await mount(React.createElement(ProfileCard, { userId: "u-x", conversationId: null, onClose() {}, onOpenConversation: (id) => opened.push(id) }), im);
    try {
      assert.match(view.text(), /路人 X/);
      assert.equal(view.q("[data-profile-relation]"), null, "关系不作为资料卡可见信息");
      assert.equal(view.q("[data-profile-original]"), null, "原名行不显示");
      assert.equal(view.q("[data-profile-presence]"), null, "work contacts do not expose online status");
      assert.equal(view.q('[data-action="dm"]'), null);
      await view.click(view.q('[data-action="add-contact"]'));
      const req = im.fetch.calls.find((c) => c.path === "/v1/im/contact-requests");
      assert.deepEqual(req.json, { to_user_id: "u-x" });
      assert.match(view.q("[data-profile-note]").textContent, /已发出联系人请求/);
      assert.deepEqual(opened, []);
    } finally {
      view.cleanup();
    }
  }
  {
    const im = { fetch: router(routesFor("none")) };
    const view = await mount(React.createElement(ProfileCard, { userId: "u-x", onClose() {}, onOpenConversation() {} }), im);
    try {
      assert.ok(view.q('[data-action="add-contact"]'), "陌生人显示添加到通讯录入口");
      await view.type(view.q("[data-request-message]"), "I am X");
      await view.click(view.q('[data-action="add-contact"]'));
      assert.deepEqual(im.fetch.calls.find((c) => c.path === "/v1/im/contact-requests").json, { to_user_id: "u-x", message: "I am X" });
      assert.match(view.text(), /已发出联系人请求/);
    } finally {
      view.cleanup();
    }
  }
});

test("朋友资料显示真实来源和共同群，更多菜单可星标和删除联系人", async () => {
  let profile = { ...person("u-x", "朋友", "contact"), contact_source: "request", contact_created_at: "2026-10-01T00:00:00Z", mutual_group_count: 2, contact_starred: false };
  const im = { fetch: router(baseRoutes({
    "GET /v1/im/me": { profile: person("me", "我") },
    "GET /v1/im/profiles": () => ({ items: [profile] }),
    "PUT /v1/im/contacts/u-x/star": () => { profile = { ...profile, contact_starred: true }; return {}; },
    "DELETE /v1/im/contacts/u-x": () => { profile = { ...profile, relation: "none" }; return {}; },
  })) };
  const view = await mount(React.createElement(ProfileCard, { userId: "u-x", onClose() {}, onOpenConversation() {} }), im);
  try {
    const cardClass = view.q('[data-profile-card]').className;
    assert.match(cardClass, /right-4/);
    assert.match(cardClass, /h-fit/);
    assert.match(cardClass, /bottom-auto/);
    assert.doesNotMatch(cardClass, /bottom-4/, "desktop card must not stretch between top and bottom offsets");
    assert.match(view.q('[data-friend-info]').textContent, /共同群聊\s*2/);
    assert.match(view.q('[data-friend-info]').textContent, /联系人请求/);
    assert.equal(view.q('[data-profile-relation]'), null, "朋友资料不显示关系标签");
    assert.equal(view.q('[data-profile-original]'), null, "朋友资料不重复显示原名");
    assert.ok(view.q('[data-action="dm"]'), "联系人可发消息");
    assert.equal(view.q('[data-action="add-contact"]'), null, "联系人不显示添加入口");
    assert.equal(view.q('[data-field="user-remark"]'), null, "备注默认是紧凑显示行");
    await view.click(view.q('[data-action="edit-remark"]'));
    assert.ok(view.q('[data-field="user-remark"]'), "点编辑后才显示输入框");
    await view.click(view.q('[aria-label="更多"]'));
    await view.click(view.q('[data-action="star-contact"]'));
    assert.ok(view.q('[data-friend-star]'));
    await view.click(view.q('[aria-label="更多"]'));
    await view.click(view.q('[data-action="delete-contact"]'));
    assert.ok(!im.fetch.calls.some((c) => c.method === "DELETE"));
    await view.click(view.qa('button').find((b) => b.textContent === "取消"));
    assert.ok(view.q('[data-friend-info]'));
    await view.click(view.q('[aria-label="更多"]'));
    await view.click(view.q('[data-action="delete-contact"]'));
    await view.click(view.qa('button').find((b) => b.textContent === "删除"));
    assert.equal(view.q('[data-friend-info]'), null);
    assert.ok(view.q('[data-action="add-contact"]'));
  } finally { view.cleanup(); }
});

test("资料卡：能私聊时直接打开会话；联系人不再显示「加联系人」；可以拉黑", async () => {
  const opened = [];
  const im = {
    fetch: router(baseRoutes({
      "GET /v1/im/me": { profile: person("me", "我") },
      "GET /v1/im/profiles": { items: [person("u-x", "路人 X", "contact")] },
      "POST /v1/im/conversations/dm": { conversation: { id: "dm-x" } },
      "POST /v1/im/blocks": {},
    })),
  };
  const view = await mount(React.createElement(ProfileCard, { userId: "u-x", onClose() {}, onOpenConversation: (id) => opened.push(id) }), im);
  try {
    assert.equal(view.q('[data-action="add-contact"]'), null);
    await view.click(view.q('[aria-label="更多"]'));
    await view.click(view.q('[data-action="block"]'));
    assert.deepEqual(im.fetch.calls.find((c) => c.path === "/v1/im/blocks" && c.method === "POST").json, { user_id: "u-x" });
    await view.click(view.q('[data-action="dm"]'));
    assert.deepEqual(opened, ["dm-x"]);
  } finally {
    view.cleanup();
  }
});

test("从团队批量添加：各队全选，重复的人只数一次，结果显示新增和跳过", async () => {
  const teams = [
    { org_id: "design", name: "Design", members: [person("b", "Bob"), person("c", "Carol")] },
    { org_id: "build", name: "Build", members: [person("c", "Carol"), person("d", "Dana")] },
  ];
  const im = { fetch: router(baseRoutes({
    "GET /v1/im/contacts/teams": { items: teams },
    "POST /v1/im/contacts/teams": ({ json }) => ({ added: json.user_ids.filter((id) => id !== "c").map((user_id) => ({ user_id, org_id: "design", team_name: "Design" })), skipped: ["c"] }),
  })) };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation() {} }), im);
  try {
    await view.click(view.q('[data-leochat-plus]'));
    await view.click(view.q('[data-leochat-action="add-contact"]'));
    assert.match(view.q("[data-team-contacts]").textContent, /来自我的团队/);
    assert.equal(view.q('[data-action="add-team-contacts"]').disabled, true);
    await view.click(view.q('[data-select-team="design"]'));
    await view.click(view.q('[data-select-team="build"]'));
    assert.equal(view.q('[data-action="add-team-contacts"]').textContent, "添加 3 人");
    await view.click(view.q('[data-team-member="d"]'));
    assert.equal(view.q('[data-action="add-team-contacts"]').textContent, "添加 2 人");
    await view.click(view.q('[data-action="add-team-contacts"]'));
    const post = im.fetch.calls.find((c) => c.method === "POST" && c.path === "/v1/im/contacts/teams");
    assert.deepEqual(post.json, { user_ids: ["b", "c"] });
    assert.match(view.q("[data-team-contacts]").textContent, /已添加 1 人，跳过 1 位已有好友/);
  } finally { view.cleanup(); }
});

test("第四次好友请求显示本地时间，已发送后仍可更正留言再次请求", async () => {
  let count = 0;
  const retryAt = "2026-11-25T12:34:56Z";
  const im = { fetch: router(baseRoutes({
    "GET /v1/im/me": { profile: person("me", "Me") },
    "GET /v1/im/profiles": { items: [person("x", "X", "member")] },
    "POST /v1/im/contact-requests": () => {
      if (++count === 4) throw Object.assign(apiError(429, "request_limit", "server fallback"), { retry_at: retryAt });
      return {};
    },
  })) };
  const view = await mount(React.createElement(ProfileCard, { userId: "x", onClose() {}, onOpenConversation() {} }), im);
  try {
    for (let i = 0; i < 4; i++) {
      await view.type(view.q("[data-request-message]"), "note " + i);
      await view.click(view.q('[data-action="add-contact"]'));
    }
    assert.equal(view.q("[data-profile-note]").textContent, `7 天内最多向同一个人发送 3 次请求。可在 ${new Date(retryAt).toLocaleString()} 后重试。`);
    assert.equal(view.q("[data-request-message]").value, "note 3");
  } finally { view.cleanup(); }
});

test("新朋友只数未答复的好友申请，发出的拒绝仍显示已发送", async () => {
  const incoming = ["pending", "accepted", "declined"].map((status, i) => ({ id: "in" + i, from: person("other" + i, "Other"), to: person("me", "Me"), status, message: "note" }));
  const outgoing = [{ id: "out", from: person("me", "Me"), to: person("sent", "Sent"), status: "declined", message: "hello" }];
  const im = { fetch: router(baseRoutes({
    "GET /v1/im/contact-requests": ({ path }) => ({ items: path.includes("box=in") ? incoming : outgoing }),
    "GET /v1/im/group-invites": { items: [{ id: "g", conversation: { id: "g", title: "G", member_count: 3 }, inviter: person("i", "I") }] },
  })) };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation() {} }), im);
  try {
    assert.equal(view.q("[data-new-friends-entry]").querySelector("span.rounded-full").textContent, "1");
    await view.click(view.q("[data-new-friends-entry]"));
    assert.match(view.q('[data-section="incoming"]').textContent, /同意/);
    assert.match(view.q('[data-section="incoming"]').textContent, /note/);
    assert.match(view.q('[data-section="outgoing"]').textContent, /已发送/);
    assert.doesNotMatch(view.q('[data-section="outgoing"]').textContent, /已拒绝/);
  } finally { view.cleanup(); }
});

test("团队添加失败保留选择并显示原因，群组点击打开会话", async () => {
  const opened = [];
  const im = { fetch: router(baseRoutes({
    "GET /v1/im/contacts/groups": { items: [{ id: "unsaved", kind: "group", title: "Unsaved", member_count: 2 }] },
    "GET /v1/im/contacts/teams": { items: [{ org_id: "t", name: "T", members: [person("b", "Bob")] }] },
    "POST /v1/im/contacts/teams": () => { throw apiError(503, "not_available", "Please try again later"); },
  })) };
  const view = await mount(React.createElement(PeopleView, { onOpenConversation: (id) => opened.push(id) }), im);
  try {
    await view.click(view.q('[data-saved-group="unsaved"] button'));
    assert.deepEqual(opened, ["unsaved"]);
    await view.click(view.q('[data-leochat-plus]'));
    await view.click(view.q('[data-leochat-action="add-contact"]'));
    await view.click(view.q('[data-team-member="b"]'));
    await view.click(view.q('[data-action="add-team-contacts"]'));
    assert.match(view.q("[data-team-contacts]").textContent, /Please try again later/);
    assert.equal(view.q('[data-team-member="b"]').checked, true);
  } finally { view.cleanup(); }
});

test("工作联系人看不到完整资料时，仍可发好友请求且不显示在线状态", async () => {
  const im = { fetch: router(baseRoutes({
    "GET /v1/im/me": { profile: person("me", "Me") },
    "GET /v1/im/profiles": { items: [] },
    "POST /v1/im/contact-requests": {},
  })) };
  const view = await mount(React.createElement(ProfileCard, { userId: "work-person", onClose() {}, onOpenConversation() {} }), im);
  try {
    assert.equal(view.q('[data-profile-presence]'), null);
    await view.type(view.q('[data-request-message]'), "From the order");
    await view.click(view.q('[data-action="add-contact"]'));
    assert.deepEqual(im.fetch.calls.find((c) => c.path === "/v1/im/contact-requests").json, { to_user_id: "work-person", message: "From the order" });
    assert.match(view.q('[data-profile-note]').textContent, /等对方同意/);
  } finally { view.cleanup(); }
});
