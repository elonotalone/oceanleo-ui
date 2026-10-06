// F02 判据：Team 群里直接邀请同事。Team 管理员（org 里的 owner / admin）看到「邀请同事加入 Team」，
// 点开生成 Team 邀请链接 + 二维码 + 一键复制；不是管理员看到「请 Team 管理员邀请」和一个能点的「打开 Team 页面」；
// 项目群给能点的「打开项目」；createInvite 报 403 / 404 / 429 / 其他都有人话提示，不崩。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/im-team-invite.test.mjs
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
const { createRoot } = await import("react-dom/client");

const reactUrl = pathToFileURL(require.resolve("react")).href;

const uiHookStub = dataModule(`
  const tt = (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  export function useUI() { return tt; }
`);

const imHooksStub = dataModule(`
  export function useImEvent() {}
  export function usePresence() { return {}; }
`);
const orgApiStub = dataModule(`
  export async function listMyOrgs() { return globalThis.__ORG.list(); }
  export async function createInvite(orgId) { return globalThis.__ORG.create(orgId); }
`);
const nullComponentStub = (name) => dataModule(`export function ${name}() { return null; }`);

const uiPrimitivesStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  const h = React.createElement;
  export function Modal({ children }) { return h("div", { role: "dialog", "data-modal": "" }, children); }
  export function ConfirmDialog() { return null; }
  export function Switch({ checked, onChange, disabled, label }) {
    return h("button", { type: "button", role: "switch", "aria-checked": checked, "aria-label": label, disabled, onClick: () => onChange(!checked) });
  }
`);
const imClientStub = dataModule(`
  export class ImApiError extends Error {}
  export async function imFetch(path, init = {}) { return globalThis.__IM.fetch(path, init); }
`);
// 本家门户固定为 https://oceanleo.com（不依赖运行环境的域名配置）。
const domainFamilyStub = dataModule(`
  export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
  export function portalHref(path) { return globalThis.__RELATIVE_PORTAL ? path : "https://oceanleo.com" + path; }
`);

function apiError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

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

async function settle(times = 10) {
  for (let i = 0; i < times; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}

async function mount(element, im = { fetch: router({}) }) {
  globalThis.__IM = { fetch: im.fetch };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  await settle();
  return {
    host,
    text: () => host.textContent || "",
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    async click(node) {
      assert.ok(node, "要点的元素不存在");
      await act(async () => { node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
      await settle();
    },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

const STUBS = {
  "../../../i18n/ui/useUI": uiHookStub,
  "../../../ui": uiPrimitivesStub,
  "../../../contracts/domain-family": domainFamilyStub,
  "../../../lib/org-api": orgApiStub,
  "../../../lib/im/client": imClientStub,
  "./client": imClientStub,
  "../realtime/hooks": imHooksStub,
  "../report/ReportDialog": nullComponentStub("ReportDialog"),
};

// 剪贴板：记下被复制的文字。
Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (text) => { globalThis.__COPIED = text; } },
});

const { ConversationInfoPanel } = await import(await compileModule("src/shell/messages/groups/ConversationInfoPanel.tsx", STUBS));
const { TeamInviteDialog, teamInviteUrlOf, teamInviteErrorText } = await import(await compileModule("src/shell/messages/groups/TeamInviteDialog.tsx", STUBS));
const { UpgradeToTeamDialog } = await import(await compileModule("src/shell/messages/groups/UpgradeToTeamDialog.tsx", STUBS));

const profile = (id, name) => ({ user_id: id, display_name: name, avatar_url: null });
const member = (id, name, role) => ({ user_id: id, role, external: false, joined_at: "2026-10-01T00:00:00Z", profile: profile(id, name) });

function detailFor(over = {}) {
  return {
    id: "c1", kind: "team", title: "设计 Team", avatar_url: null, peer: null, member_count: 3,
    last_message: null, last_activity_at: "2026-10-05T00:00:00Z", unread_count: 0, mention_count: 0,
    muted: false, notify_level: "all", org_id: "org1", project_id: null, has_external: false, my_role: "member", dissolved: false,
    description: "", owner_id: null, join_approval: false, members_can_add: false, leo_enabled: true,
    members: [member("u-1", "甲", "owner"), member("u-2", "乙", "member")],
    pinned_count: 0, pending_join_requests: 0, created_at: "2026-10-01T00:00:00Z", ...over,
  };
}

function setOrg({ list, create }) {
  globalThis.__COPIED = null;
  globalThis.__RELATIVE_PORTAL = false;
  globalThis.__ORG = { list: list ?? (async () => []), create: create ?? (async () => ({ url: "", code: "", expiresAt: "" })), createCalls: [] };
  const original = globalThis.__ORG.create;
  globalThis.__ORG.create = async (orgId) => { globalThis.__ORG.createCalls.push(orgId); return original(orgId); };
}

async function open(over = {}) {
  const im = {
    fetch: router({
      "GET /v1/im/me": { profile: profile("u-2", "乙") },
      "GET /v1/im/conversations/c1": detailFor(over),
    }),
  };
  const view = await mount(React.createElement(ConversationInfoPanel, { conversationId: "c1", onClose() {}, onOpenConversation() {} }), im);
  return view;
}

const actions = (view) => new Set(view.qa("[data-action]").map((b) => b.getAttribute("data-action")));
const org = (role) => async () => [{ id: "org1", name: "设计 Team", role }, { id: "org-other", name: "别家", role: "owner" }];

test("Team 管理员 / 所有者：看到「邀请同事加入 Team」，没有「请 Team 管理员邀请」", async () => {
  for (const role of ["admin", "owner"]) {
    setOrg({ list: org(role) });
    const view = await open();
    try {
      const btn = view.q('[data-action="invite-team"]');
      assert.ok(btn, role + " 应有邀请按钮");
      assert.equal(btn.textContent, "邀请同事加入 Team");
      assert.ok(btn.className.includes("min-h-11"), "点击区域不小于 44px");
      assert.equal(view.q("[data-team-invite-hint]"), null);
      assert.ok(!actions(view).has("open-team-page"));
      assert.ok(view.q("[data-synced-hint]"), "仍提示跟 Team 同步");
    } finally {
      view.cleanup();
    }
  }
});

test("别的 Team 的管理员不算：只在「这个」Team 里是 owner / admin 才出按钮", async () => {
  setOrg({ list: async () => [{ id: "org-other", name: "别家", role: "owner" }, { id: "org1", name: "设计 Team", role: "member" }] });
  const view = await open();
  try {
    assert.equal(view.q('[data-action="invite-team"]'), null);
    assert.ok(view.q("[data-team-invite-hint]"));
  } finally {
    view.cleanup();
  }
});

test("Team 普通成员：看到「请 Team 管理员邀请」和能点的「打开 Team 页面」（门户地址、新开页）", async () => {
  setOrg({ list: org("member") });
  const view = await open();
  try {
    assert.equal(view.q('[data-action="invite-team"]'), null);
    const hint = view.q("[data-team-invite-hint]");
    assert.ok(hint);
    assert.ok(hint.textContent.includes("请 Team 管理员邀请"));
    const a = view.q('a[data-action="open-team-page"]');
    assert.ok(a, "要有一个真的链接");
    assert.equal(a.textContent, "打开 Team 页面");
    assert.equal(a.getAttribute("href"), "https://oceanleo.com/org?org=org1");
    assert.equal(a.getAttribute("target"), "_blank");
    assert.match(a.getAttribute("rel"), /noopener/);
    assert.ok(a.className.includes("min-h-11"));
    assert.ok(!view.text().includes("要加人，请到 Team 页面"), "不再只有一行没法点的灰字");
  } finally {
    view.cleanup();
  }
});

test("拿不到我的 Team 列表（接口挂了）：按非管理员显示，链接仍能点，不崩", async () => {
  setOrg({ list: async () => { throw new Error("offline"); } });
  const view = await open();
  try {
    assert.equal(view.q('[data-action="invite-team"]'), null);
    assert.ok(view.q('a[data-action="open-team-page"]'));
  } finally {
    view.cleanup();
  }
});

test("Team 群没给 org_id：也给「打开 Team 页面」（不带 org 参数），不调 listMyOrgs", async () => {
  let listed = 0;
  setOrg({ list: async () => { listed += 1; return []; } });
  const view = await open({ org_id: null });
  try {
    assert.equal(view.q('[data-action="invite-team"]'), null);
    assert.equal(view.q('a[data-action="open-team-page"]').getAttribute("href"), "https://oceanleo.com/org");
    assert.equal(listed, 0);
  } finally {
    view.cleanup();
  }
});

test("门户同源（portalHref 给相对路径）时「打开 Team 页面」也是能点的相对链接", async () => {
  setOrg({ list: org("member") });
  globalThis.__RELATIVE_PORTAL = true;
  const view = await open();
  try {
    assert.equal(view.q('a[data-action="open-team-page"]').getAttribute("href"), "/org?org=org1");
  } finally {
    globalThis.__RELATIVE_PORTAL = false;
    view.cleanup();
  }
});

test("项目群：有能点的「打开项目」（带项目号，没有项目号就去项目列表），不出 Team 邀请", async () => {
  setOrg({ list: org("owner") });
  {
    const view = await open({ kind: "project", org_id: null, project_id: "p 1" });
    try {
      const a = view.q('a[data-action="open-project"]');
      assert.ok(a);
      assert.equal(a.textContent, "打开项目");
      assert.equal(a.getAttribute("href"), "https://oceanleo.com/projects/p%201");
      assert.equal(a.getAttribute("target"), "_blank");
      assert.match(a.getAttribute("rel"), /noopener/);
      assert.equal(view.q('[data-action="invite-team"]'), null);
      assert.equal(view.q('[data-action="open-team-page"]'), null);
      assert.ok(view.q("[data-synced-hint]"));
    } finally {
      view.cleanup();
    }
  }
  {
    const view = await open({ kind: "project", org_id: null, project_id: null });
    try {
      assert.equal(view.q('a[data-action="open-project"]').getAttribute("href"), "https://oceanleo.com/projects");
    } finally {
      view.cleanup();
    }
  }
});

test("手建的群没有这些入口（成员可手动拉人）", async () => {
  setOrg({ list: org("owner") });
  const view = await open({ kind: "group", my_role: "owner", org_id: null });
  try {
    const a = actions(view);
    for (const x of ["invite-team", "open-team-page", "open-project"]) assert.ok(!a.has(x), x);
  } finally {
    view.cleanup();
  }
});

test("点「邀请同事加入 Team」→ 生成：调 createInvite(org_id)，显示链接、二维码、已复制", async () => {
  setOrg({
    list: org("admin"),
    create: async () => ({ url: "https://oceanleo.com/join?code=tc9", code: "tc9", expiresAt: "2026-10-13T00:00:00Z" }),
  });
  const view = await open();
  try {
    await view.click(view.q('[data-action="invite-team"]'));
    assert.ok(view.q("[data-team-invite-dialog]"));
    assert.equal(view.q("[data-team-invite-result]"), null, "没点生成前不建邀请");
    assert.deepEqual(globalThis.__ORG.createCalls, []);
    await view.click(view.q('[data-action="generate-team-invite"]'));
    assert.deepEqual(globalThis.__ORG.createCalls, ["org1"]);
    assert.equal(view.q("[data-team-invite-url]").value, "https://oceanleo.com/join?code=tc9");
    assert.equal(globalThis.__COPIED, "https://oceanleo.com/join?code=tc9", "生成后已复制");
    assert.ok(view.q("[data-team-invite-note]").textContent.includes("链接已复制"));
    assert.match(view.q("[data-team-invite-qr] img[data-invite-qr]").getAttribute("src"), /^data:image\/png;base64,/);
    assert.equal(view.q('[data-team-invite-qr] a[data-action="download-qr"]').getAttribute("download"), "邀请二维码-加入-Team.png");
    assert.ok(view.q("[data-team-invite-result]").textContent.includes("有效期至"));
    globalThis.__COPIED = null;
    await view.click(view.q('[data-action="copy-team-invite"]'));
    assert.equal(globalThis.__COPIED, "https://oceanleo.com/join?code=tc9", "复制按钮再复制一次");
  } finally {
    view.cleanup();
  }
});

test("服务端只给 code 没给完整 url：按门户 /join 页拼（不用 inviteUrlFor），同源时补成绝对地址", async () => {
  assert.equal(teamInviteUrlOf("https://oceanleo.com/join?code=a", "a"), "https://oceanleo.com/join?code=a");
  assert.equal(teamInviteUrlOf("", "a b"), "https://oceanleo.com/join?code=a%20b");
  assert.equal(teamInviteUrlOf("http://insecure.example.com/join?code=a", "a"), "https://oceanleo.com/join?code=a", "非 https 的 url 不信，重拼");
  assert.equal(teamInviteUrlOf("/join?code=a", "a"), "https://oceanleo.com/join?code=a", "相对地址不信，重拼");
  assert.equal(teamInviteUrlOf("", ""), "");
  globalThis.__RELATIVE_PORTAL = true;
  try {
    assert.equal(teamInviteUrlOf("", "zz"), "https://oceanleo.com/join?code=zz", "相对路径补上当前站点 origin（它就是门户）");
  } finally {
    globalThis.__RELATIVE_PORTAL = false;
  }
  // 整条流程：服务端只给 code
  setOrg({ list: org("owner"), create: async () => ({ url: "", code: "only9", expiresAt: "" }) });
  const view = await open();
  try {
    await view.click(view.q('[data-action="invite-team"]'));
    await view.click(view.q('[data-action="generate-team-invite"]'));
    assert.equal(view.q("[data-team-invite-url]").value, "https://oceanleo.com/join?code=only9");
    assert.ok(!view.text().includes("有效期至"), "没给过期时间就不显示");
  } finally {
    view.cleanup();
  }
});

test("createInvite 报错：403 / 404 / 429 / 其他各给人话提示，不显示链接，不崩，可重试", async () => {
  const cases = [
    [403, "你不是这个 Team 的管理员，不能邀请同事。"],
    [404, "找不到这个 Team，请刷新页面后再试。"],
    [429, "操作太频繁了，请稍后再试。"],
    [500, "没成功，请稍后再试。"],
    [undefined, "没成功，请稍后再试。"],
  ];
  for (const [status, text] of cases) {
    setOrg({ list: org("admin"), create: async () => { const e = new Error("org-api: x"); e.status = status; throw e; } });
    const view = await open();
    try {
      await view.click(view.q('[data-action="invite-team"]'));
      await view.click(view.q('[data-action="generate-team-invite"]'));
      const note = view.q("[data-team-invite-note]");
      assert.ok(note, "要有提示：" + status);
      assert.equal(note.textContent, text);
      assert.equal(note.getAttribute("role"), "alert");
      assert.equal(view.q("[data-team-invite-result]"), null);
      assert.ok(!view.text().includes("org-api"), "不把内部错误文本给人看");
      assert.equal(view.q('[data-action="generate-team-invite"]').disabled, false, "可以再试");
    } finally {
      view.cleanup();
    }
  }
  const tt = (s) => s;
  assert.equal(teamInviteErrorText(null, tt), "没成功，请稍后再试。");
  assert.equal(teamInviteErrorText({ status: 429 }, tt), "操作太频繁了，请稍后再试。");
});

test("TeamInviteDialog 单独用：服务端给了空 url 也没 code 时提示失败，不显示空链接", async () => {
  setOrg({ list: org("admin"), create: async () => ({ url: "", code: "", expiresAt: "" }) });
  const view = await mount(React.createElement(TeamInviteDialog, { orgId: "org1", teamName: "设计 Team", onClose() {} }));
  try {
    assert.ok(view.text().includes("设计 Team"));
    await view.click(view.q('[data-action="generate-team-invite"]'));
    assert.equal(view.q("[data-team-invite-result]"), null);
    assert.equal(view.q("[data-team-invite-note]").textContent, "没成功，请稍后再试。");
  } finally {
    view.cleanup();
  }
});

test("升级成 Team 成功后：「请到 Team 页面」变成能点的链接，指向这个新 Team", async () => {
  setOrg({ list: org("owner") });
  const im = { fetch: router({ "POST /v1/im/conversations/c1/upgrade-team": { org_id: "org-new" } }) };
  const view = await mount(React.createElement(UpgradeToTeamDialog, { conversationId: "c1", defaultName: "新 Team", onClose() {}, onDone() {} }), im);
  try {
    assert.equal(view.q('a[data-action="open-team-page"]'), null, "升级前没有");
    await view.click(view.q('[data-action="upgrade"]'));
    assert.ok(view.q("[data-upgrade-result]"));
    const a = view.q('a[data-action="open-team-page"]');
    assert.ok(a);
    assert.equal(a.getAttribute("href"), "https://oceanleo.com/org?org=org-new");
    assert.equal(a.getAttribute("target"), "_blank");
    assert.match(a.getAttribute("rel"), /noopener/);
  } finally {
    view.cleanup();
  }
});
