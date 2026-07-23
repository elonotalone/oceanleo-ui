import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, {
  act,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ts from "typescript";

import {
  EDIT_BAR_DOCK_OFFSET_LIMIT,
  editBarDockStorageKey,
  parseEditBarDockState,
  serializeEditBarDockState,
} from "../src/shell/edit-bar-dock-state.ts";

const require = createRequire(import.meta.url);
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
  url: "https://image.oceanleo.com/workspace/poster",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const stateUrl = pathToFileURL(
  resolve("src/shell/edit-bar-dock-state.ts"),
).href;
const geometryUrl = pathToFileURL(
  resolve("src/shell/floating-toolbar-geometry.ts"),
).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileTsxUrl(relativePath, replacements = {}) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    ...replacements,
  })) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
  }
`);
const chromeStubUrl = dataModule(`
  export function advancedWorkbenchStyle(accent) {
    return { "--awb-accent": accent, "--awb-accent-soft": accent + "18" };
  }
`);
const iconsStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function IconLibrary(props) {
    return jsx("span", { ...props, "data-icon": "library" });
  }
`);
const workspaceActionsStubUrl = dataModule(`
  export const WORKSPACE_ACTION_EVENT = "oceanleo:test-workspace-action";
`);

const controlsUrl = await compileTsxUrl(
  "src/shell/EditBarDockControls.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./edit-bar-dock-state": stateUrl,
    "./floating-toolbar-geometry": geometryUrl,
  },
);
const controllerUrl = await compileTsxUrl(
  "src/shell/edit-bar-dock-controller.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./EditBarDockControls": controlsUrl,
    "./edit-bar-dock-state": stateUrl,
    "./floating-toolbar-geometry": geometryUrl,
  },
);
const floatingUrl = await compileTsxUrl(
  "src/shell/FloatingContextToolbar.tsx",
  {
    "react-dom": reactDomUrl,
    "./advanced-workbench-chrome": chromeStubUrl,
    "./edit-bar-dock-controller": controllerUrl,
    "./edit-bar-dock-state": stateUrl,
  },
);
const { FloatingContextToolbar, useFloatingContextToolbar } =
  await import(floatingUrl);

const hostUrl = await compileTsxUrl("src/shell/EditBarDockHost.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./advanced-workbench-chrome": chromeStubUrl,
  "./edit-bar-dock-state": stateUrl,
});
const splitUrl = await compileTsxUrl("src/shell/SplitWorkspace.tsx", {
  "./icons": iconsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./EditBarDockHost": hostUrl,
});
const { SplitWorkspace, useRightPaneSlot, useWorkspacePane } =
  await import(splitUrl);

async function createMounted(Component, props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(target) {
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

async function key(target, value) {
  await act(async () => {
    target.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

async function pointer(target, type, values) {
  await act(async () => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(event, name, { configurable: true, value });
    }
    target.dispatchEvent(event);
  });
}

function DockHarness({ storageKey }) {
  const rootRef = useRef(null);
  const dockRef = useRef(null);
  const stageRef = useRef(null);
  const controller = useFloatingContextToolbar({
    workspaceRootRef: rootRef,
    stageRef,
    dockRootRef: dockRef,
    resetKey: storageKey,
    storageKey,
  });
  return React.createElement(
    "div",
    { ref: rootRef, "data-edit-bar-test-root": true },
    React.createElement("div", {
      ref: dockRef,
      "data-edit-bar-test-dock": true,
      "data-drop-highlight": String(controller.dropActive),
    }),
    React.createElement("div", {
      ref: stageRef,
      "data-edit-bar-test-stage": true,
    }),
    React.createElement(
      FloatingContextToolbar,
      { controller, accent: "#6d5dfc" },
      React.createElement(
        "div",
        {
          "data-selection-anchor-x": "400",
          "data-selection-anchor-y": "200",
          "data-selection-anchor-width": "100",
          "data-selection-anchor-height": "40",
        },
        controller.leading,
        React.createElement("span", null, "selection controls"),
        controller.trailing,
      ),
    ),
  );
}

test("dock state is versioned, bounded, and isolated per workbench", () => {
  const state = {
    version: 1,
    mode: "floating",
    offset: { x: 32, y: -48 },
  };
  assert.deepEqual(parseEditBarDockState(serializeEditBarDockState(state)), state);
  assert.equal(parseEditBarDockState("{broken"), null);
  assert.equal(
    parseEditBarDockState(
      JSON.stringify({
        ...state,
        offset: { x: EDIT_BAR_DOCK_OFFSET_LIMIT + 1, y: 0 },
      }),
    ),
    null,
  );
  assert.notEqual(
    editBarDockStorageKey("image:artifact-one"),
    editBarDockStorageKey("image:artifact-two"),
  );
});

test("both end handles drag out and back with persistence, reset, and pin fallbacks", async () => {
  window.localStorage.clear();
  const storageKey = "test:edit-bar:dock-cycle";
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-edit-bar-test-root")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    if (this.hasAttribute("data-edit-bar-test-dock")) {
      return {
        x: 100, y: 40, left: 100, top: 40, right: 900, bottom: 104,
        width: 800, height: 64, toJSON() {},
      };
    }
    if (this.hasAttribute("data-edit-bar-test-stage")) {
      return {
        x: 0, y: 110, left: 0, top: 110, right: 1000, bottom: 600,
        width: 1000, height: 490, toJSON() {},
      };
    }
    if (
      this.hasAttribute("data-workspace-docked-toolbar") ||
      this.hasAttribute("data-workspace-floating-toolbar")
    ) {
      const transform = this.style.transform || "";
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(transform);
      const left = match ? Number(match[1]) : 100;
      const top = match ? Number(match[2]) : 46;
      return {
        x: left, y: top, left, top, right: left + 300, bottom: top + 52,
        width: 300, height: 52, toJSON() {},
      };
    }
    return originalRect.call(this);
  };

  const mounted = await createMounted(DockHarness, { storageKey });
  const dock = () =>
    mounted.container.querySelector("[data-edit-bar-test-dock]");
  const handles = () => [
    ...mounted.container.querySelectorAll("[data-floating-toolbar-handle]"),
  ];
  try {
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );
    assert.deepEqual(
      handles().map((handle) =>
        handle.getAttribute("data-floating-toolbar-handle"),
      ),
      ["left", "right"],
    );
    assert.match(
      handles()[0].getAttribute("aria-keyshortcuts"),
      /Enter.*ArrowLeft.*Home/,
    );
    assert.equal(
      mounted.container
        .querySelector("[data-edit-bar-pin]")
        .getAttribute("aria-pressed"),
      "true",
    );

    await pointer(handles()[0], "pointerdown", {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 120,
      clientY: 60,
    });
    await pointer(handles()[0], "pointermove", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 400,
      clientY: 300,
    });
    await pointer(handles()[0], "pointerup", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 400,
      clientY: 300,
    });
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
    );
    assert.equal(parseEditBarDockState(window.localStorage.getItem(storageKey)).mode, "floating");

    const rightHandle = handles().find(
      (handle) => handle.dataset.floatingToolbarHandle === "right",
    );
    await pointer(rightHandle, "pointerdown", {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 400,
      clientY: 300,
    });
    await pointer(rightHandle, "pointermove", {
      pointerId: 2,
      pointerType: "touch",
      clientX: 200,
      clientY: 70,
    });
    assert.equal(dock().dataset.dropHighlight, "true");
    await pointer(rightHandle, "pointerup", {
      pointerId: 2,
      pointerType: "touch",
      clientX: 200,
      clientY: 70,
    });
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );
    assert.equal(dock().dataset.dropHighlight, "false");

    await click(mounted.container.querySelector("[data-edit-bar-pin]"));
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
    );
    assert.equal(
      mounted.container
        .querySelector("[data-edit-bar-pin]")
        .getAttribute("aria-pressed"),
      "false",
    );
    await key(handles()[0], "Enter");
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );

    await click(mounted.container.querySelector("[data-edit-bar-pin]"));
    await key(handles()[0], "ArrowRight");
    assert.notDeepEqual(
      parseEditBarDockState(window.localStorage.getItem(storageKey)).offset,
      { x: 0, y: 0 },
    );
    await key(handles()[1], "Home");
    assert.deepEqual(
      parseEditBarDockState(window.localStorage.getItem(storageKey)).offset,
      { x: 0, y: 0 },
    );
  } finally {
    await mounted.unmount();
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});

test("saved floating state restores and malformed state resets to the dock", async () => {
  const storageKey = "test:edit-bar:restore";
  window.localStorage.setItem(
    storageKey,
    serializeEditBarDockState({
      version: 1,
      mode: "floating",
      offset: { x: 33, y: 44 },
    }),
  );
  let mounted = await createMounted(DockHarness, { storageKey });
  try {
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
    );
    assert.equal(
      mounted.container
        .querySelector("[data-floating-toolbar-handle]")
        .dataset.floatingToolbarOffset,
      "33,44",
    );
  } finally {
    await mounted.unmount();
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: 1,
      mode: "floating",
      offset: { x: "not-a-number", y: 0 },
    }),
  );
  mounted = await createMounted(DockHarness, { storageKey });
  try {
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );
    assert.equal(window.localStorage.getItem(storageKey), null);
  } finally {
    await mounted.unmount();
  }
});

function RightPaneRuntime() {
  const pane = useWorkspacePane();
  const slot = useRightPaneSlot();
  const [presentation, setPresentation] = useState({
    ownerId: "edit-bar-test",
    mode: "docked",
    dropActive: false,
    accent: "#6d5dfc",
  });
  const actionRow = useMemo(
    () =>
      React.createElement(
        "div",
        {
          "data-advanced-action-row": true,
          role: "toolbar",
          "aria-label": "工作区操作",
        },
        "素材库 我的库",
      ),
    [],
  );
  useLayoutEffect(() => {
    slot?.setRightEditorHeader(true);
    slot?.setRightLabel(actionRow);
    return () => {
      slot?.clearRightLabel(actionRow);
      slot?.setRightEditorHeader(false);
    };
  }, [actionRow, slot]);
  useLayoutEffect(() => {
    slot?.setEditBarDockPresentation(presentation);
    return () => slot?.clearEditBarDockPresentation("edit-bar-test");
  }, [presentation, slot]);
  return React.createElement(
    "div",
    { "data-right-runtime": true },
    React.createElement(
      "button",
      {
        type: "button",
        "data-open-selection-detail": true,
        onClick() {
          pane?.showDetail({
            ownerId: "edit-bar-test",
            id: "selection-inspector",
            label: "对象属性",
            content: React.createElement(
              "div",
              { "data-selection-detail": true },
              "对象属性",
            ),
          });
        },
      },
      "open detail",
    ),
    React.createElement(
      "button",
      {
        type: "button",
        "data-highlight-dock": true,
        onClick() {
          setPresentation((current) => ({
            ...current,
            mode: "floating",
            dropActive: true,
          }));
        },
      },
      "highlight dock",
    ),
  );
}

test("dock follows the action row and showDetail reveals console without exiting fullscreen", async () => {
  let exitFullscreenCalls = 0;
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value() {
      exitFullscreenCalls += 1;
    },
  });
  const mounted = await createMounted(SplitWorkspace, {
    left: React.createElement("div", { "data-operation-console": true }),
    right: React.createElement(RightPaneRuntime),
    leftLabel: "操作台",
    rightLabel: "库",
    library: { open: true, paneTitle: "库" },
    headerHeight: 0,
  });
  try {
    const root = mounted.container.querySelector("[data-workspace-split]");
    const rightPane = root.querySelector('[data-workspace-pane="main"]');
    const leftPane = root.querySelector('[data-workspace-pane="left"]');
    const actionRow = rightPane.querySelector("[data-advanced-action-row]");
    const header = actionRow.closest("[data-pane-header]");
    const dock = rightPane.querySelector("[data-workspace-edit-bar-dock]");
    assert.equal(header.nextElementSibling, dock);
    assert.equal(dock.parentElement, rightPane);
    assert.equal(dock.getAttribute("aria-label"), "编辑栏停靠区");
    assert.equal(dock.dataset.editBarDockState, "docked");
    assert.equal(dock.hidden, false);
    assert.ok(
      header.querySelector('button[aria-label="这一栏切大屏"]'),
    );

    await click(rightPane.querySelector("[data-highlight-dock]"));
    assert.equal(dock.dataset.editBarDockState, "floating");
    assert.equal(dock.dataset.dropHighlight, "true");
    assert.equal(
      dock.querySelector("[data-edit-bar-dock-placeholder]").textContent,
      "松开以固定编辑栏",
    );

    const maxButton = header.querySelector(
      'button[aria-label="这一栏切大屏"]',
    );
    await click(maxButton);
    assert.equal(root.dataset.workspaceMaximized, "library");
    assert.equal(leftPane.classList.contains("hidden"), true);
    assert.equal(
      rightPane
        .querySelector('button[aria-label="恢复双栏"]')
        .getAttribute("aria-pressed"),
      "true",
    );

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: root,
    });
    await click(rightPane.querySelector("[data-open-selection-detail]"));
    assert.equal(root.dataset.workspaceMaximized, "none");
    assert.equal(leftPane.classList.contains("hidden"), false);
    assert.equal(leftPane.dataset.leftPanel, "tool-detail");
    assert.ok(leftPane.querySelector("[data-selection-detail]"));
    assert.equal(document.fullscreenElement, root);
    assert.equal(exitFullscreenCalls, 0);
  } finally {
    await mounted.unmount();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
  }

  const inline = await readFile(
    new URL("../src/shell/InlineAdvancedWorkbenchShell.tsx", import.meta.url),
    "utf8",
  );
  assert.equal((inline.match(/showWorkspaceDetail\(\{/g) || []).length, 2);
});
