// 账号菜单是全家唯一的「个性化 / 插件 / 获取帮助」入口（editors-and-shell-0924 W05）。
//
// 操作员要的顺序：身份切换 / 余额 / 账户 / 个性化 / 设置 / 插件 / 主页 · 获取帮助 · 使用文档 / 退出。
// 上一波把「个性化」做成「调用方传了 personalizationTab 才出现」，而子站的 AppShell
// 从来不传，于是子站菜单里没有这一项；「插件」则只在主站侧栏里。这里在 jsdom 里
// 真的点开菜单、真的点菜单项，判的是用户看到的顺序和点下去打开的面板。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://slide.oceanleo.com/history",
});
const { window } = dom;
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
Object.assign(visualViewport, { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0 });
Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
Object.defineProperty(window, "scrollTo", { configurable: true, value() {} });
class StillResizeObserver {
  observe() {}
  disconnect() {}
}
globalThis.ResizeObserver = StillResizeObserver;
window.ResizeObserver = StillResizeObserver;
window.HTMLElement.prototype.getBoundingClientRect = function rect() {
  return { x: 24, y: 640, left: 24, top: 640, right: 200, bottom: 672, width: 176, height: 32, toJSON() { return this; } };
};

const { AccountMenu } = await import(
  await compileModule("src/shell/AccountMenu.tsx", {
    "../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
    "../lib/org-api": dataModule("export async function listMyOrgs(){ return []; }"),
  })
);

const BASE_PROPS = {
  name: "someone",
  email: "someone@oceanleo.com",
  balanceText: "¥12.50",
  orgHref: "https://oceanleo.com/org",
  homeHref: "https://oceanleo.com/",
  helpHref: "https://help.oceanleo.com/chat?site=ppt",
  docsHref: "https://oceanleo.com/help",
  onSignOut() {},
};

/** 菜单项上用户读到的字：去掉装饰性的图标与 ↗（它们都是 aria-hidden）。 */
function itemLabel(item) {
  const copy = item.cloneNode(true);
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent.trim();
}

async function mountMenu(props = {}) {
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const opened = [];
  await act(async () => {
    root.render(
      React.createElement(AccountMenu, {
        ...BASE_PROPS,
        onOpenSettings: (tab) => opened.push(tab),
        ...props,
      }),
    );
  });
  const trigger = container.querySelector("[data-account-trigger]");
  assert.ok(trigger, "头像按钮没画出来");
  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)));
  const menu = window.document.querySelector('[role="menu"][aria-label="账户"]');
  assert.ok(menu, "点头像之后账号菜单没有打开");
  const items = () =>
    [...menu.querySelectorAll('[role="menuitem"]')].filter((item) => !item.closest('[aria-label="个人"]'));
  const find = (label) => items().find((item) => itemLabel(item).startsWith(label)) ?? null;
  return {
    opened,
    labels: () => items().map(itemLabel),
    find,
    async click(label) {
      const item = find(label);
      assert.ok(item, `菜单里没有「${label}」`);
      await act(async () => {
        item.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const EXPECTED_ORDER = ["余额", "账户", "个性化", "设置", "插件", "主页", "获取帮助", "使用文档", "退出登录"];

test("不传 personalizationTab：菜单顺序是 余额 / 账户 / 个性化 / 设置 / 插件 / 主页 / 获取帮助 / 使用文档 / 退出登录", async () => {
  const menu = await mountMenu();
  try {
    // 第一行是身份切换（名字 + 当前身份），之后才是这几项。
    const labels = menu.labels();
    assert.match(labels[0], /^someone/);
    const rest = labels.slice(1).map((label) => EXPECTED_ORDER.find((name) => label.startsWith(name)) ?? label);
    assert.deepEqual(rest, EXPECTED_ORDER);
  } finally {
    await menu.unmount();
  }
});

test("不传 personalizationTab 也有「个性化」，点了打开设置窗的 personalization 面板", async () => {
  const menu = await mountMenu();
  try {
    await menu.click("个性化");
    assert.deepEqual(menu.opened, ["personalization"]);
  } finally {
    await menu.unmount();
  }
});

test("「插件」紧跟「设置」，点了打开设置窗的 plugins 面板（不是整页跳 /plugins）", async () => {
  const menu = await mountMenu();
  try {
    const plugins = menu.find("插件");
    assert.ok(plugins, "菜单里没有「插件」");
    assert.equal(plugins.tagName, "BUTTON", "「插件」应当打开设置窗，而不是一个跳页的链接");
    await menu.click("插件");
    assert.deepEqual(menu.opened, ["plugins"]);
  } finally {
    await menu.unmount();
  }
});

test("personalizationTab={null} 才隐藏「个性化」；显式传的面板 id 照旧生效", async () => {
  const hidden = await mountMenu({ personalizationTab: null });
  try {
    assert.equal(hidden.find("个性化"), null);
    assert.ok(hidden.find("插件"), "隐藏个性化不该连带隐藏插件");
  } finally {
    await hidden.unmount();
  }
  const legacy = await mountMenu({ personalizationTab: "memory" });
  try {
    await legacy.click("个性化");
    assert.deepEqual(legacy.opened, ["memory"]);
  } finally {
    await legacy.unmount();
  }
});

test("helpHref={null} 时菜单里不出现「获取帮助」，其余外链不受影响", async () => {
  const menu = await mountMenu({ helpHref: null });
  try {
    assert.equal(menu.find("获取帮助"), null);
    assert.equal(menu.find("主页")?.getAttribute("href"), BASE_PROPS.homeHref);
    assert.equal(menu.find("使用文档")?.getAttribute("href"), BASE_PROPS.docsHref);
  } finally {
    await menu.unmount();
  }
});
