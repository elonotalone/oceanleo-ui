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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://design.oceanleo.com/bay",
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  InputEvent: dom.window.InputEvent,
  DragEvent: dom.window.DragEvent,
  File: dom.window.File,
  DataTransfer: dom.window.DataTransfer,
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
  globalThis.__bayAuthedCalls ??= [];
  export async function authed(path, init){
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    globalThis.__bayAuthedCalls.push({ method: (init && init.method) || "GET", path, body });
    if (globalThis.__bayAuthedRespond) return globalThis.__bayAuthedRespond(path, body);
    return { ok: true, data: { profile: { handle: "leo", display_name: "Leo", published: true, page_doc: body && body.page_doc ? body.page_doc : null } } };
  }
`);
const authStub = dataModule(`export async function getUserId(){ return globalThis.__bayViewer ?? null; }`);
const stateStub = dataModule(`
  globalThis.__bayOpened ??= [];
  globalThis.__bayLoginAsked ??= 0;
  globalThis.__bayFilters ??= [];
  export function openBay(target){ globalThis.__bayOpened.push(target); }
  export function replaceBay(target){ globalThis.__bayOpened.push(target); }
  export function requireBayLogin(){ if (globalThis.__baySignedIn === false) { globalThis.__bayLoginAsked += 1; return false; } return true; }
  export function useBaySignedIn(){ return globalThis.__baySignedIn !== false; }
  export function useBayEnabled(){ return globalThis.__bayEnabled !== false; }
  export function setBayFilter(filter){ globalThis.__bayFilters.push(filter); }
  export function bayBack(){}
`);
const dealStub = dataModule(`
  globalThis.__bayThreads ??= [];
  export async function openTradeThread(subject){ globalThis.__bayThreads.push(subject); }
  export function DealConversationView(){ return null; }
`);
const pickerStub = dataModule(`
  export async function pickLibraryWork(){ return globalThis.__bayPickedWork ?? { kind: "task", id: "task-42", site_key: "ppt", title: "季度汇报" }; }
`);
const configStub = dataModule(`
  export const GATEWAY_BASE = "https://api.test";
  export function cookieDomainFor(){ return ""; }
  export function isLeoDevPreviewHost(){ return true; }
`);
const mineStub = dataModule(`
  const R = globalThis.React;
  export function BaySignInPrompt({ text }){ return R.createElement("p", { "data-bay-sign-in": "" }, text); }
  export function BayMine(){ return null; }
`);
const databaseStub = dataModule(`
  export async function uploadFile(file, opts) {
    (globalThis.__bayCoverUploads ||= []).push({ file, opts });
    const responder = globalThis.__bayCoverUpload;
    return responder ? responder(file, opts) : { ok: true, data: { file: { url: "https://cdn.example/cover.png" } } };
  }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../../../lib/auth/client": authStub,
  "../../../lib/database": databaseStub,
  "../shell/bay-state": stateStub,
  "../deal": dealStub,
  "../shell/BayMine": mineStub,
  "../needs/LibraryWorkPicker": pickerStub,
  "../../../lib/auth/config": configStub,
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
    avatar_url: page.profile.avatar_url || null,
    headline: page.profile.headline || "",
    bio: page.profile.bio || "",
    categories: page.profile.categories || [],
    skills: page.profile.skills || [],
    languages: page.profile.languages || [],
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
  globalThis.__bayCoverUploads = [];
  globalThis.__bayCoverUpload = async () => ({ ok: true, data: { file: { url: "https://cdn.example/cover.png" } } });
  globalThis.__bayAuthedCalls = [];
  globalThis.__bayAuthedRespond = null;
  globalThis.__bayPickedWork = { kind: "task", id: "task-42", site_key: "ppt", title: "季度汇报" };
}

function tinyPngFile() {
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
    (ch) => ch.charCodeAt(0),
  );
  return new File([png], "cover.png", { type: "image/png" });
}

function assignInputFile(input, file) {
  if (typeof window.DataTransfer === "function") {
    const transfer = new window.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return;
  }
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
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

test("本人的主页有「编辑主页」，没有第二张资料表", () => {
  reset();
  const out = renderToStaticMarkup(React.createElement(ProfileDetailView, { page: ownPage(), viewerId: "seller-1" }));
  assert.match(out, /编辑主页/);
  assert.doesNotMatch(out, /data-bay-own-profile-form/);
  assert.doesNotMatch(out, /卖家资料/);
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

test("官方主页有「官方」标和「逛官方现成文件」", () => {
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
  assert.match(out, /逛官方现成文件/);
  assert.match(out, /由 OceanLeo 官方发布/);
  assert.equal(out.includes("全部免费，拿去直接用"), false);
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
  assert.equal(view.host.querySelector("[data-bay-own-profile-form]"), null);
  assert.doesNotMatch(view.host.textContent, /卖家资料/);
  assert.ok(view.host.querySelector('[data-bay-field="handle"]'));
  assert.ok(view.host.querySelector('[data-bay-field="display_name"]'));
  assert.ok(view.host.querySelector('[data-bay-field="skills"]'));
  assert.ok(view.host.querySelector('[data-bay-field="languages"]'));
  assert.ok(view.host.querySelector('[data-bay-cover-variant="avatar"]'));
  assert.doesNotMatch(view.host.textContent, /These are the items buyers see/);
  assert.doesNotMatch(view.host.textContent, /Seller profile/);
  assert.doesNotMatch(view.host.textContent, /Profile handle/);
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

test("封面选「图片」后出现封面拖拽上传，没有封面地址框", async () => {
  // 本任务要改掉的旧行为：封面选图片时出现 type=url / aria-label「封面图地址」，填 http:// 提示要 https。
  reset();
  const page = ownPage({ page_doc: defaultPageDoc({ display_name: "Leo" }) });
  const view = await mount(React.createElement(ProfileDetailView, { page, viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  const imageBtn = [...view.host.querySelectorAll("button")].find((node) => node.textContent === "图片");
  assert.ok(imageBtn);
  await act(() => {
    imageBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const toolbar = view.host.querySelector("[data-bay-page-toolbar]");
  assert.ok(toolbar);
  assert.ok(toolbar.querySelector("[data-bay-cover-drop]"));
  assert.equal(toolbar.querySelector('input[aria-label="封面图地址"]'), null);
  assert.equal(toolbar.querySelector('input[type="url"]'), null);
  assert.doesNotMatch(toolbar.textContent, /封面图地址/);
  assert.doesNotMatch(toolbar.textContent, /粘贴一张横向大图的地址/);
  const fileInput = toolbar.querySelector('[data-bay-page-cover-settings] input[type="file"]');
  assert.ok(fileInput);
  assignInputFile(fileInput, tinyPngFile());
  await act(async () => {
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
  await flush();
  assert.equal(globalThis.__bayCoverUploads.length, 1);
  assert.ok(toolbar.querySelector("[data-bay-page-cover-settings] img[src='https://cdn.example/cover.png']"));
  assert.ok(view.host.querySelector('[data-bay-page-cover="image"]'));
  await view.unmount();
});

test("源码没有 dangerouslySetInnerHTML、没有 contenteditable", () => {
  for (const file of [
    "shell/bay/page/ProfilePage.tsx",
    "shell/bay/page/ProfilePageEditor.tsx",
    "shell/bay/page/ProfilePageSettings.tsx",
    "shell/bay/page/EditableText.tsx",
    "shell/bay/supply/ProfilePane.tsx",
  ]) {
    const text = src(file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, file);
    assert.doesNotMatch(text, /contenteditable\s*=/i, file);
    assert.doesNotMatch(text, /\bcontentEditable\s*=/, file);
  }
});

test("编辑器封面与图集走 BayCoverDrop，链接版块仍是网址", () => {
  const editor = src("shell/bay/page/ProfilePageEditor.tsx") + src("shell/bay/page/ProfilePageSettings.tsx");
  const page = src("shell/bay/page/ProfilePage.tsx");
  assert.match(editor, /BayCoverDrop/);
  assert.doesNotMatch(editor, /封面图地址/);
  assert.doesNotMatch(editor, /粘贴一张横向大图的地址/);
  assert.doesNotMatch(editor, /type="url"/);
  assert.match(page, /BayCoverDrop/);
  assert.match(page, /还没有图片。拖一张图进来或从本地选择。/);
  assert.doesNotMatch(page, /在下面粘贴图片地址/);
  assert.doesNotMatch(page, /在设置的 LeoBay/);
  assert.match(page, /还没有作品。从「我的库」挑进来。/);
  assert.match(page, /链接地址/);
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

test("保存主页一次写下资料和版面，请求体没有 timezone", async () => {
  reset();
  const page = ownPage({ page_doc: defaultPageDoc({ display_name: "Leo", headline: "十年品牌设计", bio: "只做品牌" }) });
  const view = await mount(React.createElement(ProfileDetailView, { page, viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  const name = view.host.querySelector('[data-bay-field="display_name"] [data-bay-page-editable]');
  assert.ok(name);
  await act(() => {
    const proto = window.HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(name, "Leo Chen");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = view.host.querySelector('[data-bay-page-action="save"]');
  assert.equal(save.disabled, false);
  await view.click('[data-bay-page-action="save"]');
  await flush();
  const profilePut = globalThis.__bayAuthedCalls.find((row) => row.method === "PUT" && row.path === "/v1/talent/me");
  const pagePut = globalThis.__bayAuthedCalls.find((row) => row.method === "PUT" && row.path === "/v1/talent/me/profile/page");
  assert.ok(profilePut);
  assert.ok(pagePut);
  assert.equal(Object.prototype.hasOwnProperty.call(profilePut.body, "timezone"), false);
  assert.equal(profilePut.body.handle, "leo");
  assert.equal(profilePut.body.display_name, "Leo Chen");
  assert.equal(profilePut.body.headline, "十年品牌设计");
  assert.equal(profilePut.body.bio, "只做品牌");
  assert.deepEqual(profilePut.body.skills, ["Logo"]);
  assert.ok(pagePut.body.page_doc);
  const hero = pagePut.body.page_doc.blocks.find((block) => block.type === "hero");
  assert.equal(hero.title, "Leo Chen");
  assert.equal(hero.subtitle, "十年品牌设计");
  await view.unmount();
});

test("作品集在画布上从我的库导入", async () => {
  reset();
  globalThis.__bayHttpRespond = (method, path) => {
    if (method === "POST" && String(path).includes("/showcase/import-tasks")) {
      return { items: [{ id: "sh-1", title: "季度汇报", summary: "", cover_url: null, source_kind: "task" }] };
    }
    return {};
  };
  const page = ownPage({ page_doc: defaultPageDoc({ display_name: "Leo" }) });
  const view = await mount(React.createElement(ProfileDetailView, { page, viewerId: "seller-1" }));
  await view.click('[data-bay-page-action="edit"]');
  await view.click("[data-bay-import-work]");
  await flush();
  const post = globalThis.__bayHttpCalls.find((row) => String(row.path).includes("/showcase/import-tasks"));
  assert.ok(post);
  assert.deepEqual(post.body, { task_ids: ["task-42"], detail_level: "summary" });
  assert.ok(view.host.querySelector('[data-bay-showcase="sh-1"]'));
  await view.unmount();
});

test("官方主页点「逛官方现成文件」停在现成文件栏", async () => {
  reset();
  const view = await mount(
    React.createElement(ProfileDetailView, {
      page: publicPage({
        profile: { user_id: "admin", handle: "oceanleo", display_name: "OceanLeo", official: true, published: true },
      }),
      viewerId: "buyer-1",
    }),
  );
  const button = [...view.host.querySelectorAll("button")].find((node) => node.textContent.includes("逛官方现成文件"));
  assert.ok(button);
  await act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(globalThis.__bayFilters.at(-1), { kind: "asset" });
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "feed" });
  await view.unmount();
});

async function changeText(view, selector, value) {
  const input = view.host.querySelector(selector);
  assert.ok(input, selector);
  await act(() => {
    const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("personal page entry opens the owner builder directly and cannot edit another person's page", async () => {
  reset();
  const owner = await mount(React.createElement(ProfileDetailView, { page: ownPage(), viewerId: "seller-1", startEditing: true }));
  assert.ok(owner.host.querySelector('[data-bay-profile="own-editing"]'));
  assert.ok(owner.host.querySelector("[data-bay-page-outline]"));
  assert.ok(owner.host.querySelector('[data-bay-page-template="portfolio"]'));
  assert.equal(owner.host.querySelectorAll("[data-bay-page-template]").length, 4);
  assert.match(owner.host.querySelector("[data-bay-page-toolbar]").className, /overflow-y-auto/);
  assert.match(owner.host.querySelector("[data-bay-page-canvas]").className, /overflow-y-auto/);
  await owner.unmount();

  const visitor = await mount(React.createElement(ProfileDetailView, { page: publicPage(), viewerId: "buyer-1", startEditing: true }));
  assert.ok(visitor.host.querySelector('[data-bay-profile="public"]'));
  assert.ok(!visitor.host.querySelector("[data-bay-page-editor]"));
  assert.ok(!visitor.host.querySelector("[data-bay-mine-vetting]"));
  await visitor.unmount();
});

test("templates change the real canvas and preserve populated gallery, text, and custom links", async () => {
  reset();
  const original = defaultPageDoc({ display_name: "Leo", bio: "A true story" });
  original.blocks.push({ id: "real-gallery", type: "gallery", title: "Real work", images: [{ url: "https://cdn.example/my-work.png", caption: "Caption" }] });
  original.blocks.push({ id: "real-links", type: "links", title: "Elsewhere", links: [{ label: "My work", url: "https://example.com/leo" }] });
  const view = await mount(React.createElement(ProfileDetailView, { page: ownPage({ page_doc: original }), viewerId: "seller-1", startEditing: true }));
  await view.click('[data-bay-page-template="portfolio"]');
  assert.equal(view.host.querySelector("[data-bay-page-tone]").getAttribute("data-bay-page-tone"), "warm");
  assert.ok(view.host.querySelector('img[src="https://cdn.example/my-work.png"]'));
  assert.match(view.host.querySelector('[data-bay-page-block-edit="about"]').textContent, /A true story/);
  await view.click('[data-bay-page-preview="preview"]');
  assert.ok(view.host.querySelector('a[href="https://example.com/leo"]'));
  await view.click('[data-bay-page-action="save"]');
  const pagePut = globalThis.__bayAuthedCalls.find((row) => row.path === "/v1/talent/me/profile/page");
  assert.ok(pagePut);
  assert.equal(pagePut.body.page_doc.theme.tone, "warm");
  assert.equal(pagePut.body.page_doc.blocks.find((block) => block.id === "real-gallery").images[0].caption, "Caption");
  assert.equal(pagePut.body.page_doc.blocks.find((block) => block.id === "about").body, "A true story");
  await view.unmount();
});

test("phone preview uses compact public geometry, hides editing controls and empty public sections, and keeps edits", async () => {
  reset();
  const view = await mount(React.createElement(ProfileDetailView, { page: ownPage({ page_doc: defaultPageDoc({ display_name: "Leo", bio: "A true story" }) }), viewerId: "seller-1", startEditing: true }));
  await changeText(view, '[data-bay-page-block-edit="about"] textarea[aria-label="正文"]', "My edited story");
  await view.click('[data-bay-page-viewport="mobile"]');
  await view.click('[data-bay-page-preview="preview"]');
  const canvas = view.host.querySelector("[data-bay-page-canvas]");
  assert.ok(!canvas.querySelector("[data-bay-page-editable]"));
  assert.ok(canvas.querySelector('[data-bay-page-compact="true"]'));
  assert.equal(canvas.querySelector("[data-bay-page-canvas-card]").style.maxWidth, "390px");
  assert.ok(!canvas.querySelector('[data-bay-page-block="services"]'));
  assert.ok(!canvas.querySelector('[data-bay-page-block="showcase"]'));
  assert.match(canvas.textContent, /My edited story/);
  assert.equal(view.host.querySelector('[data-bay-page-action="save"]').disabled, false);
  await view.click('[data-bay-page-preview="edit"]');
  assert.equal(view.host.querySelector('[data-bay-page-block-edit="about"] textarea[aria-label="正文"]').value, "My edited story");
  await view.unmount();
});

test("restoring section order clears the dirty state; cancel protects and can discard the draft", async () => {
  reset();
  const view = await mount(React.createElement(ProfileDetailView, { page: ownPage({ page_doc: defaultPageDoc({ display_name: "Leo", bio: "A true story" }) }), viewerId: "seller-1", startEditing: true }));
  const save = () => view.host.querySelector('[data-bay-page-action="save"]');
  await view.click('[data-bay-page-outline-id="hero"] [data-bay-page-block-action="down"]');
  assert.equal(save().disabled, false);
  await view.click('[data-bay-page-outline-id="hero"] [data-bay-page-block-action="up"]');
  assert.equal(save().disabled, true);
  await changeText(view, '[data-bay-page-block-edit="about"] textarea[aria-label="正文"]', "Unsaved story");
  await view.click('[data-bay-page-action="cancel"]');
  assert.ok(view.host.querySelector("[data-bay-page-discard]"));
  await view.click('[data-bay-page-action="continue"]');
  assert.ok(!view.host.querySelector("[data-bay-page-discard]"));
  assert.equal(view.host.querySelector('[data-bay-page-block-edit="about"] textarea[aria-label="正文"]').value, "Unsaved story");
  await view.click('[data-bay-page-action="cancel"]');
  await view.click('[data-bay-page-action="discard"]');
  assert.ok(!view.host.querySelector("[data-bay-page-editor]"));
  assert.doesNotMatch(view.host.textContent, /Unsaved story/);
  assert.equal(globalThis.__bayAuthedCalls.length, 0);
  await view.unmount();
});

test("identity validation blocks invalid saves; publication state persists when reopening the builder", async () => {
  reset();
  const view = await mount(React.createElement(ProfileDetailView, { page: ownPage(), viewerId: "seller-1", startEditing: true }));
  const save = () => view.host.querySelector('[data-bay-page-action="save"]');
  await changeText(view, '[data-bay-field="handle"] textarea', "a");
  assert.equal(save().disabled, true);
  await changeText(view, '[data-bay-field="handle"] textarea', "leo");
  await changeText(view, '[data-bay-field="display_name"] textarea', "");
  assert.equal(save().disabled, true);
  await changeText(view, '[data-bay-field="display_name"] textarea', "Leo Chen");
  await view.click('[data-bay-page-published="true"]');
  await view.click('[data-bay-page-action="save"]');
  await flush();
  const profilePut = globalThis.__bayAuthedCalls.find((row) => row.path === "/v1/talent/me");
  assert.equal(profilePut.body.published, false);
  assert.equal(profilePut.body.display_name, "Leo Chen");
  assert.ok(view.host.querySelector("[data-bay-page-unpublished]"));
  assert.match(view.host.querySelector("[data-bay-profile-name]").textContent, /Leo Chen/);
  await view.click('[data-bay-page-action="edit"]');
  assert.ok(view.host.querySelector('[data-bay-page-published="false"]'));
  assert.equal(save().disabled, true);
  assert.equal(view.host.querySelector('[data-bay-field="display_name"] textarea').value, "Leo Chen");
  await view.unmount();
});

test("a failed page save retains the draft and offers a working retry", async () => {
  reset();
  const view = await mount(React.createElement(ProfileDetailView, { page: ownPage(), viewerId: "seller-1", startEditing: true }));
  await view.click('[data-bay-page-template="editorial"]');
  globalThis.__bayAuthedRespond = (path) => path.endsWith("/page") ? { ok: false, status: 503, error: "Try saving again" } : { ok: true, data: { profile: {} } };
  await view.click('[data-bay-page-action="save"]');
  await flush();
  assert.ok(view.host.querySelector("[data-bay-page-editor]"));
  assert.match(view.host.querySelector('[role="alert"]').textContent, /Try saving again/);
  assert.equal(view.host.querySelector('[data-bay-page-action="save"]').disabled, false);
  assert.equal(view.host.querySelector("[data-bay-page-tone]").getAttribute("data-bay-page-tone"), "ocean");
  globalThis.__bayAuthedRespond = null;
  await view.click('[data-bay-page-action="save"]');
  await flush();
  assert.ok(!view.host.querySelector("[data-bay-page-editor]"));
  assert.equal(view.host.querySelector("[data-bay-page-tone]").getAttribute("data-bay-page-tone"), "ocean");
  await view.unmount();
});

test("sidebar name edits match the saved hero in the live preview and reverting them clears the draft", async () => {
  reset();
  const view = await mount(React.createElement(ProfileDetailView, { page: ownPage({ page_doc: defaultPageDoc({ display_name: "Leo" }) }), viewerId: "seller-1", startEditing: true }));
  const name = '[data-bay-field="display_name"] textarea';
  await changeText(view, name, "Leo Chen");
  assert.equal(view.host.querySelector('[data-bay-page-block-edit="hero"] textarea[aria-label="大标题"]').value, "Leo Chen");
  await view.click('[data-bay-page-preview="preview"]');
  assert.equal(view.host.querySelector('[data-bay-page-block="hero"] h2').textContent, "Leo Chen");
  await changeText(view, name, "Leo");
  assert.equal(view.host.querySelector('[data-bay-page-action="save"]').disabled, true);
  assert.equal(view.host.querySelector('[data-bay-page-block="hero"] h2').textContent, "Leo");
  await view.unmount();
});
