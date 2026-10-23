/**
 * W5: real edit-bar command effects. Clicks, keyboard, and hosted-blur hold
 * must change a document through the existing Fabric image command core.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { dispatchFabricImageCommand } from "../src/shell/image-editor/fabric-image-commands.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://website.oceanleo.com/workspace/w5-edit-bar",
});
const { window } = dom;
window.scrollTo = () => {};
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
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
class ResizeObserverProbe {
  static instances = new Set();
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    ResizeObserverProbe.instances.add(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    ResizeObserverProbe.instances.delete(this);
  }
}
globalThis.ResizeObserver = window.ResizeObserver = ResizeObserverProbe;

const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const stubs = {
  "./AdvancedEditorIcon": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function AdvancedEditorIcon({name}) { return jsx("span", {"data-icon": name}); }`,
  ),
  "../i18n/ui/useUI": dataModule("export function useUI() { return (s) => s; }"),
  "./plugin-theme": dataModule(
    'export function pluginWorkbenchStyle() { return {}; } export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; } export function usePluginThemePortal() { return null; } export function PluginThemeScope({children}) { return children; }',
  ),
  "./advanced-workbench-chrome": dataModule(
    'export function advancedWorkbenchStyle(accent) { return { "--awb-accent": accent }; } export function actionGroup(action) { return action.group || "edit"; }',
  ),
  "./advanced-layout-context": dataModule(
    'export function useAdvancedLayout() { return null; } export function registerAdvancedToolsTrigger() { return () => {}; }',
  ),
  "./plugin-chrome/agent-drawer": dataModule(
    'export const PLUGIN_AGENT_DRAWER_ID = "agent-drawer";',
  ),
  "../collab/adapters/visual-readonly": dataModule(
    "export function viewOnlyContext(context) { return context; }",
  ),
  "./timeline-model": dataModule(
    "export const MIN_CLIP_MS = 100; export function availableTimelineDurationMs() { return 10000; }",
  ),
  "./SelectionAnimationGallery": dataModule(
    "export function SelectionAnimationGallery() { return null; }",
  ),
  "../ui/Button": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function Button({children, ...props}) { return jsx("button", props, children); } export function IconButton({icon, label, ...props}) { return jsx("button", { ...props, "aria-label": label, title: label }, icon); }`,
  ),
};
const load = async (path) => import(await compileModule(path, stubs));
const { SelectionToolbar } = await load("src/shell/SelectionToolbar.tsx");
const { FloatingContextToolbar, useFloatingContextToolbar } = await load(
  "src/shell/FloatingContextToolbar.tsx",
);
const { FabricImageContextToolbar } = await load(
  "src/shell/image-editor/FabricImageContextToolbar.tsx",
);
const { VideoTimelineContextToolbar } = await load(
  "src/shell/video-editor/VideoTimelineContextToolbar.tsx",
);
const { isOwnEditBarSession, ownEditBarSessionOpen } = await load(
  "src/shell/edit-bar-selection-session.tsx",
);
const { GlobalRowHistoryControls } = await load("src/shell/EditBarDockControls.tsx");
const { EditBarDocumentSegment } = await load(
  "src/shell/plugin-chrome/EditBarDocumentSegment.tsx",
);
const { createRoot } = await import("react-dom/client");

function makeImageEditor(initial = { value: "Hello", bold: false, fontSize: 24 }) {
  const text = { ...initial };
  const stack = [{ ...text }];
  return {
    selected: { locked: false, kind: "text", id: "text:hero" },
    layers: [{ id: "text:hero", kind: "text", locked: false }],
    selectLayer(id) {
      assert.equal(id, "text:hero");
    },
    text,
    stack,
    setSelectedText(patch) {
      Object.assign(text, patch);
      stack.push({ ...text });
    },
    undo() {
      if (stack.length < 2) return;
      stack.pop();
      Object.assign(text, stack[stack.length - 1]);
    },
  };
}

const context = {
  version: 1,
  kind: "text",
  id: "text:hero",
  revision: 4,
  epoch: 2,
  label: "标题",
  controls: [
    { id: "bold", kind: "toggle", label: "粗体", icon: "bold", value: false },
    { id: "font-size", kind: "number", label: "字号", value: 24, min: 8, max: 200, step: 1 },
  ],
};

class TestPointerEvent extends window.MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
window.PointerEvent = TestPointerEvent;
globalThis.PointerEvent = TestPointerEvent;

function firePointer(target, type, init = {}) {
  const event = new TestPointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? "mouse",
    button: init.button ?? 0,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

let floatingToolbarSequence = 0;

function makeImageCommandEditor() {
  const selected = {
    id: "image:hero",
    kind: "image",
    isBackground: false,
    opacity: 100,
    angle: 0,
    flipX: false,
    flipY: false,
    x: 12,
    y: 18,
    width: 240,
    height: 160,
    locked: false,
    imageFit: "contain",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 0,
    shadow: { enabled: false },
    radius: null,
    text: null,
    table: null,
  };
  const layers = [
    {
      id: "image:backdrop",
      kind: "image",
      locked: false,
      visible: true,
      isBackground: true,
      selected: false,
    },
    {
      id: selected.id,
      kind: "image",
      locked: false,
      visible: true,
      isBackground: false,
      selected: true,
    },
  ];
  const effects = [];
  return {
    selected,
    layers,
    effects,
    cropping: false,
    cropRatio: "free",
    loading: false,
    sourceReady: true,
    saving: false,
    transformInfo: null,
    filterInfo: null,
    selectLayer(id) {
      assert.equal(id, selected.id, "the command should keep its rendered selection");
      this.selected = selected;
    },
    rotateTarget(degrees) {
      effects.push({ action: "rotate", degrees });
      selected.angle += degrees;
    },
    toggleLayerLock(id) {
      effects.push({ action: "lock", id });
      const layer = layers.find((candidate) => candidate.id === id);
      assert.ok(layer, "lock should target the selected layer");
      layer.locked = !layer.locked;
      selected.locked = layer.locked;
    },
    moveLayer(id, direction) {
      effects.push({ action: "layer", id, direction });
      const index = layers.findIndex((candidate) => candidate.id === id);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index >= 0 && nextIndex >= 0 && nextIndex < layers.length) {
        [layers[index], layers[nextIndex]] = [layers[nextIndex], layers[index]];
      }
    },
    duplicateSelected() {
      effects.push({ action: "duplicate", id: selected.id });
      layers.push({ ...layers.find((candidate) => candidate.id === selected.id), id: "image:hero-copy" });
    },
    deleteSelected() {
      effects.push({ action: "delete", id: selected.id });
      this.layers = this.layers.filter((candidate) => candidate.id !== selected.id);
      this.selected = null;
    },
    removeLayer(id) {
      effects.push({ action: "delete", id });
      this.layers = this.layers.filter((candidate) => candidate.id !== id);
    },
  };
}

async function mountFloatingImageToolbar(editor) {
  return mountFloatingToolbar(
    React.createElement(FabricImageContextToolbar, { editor }),
  );
}

async function mountFloatingToolbar(contextToolbar) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const storageKey = `test:edit-bar-overflow:${++floatingToolbarSequence}`;
  function Host() {
    const workspaceRootRef = React.useRef(null);
    const stageRef = React.useRef(null);
    const controller = useFloatingContextToolbar({
      workspaceRootRef,
      stageRef,
      resetKey: storageKey,
      storageKey,
    });
    return React.createElement(
      "div",
      { ref: workspaceRootRef, "data-edit-bar-test-workspace": true },
      React.createElement("div", { ref: stageRef, "data-edit-bar-test-stage": true }),
      React.createElement(
        FloatingContextToolbar,
        { controller, accent: "#6d5dfc" },
        contextToolbar,
      ),
    );
  }
  await act(async () => root.render(React.createElement(Host)));
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function makeVideoCommandEditor() {
  const effects = [];
  return {
    selected: {
      clip: {
        id: "clip:video-1",
        start_ms: 0,
        duration_ms: 1_000,
        style: {},
      },
      track: { id: "track:video-1", kind: "image" },
    },
    effects,
    duplicateSelectedClip() {
      effects.push({ action: "duplicate", id: this.selected.clip.id });
    },
    deleteSelectedClip() {
      effects.push({ action: "delete", id: this.selected.clip.id });
    },
  };
}

async function mountToolbar(editor, live = context) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const api = { commands: [], container, setLive: null };
  function Host() {
    const [current, setCurrent] = React.useState(live);
    api.setLive = setCurrent;
    return React.createElement(SelectionToolbar, {
      context: current,
      onCommand: (command) => {
        api.commands.push(command);
        dispatchFabricImageCommand(editor, command);
      },
    });
  }
  await act(async () => root.render(React.createElement(Host)));
  api.unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return api;
}

test("W5-toolbar bold click preserves selection and toggles Fabric text", async () => {
  const editor = makeImageEditor();
  const stage = document.createElement("div");
  stage.contentEditable = "true";
  stage.textContent = "Hello";
  document.body.append(stage);
  stage.focus();
  const range = document.createRange();
  range.selectNodeContents(stage);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const api = await mountToolbar(editor);
  try {
    const bold = api.container.querySelector(
      '[data-selection-control-id="bold"] button',
    );
    assert.ok(bold, "bold control must render");
    let pointer;
    await act(async () => {
      pointer = firePointer(bold, "pointerdown");
    });
    assert.equal(pointer.defaultPrevented, true);
    assert.equal(window.getSelection()?.toString(), "Hello");
    await act(async () => bold.click());
    assert.equal(api.commands.at(-1)?.controlId, "bold");
    assert.equal(api.commands.at(-1)?.selectionId, "text:hero");
    assert.equal(editor.text.bold, true);
    assert.equal(editor.stack.length, 2);
  } finally {
    await api.unmount();
    stage.remove();
  }
});

test("W5-toolbar keeps the command after hosted selection blurs mid-press", async () => {
  const editor = makeImageEditor();
  const api = await mountToolbar(editor);
  try {
    const bold = api.container.querySelector(
      '[data-selection-control-id="bold"] button',
    );
    await act(async () => firePointer(bold, "pointerdown"));
    await act(async () => api.setLive(null));
    const held = api.container.querySelector(
      "[data-edit-bar-selection-session='held']",
    );
    assert.equal(held?.getAttribute("data-selection-id"), "text:hero");
    const stillBold = api.container.querySelector(
      '[data-selection-control-id="bold"] button',
    );
    assert.ok(stillBold, "held session must keep the compact control");
    await act(async () => stillBold.click());
    assert.equal(editor.text.bold, true);
    assert.equal(api.commands.at(-1)?.selectionRevision, 4);
  } finally {
    await api.unmount();
  }
});

test("W5-number stepper changes Fabric font size", async () => {
  const editor = makeImageEditor();
  const api = await mountToolbar(editor);
  try {
    // 2026-10-23 D9：字号是「数字输入 + 常用字号下拉」（原来是 −/+ 步进器）。
    const input = api.container.querySelector(
      '[data-selection-control-id="font-size"] input[type="number"]',
    );
    assert.ok(input, "font-size number input must render");
    const setNativeValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    await act(async () => {
      setNativeValue.call(input, "25");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(editor.text.fontSize, 25);
    const presets = api.container.querySelector(
      '[data-selection-control-id="font-size"] button[aria-haspopup="listbox"]',
    );
    assert.ok(presets, "font-size preset dropdown must render");
    await act(async () => presets.click());
    const size32 = [...document.body.querySelectorAll('[role="option"]')].find(
      (option) => option.textContent.trim().startsWith("32"),
    );
    assert.ok(size32);
    await act(async () => size32.click());
    assert.equal(editor.text.fontSize, 32);
  } finally {
    await api.unmount();
  }
});

test("W5-history Ctrl+Z from the bar undoes the Fabric document, not a no-op", async () => {
  const editor = makeImageEditor();
  dispatchFabricImageCommand(editor, {
    requestId: "seed",
    selectionId: "text:hero",
    controlId: "bold",
    value: true,
  });
  assert.equal(editor.text.bold, true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(GlobalRowHistoryControls, {
        canUndo: true,
        canRedo: false,
        onUndo: () => editor.undo(),
        onRedo: () => {},
      }),
    ),
  );
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  try {
    const undo = container.querySelector("[data-global-history-undo]");
    assert.ok(undo, "history 控件必须挂在第一行，不在编辑栏");
    assert.equal(container.querySelector("[data-edit-bar-history]"), null);
    const key = new window.KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(key);
    assert.equal(key.defaultPrevented, true);
    assert.equal(editor.text.bold, false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    canvas.remove();
  }
});

test("W5-r2-session helpers ignore a foreign overlay", () => {
  document.body.innerHTML = `
    <div data-edit-bar-session="mine" data-anchored-popover data-leo-overlay-state="closed"></div>
    <div data-edit-bar-session="other" data-anchored-popover data-leo-overlay-state="open"></div>
  `;
  assert.equal(ownEditBarSessionOpen("mine"), false);
  assert.equal(ownEditBarSessionOpen("other"), true);
  const foreign = document.querySelector('[data-edit-bar-session="other"]');
  assert.equal(isOwnEditBarSession(foreign, "mine"), false);
  assert.equal(isOwnEditBarSession(foreign, "other"), true);
  document.body.innerHTML = "";
});

test("W5-document segment trigger stays a real action", async () => {
  const fired = [];
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(EditBarDocumentSegment, {
        actions: [
          { id: "run-all", label: "运行全部", group: "edit" },
          { id: "save", label: "保存", group: "save" },
        ],
        onTrigger: (action) => fired.push(action.id),
      }),
    ),
  );
  try {
    const run = container.querySelector('[data-workspace-action-id="run-all"]');
    assert.ok(run);
    let pointer;
    await act(async () => {
      pointer = firePointer(run, "pointerdown");
    });
    assert.equal(pointer.defaultPrevented, true);
    await act(async () => run.click());
    assert.deepEqual(fired, ["run-all"]);
    assert.equal(container.querySelector('[data-workspace-action-id="save"]'), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("W5-image overflow actions work through the floating toolbar without arming its drag root", async () => {
  // 2026-10-23 D9：图片栏的旋转 / 锁定 / 复制 / 删除是规范主栏项，投影把它们放在栏上
  // （原来作者放进「更多」）；层级是一个规范下拉。按住不起拖、只发一次命令的判据不变，
  // 只是控件在栏上还是在「更多」里都要找得到。
  const cases = [
    {
      controlId: "rotate",
      pointerType: "mouse",
      verify(editor) {
        assert.deepEqual(editor.effects, [{ action: "rotate", degrees: 90 }]);
        assert.equal(editor.selected.angle, 90);
      },
    },
    {
      controlId: "lock",
      pointerType: "touch",
      verify(editor) {
        assert.deepEqual(editor.effects, [{ action: "lock", id: "image:hero" }]);
        assert.equal(editor.selected.locked, true);
      },
    },
    {
      controlId: "arrange",
      option: "forward",
      pointerType: "mouse",
      verify(editor) {
        assert.deepEqual(editor.effects, [
          { action: "layer", id: "image:hero", direction: "up" },
        ]);
        assert.equal(editor.layers[0].id, "image:hero");
      },
    },
    {
      controlId: "duplicate",
      pointerType: "touch",
      verify(editor) {
        assert.deepEqual(editor.effects, [
          { action: "duplicate", id: "image:hero" },
        ]);
        assert.equal(editor.layers.some((layer) => layer.id === "image:hero-copy"), true);
      },
    },
    {
      controlId: "delete",
      pointerType: "mouse",
      verify(editor) {
        assert.deepEqual(editor.effects, [{ action: "delete", id: "image:hero" }]);
        assert.equal(editor.layers.some((layer) => layer.id === "image:hero"), false);
      },
    },
  ];

  for (const { controlId, option, pointerType, verify } of cases) {
    const editor = makeImageCommandEditor();
    const mounted = await mountFloatingImageToolbar(editor);
    try {
      const selector = `[data-selection-control-id="${controlId}"] button`;
      let action = mounted.container.querySelector(selector);
      if (!action) {
        const more = mounted.container.querySelector(
          'button[aria-controls^="selection-more-"]',
        );
        assert.ok(more, `${controlId} is neither on the bar nor behind More`);
        await act(async () => more.click());
        action = document.body.querySelector(selector);
      }
      assert.ok(action, `${controlId} should be rendered on the bar or in More`);
      if (option) {
        await act(async () => action.click());
        action = document.body.querySelector(`[data-selection-option="${option}"]`);
        assert.ok(action, `${controlId} dropdown should offer ${option}`);
      }
      assert.equal(action.type, "button", "overflow actions stay keyboard-focusable buttons");

      let down;
      await act(async () => {
        down = firePointer(action, "pointerdown", { pointerType });
      });
      assert.equal(down.defaultPrevented, true, "the press should preserve the editor selection");
      assert.equal(
        mounted.container.querySelector("[data-edit-bar-move-mode]"),
        null,
        `${controlId} must not arm toolbar movement from a ${pointerType} press`,
      );
      assert.equal(mounted.container.querySelector("[data-edit-bar-dragging]"), null);

      await act(async () => {
        window.dispatchEvent(firePointer(window, "pointerup", { pointerType }));
      });
      await act(async () => action.click());
      assert.equal(editor.effects.length, 1, `${controlId} should dispatch exactly once`);
      verify(editor);
    } finally {
      await mounted.unmount();
    }
  }
});

test("W5-image overflow action remains keyboard reachable and dispatches from focus", async () => {
  const editor = makeImageCommandEditor();
  const mounted = await mountFloatingImageToolbar(editor);
  try {
    // 2026-10-23 D9：旋转是规范 `rotate`（顺时针 90°），主栏项；栏放不下时才在「更多」里。
    const selector = '[data-selection-control-id="rotate"] button';
    let action = mounted.container.querySelector(selector);
    if (!action) {
      const more = mounted.container.querySelector(
        'button[aria-controls^="selection-more-"]',
      );
      assert.ok(more);
      await act(async () => more.click());
      action = document.body.querySelector(selector);
    }
    assert.ok(action);
    action.focus();
    assert.equal(document.activeElement, action);
    assert.equal(action.disabled, false);

    // jsdom does not synthesize the browser's native Enter/Space activation;
    // focus plus the button's native click path exercises that activation target.
    const enter = new window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => action.dispatchEvent(enter));
    assert.equal(enter.defaultPrevented, false);
    await act(async () => action.click());

    assert.deepEqual(editor.effects, [{ action: "rotate", degrees: 90 }]);
    assert.equal(editor.selected.angle, 90);
    assert.equal(mounted.container.querySelector("[data-edit-bar-move-mode]"), null);
  } finally {
    await mounted.unmount();
  }
});

test("W5-image More trigger keeps the main-pill drag press and click replay", async () => {
  const editor = makeImageCommandEditor();
  const mounted = await mountFloatingImageToolbar(editor);
  try {
    const more = mounted.container.querySelector(
      'button[aria-controls^="selection-more-"]',
    );
    assert.ok(more);

    await act(async () => {
      firePointer(more, "pointerdown", {
        pointerType: "mouse",
        clientX: 36,
        clientY: 24,
      });
    });
    assert.ok(
      mounted.container.querySelector("[data-edit-bar-move-mode]"),
      "the main pill's established press/hold policy still arms from its More button",
    );
    assert.equal(mounted.container.querySelector("[data-edit-bar-dragging]"), null);

    await act(async () => {
      window.dispatchEvent(
        firePointer(window, "pointerup", {
          pointerType: "mouse",
          clientX: 36,
          clientY: 24,
        }),
      );
    });
    assert.equal(more.getAttribute("aria-expanded"), "true");
    assert.equal(mounted.container.querySelector("[data-edit-bar-move-mode]"), null);

    // Browsers follow pointerup with a native click. The controller replays the
    // quick press once and suppresses that follow-up instead of toggling twice.
    await act(async () => {
      more.dispatchEvent(
        new window.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: 36,
          clientY: 24,
        }),
      );
    });
    assert.equal(more.getAttribute("aria-expanded"), "true");
    assert.equal(document.body.querySelector("[data-anchored-popover][data-leo-overlay-state='open']") != null, true);
  } finally {
    await mounted.unmount();
  }
});

test("W5-video More actions keep their real commands across the floating ancestor", async () => {
  const editor = makeVideoCommandEditor();
  const mounted = await mountFloatingToolbar(
    React.createElement(VideoTimelineContextToolbar, { state: editor }),
  );
  try {
    const more = mounted.container.querySelector(
      'button[aria-controls^="selection-more-"]',
    );
    assert.ok(more, "the video editor should expose the shared overflow trigger");
    const expected = [
      { controlId: "duplicate", pointerType: "touch", action: "duplicate" },
      { controlId: "delete", pointerType: "mouse", action: "delete" },
    ];
    for (const [index, item] of expected.entries()) {
      if (more.getAttribute("aria-expanded") !== "true") {
        await act(async () => more.click());
      }
      const button = document.body.querySelector(
        `[data-selection-control-id="${item.controlId}"] button`,
      );
      assert.ok(button, `${item.controlId} should appear in the video More panel`);
      await act(async () => {
        firePointer(button, "pointerdown", { pointerType: item.pointerType });
      });
      assert.equal(
        mounted.container.querySelector("[data-edit-bar-move-mode]"),
        null,
        `${item.controlId} must not arm toolbar movement`,
      );
      await act(async () => {
        window.dispatchEvent(
          firePointer(window, "pointerup", { pointerType: item.pointerType }),
        );
      });
      await act(async () => button.click());
      assert.deepEqual(editor.effects[index], {
        action: item.action,
        id: "clip:video-1",
      });
      assert.equal(mounted.container.querySelector("[data-edit-bar-dragging]"), null);
    }
    assert.equal(editor.effects.length, expected.length);
  } finally {
    await mounted.unmount();
  }
});
