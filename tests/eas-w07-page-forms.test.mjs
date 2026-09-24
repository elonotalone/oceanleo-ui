// 「AI 模型」「我的设备」两张共享页的两种形态（editors-and-shell-0924 W07）。
//
// 设置窗「能力」组的「AI 模型」「我的设备」现在是面板，直接渲染 `ApiPage variant="pane"`、
// `DevicesPage variant="pane"`；门户 `/api`、`/devices` 独立页照旧渲染缺省（page）形态。
//
//   ① page 形态逐字不变：下面两份快照是 W07 动这两份文件**之前**（main `9f5ebf0`）
//      用同一组替身渲染出来的整页 HTML。页面上多一个 class、少一个属性都会红。
//   ② pane 形态没有统一页头（没有「返回」、没有 h1）——面板区自己有标题，页头的「返回」
//      会把设置窗背后的页面退回上一页；也不带整页外边距，能在面板区里收缩滚动。
//   ③ pane 形态的正文与 page 形态逐字相同：面板不是另一份删减版。
//   ④ 我的设备 pane 不读地址栏的 `?tab=cloud`：地址栏属于设置窗背后的页面。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/eas-w07-page-forms.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/api",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const authStub = dataModule(`
  const user = { id: "u-1", email: "designer@oceanleo.com" };
  export function oceanleoConfigured() { return true; }
  export function loginUnavailableNotice() { return null; }
  export function browserClient() {
    return { auth: {
      getUser: async () => ({ data: { user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } };
  }
  export async function getCredits() { return { ok: true, data: { balance: 12.5, currency: "CNY" } }; }
  export async function getModelCatalog() {
    return { ok: true, data: { model_count: 42, providers: [
      { id: "bailian", label: "百炼", model_count: 30, generated_at: "", source_url: "https://help.aliyun.com/price" },
      { id: "openrouter", label: "OpenRouter", model_count: 12, generated_at: "" },
    ] } };
  }
  export function pricingDocUrl(provider, kind) { return "/pricing/" + provider + "." + kind; }
`);
const byokStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ByokKeys({ loggedIn }) {
    return React.createElement("div", { "data-stub": "byok", "data-logged-in": String(loggedIn) });
  }
`);
const marketStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ModelGroupManager({ user }) {
    return React.createElement("div", { "data-stub": "model-groups", "data-user": String(user) });
  }
`);
const confirmStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title }) { return React.createElement("div", { "data-stub": "confirm" }, title); }
`);
const facadeStub = dataModule(`export const devicesFacade = null;`);
const cloudStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CloudComputersSection({ autoFocus }) {
    return React.createElement("div", { "data-stub": "cloud", "data-autofocus": String(Boolean(autoFocus)) });
  }
  export function CloudComputersPage() { return null; }
`);

const { ApiPage } = await import(
  await compileModule("src/pages/ApiPage.tsx", {
    "../lib/auth": authStub,
    "../i18n/ui/useUI": uiStub,
    "./ByokKeys": byokStub,
    "./ModelCapabilityMarket": marketStub,
  })
);
const { DevicesPage } = await import(
  await compileModule("src/pages/DevicesPage.tsx", {
    "../facades/devices": facadeStub,
    "../i18n/ui/useUI": uiStub,
    "../ui": confirmStub,
    "./CloudComputersPage": cloudStub,
  })
);

const devicesClient = {
  async listDevices() {
    return {
      ok: true,
      data: [
        { device_id: "d-1", platform: "windows", device_name: "家里的电脑", online: true, local_exec_enabled: true, granted_kinds: ["read", "write"], last_seen_at: "" },
        { device_id: "d-2", platform: "macos", device_name: "公司笔记本", online: false, local_exec_enabled: false, granted_kinds: [], last_seen_at: "" },
      ],
    };
  },
};

async function render(element, path) {
  window.history.replaceState(null, "", path);
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  for (let i = 0; i < 6; i += 1) await act(async () => {});
  return {
    html: () => host.innerHTML,
    rootClass: () => host.firstElementChild?.getAttribute("class") || "",
    rootHas: (attribute) => Boolean(host.firstElementChild?.hasAttribute(attribute)),
    find: (selector) => host.querySelector(selector),
    backButtons: () => [...host.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === "返回").length,
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const lines = (html) => html.replace(/></g, ">\n<");

const API_PAGE_SNAPSHOT = String.raw`<div class="px-8 py-6">
<div class="relative flex items-center justify-center py-1">
<button type="button" aria-label="返回" title="返回" class="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-100 hover:text-neutral-900 active:scale-95">
<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round">
</path>
</svg>
</button>
<h1 class="text-[22px] font-semibold tracking-tight text-neutral-900">AI 模型</h1>
</div>
<div class="mx-auto mt-6 max-w-3xl space-y-8">
<section class="v-fade-up">
<div class="rounded-2xl border border-neutral-200 p-5">
<div class="flex flex-wrap items-end justify-between gap-4">
<div>
<p class="text-[12px] text-neutral-500">token 余额</p>
<p class="mt-1 text-[26px] font-semibold tabular-nums text-neutral-900">¥12.5000</p>
</div>
<div class="flex items-center gap-2">
<a href="/api/guide" class="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] font-medium text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">指导文档</a>
<a href="https://oceanleo.com/billing" class="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800">充值</a>
</div>
</div>
<div class="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[12px] leading-relaxed text-emerald-800">计费规则：你支付的费用 = 该模型对应厂商的官方 token 市场价。<span class="font-semibold">OceanLeo 不加价、不抽成</span>。每笔调用都可审计；使用自己的厂商 API key（BYOK）则不扣钱包。 密钥只以加密形式保存在你这台设备的浏览器里，OceanLeo 服务器不保存。</div>
</div>
</section>
<div data-stub="byok" data-logged-in="true">
</div>
<div data-stub="model-groups" data-user="true">
</div>
<section class="v-fade-up" style="animation-delay: 40ms;">
<div class="rounded-2xl border border-neutral-200 p-5">
<p class="text-[13px] font-semibold text-neutral-900">价格数据来源</p>
<p class="mt-1 text-[12px] leading-relaxed text-neutral-500">百炼/火山为官方价格页确定性解析，OpenRouter 为其官方 API 实时价。共收录 <span class="font-medium text-neutral-700">42</span> 个模型。</p>
<div class="mt-3 space-y-2.5">
<div class="flex flex-wrap items-center gap-2">
<span class="min-w-[88px] text-[12px] font-medium text-neutral-800">百炼</span>
<span class="text-[11px] tabular-nums text-neutral-400">30 个 · 更新 —</span>
<a href="/pricing/bailian.html" target="_blank" rel="noreferrer" class="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">在线查看</a>
<a href="/pricing/bailian.pdf" class="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">PDF</a>
<a href="/pricing/bailian.source" class="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">原始数据</a>
<a href="https://help.aliyun.com/price" target="_blank" rel="noreferrer" class="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">官方页 ↗</a>
</div>
<div class="flex flex-wrap items-center gap-2">
<span class="min-w-[88px] text-[12px] font-medium text-neutral-800">OpenRouter</span>
<span class="text-[11px] tabular-nums text-neutral-400">12 个 · 更新 —</span>
<a href="/pricing/openrouter.html" target="_blank" rel="noreferrer" class="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">在线查看</a>
<a href="/pricing/openrouter.pdf" class="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">PDF</a>
<a href="/pricing/openrouter.source" class="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">原始数据</a>
</div>
</div>
</div>
</section>
</div>
</div>`;

const DEVICES_PAGE_SNAPSHOT = String.raw`<div class="px-8 py-6" data-oceanleo-devices-page="true">
<div class="relative flex items-center justify-center py-1">
<button type="button" aria-label="返回" title="返回" class="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-100 hover:text-neutral-900 active:scale-95">
<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round">
</path>
</svg>
</button>
<h1 class="text-[22px] font-semibold tracking-tight text-neutral-900">我的设备</h1>
</div>
<div class="mx-auto mt-7 max-w-3xl space-y-6">
<section class="rounded-2xl border border-neutral-200 bg-white p-5" data-oceanleo-devices-phones="true">
<h2 class="text-[15px] font-semibold text-neutral-900">连接一台电脑</h2>
<p class="mt-1 text-[12px] leading-relaxed text-neutral-500">下载客户端后，客户端会显示一个配对码。请在下面输入该 8 位配对码。</p>
<form class="mt-4 flex flex-col gap-2 sm:flex-row">
<input aria-label="8 位配对码" autocomplete="one-time-code" inputmode="text" maxlength="8" placeholder="输入 8 位配对码" class="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 font-mono text-[15px] tracking-[0.18em] text-neutral-900 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-neutral-400" value="">
<button type="submit" disabled="" class="rounded-xl bg-neutral-900 px-5 py-2.5 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">连接设备</button>
</form>
</section>
<section>
<div class="mb-3 flex items-center justify-between">
<h2 class="text-[15px] font-semibold text-neutral-900">我的电脑与手机</h2>
<span class="text-[12px] text-neutral-400">1 台在线</span>
</div>
<div class="space-y-3" data-all-offline="false">
<article class="rounded-2xl border border-neutral-200 bg-white p-5">
<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
<div class="min-w-0 flex-1">
<div class="flex items-center gap-2">
<h3 class="truncate text-[15px] font-semibold text-neutral-900">家里的电脑</h3>
<span class="rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700">在线</span>
</div>
<p class="mt-1 text-[12px] text-neutral-500">Windows</p>
</div>
<div class="flex shrink-0 gap-2">
<button type="button" class="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">改名</button>
<button type="button" class="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] text-red-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-red-50">撤销设备</button>
</div>
</div>
<dl class="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
<div class="rounded-xl bg-neutral-50 px-3 py-2.5">
<dt class="text-neutral-400">允许云端下发</dt>
<dd class="mt-0.5 font-medium text-neutral-800">开着</dd>
</div>
<div class="rounded-xl bg-neutral-50 px-3 py-2.5">
<dt class="text-neutral-400">已授权类别</dt>
<dd class="mt-0.5 font-medium text-neutral-800">读取、写入</dd>
</div>
</dl>
</article>
<article class="rounded-2xl border border-neutral-200 bg-white p-5">
<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
<div class="min-w-0 flex-1">
<div class="flex items-center gap-2">
<h3 class="truncate text-[15px] font-semibold text-neutral-900">公司笔记本</h3>
<span class="rounded-full px-2 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-500">离线</span>
</div>
<p class="mt-1 text-[12px] text-neutral-500">macOS</p>
</div>
<div class="flex shrink-0 gap-2">
<button type="button" class="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50">改名</button>
<button type="button" class="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] text-red-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-red-50">撤销设备</button>
</div>
</div>
<dl class="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
<div class="rounded-xl bg-neutral-50 px-3 py-2.5">
<dt class="text-neutral-400">允许云端下发</dt>
<dd class="mt-0.5 font-medium text-neutral-800">关着</dd>
</div>
<div class="rounded-xl bg-neutral-50 px-3 py-2.5">
<dt class="text-neutral-400">已授权类别</dt>
<dd class="mt-0.5 font-medium text-neutral-800">无</dd>
</div>
</dl>
<p class="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-800">公司笔记本现在离线，需要它执行的步骤会排队等它上线</p>
</article>
</div>
</section>
<div data-stub="cloud" data-autofocus="false">
</div>
<details class="rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-4">
<summary class="cursor-pointer text-[13px] font-medium text-neutral-800">设备权限如何保护你</summary>
<p class="mt-3 text-[12px] leading-relaxed text-neutral-600">网页端只能给设备下单。打开开关、放宽授权目录、配对新设备，这三件事只能在那台电脑上做。即使有人拿到你的账号，也改不了这三样，而且那台电脑上会留下记录。</p>
</details>
</div>
</div>`;

/** 页面正文：page 形态是页头之后那一块，pane 形态是根节点里的那一块。 */
function bodyOf(view, selector) {
  const node = view.find(selector);
  assert.ok(node, `找不到正文块 ${selector}`);
  return node.innerHTML;
}

test("ApiPage page 形态（缺省与 variant=page）与改动前逐字相同", async () => {
  for (const props of [{}, { variant: "page" }]) {
    const view = await render(React.createElement(ApiPage, props), "/api");
    assert.equal(lines(view.html()), API_PAGE_SNAPSHOT, `props=${JSON.stringify(props)}`);
    await view.cleanup();
  }
});

test("DevicesPage page 形态（缺省与 variant=page）与改动前逐字相同", async () => {
  for (const props of [{}, { variant: "page" }]) {
    const view = await render(React.createElement(DevicesPage, { client: devicesClient, ...props }), "/devices");
    assert.equal(lines(view.html()), DEVICES_PAGE_SNAPSHOT, `props=${JSON.stringify(props)}`);
    await view.cleanup();
  }
});

test("ApiPage pane 形态：没有页头与整页外边距，正文与独立页逐字相同", async () => {
  const page = await render(React.createElement(ApiPage), "/agent");
  const pageBody = bodyOf(page, "div.max-w-3xl");
  await page.cleanup();

  const pane = await render(React.createElement(ApiPage, { variant: "pane" }), "/agent");
  assert.equal(pane.backButtons(), 0, "设置窗面板里不该有页头的「返回」键");
  assert.equal(pane.find("h1") === null, true, "面板区自己有标题，pane 形态不该再渲染页头 h1");
  assert.equal(pane.rootHas("data-api-pane"), true, "pane 根节点要带 data-api-pane");
  const rootClass = pane.rootClass();
  assert.doesNotMatch(rootClass, /\bpx-8\b|\bpy-6\b|h-screen/, `pane 根节点不该带整页外边距或整屏高度：${rootClass}`);
  assert.match(rootClass, /\bmin-h-0\b/, `pane 根节点要能在面板区里收缩：${rootClass}`);
  assert.equal(bodyOf(pane, "div.max-w-3xl"), pageBody, "pane 的正文要与独立页逐字相同");
  await pane.cleanup();
});

test("DevicesPage pane 形态：没有页头与整页外边距，正文与独立页逐字相同", async () => {
  const page = await render(React.createElement(DevicesPage, { client: devicesClient }), "/agent");
  const pageBody = bodyOf(page, "div.max-w-3xl");
  await page.cleanup();

  const pane = await render(React.createElement(DevicesPage, { client: devicesClient, variant: "pane" }), "/agent");
  assert.equal(pane.backButtons(), 0, "设置窗面板里不该有页头的「返回」键");
  assert.equal(pane.find("h1") === null, true, "面板区自己有标题，pane 形态不该再渲染页头 h1");
  assert.equal(pane.rootHas("data-devices-pane"), true, "pane 根节点要带 data-devices-pane");
  const rootClass = pane.rootClass();
  assert.doesNotMatch(rootClass, /\bpx-8\b|\bpy-6\b|h-screen/, `pane 根节点不该带整页外边距或整屏高度：${rootClass}`);
  assert.match(rootClass, /\bmin-h-0\b/, `pane 根节点要能在面板区里收缩：${rootClass}`);
  assert.equal(bodyOf(pane, "div.max-w-3xl"), pageBody, "pane 的正文要与独立页逐字相同");
  await pane.cleanup();
});

test("DevicesPage：独立页认地址栏的 ?tab=cloud，pane 形态不认（地址栏属于背后的页面）", async () => {
  const page = await render(React.createElement(DevicesPage, { client: devicesClient }), "/devices?tab=cloud");
  assert.equal(page.find("[data-stub=cloud]")?.getAttribute("data-autofocus"), "true");
  await page.cleanup();

  const pane = await render(
    React.createElement(DevicesPage, { client: devicesClient, variant: "pane" }),
    "/agent?tab=cloud",
  );
  assert.equal(pane.find("[data-stub=cloud]")?.getAttribute("data-autofocus"), "false");
  await pane.cleanup();

  const asked = await render(
    React.createElement(DevicesPage, { client: devicesClient, variant: "pane", initialTab: "cloud" }),
    "/agent",
  );
  assert.equal(asked.find("[data-stub=cloud]")?.getAttribute("data-autofocus"), "true", "显式 initialTab 照旧生效");
  await asked.cleanup();
});
