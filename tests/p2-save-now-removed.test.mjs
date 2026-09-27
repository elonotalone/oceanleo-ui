// P2：保存菜单不再出现「立即保存」/ flush-now；无 save 组动作时云朵只报状态。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { PLUGIN_CHROME_COPY_SOURCE } from "../src/i18n/ui/messages/plugin-chrome-copy-base.ts";

const require = createRequire(import.meta.url);

const actionBarUrl = await compileModule(
  "src/shell/AdvancedWorkspaceActionBar.tsx",
  {
    "../i18n/ui/useUI": dataModule(
      `export function useUI() { return (text) => text; }`,
    ),
    "./SplitWorkspace": dataModule(
      `export function useRightPaneSlot() { return null; }`,
    ),
  },
);
const { AdvancedWorkspaceActionBar } = await import(actionBarUrl);

const noop = () => {};

function actionBarProps(overrides = {}) {
  const { adapter, ...rest } = overrides;
  return {
    adapter: {
      id: "grid",
      label: "表格",
      stage: null,
      persistence: { dirty: false, editRevision: 0, flush: noop },
      ...adapter,
    },
    autoSaveState: "saved",
    activeLibraryPanelId: null,
    onBack: noop,
    onOpenLibrary: noop,
    onRetrySave: noop,
    onTriggerAction: noop,
    ...rest,
  };
}

function renderMarkup(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(AdvancedWorkspaceActionBar, actionBarProps(overrides)),
  );
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
    getComputedStyle: window.getComputedStyle.bind(window),
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
  const click = (node) =>
    act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
  try {
    await run({ window, render, find, click });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

test("P2: saveNow 文案键已从会露出的词典里拿掉", () => {
  assert.equal("saveNow" in PLUGIN_CHROME_COPY_SOURCE, false);
  assert.equal(
    Object.values(PLUGIN_CHROME_COPY_SOURCE).includes("立即保存"),
    false,
  );
});

test("P2: 无 save 组时云朵显示四态，且不出现立即保存 / flush-now", () => {
  const labels = {
    saved: "已保存",
    saving: "正在自动保存",
    unconfirmed: "尚未确认保存",
    error: "保存遇到问题",
  };
  for (const [state, label] of Object.entries(labels)) {
    const html = renderMarkup({ autoSaveState: state });
    assert.match(html, new RegExp(label));
    assert.match(html, /data-workspace-save-launcher/);
    assert.match(html, new RegExp(`data-save-state="${state}"`));
    assert.doesNotMatch(html, /立即保存/);
    assert.doesNotMatch(html, /flush-now/);
    if (state === "error") {
      assert.match(html, /aria-haspopup="menu"/);
    } else {
      assert.doesNotMatch(html, /aria-haspopup="menu"/);
      assert.doesNotMatch(html, /data-workspace-save-menu/);
    }
  }
});

test("P2: 有 save 组时菜单入口在，但不含立即保存 / flush-now", () => {
  const html = renderMarkup({
    adapter: {
      actions: [
        { id: "apply-draft", label: "套用草稿", group: "save", onTrigger: noop },
        { id: "recompute", label: "重新计算", onTrigger: noop },
      ],
    },
  });
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /已保存/);
  assert.doesNotMatch(html, /立即保存/);
  assert.doesNotMatch(html, /flush-now/);
});

test("P2: 无动作时点云朵不弹菜单；失败时可点重试", async () => {
  let retries = 0;
  await withDom(async ({ window, render, find, click }) => {
    await render(
      React.createElement(
        AdvancedWorkspaceActionBar,
        actionBarProps({
          autoSaveState: "saved",
          onSaveNow: () => {
            throw new Error("onSaveNow 不该再被动作条用到");
          },
        }),
      ),
    );
    const launcher = find("[data-workspace-save-launcher]");
    assert.ok(launcher);
    assert.equal(launcher.getAttribute("aria-haspopup"), null);
    await click(launcher);
    assert.equal(window.document.querySelector("[data-workspace-save-menu]"), null);

    await render(
      React.createElement(
        AdvancedWorkspaceActionBar,
        actionBarProps({
          autoSaveState: "error",
          onRetrySave: () => {
            retries += 1;
          },
        }),
      ),
    );
    const errorLauncher = find("[data-workspace-save-launcher]");
    assert.match(errorLauncher.textContent || "", /保存遇到问题/);
    await click(errorLauncher);
    const menu = window.document.querySelector("[data-workspace-save-menu]");
    assert.ok(menu, "失败时应能打开重试菜单");
    const retry = menu.querySelector('[data-workspace-save-action-id="retry"]');
    assert.ok(retry);
    assert.equal(
      menu.querySelector('[data-workspace-save-action-id="flush-now"]'),
      null,
    );
    await click(retry);
    assert.equal(retries, 1);
  });
});
