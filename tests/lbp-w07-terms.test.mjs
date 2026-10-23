// leobay-projects W07：规则与条款搬到条款页（门户 /legal/marketplace）。
// 覆盖：
//   · BayTermsPublic（I-9）：先显示加载，再渲染版本号、生效日期与网关下发的 9 节（每节带锚点、目录链到锚点）；
//     不登录就能读（只请求 current，一次 status / 同意相关的请求都没有）；不说「你同意过第几版」；
//     正文只当文本；带 #bay-terms-<节> 打开时就绪后滚到那一节；失败给原因 + 「重试」，重试成功后渲染；
//     不带任何 `dark:` 类（门户法律页永远是白底）。
//   · 同意弹窗（ensureBayTerms）与条款门（BayTermsGate）里的「在条款页查看全文」：
//     地址是 portalHref("/legal/marketplace") + #bay-terms，新窗口、noopener；条款取不到时链接还在。
//   · 弹窗里「你同意过版本 N，条款已更新，需要重新同意」那一句保留。
//   · 地址常量 / 锚点；BayTermsPublic 不依赖设置窗里的钩子与旧「规则与条款」页。
// 网络一律打桩，这份测试里没有任何真实请求；不引用 BayTermsOverview。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

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
  export async function loadUiMessages() { return {}; }
`);

const stubs = {
  "../../../lib/bay/http": httpStub,
  "../shell/bay-state": stateStub,
  "../../../i18n/ui/messages/load": loadStub,
};

const publicModule = await import(await compileModule("src/shell/bay/settings/BayTermsPublic.tsx", stubs));
const flow = await import(await compileModule("src/shell/bay/settings/terms-flow.tsx", stubs));
const gateModule = await import(await compileModule("src/shell/bay/settings/BayTermsGate.tsx", stubs));
const termsLib = await import(await compileModule("src/lib/bay/terms.ts", stubs));
const termsText = await import(await compileModule("src/shell/bay/settings/terms-text.tsx", stubs));
const { BayTermsPublic } = publicModule;
const { BayTermsGate } = gateModule;

// 与网关今天下发的 v3 同形：9 节，键与标题都是线上的。正文缩短，保留粗体与一个 <script> 当文本的探针。
const SECTION_KEYS = [
  ["knowledge_only", "平台提供的是知识答疑"],
  ["how_it_works", "市场怎么运转"],
  ["fees", "费用"],
  ["off_platform", "站外交易"],
  ["dispute", "纠纷处理"],
  ["verification", "身份核验"],
  ["data_residency", "数据存放"],
  ["privacy", "隐私"],
  ["dispute_forum", "第三方争议解决"],
];
const CURRENT = {
  version: 3,
  effective_at: "2026-08-18T00:00:00+00:00",
  sections: SECTION_KEYS.map(([key, title_zh]) => ({
    key,
    title_zh,
    body_md:
      key === "fees"
        ? "**本平台不抽佣。** 平台抽佣恒为 0。\n\n第二段 <script>alert(1)</script>"
        : `${title_zh}的正文。\n第二行。`,
  })),
};

function bench(routes) {
  globalThis.__bayBench = { calls: [], routes };
  globalThis.__bayEnabled = true;
  globalThis.__bayLoginCalls = 0;
  dom.window.document.documentElement.lang = "";
  dom.window.location.hash = "";
  return globalThis.__bayBench;
}

const getCalls = (b) => b.calls.filter((call) => call.method === "GET");

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

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function click(node) {
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

// ── BayTermsPublic ────────────────────────────────────────────────────────────

test("BayTermsPublic：加载 → 版本号与生效日期 → 网关下发的 9 节，每节带锚点，目录链到锚点", async () => {
  const b = bench({ "GET /v1/talent/terms/current": { current: CURRENT } });
  const view = await mount(React.createElement(BayTermsPublic, { className: "terms-probe" }));
  const root = view.host.querySelector("[data-bay-terms-public]");
  assert.ok(root, "挂载就有根节点");
  assert.equal(root.className, "terms-probe", "className 落在根节点上");

  await until(() => view.host.querySelector('[data-bay-terms-public][data-state="ready"]'), "条款就绪");
  const ready = view.host.querySelector("[data-bay-terms-public]");
  assert.equal(ready.getAttribute("data-bay-terms-version"), "3");
  const meta = ready.querySelector("[data-bay-terms-meta]").textContent;
  assert.match(meta, /当前版本 3/);
  assert.match(meta, /生效时间：.*2026.*8.*18/, "生效日期按 UTC 日历日显示，不差一天");
  assert.match(ready.textContent, /条款正文只有中文；节标题会随界面语言变化。/);

  const sections = [...ready.querySelectorAll("[data-bay-terms-section]")];
  assert.deepEqual(
    sections.map((node) => node.getAttribute("data-bay-terms-section")),
    SECTION_KEYS.map(([key]) => key),
    "9 节一节不少、次序照网关",
  );
  for (const [key, title] of SECTION_KEYS) {
    const section = ready.querySelector(`[data-bay-terms-section="${key}"]`);
    assert.equal(section.id, `bay-terms-${key}`, `${key} 带锚点`);
    assert.equal(section.querySelector("h3").textContent, title);
  }

  const links = [...ready.querySelectorAll("[data-bay-terms-toc] a")];
  assert.equal(links.length, 9, "目录 9 项");
  assert.deepEqual(
    links.map((node) => node.getAttribute("href")),
    SECTION_KEYS.map(([key]) => `#bay-terms-${key}`),
  );
  for (const link of links) {
    const target = ready.querySelector(link.getAttribute("href"));
    assert.ok(target, `目录项 ${link.textContent} 指向的锚点存在`);
  }

  // 不登录就能读：只取 current，且声明 anonymous；没有 status / 同意相关的请求，没有任何写。
  assert.deepEqual(
    b.calls.map((call) => [call.method, call.path, call.anonymous]),
    [["GET", "/v1/talent/terms/current", true]],
  );
  assert.equal(globalThis.__bayLoginCalls, 0, "不弹登录框");
  await view.unmount();
});

test("BayTermsPublic：请求没回来之前是加载态（占位、不画节），回来之后换成正文", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  bench({ "GET /v1/talent/terms/current": () => gate });
  const view = await mount(React.createElement(BayTermsPublic, {}));
  const loading = view.host.querySelector("[data-bay-terms-public]");
  assert.equal(loading.getAttribute("data-state"), "loading");
  assert.match(loading.textContent, /正在加载…/);
  assert.equal(loading.querySelector("[data-bay-terms-section]"), null);
  assert.equal(loading.querySelector("[data-bay-terms-retry]"), null, "加载中不给重试");
  await act(async () => {
    release(JSON.parse(JSON.stringify({ current: CURRENT })));
  });
  await until(() => view.host.querySelector('[data-state="ready"]'), "条款就绪");
  assert.equal(view.host.querySelectorAll("[data-bay-terms-section]").length, 9);
  await view.unmount();
});

test("BayTermsPublic：只讲规则本身，不显示「你同意过第几版」，正文只当文本", async () => {
  bench({ "GET /v1/talent/terms/current": { current: CURRENT } });
  const view = await mount(React.createElement(BayTermsPublic, {}));
  await until(() => view.host.querySelector('[data-state="ready"]'), "条款就绪");
  const text = view.host.textContent;
  for (const phrase of ["你同意过", "你已同意", "还没有同意", "登录后查看", "同意时间", "同意并继续"]) {
    assert.ok(!text.includes(phrase), `不应出现「${phrase}」`);
  }
  assert.equal(view.host.querySelector("button"), null, "就绪态没有任何按钮（没有「同意」）");
  const fees = view.host.querySelector('[data-bay-terms-section="fees"]');
  assert.equal(fees.querySelector("strong").textContent, "本平台不抽佣。");
  assert.equal(view.host.querySelector("script"), null, "<script> 不会变成节点");
  assert.match(fees.textContent, /第二段 <script>alert\(1\)<\/script>/);
  await view.unmount();
});

test("BayTermsPublic：门户法律页永远是白底，所以一个 dark: 类都不带", async () => {
  bench({ "GET /v1/talent/terms/current": { current: CURRENT } });
  const view = await mount(React.createElement(BayTermsPublic, {}));
  await until(() => view.host.querySelector('[data-state="ready"]'), "条款就绪");
  assert.doesNotMatch(view.host.innerHTML, /dark:/);
  await view.unmount();
});

test("BayTermsPublic：失败给原因与「重试」，重试成功后渲染 9 节", async () => {
  const b = bench({ "GET /v1/talent/terms/current": { __status: 503, message: "条款服务暂时不可用" } });
  const view = await mount(React.createElement(BayTermsPublic, {}));
  const failed = await until(() => view.host.querySelector('[data-bay-terms-public][data-state="error"]'), "失败态");
  assert.match(failed.querySelector('[role="alert"]').textContent, /条款服务暂时不可用/);
  assert.equal(failed.querySelector("[data-bay-terms-section]"), null, "失败时不画任何节");
  const retry = failed.querySelector("[data-bay-terms-retry]");
  assert.ok(retry, "有重试按钮");
  assert.equal(retry.textContent, "重试");
  assert.equal(getCalls(b).length, 1);

  // 网关恢复，点重试。
  b.routes["GET /v1/talent/terms/current"] = { current: CURRENT };
  await click(retry);
  await until(() => view.host.querySelector('[data-bay-terms-public][data-state="ready"]'), "重试后就绪");
  assert.equal(view.host.querySelectorAll("[data-bay-terms-section]").length, 9);
  assert.equal(getCalls(b).length, 2, "重试就是再取一次");
  assert.equal(view.host.querySelector("[data-bay-terms-retry]"), null, "就绪后没有重试按钮");
  await view.unmount();
});

test("BayTermsPublic：重试时先回到加载态；再失败还停在失败态并能继续重试", async () => {
  const b = bench({ "GET /v1/talent/terms/current": { __status: 500, message: "第一次失败" } });
  const view = await mount(React.createElement(BayTermsPublic, {}));
  const failed = await until(() => view.host.querySelector('[data-state="error"]'), "失败态");
  b.routes["GET /v1/talent/terms/current"] = { __status: 500, message: "第二次失败" };
  await click(failed.querySelector("[data-bay-terms-retry]"));
  await until(() => /第二次失败/.test(view.host.textContent), "第二次的原因");
  assert.ok(view.host.querySelector("[data-bay-terms-retry]"), "还能继续重试");
  assert.equal(getCalls(b).length, 2);
  await view.unmount();
});

test("BayTermsPublic：网关回了没有任何节的空文档，按失败处理（兜底文案 + 重试），不画空白页", async () => {
  bench({ "GET /v1/talent/terms/current": { current: { version: 4, effective_at: null, sections: [] } } });
  const view = await mount(React.createElement(BayTermsPublic, {}));
  const failed = await until(() => view.host.querySelector('[data-state="error"]'), "失败态");
  assert.match(failed.textContent, /条款加载失败，请稍后重试/);
  assert.ok(failed.querySelector("[data-bay-terms-retry]"));
  await view.unmount();
});

test("BayTermsPublic：没有生效日期时只写版本号；老式整篇正文也能显示成一节", async () => {
  bench({ "GET /v1/talent/terms/current": { version: 2, effective_at: null, body: "整篇条款。\n\n第二段。", sections: [] } });
  const view = await mount(React.createElement(BayTermsPublic, {}));
  await until(() => view.host.querySelector('[data-state="ready"]'), "条款就绪");
  const meta = view.host.querySelector("[data-bay-terms-meta]").textContent;
  assert.match(meta, /当前版本 2/);
  assert.ok(!meta.includes("生效时间"), "没有日期就不写「生效时间」");
  assert.equal(view.host.querySelectorAll("[data-bay-terms-section]").length, 1);
  await view.unmount();
});

test("BayTermsPublic：带 #bay-terms-<节> 打开，就绪后滚到那一节；别的锚点不管", async () => {
  const scrolled = [];
  const original = dom.window.Element.prototype.scrollIntoView;
  dom.window.Element.prototype.scrollIntoView = function scrollIntoView() {
    scrolled.push(this.id);
  };
  try {
    bench({ "GET /v1/talent/terms/current": { current: CURRENT } });
    dom.window.location.hash = "#bay-terms-fees";
    let view = await mount(React.createElement(BayTermsPublic, {}));
    await until(() => view.host.querySelector('[data-state="ready"]'), "条款就绪");
    await until(() => scrolled.length > 0, "滚动");
    assert.deepEqual(scrolled, ["bay-terms-fees"]);
    await view.unmount();

    scrolled.length = 0;
    bench({ "GET /v1/talent/terms/current": { current: CURRENT } });
    dom.window.location.hash = "#somewhere-else";
    view = await mount(React.createElement(BayTermsPublic, {}));
    await until(() => view.host.querySelector('[data-state="ready"]'), "条款就绪");
    assert.deepEqual(scrolled, [], "不是条款节的锚点不代滚");
    await view.unmount();

    scrolled.length = 0;
    bench({ "GET /v1/talent/terms/current": { current: CURRENT } });
    dom.window.location.hash = "#bay-terms-no_such_section";
    view = await mount(React.createElement(BayTermsPublic, {}));
    await until(() => view.host.querySelector('[data-state="ready"]'), "条款就绪");
    assert.deepEqual(scrolled, [], "找不到那一节就不动，也不报错");
    await view.unmount();
  } finally {
    if (original) dom.window.Element.prototype.scrollIntoView = original;
    else delete dom.window.Element.prototype.scrollIntoView;
    dom.window.location.hash = "";
  }
});

// ── 「在条款页查看全文」──────────────────────────────────────────────────────

const PORTAL_TERMS = "https://oceanleo.com/legal/marketplace#bay-terms";

function assertFullTextLink(link, where) {
  assert.ok(link, `${where}里有「在条款页查看全文」链接`);
  assert.equal(link.textContent, "在条款页查看全文");
  assert.equal(link.getAttribute("href"), PORTAL_TERMS, `${where}的链接去门户条款页「LeoBay 使用规则」一节`);
  assert.equal(link.getAttribute("target"), "_blank", `${where}新窗口打开`);
  assert.match(link.getAttribute("rel") || "", /noopener/);
  assert.match(link.getAttribute("rel") || "", /noreferrer/);
}

const dialogOf = () => document.querySelector("[data-bay-terms-dialog]");

async function settleClosed() {
  await until(() => !dialogOf() && !document.querySelector("[data-bay-terms-host]"), "弹窗卸载");
}

test("同意弹窗：有「在条款页查看全文」，地址是门户条款页的 #bay-terms，新窗口；点它不关弹窗也不记录同意", async () => {
  const b = bench({
    "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false },
  });
  const pending = flow.ensureBayTerms("buyer");
  await until(dialogOf, "条款弹窗出现");
  assertFullTextLink(dialogOf().querySelector("[data-bay-terms-fulltext]"), "弹窗");
  assert.equal(dialogOf().querySelectorAll("[data-bay-terms-fulltext]").length, 1);
  // 点链接只是一个普通的 <a>：不拦截、不关窗、不 POST。
  let prevented = false;
  const link = dialogOf().querySelector("[data-bay-terms-fulltext]");
  link.addEventListener("click", (event) => {
    prevented = event.defaultPrevented;
    event.preventDefault(); // JSDOM 里别真去导航
  });
  await click(link);
  assert.equal(prevented, false, "弹窗没有拦截这次点击");
  assert.ok(dialogOf(), "弹窗还在");
  assert.equal(b.calls.filter((call) => call.method === "POST").length, 0);
  await act(async () => {
    dialogOf().querySelector("[data-bay-terms-cancel]").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(await pending, false);
  await settleClosed();
});

test("同意弹窗：卖家入口同一个链接；条款取不到时链接还在（人可以先去条款页看）", async () => {
  bench({ "GET /v1/talent/terms/status": { current: null, acceptance: null, accepted: false }, "GET /v1/talent/terms/current": { __status: 503, message: "条款服务暂时不可用" } });
  const pending = flow.ensureBayTerms("seller");
  await until(dialogOf, "条款弹窗出现");
  assert.equal(dialogOf().getAttribute("data-bay-terms-dialog"), "seller");
  assert.equal(document.querySelector("[data-bay-terms-accept]"), null, "取不到就没有「同意」按钮");
  assertFullTextLink(dialogOf().querySelector("[data-bay-terms-fulltext]"), "取不到条款时的弹窗");
  await act(async () => {
    dialogOf().querySelector("[data-bay-terms-cancel]").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(await pending, false);
  await settleClosed();
});

test("同意弹窗：「你同意过版本 N，条款已更新，需要重新同意」保留，链接也在", async () => {
  bench({
    "GET /v1/talent/terms/status": { current: CURRENT, acceptance: { version: 2, accepted_at: "2026-08-01T00:00:00Z" }, accepted: false },
  });
  const pending = flow.ensureBayTerms("buyer");
  await until(dialogOf, "条款弹窗出现");
  assert.match(dialogOf().textContent, /你同意过版本 2（.+）。条款已更新，需要重新同意。/);
  assertFullTextLink(dialogOf().querySelector("[data-bay-terms-fulltext]"), "改版后的弹窗");
  await act(async () => {
    dialogOf().querySelector("[data-bay-terms-cancel]").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(await pending, false);
  await settleClosed();
});

test("条款门：没同意时有同一个「在条款页查看全文」；同意之后渲染 children", async () => {
  const b = bench({
    "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false },
    "POST /v1/talent/terms/accept": (body) => ({ current: CURRENT, acceptance: { version: body.version, accepted_at: "2026-10-23T04:00:00Z" }, accepted: true }),
  });
  const view = await mount(React.createElement(BayTermsGate, { scope: "seller" }, React.createElement("p", { "data-gate-child": "" }, "放行后的内容")));
  const gate = await until(() => view.host.querySelector("[data-bay-terms-gate]"), "条款门出现");
  assert.equal(gate.getAttribute("data-bay-terms-gate"), "seller");
  assertFullTextLink(gate.querySelector("[data-bay-terms-fulltext]"), "条款门");
  assert.equal(gate.querySelectorAll("[data-bay-terms-section]").length, 9, "门里仍是全文");
  assert.equal(view.host.querySelector("[data-gate-child]"), null, "没同意不放行");
  await click(gate.querySelector("[data-bay-terms-gate-accept]"));
  await until(() => view.host.querySelector("[data-gate-child]"), "放行");
  assert.equal(view.host.querySelector("[data-bay-terms-gate]"), null);
  assert.equal(b.calls.filter((call) => call.method === "POST").length, 1);
  await view.unmount();
});

test("链接在门户自己的域名上保持相对路径（不跳到别的站）", async () => {
  bench({ "GET /v1/talent/terms/status": { current: CURRENT, acceptance: null, accepted: false } });
  dom.reconfigure({ url: "https://oceanleo.com/bay" });
  try {
    const pending = flow.ensureBayTerms("buyer");
    await until(dialogOf, "条款弹窗出现");
    assert.equal(dialogOf().querySelector("[data-bay-terms-fulltext]").getAttribute("href"), "/legal/marketplace#bay-terms");
    await act(async () => {
      dialogOf().querySelector("[data-bay-terms-cancel]").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    assert.equal(await pending, false);
    await settleClosed();
  } finally {
    dom.reconfigure({ url: "https://design.oceanleo.com/bay" });
  }
});

// ── 地址常量与依赖 ───────────────────────────────────────────────────────────

test("条款页地址：常量、整页锚点与按节锚点（只留安全字符）", () => {
  assert.equal(termsLib.BAY_TERMS_PAGE_PATH, "/legal/marketplace");
  assert.equal(termsLib.BAY_TERMS_PAGE_ANCHOR, "bay-terms");
  assert.equal(termsLib.bayTermsPagePath(), "/legal/marketplace#bay-terms");
  assert.equal(termsLib.bayTermsPagePath(null), "/legal/marketplace#bay-terms");
  assert.equal(termsLib.bayTermsPagePath("fees"), "/legal/marketplace#bay-terms-fees");
  assert.equal(termsLib.bayTermsPagePath("a b/../c"), "/legal/marketplace#bay-terms-abc");
  assert.equal(termsLib.bayTermsAnchor("data_residency"), "bay-terms-data_residency");
});

test("生效日期只取日期，按 UTC 日历日，与测试机时区无关；空值与坏值显示破折号", () => {
  assert.equal(termsText.formatBayTermsDate("2026-08-18T00:00:00+00:00", "en"), "August 18, 2026");
  assert.equal(termsText.formatBayTermsDate("2026-08-18T00:00:00Z", "zh"), "2026年8月18日");
  // 晚一点的零点后时刻仍是同一个 UTC 日。
  assert.equal(termsText.formatBayTermsDate("2026-08-18T23:59:59Z", "en"), "August 18, 2026");
  assert.equal(termsText.formatBayTermsDate(null), "—");
  assert.equal(termsText.formatBayTermsDate(""), "—");
  assert.equal(termsText.formatBayTermsDate("not a date"), "—");
});

test("BayTermsPublic 自带取数：不依赖设置窗的钩子、条款流程和登录态，也不引用旧的「规则与条款」页", () => {
  const source = read("src/shell/bay/settings/BayTermsPublic.tsx");
  for (const forbidden of ["use-bay-load", "terms-flow", "bay-state", "BayTermsOverview", "requireBayLogin", "fetchBayTermsStatus", "acceptBayTerms"]) {
    assert.ok(!source.includes(forbidden), `BayTermsPublic 不应引用 ${forbidden}`);
  }
  assert.match(source, /fetchBayTermsCurrent/);
  // I-9：从设置目录的出口导出，门户通过 @oceanleo/ui/shell 取用。
  assert.match(read("src/shell/bay/settings/index.ts"), /export \{ BayTermsPublic \} from "\.\/BayTermsPublic"/);
});

test("本波自己的文案：「在条款页查看全文」17 种语言都有译文，其余文案复用已有词条", async () => {
  const { LBP_W07_MESSAGES } = await import(pathToFileURL(resolve(ROOT, "src/i18n/ui/messages/lbp-w07-copy.ts")).href);
  const locales = Object.keys(LBP_W07_MESSAGES);
  assert.equal(locales.length, 17);
  for (const locale of locales) {
    const table = LBP_W07_MESSAGES[locale];
    assert.deepEqual(Object.keys(table), ["在条款页查看全文"], `${locale} 只登记本波新增的这一条`);
    assert.ok(table["在条款页查看全文"].trim(), `${locale} 有译文`);
  }
  assert.equal(LBP_W07_MESSAGES.zh["在条款页查看全文"], "在条款页查看全文");
  assert.notEqual(LBP_W07_MESSAGES.en["在条款页查看全文"], "在条款页查看全文");
});
