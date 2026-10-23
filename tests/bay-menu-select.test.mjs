// 安全矩阵：不适用（填写页控件，复用库查看器，无新注入）
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://video.oceanleo.com/bay",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const { BayMenuSelect } = await import(await compileModule("src/shell/bay/form/BayMenuSelect.tsx", {
  "../../../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
}));
const h = React.createElement;

const OPTIONS = Array.from({ length: 20 }, (_, index) => ({
  value: `opt-${index + 1}`,
  label: `选项 ${index + 1}`,
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(props) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(h(BayMenuSelect, props));
  });
  await flush();
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

test("表单菜单复用共用选择框，选项在有高度限制的 portal 内独立滚动", async () => {
  const { unmount } = await mount({
    value: "opt-1",
    options: OPTIONS,
    onChange: () => {},
  });
  const trigger = window.document.querySelector("[data-bay-menu-trigger]");
  assert.ok(trigger);
  assert.match(trigger.className, /rounded-xl/);
  assert.match(trigger.className, /border-neutral-200/);
  assert.doesNotMatch(trigger.className, /border-neutral-900/);
  await act(async () => {
    trigger.click();
  });
  await flush();
  const menu = window.document.querySelector("[data-bay-menu]");
  assert.ok(menu);
  assert.equal(menu.hasAttribute("data-bay-menu-scroll"), true);
  assert.match(menu.className, /\bz-50\b/);
  assert.match(menu.className, /\brounded-xl\b/);
  const maxHeight = menu.style.maxHeight || window.getComputedStyle(menu).maxHeight;
  assert.ok(maxHeight);
  assert.notEqual(maxHeight, "none");
  const options = menu.querySelector("[data-menu-select-options]");
  assert.ok(options);
  assert.match(options.className, /min-h-0.*overflow-y-auto/);
  assert.ok(Number(menu.style.zIndex) > 1000);
  assert.doesNotMatch(trigger.className, /border-neutral-900/);
  await unmount();
});

test("表单菜单保留字段元数据、禁用选项，键盘选择同步原字段", async () => {
  let picked = "";
  const { host, unmount } = await mount({
    label: "类别",
    value: "a",
    options: [
      { value: "a", label: "A", attrs: { "data-kind": "a" } },
      { value: "b", label: "B", disabled: true },
      { value: "c", label: "C", attrs: { "data-kind": "c" } },
    ],
    selectProps: { "data-bay-field": "category" },
    onChange: (value) => { picked = value; },
  });
  const trigger = host.querySelector("[data-bay-menu-trigger]");
  assert.ok(host.querySelector("select[data-bay-field='category'] option[data-kind='a']"));
  await act(async () => trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  await flush();
  const menu = window.document.querySelector("[data-bay-menu]");
  assert.ok(menu);
  await act(async () => menu.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  await act(async () => menu.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  assert.equal(picked, "c");
  assert.equal(window.document.querySelector("[data-bay-menu]"), null);
  assert.equal(window.document.activeElement, trigger);
  await unmount();
});
