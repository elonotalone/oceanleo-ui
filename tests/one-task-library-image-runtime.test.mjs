/**
 * Image-route runtime checkpoint for the Library one-task workspace.
 *
 * The route, shared SplitWorkspace, AdvancedWorkbenchShell, Inline shell,
 * editor header, action bar, and edit-bar Agent launcher are production
 * modules. Only the Fabric controller/stage and network/collaboration leaves
 * are controlled. `fabric/node` cannot load here because its native
 * `canvas.node` addon is absent; this keeps React's image-route lifecycle real
 * without pretending that JSDOM drew a Fabric canvas.
 */
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const [name, value] of Object.entries({
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  getSelection: window.getSelection.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  innerHeight: window.innerHeight,
  innerWidth: window.innerWidth,
  DOMRect: window.DOMRect,
  Range: window.Range,
  Event: window.Event,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  InputEvent: window.InputEvent,
  ResizeObserver: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})) {
  if (value !== undefined) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
}
window.HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};

const jsx = `import { jsx as _jsx, jsxs as _jsxs } from ${JSON.stringify(jsxUrl)};`;
const nullComponent = (name) => dataModule(`${jsx}\nexport function ${name}(){ return null; }`);
const uiStub = dataModule(`const translate=(value)=>value; export function useUI(){ return translate; }`);
const iconStub = dataModule(`${jsx}
  export function AdvancedEditorIcon({name="icon", ...props}) {
    return _jsx("span", { ...props, "data-icon": name });
  }
  export function IconLibrary(){ return null; }
`);
const dockHostStub = dataModule(`${jsx}
  export function EditBarDockHost(){ return null; }
`);
const buttonStub = dataModule(`${jsx}
  import { forwardRef } from ${JSON.stringify(reactUrl)};
  export const Button = forwardRef(function Button({variant, block, align, children, ...props}, ref) {
    return _jsx("button", { ...props, ref, children });
  });
  export const IconButton = forwardRef(function IconButton({label, icon, children, variant, selected, ...props}, ref) {
    return _jsx("button", { ...props, ref, "aria-label": label, "data-selected": selected || undefined, children: icon || children });
  });
`);

const controlledEditorStub = dataModule(`
  import { useMemo, useState } from ${JSON.stringify(reactUrl)};
  const collab = {
    ensureIds() {},
    snapshot() { return { objects: [] }; },
    applyRemote() {},
    markClean() {},
    adoptRevision: async () => null,
    readOnly: false,
  };
  const noop = () => {};
  export function useFabricImageEditor(item) {
    globalThis.__oneTaskImageHookRenders = (globalThis.__oneTaskImageHookRenders || 0) + 1;
    const [selected, setSelected] = useState(null);
    globalThis.__oneTaskImageSelect = setSelected;
    const layers = useMemo(() => selected ? [{ id: selected.id, selected: true }] : [], [selected]);
    return useMemo(() => ({
      addImageFromFile: async () => {},
      addImageFromUrl: async () => {},
      canRedo: false,
      canUndo: false,
      captureRecovery: () => null,
      captureRecoveryRevision: () => 0,
      collab,
      dirty: false,
      downloadAs: async () => {},
      downloadDefaultPng: noop,
      editRevision: 0,
      error: "",
      exportQuality: 90,
      filterInfo: null,
      layers,
      loading: false,
      notice: "",
      openIdentity: "image:one-task-library-fixture:r1",
      redo: noop,
      reload: noop,
      replaceSelectedImageFromUrl: async () => {},
      restoreRecovery: noop,
      save: async () => null,
      savedUrl: "",
      sceneDiagnostic: null,
      selected,
      setZoom: noop,
      sourceReady: true,
      undo: noop,
      zoom: 1,
      zoomFit: noop,
      cropping: false,
      cropRatio: null,
      saving: false,
      transformInfo: null,
      beginGesture: noop,
      cancelGesture: noop,
      endGesture: noop,
    }), [item.id, layers, selected]);
  }
`);

const imageStageStub = dataModule(`${jsx}
  export function FabricImageStage({editor}) {
    globalThis.__oneTaskImageStageRenders = (globalThis.__oneTaskImageStageRenders || 0) + 1;
    return _jsxs("div", {
      "data-controlled-fabric-leaf": true,
      "data-image-selection": editor.selected?.id || "none",
      children: [
        _jsx("canvas", { "data-controlled-fabric-canvas": true }),
        _jsx("button", {
          type: "button",
          "data-fixture-selection-toggle": true,
          onClick: () => globalThis.__oneTaskImageSelect?.(
            editor.selected ? null : { id: "image-layer-1", kind: "image" }
          ),
          children: "toggle controlled image selection",
        }),
      ],
    });
  }
`);

const imageContextToolbarStub = dataModule(`${jsx}
  export function FabricImageContextToolbar({editor}) {
    return _jsx("div", {
      "data-image-route-selection-toolbar": true,
      children: editor.selected?.id || "no selection",
    });
  }
`);
const visualControlsStub = dataModule(`${jsx}
  export function FabricImageControls(){ return null; }
  export function FabricImageFilterPanel(){ return null; }
  export function FabricImageFontPanel(){ return null; }
  export function FabricImageBrushPanel(){ return null; }
  export function FabricImageExportPanel(){ return null; }
  export function FabricImageLinePanel(){ return null; }
  export function FabricImageNotePanel(){ return null; }
  export function FabricImageShapePanel(){ return null; }
  export function FabricImageSignaturePanel(){ return null; }
  export function FabricImageTablePanel(){ return null; }
  export function FabricImageTextPanel(){ return null; }
`);

const stubs = {
  // ImageRoute: keep route logic/hooks; control only the Fabric/editor and
  // remote persistence/collaboration boundary.
  "../image-editor/image-save-receipt": dataModule(`export function imageSaveReceiptItem(base, saved, meta){ return { ...base, ...(saved || {}), meta }; }`),
  "../advanced-features": dataModule(`export function advancedEditorSourceFor(item){ return { url: item.url || "", structured: false }; }`),
  "../plugin-command": dataModule(`export function usePluginCommandSurface(){} export function createImageCommandSurface(){ return {}; }`),
  "../image-editor/image-command-surface": dataModule(`export function createImageCommandSurface(){ return {}; }`),
  "../image-editor/psd-composite": dataModule(`export function isPsdSource(){ return false; }`),
  "../media-editors/visual-import-normalize": dataModule(`export async function normalizeVisualUploads(){ return { files: [], notes: [] }; }`),
  "../media-editors/visual-formats": dataModule(`export const DEFAULT_LOSSY_QUALITY=90; export function imageCanvasFormat(value){ return value; } export function visualDownloadFormats(){ return [{label:"PNG", format:"png"}]; } export function visualUploadAccept(){ return "image/*"; }`),
  "../image-editor/FabricImageContextToolbar": imageContextToolbarStub,
  "../image-editor/FabricImageControls": visualControlsStub,
  "../image-editor/FabricImageCreationPanels": visualControlsStub,
  "../image-editor/FabricImageStage": imageStageStub,
  "../image-editor/use-fabric-image-editor": controlledEditorStub,
  "../collab/adapters/image": dataModule(`export const IMAGE_COLLAB_ROOT="image"; export function imageFromEntities(value){ return value; } export function imageToEntities(value){ return value; }`),
  "../collab/adapters/use-entity-collab": dataModule(`export function useEntityCollab(){ return { readOnly:false, saveGate:true, room:null, markSaved(){}, collab:{} }; }`),
  "../collab/adapters/visual-selection": dataModule(`export function useCollabSelections(){ return []; }`),
  "../collab/adapters/visual-readonly": dataModule(`export const VIEW_ONLY_REFUSAL="read only"; export function guardPluginSurface(value){ return value; } export function viewOnlyUploadHandler(_readOnly, handler){ return handler; }`),
  "../collab/adapters/VisualViewOnlyPanel": dataModule(`${jsx} export function VisualViewOnlyPanel({children}){ return _jsx("div", {children}); }`),
  "../workbench-routes": dataModule(`export function editorToolLabel(){ return "Image"; }`),
  "../workbench-material-provider": dataModule(`export function useWorkbenchMaterialAdapter(){} export function useWorkbenchMaterials(){ return null; }`),
  "../image-editor/design-mode/image-plugin-mode": dataModule(`export function applyImageL0Mode(mode){ return {mode}; } export function bindImageModeAdapter(mode, setMode){ return {mode, setMode}; } export function rememberedImagePluginMode(){ return "normal"; }`),
  "./editor-handoff": dataModule(`export function bindNormalFaceHandoff(){ return ()=>{}; } export function bindProFaceHandoff(){ return ()=>{}; } export function handoffItemKey(value){ return value; } export function handoffRevisionOf(){ return "r1"; }`),
  "../doc-editors/EditorSourceFailurePanel": nullComponent("EditorSourceFailurePanel"),
  "../advanced-recovery-store": dataModule(`export function advancedRecoveryKey(){ return "image-fixture"; } export async function writeAdvancedRecovery(){ return null; } export async function readAdvancedRecovery(){ return null; } export async function deleteAdvancedRecovery(){}`),

  // Real SplitWorkspace and real InlineAdvancedWorkbenchShell remain in the
  // graph. These substitutions isolate unrelated upload/visual polish and
  // make the native edit-bar AI action deterministic in JSDOM.
  "../i18n/ui/useUI": uiStub,
  "./icons": dataModule(`${jsx} export function IconLibrary(){ return null; }`),
  "./AdvancedEditorIcon": iconStub,
  "./EditBarDockHost": dockHostStub,
  "./AdvancedStageControls": nullComponent("AdvancedStageControls"),
  "./AdvancedWorkbenchStage": dataModule(`${jsx} export function AdvancedWorkbenchStage({editorStage}){ return _jsx("div", {"data-real-workbench-stage":true, children:editorStage}); }`),
  "./InlineEditorMinePanel": nullComponent("InlineEditorMinePanel"),
  "./InlineEditorMaterialPanel": nullComponent("InlineEditorMaterialPanel"),
  "./plugin-chrome/PluginAgentPanel": nullComponent("PluginAgentPanel"),
  "./inline-advanced-workbench-drop": dataModule(`export function useInlineAdvancedWorkbenchDrop(){ return {dropMessage:"", performUpload:async()=>{}, handleDrop(){}}; }`),
  "./inline-advanced-shell-parts": dataModule(`${jsx}
    export function HiddenUploadInput(){ return null; }
    export function StageNoticeCorner(){ return null; }
    export function useEditBarDockPresentation(){ return {}; }
    export function usePluginPagesForAdapter(){ return [{id:"normal", kind:"main", label:"编辑"}]; }
  `),
  "./advanced-session-context": dataModule(`export function useAdvancedSession(){ return null; }`),
  "./advanced-session": dataModule(`export function advancedRootItemId(item){ return item?.id || ""; }`),
  "./advanced-recovery-store": dataModule(`export function advancedRecoveryKey(){ return "image-fixture"; } export async function writeAdvancedRecovery(){ return null; } export async function readAdvancedRecovery(){ return null; } export async function deleteAdvancedRecovery(){}`),
  "./plugin-theme": dataModule(`
    import { createContext } from ${JSON.stringify(reactUrl)};
    export const PluginThemePortalContext=createContext(null);
    export function PluginThemeScope({children}){ return children; }
    export function pluginThemeIdForAdapter(){ return null; }
    export function pluginWorkbenchStyle(){ return {}; }
    export function usePluginTheme(){ return {accent:null, theme:null}; }
    export function PluginThemeToggle(){ return null; }
  `),
  "./workbench-material-provider": dataModule(`export const WORKBENCH_MATERIAL_MIME="application/x-workbench-material"; export function useWorkbenchMaterials(){ return null; } export function useWorkbenchMaterialAdapter(){} `),
  "./workbench-routes": dataModule(`export function editBarOwnershipForItem(){ return "material"; }`),
  "./use-advanced-autosave": dataModule(`export function useAdvancedAutoSave(){ return {state:"saved", errorMessage:"", handOffToBackground(){}, flushLatest:async()=>{}, retry:async()=>{}}; }`),
  "./use-advanced-recovery": dataModule(`export function useAdvancedRecovery(){}`),
  "./plugin-chrome/EditBarDocumentSegment": nullComponent("EditBarDocumentSegment"),
  "./plugin-chrome/plugin-pages": dataModule(`export function editBarVisibleOnPage(){ return true; } export function buildPluginPages(){ return [{id:"normal", kind:"main", label:"编辑"}]; }`),
  "./plugin-chrome/plugin-page-store": dataModule(`import { useState } from ${JSON.stringify(reactUrl)}; export function usePluginPage(){ const [pageId,setPage]=useState("normal"); return {pageId,setPage}; }`),
  "./advanced-background-saver": dataModule(`export function hasPendingOrFailed(){ return false; } export function leaveAdvancedWorkbench({onClose}){ onClose?.(); } export function shouldWarnBeforeUnload(){ return false; } export function subscribe(){ return ()=>{}; }`),
  "./advanced-workbench-chrome": dataModule(`export function advancedWorkbenchStyle(){ return {}; } export function actionGroup(action){ return action.group || "edit"; }`),
  "./EditBarDockControls": dataModule(`${jsx} export function EditBarDockHost(){ return null; } export function GlobalRowHistoryControls(){ return null; } export function EditBarCollapsedPill(){ return null; } export function EditBarPinButton(){ return null; }`),
  "./anchored-popover": dataModule(`${jsx} export function AnchoredPopover({open,children}){ return open ? _jsx("div", {children}) : null; } export function runAfterOverlayExit(_node, callback){ return ()=>callback?.(); }`),
  "./edit-bar-dock-controller": dataModule(`
    import { useMemo, useRef } from ${JSON.stringify(reactUrl)};
    export function useEditBarDockController(){
      const toolbarRef=useRef(null);
      return useMemo(()=>({
        portalRoot: typeof document === "undefined" ? null : document.body,
        mode:"floating", collapsed:false, canDock:false, toggleDock(){},
        offset:{x:0,y:0}, lifted:false, moveMode:false, dragging:false,
        morphGhost:null, morphGhostKind:"pill", morphGhostRef:{current:null},
        morphLiveRef:{current:null}, toolbarRef,
        rootProps:{onPointerDown(){},onClickCapture(){},onKeyDown(){},"aria-keyshortcuts":""},
        collapsedProps:{onClick(){},onKeyDown(){},role:"button"},
      }),[]);
    }
  `),
  "./edit-bar-dock-state": dataModule(`export function editBarDockStorageKey(){ return "fixture"; }`),
  "./edit-bar-surface": dataModule(`export const EDIT_BAR_BUTTON_CLASS=""; export const EDIT_BAR_DIVIDER_CLASS=""; export function editBarCollapsedStyle(){return {};} export function editBarPillStyle(){return {};} `),
  "../ui/Button": buttonStub,
  "./collab/CollabActionSlot": nullComponent("CollabActionSlot"),
  "./editor-item-social-chrome": nullComponent("EditorItemSocialChrome"),
  "./workspace-download-icon-button": dataModule(`export function downloadIconButtonProps(){ return {}; }`),
  "./plugin-chrome/plugin-mode": nullComponent("PluginModeAdapterBridge"),
  "./plugin-chrome/PluginPageRow": nullComponent("PluginPageRow"),
  "./selection-toolbar-measure": dataModule(`export function editBarRowCapacity(){ return 0; } export function elementOuterInlineSize(){ return 0; }`),
  "./plugin-chrome/agent-drawer": dataModule(`export const PLUGIN_AGENT_DRAWER_ID="agent";`),
  "./edit-bar-row-context": dataModule(`import { createContext, useContext } from ${JSON.stringify(reactUrl)}; export const EditBarRowContext=createContext(false); export function useInsideEditBarRow(){ return useContext(EditBarRowContext); }`),
  "./workbench-open-store": dataModule(`export function useWorkbenchOpenClaim(){}`),
};

const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", stubs);
const imageRouteUrl = await compileModule("src/shell/advanced-routes/ImageRoute.tsx", stubs);
const [{ SplitWorkspace }, { ImageRoute }, { createRoot }] = await Promise.all([
  import(splitUrl),
  import(imageRouteUrl),
  import("react-dom/client"),
]);

const imageItem = {
  id: "one-task-library-image",
  key: "artifact:one-task-library-image:r1",
  source: "artifact",
  artifactId: "one-task-library-image",
  revisionId: "r1",
  artifactType: "single_file_image",
  title: "Library image fixture",
  kind: "image",
  siteId: "image",
  favorite: false,
  previewUrl: "https://images.invalid/fixture.png",
  url: "https://images.invalid/fixture.png",
  meta: { mime: "image/png" },
};

const materialPanel = React.createElement(
  "div",
  { "data-library-panel-content": "materials" },
  "Assets panel",
);
const minePanel = React.createElement(
  "div",
  { "data-library-panel-content": "mine" },
  "My Library panel",
);

let workspaceHooks;

function AgentPane() {
  const { useWorkspacePane, useRegisterConsoleAgentFocus } = workspaceHooks;
  const actualPane = useWorkspacePane();
  const registerLibraryPanel = actualPane?.registerLibraryPanel;
  const unregisterLibraryPanel = actualPane?.unregisterLibraryPanel;
  const [focusCount, setFocusCount] = React.useState(0);
  useRegisterConsoleAgentFocus(true, () => setFocusCount((count) => count + 1));
  React.useEffect(() => {
    if (!registerLibraryPanel || !unregisterLibraryPanel) return;
    registerLibraryPanel("materials", {
      ownerId: "image-runtime-fixture",
      id: "materials",
      label: "Assets",
      content: materialPanel,
    });
    registerLibraryPanel("mine", {
      ownerId: "image-runtime-fixture",
      id: "mine",
      label: "My Library",
      content: minePanel,
    });
    return () => {
      unregisterLibraryPanel("materials", "image-runtime-fixture");
      unregisterLibraryPanel("mine", "image-runtime-fixture");
    };
  }, [registerLibraryPanel, unregisterLibraryPanel]);
  return React.createElement(
    "div",
    { "data-agent-runtime-pane": true, "data-agent-focus-count": focusCount },
    focusCount ? "Agent focused" : "Agent conversation",
  );
}

test("Library ImageRoute survives first frame, selection, Assets toggles, and Agent focus", async () => {
  const errors = [];
  const loops = [];
  const previousConsoleError = console.error;
  const container = document.createElement("div");
  document.body.append(container);
  globalThis.__oneTaskImageHookRenders = 0;
  globalThis.__oneTaskImageStageRenders = 0;
  workspaceHooks = await import(splitUrl);
  let root = null;
  console.error = (...args) => {
    const message = args.map((arg) => String(arg)).join(" ");
    errors.push(message);
    if (/Too many re-renders|Maximum update depth exceeded/i.test(message)) {
      loops.push(message);
    }
    previousConsoleError(...args);
  };

  function Host() {
    return React.createElement(SplitWorkspace, {
      left: React.createElement(AgentPane),
      right: React.createElement(ImageRoute, {
        item: imageItem,
        taskId: null,
        siteId: "image",
        onClose() {},
      }),
      library: { open: true, paneTitle: "图片" },
      leftLabel: "Agent",
      rightLabel: "图片",
      fillParent: true,
      storageKey: "one-task-library-image-runtime",
    });
  }

  async function click(selector) {
    const target = container.querySelector(selector) || document.body.querySelector(selector);
    assert.ok(target, `expected click target ${selector}`);
    await act(async () => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  try {
    root = createRoot(container);
    await act(async () => root.render(React.createElement(Host)));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    }

    assert.ok(container.querySelector('[data-inline-editor][data-editor-adapter="image"]'));
    assert.ok(container.querySelector("[data-advanced-workbench-header]"));
    assert.ok(container.querySelector("[data-controlled-fabric-canvas]"));
    assert.ok(container.querySelector('[data-workspace-library-panel="materials"]'));
    const firstFrameStage = container.querySelector("[data-controlled-fabric-leaf]");
    assert.equal(firstFrameStage.getAttribute("data-image-selection"), "none");
    assert.ok(globalThis.__oneTaskImageHookRenders < 40, `first frame used ${globalThis.__oneTaskImageHookRenders} route renders`);
    assert.deepEqual(loops, []);

    await click('[data-workspace-library-panel="materials"]');
    assert.equal(container.querySelector('[data-workspace-pane="left"]')?.getAttribute("data-left-panel"), "library");
    assert.ok(container.querySelector('[data-library-panel-content="materials"]'));
    await click('[aria-label="返回操作台"]');
    assert.ok(container.querySelector("[data-agent-runtime-pane]"));

    const beforeSelection = globalThis.__oneTaskImageHookRenders;
    await click("[data-fixture-selection-toggle]");
    assert.equal(
      container.querySelector("[data-controlled-fabric-leaf]")?.getAttribute("data-image-selection"),
      "image-layer-1",
    );
    assert.equal(
      document.body.querySelector("[data-image-route-selection-toolbar]")?.textContent,
      "image-layer-1",
    );
    assert.ok(
      globalThis.__oneTaskImageHookRenders - beforeSelection < 20,
      `selection change caused ${globalThis.__oneTaskImageHookRenders - beforeSelection} ImageRoute renders`,
    );

    await click("[data-edit-bar-agent]");
    assert.equal(
      container.querySelector("[data-agent-runtime-pane]")?.getAttribute("data-agent-focus-count"),
      "1",
      "the real edit-bar Agent action should focus the existing left conversation",
    );
    assert.equal(
      container.querySelector('[data-workspace-pane="left"]')?.getAttribute("data-left-panel"),
      "app",
      "Agent focus returns the left pane from Assets to its existing conversation",
    );

    // Exercise repeat state transitions to make an effect/render cycle visible,
    // not merely assert that production source contains the expected controls.
    for (let i = 0; i < 3; i += 1) {
      await click('[data-workspace-library-panel="materials"]');
      assert.ok(container.querySelector('[data-library-panel-content="materials"]'));
      await click('[aria-label="返回操作台"]');
      await click("[data-fixture-selection-toggle]");
    }

    assert.ok(globalThis.__oneTaskImageHookRenders < 100, `interaction cycle used ${globalThis.__oneTaskImageHookRenders} ImageRoute renders`);
    assert.ok(globalThis.__oneTaskImageStageRenders < 100, `interaction cycle used ${globalThis.__oneTaskImageStageRenders} stage renders`);
    assert.deepEqual(loops, [], `React reported render-loop errors: ${loops.join("\n")}`);
    assert.equal(errors.some((message) => /Maximum update depth exceeded|Too many re-renders/i.test(message)), false);
  } finally {
    if (root) await act(async () => root.unmount());
    console.error = previousConsoleError;
    container.remove();
    delete globalThis.__oneTaskImageSelect;
    workspaceHooks = undefined;
  }
});
