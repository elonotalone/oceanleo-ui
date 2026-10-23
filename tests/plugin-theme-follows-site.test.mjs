// D7（操作员 2026-10-23）：编辑器明暗永远跟着网站走。
// 没有插件自己的本命默认、不读写 localStorage、没有切换键；
// 站点 <html> 切 dark，编辑器根的 data-plugin-theme 跟着变 dark。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const themeUrl = await compileModule("src/shell/plugin-theme.tsx");
const { usePluginTheme, currentPluginTheme, PluginThemeScope } = await import(themeUrl);

async function withDom(htmlClass, run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM(`<!doctype html><html class="${htmlClass}"><body></body></html>`, { pretendToBeVisual: true, url: "https://p.dev.oceanleo.com/library" });
  const keys = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver"];
  const saved = keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const k of keys) {
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: k === "window" ? dom.window : dom.window[k] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  try {
    await run({ dom, root, container });
  } finally {
    await act(async () => root.unmount());
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    dom.window.close();
  }
}

function Probe({ pluginId }) {
  const { theme, accent } = usePluginTheme(pluginId);
  return React.createElement("div", { "data-probe": true, "data-plugin-theme": theme ?? "none", "data-accent": accent ?? "" });
}

test("站点切 dark → 编辑器根 data-plugin-theme 跟着变 dark；切回 light 也跟", async () => {
  await withDom("light", async ({ dom, root, container }) => {
    // 旧版本命默认：video-timeline 默认 dark。现在浅色站点下必须是浅色。
    dom.window.localStorage.setItem("oceanleo.plugin-theme.video-timeline", "dark");
    await act(async () => root.render(React.createElement(Probe, { pluginId: "video-timeline" })));
    const probe = () => container.querySelector("[data-probe]");
    assert.equal(probe().getAttribute("data-plugin-theme"), "light", "浅色站点下视频编辑器还是暗的");
    assert.equal(probe().getAttribute("data-accent"), "#0891b2");
    await act(async () => {
      dom.window.document.documentElement.className = "dark";
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(probe().getAttribute("data-plugin-theme"), "dark", "站点切 dark，编辑器没跟");
    assert.equal(probe().getAttribute("data-accent"), "#22d3ee");
    await act(async () => {
      dom.window.document.documentElement.className = "light";
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(probe().getAttribute("data-plugin-theme"), "light");
  });
});

test("特色主题按明暗归档：暗色包 dark <slug> → dark，浅色包 <slug> → light", async () => {
  await withDom("dark night", async () => {
    assert.equal(currentPluginTheme("richdoc"), "dark");
  });
  await withDom("paper", async () => {
    assert.equal(currentPluginTheme("richdoc"), "light");
  });
});

test("PluginThemeScope 跟站点档，非插件 id 给 null（走站点别名）", async () => {
  await withDom("dark", async ({ root, container }) => {
    await act(async () =>
      root.render(
        React.createElement(
          "div",
          null,
          React.createElement(PluginThemeScope, { pluginId: "grid" }, React.createElement("span", { "data-in": true })),
          React.createElement(Probe, { pluginId: null }),
        ),
      ),
    );
    assert.equal(container.querySelector("[data-plugin-theme-scope]").getAttribute("data-plugin-theme"), "dark");
    assert.equal(container.querySelector("[data-probe]").getAttribute("data-plugin-theme"), "none");
  });
});

test("源码里不再有本命默认、localStorage 与切换键", () => {
  const source = readFileSync(new URL("../src/shell/plugin-theme.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /defaultTheme/);
  assert.doesNotMatch(source, /PluginThemeToggle|data-plugin-theme-toggle/);
});
