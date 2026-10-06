// W10 判据：MemberPicker 的标注——谁能直接加、谁需要对方同意、已拉黑不可选、已在群里不可选；
// 私聊（directOnly）里需要同意的人不可选；多选 / 单选；搜索按 /v1/im/directory 的 q 走。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/im-member-picker.test.mjs
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
  "../../../lib/im/client": imClientStub,
};

const { MemberPicker } = await import(await compileModule("src/shell/messages/people/MemberPicker.tsx", STUBS));
const { classifyCandidate } = await import(await compileModule("src/lib/im/people-api.ts", STUBS));

const person = (id, name, relation) => ({ user_id: id, display_name: name, avatar_url: null, relation });

const DIRECTORY = [
  person("u-contact", "联系人甲", "contact"),
  person("u-mate", "同事乙", "teammate"),
  person("u-proj", "项目丙", "project"),
  person("u-blocked", "被拉黑丁", "contact"),
  person("u-in", "已在群里戊", "contact"),
];

function routes(extra = {}) {
  return {
    "GET /v1/im/directory": ({ path }) => {
      const q = decodeURIComponent((path.split("q=")[1] ?? "")).trim();
      return { items: q ? DIRECTORY.filter((p) => p.display_name.includes(q)) : DIRECTORY };
    },
    "GET /v1/im/blocks": { items: [person("u-blocked", "被拉黑丁")] },
    "GET /v1/im/profiles": { items: [] },
    ...extra,
  };
}

function Harness(props) {
  const [selected, setSelected] = React.useState(props.initial ?? []);
  globalThis.__picked = selected;
  return React.createElement(MemberPicker, { ...props, selected, onChange: setSelected });
}

const status = (view, id) => view.q(`[data-candidate="${id}"]`).getAttribute("data-status");

test("classifyCandidate：联系人 / 同 Team / 同项目直接加；同群成员需同意；拉黑与已在群里优先", () => {
  assert.equal(classifyCandidate({ user_id: "a", relation: "contact" }), "direct");
  assert.equal(classifyCandidate({ user_id: "a", relation: "teammate" }), "direct");
  assert.equal(classifyCandidate({ user_id: "a", relation: "project" }), "direct");
  assert.equal(classifyCandidate({ user_id: "a", relation: "member" }), "consent");
  assert.equal(classifyCandidate({ user_id: "a", relation: "none" }), "consent");
  assert.equal(classifyCandidate({ user_id: "a" }), "consent");
  assert.equal(classifyCandidate({ user_id: "a", relation: "contact" }, { blockedIds: new Set(["a"]) }), "blocked");
  assert.equal(classifyCandidate({ user_id: "a", relation: "contact" }, { existingIds: new Set(["a"]), blockedIds: new Set(["a"]) }), "existing");
});

test("每个人都有标注：可直接加 / 需对方同意 / 已拉黑不可选 / 已在群里", async () => {
  const im = {
    fetch: router(routes({ "GET /v1/im/profiles": { items: [person("u-far", "同群己", "member")] } })),
  };
  const view = await mount(React.createElement(Harness, { existingIds: ["u-in"], extraIds: ["u-far"] }), im);
  try {
    assert.equal(status(view, "u-contact"), "direct");
    assert.equal(status(view, "u-mate"), "direct");
    assert.equal(status(view, "u-proj"), "direct");
    assert.equal(status(view, "u-far"), "consent", "不在通讯录里的同群成员需要对方同意");
    assert.equal(status(view, "u-blocked"), "blocked");
    assert.equal(status(view, "u-in"), "existing");
    assert.match(view.q('[data-candidate="u-contact"]').textContent, /可直接加/);
    assert.match(view.q('[data-candidate="u-far"]').textContent, /需对方同意/);
    assert.match(view.q('[data-candidate="u-blocked"]').textContent, /已拉黑，不可选/);
    assert.match(view.q('[data-candidate="u-in"]').textContent, /已在群里/);
    assert.equal(view.q('[data-candidate="u-blocked"]').disabled, true);
    assert.equal(view.q('[data-candidate="u-in"]').disabled, true);
    assert.equal(view.q('[data-candidate="u-far"]').disabled, false, "需要同意的人可以选，选了会发邀请");
  } finally {
    view.cleanup();
  }
});

test("多选：点选 / 再点取消 / 小标签可移除；拉黑和已在群里的点不动", async () => {
  const im = { fetch: router(routes()) };
  const view = await mount(React.createElement(Harness, { existingIds: ["u-in"] }), im);
  try {
    await view.click(view.q('[data-candidate="u-contact"]'));
    await view.click(view.q('[data-candidate="u-mate"]'));
    await view.click(view.q('[data-candidate="u-blocked"]'));
    await view.click(view.q('[data-candidate="u-in"]'));
    assert.deepEqual(globalThis.__picked, ["u-contact", "u-mate"]);
    assert.equal(view.qa("[data-picker-chips] button").length, 2);
    await view.click(view.q('[data-candidate="u-contact"]'));
    assert.deepEqual(globalThis.__picked, ["u-mate"]);
    await view.click(view.q("[data-picker-chips] button"));
    assert.deepEqual(globalThis.__picked, []);
  } finally {
    view.cleanup();
  }
});

test("单选（新建私聊）：只留一个；非联系人（需同意）不能私聊，不可选", async () => {
  const im = { fetch: router(routes({ "GET /v1/im/profiles": { items: [person("u-far", "同群己", "member")] } })) };
  const view = await mount(React.createElement(Harness, { mode: "single", directOnly: true, extraIds: ["u-far"] }), im);
  try {
    await view.click(view.q('[data-candidate="u-contact"]'));
    await view.click(view.q('[data-candidate="u-mate"]'));
    assert.deepEqual(globalThis.__picked, ["u-mate"]);
    assert.equal(view.q('[data-candidate="u-far"]').disabled, true);
    assert.match(view.q('[data-candidate="u-far"]').textContent, /需先加联系人/);
    await view.click(view.q('[data-candidate="u-far"]'));
    assert.deepEqual(globalThis.__picked, ["u-mate"]);
  } finally {
    view.cleanup();
  }
});

test("搜索按名字走 /v1/im/directory?q=，只在候选范围内找；没找到时提示用邀请链接", async () => {
  const im = { fetch: router(routes()) };
  const view = await mount(React.createElement(Harness, {}), im);
  try {
    await view.type(view.q('input[type="search"]'), "同事");
    assert.deepEqual(view.qa("[data-candidate]").map((b) => b.getAttribute("data-candidate")), ["u-mate"]);
    assert.ok(im.fetch.calls.some((c) => c.path.includes("/v1/im/directory?q=" + encodeURIComponent("同事"))));
    await view.type(view.q('input[type="search"]'), "路人");
    assert.equal(view.qa("[data-candidate]").length, 0);
    assert.match(view.q("[data-picker-empty]").textContent, /邀请链接/);
  } finally {
    view.cleanup();
  }
});
