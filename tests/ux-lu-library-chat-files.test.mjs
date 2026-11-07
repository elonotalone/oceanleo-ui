// UX wave 2026-11-07 LU-C: Library「来自 LeoChat」—— client (`library-chat-files.ts`) and view (`LibraryChatFiles.tsx`).
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/library" });
const { window } = dom;
for (const [name, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node })) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.attachEvent = () => {};
globalThis.__opened = [];
window.open = (...args) => { globalThis.__opened.push(args); return null; };

const reactUrl = pathToFileURL(require.resolve("react")).href;

// Gateway stub: every request is recorded; responses are queued per test.
const state = { calls: [], responses: [], openMessages: [], displayUrl: [] };
globalThis.__chat = state;
const imStub = dataModule(`
  export class ImApiError extends Error {
    constructor(status, code, message) { super(message); this.name = "ImApiError"; this.status = status; this.code = code; }
  }
  export async function imFetch(path, init = {}) {
    globalThis.__chat.calls.push({ path, init });
    const next = globalThis.__chat.responses.shift();
    if (!next) throw new ImApiError(0, "network", "网络不通");
    if (next.wait) await next.wait;
    if (next.error) throw new ImApiError(next.error.status, next.error.code, next.error.message);
    return next.body;
  }
`);
const urlStub = dataModule(`
  export function attachmentDisplayUrl(att) { globalThis.__chat.displayUrl.push(att.url); return "https://api.example.test" + att.url; }
`);
const uiStub = dataModule(`export function useUI() { return (text, vars) => text.replace(/\\{(\\w+)\\}/g, (match, key) => (vars && key in vars ? String(vars[key]) : match)); }`);
const uiKitStub = dataModule(`
  import { createElement } from "${reactUrl}";
  export function SkeletonCard({ className }) { return createElement("div", { "data-skeleton": "", className }); }
  export function timeAgo(iso) { return "T(" + iso + ")"; }
`);
const hostStub = dataModule(`export function openMessages(target) { globalThis.__chat.openMessages.push(target); }`);
const iconStub = dataModule(`
  import { createElement } from "${reactUrl}";
  export function WorkspaceKindIcon({ kind, label }) { return createElement("span", { "data-kind-icon": kind }, label); }
`);
const emptyStub = dataModule(`
  import { createElement } from "${reactUrl}";
  export function WorkspaceLibraryEmpty({ title, description, cta }) {
    return createElement("div", { "data-empty": "" }, createElement("p", { "data-empty-title": "" }, title), createElement("p", { "data-empty-description": "" }, description), cta || null);
  }
`);
const stubs = {
  "../lib/im/client": imStub,
  "../lib/attachment-url": urlStub,
  "../i18n/ui/useUI": uiStub,
  "../ui": uiKitStub,
  "./messages/host-state": hostStub,
  "./workspace-library-thumbnail": iconStub,
  "./workspace-library-view": emptyStub,
};
const client = await import(await compileModule("src/shell/library-chat-files.ts", stubs));
const view = await import(await compileModule("src/shell/LibraryChatFiles.tsx", stubs));

function reset(responses = []) {
  state.calls.length = 0;
  state.openMessages.length = 0;
  state.displayUrl.length = 0;
  state.responses = responses;
  globalThis.__opened.length = 0;
}

const received = {
  id: "m1:0", name: "季度报告.pdf", kind: "file", size: 2048, mime: "application/pdf", url: "https://store.example.test/u/a/report.pdf",
  conversation_id: "c-team", conversation_title: "产品群", sender_name: "张三", direction: "received", created_at: "2026-11-05T08:00:00Z",
};
const sent = {
  id: "m2:0", name: "Photo.PNG", kind: "image", size: 1536000, mime: "image/png", url: "https://store.example.test/u/a/photo.png",
  conversation_id: "c-li", conversation_title: "李四", sender_name: "我自己", direction: "sent", created_at: "2026-11-06T09:00:00Z",
};

async function settle() { for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); }
function mount(props) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (next) => act(async () => root.render(React.createElement(view.LibraryChatFiles, next)));
  return { container, root, render, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}
function cards(container) { return [...container.querySelectorAll("[data-library-chat-file]")]; }
function button(container, label) { return [...container.querySelectorAll("button")].find((entry) => entry.textContent === label); }

test("client parses the contract shape and passes cursor and limit", async () => {
  reset([{ body: { items: [received, sent], next: "cursor-2" } }, { body: { items: [], next: null } }]);
  const first = await client.listLibraryChatFiles({ cursor: "cursor-1", limit: 20 });
  assert.equal(state.calls[0].path, "/v1/library/chat-files?cursor=cursor-1&limit=20");
  assert.equal(first.ok, true);
  assert.equal(first.next, "cursor-2");
  assert.equal(first.skipped, 0);
  assert.deepEqual(first.items[0], { ...received });
  assert.equal(first.items[1].direction, "sent");
  const second = await client.listLibraryChatFiles();
  assert.equal(state.calls[1].path, "/v1/library/chat-files");
  assert.deepEqual(second, { ok: true, items: [], next: null, skipped: 0 });
  const controller = new AbortController();
  state.responses = [{ body: { items: [], next: null } }];
  await client.listLibraryChatFiles({ limit: 50, signal: controller.signal });
  assert.equal(state.calls[2].path, "/v1/library/chat-files?limit=50");
  assert.equal(state.calls[2].init.signal, controller.signal);
});

test("client skips and counts items without id, name or a usable url; gateway-relative urls use the attachment helper", async () => {
  reset([{ body: { items: [
    received,
    { ...received, id: "" },
    { ...received, id: "m3:0", name: undefined },
    { ...received, id: "m4:0", url: "" },
    { ...received, id: "m5:0", url: "javascript:alert(1)" },
    "not an object",
    { ...received, id: "m6:0", url: "/v1/media/proxy?url=x" },
    { ...received, id: "m7:0", size: "big", direction: "sideways", conversation_title: 7 },
  ], next: null } }]);
  const result = await client.listLibraryChatFiles();
  assert.equal(result.ok, true);
  assert.equal(result.skipped, 5);
  assert.deepEqual(result.items.map((file) => file.id), ["m1:0", "m6:0", "m7:0"]);
  assert.deepEqual(state.displayUrl, ["/v1/media/proxy?url=x"]);
  assert.equal(result.items[1].url, "https://api.example.test/v1/media/proxy?url=x");
  assert.equal(result.items[2].size, null);
  assert.equal(result.items[2].direction, null);
  assert.equal(result.items[2].conversation_title, "");
});

test("client returns gateway errors verbatim and rejects a body that is not the contract shape", async () => {
  reset([
    { error: { status: 503, code: "unavailable", message: "relation library_chat_files does not exist" } },
    { error: { status: 500, code: "http_500", message: "" } },
    { body: { items: "nope", next: null } },
    { body: { items: [] } },
  ]);
  assert.deepEqual(await client.listLibraryChatFiles(), { ok: false, status: 503, error: "relation library_chat_files does not exist" });
  assert.deepEqual(await client.listLibraryChatFiles(), { ok: false, status: 500, error: "http_500" });
  assert.deepEqual(await client.listLibraryChatFiles(), { ok: false, status: 200, error: "服务返回的内容无法识别" });
  assert.deepEqual(await client.listLibraryChatFiles(), { ok: false, status: 200, error: "服务返回的内容无法识别" });
});

test("chatFileMatches filters by query (name / conversation / sender) and by MyLibrary type category", () => {
  const pdf = client.normalizeChatFile(received);
  const png = client.normalizeChatFile(sent);
  const docx = client.normalizeChatFile({ ...received, id: "d", name: "方案.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const zip = client.normalizeChatFile({ ...received, id: "z", name: "源码.zip", mime: "application/zip" });
  const voice = client.normalizeChatFile({ ...received, id: "v", name: "voice.m4a", kind: "voice", mime: "audio/mp4" });
  const all = { query: "", category: "all" };
  assert.ok([pdf, png, docx, zip, voice].every((file) => client.chatFileMatches(file, all)));
  assert.equal(client.chatFileMatches(pdf, { query: "季度", category: "all" }), true);
  assert.equal(client.chatFileMatches(pdf, { query: "产品", category: "all" }), true);
  assert.equal(client.chatFileMatches(pdf, { query: "张三", category: "all" }), true);
  assert.equal(client.chatFileMatches(png, { query: "photo", category: "all" }), true, "query is case-insensitive");
  assert.equal(client.chatFileMatches(png, { query: "季度", category: "all" }), false);
  assert.equal(client.chatFileCategory(pdf), "pdf_editing", "a PDF lands in 「PDF」 like an uploaded PDF");
  assert.equal(client.chatFileCategory(png), "image_editing");
  assert.equal(client.chatFileCategory(docx), "document_editing");
  assert.equal(client.chatFileCategory(voice), "audio_editing");
  assert.equal(client.chatFileMatches(pdf, { query: "", category: "pdf_editing" }), true);
  assert.equal(client.chatFileMatches(png, { query: "", category: "pdf_editing" }), false);
  assert.equal(client.chatFileMatches(png, { query: "", category: "images" }), true, "filter ids are normalized");
  assert.equal(client.chatFileMatches(zip, { query: "", category: "document_editing" }), false);
  assert.equal(client.chatFileMatches(pdf, { query: "张三", category: "image_editing" }), false);
});

test("grid lists name, size, conversation, sender and date; Download and 「打开聊天」 work", async () => {
  reset([{ body: { items: [received, sent], next: null } }]);
  const ui = mount();
  await ui.render({ query: "", category: "all", view: "grid" });
  await settle();
  assert.equal(state.calls[0].path, "/v1/library/chat-files?limit=50");
  const [first, second] = cards(ui.container);
  assert.ok(first && second, "two cards");
  assert.ok(ui.container.querySelector("[data-collection-card-grid]"), "grid uses CollectionCardGrid");
  assert.match(first.textContent, /季度报告\.pdf/);
  assert.match(first.textContent, /张三 · 产品群 · 2\.0 KB · T\(2026-11-05T08:00:00Z\)/);
  assert.match(second.textContent, /我发送的 · 李四 · 1\.5 MB · T\(2026-11-06T09:00:00Z\)/);
  assert.doesNotMatch(second.textContent, /我自己/, "sent files show 我发送的, not the sender name");
  assert.equal(first.querySelector("[data-kind-icon]").textContent, "PDF");
  const download = first.querySelector("a[data-library-chat-file-download]");
  assert.equal(download.getAttribute("href"), received.url);
  assert.equal(download.getAttribute("download"), received.name);
  assert.equal(download.textContent, "下载");
  await act(async () => button(second, "打开聊天").click());
  assert.deepEqual(state.openMessages, [{ conversationId: "c-li" }]);
  await act(async () => first.querySelector("[data-collection-card-main]").click());
  assert.deepEqual(globalThis.__opened[0], [received.url, "_blank", "noopener,noreferrer"]);
  await ui.unmount();
});

test("list view uses the collection rows; query and category filter the loaded files", async () => {
  reset([{ body: { items: [received, sent], next: null } }]);
  const ui = mount();
  await ui.render({ query: "", category: "all", view: "list" });
  await settle();
  assert.equal(cards(ui.container).length, 2);
  assert.ok(ui.container.querySelector(".divide-y"), "list uses CollectionItemList");
  await ui.render({ query: "PHOTO", category: "all", view: "list" });
  assert.deepEqual(cards(ui.container).map((node) => node.getAttribute("data-library-chat-file")), ["m2:0"]);
  await ui.render({ query: "", category: "pdf_editing", view: "list" });
  assert.deepEqual(cards(ui.container).map((node) => node.getAttribute("data-library-chat-file")), ["m1:0"]);
  await ui.render({ query: "李四", category: "pdf_editing", view: "list" });
  assert.equal(cards(ui.container).length, 0);
  assert.equal(ui.container.querySelector("[data-empty-title]").textContent, "没有匹配内容");
  assert.equal(state.calls.length, 1, "filters never refetch");
  await ui.unmount();
});

test("loading skeleton, then the empty state", async () => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  reset([{ wait, body: { items: [], next: null } }]);
  const ui = mount();
  await ui.render({ query: "", category: "all", view: "grid" });
  assert.ok(ui.container.querySelector("[data-library-chat-files-loading] [data-skeleton]"), "skeleton while the first page loads");
  assert.equal(ui.container.querySelector("[data-empty]"), null);
  release();
  await settle();
  assert.equal(ui.container.querySelector("[data-library-chat-files-loading]"), null);
  assert.equal(ui.container.querySelector("[data-empty-title]").textContent, "LeoChat 里还没有收发过文件");
  assert.equal(ui.container.querySelector("[data-empty-description]").textContent, "");
  assert.equal(button(ui.container, "重试"), undefined);
  await ui.unmount();
});

test("an error is shown verbatim with 「重试」, which loads again", async () => {
  reset([
    { error: { status: 503, code: "unavailable", message: "relation library_chat_files does not exist" } },
    { body: { items: [received], next: null } },
  ]);
  const ui = mount();
  await ui.render({ query: "", category: "all", view: "grid" });
  await settle();
  assert.equal(ui.container.querySelector("[data-empty-title]").textContent, "relation library_chat_files does not exist");
  await act(async () => button(ui.container, "重试").click());
  await settle();
  assert.equal(state.calls.length, 2);
  assert.equal(cards(ui.container).length, 1);
  await ui.unmount();
});

test("401 asks to sign in, without a retry", async () => {
  reset([{ error: { status: 401, code: "unauthorized", message: "请先登录" } }]);
  const ui = mount();
  await ui.render({ query: "", category: "all", view: "grid" });
  await settle();
  assert.equal(ui.container.querySelector("[data-empty-title]").textContent, "登录后查看 LeoChat 里的文件");
  assert.equal(button(ui.container, "重试"), undefined);
  await ui.unmount();
});

test("the next page loads through the Library sentinel and skipped items are reported", async () => {
  reset([
    { body: { items: [received, { ...received, id: "" }], next: "page-2" } },
    { error: { status: 422, code: "invalid", message: "翻页参数不对" } },
    { body: { items: [sent, { ...sent, url: "ftp://x" }], next: null } },
  ]);
  const ui = mount();
  await ui.render({ query: "", category: "all", view: "grid" });
  await settle();
  assert.equal(cards(ui.container).length, 1);
  assert.equal(ui.container.querySelector("[data-library-chat-files-skipped]").textContent, "有 1 个文件缺少信息，没有显示");
  await act(async () => ui.container.querySelector("[data-collection-load-more]").click());
  await settle();
  assert.equal(state.calls[1].path, "/v1/library/chat-files?cursor=page-2&limit=50");
  assert.equal(ui.container.querySelector('[role="alert"] span').textContent, "翻页参数不对", "a later-page error is verbatim");
  assert.equal(cards(ui.container).length, 1, "loaded files stay");
  await act(async () => button(ui.container, "重试").click());
  await settle();
  assert.equal(state.calls[2].path, "/v1/library/chat-files?cursor=page-2&limit=50", "retry asks for the failed page again");
  assert.deepEqual(cards(ui.container).map((node) => node.getAttribute("data-library-chat-file")), ["m1:0", "m2:0"]);
  assert.equal(ui.container.querySelector("[data-library-chat-files-skipped]").textContent, "有 2 个文件缺少信息，没有显示");
  assert.equal(ui.container.querySelector("[data-collection-infinite-sentinel]"), null, "no sentinel after the last page");
  await ui.unmount();
});

test("a first page whose items were all skipped does not claim there are no files; the next page still loads", async () => {
  reset([
    { body: { items: [{ ...received, name: "" }], next: "page-2" } },
    { body: { items: [sent], next: null } },
  ]);
  const ui = mount();
  await ui.render({ query: "", category: "all", view: "list" });
  await settle();
  assert.equal(ui.container.querySelector("[data-empty]"), null);
  assert.equal(ui.container.querySelector("[data-library-chat-files-skipped]").textContent, "有 1 个文件缺少信息，没有显示");
  await act(async () => ui.container.querySelector("[data-collection-load-more]").click());
  await settle();
  assert.equal(state.calls[1].path, "/v1/library/chat-files?cursor=page-2&limit=50");
  assert.deepEqual(cards(ui.container).map((node) => node.getAttribute("data-library-chat-file")), ["m2:0"]);
  await ui.unmount();
});
