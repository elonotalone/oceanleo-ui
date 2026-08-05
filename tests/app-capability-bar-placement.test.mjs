// ============================================================================
// 按键条长在**操控台里面** —— 操作员 2026-08-05 裁定的 DOM 层级机检
// ----------------------------------------------------------------------------
// 操作员看着截图的第一句话：
//   「最上方的『🗺️ 行程定制方案 地图 地球仪 台账 间隔排程』这一行错误！！
//     不能将这些按键加在最上方，要放在操控台里面。」
//
// 这条只能用真 DOM 判：按键条渲染在 `<Studio>` 之外还是左栏之内，是**层级**问题，
// 读源码断言不了（上一轮它就是被一个「渲染在 Studio 之外」的 JSX 位置放到双栏之上的）。
// 所以这里把 `OperatorConsole` → `Studio` → `SplitWorkspace` → `AppCapabilityBar`
// 四层**真模块**编译起来挂进 jsdom，只替换与版式无关的叶子（图标、词典、事件总线），
// 然后问三件事：
//   · 按键条在 `[data-workspace-pane="left"]` 里面，且不在右栏、不在双栏之上；
//   · 工作区高度不再为它扣 40px；
//   · 左栏 PaneHeader 上原有的 app 身份与控件仍在，没被按键条挤掉。
//
// 静态检查 + jsdom，不开浏览器（AGENTS.md policy:verification.browser-consent）。
// ============================================================================

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

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
  url: "https://travel.oceanleo.com/workspace/trip-plan",
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
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
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
window.HTMLElement.prototype.scrollTo = function scrollTo() {};

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

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
    await Promise.resolve();
  });
}

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const iconsStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  function Icon({ name, className }) {
    return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
  }
  export function IconLibrary(props) { return Icon({ name: "library", ...props }); }
  export function IconSparkles(props) { return Icon({ name: "agent", ...props }); }
  export function IconWorkspace(props) { return Icon({ name: "ops", ...props }); }
`);
const workspaceActionsStubUrl = dataModule(`
  export const WORKSPACE_ACTION_EVENT = "oceanleo:test-workspace-action";
  export function dispatchWorkspaceAction() {}
  export function normalizeWorkspaceAction() { return null; }
`);
const editBarDockHostStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function EditBarDockHost({ hostRef, presentation }) {
    return jsx("div", {
      ref: hostRef,
      hidden: !presentation,
      "data-workspace-edit-bar-dock": true
    });
  }
`);
const identityProviderStubUrl = dataModule(`
  export function GuideProvider({ children }) { return children; }
  export function OperatorRemarkProvider({ children }) { return children; }
`);
const directoryStubUrl = dataModule(`
  export function AppDirectory() { return null; }
`);
const homeCardsStubUrl = dataModule(`
  export function promptCardsForSite() { return []; }
`);
const hydrationStubUrl = dataModule(`
  export function useWorkspaceRuntimeHydration() { return null; }
`);
// 承载层不是本文件的被测对象：Provider 换成直通壳，免得把总线与起手件表一起拖进来。
const capabilityContextStubUrl = dataModule(`
  export function AppCapabilityEntryProvider({ children }) { return children; }
`);
// 清册换成夹具：本文件判的是版式，不是数据。「这个 app 配了哪几件工具」由夹具给。
const capabilityEntryStubUrl = dataModule(`
  export function appCapabilityEntries(siteKey, appId) {
    const table = globalThis.__pluginFixture || {};
    return table[siteKey + "/" + appId] || [];
  }
`);

const splitUrl = await compileTsxUrl("src/shell/SplitWorkspace.tsx", {
  "./icons": iconsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./EditBarDockHost": editBarDockHostStubUrl,
});
const studioUrl = await compileTsxUrl("src/shell/Studio.tsx", {
  "./SplitWorkspace": splitUrl,
  "../i18n/ui/useUI": uiStubUrl,
});
const barUrl = await compileTsxUrl("src/shell/AppCapabilityBar.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
});
const operatorUrl = await compileTsxUrl("src/shell/OperatorConsole.tsx", {
  "./Studio": studioUrl,
  "./AppDirectory": directoryStubUrl,
  "./guide-context": identityProviderStubUrl,
  "./home-cards": homeCardsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./OperatorRemark": identityProviderStubUrl,
  "./workspace-runtime-hydration": hydrationStubUrl,
  "./app-capability-entry": capabilityEntryStubUrl,
  "./AppCapabilityBar": barUrl,
  "./app-capability-context": capabilityContextStubUrl,
});
const { OperatorConsole } = await import(operatorUrl);

function plugin(id, label, runtime = "interactive-doc") {
  return {
    id,
    label,
    runtime,
    doc: `docs/specs/oceanleo-plugins-v1/plugins/${id}.md`,
  };
}

/**
 * 截图里那个 app：行程定制方案 + 地图 / 地球仪 / 台账 / 间隔排程。
 *
 * 四个 id 都是 L3 族 id。夹具是自造数据、写成什么都跑得通，但 R-1 归一之后
 * 短 id 已经废除且不留别名，夹具里还写着 `city-map` / `ledger` 会让
 * 「短 id 已绝迹」这个结论在仓里看起来是假的（`signals/W21-request.md` 第 3 条）。
 */
const TRIP_PLUGINS = [
  plugin("annotatable-city-map", "地图", "geo-map"),
  plugin("interactive-globe", "地球仪", "geo-map"),
  plugin("ledger-register", "台账", "grid"),
  plugin("spaced-repetition-scheduler", "间隔排程"),
];

function mountConsole(fixture, props = {}) {
  globalThis.__pluginFixture = fixture;
  return createMounted(OperatorConsole, {
    functions: [
      {
        id: "trip-plan",
        label: "行程定制方案",
        icon: "🗺️",
        ops: React.createElement("div", { "data-ops": true }, "操作流"),
        canvas: React.createElement("div", { "data-canvas": true }),
      },
    ],
    value: "trip-plan",
    siteId: "travel",
    directory: true,
    defaultRatio: 3 / 7,
    ...props,
  });
}

test("按键条长在操控台（左栏）里面，不在双栏之上、不在右栏", async () => {
  const mounted = await mountConsole({ "travel/trip-plan": TRIP_PLUGINS });
  try {
    const root = mounted.container.querySelector("[data-workspace-split]");
    assert.ok(root, "没渲染出双栏骨架");
    const leftPane = root.querySelector('[data-workspace-pane="left"]');
    const rightPane = root.querySelector('[data-workspace-pane="main"]');

    const bars = mounted.container.querySelectorAll("[data-console-function-bar]");
    assert.equal(bars.length, 1, "按键条应当只有一条");
    const bar = bars[0];

    assert.ok(
      leftPane.contains(bar),
      "按键条必须在左栏（操控台）里面 —— 操作员 2026-08-05 裁定",
    );
    assert.ok(!rightPane.contains(bar), "按键条不许跑到右栏去");
    // 「不在双栏之上」= 它是双栏骨架的后代，而且落在左栏那一版面里 ——
    // 旧代码把它渲染在 `<Studio>` 之外，于是 `root.contains(bar)` 会是 false。
    assert.ok(root.contains(bar), "按键条不许挂在双栏骨架之外");
    assert.equal(bar.closest("[data-workspace-pane]"), leftPane);
    // 也不许爬进左栏的标题条（那里是 app 身份与操作台/agent 控件的位置）。
    const header = leftPane.querySelector("[data-pane-header]");
    assert.ok(header && !header.contains(bar), "按键条不该占用左栏标题条");
  } finally {
    await mounted.unmount();
    delete globalThis.__pluginFixture;
  }
});

test("工作区可视高度不再为按键条扣 40px", async () => {
  const withBar = await mountConsole({ "travel/trip-plan": TRIP_PLUGINS });
  let heightWithBar;
  try {
    heightWithBar = withBar.container.querySelector("[data-workspace-split]")
      .style.height;
  } finally {
    await withBar.unmount();
  }
  const withoutBar = await mountConsole({});
  let heightWithoutBar;
  try {
    heightWithoutBar = withoutBar.container.querySelector(
      "[data-workspace-split]",
    ).style.height;
  } finally {
    await withoutBar.unmount();
    delete globalThis.__pluginFixture;
  }
  assert.equal(
    heightWithBar,
    heightWithoutBar,
    "有没有按键条，工作区高度都必须一样 —— 旧代码在这里减了 40px",
  );
  assert.equal(heightWithBar, "calc(100dvh - 0px)");
});

test("按键逐枚来自清册，文案是工具自己的中文名，点选与取消都走同一枚", async () => {
  const mounted = await mountConsole({ "travel/trip-plan": TRIP_PLUGINS });
  try {
    const bar = mounted.container.querySelector("[data-console-function-bar]");
    const buttons = [
      ...bar.querySelectorAll('[data-console-function-kind="capability"]'),
    ];
    assert.deepEqual(
      buttons.map((b) => b.textContent),
      ["地图", "地球仪", "台账", "间隔排程"],
    );
    assert.deepEqual(
      buttons.map((b) => b.dataset.capabilityPlugin),
      TRIP_PLUGINS.map((row) => row.id),
    );
    // app 身份只在左栏标题条上出现一次，按键条里不再重复一枚 app 按钮。
    assert.equal(
      bar.querySelectorAll('[data-console-function-kind="app"]').length,
      0,
    );

    const ledger = buttons[2];
    assert.equal(ledger.getAttribute("aria-pressed"), "false");
    await click(ledger);
    const pressed = mounted.container.querySelectorAll('[aria-pressed="true"]');
    assert.equal(pressed.length, 1);
    assert.equal(pressed[0].dataset.capabilityPlugin, "ledger-register");
    // 再点一次回到 app 自己的流程（没有 app 按钮，取消靠再点同一枚）。
    await click(
      mounted.container.querySelector('[data-capability-plugin="ledger-register"]'),
    );
    assert.equal(
      mounted.container.querySelectorAll('[aria-pressed="true"]').length,
      0,
    );
  } finally {
    await mounted.unmount();
    delete globalThis.__pluginFixture;
  }
});

test("清册里没有这个 app：零枚按键、连壳都不渲染，操控台照旧", async () => {
  const mounted = await mountConsole({ "travel/other-app": TRIP_PLUGINS });
  try {
    assert.equal(
      mounted.container.querySelectorAll("[data-console-function-bar]").length,
      0,
      "清册里没有的 app 不许长出按键条",
    );
    const leftPane = mounted.container.querySelector(
      '[data-workspace-pane="left"]',
    );
    assert.ok(leftPane.querySelector("[data-ops]"), "操作流必须还在");
  } finally {
    await mounted.unmount();
    delete globalThis.__pluginFixture;
  }
});

test("左栏原有的 app 身份、返回键与操作流没被按键条挤掉", async () => {
  const mounted = await mountConsole({ "travel/trip-plan": TRIP_PLUGINS });
  try {
    const leftPane = mounted.container.querySelector(
      '[data-workspace-pane="left"]',
    );
    const header = leftPane.querySelector("[data-pane-header]");
    const identity = header.querySelector("[data-workbench-app-identity]");
    assert.ok(identity, "左栏标题条上的 app 身份不见了");
    assert.ok(identity.querySelector('button[aria-label="返回 App 目录"]'));
    assert.equal(
      identity.querySelector("[data-workbench-app-title]").textContent,
      "行程定制方案",
    );
    assert.equal(
      header.querySelectorAll('button[aria-label="这一栏切大屏"]').length,
      1,
      "左栏「大屏」按钮不许被挤掉",
    );
    assert.ok(leftPane.querySelector("[data-ops]"), "操作流必须还在");
    // 按键条排在操作流之前（它是操控台正文的第一块）。
    const bar = leftPane.querySelector("[data-console-function-bar]");
    const ops = leftPane.querySelector("[data-ops]");
    assert.ok(
      bar.compareDocumentPosition(ops) & Node.DOCUMENT_POSITION_FOLLOWING,
      "按键条应当排在 app 操作流之前",
    );
  } finally {
    await mounted.unmount();
    delete globalThis.__pluginFixture;
  }
});
