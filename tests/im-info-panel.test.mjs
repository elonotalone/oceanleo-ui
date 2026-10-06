// W10 判据：会话信息面板按角色显示按钮（owner / admin / member 三套）、成员行上的操作、
// 加成员的 added / pending / refused 汇总、退出与解散的二次确认、后端拒绝时显示后端给的原因；
// Team 群 / 项目群不能手动拉人移人；私聊只有隐藏与资料。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/im-info-panel.test.mjs
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

const uploadStub = dataModule(`
  export class UploadError extends Error { constructor(code) { super(code); this.code = code; } }
  export async function uploadAttachment(file, options) { return globalThis.__UPLOAD(file, options); }
`);
const { UploadError } = await import(uploadStub);

const STUBS = {
  "../../../i18n/ui/useUI": uiHookStub,
  "../../../ui": uiPrimitivesStub,
  "../../../lib/im/client": imClientStub,
  "../realtime/hooks": imHooksStub,
  "../report/ReportDialog": nullComponentStub("ReportDialog"),
  // W09 的上传（init → 直传 → finalize）：这里只验证头像走它，结果用 globalThis.__UPLOAD 给。
  "../composer/upload": uploadStub,
};

const { ConversationInfoPanel } = await import(await compileModule("src/shell/messages/groups/ConversationInfoPanel.tsx", STUBS));
const { conversationCaps, memberActionsFor } = await import(await compileModule("src/lib/im/groups-api.ts", STUBS));

const profile = (id, name) => ({ user_id: id, display_name: name, avatar_url: null });
const member = (id, name, role, external = false) => ({ user_id: id, role, external, joined_at: "2026-10-01T00:00:00Z", profile: profile(id, name) });

function detailFor(myRole, over = {}) {
  return {
    id: "c1", kind: "group", title: "设计组", avatar_url: null, peer: null, member_count: 4,
    last_message: null, last_activity_at: "2026-10-05T00:00:00Z", unread_count: 0, mention_count: 0,
    muted: false, notify_level: "all", org_id: null, project_id: null, has_external: true, my_role: myRole, dissolved: false,
    description: "做设计的人", owner_id: "u-owner", join_approval: false, members_can_add: true, leo_enabled: true,
    members: [member("u-owner", "群主甲", "owner"), member("u-admin", "管理乙", "admin"), member("u-mem1", "成员丙", "member"), member("u-ext", "外人丁", "member", true)],
    pinned_count: 0, pending_join_requests: 0, created_at: "2026-10-01T00:00:00Z", ...over,
  };
}

const ME = { owner: "u-owner", admin: "u-admin", member: "u-mem1" };

function routes(role, over = {}, extra = {}) {
  return {
    "GET /v1/im/me": { profile: profile(ME[role] ?? "u-me", "我") },
    "GET /v1/im/conversations/c1": detailFor(role, over),
    "GET /v1/im/conversations/c1/join-requests": { items: [] },
    "GET /v1/im/directory": { items: [{ ...profile("u-new", "新人"), relation: "contact" }, { ...profile("u-far", "远人"), relation: "member" }] },
    "GET /v1/im/blocks": { items: [] },
    "GET /v1/im/profiles": { items: [] },
    ...extra,
  };
}

async function open(role, over, extra, handlers = {}) {
  const im = { fetch: router(routes(role, over, extra)) };
  const view = await mount(React.createElement(ConversationInfoPanel, { conversationId: "c1", onClose: handlers.onClose ?? (() => {}), onOpenConversation() {} }), im);
  return { view, im };
}

const actions = (view) => new Set(view.qa("[data-action]").map((b) => b.getAttribute("data-action")));
const rowActions = (view, id) => new Set(view.qa(`[data-member="${id}"] [data-action]`).map((b) => b.getAttribute("data-action")));

test("规则函数：角色 → 能做什么（§9.3 / §9.4）", () => {
  const g = (my_role, over = {}) => ({ kind: "group", my_role, members_can_add: true, dissolved: false, member_count: 4, ...over });
  const owner = conversationCaps(g("owner"));
  assert.deepEqual([owner.canEditSettings, owner.canAddMembers, owner.canDissolve, owner.canUpgradeToTeam, owner.canLeave, owner.leaveNeedsTransfer], [true, true, true, true, false, true]);
  assert.equal(conversationCaps(g("owner", { member_count: 1 })).canLeave, true, "只剩自己时可以退出");
  const admin = conversationCaps(g("admin"));
  assert.deepEqual([admin.canEditSettings, admin.canAddMembers, admin.canApproveJoins, admin.canManageInviteLinks, admin.canDissolve, admin.canUpgradeToTeam, admin.canLeave], [true, true, true, true, false, false, true]);
  const mem = conversationCaps(g("member"));
  assert.deepEqual([mem.canEditSettings, mem.canAddMembers, mem.canApproveJoins, mem.canManageInviteLinks, mem.canDissolve, mem.canLeave], [false, true, false, false, false, true]);
  assert.equal(conversationCaps(g("member", { members_can_add: false })).canAddMembers, false, "成员不能拉人时只有 owner/admin 能拉");
  assert.equal(conversationCaps(g("admin", { members_can_add: false })).canAddMembers, true);
  const team = conversationCaps({ ...g("owner"), kind: "team" });
  assert.deepEqual([team.canAddMembers, team.canDissolve, team.canLeave, team.canUpgradeToTeam, team.canEditSettings], [false, false, false, false, true]);
  assert.equal(conversationCaps(g("owner", { dissolved: true })).canEditSettings, false, "解散后只读");

  const t = (user_id, role) => ({ user_id, role });
  assert.deepEqual(memberActionsFor(g("owner"), t("x", "member"), "me"), { canSetAdmin: true, canRevokeAdmin: false, canTransfer: true, canRemove: true });
  assert.deepEqual(memberActionsFor(g("owner"), t("x", "admin"), "me"), { canSetAdmin: false, canRevokeAdmin: true, canTransfer: true, canRemove: true });
  assert.deepEqual(memberActionsFor(g("admin"), t("x", "member"), "me"), { canSetAdmin: false, canRevokeAdmin: false, canTransfer: false, canRemove: true });
  assert.equal(memberActionsFor(g("admin"), t("x", "admin"), "me").canRemove, false, "移出管理员只有 owner 能做");
  assert.equal(memberActionsFor(g("admin"), t("x", "owner"), "me").canRemove, false);
  assert.equal(memberActionsFor(g("member"), t("x", "member"), "me").canRemove, false);
  assert.equal(memberActionsFor(g("owner"), t("me", "owner"), "me").canRemove, false, "自己没有成员操作");
});

test("owner：改资料、加人、邀请链接、升级成 Team、解散；成员行有设/撤管理员、转让、移出；退出要先转让", async () => {
  const { view } = await open("owner", { join_approval: true });
  try {
    assert.equal(view.q("[data-info-panel]").getAttribute("data-my-role"), "owner");
    const a = actions(view);
    for (const x of ["save-profile", "add-members", "invite-link", "upgrade-team", "dissolve", "report"]) assert.ok(a.has(x), "owner 应有 " + x);
    assert.ok(!a.has("leave"), "owner 退出前必须先转让");
    assert.ok(view.q("[data-leave-hint]"));
    assert.ok(view.q('[data-group-settings="editable"]'));
    assert.equal(view.qa('[role="switch"]').length, 3, "入群审批、成员能否拉人、leo 三个开关");
    assert.deepEqual([...rowActions(view, "u-mem1")].sort(), ["remove", "set-admin", "transfer"]);
    assert.deepEqual([...rowActions(view, "u-admin")].sort(), ["remove", "revoke-admin", "transfer"]);
    assert.deepEqual([...rowActions(view, "u-owner")], [], "自己那一行没有操作");
    assert.match(view.text(), /入群申请/, "开了入群审批时，入群申请一栏在");
  } finally {
    view.cleanup();
  }
});

test("admin：能改资料、拉人、批准入群、管邀请链接、移出普通成员；不能设管理员、转让、解散、升级、移出别的管理员", async () => {
  const { view } = await open("admin");
  try {
    const a = actions(view);
    for (const x of ["save-profile", "add-members", "invite-link", "leave", "report"]) assert.ok(a.has(x), "admin 应有 " + x);
    for (const x of ["dissolve", "upgrade-team"]) assert.ok(!a.has(x), "admin 不应有 " + x);
    assert.deepEqual([...rowActions(view, "u-mem1")], ["remove"]);
    assert.deepEqual([...rowActions(view, "u-ext")], ["remove"]);
    assert.deepEqual([...rowActions(view, "u-owner")], []);
    assert.deepEqual([...rowActions(view, "u-admin")], [], "自己");
    assert.ok(!a.has("set-admin") && !a.has("transfer") && !a.has("revoke-admin"));
  } finally {
    view.cleanup();
  }
});

test("member：只读群资料、没有成员操作；成员能拉人时有「加成员」，关掉后就没有；能退出和举报", async () => {
  {
    const { view } = await open("member");
    try {
      const a = actions(view);
      assert.ok(view.q('[data-group-settings="readonly"]'));
      assert.equal(view.qa('[role="switch"]').length, 0);
      for (const x of ["save-profile", "invite-link", "dissolve", "upgrade-team", "remove", "set-admin", "transfer"]) assert.ok(!a.has(x), "member 不应有 " + x);
      for (const x of ["add-members", "leave", "report"]) assert.ok(a.has(x), "member 应有 " + x);
    } finally {
      view.cleanup();
    }
  }
  {
    const { view } = await open("member", { members_can_add: false });
    try {
      assert.ok(!actions(view).has("add-members"));
    } finally {
      view.cleanup();
    }
  }
});

test("成员列表：角色、「外部」标记；leo（AI）在列表里", async () => {
  const { view } = await open("member");
  try {
    assert.equal(view.q('[data-member="u-owner"] [data-role-badge]').textContent, "群主");
    assert.equal(view.q('[data-member="u-admin"] [data-role-badge]').textContent, "管理员");
    assert.equal(view.q('[data-member="u-mem1"] [data-role-badge]'), null);
    assert.ok(view.q('[data-member="u-ext"] [data-external-badge]'));
    assert.equal(view.q('[data-member="u-mem1"] [data-external-badge]'), null);
    assert.match(view.q("[data-leo-row]").textContent, /leo（AI）/);
  } finally {
    view.cleanup();
  }
});

test("Team 群：不能手动拉人或移人，提示跟 Team 同步；私聊：只有隐藏与资料", async () => {
  {
    const { view } = await open("owner", { kind: "team", org_id: "org1", owner_id: null });
    try {
      const a = actions(view);
      for (const x of ["add-members", "remove", "set-admin", "transfer", "dissolve", "leave", "upgrade-team", "invite-link"]) assert.ok(!a.has(x), "Team 群不应有 " + x);
      assert.ok(view.q("[data-synced-hint]"));
    } finally {
      view.cleanup();
    }
  }
  {
    const { view } = await open("member", { kind: "dm", title: "", peer: profile("u-peer", "对方"), member_count: 2, members: [] });
    try {
      const a = actions(view);
      assert.ok(a.has("hide") && a.has("open-peer"));
      assert.ok(!a.has("add-members") && !a.has("leave") && !a.has("dissolve"));
      assert.equal(view.q("[data-info-title]").textContent, "对方");
    } finally {
      view.cleanup();
    }
  }
});

test("操作：设管理员、移出（二次确认）、后端拒绝时显示后端给的原因", async () => {
  const { view, im } = await open("owner", {}, {
    "PATCH /v1/im/conversations/c1/members/u-mem1": {},
    "DELETE /v1/im/conversations/c1/members/u-ext": () => { throw apiError(403, "not_allowed", "只有群主能移出管理员"); },
  });
  try {
    await view.click(view.q('[data-member="u-mem1"] [data-action="set-admin"]'));
    const patch = im.fetch.calls.find((c) => c.method === "PATCH");
    assert.equal(patch.path, "/v1/im/conversations/c1/members/u-mem1");
    assert.deepEqual(patch.json, { role: "admin" });

    await view.click(view.q('[data-member="u-ext"] [data-action="remove"]'));
    assert.ok(view.q("[data-confirm]"), "移出要二次确认");
    assert.ok(!im.fetch.calls.some((c) => c.method === "DELETE"), "确认前不发请求");
    await view.click(view.q("[data-confirm-ok]"));
    assert.ok(im.fetch.calls.some((c) => c.method === "DELETE" && c.path.endsWith("/members/u-ext")));
    assert.match(view.q("[data-member-note]").textContent, /只有群主能移出管理员/);
  } finally {
    view.cleanup();
  }
});

test("加成员：选人后拉进群，显示 已加入 / 等待同意 / 没能加入", async () => {
  const { view, im } = await open("member", {}, {
    "POST /v1/im/conversations/c1/members": { added: ["u-new"], pending: ["u-far"], refused: [{ user_id: "u-bad", code: "blocked" }] },
  });
  try {
    await view.click(view.q('[data-action="add-members"]'));
    assert.ok(view.q("[data-add-members]"));
    await view.click(view.q('[data-candidate="u-new"]'));
    await view.click(view.q('[data-candidate="u-far"]'));
    await view.click(view.q('[data-action="confirm-add"]'));
    const post = im.fetch.calls.find((c) => c.method === "POST");
    assert.deepEqual(post.json, { user_ids: ["u-new", "u-far"] });
    assert.equal(view.q("[data-add-note]").textContent, "已加入 1 人，1 人等待同意，1 人没能加入");
  } finally {
    view.cleanup();
  }
});

test("退出与解散：都要二次确认，成功后关闭面板", async () => {
  let closed = 0;
  {
    const { view, im } = await open("member", {}, { "DELETE /v1/im/conversations/c1/members/u-mem1": {} }, { onClose: () => (closed += 1) });
    try {
      await view.click(view.q('[data-action="leave"]'));
      await view.click(view.q("[data-confirm-ok]"));
      assert.ok(im.fetch.calls.some((c) => c.method === "DELETE" && c.path === "/v1/im/conversations/c1/members/u-mem1"), "自己 = 退出");
    } finally {
      view.cleanup();
    }
  }
  {
    const { view, im } = await open("owner", {}, { "DELETE /v1/im/conversations/c1": {} }, { onClose: () => (closed += 1) });
    try {
      await view.click(view.q('[data-action="dissolve"]'));
      assert.ok(!im.fetch.calls.some((c) => c.method === "DELETE"));
      await view.click(view.q("[data-confirm-ok]"));
      assert.ok(im.fetch.calls.some((c) => c.method === "DELETE" && c.path === "/v1/im/conversations/c1"));
    } finally {
      view.cleanup();
    }
  }
  assert.equal(closed, 2);
});

test("换头像：走 W09 的上传，拿到地址后写进群资料；上传失败显示原因，不改群资料", async () => {
  const pick = async (view, file) => {
    const input = view.q('[data-field="avatar-file"]');
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new window.Event("change", { bubbles: true })); });
    await settle();
  };
  const file = { name: "a.png", size: 1000, type: "image/png" };
  {
    const seen = [];
    globalThis.__UPLOAD = async (f, options) => { seen.push([f.name, options.kind]); return { kind: "image", url: "https://cdn.example/a.png", name: f.name, size: 1000, mime: "image/png" }; };
    const { view, im } = await open("admin", {}, { "PATCH /v1/im/conversations/c1": {} });
    try {
      assert.equal(view.q('[data-action="upload-avatar"]').disabled, false);
      await pick(view, file);
      assert.deepEqual(seen, [["a.png", "image"]]);
      const patch = im.fetch.calls.find((c) => c.method === "PATCH");
      assert.deepEqual(patch.json, { avatar_url: "https://cdn.example/a.png" });
    } finally {
      view.cleanup();
    }
  }
  {
    globalThis.__UPLOAD = async () => { throw new UploadError("too_large"); };
    const { view, im } = await open("admin", {}, { "PATCH /v1/im/conversations/c1": {} });
    try {
      await pick(view, file);
      assert.match(view.q("[data-settings-note]").textContent, /图片太大了/);
      assert.ok(!im.fetch.calls.some((c) => c.method === "PATCH"), "上传失败不改群资料");
    } finally {
      view.cleanup();
    }
  }
  {
    const { view } = await open("member");
    try {
      assert.equal(view.q('[data-action="upload-avatar"]'), null, "普通成员不能换群头像");
    } finally {
      view.cleanup();
    }
  }
});
