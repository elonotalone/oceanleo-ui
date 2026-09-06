import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  currentPluginMode,
  resetPluginModeCache,
  setPluginMode,
} from "../src/shell/plugin-chrome/plugin-mode-store.ts";
import {
  currentPluginPage,
  resetPluginPageCache,
  setPluginPage,
} from "../src/shell/plugin-chrome/plugin-page-store.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const ttStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      String(value).replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match,
      );
  }
`);

function installStorage() {
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  if (!globalThis.window) {
    globalThis.window = { localStorage: storage, addEventListener() {} };
  } else {
    globalThis.window.localStorage = storage;
  }
  return map;
}

test("页面 store 与 mode store 双向一致；aux 页不把模式打回 artifact", () => {
  installStorage();
  resetPluginModeCache();
  resetPluginPageCache();

  assert.equal(currentPluginPage("grid"), "artifact");
  assert.equal(currentPluginMode("grid"), "normal");

  setPluginPage("grid", "pro");
  assert.equal(currentPluginPage("grid"), "pro");
  assert.equal(currentPluginMode("grid"), "pro");

  setPluginPage("grid", "artifact");
  assert.equal(currentPluginMode("grid"), "normal");

  setPluginPage("grid", "code");
  assert.equal(currentPluginPage("grid"), "code");
  assert.equal(currentPluginMode("grid"), "normal");

  setPluginMode("grid", "pro");
  assert.equal(currentPluginPage("grid"), "pro", "切到 pro 模式应落到专业编辑页");

  setPluginPage("grid", "code");
  setPluginMode("grid", "normal");
  assert.equal(
    currentPluginPage("grid"),
    "code",
    "普通模式与 aux 页一致时不要把页打回编辑",
  );
});

function loadHeader() {
  return (async () =>
    import(
      await compileModule("src/shell/InlineAdvancedWorkbenchHeader.tsx", {
        "../i18n/ui/useUI": ttStubUrl,
      })
    ))();
}

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const render = (element) => act(async () => root.render(element));
  const find = (selector) => container.querySelector(selector);
  const findAll = (selector) => [...container.querySelectorAll(selector)];
  const click = (node) =>
    act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
  try {
    await run({ render, find, findAll, click });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

function headerProps(overrides = {}) {
  return {
    adapter: { id: "grid", label: "表格", stage: null },
    autoSaveState: "saved",
    activeDrawerId: "",
    activeLibraryPanelId: null,
    drawers: [],
    accent: "#6d5dfc",
    pluginThemeId: "grid",
    onBack() {},
    onOpenDrawer() {},
    onCloseDrawer() {},
    onOpenTransientPanel() {},
    onOpenLibrary() {},
    onRetrySave() {},
    onUploadFiles() {},
    ...overrides,
  };
}

test("页签顺序是编辑 → 专业编辑 → aux；点专业编辑切到 pro", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  resetPluginModeCache();
  resetPluginPageCache();
  const calls = [];

  await withDom(async ({ render, find, findAll, click }) => {
    function Host() {
      const [editorMode, setEditorMode] = React.useState("normal");
      return React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({
          adapter: {
            id: "grid",
            label: "表格",
            stage: null,
            mode: {
              current: editorMode,
              setMode: (next) => {
                calls.push(next);
                setEditorMode(next);
              },
            },
            pages: {
              aux: [{ id: "code", label: "Code", kind: "aux" }],
            },
          },
        }),
      );
    }
    await render(React.createElement(Host));
    const tabs = findAll("[data-plugin-page]");
    assert.deepEqual(
      tabs.map((node) => node.getAttribute("data-plugin-page")),
      ["artifact", "pro", "code"],
    );
    assert.match(tabs[0].textContent || "", /编辑/);
    assert.match(tabs[1].textContent || "", /专业编辑/);
    assert.equal(tabs[0].getAttribute("aria-current"), "page");

    await click(find('[data-plugin-page="pro"]'));
    assert.equal(currentPluginMode("grid"), "pro");
    assert.equal(currentPluginPage("grid"), "pro");
    assert.deepEqual(calls, ["pro"]);
    assert.equal(
      find('[data-plugin-page="pro"]').getAttribute("aria-current"),
      "page",
    );
  });
});

test("pro 不可用时 title 含原因，点击后仍停在编辑页", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  resetPluginModeCache();
  resetPluginPageCache();
  const calls = [];

  await withDom(async ({ render, find, click }) => {
    await render(
      React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({
          adapter: {
            id: "game",
            label: "游戏",
            stage: null,
            mode: {
              current: "normal",
              setMode: (next) => calls.push(next),
              unavailableReason: "专业编辑即将到来",
            },
          },
          pluginThemeId: "game",
        }),
      ),
    );
    const pro = find('[data-plugin-page="pro"]');
    assert.ok(pro, "专业编辑页签被藏起来了");
    assert.match(pro.getAttribute("title") || "", /专业编辑即将到来/);
    await click(pro);
    assert.equal(currentPluginPage("game"), "artifact");
    assert.equal(currentPluginMode("game"), "normal");
    assert.deepEqual(calls, []);
    assert.equal(
      find('[data-plugin-page="artifact"]').getAttribute("aria-current"),
      "page",
    );
  });
});

// X1（规范 v2 §3）：页签行严格一行、固定 36px、不能上下滚、文字不裁。
// JSDOM 不跑布局（scrollHeight / clientHeight 恒 0，量不出裁切），所以这里锁的是
// **让浮层量得出那个结果的 CSS 契约**：容器 overflow-y-hidden + flex-nowrap + 固定高，
// 页签 h-full + whitespace-nowrap 且不写死任何比行高大的 h-*。真实像素由
// 浏览器探针（`signals/X1-journal.md` 判据 3）用 `scrollHeight <= clientHeight` 复测。
test("页签行单行契约：固定 36px、不纵向滚、页签不换行、不写死比行高大的高度", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  resetPluginModeCache();
  resetPluginPageCache();

  await withDom(async ({ render, find, findAll }) => {
    await render(
      React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({
          adapter: {
            id: "website",
            label: "网站",
            stage: null,
            mode: { current: "normal", setMode() {} },
            pages: {
              aux: [
                { id: "code", label: "Code", kind: "aux" },
                { id: "dashboard", label: "Dashboard", kind: "aux" },
                { id: "database", label: "Database", kind: "aux" },
                { id: "storage", label: "Storage", kind: "aux" },
              ],
            },
          },
          pluginThemeId: null,
        }),
      ),
    );
    const row = find("[data-plugin-page-row]");
    assert.ok(row, "页面行没渲染出来");
    const rowClass = row.className.split(/\s+/);
    for (const required of ["flex", "flex-nowrap", "overflow-y-hidden", "overflow-x-auto"]) {
      assert.ok(rowClass.includes(required), `页面行缺 ${required}：${row.className}`);
    }
    assert.equal(row.style.height, "36px", "页面行高度没钉死在 36px");
    assert.equal(row.style.maxHeight, "36px", "页面行 max-height 没钉死在 36px");
    assert.ok(
      rowClass.some((token) => /scrollbar-width:none/.test(token)),
      "横向溢出时应隐藏滚动条",
    );

    const tabs = findAll("[data-plugin-page]");
    assert.equal(tabs.length, 6, "编辑 + 专业编辑 + 4 个 aux 页应该都在");
    for (const tab of tabs) {
      const tokens = tab.className.split(/\s+/);
      assert.ok(tokens.includes("whitespace-nowrap"), `页签 ${tab.dataset.pluginPage} 可换行`);
      assert.ok(tokens.includes("h-full"), `页签 ${tab.dataset.pluginPage} 没跟随行高`);
      assert.ok(tokens.includes("shrink-0"), `页签 ${tab.dataset.pluginPage} 会被压扁`);
      const pinned = tokens
        .map((token) => /^h-(\d+)$/.exec(token))
        .filter(Boolean)
        .map((match) => Number(match[1]) * 4);
      assert.deepEqual(
        pinned.filter((px) => px > 36),
        [],
        `页签 ${tab.dataset.pluginPage} 写死了比 36px 高的高度：${tab.className}`,
      );
      assert.ok(
        (tab.textContent || "").trim().length > 0 || tab.getAttribute("aria-label"),
        "页签没有可见文字也没有 aria-label",
      );
      assert.equal(tab.getAttribute("role"), "tab");
    }
    // JSDOM 下两者都为 0；真浏览器里这条就是判据本身。留在这里让口径与探针一致。
    assert.ok(row.scrollHeight <= row.clientHeight, "页签行能上下滚");
  });
});

test("专业页签名在切页前后一致：两条 adapter 给同一个 proLabel", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  resetPluginModeCache();
  resetPluginPageCache();

  await withDom(async ({ render, find, click }) => {
    function Host() {
      const [editorMode, setEditorMode] = React.useState("normal");
      return React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({
          adapter: {
            id: "grid",
            label: "表格",
            stage: null,
            mode: {
              current: editorMode,
              setMode: (next) => setEditorMode(next),
            },
            pages: { proLabel: "Univer" },
          },
        }),
      );
    }
    await render(React.createElement(Host));
    assert.match(find('[data-plugin-page="pro"]').textContent || "", /Univer/);
    await click(find('[data-plugin-page="pro"]'));
    const after = find('[data-plugin-page="pro"]');
    assert.match(after.textContent || "", /Univer/);
    assert.equal(after.getAttribute("aria-current"), "page");
    assert.equal(
      /^\s*专业编辑\s*$/.test(after.textContent || ""),
      false,
      "切进专业页后页签掉回了缺省「专业编辑」",
    );
  });
});
