// ============================================================================
// W2 —— 「预览&编辑」深链 vs 会话恢复的**优先级**（合同 D2 / 问题 2）
// ----------------------------------------------------------------------------
// 问题 2 的第二个成因：深链在挂载那一刻**同步**派发、右栏当帧就切到了正确的栏位，
// 可是会话快照是**异步**回来的（`FunctionAgentChat` 取到 session 才调
// `restoreSharedUi`）。快照里的 `right_tab` 一落地，`ResultCanvas` 的恢复 effect
// 就无条件 `setInternal(快照栏位)`，把用户此刻明确请求的落点覆盖掉。
//
// 所以本文件必须是**时序性**的：先派发深链，再让快照晚一步落地，断言深链仍然赢。
// 只测「派发出去的 action.tab 对不对」是测不到这条的——那一段本来就对。
//
// 每一跳都用上一跳的真实产出：
//   workspaceTemplatePreviewHref（真）
//     → useCatalogDeepLink（真）
//     → oceanleo:workspace-action 总线（真）
//     → ResultCanvas（真）
//     → WorkspaceRuntimeBoundary / restoreSharedUi（真，不是替身）
// 被替身换掉的只有叶子面板（MaterialLibrary / MyLibrary / …）与 i18n，
// 也就是与本条时序无关的那些东西。
// ============================================================================

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function resolveRelative(fromPath, specifier) {
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = resolve(dirname(fromPath), specifier + suffix);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const compiled = new Map();
const inFlight = new Set();

async function compileModule(relativePath, overrides) {
  const sourcePath = resolve(relativePath);
  const cached = compiled.get(sourcePath);
  if (cached) return cached;
  assert.ok(
    !inFlight.has(sourcePath),
    `循环依赖，data: 模块无法表达：${relativePath}`,
  );
  inFlight.add(sourcePath);

  let output = ts.transpileModule(await readFile(sourcePath, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  for (const specifier of new Set(
    [...output.matchAll(/from\s+"([^"]+)"/g)].map(([, spec]) => spec),
  )) {
    let replacement = overrides[specifier];
    if (!replacement && specifier === "react") replacement = reactUrl;
    if (!replacement && specifier === "react/jsx-runtime") {
      replacement = jsxRuntimeUrl;
    }
    if (!replacement && specifier.startsWith(".")) {
      const target = resolveRelative(sourcePath, specifier);
      assert.ok(target, `${relativePath} 里解析不到 ${specifier}`);
      replacement = await compileModule(
        relative(process.cwd(), target),
        overrides,
      );
    }
    assert.ok(
      replacement,
      `${relativePath} 依赖了无法在 data: 模块里解析的 ${specifier}`,
    );
    output = output.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }

  inFlight.delete(sourcePath);
  const url = `${dataModule(output)}#${encodeURIComponent(relativePath)}`;
  compiled.set(sourcePath, url);
  return url;
}

// ── 替身：只换与本条时序无关的叶子 ────────────────────────────────────────────
const uiStub = dataModule("export function useUI(){ return (v) => v; }\n");
const splitStub = dataModule(
  "export function useRightPaneSlot(){ return null; }\n" +
    "export function useWorkspacePane(){ return null; }\n",
);
const guideStub = dataModule("export function useFunctionGuide(){ return null; }\n");
const panelStub = dataModule(
  `import { jsx } from "${jsxRuntimeUrl}";\n` +
    "const panel = (name) => jsx('div', { 'data-live-panel': name });\n" +
    "export function NavigatorGuide(){ return panel('template'); }\n" +
    "export function MaterialLibrary(){ return panel('materials'); }\n" +
    "export function MyLibrary(){ return panel('mine'); }\n" +
    "export function CloudBrowserPanel(){ return panel('browser'); }\n" +
    "export function WorkspaceLibrary(){ return panel('preview'); }\n" +
    "export function workspaceEntryFromLibraryItem(item){ return { id: String(item?.id || 'item'), title: '', libraryItem: item }; }\n" +
    "export function AdvancedContentWorkbench(){ return null; }\n" +
    "export function WorkspaceEntryCanvas(){ return null; }\n",
);
const sessionContextStub = dataModule(
  "export function useWorkspaceSession(){\n" +
    "  return { mode: 'app', siteId: 'law', appId: 'divorce-consult', availability: 'ready', taskId: null, session: null };\n" +
    "}\n" +
    "export function useOptionalWorkspaceSession(){ return null; }\n",
);
const workbenchRoutesStub = dataModule(
  "export function editorCapabilityFor(){ return { available: false }; }\n",
);
const advancedSessionStub = dataModule(
  "export function advancedRootItemId(item){ return String(item?.id || 'item'); }\n" +
    "export function inlineEditorItemsFromSession(){ return []; }\n" +
    "export function savedEditorRevisionTransition(){ return { ok: true, durableCommit: true }; }\n",
);
const materialProviderStub = dataModule(
  "const actions = [];\n" +
    "export function useWorkbenchMaterialActions(){\n" +
    "  return { actions, perform(){}, canPerform(){ return false; }, availability: {}, beginMaterialDrag(){}, endMaterialDrag(){} };\n" +
    "}\n",
);
const legacyAdapterStub = dataModule(
  "export function adaptLegacyWorkspaceSurfaceTabs(){\n" +
    "  return { groups: { template: [], preview: [], materials: [], mine: [], browser: [] } };\n" +
    "}\n" +
    "export function legacyWorkspaceEntry(tab){ return { id: tab.id, title: tab.label || tab.id, libraryItem: tab.libraryItem }; }\n",
);
const surfaceModelStub = dataModule(
  "export function buildWorkspaceSurfaceModel(tabs){ return { tabs }; }\n" +
    "export function workspaceSurfaceCallerId(_model, id){ return id; }\n" +
    "export function workspaceSurfacePrimaryTab(){ return null; }\n" +
    "export function workspaceSurfaceSlotForId(_model, id, fallback){ return fallback(id); }\n",
);
const artifactClientStub = dataModule(
  "export async function getCurrentArtifactItem(){ return { ok: false, status: 404, error: '' }; }\n" +
    "export async function getArtifactEditDecision(){ throw new Error('预览链路不得走 fork 判定'); }\n",
);

const OVERRIDES = {
  "../i18n/ui/useUI": uiStub,
  "./SplitWorkspace": splitStub,
  "./guide-context": guideStub,
  "./NavigatorGuide": panelStub,
  "./MaterialLibrary": panelStub,
  "./MyLibrary": panelStub,
  "./CloudBrowserPanel": panelStub,
  "./WorkspaceLibrary": panelStub,
  "./AdvancedContentWorkbench": panelStub,
  "./WorkspaceEntryCanvas": panelStub,
  "./workspace-session-context": sessionContextStub,
  "./workbench-routes": workbenchRoutesStub,
  "./advanced-session": advancedSessionStub,
  "./workbench-material-provider": materialProviderStub,
  "./legacy-workspace-surface-adapter": legacyAdapterStub,
  "./workspace-surface-model": surfaceModelStub,
  "./artifact-client": artifactClientStub,
};

const controllerUrl = await compileModule(
  "src/shell/site-catalog-controller.ts",
  OVERRIDES,
);
const deeplinkUrl = await compileModule(
  "src/shell/site-catalog-deeplink.tsx",
  OVERRIDES,
);
const resultCanvasUrl = await compileModule(
  "src/shell/ResultCanvas.tsx",
  OVERRIDES,
);
const hydrationUrl = await compileModule(
  "src/shell/workspace-runtime-hydration.tsx",
  OVERRIDES,
);
const actionsUrl = await compileModule(
  "src/shell/workspace-actions.ts",
  OVERRIDES,
);

const {
  canonicalCatalogAppHref,
  resolveSiteCatalogRoute,
  workspaceTemplatePreviewHref,
} = await import(controllerUrl);
const { useCatalogDeepLink } = await import(deeplinkUrl);
const { ResultCanvas } = await import(resultCanvasUrl);
const { WorkspaceRuntimeBoundary, useWorkspaceRuntimeHydration } =
  await import(hydrationUrl);
const { WORKSPACE_ACTION_EVENT, dispatchWorkspaceAction } =
  await import(actionsUrl);

const APP = { id: "divorce-consult", name: "离婚咨询", icon: "⚖️" };
const ARTIFACT_ID = "22a009ad-6c31-4f0e-b0d2-9e4f77a1c5bb";

async function withDom(url, run) {
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
    url,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
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
  try {
    await run({ window, root, container });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

/**
 * 真实的嵌套关系：深链 hook 在 `SiteCatalogConsole` 那一层，右栏是它的**后代**。
 * React 的 effect 是子先父后，所以右栏的总线监听必然先注册好——这条测试要复现的
 * 时序竞争在「快照晚到」，不在「派发早于监听」。
 */
function Sender({ search, activeAppId, children }) {
  useCatalogDeepLink({
    activeAppId,
    apps: [APP],
    siteKey: "law",
    locationSearch: search,
    onDeepLinkQueryStripped: () => {},
  });
  return children;
}

/** 把真实的 hydration 句柄捞出来，测试才能像 FunctionAgentChat 那样晚一步恢复快照。 */
function HydrationProbe({ into, children }) {
  into.current = useWorkspaceRuntimeHydration();
  return children;
}

function activeSlot(container) {
  const active = container.querySelector(
    '[data-workspace-slot-panel][data-workspace-slot-active="true"]',
  );
  return active?.getAttribute("data-workspace-slot-panel") || "";
}

/**
 * 走完整条链，并在**深链已经落地之后**才让会话快照回来。
 *
 * `search` 为空 = 没有深链的对照组：这时快照恢复必须原样生效。
 */
async function runTimeline({ search, restoredRightTab }) {
  const hydration = { current: null };
  const dispatched = [];
  const url = `https://law.oceanleo.com/workspace${search}`;
  let afterDeepLink = "";
  let afterRestore = "";

  await withDom(url, async ({ window, root, container }) => {
    window.addEventListener(WORKSPACE_ACTION_EVENT, (event) =>
      dispatched.push(event.detail),
    );
    const tree = React.createElement(
      WorkspaceRuntimeBoundary,
      { scope: "test" },
      React.createElement(
        HydrationProbe,
        { into: hydration },
        React.createElement(
          Sender,
          { search, activeAppId: APP.id },
          React.createElement(ResultCanvas, {
            tabs: [],
            siteId: "law",
            accent: "#4f46e5",
          }),
        ),
      ),
    );
    await act(async () => root.render(tree));
    afterDeepLink = activeSlot(container);

    // ── 这里是关键的一拍：会话快照**晚于**深链落地，正如 FunctionAgentChat 的实况 ──
    await act(async () => {
      hydration.current.restoreSharedUi({ right_tab: restoredRightTab });
    });
    await act(async () => {});
    afterRestore = activeSlot(container);
  });

  return { dispatched, afterDeepLink, afterRestore, hydration: hydration.current };
}

const previewSearch = new URL(
  workspaceTemplatePreviewHref(APP.id, ARTIFACT_ID),
  "https://law.oceanleo.com",
).search;

test("深链形状：官方模板素材落素材库那一栏，item 是 artifactId", () => {
  assert.equal(
    workspaceTemplatePreviewHref(APP.id, ARTIFACT_ID),
    `/workspace?tab=materials&item=${ARTIFACT_ID}&mode=preview&app=${APP.id}`,
  );
  // app 锚点仍然承重：路由那一层要能从 `?app=` 认出 app，否则右栏根本不挂载。
  const route = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search: previewSearch,
    knownAppIds: new Set([APP.id]),
  });
  assert.equal(route.activeAppId, APP.id);
  assert.equal(route.invalidAppId, "");
  // 收敛到 `/workspace/<id>` 的规范化重定向不得把 `mode=preview` 当成 legacy app id 删掉
  //（V5 §2 那条「App 不存在或已下线 / preview」就是这么来的）。新的 tab 取值同样要过这关。
  const canonical = canonicalCatalogAppHref(APP.id, previewSearch, true);
  assert.match(canonical, /mode=preview/);
  assert.match(canonical, new RegExp(`item=${ARTIFACT_ID}`));
});

test("带深链进入：右栏停在素材库，且晚到的会话快照不得把它抢走", async () => {
  const { dispatched, afterDeepLink, afterRestore, hydration } =
    await runTimeline({ search: previewSearch, restoredRightTab: "mine" });

  assert.equal(dispatched.length, 1, "「预览&编辑」深链必须派发且只派发一次");
  assert.deepEqual(dispatched[0].action, {
    version: 1,
    tab: "materials",
    itemId: ARTIFACT_ID,
    intent: "open",
  });

  assert.equal(afterDeepLink, "materials", "深链当帧就该切到素材库");
  // 本条就是问题 2 的第二个成因：修复前这里会变成 "mine"（快照里的旧栏位）。
  assert.equal(
    afterRestore,
    "materials",
    "会话恢复不得覆盖用户此刻明确请求的深链落点",
  );
  // 落点还要能存活到下一次保存：否则用户一离开就被写回旧栏位，下次进来又跑偏。
  assert.equal(
    hydration.snapshotSharedUi().right_tab,
    "materials",
    "深链赢了之后，快照里记的也必须是素材库",
  );
});

test("无深链：会话恢复行为原样不变", async () => {
  for (const restoredRightTab of ["mine", "browser", "preview"]) {
    const { dispatched, afterRestore } = await runTimeline({
      search: "",
      restoredRightTab,
    });
    assert.deepEqual(dispatched, [], "没有深链就不该有任何派发");
    assert.equal(
      afterRestore,
      restoredRightTab,
      `无深链时必须恢复到快照里的 ${restoredRightTab}`,
    );
  }
});

test("用户自有 artifact 的 mine 落地行为没被破坏", async () => {
  // 历史/自有库链接仍然写 `tab=library`（`mine` 的 slot 别名），必须照旧落「我的库」。
  const search = `?tab=library&item=${ARTIFACT_ID}&mode=preview&app=${APP.id}`;
  const { dispatched, afterDeepLink, afterRestore } = await runTimeline({
    search,
    restoredRightTab: "materials",
  });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].action.tab, "mine");
  assert.equal(afterDeepLink, "mine");
  assert.equal(afterRestore, "mine", "自有库深链同样优先于会话恢复");
});

test("会话恢复晚到时，深链指名的那一份仍然交到素材库手上", async () => {
  // 切栏赢了但 envelope 丢了同样等于没修好：右栏必须把这条 action 交给 materials 那一栏。
  const { dispatched } = await runTimeline({
    search: previewSearch,
    restoredRightTab: "mine",
  });
  const [envelope] = dispatched;
  assert.equal(envelope.action.itemId, ARTIFACT_ID);
  assert.equal(envelope.action.intent, "open", "预览深链绝不能变成 edit");
  assert.match(envelope.nonce, /^catalog-preview:divorce-consult:22a009ad-/);
});

test("普通 receipt 派发的栏位同样不该被晚到的快照覆盖", async () => {
  // 深链只是「显式请求」的一种；agent receipt 走的是同一条总线、同一个优先级。
  const hydration = { current: null };
  let afterAction = "";
  let afterRestore = "";
  await withDom("https://law.oceanleo.com/workspace", async ({ root, container }) => {
    const tree = React.createElement(
      WorkspaceRuntimeBoundary,
      { scope: "test" },
      React.createElement(
        HydrationProbe,
        { into: hydration },
        React.createElement(ResultCanvas, { tabs: [], siteId: "law" }),
      ),
    );
    await act(async () => root.render(tree));
    await act(async () => {
      dispatchWorkspaceAction({
        nonce: "receipt-1",
        action: { version: 1, tab: "browser" },
      });
    });
    afterAction = activeSlot(container);
    await act(async () => {
      hydration.current.restoreSharedUi({ right_tab: "mine" });
    });
    await act(async () => {});
    afterRestore = activeSlot(container);
  });
  assert.equal(afterAction, "browser");
  assert.equal(afterRestore, "browser");
});
