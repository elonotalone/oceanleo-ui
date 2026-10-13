// 安全矩阵：不适用（填写页控件，复用库查看器，无新注入）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const { BayMenuSelect } = await import(await compileModule("src/shell/bay/form/BayMenuSelect.tsx"));
const h = React.createElement;
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const menuSource = readFileSync(join(repo, "src/shell/bay/form/BayMenuSelect.tsx"), "utf8");

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

test("选项多时清单 maxHeight 内纵向可滚，portal 不再 overflow-hidden", async () => {
  const { unmount } = await mount({
    value: "opt-1",
    options: OPTIONS,
    onChange: () => {},
  });
  const trigger = window.document.querySelector("[data-bay-menu-trigger]");
  assert.ok(trigger);
  await act(async () => {
    trigger.click();
  });
  await flush();
  const menu = window.document.querySelector("[data-bay-menu]");
  assert.ok(menu);
  assert.equal(menu.hasAttribute("data-bay-menu-scroll"), true);
  assert.equal(menu.className.includes("overflow-hidden"), false);
  assert.match(menu.className, /\bz-50\b/);
  assert.match(menu.className, /\brounded-xl\b/);
  const maxHeight = menu.style.maxHeight || window.getComputedStyle(menu).maxHeight;
  assert.ok(maxHeight);
  assert.notEqual(maxHeight, "none");
  assert.equal(menu.style.overflowY || window.getComputedStyle(menu).overflowY, "auto");
  await unmount();
});

test("源码把滚动交给 overflowY auto，portal 不再 overflow-hidden", () => {
  assert.match(menuSource, /overflowY:\s*"auto"/);
  assert.match(menuSource, /overflowX:\s*"hidden"/);
  const marker = "data-bay-menu=";
  const portalBlock = menuSource.slice(menuSource.indexOf(marker));
  const classLine = portalBlock.match(/className="([^"]+)"/);
  assert.ok(classLine);
  assert.equal(classLine[1].includes("overflow-hidden"), false);
});
