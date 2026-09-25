import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://website.oceanleo.com/workspace/corp-site",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  Event: window.Event, MouseEvent: window.MouseEvent,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

class ResizeObserverProbe {
  static instances = new Set();
  constructor(callback) { this.callback = callback; this.targets = new Set(); ResizeObserverProbe.instances.add(this); }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); ResizeObserverProbe.instances.delete(this); }
  static flush() {
    for (const observer of [...this.instances]) observer.callback(
      [...observer.targets].map((target) => ({ target, contentRect: target.getBoundingClientRect() })), observer,
    );
  }
}
globalThis.ResizeObserver = window.ResizeObserver = ResizeObserverProbe;
const viewport = new window.EventTarget();
Object.assign(viewport, { width: 1280, height: 720, offsetLeft: 0, offsetTop: 0 });
Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
let stageWidth = 570;
let controlWidth = 40;
const rect = (width, height = 28) => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} });
window.HTMLElement.prototype.getBoundingClientRect = function () {
  if (this.hasAttribute("data-workspace-floating-toolbar-overlay")) return rect(stageWidth, 600);
  if (this.hasAttribute("data-selection-measure-control-id")) return rect(controlWidth);
  if (this.hasAttribute("data-selection-toolbar-viewport-capacity")) return rect(viewport.width - 32);
  if (this.hasAttribute("data-edit-bar-document-measure") || this.hasAttribute("data-edit-bar-document-slot")) return rect(96);
  if (this.hasAttribute("data-edit-bar-document-more")) return rect(28);
  if (this.hasAttribute("data-edit-bar-trailing-slot")) return rect(32);
  return rect(0, 0);
};

// Only unrelated presentation/AI animation modules are replaced. The context,
// inspector, its panel, measurement hook, row and floating portal are real.
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const stubs = {
  "./AdvancedEditorIcon": dataModule(`import { jsx } from ${JSON.stringify(jsxUrl)}; export function AdvancedEditorIcon({name}) { return jsx("span", {"data-icon": name}); }`),
  "../i18n/ui/useUI": dataModule('export function useUI() { return (s) => s; }'),
  "./plugin-theme": dataModule('export function pluginWorkbenchStyle() { return {}; } export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; } export function usePluginThemePortal() { return null; } export function PluginThemeScope({children}) { return children; }'),
  "./SelectionAnimationGallery": dataModule('export function SelectionAnimationGallery() { return null; }'),
  "../ui/Button": dataModule(`import { jsx } from ${JSON.stringify(jsxUrl)}; export function Button({children, ...props}) { return jsx("button", props, children); }`),
  "./InlineEditorMaterialPanel": dataModule('export function InlineEditorMaterialPanel() { return null; }'),
  "./inline-advanced-shell-helpers": dataModule('export function resolveInlineAdvancedDrawers() { return []; } export function resolveActiveMaterialAction() { return undefined; }'),
  "./plugin-chrome/PluginAgentPanel": dataModule('export function PluginAgentPanel() { return null; }'),
  "./SplitWorkspace": dataModule('export function useConsoleAgentFocus() { return null; }'),
};
const load = async (path) => import(await compileModule(path, stubs));
const { SelectionToolbar } = await load("src/shell/SelectionToolbar.tsx");
const { FloatingContextToolbar } = await load("src/shell/FloatingContextToolbar.tsx");
const { useInlineAdvancedPanels } = await load("src/shell/use-inline-advanced-panels.tsx");
const { AdvancedLayoutContext } = await load("src/shell/advanced-layout-context.tsx");
const { usePluginChromeLayout } = await load("src/shell/plugin-chrome/use-plugin-chrome-layout.tsx");
const { usePluginChromePanels } = await load("src/shell/plugin-chrome/use-plugin-chrome-panels.ts");
const { createLiveReactNodeStore, publishLiveReactNode, LiveReactNode } = await load("src/shell/live-react-node.tsx");
const { hostedWebsiteEditBarSelection } = await load("src/shell/website-host-edit-bar.ts");
const { createRoot } = await import("react-dom/client");
// Generated from website/front/components/site-editor/editor-controls.ts
// selectionContext at website 22ac13b, with the heading/image/button/section
// shapes used by corp-site. Keep inputs local so UI CI needs no second repo.
const websiteSelections = JSON.parse(readFileSync(new URL("./g2-website-selections.json", import.meta.url), "utf8"));

const simpleSelection = {
  version: 1, kind: "website-h1", id: "field:hero:title", revision: 7, epoch: 1,
  anchor: { x: 88.5, y: 131.75, width: 300, height: 88.5 },
  controls: [
    { id: "color", kind: "action", label: "颜色" },
    { id: "font", kind: "action", label: "字体" },
    { id: "text", kind: "text", label: "文字", value: "为信用增信", slot: "inspector", inspectorGroup: "website-text", inspectorLabel: "文字" },
    { id: "duplicate", kind: "action", label: "复制", slot: "inspector", inspectorGroup: "website-text" },
  ],
};
const clone = (value) => structuredClone(value);

class ErrorBoundary extends React.Component {
  state = { error: "" };
  static getDerivedStateFromError(error) { return { error: error.message }; }
  componentDidCatch(error) { this.props.errors.push(error.message); }
  render() { return this.state.error ? React.createElement("output", { "data-crash": true }, this.state.error) : this.props.children; }
}

// Use the production inline panel hook. Its fallbackDetail.content is the real
// LiveReactNode published by useInlineAdvancedPanels, so inspector updates
// exercise the same external store contract as InlineAdvancedWorkbenchShell.
function useRealInlineStoreLayout() {
  const panels = useInlineAdvancedPanels({
    adapter: { id: "website", label: "Website" },
    item: { id: "g2-item" },
    siteId: "corp-site",
    accent: "#6d5dfc",
    ownerId: "g2-inline",
    pluginThemeId: null,
    workbenchMaterials: null,
  });
  const {
    activeDrawerId,
    fallbackDetail,
    transientPanel,
    openTransientPanel,
    updateTransientPanel,
    closeDetail,
    openDrawer,
  } = panels;
  const layout = React.useMemo(() => ({
    activeTransientPanelId: transientPanel?.id || "",
    activeDrawerId,
    hostPanelVisible: Boolean(fallbackDetail),
    editorToolActive: Boolean(fallbackDetail),
    openTransientPanel,
    updateTransientPanel,
    closeDrawer: closeDetail,
    openDrawer,
  }), [
    activeDrawerId,
    closeDetail,
    fallbackDetail,
    openDrawer,
    openTransientPanel,
    transientPanel?.id,
    updateTransientPanel,
  ]);
  const transientPanelNode = fallbackDetail && transientPanel ? {
    id: transientPanel.id,
    label: fallbackDetail.label,
    content: fallbackDetail.content,
  } : null;
  return { layout, transientPanel: transientPanelNode };
}

// Separate probe host for the store.version assertion. It is deliberately
// kept out of the inline scan above; the scan must use the production hook.
function useProbeInlineStoreLayout() {
  const [panel, setPanel] = React.useState(null);
  const current = React.useRef(null);
  const store = React.useRef(null);
  if (!store.current) store.current = createLiveReactNodeStore();
  const openTransientPanel = React.useCallback((id, label, content) => {
    current.current = id;
    setPanel({ id, label });
    publishLiveReactNode(store.current, content);
  }, []);
  const updateTransientPanel = React.useCallback((id, content) => {
    if (current.current === id) publishLiveReactNode(store.current, content);
  }, []);
  const closeDrawer = React.useCallback(() => { current.current = null; setPanel(null); }, []);
  const layout = React.useMemo(() => ({
    activeTransientPanelId: panel?.id || "", activeDrawerId: panel?.id || "",
    hostPanelVisible: Boolean(panel), editorToolActive: Boolean(panel),
    openTransientPanel, updateTransientPanel, closeDrawer, openDrawer: closeDrawer,
  }), [panel, openTransientPanel, updateTransientPanel, closeDrawer]);
  return { layout, transientPanel: panel ? { ...panel, content: React.createElement(LiveReactNode, { store: store.current }) } : null, store: store.current };
}

async function mount({ kind = "inline", selection = simpleSelection, freshOnRender = false, documentSegment = false } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const errors = [];
  const root = createRoot(container, { onCaughtError() {} });
  const api = { errors, commits: 0, commands: [], container };
  const stableCommand = (command) => api.commands.push(command);
  function Host() {
    const [input, setInput] = React.useState(selection);
    const [mode, setMode] = React.useState("floating");
    const [collapsed, setCollapsed] = React.useState(false);
    const [callbackVersion, setCallbackVersion] = React.useState(0);
    const panels = usePluginChromePanels([]);
    const pluginBridge = usePluginChromeLayout(panels);
    const inlineBridge = useRealInlineStoreLayout();
    const probeBridge = useProbeInlineStoreLayout();
    const bridge = kind === "plugin"
      ? pluginBridge
      : kind === "probe"
        ? probeBridge
        : inlineBridge;
    api.selection = setInput;
    api.mode = setMode;
    api.collapsed = setCollapsed;
    api.callbackVersion = setCallbackVersion;
    api.bridge = bridge;
    const toolbarRef = React.useRef(null);
    const morphLiveRef = React.useRef(null);
    const controller = {
      portalRoot: container, toolbarRef, morphLiveRef, mode, collapsed,
      offset: { x: 0, y: 0 }, rootProps: {}, collapsedProps: { onClick: () => setCollapsed(false) },
      canDock: true, toggleDock: () => setMode((m) => m === "floating" ? "docked" : "floating"),
    };
    return React.createElement(AdvancedLayoutContext.Provider, { value: bridge.layout },
      React.createElement("aside", { "data-inspector": true }, bridge.transientPanel?.content),
      React.createElement(FloatingContextToolbar, {
        controller, accent: "#6d5dfc", assistant: null,
        documentSegment: documentSegment ? React.createElement("button", null, "手机 平板 桌面") : null,
      }, React.createElement(SelectionToolbar, {
        context: hostedWebsiteEditBarSelection(freshOnRender ? clone(input) : input),
        onCommand: freshOnRender ? (command) => api.commands.push({ ...command, callbackVersion }) : stableCommand,
      })),
    );
  }
  await act(async () => root.render(React.createElement(ErrorBoundary, { errors },
    React.createElement(React.Profiler, { id: "G2", onRender: () => { api.commits += 1; } }, React.createElement(Host)),
  )));
  api.toolbar = () => container.querySelector("[data-selection-id]");
  api.projection = () => api.toolbar()?.getAttribute("data-selection-visible-controls") || "";
  api.openInspector = async () => {
    const trigger = container.querySelector('[data-selection-control-id] button[aria-controls^="selection-inspector"]');
    assert.ok(trigger, "真实工具条必须有属性入口");
    await act(async () => trigger.click());
  };
  api.resize = async (width) => { stageWidth = width; await act(async () => ResizeObserverProbe.flush()); };
  api.unmount = async () => { await act(async () => root.unmount()); container.remove(); };
  return api;
}

for (const freshOnRender of [false, true]) {
  test(`plugin inspector settles after opening (fresh context/callback=${freshOnRender})`, async () => {
    stageWidth = 570;
    const api = await mount({ kind: "plugin", freshOnRender });
    try {
      const before = api.commits;
      await api.openInspector();
      assert.deepEqual(api.errors, [], "属性面板打开不能触发 Maximum update depth");
      assert.ok(api.commits - before < 8, `打开属性仅应有限提交，实际 ${api.commits - before}`);
      assert.ok(api.container.querySelector("[data-inspector] textarea"));
      await act(async () => api.callbackVersion(2));
      const duplicate = [...api.container.querySelectorAll("[data-inspector] button")].find((button) => button.textContent.includes("复制"));
      assert.ok(duplicate);
      await act(async () => duplicate.click());
      assert.equal(api.commands.at(-1)?.selectionId, simpleSelection.id);
      if (freshOnRender) assert.equal(api.commands.at(-1)?.callbackVersion, 2, "不能为了稳定 effect 冻住旧命令回调");
    } finally { await api.unmount(); }
  });
}

test("identical iframe selections do not republish an open inspector; anchor/value updates survive", async () => {
  stageWidth = 570;
  const api = await mount({ kind: "probe" });
  try {
    await api.openInspector();
    const version = api.bridge.store.version;
    for (let index = 0; index < 12; index += 1) {
      const next = clone(simpleSelection);
      next.anchor.x += index;
      await act(async () => api.selection(next));
    }
    assert.equal(api.bridge.store.version, version, "相同选区内容不应重复通知面板 store");
    assert.equal(api.toolbar().getAttribute("data-selection-anchor-x"), "99.5", "几何必须继续更新");
    const next = clone(simpleSelection);
    next.controls[2].value = "为融资护航";
    await act(async () => api.selection(next));
    assert.equal(api.bridge.store.version, version + 1);
    const input = api.container.querySelector("[data-inspector] textarea");
    assert.equal(input?.value, "为融资护航");
    assert.deepEqual(api.errors, []);
  } finally { await api.unmount(); }
});

test("real row keeps projection stable around fractional collapse thresholds", async () => {
  stageWidth = 570;
  const api = await mount();
  try {
    // Three 40px compact controls total 128px. Measure the actual row reserve
    // (padding, pin and gaps), then drive the external boundary around that fit.
    const capacity = Number.parseFloat(api.toolbar().style.maxInlineSize);
    const reserve = stageWidth - capacity;
    const widths = [88.5, 131.75, 88.5, 131.75, 127, 128, 127.5, 128.25];
    const projections = [];
    for (const available of widths) {
      await api.resize(reserve + available);
      projections.push(api.projection());
    }
    assert.equal(new Set(projections).size, 1, `分区不应每拍来回翻：${JSON.stringify(projections)}`);
    await api.resize(reserve + 170);
    assert.equal(api.projection().split(" ").length, 3, "真正变宽仍应展开");
    await api.resize(reserve + 0.25);
    assert.equal(api.projection(), "", "窄到放不下时必须折入 More");
    await api.resize(reserve + 131.75);
    const next = clone(simpleSelection);
    next.id = "field:hero:subtitle";
    next.epoch += 1;
    await act(async () => api.selection(next));
    assert.equal(api.projection().split(" ").length, 3, "新选区不能继承旧选区折叠历史");
    assert.deepEqual(api.errors, []);
  } finally { await api.unmount(); }
});

test("document segment keeps a collapsed state until the expansion hysteresis clears", async () => {
  stageWidth = 300;
  const api = await mount({ documentSegment: true });
  try {
    const slot = () => api.container.querySelector("[data-edit-bar-document-slot]");
    const more = () => api.container.querySelector("[data-edit-bar-document-more]");
    assert.ok(slot(), "document segment starts visible with ample width");

    // With the real row reserve and 96px document clone, 178.75px is below
    // the fold line.  179.75px is only 0.5px above it: the old single
    // threshold immediately re-expanded here, while the fixed state should
    // stay folded until the additional 24px expansion is available.
    await api.resize(178.75);
    assert.ok(more(), "document segment folds when the external boundary narrows");
    await api.resize(179.75);
    assert.ok(more(), "a sub-pixel rebound must not re-expand the document segment");
    await api.resize(204.25);
    assert.ok(slot(), "a clearly wider boundary expands the document segment");
    assert.deepEqual(api.errors, []);
  } finally { await api.unmount(); }
});

for (const kind of ["inline", "plugin"]) test(`${kind} chain scans website selections, DPR geometry, fresh messages and dock modes`, async (t) => {
  const widths = [0, 88.5, 131.75, 320, 569.5, 570, 570.5, 720, 960];
  let samples = 0;
  for (const dpr of [1, 1.25, 1.5, 2]) {
    viewport.width = dpr === 2 ? 1438 : dpr === 1.5 ? 1918 : 1280;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: dpr });
    controlWidth = Math.round(40 * dpr) / dpr;
    for (const tag of ["h1", "img", "button", "section"]) {
      stageWidth = 570;
      const selection = clone(websiteSelections[tag]);
      assert.ok(selection?.controls.length > 10, "必须使用真实网站选区投影");
      const api = await mount({ kind, selection, documentSegment: true });
      try {
        await api.openInspector();
        for (const mode of ["docked", "floating"]) {
          await act(async () => api.mode(mode));
          for (const width of widths) {
            await api.resize(Math.round(width * dpr) / dpr);
            // New object per message, at both a batch boundary and each frame.
            await act(async () => { for (let i = 0; i < 8; i += 1) api.selection(clone(selection)); });
            for (let i = 0; i < 3; i += 1) await act(async () => api.selection(clone(selection)));
            assert.deepEqual(api.errors, [], `tag=${tag} DPR=${dpr} mode=${mode} width=${width}`);
            samples += 1;
          }
        }
        await act(async () => api.collapsed(true));
        await act(async () => api.collapsed(false));
        await act(async () => api.selection(null));
        assert.equal(api.toolbar()?.getAttribute("data-selection-id"), "host:website");
        await act(async () => api.selection(clone(selection)));
        assert.equal(api.toolbar()?.getAttribute("data-selection-id"), selection.id);
        assert.deepEqual(api.errors, []);
      } finally { await api.unmount(); }
    }
  }
  t.diagnostic(`scan=${samples} combinations; DPR=1/1.25/1.5/2; widths=${widths.join(",")}; modes=docked/floating; messages=8 batched+3 separate`);
});
