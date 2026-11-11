// skills-overhaul W10（仲裁 A-16）过期断言改动：账号菜单「插件」→「技能」，落设置中心 skills 栏（原 plugins 栏已拆成技能/连接器）。
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

const brand = { name: "LeoSlides", logo: React.createElement("span", null, "S"), accent: "#6366f1" };
const NAV = [
  { label: "新建", href: "/", icon: React.createElement("span", { "data-icon": "home" }) },
  { label: "我的库", href: "/library", icon: React.createElement("span", { "data-icon": "library" }) },
];

/** 菜单项上用户读到的字：去掉装饰性的图标与 ↗（它们都是 aria-hidden）。 */
function itemLabel(item) {
  const copy = item.cloneNode(true);
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent.trim();
}

/** 那颗按钮的两个认法：它的无障碍名，以及任何指向帮助中心的地址。 */
function helpButtonTraces(markup) {
  const traces = [];
  if (markup.includes("帮助与反馈")) traces.push("「帮助与反馈」按钮");
  if (/help\.oceanleo\.(com|cn)/.test(markup)) traces.push("帮助中心地址");
  return traces;
}

function leoMounts(markup) {
  return [...markup.matchAll(/data-test-leo-shell-mount="" data-site-key="([^"]*)"/g)].map((m) => m[1]);
}

test("嵌入（?embed=1）时 Leo 由 EmbedChrome 的首帧样式藏起来，不靠 AppShell 另写逻辑", () => {
  const embedChrome = readFileSync(new URL("../src/shell/EmbedChrome.tsx", import.meta.url), "utf8");
  const prepaint = embedChrome.match(/const PREPAINT_STYLE = `([^`]*)`/)?.[1] ?? "";
  assert.match(prepaint, /html\[data-embed="1"\] \[data-ai-assistant-root\][^{]*\{display:none!important\}/);
});
