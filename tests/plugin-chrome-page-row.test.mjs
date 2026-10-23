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
        "../ui/Toast": dataModule(`
          export function useToast() {
            return {
              success() {},
              error() {},
              info() {},
              loading() {},
              show() { return { id: "t", dismiss() {} }; },
              dismiss() {},
              dismissAll() {},
            };
          }
        `),
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
            id: "pdf",
            label: "PDF",
            stage: null,
            mode: {
              current: "normal",
              setMode: (next) => calls.push(next),
              unavailableReason: "专业编辑即将到来",
            },
          },
          pluginThemeId: "pdf",
        }),
      ),
    );
    const pro = find('[data-plugin-page="pro"]');
    assert.ok(pro, "专业编辑页签被藏起来了");
    assert.match(pro.getAttribute("title") || "", /专业编辑即将到来/);
    await click(pro);
    assert.equal(currentPluginPage("pdf"), "artifact");
    assert.equal(currentPluginMode("pdf"), "normal");
    assert.deepEqual(calls, []);
    assert.equal(
      find('[data-plugin-page="artifact"]').getAttribute("aria-current"),
      "page",
    );
  });
});

// D1（操作员 2026-10-23）：顶栏只剩一行。原来的第二行页签行（36px，`[data-plugin-page-row]`）
// 整行删除，页签挪进第一行左段、紧跟「素材库 / 我的库」，舞台多出 36px。
// 锁三件事：没有第二行；页签在第一行的 `pages` 槽里且排在库按钮之后；
// 页签不写死比行高大的高度、不换行、不压扁（命中区 = 撑满 44px 的按钮，胶囊在里面）。
test("页签进第一行：没有第二行页签行，页签排在库按钮之后，单行不裁", async () => {
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
              ],
            },
          },
          pluginThemeId: null,
        }),
      ),
    );
    assert.equal(find("[data-plugin-page-row]"), null, "第二行页签行还在");
    const header = find("[data-advanced-workbench-header]");
    assert.ok(header, "顶栏没渲染");
    assert.equal(header.querySelectorAll("[data-advanced-action-row]").length, 1, "顶栏不止一行");
    const row = find("[data-plugin-global-row]");
    const slot = row.querySelector('[data-global-row-slot="pages"]');
    assert.ok(slot, "第一行没有 pages 槽");
    const library = row.querySelector('[data-global-row-slot="library"]');
    assert.ok(
      library.compareDocumentPosition(slot) & 4 /* FOLLOWING */,
      "页签要排在素材库 / 我的库后面",
    );
    const tabs = findAll("[data-plugin-page]");
    assert.equal(tabs.length, 4, "编辑 + 专业编辑 + 2 个 aux 页应该都在");
    for (const tab of tabs) {
      assert.ok(slot.contains(tab), `页签 ${tab.dataset.pluginPage} 不在第一行的 pages 槽里`);
      const tokens = tab.className.split(/\s+/);
      assert.ok(tokens.includes("h-full"), `页签 ${tab.dataset.pluginPage} 没跟随行高`);
      assert.ok(tokens.includes("shrink-0"), `页签 ${tab.dataset.pluginPage} 会被压扁`);
      const pinned = tokens
        .map((token) => /^h-(\d+)$/.exec(token))
        .filter(Boolean)
        .map((match) => Number(match[1]) * 4);
      assert.deepEqual(pinned.filter((px) => px > 44), [], `页签写死了比行高大的高度：${tab.className}`);
      const pill = tab.querySelector("span");
      assert.ok(pill.className.split(/\s+/).includes("whitespace-nowrap"), "页签文字可换行");
      assert.ok((tab.textContent || "").trim().length > 0, "页签没有可见文字");
      assert.equal(tab.getAttribute("role"), "tab");
    }
  });
});

test("单模式编辑器第一行不画页签", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  resetPluginModeCache();
  resetPluginPageCache();
  await withDom(async ({ find, findAll, render }) => {
    await render(
      React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({ adapter: { id: "deck", label: "PPT", stage: null }, pluginThemeId: "deck" }),
      ),
    );
    assert.ok(find("[data-plugin-global-row]"));
    assert.equal(findAll("[data-plugin-page]").length, 0, "单模式编辑器出了页签");
    assert.equal(find('[data-global-row-slot="pages"]'), null);
    assert.equal(find("[data-plugin-page-row]"), null);
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
