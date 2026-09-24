// AppShell：左下角 / 顶栏的「?」删掉，帮助只从账号菜单进；子站菜单与主站同一份；壳挂同一个 Leo。
// （editors-and-shell-0924 W05）
//
// 上一波「?」删不掉，是任务书写了「helpHref、showHelp 照收」、`help-link.test.mjs`
// 又断言「AppShell 必须渲染两次 HelpLink」——需求和护栏一起钉住了错误行为。
// 这里判的是用户看得到的东西：三种布局的外壳里没有那颗按钮；点开头像，
// 「个性化」「插件」「获取帮助」都在，点下去去对的地方；页面上只有一个 Leo。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://slide.oceanleo.com/",
});
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
  StorageEvent: window.StorageEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const visualViewport = new window.EventTarget();
Object.assign(visualViewport, { width: 1280, height: 800, offsetLeft: 0, offsetTop: 0 });
Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
Object.defineProperty(window, "scrollTo", { configurable: true, value() {} });
class StillResizeObserver {
  observe() {}
  disconnect() {}
}
globalThis.ResizeObserver = StillResizeObserver;
window.ResizeObserver = StillResizeObserver;
window.HTMLElement.prototype.getBoundingClientRect = function rect() {
  return { x: 16, y: 740, left: 16, top: 740, right: 240, bottom: 772, width: 224, height: 32, toJSON() { return this; } };
};

const component = (name, body = "return null;") =>
  dataModule(`export function ${name}(props){ ${body} }`);

const appShellUrl = await compileModule("src/shell/AppShell.tsx", {
  "next/link": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export default function Link({ children, href, ...props }) {
      return React.createElement("a", { ...props, href }, children);
    }
  `),
  "next/navigation": dataModule(`
    export function usePathname(){ return globalThis.__W05_PATHNAME__ ?? "/"; }
    export function useSearchParams(){ return new URLSearchParams(globalThis.__W05_SEARCH__ ?? ""); }
    export function useRouter(){
      return { push(){}, replace(){}, prefetch(){}, back(){}, forward(){}, refresh(){} };
    }
  `),
  "./ModelPicker": component("ModelGroupPicker"),
  "./icons": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    function Icon(props){ return React.createElement("svg", { ...props, "aria-hidden": "true" }); }
    export const IconCheck = Icon;
    export const IconChevronDown = Icon;
    export const IconGift = Icon;
    export const IconPanel = Icon;
    export const IconSearch = Icon;
  `),
  "./WorkspaceSelection": component("WorkspaceSelectionProvider", "return props.children;"),
  "../theme": component("ThemeSwitcher"),
  "../i18n/LanguageSwitcher": component("LanguageSwitcher"),
  "../i18n/config": dataModule('export const LOCALES = ["en", "zh"];'),
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
  "../lib/presence": dataModule("export function usePresenceHeartbeat(){}"),
  "../pages/PhoneBindGate": component("PhoneBindGate"),
  "../ui": dataModule(
    "export function ToastProvider({ children }){ return children; }\n" +
      "export function ButtonSpinner({ label }){ return label ?? null; }",
  ),
  "../lib/org-api": dataModule("export async function listMyOrgs(){ return []; }"),
  "./account/DeviceStatusPopover": component("DeviceStatusPopover"),
  "./account/NotificationBell": component("NotificationBell"),
  // 设置窗本身归 W07；这里只记「打开了哪个面板」，不把设置窗那一整棵页面拖进来。
  "./account/SettingsModalHost": dataModule(`
    export function SettingsModalHost(){ return null; }
    export function openSettingsModal(tab = "general"){ (globalThis.__W05_SETTINGS_OPENED__ ??= []).push(tab); }
  `),
  "./leo/LeoShellMount": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function LeoShellMount(props){
      return React.createElement("div", { "data-test-leo-shell-mount": "", "data-site-key": props.siteKey ?? "" });
    }
  `),
});
const { AppShell } = await import(appShellUrl);

const brand = { name: "LeoSlides", logo: React.createElement("span", null, "S"), accent: "#6366f1" };
const NAV = [
  { label: "新建", href: "/", icon: React.createElement("span", { "data-icon": "home" }) },
  { label: "我的库", href: "/library", icon: React.createElement("span", { "data-icon": "library" }) },
];

function shellElement(props = {}) {
  return React.createElement(
    AppShell,
    { brand, nav: NAV, userEmail: "someone@oceanleo.com", credits: 12.5, onSignOut() {}, ...props },
    React.createElement("section", null, "正文"),
  );
}

function renderShell(props = {}, pathname = "/") {
  globalThis.__W05_PATHNAME__ = pathname;
  try {
    return renderToStaticMarkup(shellElement(props));
  } finally {
    delete globalThis.__W05_PATHNAME__;
  }
}

/** 菜单项上用户读到的字：去掉装饰性的图标与 ↗（它们都是 aria-hidden）。 */
function itemLabel(item) {
  const copy = item.cloneNode(true);
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent.trim();
}

async function mountShell(props = {}, { url = "https://slide.oceanleo.com/", collapsed = false } = {}) {
  dom.reconfigure({ url });
  const parsed = new URL(url);
  globalThis.__W05_PATHNAME__ = parsed.pathname;
  globalThis.__W05_SEARCH__ = parsed.search.replace(/^\?/, "");
  globalThis.__W05_SETTINGS_OPENED__ = [];
  window.localStorage.setItem("oceanleo_sidebar_collapsed", collapsed ? "1" : "0");
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(shellElement(props)));
  const menu = () => window.document.querySelector('[role="menu"][aria-label="账户"]');
  const menuItem = (label) =>
    [...(menu()?.querySelectorAll('[role="menuitem"]') ?? [])].find((item) =>
      itemLabel(item).startsWith(label),
    ) ?? null;
  return {
    container,
    async openMenu() {
      const trigger = container.querySelector("[data-account-trigger]");
      assert.ok(trigger, "外壳里没有头像按钮");
      await act(async () => {
        trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)));
      assert.equal(menu()?.getAttribute("data-leo-overlay-state"), "open", "点头像之后账号菜单没有打开");
    },
    menuItem,
    async click(label) {
      const item = menuItem(label);
      assert.ok(item, `账号菜单里没有「${label}」`);
      await act(async () => {
        item.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
      for (const leftover of window.document.querySelectorAll("[data-anchored-popover]")) leftover.remove();
      delete globalThis.__W05_PATHNAME__;
      delete globalThis.__W05_SEARCH__;
    },
  };
}

/** 那颗按钮的两个认法：它的无障碍名，以及任何指向帮助中心的地址。 */
function helpButtonTraces(markup) {
  const traces = [];
  if (markup.includes("帮助与反馈")) traces.push("「帮助与反馈」按钮");
  if (/help\.oceanleo\.(com|cn)/.test(markup)) traces.push("帮助中心地址");
  return traces;
}

test("三种布局（侧栏 / 图标栏 / 单页顶栏）的外壳里都没有「?」帮助按钮", async () => {
  const found = [];
  // 侧栏：手机抽屉用的也是这一份 sidebarBody。
  const sidebar = helpButtonTraces(renderShell({ siteId: "ppt" }));
  if (sidebar.length) found.push(`侧栏：${sidebar.join("、")}`);
  const topbar = helpButtonTraces(renderShell({ siteId: "ppt", layout: "topbar" }));
  if (topbar.length) found.push(`单页顶栏：${topbar.join("、")}`);
  const railShell = await mountShell({ siteId: "ppt" }, { collapsed: true });
  try {
    assert.equal(
      railShell.container.querySelector("[data-oceanleo-sidebar-mode]")?.getAttribute("data-oceanleo-sidebar-mode"),
      "rail",
    );
    const rail = helpButtonTraces(window.document.body.innerHTML);
    if (rail.length) found.push(`图标栏：${rail.join("、")}`);
  } finally {
    await railShell.unmount();
  }
  assert.deepEqual(found, [], `外壳里还有「?」：${found.join("；")}`);
});

test("子站菜单与主站同一份：点头像有「个性化」「插件」，点了打开设置窗对应面板", async () => {
  const shell = await mountShell({ siteId: "ppt" });
  try {
    await shell.openMenu();
    await shell.click("个性化");
    await shell.openMenu();
    await shell.click("插件");
    assert.deepEqual(globalThis.__W05_SETTINGS_OPENED__, ["personalization", "plugins"]);
  } finally {
    await shell.unmount();
  }
});

test("「获取帮助」是唯一的帮助入口：默认去帮助中心在线客服并带上站点与当前页", async () => {
  const url = "https://slide.oceanleo.com/history?tab=1";
  const shell = await mountShell({ siteId: "ppt" }, { url });
  try {
    await shell.openMenu();
    assert.equal(
      shell.menuItem("获取帮助")?.getAttribute("href"),
      `https://help.oceanleo.com/chat?site=ppt&from=${encodeURIComponent(url)}`,
    );
  } finally {
    await shell.unmount();
  }
  const keyed = await mountShell({ siteKey: "ppt", siteId: "leoslides" }, { url });
  try {
    await keyed.openMenu();
    assert.match(keyed.menuItem("获取帮助")?.getAttribute("href") ?? "", /[?&]site=ppt&/);
  } finally {
    await keyed.unmount();
  }
});

test("站点传了 helpHref 就用站点的；helpHref={null} 或 showHelp={false} 菜单里不出现「获取帮助」", async () => {
  const custom = await mountShell({ siteId: "ppt", helpHref: "https://support.example.test/ppt" });
  try {
    await custom.openMenu();
    assert.equal(custom.menuItem("获取帮助")?.getAttribute("href"), "https://support.example.test/ppt");
  } finally {
    await custom.unmount();
  }
  const hidden = await mountShell({ siteId: "ppt", helpHref: null });
  try {
    await hidden.openMenu();
    assert.equal(hidden.menuItem("获取帮助"), null);
    assert.ok(hidden.menuItem("使用文档"), "隐藏获取帮助不该连带别的链接");
  } finally {
    await hidden.unmount();
  }
  const hiddenByFlag = await mountShell({
    siteId: "ppt",
    showHelp: false,
    helpHref: "https://support.example.test/ppt",
  });
  try {
    await hiddenByFlag.openMenu();
    assert.equal(hiddenByFlag.menuItem("获取帮助"), null);
  } finally {
    await hiddenByFlag.unmount();
  }
});

function leoMounts(markup) {
  return [...markup.matchAll(/data-test-leo-shell-mount="" data-site-key="([^"]*)"/g)].map((m) => m[1]);
}

test("AppShell 挂且只挂一个 LeoShellMount：侧栏、单页顶栏、设置中心都有，站点 key 先取 siteKey 再取 siteId", () => {
  assert.deepEqual(leoMounts(renderShell({ siteId: "ppt" })), ["ppt"]);
  assert.deepEqual(leoMounts(renderShell({ siteId: "ppt", layout: "topbar" })), ["ppt"]);
  assert.deepEqual(leoMounts(renderShell({ siteId: "ppt" }, "/settings")), ["ppt"]);
  assert.deepEqual(leoMounts(renderShell({ siteKey: "ppt", siteId: "leoslides" })), ["ppt"]);
  assert.deepEqual(leoMounts(renderShell({})), [""], "没有站点标识时交给 LeoShellMount 自己的缺省");
  // 旧页面里还套着一层 SiteShell 时，内层 AppShell 退化成 children，不许挂第二个。
  const nested = renderToStaticMarkup(
    React.createElement(AppShell, { brand, nav: NAV, siteId: "ppt" }, shellElement({ siteId: "ppt" })),
  );
  assert.deepEqual(leoMounts(nested), ["ppt"]);
});

test("嵌入（?embed=1）时 Leo 由 EmbedChrome 的首帧样式藏起来，不靠 AppShell 另写逻辑", () => {
  const embedChrome = readFileSync(new URL("../src/shell/EmbedChrome.tsx", import.meta.url), "utf8");
  const prepaint = embedChrome.match(/const PREPAINT_STYLE = `([^`]*)`/)?.[1] ?? "";
  assert.match(prepaint, /html\[data-embed="1"\] \[data-ai-assistant-root\][^{]*\{display:none!important\}/);
});
