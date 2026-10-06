// W10 判据：邀请落地确认框——预览（谁邀请、进哪个群、群人数）、接受的三种结果（进群 / 成为联系人 / 已申请等同意）、
// 链接失效（预览 410/404、已过期、接受时才失效）、没登录先引导登录、已经是联系人 / 群成员。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/im-invite-accept.test.mjs
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
  "../../../lib/auth/client": dataModule(`export async function accessToken() { return globalThis.__TOKEN ?? null; }`),
  "../../../pages/AuthDialog": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function AuthDialog({ onSuccess }) {
      return React.createElement("div", { "data-auth-dialog": "" },
        React.createElement("button", { type: "button", "data-auth-ok": "", onClick: () => { globalThis.__TOKEN = "t"; onSuccess(); } }, "登录"));
    }
  `),
};

const { InviteAcceptDialog } = await import(await compileModule("src/shell/messages/invite/InviteAcceptDialog.tsx", STUBS));
const { inviteOutcomeOf } = await import(await compileModule("src/lib/im/people-api.ts", STUBS));

const inviter = { user_id: "u-inviter", display_name: "邀请人小林", avatar_url: null };
const contactPreview = (over = {}) => ({ code: "abc123XYZ789", kind: "contact", inviter, conversation: null, requires_approval: false, already: null, expired: false, ...over });
const groupPreview = (over = {}) => ({
  code: "abc123XYZ789", kind: "group", inviter, conversation: { id: "conv-1", title: "设计组", avatar_url: null, member_count: 7 },
  requires_approval: false, already: null, expired: false, ...over,
});

async function open(routes, { signedIn = true } = {}) {
  globalThis.__TOKEN = signedIn ? "t" : null;
  const done = [];
  let closed = 0;
  const im = { fetch: router(routes) };
  const view = await mount(
    React.createElement(InviteAcceptDialog, { code: "abc123XYZ789", onClose: () => (closed += 1), onDone: (r) => done.push(r) }),
    im,
  );
  return { view, im, done, closed: () => closed };
}

const PREVIEW = "GET /v1/im/invite-links/abc123XYZ789";
const ACCEPT = "POST /v1/im/invite-links/abc123XYZ789/accept";

test("inviteOutcomeOf：结果与失效的归一", () => {
  assert.equal(inviteOutcomeOf({ result: { status: "joined", conversation_id: "c" } }), "joined");
  assert.equal(inviteOutcomeOf({ result: { status: "contact" } }), "contact");
  assert.equal(inviteOutcomeOf({ result: { status: "pending" } }), "pending");
  assert.equal(inviteOutcomeOf({ error: { status: 410, code: "gone" } }), "gone");
  assert.equal(inviteOutcomeOf({ error: { status: 404, code: "not_found" } }), "gone");
  assert.equal(inviteOutcomeOf({ error: { status: 202, code: "need_consent" } }), "pending");
});

test("联系人邀请：预览显示谁邀请；接受 → 成为联系人，onDone 不带会话", async () => {
  const { view, im, done } = await open({ [PREVIEW]: contactPreview(), [ACCEPT]: { status: "contact" } });
  try {
    assert.match(view.text(), /邀请人小林/);
    assert.match(view.text(), /邀请你成为联系人/);
    await view.click(view.q('[data-action="accept"]'));
    assert.deepEqual(done, [{ conversationId: null }]);
    assert.ok(im.fetch.calls.some((c) => c.method === "POST" && c.path.endsWith("/accept")));
  } finally {
    view.cleanup();
  }
});

test("群邀请：预览显示群名、邀请人、人数；接受 → 进群，onDone 带会话 id", async () => {
  const { view, done } = await open({ [PREVIEW]: groupPreview(), [ACCEPT]: { status: "joined", conversation_id: "conv-1" } });
  try {
    assert.match(view.text(), /设计组/);
    assert.match(view.text(), /邀请人小林 邀请你加入 · 7 人/);
    assert.equal(view.q('[data-action="accept"]').textContent, "加入群聊");
    await view.click(view.q('[data-action="accept"]'));
    assert.deepEqual(done, [{ conversationId: "conv-1" }]);
  } finally {
    view.cleanup();
  }
});

test("需要审批的群：留言随申请发出；结果 pending（含 202 need_consent）显示「已申请，等群管理员同意」，不算进群", async () => {
  for (const reply of [{ status: "pending" }, () => { throw apiError(202, "need_consent", "已发出申请"); }]) {
    const { view, im, done } = await open({ [PREVIEW]: groupPreview({ requires_approval: true }), [ACCEPT]: reply });
    try {
      assert.equal(view.q('[data-action="accept"]').textContent, "申请加入");
      await view.type(view.q("input"), "我是小王");
      await view.click(view.q('[data-action="accept"]'));
      assert.deepEqual(done, [], "还没进群");
      assert.equal(view.q("[data-invite-result]").getAttribute("data-invite-result"), "pending");
      assert.match(view.text(), /已申请，等群管理员同意/);
      assert.deepEqual(im.fetch.calls.find((c) => c.path.endsWith("/accept")).json, { message: "我是小王" });
    } finally {
      view.cleanup();
    }
  }
});

test("链接失效：预览 410 / 404、预览 expired、接受时才发现失效 —— 都显示「链接已失效」", async () => {
  const cases = [
    { [PREVIEW]: () => { throw apiError(410, "gone", "链接已失效"); } },
    { [PREVIEW]: () => { throw apiError(404, "not_found", "找不到") } },
    { [PREVIEW]: groupPreview({ expired: true }) },
  ];
  for (const routes of cases) {
    const { view, done } = await open(routes);
    try {
      assert.equal(view.q("[data-invite-result]").getAttribute("data-invite-result"), "gone");
      assert.match(view.text(), /链接已失效/);
      assert.equal(view.q('[data-action="accept"]'), null, "失效的链接没有接受按钮");
      assert.deepEqual(done, []);
    } finally {
      view.cleanup();
    }
  }
  const { view } = await open({ [PREVIEW]: groupPreview(), [ACCEPT]: () => { throw apiError(410, "gone", "链接已被撤销"); } });
  try {
    await view.click(view.q('[data-action="accept"]'));
    assert.equal(view.q("[data-invite-result]").getAttribute("data-invite-result"), "gone");
  } finally {
    view.cleanup();
  }
});

test("其他拒绝（如被拉黑）：留在预览页，显示后端给的原因", async () => {
  const { view, done } = await open({ [PREVIEW]: contactPreview(), [ACCEPT]: () => { throw apiError(403, "blocked", "对方不接收你的邀请") } });
  try {
    await view.click(view.q('[data-action="accept"]'));
    assert.match(view.q('[role="alert"]').textContent, /对方不接收你的邀请/);
    assert.deepEqual(done, []);
    assert.ok(view.q('[data-action="accept"]'), "还能再试");
  } finally {
    view.cleanup();
  }
});

test("已经是联系人 / 已在群里 / 已申请过：不再显示接受；群成员可以直接打开群", async () => {
  {
    const { view } = await open({ [PREVIEW]: contactPreview({ already: "contact" }) });
    try {
      assert.ok(view.q('[data-already="contact"]'));
      assert.equal(view.q('[data-action="accept"]'), null);
    } finally {
      view.cleanup();
    }
  }
  {
    const { view, done } = await open({ [PREVIEW]: groupPreview({ already: "member" }) });
    try {
      assert.equal(view.q('[data-action="accept"]'), null);
      await view.click(view.q('[data-action="open-group"]'));
      assert.deepEqual(done, [{ conversationId: "conv-1" }]);
    } finally {
      view.cleanup();
    }
  }
  {
    const { view } = await open({ [PREVIEW]: groupPreview({ already: "pending", requires_approval: true }) });
    try {
      assert.ok(view.q('[data-already="pending"]'));
      assert.equal(view.q('[data-action="accept"]'), null);
    } finally {
      view.cleanup();
    }
  }
});

test("没登录：先出登录框（不打预览接口）；登录成功后停在同一个邀请，显示预览", async () => {
  const { view, im } = await open({ [PREVIEW]: contactPreview() }, { signedIn: false });
  try {
    assert.ok(view.q("[data-auth-dialog]"), "先引导登录");
    assert.equal(im.fetch.calls.length, 0, "没登录不请求邀请预览");
    await view.click(view.q("[data-auth-ok]"));
    assert.equal(view.q("[data-auth-dialog]"), null);
    assert.match(view.text(), /邀请人小林/);
    assert.equal(im.fetch.calls.length, 1);
  } finally {
    view.cleanup();
  }
});

test("预览回 401（令牌过期）：也引导登录，而不是显示失效", async () => {
  const { view } = await open({ [PREVIEW]: () => { throw apiError(401, "unauthorized", "请先登录"); } });
  try {
    assert.ok(view.q("[data-auth-dialog]"));
    assert.equal(view.q("[data-invite-result]"), null);
  } finally {
    view.cleanup();
  }
});
