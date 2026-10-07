// LeoBay 个人主页：别人看到「先聊聊」，本人可编辑版面；官方有标。不接受 HTML。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { defaultPageDoc } from "../src/lib/bay/page-doc.ts";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://design.oceanleo.com/bay" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  InputEvent: dom.window.InputEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const httpStub = dataModule(`
  globalThis.__bayHttpCalls ??= [];
  async function reply(method, path, body, opts) {
    globalThis.__bayHttpCalls.push({ method, path, body, opts });
    const responder = globalThis.__bayHttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export class BayApiError extends Error {}
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const agentStub = dataModule(`
  export async function authed(){ return { ok: true, data: {} }; }
`);
const authStub = dataModule(`export async function getUserId(){ return globalThis.__bayViewer ?? null; }`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  globalThis.__bayFilters ??= [];
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function setBayFilter(filter){ globalThis.__bayFilters.push(filter); }
  export function bayBack(){}
`);
const dealStub = dataModule(`
  globalThis.__bayThreads ??= [];
  export async function openTradeThread(subject){ globalThis.__bayThreads.push(subject); }
  export function DealConversationView(){ return null; }
`);
const mineStub = dataModule(`
  const R = globalThis.React;
  export function BaySignInPrompt({ text }){ return R.createElement("p", { "data-bay-sign-in": "" }, text); }
  export function BayMine(){ return null; }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../../../lib/auth/client": authStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
  "../shell/BayMine": mineStub,
};
globalThis.React = React;

const { ProfileDetailView } = await import(await compileModule("src/shell/bay/supply/ProfilePane.tsx", stubs));

function publicPage(extra = {}) {
  const profile = {
    user_id: "seller-1",
    handle: "leo",
    display_name: "Leo",
    avatar_url: null,
    headline: "十年品牌设计",
    bio: "只做品牌",
    skills: ["Logo"],
    languages: ["中文"],
    categories: ["design"],
    rating_avg: 4.8,
    rating_count: 10,
    published: true,
    official: false,
    page_doc: extra.page_doc ?? null,
    ...(extra.profile || {}),
  };
  return {
    profile,
    services: extra.services ?? [],
    showcase: extra.showcase ?? [],
    reviews: extra.reviews ?? [],
  };
}

function ownPage(extra = {}) {
  const page = publicPage(extra);
  page.own = true;
  page.seller = {
    handle: page.profile.handle,
    display_name: page.profile.display_name,
    avatar_url: null,
    headline: page.profile.headline || "",
    bio: page.profile.bio || "",
    categories: [],
    skills: [],
    languages: [],
    published: page.profile.published !== false,
    ...extra.seller,
  };
  return page;
}

function reset() {
  globalThis.__bayHttpCalls = [];
  globalThis.__bayHttpRespond = () => ({});
  globalThis.__bayOpened = [];
  globalThis.__bayLoginAsked = 0;
  globalThis.__baySignedIn = true;
  globalThis.__bayThreads = [];
  globalThis.__bayViewer = "buyer-1";
  globalThis.__bayFilters = [];
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(() => {
    root.render(element);
  });
  return {
    host,
    async click(selector) {
      const node = host.querySelector(selector);
      assert.ok(node, selector);
      await act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async unmount() {
      await act(() => root.unmount());
      host.remove();
    },
  };
}

test("别人的主页有「先聊聊」、没有「编辑主页」", () => {
  reset();
  const out = renderToStaticMarkup(React.createElement(ProfileDetailView, { page: publicPage(), viewerId: "buyer-1" }));
  assert.match(out, /先聊聊/);
  assert.match(out, /data-bay-talk/);
  assert.doesNotMatch(out, /编辑主页/);
  assert.doesNotMatch(out, /data-bay-page-action="edit"/);
});

test("本人的主页有「编辑主页」「资料」", () => {
  reset();
  const out = renderToStaticMarkup(React.createElement(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  assert.match(out, /编辑主页/);
  assert.match(out, /资料/);
  assert.doesNotMatch(out, /data-bay-talk/);
});

test("没公开时有「公开主页」和那条提示", () => {
  reset();
  const out = renderToStaticMarkup(
    React.createElement(ProfileDetailView, {
      page: ownPage({ profile: { user_id: "seller-1", handle: "leo", display_name: "Leo", published: false } }),
      viewerId: "seller-1",
    }),
  );
  assert.match(out, /公开主页/);
  assert.match(out, /data-bay-page-unpublished/);
  assert.match(out, /这张主页现在只有你自己看得到/);
});

test("官方主页有「官方」标和「逛官方素材」", () => {
  reset();
  const out = renderToStaticMarkup(
    React.createElement(ProfileDetailView, {
      page: publicPage({
        profile: { user_id: "admin", handle: "oceanleo", display_name: "OceanLeo", official: true, published: true },
      }),
      viewerId: "buyer-1",
    }),
  );
  assert.match(out, /data-bay-official/);
  assert.match(out, />官方</);
  assert.match(out, /逛官方素材/);
});

test("进编辑后有主题栏、每个版块有上移 / 下移 / 删除、有「添加版块」", async () => {
  reset();
  const page = ownPage({ page_doc: defaultPageDoc({ display_name: "Leo", bio: "只做品牌" }) });
  const view = await mount(React.createElement(ProfileDetailView, { page, viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  assert.ok(view.host.querySelector("[data-bay-page-toolbar]"));
  assert.match(view.host.textContent, /底色/);
  assert.match(view.host.textContent, /主色/);
  assert.match(view.host.textContent, /字体/);
  assert.match(view.host.textContent, /封面/);
  const blocks = view.host.querySelectorAll("[data-bay-page-block-edit]");
  assert.ok(blocks.length >= 2);
  assert.ok(view.host.querySelector('[data-bay-page-block-action="up"]'));
  assert.ok(view.host.querySelector('[data-bay-page-block-action="down"]'));
  assert.ok(view.host.querySelector('[data-bay-page-block-action="remove"]'));
  assert.match(view.host.textContent, /添加版块/);
  await view.unmount();
});

test("没改动时「保存主页」不可点；点删除后那个版块没了且「保存主页」可点", async () => {
  reset();
  const page = ownPage({ page_doc: defaultPageDoc({ display_name: "Leo", bio: "只做品牌" }) });
  const view = await mount(React.createElement(ProfileDetailView, { page, viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  const save = view.host.querySelector('[data-bay-page-action="save"]');
  assert.equal(save.disabled, true);
  const before = view.host.querySelectorAll("[data-bay-page-block-edit]").length;
  const firstId = view.host.querySelector("[data-bay-page-block-edit]").getAttribute("data-bay-page-block-edit");
  await view.click('[data-bay-page-block-action="remove"]');
  assert.equal(view.host.querySelectorAll("[data-bay-page-block-edit]").length, before - 1);
  assert.equal(view.host.querySelector(`[data-bay-page-block-edit="${firstId}"]`), null);
  assert.equal(view.host.querySelector('[data-bay-page-action="save"]').disabled, false);
  await view.unmount();
});

test("封面选「图片」时出现地址输入框，填 http:// 提示要 https", async () => {
  reset();
  const page = ownPage({ page_doc: defaultPageDoc({ display_name: "Leo" }) });
  const view = await mount(React.createElement(ProfileDetailView, { page, viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  const imageBtn = [...view.host.querySelectorAll("button")].find((node) => node.textContent === "图片");
  assert.ok(imageBtn);
  await act(() => {
    imageBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const input = view.host.querySelector('input[aria-label="封面图地址"]');
  assert.ok(input);
  await act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "http://cdn.example/cover.png");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.match(view.host.textContent, /地址要以 https:\/\/ 开头/);
  await view.unmount();
});

test("源码没有 dangerouslySetInnerHTML、没有 contenteditable", () => {
  for (const file of [
    "shell/bay/page/ProfilePage.tsx",
    "shell/bay/page/ProfilePageEditor.tsx",
    "shell/bay/page/EditableText.tsx",
    "shell/bay/supply/ProfilePane.tsx",
  ]) {
    const text = src(file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, file);
    assert.doesNotMatch(text, /contenteditable\s*=/i, file);
    assert.doesNotMatch(text, /\bcontentEditable\s*=/, file);
  }
});

test("别人点「先聊聊」走交易会话", async () => {
  reset();
  const view = await mount(React.createElement(ProfileDetailView, { page: publicPage(), viewerId: "buyer-1" }));
  await view.click("[data-bay-talk]");
  assert.deepEqual(globalThis.__bayThreads, [{ kind: "direct", userId: "seller-1" }]);
  await view.unmount();
});

test("未登录点「先聊聊」只弹登录", async () => {
  reset();
  globalThis.__baySignedIn = false;
  const view = await mount(React.createElement(ProfileDetailView, { page: publicPage(), viewerId: null }));
  await view.click("[data-bay-talk]");
  assert.equal(globalThis.__bayLoginAsked, 1);
  assert.deepEqual(globalThis.__bayThreads, []);
  await view.unmount();
});

test("本人主页用户内容当纯文本", () => {
  reset();
  const out = renderToStaticMarkup(
    React.createElement(ProfileDetailView, {
      page: publicPage({
        profile: { user_id: "seller-1", handle: "leo", display_name: "<img src=x>", headline: "<script>x</script>", bio: "<b>x</b>" },
      }),
      viewerId: "buyer-1",
    }),
  );
  assert.ok(out.includes("&lt;img src=x"));
  assert.ok(!out.includes("<script>x</script>"));
  assert.ok(!out.includes("<b>x</b>"));
});

test("官方主页点「逛官方素材」停在素材栏", async () => {
  reset();
  const view = await mount(
    React.createElement(ProfileDetailView, {
      page: publicPage({
        profile: { user_id: "admin", handle: "oceanleo", display_name: "OceanLeo", official: true, published: true },
      }),
      viewerId: "buyer-1",
    }),
  );
  const button = [...view.host.querySelectorAll("button")].find((node) => node.textContent.includes("逛官方素材"));
  assert.ok(button);
  await act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(globalThis.__bayFilters.at(-1), { kind: "material" });
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "feed" });
  await view.unmount();
});
