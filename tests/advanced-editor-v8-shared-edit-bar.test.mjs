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
  selectionControlUsesIconOnly,
  SELECTION_TOOLBAR_MAX_COMPACT_CONTROLS,
} from "../src/shell/selection-toolbar-layout.ts";
import {
  isCompactSelectionControl,
  partitionSelectionInspectorControls,
} from "../src/shell/selection-inspector-groups.ts";
import { normalizeSelectionContext } from "../src/shell/selection-context.ts";

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
  url: "http://localhost/",
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const iconStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedEditorIcon({ name, className }) {
    return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
  }
`);
const layoutStubUrl = dataModule(`
  export function useAdvancedLayout() {
    return globalThis.__oceanleoV8Layout || null;
  }
  export function registerAdvancedToolsTrigger(id, focus) {
    globalThis.__oceanleoV8ToolFocus = { id, focus };
    return () => {
      if (globalThis.__oceanleoV8ToolFocus?.focus === focus) {
        globalThis.__oceanleoV8ToolFocus = null;
      }
    };
  }
`);
const selectionContextStubUrl = dataModule(`
  let request = 0;
  export function selectionRequestId() {
    request += 1;
    return "selection-test-" + request;
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
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
  }
`);

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

async function loadTsx(relativePath, replacements) {
  return import(await compileTsxUrl(relativePath, replacements));
}

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
    async render(nextProps) {
      await act(async () => {
        root.render(React.createElement(Component, nextProps));
      });
    },
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

test("v8 semantic placement is stable at every width and capped deterministically", () => {
  const controls = [
    ...Array.from(
      { length: SELECTION_TOOLBAR_MAX_COMPACT_CONTROLS + 2 },
      (_, index) => ({
        id: `compact-${index}`,
        kind: "action",
        label: `Compact ${index}`,
        icon: "bold",
      }),
    ),
    {
      id: "hard-more",
      kind: "action",
      label: "Hard More",
      placement: "more",
    },
    {
      id: "left-tool",
      kind: "panel",
      label: "Left Tool",
      placement: "tools",
    },
    {
      id: "context-only",
      kind: "action",
      label: "Context only",
      slot: "context-menu",
    },
  ];
  const snapshots = [320, 480, 768, 1280, 1920].map((width) =>
    partitionSelectionControls(
      controls,
      new Map(controls.map((control) => [control.id, 240])),
      width,
    ),
  );
  const expectedVisible = Array.from(
    { length: SELECTION_TOOLBAR_MAX_COMPACT_CONTROLS },
    (_, index) => `compact-${index}`,
  );
  const expectedOverflow = ["compact-6", "compact-7", "hard-more"];
  for (const snapshot of snapshots) {
    assert.deepEqual(
      snapshot.visible.map((control) => control.id),
      expectedVisible,
    );
    assert.deepEqual(
      snapshot.overflow.map((control) => control.id),
      expectedOverflow,
    );
    assert.equal(
      [...snapshot.visible, ...snapshot.overflow].some(
        (control) =>
          control.id === "left-tool" || control.id === "context-only",
      ),
      false,
    );
  }
  assert.equal(selectionControlUsesIconOnly(controls[0]), true);
  assert.equal(
    selectionControlUsesIconOnly({
      ...controls[0],
      iconOnly: false,
    }),
    false,
  );
  assert.deepEqual(
    groupSelectionOverflowControls([
      { id: "inspect", kind: "panel", label: "Inspect" },
      {
        id: "delete",
        kind: "action",
        label: "Delete",
        danger: true,
        group: "arrange",
      },
      { id: "duplicate", kind: "action", label: "Duplicate" },
    ]).map((group) => [group.id, group.controls.map((control) => control.id)]),
    [
      ["inspectors", ["inspect"]],
      ["danger", ["delete"]],
      ["actions", ["duplicate"]],
    ],
  );
});

test("inspector triggers are compact icon controls while context-menu controls stay out", () => {
  const result = partitionSelectionInspectorControls([
    {
      id: "letter-spacing",
      kind: "range",
      label: "Letter spacing",
      value: 0,
      inspectorGroup: "typography",
      inspectorLabel: "Typography",
      inspectorIcon: "spacing",
    },
    {
      id: "context-delete",
      kind: "action",
      label: "Delete",
      slot: "context-menu",
      inspectorGroup: "context-actions",
      inspectorLabel: "Context actions",
    },
  ]);
  assert.equal(result.compact.length, 1);
  assert.deepEqual(result.compact[0], {
    id: "selection-inspector-typography",
    kind: "panel",
    label: "Typography",
    icon: "spacing",
    iconOnly: true,
    panelId: "selection-inspector-typography",
    placement: "primary",
    slot: "compact",
  });
  assert.equal(isCompactSelectionControl(result.compact[0]), true);

  const normalized = normalizeSelectionContext({
    version: 1,
    kind: "text",
    id: "text:hero",
    controls: [
      {
        id: "font",
        kind: "action",
        label: "Font",
        icon: "font",
        iconOnly: false,
        placement: "primary",
      },
    ],
  });
  assert.equal(normalized?.controls[0].iconOnly, false);
  assert.equal(normalized?.controls[0].placement, "primary");
});

test("the tools launcher registry keeps one active host launcher and focus target", async () => {
  const layoutModule = await loadTsx(
    "src/shell/advanced-layout-context.tsx",
    {
      react: reactUrl,
    },
  );
  const first = {
    id: "image",
    label: "Open image tools",
    controlsId: "image-tools",
    available: true,
    expanded: false,
    toggle() {},
  };
  const second = {
    id: "video",
    label: "Open video tools",
    controlsId: "video-tools",
    available: true,
    expanded: true,
    toggle() {},
  };
  const unregisterFirst = layoutModule.registerAdvancedToolsLauncher(first);
  assert.equal(layoutModule.getAdvancedToolsLauncherSnapshot(), first);
  const unregisterSecond = layoutModule.registerAdvancedToolsLauncher(second);
  assert.equal(layoutModule.getAdvancedToolsLauncherSnapshot(), second);
  unregisterSecond();
  assert.equal(layoutModule.getAdvancedToolsLauncherSnapshot(), first);

  let previousFocused = 0;
  let newestFocused = 0;
  const unregisterPreviousFocus = layoutModule.registerAdvancedToolsTrigger(
    "image",
    () => {
      previousFocused += 1;
    },
  );
  const unregisterNewestFocus = layoutModule.registerAdvancedToolsTrigger(
    "image",
    () => {
      newestFocused += 1;
    },
  );
  layoutModule.focusAdvancedToolsTrigger("image");
  assert.equal(previousFocused, 0);
  assert.equal(newestFocused, 1);
  unregisterNewestFocus();
  layoutModule.focusAdvancedToolsTrigger("image");
  assert.equal(previousFocused, 1);
  assert.equal(newestFocused, 1);
  unregisterPreviousFocus();
  layoutModule.focusAdvancedToolsTrigger("image");
  assert.equal(previousFocused, 1);
  unregisterFirst();
  assert.equal(layoutModule.getAdvancedToolsLauncherSnapshot(), null);
});

test("shared edit bar popovers expose focusable dialog semantics", async () => {
  const [floatingSource, headerSource] = await Promise.all([
    readFile(resolve("src/shell/FloatingContextToolbar.tsx"), "utf8"),
    readFile(resolve("src/shell/InlineAdvancedWorkbenchHeader.tsx"), "utf8"),
  ]);
  assert.match(floatingSource, /data-floating-toolbar-handle/);
  assert.match(floatingSource, /event\.currentTarget\.focus\(\)/);
  assert.match(floatingSource, /overflow-visible/);
  assert.match(
    headerSource,
    /id=\{ADVANCED_TOOLS_PANEL_ID\}[\s\S]{0,120}role="dialog"/,
  );
  assert.match(headerSource, /event\.key !== "Escape"/);
  assert.match(headerSource, /focusAdvancedToolsTrigger\(adapter\.id\)/);
});

test("shared edit bar opens host tools, keeps values, and uses a focused vertical More dialog", async () => {
  const editorToolsIconUrl = await compileTsxUrl(
    "src/shell/EditorToolsIcon.tsx",
    {
      react: reactUrl,
      "./AdvancedEditorIcon": iconStubUrl,
    },
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
  const { SelectionToolbar } = await loadTsx(
    "src/shell/SelectionToolbar.tsx",
    {
      react: reactUrl,
      "./AdvancedEditorIcon": iconStubUrl,
      "./advanced-layout-context": layoutStubUrl,
      "./EditorToolsIcon": editorToolsIconUrl,
      "./selection-context": selectionContextStubUrl,
      "./selection-toolbar-layout": pathToFileURL(
        resolve("src/shell/selection-toolbar-layout.ts"),
      ).href,
      "./selection-inspector-groups": pathToFileURL(
        resolve("src/shell/selection-inspector-groups.ts"),
      ).href,
      "./selection-inspector-host": inspectorHostStubUrl,
      "./SelectionToolbarSelectControl": selectControlUrl,
    },
  );
  let toolsOpened = 0;
  globalThis.__oceanleoV8Layout = {
    hostPanelVisible: false,
    editorToolActive: false,
    activeDrawerId: "",
    activeTransientPanelId: "",
    openDrawer() {},
    openTransientPanel() {},
    updateTransientPanel() {},
    closeDrawer() {},
    toolsLauncher: {
      id: "image",
      label: "Open image tools",
      controlsId: "advanced-workbench-tools-panel",
      available: true,
      expanded: false,
      toggle() {
        toolsOpened += 1;
      },
    },
  };
  const commands = [];
  const props = {
    context: {
      version: 1,
      kind: "image-text",
      id: "text:hero",
      label: "Hero title",
      revision: 7,
      controls: [
        {
          id: "bold",
          kind: "toggle",
          label: "Bold",
          icon: "bold",
          value: false,
        },
        {
          id: "font-family",
          kind: "select",
          label: "Font",
          icon: "font",
          value: "inter",
          options: [{ value: "inter", label: "Inter" }],
        },
        {
          id: "font-size",
          kind: "number",
          label: "Font size",
          icon: "font",
          value: 24,
          min: 8,
          max: 96,
        },
        {
          id: "crop",
          kind: "action",
          label: "Crop",
        },
        {
          id: "letter-spacing",
          kind: "range",
          label: "Letter spacing",
          icon: "spacing",
          value: 0,
          inspectorGroup: "typography",
          inspectorLabel: "Typography",
          inspectorIcon: "spacing",
        },
        {
          id: "delete",
          kind: "action",
          label: "Delete",
          icon: "delete",
          danger: true,
          placement: "more",
        },
        {
          id: "context-duplicate",
          kind: "action",
          label: "Context duplicate",
          slot: "context-menu",
        },
      ],
    },
    onCommand(command) {
      commands.push(command);
    },
  };
  const mounted = await createMounted(SelectionToolbar, props);
  try {
    const tools = mounted.container.querySelector(
      "[data-editor-tools-trigger]",
    );
    assert.ok(tools);
    assert.equal(tools.tagName, "BUTTON");
    assert.equal(tools.getAttribute("aria-expanded"), "false");
    assert.equal(
      tools.getAttribute("aria-controls"),
      "advanced-workbench-tools-panel",
    );
    assert.equal(
      tools.querySelector("[data-icon]")?.getAttribute("data-icon"),
      "text",
    );
    await click(tools);
    assert.equal(toolsOpened, 1);

    const bold = mounted.container.querySelector('button[aria-label="Bold"]');
    assert.ok(bold);
    assert.equal(bold.textContent, "");
    const font = mounted.container.querySelector('button[aria-label="Font"]');
    assert.ok(font);
    assert.equal(font.textContent.includes("Inter"), true);
    assert.equal(font.textContent.includes("Font"), false);
    const fontSize = mounted.container.querySelector(
      'input[aria-label="Font size"]',
    );
    assert.equal(fontSize?.value, "24");
    assert.equal(
      mounted.container.querySelector(
        '[data-selection-control-id="crop"]',
      )?.textContent,
      "Crop",
    );
    const inspector = mounted.container.querySelector(
      'button[aria-label="Typography"]',
    );
    assert.ok(inspector);
    assert.equal(inspector.textContent, "");
    assert.equal(
      mounted.container.querySelector(
        '[data-selection-control-id="context-duplicate"]',
      ),
      null,
    );
    assert.equal(
      mounted.container.querySelector('[data-selection-control-id="delete"]'),
      null,
    );

    const more = mounted.container.querySelector(
      'button[aria-label="更多属性"]',
    );
    assert.ok(more);
    await click(more);
    const dialog = mounted.container.querySelector(
      '[role="dialog"][aria-label="更多属性"]',
    );
    assert.ok(dialog);
    assert.equal(
      dialog.querySelectorAll("[data-selection-overflow-group]").length,
      1,
    );
    const deleteButton = dialog.querySelector('button[aria-label="Delete"]');
    assert.ok(deleteButton);
    assert.equal(deleteButton.textContent, "Delete");
    assert.equal(document.activeElement, deleteButton);
    await click(deleteButton);
    assert.equal(dialog.isConnected, false);
    assert.equal(document.activeElement, more);
    assert.deepEqual(commands[0], {
      requestId: "selection-test-1",
      selectionId: "text:hero",
      controlId: "delete",
      selectionRevision: 7,
    });

    await click(more);
    assert.ok(
      mounted.container.querySelector(
        '[role="dialog"][aria-label="更多属性"]',
      ),
    );
    await act(async () => {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(
      mounted.container.querySelector(
        '[role="dialog"][aria-label="更多属性"]',
      ),
      null,
    );
    assert.equal(document.activeElement, more);

    globalThis.__oceanleoV8ToolFocus.focus();
    assert.equal(document.activeElement, tools);

    globalThis.__oceanleoV8Layout = {
      ...globalThis.__oceanleoV8Layout,
      toolsLauncher: {
        ...globalThis.__oceanleoV8Layout.toolsLauncher,
        available: false,
        unavailableReason: "Read only",
      },
    };
    await mounted.render(props);
    const unavailableTools = mounted.container.querySelector(
      "[data-editor-tools-trigger]",
    );
    assert.equal(unavailableTools.getAttribute("aria-disabled"), "true");
    assert.match(unavailableTools.getAttribute("aria-label"), /Read only/);
    assert.equal(unavailableTools.getAttribute("aria-haspopup"), null);
    assert.equal(unavailableTools.getAttribute("aria-expanded"), null);
    assert.equal(unavailableTools.getAttribute("aria-controls"), null);
    unavailableTools.focus();
    assert.equal(document.activeElement, unavailableTools);
    await click(unavailableTools);
    assert.equal(toolsOpened, 1);
  } finally {
    await mounted.unmount();
    globalThis.__oceanleoV8Layout = null;
    globalThis.__oceanleoV8ToolFocus = null;
  }
});

test("global action bar no longer renders a second pencil tools launcher", async () => {
  const { AdvancedWorkspaceActionBar } = await loadTsx(
    "src/shell/AdvancedWorkspaceActionBar.tsx",
    {
      react: reactUrl,
      "../i18n/ui/useUI": uiStubUrl,
      "./AdvancedEditorIcon": iconStubUrl,
    },
  );
  let library = "";
  const mounted = await createMounted(AdvancedWorkspaceActionBar, {
    adapter: {
      id: "image",
      label: "Image",
      stage: null,
      drawers: [
        {
          id: "layers",
          label: "Layers",
          icon: "layers",
          content: null,
        },
      ],
      actions: [
        {
          id: "project-view:preview",
          label: "Preview",
          icon: "pages",
          variant: "primary",
          onTrigger() {},
        },
        {
          id: "export-secondary",
          label: "Secondary export",
          icon: "download",
          onTrigger() {},
        },
      ],
      directDownload: {
        id: "download",
        label: "Download",
        icon: "download",
        onTrigger() {},
      },
    },
    autoSaveState: "saved",
    activeLibraryPanelId: null,
    onBack() {},
    onOpenLibrary(id) {
      library = id;
    },
    onRetrySave() {},
    onTriggerAction(action) {
      return action.onTrigger?.();
    },
    onUploadFiles() {},
  });
  try {
    assert.equal(
      mounted.container.querySelector('button[aria-label="编辑工具"]'),
      null,
    );
    assert.ok(
      mounted.container.querySelector(
        'button[aria-label="Secondary export"]',
      ),
    );
    assert.equal(
      mounted.container
        .querySelector('[data-workspace-action-id="project-view:preview"]')
        ?.getAttribute("aria-pressed"),
      "true",
    );
    assert.ok(
      mounted.container.querySelector('button[aria-label="Download"]'),
    );
    const materials = [...mounted.container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("素材库"),
    );
    assert.ok(materials);
    await click(materials);
    assert.equal(library, "materials");
  } finally {
    await mounted.unmount();
  }
});
