// W09（oceanleo-bay）：ensureBayTerms 与条款弹窗。
// 覆盖：已同意直接 true 且不弹窗；没同意弹窗，同意后 true、关掉（按钮 / Esc / 点遮罩）false；
// 没登录走 requireBayLogin() 并返回 false；境内不弹；并发只弹一个；同意失败留在弹窗里报错；
// 条款改版后提示「条款已更新」；条款正文只当文本显示（含 <script> 也不会变成节点）；非中文页面自己加载词典。
// 网络一律打桩，这份测试里没有任何真实请求。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://design.oceanleo.com/bay",
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const httpStub = dataModule(`
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function route(method, path, body, opts) {
    const bench = globalThis.__bayBench;
    bench.calls.push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
    const hit = bench.routes[method + " " + path.split("?")[0]];
    if (hit === undefined) throw new BayApiError("no route " + method + " " + path, 404);
    if (hit && hit.__status) throw new BayApiError(hit.message || "失败", hit.__status);
    return typeof hit === "function" ? hit(body, path) : JSON.parse(JSON.stringify(hit));
  }
  export const bayGet = (path, opts) => route("GET", path, undefined, opts);
  export const bayPost = (path, body) => route("POST", path, body);
  export const bayPatch = (path, body) => route("PATCH", path, body);
  export const bayDelete = (path) => route("DELETE", path);
`);
const stateStub = dataModule(`
  export function bayEnabledHere() { return globalThis.__bayEnabled !== false; }
  export function requireBayLogin() { globalThis.__bayLoginCalls = (globalThis.__bayLoginCalls || 0) + 1; return false; }
`);
const loadStub = dataModule(`
  export async function loadUiMessages(locale) {
    globalThis.__bayDictLoads = (globalThis.__bayDictLoads || []).concat(locale);
    return { "同意并继续": "Agree and continue", "暂不同意": "Not now" };
  }
`);

const flow = await import(
  await compileModule("src/shell/bay/settings/terms-flow.tsx", {
    "../../../lib/bay/http": httpStub,
    "../shell/bay-state": stateStub,
    "../../../i18n/ui/messages/load": loadStub,
  })
);
const text = await import(
  await compileModule("src/shell/bay/settings/terms-text.tsx", {})
);

const CURRENT = {
  version: 3,
  effective_at: "2026-08-18T00:00:00+00:00",
  sections: [
    { key: "fees", title_zh: "费用", body_md: "**本平台不抽佣。** 第二句。\n\n第二段 <script>alert(1)</script>" },
    { key: "privacy", title_zh: "隐私", body_md: "公开档案只展示你自己选择公开的内容。" },
  ],
};

function bench(routes) {
  globalThis.__bayBench = { calls: [], routes };
  globalThis.__bayEnabled = true;
  globalThis.__bayLoginCalls = 0;
  globalThis.__bayDictLoads = [];
  dom.window.document.documentElement.lang = "";
  return globalThis.__bayBench;
}

function posts(b) {
  return b.calls.filter((call) => call.method === "POST");
}

const dialogOf = () => document.querySelector("[data-bay-terms-dialog]");

async function until(check, label) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    let value;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4));
      value = check();
    });
    if (value) return value;
  }
  assert.fail(`等不到：${label}`);
}

async function click(selector) {
  const button = await until(() => document.querySelector(selector), selector);
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function settleClosed() {
  await until(() => !dialogOf() && !document.querySelector("[data-bay-terms-host]"), "弹窗卸载");
}

test("已同意当前版本：直接 true，不弹窗、不 POST", async () => {
  const b = bench({
    "GET /v1/talent/terms/status": { current: CURRENT, acceptance: { version: 3, accepted_at: "2026-10-01T00:00:00Z" }, accepted: true },
  });
  assert.equal(await flow.ensureBayTerms("buyer"), true);
  assert.equal(dialogOf(), null);
  assert.equal(posts(b).length, 0);
  assert.equal(globalThis.__bayLoginCalls, 0);
});

test("没同意：弹窗，点「同意并继续」后记下版本并返回 true，弹窗卸载", async () => {
  const b = bench({
    "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false },
    "POST /v1/talent/terms/accept": (body) => ({ current: CURRENT, acceptance: { version: body.version, accepted_at: "2026-10-07T04:00:00Z" }, accepted: true }),
  });
  let notified = 0;
  const off = flow.subscribeBayTermsAccepted(() => {
    notified += 1;
  });
  const pending = flow.ensureBayTerms("buyer");
  await until(dialogOf, "条款弹窗出现");
  assert.equal(dialogOf().getAttribute("data-bay-terms-dialog"), "buyer");
  assert.match(document.body.textContent, /继续之前，请先同意使用条款/);
  assert.match(document.body.textContent, /版本 3/);
  assert.match(document.body.textContent, /发需求、下单、接受报价都以这份条款为准/);
  assert.equal(posts(b).length, 0, "点同意之前不记录");
  await click("[data-bay-terms-accept]");
  assert.equal(await pending, true);
  assert.deepEqual(posts(b).map((call) => [call.path, call.body]), [["/v1/talent/terms/accept", { version: 3 }]]);
  await settleClosed();
  assert.equal(notified, 1, "同意后通知设置里的「规则与条款」刷新");
  off();
});

test("卖家入口只换一行说明，条款还是同一份", async () => {
  bench({ "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false } });
  const pending = flow.ensureBayTerms("seller");
  await until(dialogOf, "条款弹窗出现");
  assert.equal(dialogOf().getAttribute("data-bay-terms-dialog"), "seller");
  assert.match(document.body.textContent, /报价、发布服务、接单都以这份条款为准/);
  await click("[data-bay-terms-cancel]");
  assert.equal(await pending, false);
  await settleClosed();
});

test("没同意：「暂不同意」、Esc、点遮罩都返回 false，且不 POST", async () => {
  const b = bench({ "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false } });

  let pending = flow.ensureBayTerms("buyer");
  await click("[data-bay-terms-cancel]");
  assert.equal(await pending, false);
  await settleClosed();

  pending = flow.ensureBayTerms("buyer");
  await until(dialogOf, "弹窗（Esc）");
  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  assert.equal(await pending, false);
  await settleClosed();

  pending = flow.ensureBayTerms("buyer");
  const backdrop = await until(dialogOf, "弹窗（遮罩）");
  await act(async () => {
    backdrop.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
  assert.equal(await pending, false);
  await settleClosed();
  assert.equal(posts(b).length, 0);
});

test("没登录（401）：走 requireBayLogin() 并返回 false，不弹条款", async () => {
  const b = bench({ "GET /v1/talent/terms/status": { __status: 401, message: "请先登录" } });
  assert.equal(await flow.ensureBayTerms("buyer"), false);
  assert.equal(globalThis.__bayLoginCalls, 1);
  assert.equal(dialogOf(), null);
  assert.equal(posts(b).length, 0);
});

test("境内：不请求、不弹窗，返回 false", async () => {
  const b = bench({});
  globalThis.__bayEnabled = false;
  assert.equal(await flow.ensureBayTerms("buyer"), false);
  assert.equal(b.calls.length, 0);
  assert.equal(dialogOf(), null);
});

test("并发调用只弹一个窗，同意后都拿到 true", async () => {
  const b = bench({
    "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false },
    "POST /v1/talent/terms/accept": (body) => ({ current: CURRENT, acceptance: { version: body.version, accepted_at: "2026-10-07T04:00:00Z" }, accepted: true }),
  });
  const first = flow.ensureBayTerms("buyer");
  const second = flow.ensureBayTerms("seller");
  await until(dialogOf, "条款弹窗出现");
  assert.equal(document.querySelectorAll("[data-bay-terms-dialog]").length, 1);
  await click("[data-bay-terms-accept]");
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(posts(b).length, 1);
  await settleClosed();
});

test("同意没记上：弹窗留着并说明原因，之后还能关掉（false）", async () => {
  const b = bench({
    "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false },
    "POST /v1/talent/terms/accept": { __status: 503, message: "服务暂时不可用，请稍后再试" },
  });
  const pending = flow.ensureBayTerms("buyer");
  await click("[data-bay-terms-accept]");
  await until(() => /服务暂时不可用，请稍后再试/.test(document.body.textContent), "报错文字");
  assert.ok(dialogOf(), "没记上就不放行");
  assert.equal(posts(b).length, 1);
  await click("[data-bay-terms-cancel]");
  assert.equal(await pending, false);
  await settleClosed();
});

test("条款改版：提示上次同意的版本需要重新同意", async () => {
  bench({
    "GET /v1/talent/terms/status": { current: CURRENT, acceptance: { version: 2, accepted_at: "2026-08-01T00:00:00Z" }, accepted: false },
  });
  const pending = flow.ensureBayTerms("buyer");
  await until(dialogOf, "条款弹窗出现");
  assert.match(document.body.textContent, /你同意过版本 2（.+）。条款已更新，需要重新同意。/);
  await click("[data-bay-terms-cancel]");
  assert.equal(await pending, false);
  await settleClosed();
});

test("条款正文只当文本显示：粗体拆成 <strong>，<script> 不会变成节点", async () => {
  bench({ "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false } });
  const pending = flow.ensureBayTerms("buyer");
  await until(dialogOf, "条款弹窗出现");
  const fees = document.querySelector('[data-bay-terms-section="fees"]');
  assert.equal(fees.querySelector("h3").textContent, "费用");
  assert.equal(fees.querySelector("strong").textContent, "本平台不抽佣。");
  assert.equal(document.querySelector("[data-bay-terms-host] script"), null);
  assert.match(fees.textContent, /第二段 <script>alert\(1\)<\/script>/);
  await click("[data-bay-terms-cancel]");
  await pending;
  await settleClosed();
});

test("非中文页面：弹窗自己按 <html lang> 加载词典", async () => {
  bench({ "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false } });
  dom.window.document.documentElement.lang = "en";
  const pending = flow.ensureBayTerms("buyer");
  await until(dialogOf, "条款弹窗出现");
  assert.deepEqual(globalThis.__bayDictLoads, ["en"]);
  assert.match(document.body.textContent, /Agree and continue/);
  assert.match(document.body.textContent, /Not now/);
  await click("[data-bay-terms-cancel]");
  assert.equal(await pending, false);
  await settleClosed();
});

test("条款取不到：弹窗给「重试」，没有「同意」按钮", async () => {
  bench({
    "GET /v1/talent/terms/status": { current: null, acceptance: null, accepted: false },
    "GET /v1/talent/terms/current": { __status: 503, message: "条款服务暂时不可用" },
  });
  const pending = flow.ensureBayTerms("buyer");
  await until(dialogOf, "弹窗出现");
  assert.equal(document.querySelector("[data-bay-terms-accept]"), null);
  assert.ok(document.querySelector("[data-bay-terms-reload]"));
  assert.match(document.body.textContent, /条款服务暂时不可用/);
  await click("[data-bay-terms-cancel]");
  assert.equal(await pending, false);
  await settleClosed();
});

test("terms-text：粗体与分段的拆法、时间格式", () => {
  assert.deepEqual(text.bayTermsRuns("a **b** c"), [
    { text: "a ", bold: false },
    { text: "b", bold: true },
    { text: " c", bold: false },
  ]);
  assert.deepEqual(text.bayTermsRuns("落单的 ** 原样"), [
    { text: "落单的 ", bold: false },
    { text: "** 原样", bold: false },
  ]);
  assert.deepEqual(text.bayTermsParagraphs("一\n二\n\n\n三\r\n\r\n  "), ["一\n二", "三"]);
  assert.equal(text.formatBayTermsTime(null), "—");
  assert.equal(text.formatBayTermsTime("not a date"), "—");
  assert.notEqual(text.formatBayTermsTime("2026-08-18T00:00:00+00:00", "en"), "—");
});
