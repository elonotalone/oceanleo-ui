// ============================================================================
// L0 专业模式开关 + 双核 flag 的判据（W01 判据 3/4，editor-core-swap）
//
// 锁的是两条产品承诺，不是实现细节：
//   1. **默认普通模式**（R3）：没存过就是 normal；开关点一次记住，按用户 × 编辑器分开记。
//   2. **默认旧核**（§10 第 3 条）：13 件 flag 全部 legacy；本波不换核的那几件翻了也没用。
//
// 反面验证见 verdicts/W01-delivery.md：把默认档改成 pro / next，这里当场红。
// 注释里不举任何真实 CSS 类名（_COMMON §7b⑧：判据文件会被 Tailwind 扫进产物）。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

import {
  DEFAULT_EDITOR_CORE,
  EDITOR_CORE_IDS,
  EDITOR_CORE_SPECS,
  editorSwapsCore,
  resolveEditorCore,
  setEditorCoreOverride,
} from "../src/shell/editor-core-flags.ts";

// localStorage 的最小替身：本文件只验读写与默认档，不需要真 DOM。
function installStorage() {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
    addEventListener() {},
  };
  return map;
}

beforeEach(() => {
  delete globalThis.window;
});

// ─── 判据 4：双核 flag ──────────────────────────────────────────────────────

test("13 件编辑器每件一个 flag，默认全部 legacy", () => {
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.equal(EDITOR_CORE_IDS.length, 13, "13 件，一件不少");
  for (const id of EDITOR_CORE_IDS) {
    assert.equal(resolveEditorCore(id), "legacy", id);
  }
});

test("台账每件都指得回一个 owner 与一个接法", () => {
  for (const id of EDITOR_CORE_IDS) {
    const spec = EDITOR_CORE_SPECS[id];
    assert.match(spec.owner, /^W\d\d$/, `${id} owner`);
    assert.ok(
      ["native", "hosted", "none"].includes(spec.hosting),
      `${id} hosting`,
    );
    // 不换核的件必须显式写 null + hosting none，不许留半截状态。
    if (spec.nextCore === null) {
      assert.equal(spec.hosting, "none", `${id} 不换核就不该有接法`);
    } else {
      assert.notEqual(spec.hosting, "none", `${id} 换核就必须有接法`);
    }
  }
});

test("本波不换核的件恒为 legacy —— 翻 flag 也没用", () => {
  const noSwap = EDITOR_CORE_IDS.filter((id) => !editorSwapsCore(id));
  assert.ok(noSwap.length > 0, "至少有一件本波不换核（否则这条判据在空转）");
  for (const id of noSwap) {
    // 显式入参是最高优先级，连它都压不动 —— 因为没有新核可去，
    // 翻了只会渲染一个不存在的组件。
    assert.equal(resolveEditorCore(id, "next"), "legacy", id);
    installStorage();
    setEditorCoreOverride(id, "next");
    assert.equal(resolveEditorCore(id), "legacy", `${id} 本地覆盖也压不动`);
  }
});

test("换核的件：显式入参 > 本地覆盖 > 默认", () => {
  const swap = EDITOR_CORE_IDS.filter((id) => editorSwapsCore(id));
  assert.ok(swap.length >= 11, "本波换核的件应有 11 件（game 不再换核）");
  const id = swap[0];

  assert.equal(resolveEditorCore(id), "legacy", "没存过就是默认档");
  assert.equal(resolveEditorCore(id, "next"), "next", "显式入参生效");

  installStorage();
  setEditorCoreOverride(id, "next");
  assert.equal(resolveEditorCore(id), "next", "本地覆盖生效");
  assert.equal(
    resolveEditorCore(id, "legacy"),
    "legacy",
    "显式入参压过本地覆盖",
  );
  setEditorCoreOverride(id, null);
  assert.equal(resolveEditorCore(id), "legacy", "清掉覆盖回默认档");
});

test("非法档位不生效，回默认档（不是抛错，也不是当成 next）", () => {
  const id = EDITOR_CORE_IDS.find((each) => editorSwapsCore(each));
  const map = installStorage();
  map.set(`oceanleo.editor-core.${id}`, "NEXT");
  assert.equal(resolveEditorCore(id), "legacy");
  map.set(`oceanleo.editor-core.${id}`, "");
  assert.equal(resolveEditorCore(id), "legacy");
});

test("localStorage 抛异常时不炸，按默认档走", () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error("私密模式");
      },
      setItem() {
        throw new Error("私密模式");
      },
      removeItem() {
        throw new Error("私密模式");
      },
    },
    addEventListener() {},
  };
  const id = EDITOR_CORE_IDS.find((each) => editorSwapsCore(each));
  assert.equal(resolveEditorCore(id), "legacy");
  assert.doesNotThrow(() => setEditorCoreOverride(id, "next"));
});

// ─── 判据 3：L0 专业模式开关的持久化 ────────────────────────────────────────

test("默认普通模式；按用户 × 编辑器分开记", async () => {
  installStorage();
  const {
    DEFAULT_PLUGIN_MODE,
    currentPluginMode,
    pluginModeStorageKey,
    setPluginMode,
    resetPluginModeCache,
  } = await import("../src/shell/plugin-chrome/plugin-mode-store.ts");
  resetPluginModeCache();

  assert.equal(DEFAULT_PLUGIN_MODE, "normal", "R3：默认普通模式");
  assert.equal(currentPluginMode("grid"), "normal");

  setPluginMode("grid", "pro");
  assert.equal(currentPluginMode("grid"), "pro", "点一次记住");
  // 「按编辑器」不是一句口号：切到另一件必须仍是普通模式。
  assert.equal(
    currentPluginMode("pdf"),
    "normal",
    "另一件编辑器不受影响",
  );
  assert.equal(pluginModeStorageKey("grid"), "oceanleo.editor-mode.grid");
  assert.notEqual(
    pluginModeStorageKey("grid"),
    pluginModeStorageKey("pdf"),
    "两件不许共用一个 key",
  );

  setPluginMode("grid", "normal");
  assert.equal(currentPluginMode("grid"), "normal", "能切回去");
});

test("存储里的非法值不当成 pro", async () => {
  const map = installStorage();
  const { currentPluginMode, resetPluginModeCache } = await import(
    "../src/shell/plugin-chrome/plugin-mode-store.ts"
  );
  for (const bad of ["PRO", "professional", "1", "true", ""]) {
    map.set("oceanleo.editor-mode.deck", bad);
    // 每轮清缓存，验的才是「解析这个值」而不是「上一轮缓存住的结果」。
    resetPluginModeCache();
    assert.equal(currentPluginMode("deck"), "normal", bad);
  }
});

// ─── 判据 3b：开关真的长在共用顶栏上，而且真的接到内核（真渲染） ─────────────
//
// 这一节**不判源码文本**，理由是 `verdicts/V1-red-1.md` 那次证伪：把顶栏里的开关
// 换成一个普通行内元素之后，上面那 8 例 8/8 仍然全绿 —— 而屏幕上的开关已经没了。
// 也就是说「顶栏真有开关」这条产品判据当时**没有任何守卫**：闸锁住的只是 store 的
// 默认档，锁不住「用户看得见、点得动、点了内核会动」。
//
// 第 9–13 例继续直接挂 Header：撤掉 Header 里的 Toggle 必须当场红（V1-red-1，已绿）。
// 后面另挂 `InlineAdvancedWorkbenchShell`：V1-red-3 证伪过，只挂 Header、测试自己塞
// `pluginThemeId` 时，把壳里那一处改成 `pluginThemeId={null}`，13/13 仍绿，用户十件
// 顶栏开关整组消失。壳那几例必须走生产 `pluginThemeIdForAdapter`，不许测试自己塞。
//
// jsdom 没有 layout，验「不许被藏 / 不许被挤成 0 宽」只钉 class token 与 hidden 属性，
// **不读 getBoundingClientRect、不假装验了可见性**（A-48）。
//
// 注释里不举任何真实 CSS 类名（`_COMMON.md §7b⑧`：判据文件会被 Tailwind 扫进产物）。

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

/**
 * `tt()` 的替身：原样返回并填占位符。
 *
 * **刻意只打这一个桩。** 顶栏本体（`AdvancedWorkspaceActionBar`）、按钮原语、
 * 主题开关全部用真的：打了桩就变成「验我自己写的替身」，而这一节要验的恰恰是
 * 那条用户真会看到的栏上有没有这个开关。
 */
const ttStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      String(value).replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match,
      );
  }
`);

let headerPromise;
function loadHeader() {
  headerPromise ??= (async () =>
    import(
      await compileModule("src/shell/InlineAdvancedWorkbenchHeader.tsx", {
        "../i18n/ui/useUI": ttStubUrl,
      })
    ))();
  return headerPromise;
}

/**
 * 「共用顶栏要覆盖哪些件」这张清单从**生产代码的表**里取，不在判据里手抄一份
 * （`_COMMON.md §7b⑪b`：清单类判据手抄一份就会漂移）。
 */
let themeModPromise;
function loadThemeMod() {
  themeModPromise ??= (async () =>
    import(
      await compileModule("src/shell/plugin-theme.tsx", {
        "../i18n/ui/useUI": ttStubUrl,
      })
    ))();
  return themeModPromise;
}

let themeIdsPromise;
function loadPluginThemeIds() {
  themeIdsPromise ??= loadThemeMod().then((mod) =>
    Object.keys(mod.PLUGIN_THEME_SPECS),
  );
  return themeIdsPromise;
}

/**
 * 十件共用壳。Header **不打桩**——打了就又变成「测试自己塞 pluginThemeId」
 * （V1-red-3）。其余与开关无关的钩子才换成空实现，形状抄
 * `tests/edit-bar-dock-console.test.mjs` 挂这只壳的那张桩表。
 */
let shellPromise;
function loadShell() {
  shellPromise ??= (async () => {
    const layoutStubUrl = dataModule(`
      import { createContext } from ${JSON.stringify(reactUrl)};
      export const AdvancedLayoutContext = createContext(null);
      export const ADVANCED_TOOLS_PANEL_ID = "advanced-workbench-tools-panel";
      export function focusAdvancedToolsTrigger() {}
      export function useAdvancedToolsLauncherRegistration() {}
    `);
    const chromeStubUrl = dataModule(`
      export function advancedWorkbenchStyle(accent) {
        return { "--awb-accent": accent };
      }
      // X1 起 Shell 按组分发 adapter.actions（edit / save / download）；桩与真模块同形。
      export function actionGroup(action) {
        return action && action.group ? action.group : "edit";
      }
    `);
    const confirmStubUrl = dataModule(`
      export function ConfirmDialog() { return null; }
    `);
    const floatingStubUrl = dataModule(`
      export function FloatingContextToolbar() { return null; }
      export function useFloatingContextToolbar() {
        return { mode: "docked", dropActive: false, leading: null, trailing: null };
      }
    `);
    const panelsStubUrl = dataModule(`
      export function useInlineAdvancedPanels() {
        return {
          drawers: [],
          activeDrawerId: "",
          activeMaterialAction: null,
          transientPanel: null,
          fallbackDetail: null,
          openDrawer() {},
          openTransientPanel() {},
          updateTransientPanel() {},
          closeDetail() {},
        };
      }
    `);
    const dropStubUrl = dataModule(`
      export function useInlineAdvancedWorkbenchDrop() {
        return { dropMessage: "", performUpload() {}, handleDrop() {} };
      }
    `);
    const sessionStubUrl = dataModule(`
      export function useAdvancedSession() { return null; }
    `);
    const materialsStubUrl = dataModule(`
      export function useWorkbenchMaterials() { return null; }
    `);
    const splitStubUrl = dataModule(`
      export function useRightPaneSlot() { return null; }
      export function useWorkspacePane() { return null; }
    `);
    const autosaveStubUrl = dataModule(`
      export function useAdvancedAutoSave() {
        return {
          state: "saved",
          flushLatest: async () => ({ ok: true }),
          retry: async () => {},
        };
      }
    `);
    const recoveryStubUrl = dataModule(`
      export function useAdvancedRecovery() {}
    `);
    const leaveStubUrl = dataModule(`
      export async function flushAdvancedWorkBeforeLeave() { return { ok: true }; }
    `);
    const routesStubUrl = dataModule(`
      export function editBarOwnershipForItem() { return "host"; }
    `);
    const stageStubUrl = dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function AdvancedStageControls() { return null; }
      export function AdvancedWorkbenchStage() {
        return jsx("div", { "data-probe-stage": true });
      }
      export function EditBarDockHost() { return null; }
    `);
    return import(
      await compileModule("src/shell/InlineAdvancedWorkbenchShell.tsx", {
        "../i18n/ui/useUI": ttStubUrl,
        "../ui": confirmStubUrl,
        "./advanced-layout-context": layoutStubUrl,
        "./AdvancedStageControls": stageStubUrl,
        "./AdvancedWorkbenchStage": stageStubUrl,
        "./FloatingContextToolbar": floatingStubUrl,
        "./EditBarDockHost": stageStubUrl,
        "./advanced-leave-flush": leaveStubUrl,
        "./inline-advanced-workbench-drop": dropStubUrl,
        "./use-inline-advanced-panels": panelsStubUrl,
        "./advanced-session-context": sessionStubUrl,
        "./advanced-workbench-chrome": chromeStubUrl,
        "./workbench-material-provider": materialsStubUrl,
        "./SplitWorkspace": splitStubUrl,
        "./use-advanced-autosave": autosaveStubUrl,
        "./use-advanced-recovery": recoveryStubUrl,
        "./workbench-routes": routesStubUrl,
      })
    );
  })();
  return shellPromise;
}

/**
 * jsdom 取自 `fabric/node` 自带那份（仓内唯一可用），它的 `canvas` 依赖在本容器里
 * 装不上，所以先拿空对象把 require 缓存顶掉，建完再还回去。
 * 夹具抄 `tests/button-primitive.test.mjs:361-423`，退出时把全局**逐个还原**——
 * 本文件上半段那些纯 store 用例靠 `beforeEach` 删掉 `globalThis.window`，
 * 两边共处一份文件，不还原就会互相污染。
 */
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
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
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

function headerProps(overrides = {}) {
  return {
    adapter: { id: "grid", label: "表格", stage: null },
    autoSaveState: "saved",
    activeDrawerId: "",
    activeLibraryPanelId: null,
    drawers: [],
    accent: "#6d5dfc",
    pluginThemeId: null,
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

/**
 * 把「内核那一侧」也照真的建模：`setMode` 进来之后编辑器自己的档位跟着变。
 *
 * 这不是为了好看。写成一个静态的 `current: "normal"` 会让接线那条 effect 每轮都
 * 认为两边不一致而重复推送，于是断言得去容忍一串重复调用 —— 那正好会**掩盖**
 * 「打开时推一次」和「点一下推一次」的区别，而这两件事是分开的两条产品承诺。
 */
function modeHost(Header, pluginId, calls, extraProps = {}) {
  function ModeHost() {
    const [editorMode, setEditorMode] = React.useState("normal");
    return React.createElement(
      Header,
      headerProps({
        pluginThemeId: pluginId,
        adapter: {
          id: pluginId,
          label: "编辑器",
          stage: null,
          mode: {
            current: editorMode,
            setMode: (next) => {
              calls.push(next);
              setEditorMode(next);
            },
          },
        },
        ...extraProps,
      }),
    );
  }
  return React.createElement(ModeHost);
}

test("共用顶栏第二行有专业编辑页，每一件都有；第一行不再挂开关", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  const pluginIds = await loadPluginThemeIds();
  assert.ok(
    pluginIds.length >= 10,
    `插件清单只剩 ${pluginIds.length} 件。十件 Advanced 编辑器共用这一条顶栏，` +
      "清单缩到 10 以下说明取表取错了（这条判据会因此空转）。",
  );

  await withDom(async ({ render, find }) => {
    const { resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    const { resetPluginPageCache } = await import(
      "../src/shell/plugin-chrome/plugin-page-store.ts"
    );
    for (const pluginId of pluginIds) {
      resetPluginModeCache();
      resetPluginPageCache();
      await render(modeHost(InlineAdvancedWorkbenchHeader, pluginId, []));

      assert.equal(
        find(`[data-plugin-mode-toggle="${pluginId}"]`),
        null,
        `${pluginId}：第一行还挂着专业模式开关。产品规则已改成第二行「专业编辑」页。`,
      );
      const pro = find('[data-plugin-page="pro"]');
      assert.ok(
        pro,
        `${pluginId}：第二行没有「专业编辑」页签。` +
          "页签只画在 PluginChromeFrame 里、而这条壳不走 Frame，就是同一类漏接。",
      );
      assert.equal(pro.tagName, "BUTTON", `${pluginId}：页签不是可点的按钮`);
      assert.match(
        pro.getAttribute("aria-label") || pro.textContent || "",
        /专业编辑/,
        `${pluginId}：页签没有可读的名字`,
      );

      const actionRow = find("[data-advanced-workspace-actions]");
      const pageRow = find("[data-plugin-page-row]");
      const headerRoot = find("[data-advanced-workbench-header]");
      assert.ok(actionRow, `${pluginId}：共用顶栏第一行没渲染出来`);
      assert.ok(pageRow, `${pluginId}：共用顶栏第二行没渲染出来`);
      assert.ok(
        headerRoot && headerRoot.contains(actionRow) && headerRoot.contains(pageRow),
        `${pluginId}：两行不在顶栏容器里`,
      );
    }
  });
});

test("点专业编辑页：内核当场收到 setMode，档位也记住了", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  await withDom(async ({ render, find, click }) => {
    const { currentPluginMode, resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    const { resetPluginPageCache } = await import(
      "../src/shell/plugin-chrome/plugin-page-store.ts"
    );
    resetPluginModeCache();
    resetPluginPageCache();
    const calls = [];
    await render(modeHost(InlineAdvancedWorkbenchHeader, "grid", calls));

    const pro = find('[data-plugin-page="pro"]');
    assert.ok(pro, "第二行没有专业编辑页签");
    assert.deepEqual(calls, [], "刚打开、两边同档，不该推送");

    await click(pro);
    assert.deepEqual(
      calls,
      ["pro"],
      "点了专业编辑，内核没收到 setMode('pro')。" +
        "页签只改 store 而不通知内核，用户看到的还是轻编辑。",
    );
    assert.equal(currentPluginMode("grid"), "pro", "档位没记住");
    assert.equal(
      find('[data-plugin-page="pro"]').getAttribute("aria-current"),
      "page",
      "页签自己没跟着变（屏幕上看不出已经进了专业编辑）",
    );

    await click(find('[data-plugin-page="artifact"]'));
    assert.deepEqual(calls, ["pro", "normal"], "退不出专业编辑");
    assert.equal(currentPluginMode("grid"), "normal");
  });
});

test("重新打开编辑器：用记住的档位初始化内核，不是一律从普通模式起步", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  await withDom(async ({ render, find }) => {
    const { currentPluginMode, resetPluginModeCache, setPluginMode } =
      await import("../src/shell/plugin-chrome/plugin-mode-store.ts");
    const { resetPluginPageCache } = await import(
      "../src/shell/plugin-chrome/plugin-page-store.ts"
    );
    resetPluginModeCache();
    resetPluginPageCache();
    // 上一次这个用户在这件编辑器里选了专业模式。
    setPluginMode("pdf", "pro");
    assert.equal(currentPluginMode("pdf"), "pro");

    const calls = [];
    await render(modeHost(InlineAdvancedWorkbenchHeader, "pdf", calls));

    assert.deepEqual(
      calls,
      ["pro"],
      "打开编辑器时没有把记住的档位交给内核。" +
        "少了这一步，「按用户 × 编辑器记住」就只是 localStorage 里的一个值：" +
        "页签停在专业编辑，内核的完整 UI 却不在，两边说的话不一样。",
    );
    assert.equal(
      find('[data-plugin-page="pro"]').getAttribute("aria-current"),
      "page",
    );

    // 「另一件编辑器不受影响」在真渲染下再验一次：pdf 记住了 pro，grid 仍是普通模式。
    const gridCalls = [];
    await render(modeHost(InlineAdvancedWorkbenchHeader, "grid", gridCalls));
    assert.deepEqual(gridCalls, [], "别的编辑器被 pdf 的档位带跑了");
    assert.equal(
      find('[data-plugin-page="artifact"]').getAttribute("aria-current"),
      "page",
    );
  });
});

test("编辑器没声明 mode：开关仍能点，点了就切档", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  await withDom(async ({ render, find, click }) => {
    const { currentPluginMode, resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    const { resetPluginPageCache } = await import(
      "../src/shell/plugin-chrome/plugin-page-store.ts"
    );
    resetPluginModeCache();
    resetPluginPageCache();
    await render(
      React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({
          pluginThemeId: "game",
          adapter: { id: "game", label: "游戏", stage: null },
        }),
      ),
    );

    const pro = find('[data-plugin-page="pro"]');
    assert.ok(pro, "没声明 mode 也不该把专业编辑页签拿掉");

    await click(pro);
    assert.equal(
      currentPluginMode("game"),
      "pro",
      "点了专业编辑，档位没有切到 pro",
    );
    assert.equal(pro.getAttribute("aria-current"), "page");
  });
});

test("不是插件的适配器：顶栏不出这个开关", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  await withDom(async ({ render, find }) => {
    await render(
      React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({ pluginThemeId: null }),
      ),
    );
    assert.ok(find("[data-advanced-workspace-actions]"), "顶栏本体没渲染出来");
    assertNoL0Toggle(find, "Header 夹具 pluginThemeId=null");
  });
});

// ─── 判据 3c：闸必须走到十件壳的真实接线（V1-red-3 / A-48） ────────────────
//
// 上面第 9–13 例编译的是 Header、测试自己把 pluginThemeId 塞进去。那锁得住
// 「Header 里的 Toggle 被撤掉」，锁不住「壳根本不把 id 传下来」。
// 下面挂的是 InlineAdvancedWorkbenchShell，id 只来自生产函数
// pluginThemeIdForAdapter(adapter.id)。

function assertNoL0Toggle(find, where) {
  assert.equal(
    find("[data-plugin-mode-toggle]"),
    null,
    `${where}：仍有 data-plugin-mode-toggle。pluginThemeId 为 null 也出开关 ⇒ 上面几条会变成恒真。`,
  );
  // `{true ? (` 仍会把 Toggle 画出来，只是 pluginId 是 null、数据属性被 React 丢掉。
  // 人看见的是「专业模式」四个字，闸若只认 data 属性就会假绿（A-48 恒真分支）。
  assert.equal(
    find('[aria-label*="专业模式"]'),
    null,
    `${where}：没有 data 属性，但 aria-label 仍写着专业模式。` +
      "把 `{pluginThemeId ?` 改成 `{true ?` 就是这样：标识符还在，用户不该看见的开关出现了。",
  );
}

const CONCEAL_CLASS_TOKENS = new Set([
  "hidden",
  "invisible",
  "sr-only",
  "opacity-0",
  "w-0",
  "h-0",
  "max-w-0",
  "max-h-0",
]);
const FLEX_NO_SHRINK_TOKEN = "shrink-0";

function classTokenSet(node) {
  const raw = node?.getAttribute?.("class") || "";
  return new Set(String(raw).trim().split(/\s+/).filter(Boolean));
}

function concealmentOnAncestors(toggle, header) {
  let node = toggle;
  while (node) {
    if (node.hidden || node.hasAttribute("hidden")) return "hidden-attr";
    if (node.getAttribute("aria-hidden") === "true") return "aria-hidden";
    const display = node.style?.display;
    const visibility = node.style?.visibility;
    const width = node.style?.width;
    if (
      display === "none" ||
      visibility === "hidden" ||
      width === "0" ||
      width === "0px"
    ) {
      return "inline-style";
    }
    for (const token of classTokenSet(node)) {
      if (CONCEAL_CLASS_TOKENS.has(token)) return token;
    }
    if (node === header) break;
    node = node.parentElement;
  }
  return null;
}

function flexChildHolding(header, node) {
  let current = node;
  while (current.parentElement && current.parentElement !== header) {
    current = current.parentElement;
  }
  return current;
}

function libraryItemFor(adapterId) {
  return {
    key: `creation:${adapterId}-1`,
    source: "creation",
    id: `${adapterId}-1`,
    title: adapterId,
    kind: "document",
    siteId: "study",
    favorite: false,
    meta: {},
  };
}

function shellHost(Shell, adapterId, calls) {
  function Host() {
    const [editorMode, setEditorMode] = React.useState("normal");
    return React.createElement(Shell, {
      item: libraryItemFor(adapterId),
      adapter: {
        id: adapterId,
        label: adapterId,
        stage: React.createElement("div"),
        mode: {
          current: editorMode,
          setMode: (next) => {
            calls.push(next);
            setEditorMode(next);
          },
        },
      },
      onClose() {},
    });
  }
  return React.createElement(Host);
}

function assertShellChromeVisible(find, adapterId, expectedThemeId) {
  const header = find("[data-advanced-workbench-header]");
  assert.ok(
    header,
    `${adapterId}：十件壳没把共用顶栏渲染出来（壳里那条 actionBar 被短路了）`,
  );
  const theme = find(`[data-plugin-theme-toggle="${expectedThemeId}"]`);
  assert.ok(
    theme,
    `${adapterId}：壳没有把 pluginThemeIdForAdapter 的非空结果交给 Header。` +
      `预期主题键 id=${expectedThemeId}。`,
  );
  const pro = find('[data-plugin-page="pro"]');
  assert.ok(pro, `${adapterId}：壳上没有专业编辑页签`);
  const concealed = concealmentOnAncestors(pro, header);
  assert.equal(
    concealed,
    null,
    `${adapterId}：页签还在 DOM 里，但祖先带了藏起标记 ${concealed}。`,
  );
  assert.ok(header.contains(pro), `${adapterId}：页签渲染了，但不在共用顶栏里`);
}

test("十件壳把 pluginThemeIdForAdapter 的非空结果交给顶栏", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  const { pluginThemeIdForAdapter } = await loadThemeMod();
  const pluginIds = await loadPluginThemeIds();
  assert.ok(pluginIds.length >= 10, "主题表缩到 10 以下，这条会空转");

  // 带版本后缀的 adapter id 必须归一化（生产函数的契约），不许只测裸名。
  const adapterIds = [...pluginIds, "chart-editor@1"];

  await withDom(async ({ render, find }) => {
    const { resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    const { resetPluginPageCache } = await import(
      "../src/shell/plugin-chrome/plugin-page-store.ts"
    );
    for (const adapterId of adapterIds) {
      const expected = pluginThemeIdForAdapter(adapterId);
      assert.ok(
        expected,
        `${adapterId}：生产函数应对主题表里的件给出非空 id（否则下面恒绿）`,
      );
      resetPluginModeCache();
      resetPluginPageCache();
      await render(shellHost(InlineAdvancedWorkbenchShell, adapterId, []));
      assertShellChromeVisible(find, adapterId, expected);
    }
  });
});

test("壳遇到生产函数判为非插件的适配器：顶栏不出这个开关", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  const { pluginThemeIdForAdapter } = await loadThemeMod();
  const adapterId = "not-a-plugin-editor";
  assert.equal(
    pluginThemeIdForAdapter(adapterId),
    null,
    "这条的夹具必须是生产函数会判 null 的 id，否则在空转",
  );

  await withDom(async ({ render, find }) => {
    const { resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    const { resetPluginPageCache } = await import(
      "../src/shell/plugin-chrome/plugin-page-store.ts"
    );
    resetPluginModeCache();
    resetPluginPageCache();
    await render(shellHost(InlineAdvancedWorkbenchShell, adapterId, []));
    assert.ok(
      find("[data-advanced-workbench-header]"),
      "顶栏本体没渲染出来",
    );
    assertNoL0Toggle(find, "壳 + 生产函数判 null 的适配器");
  });
});

test("从十件壳点专业编辑页：内核当场收到 setMode（不经 Header 夹具）", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  await withDom(async ({ render, find, click }) => {
    const { currentPluginMode, resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    const { resetPluginPageCache } = await import(
      "../src/shell/plugin-chrome/plugin-page-store.ts"
    );
    resetPluginModeCache();
    resetPluginPageCache();
    const calls = [];
    await render(shellHost(InlineAdvancedWorkbenchShell, "grid", calls));

    const pro = find('[data-plugin-page="pro"]');
    assert.ok(pro, "壳上没有专业编辑页签——接线断在 InlineAdvancedWorkbenchShell");
    assert.deepEqual(calls, [], "刚打开、两边同档，不该推送");

    await click(pro);
    assert.deepEqual(
      calls,
      ["pro"],
      "从壳点了专业编辑，内核没收到 setMode('pro')。" +
        "Header 夹具那条能绿、这条红，说明桥只在测试自己塞的 Header 上活着。",
    );
    assert.equal(currentPluginMode("grid"), "pro");

    await click(find('[data-plugin-page="artifact"]'));
    assert.deepEqual(calls, ["pro", "normal"]);
  });
});
