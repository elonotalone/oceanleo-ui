import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import {
  groupSelectionOverflowControls,
  partitionSelectionControls,
} from "../src/shell/selection-toolbar-layout.ts";

test("measured thresholds preserve priority, semantic slots, and authored More", () => {
  const controls = [
    {
      id: "ordinary-wide",
      kind: "action",
      label: "Ordinary",
      group: "format",
    },
    {
      id: "authored-more",
      kind: "action",
      label: "Delete",
      placement: "more",
      danger: true,
    },
    {
      id: "late-primary",
      kind: "action",
      label: "Primary",
      placement: "primary",
    },
    {
      id: "ordinary-small",
      kind: "action",
      label: "Small",
    },
    {
      id: "inspector-only",
      kind: "number",
      label: "Inspector",
      slot: "inspector",
    },
    {
      id: "stage-only",
      kind: "action",
      label: "Stage",
      slot: "stage",
    },
    {
      id: "context-only",
      kind: "action",
      label: "Context",
      slot: "context-menu",
    },
    {
      id: "tools-only",
      kind: "panel",
      label: "Tools",
      placement: "tools",
    },
  ];
  const widths = new Map([
    ["ordinary-wide", 80],
    ["late-primary", 90],
    ["ordinary-small", 70],
  ]);

  const exactFit = partitionSelectionControls(controls, widths, 296);
  assert.deepEqual(
    exactFit.visible.map(({ id }) => id),
    ["ordinary-wide", "late-primary", "ordinary-small"],
  );
  assert.deepEqual(
    exactFit.overflow.map(({ id }) => id),
    ["authored-more"],
  );

  const onePixelNarrower = partitionSelectionControls(controls, widths, 295);
  assert.deepEqual(
    onePixelNarrower.visible.map(({ id }) => id),
    ["ordinary-wide", "late-primary"],
  );
  assert.deepEqual(
    onePixelNarrower.overflow.map(({ id }) => id),
    ["authored-more", "ordinary-small"],
  );

  const priorityConstrained = partitionSelectionControls(
    controls,
    widths,
    212,
  );
  assert.deepEqual(
    priorityConstrained.visible.map(({ id }) => id),
    ["late-primary", "ordinary-small"],
  );
  assert.deepEqual(
    priorityConstrained.overflow.map(({ id }) => id),
    ["ordinary-wide", "authored-more"],
  );
  assert.equal(
    [...priorityConstrained.visible, ...priorityConstrained.overflow].some(
      ({ id }) =>
        id === "inspector-only" ||
        id === "stage-only" ||
        id === "context-only" ||
        id === "tools-only",
    ),
    false,
  );
  assert.deepEqual(
    groupSelectionOverflowControls(priorityConstrained.overflow).map(
      ({ id, controls: grouped }) => [id, grouped.map(({ id: controlId }) => controlId)],
    ),
    [
      ["group:format", ["ordinary-wide"]],
      ["danger", ["authored-more"]],
    ],
  );
});

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
  url: "https://excel.oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
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
const visualViewport = new window.EventTarget();
Object.assign(visualViewport, {
  width: 1_024,
  height: 768,
  offsetLeft: 0,
  offsetTop: 0,
});
Object.defineProperty(window, "visualViewport", {
  configurable: true,
  value: visualViewport,
});

class ToolbarResizeObserver {
  static instances = new Set();

  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    ToolbarResizeObserver.instances.add(this);
  }

  observe(target) {
    this.targets.add(target);
  }

  disconnect() {
    this.targets.clear();
    ToolbarResizeObserver.instances.delete(this);
  }

  static flush() {
    for (const observer of ToolbarResizeObserver.instances) {
      observer.callback(
        [...observer.targets].map((target) => ({
          target,
          contentRect: target.getBoundingClientRect(),
        })),
        observer,
      );
    }
  }
}
globalThis.ResizeObserver = ToolbarResizeObserver;
window.ResizeObserver = ToolbarResizeObserver;

let containerWidth = 420;
const measuredControlWidths = new Map([
  ["primary", 70],
  ["cjk", 160],
  ["ordinary", 80],
  ["danger", 90],
  ["design-color", 44],
  ["design-authored-more", 44],
]);

function rect(width, height = 44) {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() {
      return this;
    },
  };
}

const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
function toolbarRectMock() {
  const measuredId = this.getAttribute("data-selection-measure-control-id");
  if (measuredId) return rect(measuredControlWidths.get(measuredId) || 0);
  if (
    this.hasAttribute("data-selection-toolbar-test-host") ||
    this.hasAttribute("data-workspace-docked-toolbar") ||
    this.getAttribute("role") === "toolbar"
  ) {
    return rect(containerWidth);
  }
  return rect(0, 0);
}
window.HTMLElement.prototype.getBoundingClientRect = toolbarRectMock;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileTsxUrl(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(
      `from ${JSON.stringify(specifier)};`,
      `from ${JSON.stringify(replacement)};`,
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

async function loadSelectionToolbar() {
  const iconStubUrl = dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function AdvancedEditorIcon({ name, className }) {
      return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
    }
  `);
  const animationStubUrl = dataModule(`
    export function SelectionAnimationGallery() { return null; }
  `);
  const advancedLayoutStubUrl = dataModule(`
    export function useAdvancedLayout() {
      return globalThis.__adaptiveToolbarLayout || null;
    }
    export function registerAdvancedToolsTrigger() { return () => {}; }
  `);
  const editorToolsStubUrl = dataModule(`
    export function EditorToolsTrigger() { return null; }
  `);
  const selectionContextStubUrl = dataModule(`
    let nextRequest = 0;
    export function selectionRequestId() {
      nextRequest += 1;
      return "adaptive-toolbar-" + nextRequest;
    }
  `);
  const inspectorHostStubUrl = dataModule(`
    export function useSelectionInspectorHost({ onOpenPanel }) {
      return {
        openPanel: onOpenPanel || (() => {}),
        activePanelId: "",
        fallbackPanel: null,
      };
    }
  `);
  const buttonControlUrl = await compileTsxUrl(
    "src/shell/SelectionToolbarButtonControl.tsx",
    { react: reactUrl },
  );
  const numberControlUrl = await compileTsxUrl(
    "src/shell/SelectionToolbarNumberControl.tsx",
    { react: reactUrl },
  );
  const selectControlUrl = await compileTsxUrl(
    "src/shell/SelectionToolbarSelectControl.tsx",
    {
      react: reactUrl,
      "./AdvancedEditorIcon": iconStubUrl,
      "./selection-context": selectionContextStubUrl,
      "./selection-toolbar-layout": pathToFileURL(
        resolve("src/shell/selection-toolbar-layout.ts"),
      ).href,
    },
  );
  const toolbarUrl = await compileTsxUrl("src/shell/SelectionToolbar.tsx", {
    react: reactUrl,
    "./AdvancedEditorIcon": iconStubUrl,
    "./SelectionAnimationGallery": animationStubUrl,
    "./advanced-layout-context": advancedLayoutStubUrl,
    "./EditorToolsIcon": editorToolsStubUrl,
    "./selection-context": selectionContextStubUrl,
    "./selection-toolbar-layout": pathToFileURL(
      resolve("src/shell/selection-toolbar-layout.ts"),
    ).href,
    "./selection-inspector-groups": pathToFileURL(
      resolve("src/shell/selection-inspector-groups.ts"),
    ).href,
    "./selection-inspector-host": inspectorHostStubUrl,
    "./SelectionToolbarButtonControl": buttonControlUrl,
    "./SelectionToolbarNumberControl": numberControlUrl,
    "./SelectionToolbarSelectControl": selectControlUrl,
  });
  return (await import(toolbarUrl)).SelectionToolbar;
}

async function createMounted(Component, props, mode = "bar") {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  host.setAttribute("data-selection-toolbar-test-host", "");
  document.body.append(host);
  const mountPoint =
    mode === "bar" ? host : document.createElement("div");
  if (mode !== "bar") {
    mountPoint.setAttribute(
      mode === "floating"
        ? "data-workspace-floating-toolbar"
        : "data-workspace-docked-toolbar",
      "",
    );
    host.append(mountPoint);
  }
  const root = createRoot(mountPoint);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    host,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
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

test("ResizeObserver moves measured CJK overflow into accessible More without oscillation", async () => {
  const SelectionToolbar = await loadSelectionToolbar();
  const context = {
    version: 1,
    kind: "grid-cell",
    id: "cell:sheet:A1",
    label: "单元格 A1 编辑工具",
    controls: [
      {
        id: "primary",
        kind: "action",
        label: "主要操作",
        placement: "primary",
      },
      {
        id: "cjk",
        kind: "action",
        label: "超长中文排版选项",
        group: "typography",
      },
      {
        id: "ordinary",
        kind: "action",
        label: "普通操作",
      },
      {
        id: "danger",
        kind: "action",
        label: "删除对象",
        danger: true,
      },
      {
        id: "context-only",
        kind: "action",
        label: "右键专用",
        slot: "context-menu",
      },
    ],
  };
  containerWidth = 420;
  const mounted = await createMounted(SelectionToolbar, {
    context,
    onCommand() {},
  });
  try {
    const toolbar = mounted.host.querySelector('[role="toolbar"]');
    assert.ok(toolbar);
    assert.equal(toolbar.getAttribute("aria-label"), "单元格 A1 编辑工具");
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "primary cjk ordinary danger",
    );
    assert.equal(toolbar.getAttribute("data-selection-overflow-controls"), "");
    assert.equal(
      mounted.host.querySelector('button[aria-label="更多属性"]'),
      null,
    );

    await act(async () => {
      containerWidth = 202;
      ToolbarResizeObserver.flush();
    });
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "primary ordinary",
    );
    assert.equal(
      toolbar.getAttribute("data-selection-overflow-controls"),
      "cjk danger",
    );
    assert.equal(
      mounted.host.querySelector('[data-selection-control-id="context-only"]'),
      null,
    );

    const more = mounted.host.querySelector('button[aria-label="更多属性"]');
    assert.ok(more);
    assert.equal(more.getAttribute("aria-haspopup"), "dialog");
    assert.equal(more.getAttribute("aria-expanded"), "false");
    await click(more);
    const dialog = mounted.host.querySelector(
      '[role="dialog"][aria-label="更多属性"]',
    );
    assert.ok(dialog);
    assert.equal(more.getAttribute("aria-expanded"), "true");
    assert.equal(more.getAttribute("aria-controls"), dialog.id);
    assert.deepEqual(
      [...dialog.querySelectorAll("[data-selection-overflow-group]")].map(
        (group) => [
          group.getAttribute("data-selection-overflow-group"),
          group.getAttribute("aria-label"),
        ],
      ),
      [
        ["group:typography", "更多操作"],
        ["danger", "危险操作"],
      ],
    );
    assert.equal(document.activeElement?.getAttribute("aria-label"), "超长中文排版选项");

    await act(async () => {
      containerWidth = 300;
      ToolbarResizeObserver.flush();
    });
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "primary cjk",
    );
    assert.equal(
      toolbar.getAttribute("data-selection-overflow-controls"),
      "ordinary danger",
    );
    assert.equal(document.activeElement?.getAttribute("aria-label"), "普通操作");

    await act(async () => {
      containerWidth = 420;
      ToolbarResizeObserver.flush();
    });
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "primary cjk ordinary danger",
    );
    assert.equal(toolbar.getAttribute("data-selection-overflow-controls"), "");
    assert.equal(
      mounted.host.querySelector('button[aria-label="更多属性"]'),
      null,
    );
    assert.equal(document.activeElement?.getAttribute("aria-label"), "删除对象");

    await act(async () => {
      containerWidth = 202;
      ToolbarResizeObserver.flush();
    });
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "primary ordinary",
    );
    assert.equal(
      toolbar.getAttribute("data-selection-overflow-controls"),
      "cjk danger",
    );
  } finally {
    await mounted.unmount();
  }
});

test("floating and docked hosts use their actual observed container widths", async () => {
  const SelectionToolbar = await loadSelectionToolbar();
  const context = {
    version: 1,
    kind: "grid-cell",
    id: "cell:sheet:B2",
    label: "Responsive grid toolbar",
    controls: [
      {
        id: "primary",
        kind: "action",
        label: "Primary",
        placement: "primary",
      },
      { id: "cjk", kind: "action", label: "较长的中文属性" },
      { id: "ordinary", kind: "action", label: "Ordinary" },
      { id: "danger", kind: "action", label: "Delete", danger: true },
    ],
  };
  globalThis.__adaptiveToolbarLayout = {
    toolsLauncher: null,
    contextBarLeading: null,
    contextBarTrailing: null,
    activeTransientPanelId: "",
    closeDrawer() {},
  };

  visualViewport.width = 1_024;
  containerWidth = 500;
  const floating = await createMounted(
    SelectionToolbar,
    { context, onCommand() {} },
    "floating",
  );
  try {
    const toolbar = floating.host.querySelector('[role="toolbar"]');
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "primary cjk ordinary danger",
    );
    await act(async () => {
      visualViewport.width = 234;
      visualViewport.dispatchEvent(new window.Event("resize"));
    });
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "primary ordinary",
    );
    assert.equal(
      toolbar.getAttribute("data-selection-overflow-controls"),
      "cjk danger",
    );
  } finally {
    await floating.unmount();
  }

  visualViewport.width = 1_024;
  containerWidth = 202;
  const docked = await createMounted(
    SelectionToolbar,
    { context, onCommand() {} },
    "docked",
  );
  try {
    const toolbar = docked.host.querySelector('[role="toolbar"]');
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "primary ordinary",
    );
    assert.equal(
      toolbar.getAttribute("data-selection-overflow-controls"),
      "cjk danger",
    );
  } finally {
    await docked.unmount();
    globalThis.__adaptiveToolbarLayout = null;
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});

test("Design canonical ordering never promotes authored More controls", async () => {
  window.HTMLElement.prototype.getBoundingClientRect = toolbarRectMock;
  visualViewport.width = 1_024;
  containerWidth = 500;
  globalThis.__adaptiveToolbarLayout = {
    toolsLauncher: {
      id: "design-canvas",
      available: false,
    },
    contextBarLeading: null,
    contextBarTrailing: null,
    activeTransientPanelId: "",
    closeDrawer() {},
  };
  const SelectionToolbar = await loadSelectionToolbar();
  const mounted = await createMounted(SelectionToolbar, {
    context: {
      version: 1,
      kind: "design-text",
      id: "text:hero",
      label: "Design text toolbar",
      controls: [
        {
          id: "design-authored-more",
          kind: "toggle",
          label: "Bold",
          semantic: "bold",
          placement: "more",
          value: false,
        },
        {
          id: "design-color",
          kind: "color",
          label: "Color",
          semantic: "color",
          value: "#000000",
        },
      ],
    },
    onCommand() {},
  });
  try {
    const toolbar = mounted.host.querySelector('[role="toolbar"]');
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      "design-color",
    );
    assert.equal(
      toolbar.getAttribute("data-selection-overflow-controls"),
      "design-authored-more",
    );
    assert.ok(
      mounted.host.querySelector('button[aria-label="更多属性"]'),
    );
  } finally {
    await mounted.unmount();
    globalThis.__adaptiveToolbarLayout = null;
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});
