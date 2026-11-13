// ApiPage keeps its page/pane settings contract. Devices is a standalone navigation page;
// its pane variant remains a compact embedding compatibility surface with the same header,
// cards and cloud-focus behavior, rather than an account Settings tab.
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
      getSession: async () => ({ data: { session: { user } } }),
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
  export * from ${JSON.stringify(await compileModule("src/ui/index.tsx"))};

  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title }) { return React.createElement("div", { "data-stub": "confirm" }, title); }
`);
const facadeStub = dataModule(`export const devicesFacade = null;`);
const cloudStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CloudDeviceGrid({ autoFocus }) {
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
    "./AuthDialog": dataModule(`export function AuthDialog() { return null; }`),
    "./devices/CloudDeviceGrid": cloudStub,
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

const activeRoots = new Set();
test.afterEach(async () => {
  for (const entry of activeRoots) {
    await act(async () => entry.root.unmount());
    entry.host.remove();
  }
  activeRoots.clear();
});
async function render(element, path) {
  window.history.replaceState(null, "", path);
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  const entry = { root, host };
  activeRoots.add(entry);
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
      activeRoots.delete(entry);
    },
  };
}

const lines = (html) => html.replace(/></g, ">\n<");

const API_PAGE_SNAPSHOT = String.raw`<div class="px-8 py-6">
<div class="relative flex items-center justify-center py-1">
<button type="button" aria-label="返回" title="返回" class="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-100 hover:text-neutral-900 active:scale-95">
<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round">
</path>
</svg>
</button>
<h1 class="text-[22px] font-semibold tracking-tight text-neutral-900">AI 模型</h1>
</div>
<div class="mx-auto mt-6 max-w-3xl space-y-6">
<div class="flex gap-1" data-api-settings-tabs="" role="tablist">
<button type="button" role="tab" data-api-settings-tab="selection" aria-selected="true" class="rounded-lg px-3 py-2 text-[13px] font-medium bg-neutral-900 text-white">模型选择</button>
<button type="button" role="tab" data-api-settings-tab="byok" aria-selected="false" class="rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100">自带 API key（BYOK）</button>
</div>
<div>
<div class="space-y-8" data-api-selection="">
<div data-stub="model-groups" data-user="true">
</div>
<section class="v-fade-up" style="animation-delay: 40ms;">
<div class="rounded-2xl border border-neutral-200 p-5">
<p class="text-[13px] font-semibold text-neutral-900">价格数据来源</p>
<p class="mt-1 text-[12px] leading-relaxed text-neutral-500">价格来自各厂商官方实时源，每小时自动更新。共收录 <span class="font-medium text-neutral-700">42</span> 个模型。</p>
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
</div>
<div hidden="">
</div>
</div>
</div>`;

// The current Devices page uses the shared computer cards; keep a complete HTML fixture.
const DEVICES_PAGE_SNAPSHOT = String.raw`<div class="mx-auto flex min-h-full w-full max-w-7xl flex-col px-5 py-7 sm:px-8" data-oceanleo-devices-page="true">
<header class="flex items-center justify-between gap-4">
<div>
<h1 class="text-2xl font-semibold tracking-tight text-neutral-900">Devices</h1>
<p class="mt-2 text-sm text-neutral-500">你的电脑与云电脑</p>
</div>
<button type="button" class="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45">
<span aria-hidden="true">＋</span>添加设备</button>
</header>
<div class="mt-7 grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3" data-device-grid="true" data-all-offline="true">
<article class="min-w-0 overflow-hidden rounded-[20px] border border-neutral-200 bg-white" data-device-card="d-2">
<div class="relative flex aspect-[16/10] min-h-[180px] items-center justify-center overflow-hidden bg-neutral-100" data-device-cover="true" data-device-cover-state="unavailable">
<span class="px-5 text-center text-xs text-neutral-400" role="status">暂无桌面壁纸</span>
<button type="button" data-remote-device-icon="d-2" aria-label="公司笔记本 · 进入桌面" class="absolute bottom-4 left-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">进入桌面</button>
</div>
<div class="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
<div class="flex min-w-0 items-start gap-3">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" data-device-kind="computer">
<path d="M5 4h14v12H5zM5 16l-3 4h20l-3-4">
</path>
<path d="M9 20h6">
</path>
</svg>
<div class="min-w-0">
<h3 class="truncate text-sm font-semibold text-neutral-900">公司笔记本</h3>
<p class="mt-1 text-xs text-neutral-500">macOS</p>
<p class="mt-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700" data-local-exec-off="d-2" title="这台电脑没有开启本机执行，交给它的任务不会运行。请在这台电脑的 OceanLeo「设备与授权」里打开「允许云端下发本机任务」，或改用云端。 远程桌面仍可单独连接，并由这台电脑确认授权。">本机 AI 执行已关闭</p>
</div>
</div>
<span class="inline-flex items-center gap-1.5 text-sm text-neutral-500" data-device-availability="unknown">
<span class="h-2 w-2 rounded-full bg-neutral-400" aria-hidden="true">
</span>状态未知</span>
</div>
<div class="grid grid-cols-2 border-t border-neutral-100 py-1.5">
<button type="button" class="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50" data-device-settings="d-2">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5" aria-hidden="true">
<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-2 1-3 3-1 1-4-3-1-2-3-3 1-2-2z">
</path>
<circle cx="12" cy="11" r="3">
</circle>
</svg>设置</button>
<button type="button" class="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50" data-device-tasks="d-2">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5" aria-hidden="true">
<path d="m3 6 2 2 3-4M11 6h10M3 13l2 2 3-4M11 13h10M4 20h3M11 20h10">
</path>
</svg>任务</button>
</div>
</article>
<article class="min-w-0 overflow-hidden rounded-[20px] border border-neutral-200 bg-white" data-device-card="d-1">
<div class="relative flex aspect-[16/10] min-h-[180px] items-center justify-center overflow-hidden bg-neutral-100" data-device-cover="true" data-device-cover-state="unavailable">
<span class="px-5 text-center text-xs text-neutral-400" role="status">暂无桌面壁纸</span>
<button type="button" data-remote-device-icon="d-1" aria-label="家里的电脑 · 进入桌面" class="absolute bottom-4 left-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">进入桌面</button>
</div>
<div class="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
<div class="flex min-w-0 items-start gap-3">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" data-device-kind="computer">
<path d="M5 4h14v12H5zM5 16l-3 4h20l-3-4">
</path>
<path d="M9 20h6">
</path>
</svg>
<div class="min-w-0">
<h3 class="truncate text-sm font-semibold text-neutral-900">家里的电脑</h3>
<p class="mt-1 text-xs text-neutral-500">Windows</p>
</div>
</div>
<span class="inline-flex items-center gap-1.5 text-sm text-neutral-500" data-device-availability="unknown">
<span class="h-2 w-2 rounded-full bg-neutral-400" aria-hidden="true">
</span>状态未知</span>
</div>
<div class="grid grid-cols-2 border-t border-neutral-100 py-1.5">
<button type="button" class="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50" data-device-settings="d-1">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5" aria-hidden="true">
<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-2 1-3 3-1 1-4-3-1-2-3-3 1-2-2z">
</path>
<circle cx="12" cy="11" r="3">
</circle>
</svg>设置</button>
<button type="button" class="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50" data-device-tasks="d-1">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5" aria-hidden="true">
<path d="m3 6 2 2 3-4M11 6h10M3 13l2 2 3-4M11 13h10M4 20h3M11 20h10">
</path>
</svg>任务</button>
</div>
</article>
<div data-stub="cloud" data-autofocus="false">
</div>
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

test("DevicesPage page 形态（缺省与 variant=page）都保留当前完整设备卡片", async () => {
  for (const props of [{}, { variant: "page" }]) {
    const view = await render(React.createElement(DevicesPage, { client: devicesClient, ...props }), "/devices");
    assert.equal(lines(view.html()), DEVICES_PAGE_SNAPSHOT, `props=${JSON.stringify(props)}`);
    await view.cleanup();
  }
});

test("ApiPage pane 形态：没有页头与整页外边距，正文与独立页逐字相同", async () => {
  const page = await render(React.createElement(ApiPage), "/agent");
  const pageSelection = bodyOf(page, "[data-api-selection]");
  await page.cleanup();

  const pane = await render(React.createElement(ApiPage, { variant: "pane" }), "/agent");
  assert.equal(pane.backButtons(), 0, "设置窗面板里不该有页头的「返回」键");
  assert.equal(pane.find("h1") === null, true, "面板区自己有标题，pane 形态不该再渲染页头 h1");
  assert.equal(pane.rootHas("data-api-pane"), true, "pane 根节点要带 data-api-pane");
  const rootClass = pane.rootClass();
  assert.doesNotMatch(rootClass, /\bpx-8\b|\bpy-6\b|h-screen/, `pane 根节点不该带整页外边距或整屏高度：${rootClass}`);
  assert.match(rootClass, /\bmin-h-0\b/, `pane 根节点要能在面板区里收缩：${rootClass}`);
  assert.ok(pane.find("[data-api-settings-tabs]"), "设置窗里的 AI 模型面板要有模型选择 / BYOK 页签");
  assert.ok(pane.find("[data-api-settings-tab=selection]"));
  assert.ok(pane.find("[data-api-settings-tab=byok]"));
  assert.equal(bodyOf(pane, "[data-api-selection]"), pageSelection, "pane 的模型选择正文要与独立页逐字相同");
  await pane.cleanup();
});

test("DevicesPage 兼容嵌入形态：保留页头和相同卡片，去掉整页外边距", async () => {
  const page = await render(React.createElement(DevicesPage, { client: devicesClient }), "/agent");
  const pageBody = bodyOf(page, "[data-device-grid]");
  await page.cleanup();

  const pane = await render(React.createElement(DevicesPage, { client: devicesClient, variant: "pane" }), "/agent");
  assert.equal(pane.backButtons(), 0, "设置窗面板里不该有页头的「返回」键");
  assert.equal(pane.find("h1")?.textContent, "Devices", "兼容嵌入仍是完整的设备页面");
  assert.equal(pane.rootHas("data-devices-pane"), true, "pane 根节点要带 data-devices-pane");
  const rootClass = pane.rootClass();
  assert.doesNotMatch(rootClass, /\bpx-8\b|\bpy-6\b|h-screen/, `pane 根节点不该带整页外边距或整屏高度：${rootClass}`);
  assert.match(rootClass, /\bmin-h-0\b/, `pane 根节点要能在面板区里收缩：${rootClass}`);
  assert.equal(bodyOf(pane, "[data-device-grid]"), pageBody, "pane 的正文要与独立页逐字相同");
  await pane.cleanup();
});

test("DevicesPage：独立与兼容嵌入形态都支持 cloud 深链，显式 initialTab 同样生效", async () => {
  const page = await render(React.createElement(DevicesPage, { client: devicesClient }), "/devices?tab=cloud");
  assert.equal(page.find("[data-stub=cloud]")?.getAttribute("data-autofocus"), "true");
  await page.cleanup();

  const pane = await render(
    React.createElement(DevicesPage, { client: devicesClient, variant: "pane" }),
    "/agent?tab=cloud",
  );
  assert.equal(pane.find("[data-stub=cloud]")?.getAttribute("data-autofocus"), "true");
  await pane.cleanup();

  const asked = await render(
    React.createElement(DevicesPage, { client: devicesClient, variant: "pane", initialTab: "cloud" }),
    "/agent",
  );
  assert.equal(asked.find("[data-stub=cloud]")?.getAttribute("data-autofocus"), "true", "显式 initialTab 照旧生效");
  await asked.cleanup();
});
