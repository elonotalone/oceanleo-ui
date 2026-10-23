// 安全矩阵：不适用（填写页选项块，无不可信注入）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://video.oceanleo.com/bay" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const { BayChoice } = await import(await compileModule("src/shell/bay/form/BayChoice.tsx"));
const h = React.createElement;

const OPTIONS = [
  { value: "service", title: "做一件事", detail: "按约定的时间交付成果" },
  { value: "consult", title: "答疑", detail: "按次或按小时回答问题" },
];

async function mount(props) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(h(BayChoice, props));
  });
  return {
    host,
    async rerender(next) {
      await act(async () => {
        root.render(h(BayChoice, next));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test("每个选项一块白底小块，标题和说明都在；选中的那块画面上看得出", async () => {
  const picked = [];
  const props = { label: "服务形式", options: OPTIONS, value: "service", onChange: (value) => picked.push(value) };
  const { host, rerender, unmount } = await mount(props);
  const tiles = [...host.querySelectorAll("[data-bay-choice-option]")];
  assert.equal(tiles.length, 2);
  assert.equal(host.querySelector("[data-bay-choice]").getAttribute("aria-label"), "服务形式");
  for (const tile of tiles) {
    assert.match(tile.className, /\bbg-white\b/);
    assert.match(tile.className, /\brounded-xl\b/);
    assert.match(tile.className, /\bborder\b/);
  }
  const [service, consult] = tiles;
  assert.equal(service.textContent.includes("做一件事"), true);
  assert.equal(service.textContent.includes("按约定的时间交付成果"), true);
  // 选中与没选的样式不能相同：旧版两项 className 一字不差，人看不出选了哪个。
  assert.notEqual(service.className, consult.className);
  assert.equal(service.getAttribute("aria-pressed"), "true");
  assert.equal(consult.getAttribute("aria-pressed"), "false");
  assert.ok(service.hasAttribute("data-bay-choice-selected"));
  assert.equal(consult.hasAttribute("data-bay-choice-selected"), false);
  assert.match(service.className, /border-neutral-900/);
  assert.ok(service.querySelector("svg"), "选中的那块有勾");
  assert.equal(consult.querySelector("svg"), null);

  await act(async () => {
    consult.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(picked, ["consult"]);
  await rerender({ ...props, value: "consult" });
  assert.ok(host.querySelector('[data-bay-choice-option="consult"]').hasAttribute("data-bay-choice-selected"));
  assert.equal(host.querySelector('[data-bay-choice-option="service"]').hasAttribute("data-bay-choice-selected"), false);
  await unmount();
});

test("optionProps 把各页自己的 data- 属性挂到选项上；disabled 的点了不回调", async () => {
  const picked = [];
  const { host, unmount } = await mount({
    options: [...OPTIONS, { value: "off", title: "暂不开放", disabled: true }],
    value: "",
    onChange: (value) => picked.push(value),
    optionProps: (value) => ({ "data-bay-service-form-option": value }),
  });
  assert.equal(host.querySelectorAll("[data-bay-choice-selected]").length, 0);
  assert.ok(host.querySelector('[data-bay-service-form-option="consult"]'));
  const off = host.querySelector('[data-bay-choice-option="off"]');
  assert.equal(off.disabled, true);
  await act(async () => {
    off.click();
  });
  assert.deepEqual(picked, []);
  await unmount();
});

test("可折叠选择使用公共菜单、浅色边框和 portal，选值后回调并收起", async () => {
  const picked = [];
  const { host, unmount } = await mount({
    collapsible: true,
    options: OPTIONS,
    value: "service",
    onChange: (value) => picked.push(value),
  });
  assert.ok(host.querySelector("[data-bay-choice-collapsed]"));
  assert.equal(host.querySelectorAll("button[data-bay-choice-option]").length, 1);
  assert.equal(host.querySelector("[data-bay-choice-menu]"), null);
  await act(async () => {
    host.querySelector("button").click();
  });
  const menu = document.querySelector("[data-bay-choice-menu]");
  assert.ok(menu);
  assert.equal(host.contains(menu), false);
  assert.equal(menu.style.position, "fixed");
  assert.equal(menu.querySelectorAll("button[data-bay-choice-option]").length, 2);
  assert.doesNotMatch(host.querySelector("button[data-menu-select-trigger]").className, /border-neutral-900/);
  await act(async () => {
    menu.querySelector('button[data-bay-choice-option="consult"]').click();
  });
  assert.deepEqual(picked, ["consult"]);
  assert.equal(document.querySelector("[data-bay-choice-menu]"), null);
  await unmount();
});
