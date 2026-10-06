// F02 判据：邀请二维码。只为「https、本家门户」的邀请地址画码；画成 <img src=data:image/png>（不走 SVG 字符串注入）；
// 有「下载二维码」（PNG）；生成失败或地址不合格时不显示码；联系人邀请与群邀请两处都有码。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/im-invite-qr.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const uiPrimitivesStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  const h = React.createElement;
  export function Modal({ children }) { return h("div", { role: "dialog", "data-modal": "" }, children); }
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
  export function portalHref(path) { return "https://oceanleo.com" + path; }
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
  "../../../lib/im/client": imClientStub,
  "./client": imClientStub,
};

const qrModule = await import(await compileModule("src/shell/messages/people/InviteQrCode.tsx", STUBS));
const { InviteQrCode, portalInviteUrlOf, qrFileName } = qrModule;
const { InviteLinkDialog } = await import(await compileModule("src/shell/messages/people/InviteLinkDialog.tsx", STUBS));

const GOOD = "https://oceanleo.com/join?code=abc123";
const PNG = /^data:image\/png;base64,/;

test("portalInviteUrlOf：只认 https 且 origin 正好是本家门户", () => {
  assert.equal(portalInviteUrlOf(GOOD), GOOD);
  assert.equal(portalInviteUrlOf("https://oceanleo.com/join?code=a%20b"), "https://oceanleo.com/join?code=a%20b");
  for (const bad of [
    "http://oceanleo.com/join?code=a",
    "https://evil.example.com/join?code=a",
    "https://oceanleo.com.evil.example.com/join?code=a",
    "https://oceanleo.com@evil.example.com/join?code=a",
    "https://user:pw@oceanleo.com/join?code=a",
    "https://oceanleo.cn/join?code=a",
    "https://dev.oceanleo.com/join?code=a",
    "https://oceanleo.app/join?code=a",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "/join?code=a",
    "随便一段文字",
    "",
    null,
    undefined,
    42,
    "https://oceanleo.com/" + "a".repeat(2100),
  ]) {
    assert.equal(portalInviteUrlOf(bad), null, String(bad).slice(0, 60));
  }
  // 可显式给门户 origin（别的家族）
  assert.equal(portalInviteUrlOf("https://oceanleo.cn/join?code=a", "https://oceanleo.cn"), "https://oceanleo.cn/join?code=a");
});

test("qrFileName：说明文字变成 .png 文件名，去掉非法字符", () => {
  assert.equal(qrFileName("邀请二维码-加联系人"), "邀请二维码-加联系人.png");
  assert.equal(qrFileName("邀请二维码-加入 Team"), "邀请二维码-加入-Team.png");
  assert.equal(qrFileName('a/b\\c:d*e?"f<g>h|'), "abcdefgh.png");
  assert.equal(qrFileName("  "), "invite-qr.png");
});

test("InviteQrCode：本家门户地址出码（<img data:image/png>）并有下载 PNG 的按钮", async () => {
  const view = await mount(React.createElement(InviteQrCode, { url: GOOD, fileLabel: "邀请二维码-加联系人" }));
  try {
    const img = view.q("img[data-invite-qr]");
    assert.ok(img, "应该画出二维码");
    assert.match(img.getAttribute("src"), PNG);
    assert.ok(img.getAttribute("src").length > 300, "码图不是空的");
    assert.equal(img.getAttribute("alt"), "邀请二维码");
    const dl = view.q('a[data-action="download-qr"]');
    assert.ok(dl, "应该有下载二维码");
    assert.match(dl.getAttribute("href"), PNG);
    assert.equal(dl.getAttribute("download"), "邀请二维码-加联系人.png");
    assert.equal(dl.textContent, "下载二维码");
    assert.equal(view.qa("svg").length, 0, "不用 SVG 字符串注入");
  } finally {
    view.cleanup();
  }
});

test("InviteQrCode：别家 / http / 非链接 一律不画码，也不出下载按钮", async () => {
  for (const url of ["https://evil.example.com/join?code=a", "http://oceanleo.com/join?code=a", "随便一段文字", "javascript:alert(1)", ""]) {
    const view = await mount(React.createElement(InviteQrCode, { url, fileLabel: "x" }));
    try {
      assert.equal(view.q("img"), null, url);
      assert.equal(view.q('[data-action="download-qr"]'), null, url);
      assert.equal(view.host.innerHTML, "", "什么都不显示：" + url);
    } finally {
      view.cleanup();
    }
  }
});

test("InviteQrCode：生成失败时不显示码、不崩（链接在别处照常可用）", async () => {
  const failing = await import(
    await compileModule("src/shell/messages/people/InviteQrCode.tsx", {
      ...STUBS,
      qrcode: dataModule(`export async function toDataURL() { throw new Error("boom"); }`),
    })
  );
  const view = await mount(React.createElement(failing.InviteQrCode, { url: GOOD, fileLabel: "x" }));
  try {
    assert.equal(view.host.innerHTML, "");
  } finally {
    view.cleanup();
  }
});

test("InviteQrCode 源码：用 toDataURL，不用 SVG 字符串 + dangerouslySetInnerHTML", () => {
  const src = readFileSync(new URL("../src/shell/messages/people/InviteQrCode.tsx", import.meta.url), "utf8");
  assert.match(src, /toDataURL/);
  assert.ok(!/dangerouslySetInnerHTML\s*=/.test(src), "不许 dangerouslySetInnerHTML");
  assert.ok(!/type:\s*["']svg["']/.test(src), "不许 toString({type:svg})");
  assert.ok(!/innerHTML\s*=/.test(src));
});

function linkRow(over = {}) {
  return {
    code: "abc123", kind: "contact", url: GOOD, conversation_id: null, requires_approval: false,
    max_uses: null, uses: 0, expires_at: null, created_at: "2026-10-06T00:00:00Z", ...over,
  };
}

test("联系人邀请：生成链接后自动出二维码，能下载；已有链接可显示 / 隐藏二维码", async () => {
  const existing = linkRow({ code: "old1", url: "https://oceanleo.com/join?code=old1" });
  const created = linkRow({ code: "new1", url: "https://oceanleo.com/join?code=new1" });
  const store = [existing];
  const im = {
    fetch: router({
      "GET /v1/im/invite-links": () => ({ items: store.slice() }),
      "POST /v1/im/invite-links": () => { store.push(created); return { link: created }; },
    }),
  };
  const view = await mount(React.createElement(InviteLinkDialog, { onClose() {} }), im);
  try {
    assert.equal(view.q("img[data-invite-qr]"), null, "还没点开就没有码");
    await view.click(view.q('[data-invite-code="old1"] [data-action="toggle-qr"]'));
    assert.ok(view.q('[data-invite-code="old1"] img[data-invite-qr]'), "已有链接显示二维码");
    assert.equal(view.q('[data-invite-code="old1"] [data-action="toggle-qr"]').textContent, "隐藏二维码");
    assert.equal(view.q('[data-invite-code="old1"] a[data-action="download-qr"]').getAttribute("download"), "邀请二维码-加联系人.png");
    await view.click(view.q('[data-invite-code="old1"] [data-action="toggle-qr"]'));
    assert.equal(view.q("img[data-invite-qr]"), null, "再点一下收起");

    await view.click(view.q('[data-action="generate"]'));
    const posted = im.fetch.calls.find((c) => c.method === "POST");
    assert.equal(posted.json.kind, "contact");
    assert.ok(view.q('[data-invite-code="new1"] img[data-invite-qr]'), "新生成的链接自动展开二维码");
    assert.equal(view.qa("img[data-invite-qr]").length, 1);
  } finally {
    view.cleanup();
  }
});

test("群邀请链接：同样有二维码和下载，文件名说明是加入群聊", async () => {
  const link = linkRow({ code: "g1", kind: "group", conversation_id: "c1", url: "https://oceanleo.com/join?code=g1" });
  const im = { fetch: router({ "GET /v1/im/invite-links": { items: [link] } }) };
  const view = await mount(React.createElement(InviteLinkDialog, { onClose() {}, conversationId: "c1" }), im);
  try {
    await view.click(view.q('[data-invite-code="g1"] [data-action="toggle-qr"]'));
    assert.ok(view.q('[data-invite-code="g1"] img[data-invite-qr]'));
    assert.equal(view.q('[data-invite-code="g1"] a[data-action="download-qr"]').getAttribute("download"), "邀请二维码-加入群聊.png");
  } finally {
    view.cleanup();
  }
});

test("邀请链接不是本家门户地址时：不出码，链接和复制照常可用", async () => {
  const link = linkRow({ code: "x1", url: "https://evil.example.com/join?code=x1" });
  const im = { fetch: router({ "GET /v1/im/invite-links": { items: [link] } }) };
  const view = await mount(React.createElement(InviteLinkDialog, { onClose() {} }), im);
  try {
    await view.click(view.q('[data-invite-code="x1"] [data-action="toggle-qr"]'));
    assert.equal(view.q("img[data-invite-qr]"), null);
    assert.equal(view.q('[data-invite-code="x1"] input').value, "https://evil.example.com/join?code=x1");
    assert.ok(view.q('[data-invite-code="x1"] [data-action="copy"]'));
  } finally {
    view.cleanup();
  }
});
