// 设置窗「能力」组三项在窗里打开、账号菜单的「个性化」「插件」落到对应面板、背后页面一换设置窗就关
// （editors-and-shell-0924 W07）。
//
// 用户以前看到的：设置窗左侧「AI 模型」「插件与连接器」「我的设备」是页面链接。Next 的 <Link> 走
// pushState，而设置窗只听 hashchange / popstate，于是背后页面偷偷跳走、设置窗还盖在上面，
// 看起来像「点了没反应」；子站没有 /devices，直接 404。
//
// 这里从真的 `SettingsModalHost` 进去（→ SettingsModal → SettingsHub → SettingsNav），只把四个面板
// 换成会报出自己 variant 的替身；面板本身的两种形态由 `eas-w07-page-forms` 与 `eas-w09-plugins-pane` 管。
//
// `next/navigation` 的替身按 Next 的真实行为写：任何 pushState / replaceState 之后 usePathname 都跟着变
// （Next 14.1 起 app router 同步外部调用的 pushState / replaceState）。所以「模拟一次 pushState 导航」
// 就是真的调一次 `history.pushState`，与 <Link> 点下去之后发生的事一致。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/eas-w07-settings-panes.test.mjs

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
  url: "https://ppt.oceanleo.com/agent",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  FocusEvent: window.FocusEvent,
  getComputedStyle: window.getComputedStyle.bind(window),
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;

const navigationStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  const listeners = new Set();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  if (!window.__easW07HistoryPatched) {
    window.__easW07HistoryPatched = true;
    for (const name of ["pushState", "replaceState"]) {
      const original = window.history[name].bind(window.history);
      window.history[name] = (...args) => { const result = original(...args); notify(); return result; };
    }
    window.addEventListener("popstate", notify);
  }
  const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
  export function usePathname() {
    return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
  }
  export function useSearchParams() { return new URLSearchParams(window.location.search); }
  export function useRouter() {
    return {
      push(href) { window.history.pushState(null, "", href); },
      replace(href) { window.history.replaceState(null, "", href); },
      refresh() {}, back() {}, prefetch() {},
    };
  }
`);
const linkStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ href, children, onClick, ...rest }) {
    return React.createElement("a", {
      ...rest,
      href,
      "data-next-link": "1",
      onClick(event) {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        window.history.pushState(null, "", href);
      },
    }, children);
  }
`);
const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const authStub = dataModule(`
  export function oceanleoConfigured() { return true; }
  export function browserClient() {
    return { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  }
  export async function getUserEmail() { return "designer@oceanleo.com"; }
  export async function getCredits() { return { ok: true, data: { balance: 12.5, currency: "CNY" } }; }
  export async function getCreditHistory() { return { ok: true, data: { events: [] } }; }
  export async function getUsageBySite() { return { ok: true, data: { total: { requests: 3 } } }; }
  export async function signOutEverywhere() {}
  export function loginUnavailableNotice() { return null; }
  export function isPasswordResetLanding() { return false; }
`);
const marker = (exportName, testId) => dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ${exportName}(props) {
    return React.createElement("div", { "data-testid": ${JSON.stringify(testId)}, "data-variant": props.variant ?? "" });
  }
`);

const STUBS = {
  "next/navigation": navigationStub,
  "next/link": linkStub,
  "../../lib/auth": authStub,
  "../../i18n/ui/useUI": uiStub,
  "../../ui": marker("ConfirmDialog", "confirm"),
  "../../pages/AuthDialog": marker("AuthDialog", "auth-dialog"),
  "../../pages/PasswordResetPage": marker("PasswordResetPage", "reset-page"),
  "../../pages/GeneralPage": marker("GeneralSettingsBody", "general-body"),
  "../../pages/AccountSecurityPage": marker("AccountSecurityPage", "security-panel"),
  "../../pages/OrgMembership": marker("OrgMembership", "org-membership"),
  "../../pages/ApiPage": marker("ApiPage", "pane-api"),
  "../../pages/DevicesPage": marker("DevicesPage", "pane-devices"),
  "../../pages/PluginsPage": marker("PluginsPage", "pane-plugins"),
  "../../pages/settings/personalization/PersonalizationSection": marker("PersonalizationSection", "pane-personalization"),
};

const { SettingsModalHost, openSettingsModal } = await import(
  await compileModule("src/shell/account/SettingsModalHost.tsx", STUBS)
);
const { SettingsHub } = await import(await compileModule("src/pages/settings/SettingsHub.tsx", STUBS));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await tick();
    });
  }
}

async function mount(element, path = "/agent") {
  window.history.replaceState(null, "", path);
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
  return {
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
      window.history.replaceState(null, "", "/agent");
    },
  };
}

const dialog = () => window.document.querySelector('[role="dialog"][aria-label="设置"]');
const inDialog = (selector) => dialog()?.querySelector(selector) ?? null;
const pane = (testId) => inDialog(`[data-testid="${testId}"]`);

async function open(tab) {
  await act(async () => openSettingsModal(tab));
  await settle();
}

async function click(node, what) {
  assert.ok(node, `找不到 ${what}`);
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await settle();
}

const CAPABILITIES = [
  { id: "models", testId: "pane-api", label: "AI 模型" },
  { id: "plugins", testId: "pane-plugins", label: "插件与连接器" },
  { id: "devices", testId: "pane-devices", label: "我的设备" },
];

test("设置窗里点「AI 模型」「插件与连接器」「我的设备」：右侧换成对应面板，窗不关，背后页面不动", async () => {
  const view = await mount(React.createElement(SettingsModalHost), "/agent");
  await open("general");
  assert.ok(dialog(), "openSettingsModal 之后设置窗应当打开");
  assert.ok(pane("general-body"), "默认是「通用」面板");

  for (const href of ["/api", "/plugins", "/devices"]) {
    assert.equal(
      window.document.querySelector(`a[href="${href}"]`) === null,
      true,
      `设置窗里不该再有指向 ${href} 的链接（子站没有这条路由，点了就是背后跳页或 404）`,
    );
  }

  for (const { id, testId, label } of CAPABILITIES) {
    const item = inDialog(`[data-settings-group="capabilities"] [data-settings-item="${id}"]`);
    assert.ok(item, `能力组里找不到 ${id}`);
    assert.equal(item.tagName, "BUTTON", `${id} 应当是切面板的按钮，不是链接`);
    await click(item, id);
    assert.ok(dialog(), `点「${label}」之后设置窗不该关`);
    assert.ok(pane(testId), `点「${label}」之后右侧应当是 ${testId}`);
    assert.equal(pane(testId).getAttribute("data-variant"), "pane", `${testId} 要以 pane 形态嵌进设置窗`);
    assert.equal(inDialog("h2")?.textContent, label, "面板区标题跟着换");
    assert.equal(
      inDialog(`[data-settings-item="${id}"]`)?.getAttribute("aria-current"),
      "page",
      "当前项高亮",
    );
    assert.equal(window.location.pathname, "/agent", "背后的页面不动");
    assert.equal(window.location.hash, `#settings/${id}`, "地址只换 #settings/<tab>");
  }
  await view.cleanup();
});

test("openSettingsModal：personalization、plugins、旧地址 memory 分别落在个性化 / 插件 / 个性化面板", async () => {
  const view = await mount(React.createElement(SettingsModalHost), "/agent");
  const cases = [
    { tab: "personalization", testId: "pane-personalization", item: "personalization", hash: "#settings/personalization" },
    { tab: "plugins", testId: "pane-plugins", item: "plugins", hash: "#settings/plugins" },
    { tab: "memory", testId: "pane-personalization", item: "personalization", hash: "#settings/personalization" },
  ];
  for (const { tab, testId, item, hash } of cases) {
    await open(tab);
    assert.ok(dialog(), `openSettingsModal("${tab}") 应当打开设置窗`);
    assert.ok(pane(testId), `openSettingsModal("${tab}") 应当落在 ${testId}`);
    assert.equal(inDialog(`[data-settings-item="${item}"]`)?.getAttribute("aria-current"), "page");
    assert.equal(window.location.hash, hash, `openSettingsModal("${tab}") 之后地址是 ${hash}`);
  }

  const personalization = inDialog('[data-settings-item="personalization"]');
  const account = inDialog('[data-settings-item="account"]');
  const billing = inDialog('[data-settings-item="billing"]');
  assert.ok(personalization && account && billing, "设置组里要有 账户 / 个性化 / 用量与账单");
  assert.equal(personalization.textContent, "个性化");
  assert.equal(
    personalization.closest("[data-settings-group]")?.getAttribute("data-settings-group"),
    "settings",
    "个性化在「设置」组",
  );
  assert.ok(
    account.compareDocumentPosition(personalization) & window.Node.DOCUMENT_POSITION_FOLLOWING,
    "个性化排在「账户」之后",
  );
  assert.ok(
    personalization.compareDocumentPosition(billing) & window.Node.DOCUMENT_POSITION_FOLLOWING,
    "个性化排在「用量与账单」之前",
  );
  await view.cleanup();
});

test("旧书签 #settings/memory 与未知 tab：分别落在个性化与通用，地址改成真正打开的那一栏", async () => {
  const bookmark = await mount(React.createElement(SettingsModalHost), "/agent");
  await act(async () => {
    window.location.hash = "settings/memory";
  });
  await settle();
  assert.ok(pane("pane-personalization"), "#settings/memory 应当打开个性化面板");
  assert.equal(window.location.hash, "#settings/personalization");
  await bookmark.cleanup();

  const unknown = await mount(React.createElement(SettingsModalHost), "/agent");
  await open("no-such-tab");
  assert.ok(pane("general-body"), "未知 tab 回落「通用」");
  assert.equal(window.location.hash, "#settings/general");
  await unknown.cleanup();
});

test("设置窗开着时背后页面导航（pushState）→ 设置窗关闭；换 tab 的 replaceState 不关窗", async () => {
  const view = await mount(React.createElement(SettingsModalHost), "/agent");
  await open("plugins");
  assert.ok(dialog(), "设置窗先打开");
  await click(inDialog('[data-settings-item="models"]'), "models");
  assert.ok(dialog(), "换 tab 只改 hash（replaceState），设置窗不该关");

  await act(async () => {
    window.history.pushState(null, "", "/projects");
  });
  await settle();
  assert.equal(window.location.pathname, "/projects");
  assert.equal(dialog() === null, true, "背后换了页，设置窗要跟着关掉，不能还盖在新页面上");

  await open("devices");
  assert.ok(pane("pane-devices"), "新页面上还能再打开设置窗");
  await view.cleanup();
});

test("设置窗开着时浏览器后退 → 设置窗关闭", async () => {
  const view = await mount(React.createElement(SettingsModalHost), "/agent");
  await open("devices");
  assert.ok(dialog());
  await act(async () => {
    window.history.back();
  });
  await settle(10);
  assert.equal(window.location.hash, "");
  assert.equal(dialog() === null, true, "后退到没有 #settings 的那一条，设置窗关掉");
  await view.cleanup();
});

test("extraSections 与内置同 id（含旧 id memory）：内置优先，控制台每个 id 只警告一次", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    const legacy = (testId) => () => React.createElement("div", { "data-testid": testId });
    const extraSections = [
      { id: "plugins", group: "data", label: "旧插件", render: legacy("legacy-plugins") },
      { id: "memory", group: "data", label: "记忆", render: legacy("legacy-memory") },
      { id: "knowledge", group: "data", label: "知识库", render: legacy("knowledge") },
    ];
    const view = await mount(React.createElement(SettingsModalHost, { extraSections }), "/agent");
    await open("plugins");
    assert.ok(pane("pane-plugins"), "#settings/plugins 打开的是内置插件面板");
    assert.equal(pane("legacy-plugins") === null, true);
    const labels = [...dialog().querySelectorAll("[data-settings-item]")].map((node) => node.textContent);
    assert.ok(!labels.includes("旧插件"), `同 id 的站点项不该出现在导航里：${labels.join(" / ")}`);
    assert.ok(!labels.includes("记忆"), `旧 id memory 已并入个性化，不该再出现：${labels.join(" / ")}`);
    assert.ok(labels.includes("知识库"), "不冲突的站点项照常出现");

    await open("memory");
    assert.ok(pane("pane-personalization"));
    await click(inDialog('[data-settings-item="knowledge"]'), "knowledge");
    assert.ok(pane("knowledge"));
    await open("plugins");

    const plugins = warnings.filter((line) => line.includes('"plugins"'));
    const memory = warnings.filter((line) => line.includes('"memory"'));
    assert.equal(plugins.length, 1, `plugins 只警告一次：${JSON.stringify(warnings)}`);
    assert.equal(memory.length, 1, `memory 只警告一次：${JSON.stringify(warnings)}`);
    assert.equal(warnings.some((line) => line.includes('"knowledge"')), false);
    await view.cleanup();
  } finally {
    console.warn = originalWarn;
  }
});

test("设置中心独立页（page 形态）：?tab=devices 与 ?tab=memory 同样落在面板上", async () => {
  const devices = await mount(React.createElement(SettingsHub), "/settings?tab=devices");
  const devicesPane = window.document.querySelector('[data-settings-hub] [data-testid="pane-devices"]');
  assert.ok(devicesPane, "?tab=devices 应当渲染我的设备面板");
  assert.equal(devicesPane.getAttribute("data-variant"), "pane");
  assert.equal(window.document.querySelector('a[href="/devices"]') === null, true);
  await devices.cleanup();

  const memory = await mount(React.createElement(SettingsHub), "/settings?tab=memory");
  assert.ok(window.document.querySelector('[data-settings-hub] [data-testid="pane-personalization"]'));
  await memory.cleanup();
});
