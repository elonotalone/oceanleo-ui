// 表格换核的接线闸（W03 · editor-core-swap；2026-09-07 core-swap:delete grid 后只剩 Univer）。
//
// 四份 `grid-univer-*.test.mjs` 判的是纯模块内容（preset 水印、chrome、命令表、
// 快照转换、L4 chips）。这一份判的是**接线**：那些模块有没有真被路由用上、
// 路由是不是只剩懒加载 Univer 这一条路、专业模式走的是不是 `buildSetModeMessage`
// 校验后的 chrome，而不是 postMessage、不是 dispose 重建。
// 一个实例两种 chrome 的运行期判据（切模式不 dispose、卸载后才 dispose、页签
// 切换同步 applyChrome、首帧无 ribbon）在 `tests/grid-univer-stage-mode.test.mjs`。
//
// 为什么是读源码断言 + 真调用纯函数：接线错了的编辑器在单测里长得和接对了一样。
// 「真的画出一张 Univer 表」那半在浏览器里，归 V1（不许拿浏览器当验收）。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  DEFAULT_EDITOR_CORE,
  resolveEditorCore,
} from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  gridAgentChipsAreValid,
  gridToolsManifestChips,
} from "../src/shell/doc-editors/grid-univer/l4-chips.ts";
import {
  GRID_UNIVER_DEFAULT_MODE,
  gridUniverChrome,
} from "../src/shell/doc-editors/grid-univer/chrome.ts";
import {
  GRID_UNIVER_INSTANCE_ID,
  GRID_UNIVER_STAGE_CSS_SPECIFIERS,
  GRID_UNIVER_STAGE_OSS_SPECIFIERS,
  applyGridUniverChromeDom,
  applyGridUniverChromeToApi,
  applyGridUniverMode,
  gridUniverCorePresetConfig,
  gridUniverFacadeControlIds,
  gridUniverSelectionContext,
  gridUniverUiVisibility,
  univerFacadePortFromLive,
} from "../src/shell/doc-editors/grid-univer/stage-plan.ts";
import { UNIVER_WATERMARK_PRESETS } from "../src/shell/doc-editors/grid-univer/presets.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/GridRoute.tsx");
const leaf = read("src/shell/doc-editors/GridUniverStage.tsx");
const plan = read("src/shell/doc-editors/grid-univer/stage-plan.ts");
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const leafCode = leaf
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

test("路由只剩一条路：懒加载 Univer 叶子，不判 flag、不留旧核", () => {
  // grid 已翻 flag（台账 defaultChoice），路由不再自己判核。
  assert.equal(resolveEditorCore("grid"), "next");
  assert.equal(DEFAULT_EDITOR_CORE, "legacy", "全局默认仍 legacy，只有 grid 翻了");
  assert.doesNotMatch(routeCode, /resolveEditorCore/);
  assert.doesNotMatch(routeCode, /renderGridNextOrLegacy|GridLegacy|GridStage|useGridEditor/);
  assert.match(route, /export async function loadGridUniverStage/);
  assert.doesNotMatch(route, /from "@univerjs\//, "重内核只能在懒加载叶子里");
  assert.match(route, /dynamic\(loadGridUniverStage,/);
  assert.match(route, /import\("\.\.\/doc-editors\/GridUniverStage"\)/);
  assert.match(route, /ssr:\s*false/);
  // chunk 没到之前舞台不能留白。
  assert.match(route, /loading:\s*\(\)\s*=>\s*<WorkbenchRouteLoading \/>/);
  assert.doesNotMatch(route, /loading:\s*\(\)\s*=>\s*null/);
  assert.match(routeCode, /return <GridUniverStage \{\.\.\.props\} \/>;/);
});

test("编辑栏文档段有重新计算；第二行申报 Univer，不报 aux", () => {
  const actions = read("src/shell/doc-editors/grid-univer/document-actions.ts");
  assert.match(actions, /id:\s*"grid-recalculate"/);
  assert.match(actions, /label:\s*tt\("重新计算"\)/);
  assert.match(leaf, /buildGridDocumentActions\(/);
  assert.match(leaf, /\.\.\.documentActions,/);
  // Univer 侧「重新计算」= 公式引擎强制全量重算。
  assert.match(leaf, /getFormula\?\.\(\)/);
  assert.match(leaf, /executeCalculation\(\)/);
  assert.match(leaf, /pages:\s*\{\s*proLabel:\s*GRID_PRO_LABEL\s*\}/);
  assert.doesNotMatch(leaf, /aux:\s*\[/);
  // 模式直接来自 L0 store，舞台不另存一份。
  assert.match(leaf, /const \{ mode, setMode \} = usePluginMode\("grid"\)/);
  assert.doesNotMatch(leafCode, /useState<EditorMode>/);
});

test("professional mode uses buildSetModeMessage without postMessage, and does not dispose", () => {
  assert.equal(GRID_UNIVER_DEFAULT_MODE, "normal");
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(plan, /buildSetModeMessage/);
  assert.match(leaf, /applyGridUniverMode/);
  assert.match(leaf, /mode: \{\s*\n\s*current: mode,/);
  assert.doesNotMatch(routeCode, /postMessage/);
  assert.doesNotMatch(leafCode, /postMessage/);
  assert.doesNotMatch(routeCode, /buildSetModeMessage/);

  const normal = applyGridUniverMode(GRID_UNIVER_INSTANCE_ID, "normal");
  assert.equal(normal.mode, "normal");
  assert.equal(normal.message.type, "set-mode");
  assert.equal(normal.chrome.header, false);
  assert.equal(normal.chrome.toolbar, false);
  assert.equal(normal.chrome.formulaBar, false);
  assert.equal(normal.chrome.statusBarStatistic, false);
  assert.equal(normal.chrome.footer, true);

  const pro = applyGridUniverMode(GRID_UNIVER_INSTANCE_ID, "pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.chrome.header, true);
  assert.equal(pro.chrome.toolbar, true);
  assert.equal(pro.chrome.formulaBar, true);
  assert.deepEqual(pro.chrome, gridUniverChrome("pro"));

  // dispose 只有一处，且不在 cleanup 里同步跑：排进下一个宏任务（React 提交之外）。
  assert.equal((leafCode.match(/univer\.dispose\(\)/g) || []).length, 1);
  assert.doesNotMatch(leafCode, /return \(\) => \{\s*created\.univer\.dispose\(\);/);
  assert.match(leafCode, /setTimeout\(\(\) => \{[\s\S]{0,200}live\.univer\.dispose\(\);[\s\S]{0,40}\}, 0\)/);
  // 模式 → chrome 走 useLayoutEffect（同一帧），且这条 effect 里没有实例生命周期。
  const modeEffect = leafCode.match(
    /useLayoutEffect\(\(\) => \{([\s\S]*?)\}, \[applyChrome, mode\]\);/,
  );
  assert.ok(modeEffect, "模式 → chrome 的 useLayoutEffect 不在了");
  assert.doesNotMatch(modeEffect[1], /dispose|createUniver|flush/);
  assert.match(
    leaf,
    /replaceUniverWorkbookWithSnapshot/,
    "preset 会先留下一张空表；必须先建带数据的那一本再卸空簿",
  );
  assert.match(
    leaf,
    /\/\/ 切 mode 不许走进这个 effect：dispose 只发生在卸载。/,
  );
});

test("create-time preset keeps chrome nodes so mode switch does not rebuild", () => {
  const config = gridUniverCorePresetConfig("normal", "container");
  assert.equal(config.header, true);
  assert.equal(config.toolbar, true);
  assert.equal(config.formulaBar, true);
  assert.deepEqual(config.footer, {
    sheetBar: true,
    statisticBar: true,
    menus: true,
    zoomSlider: true,
  });
  assert.equal(config.container, "container");

  const attrs = {};
  const hidden = [];
  const root = {
    setAttribute(name, value) {
      attrs[name] = value;
    },
    querySelectorAll(selector) {
      const node = { style: { display: "" }, selector };
      hidden.push(node);
      return [node];
    },
  };
  applyGridUniverChromeDom(root, gridUniverChrome("normal"));
  assert.equal(attrs["data-grid-univer-header"], "off");
  assert.equal(attrs["data-grid-univer-formula-bar"], "off");
  assert.equal(attrs["data-grid-univer-footer"], "on");
  assert.ok(hidden.some((node) => node.style.display === "none"));

  const calls = [];
  applyGridUniverChromeToApi(
    {
      setUIVisible(part, visible) {
        calls.push(`${part}:${visible}`);
      },
    },
    gridUniverChrome("pro"),
  );
  assert.deepEqual(
    calls,
    gridUniverUiVisibility(gridUniverChrome("pro")).map(
      (row) => `${row.part}:${row.visible}`,
    ),
  );
});

test("the eight grid chips satisfy the contract validator", () => {
  assert.equal(gridAgentChipsAreValid(), true);
  const fields = gridToolsManifestChips();
  assert.equal(fields.manifestVersion, 2);
  assert.equal(fields.chips.length, 8);
  assert.equal(new Set(fields.chips.map((chip) => chip.id)).size, 8);
  assert.match(leaf, /gridToolsManifestChips/);
  // 原来这里断言的是 `buildGridReviewProposal` 出现在舞台里。V3-red-3 证明
  // **那个断言拦不住它要拦的东西**：舞台确实造了提案，但从不交出去，唯一消费方
  // 是 `Boolean(proposal)` —— 字符串在，产品是坏的。改成钉住真正决定成败的两处
  // 接线：整条委派给 `runGridAgentCommand`，且提案交给宿主真收件箱。
  assert.match(leaf, /runGridAgentCommand\(/);
  assert.match(leaf, /submit:\s*submitAgentReviewProposal/);
});

test("L1/L2 facade control ids are wired into the Univer selection context", () => {
  const ids = gridUniverFacadeControlIds();
  assert.ok(ids.includes("bold"));
  assert.ok(ids.includes("align"));
  assert.ok(ids.includes("merge-cells"));
  const context = gridUniverSelectionContext({ revision: 1, kind: "grid-cell" });
  assert.equal(context.version, 1);
  const controlIds = context.controls.map((control) => control.id);
  for (const id of ids) {
    assert.ok(controlIds.includes(id), id);
  }
  assert.match(leaf, /<SelectionToolbar/);
  assert.match(leaf, /runGridUniverCommand/);
});

test("the next-core leaf imports every OSS preset and zero watermark packages", () => {
  assert.equal(GRID_UNIVER_STAGE_OSS_SPECIFIERS.length, 12);
  for (const specifier of GRID_UNIVER_STAGE_OSS_SPECIFIERS) {
    assert.ok(
      leaf.includes(`"${specifier}`) || leaf.includes(`'${specifier}`),
      specifier,
    );
  }
  for (const css of GRID_UNIVER_STAGE_CSS_SPECIFIERS) {
    assert.ok(leaf.includes(css), css);
  }
  for (const pkg of UNIVER_WATERMARK_PRESETS) {
    assert.equal(leaf.includes(pkg), false, pkg);
    assert.equal(plan.includes(pkg), false, pkg);
  }
  assert.doesNotMatch(leafCode, /collaboration:\s*true/);
  assert.match(leaf, /UniverSheetsDrawingPreset\(\)/);
  assert.match(leaf, /createUniver/);
});

test("the live facade port refuses to run without a workbook", () => {
  assert.equal(univerFacadePortFromLive(null), null);
  assert.equal(univerFacadePortFromLive({}), null);
  const port = univerFacadePortFromLive({
    newDataValidation: () => ({
      requireValueInList() {
        return this;
      },
      requireNumberBetween() {
        return this;
      },
      requireNumberNotBetween() {
        return this;
      },
      requireNumberEqualTo() {
        return this;
      },
      requireNumberNotEqualTo() {
        return this;
      },
      requireNumberGreaterThan() {
        return this;
      },
      requireNumberLessThan() {
        return this;
      },
      requireNumberGreaterThanOrEqualTo() {
        return this;
      },
      requireNumberLessThanOrEqualTo() {
        return this;
      },
      requireDateBetween() {
        return this;
      },
      requireDateNotBetween() {
        return this;
      },
      requireDateEqualTo() {
        return this;
      },
      requireDateAfter() {
        return this;
      },
      requireDateBefore() {
        return this;
      },
      requireDateOnOrAfter() {
        return this;
      },
      requireDateOnOrBefore() {
        return this;
      },
      requireFormulaSatisfied() {
        return this;
      },
      setAllowInvalid() {
        return this;
      },
      build() {
        return {};
      },
    }),
    getActiveWorkbook: () => ({
      getActiveSheet: () => ({
        getSheetId: () => "s1",
        getSheetName: () => "Sheet1",
        getRange: () => ({
          setValue() {},
          getValue: () => null,
          setFontWeight() {},
          setFontColor() {},
          setBackgroundColor() {},
          setHorizontalAlignment() {},
          setNumberFormat() {},
          merge() {},
          breakApart() {},
          createFilter: () => null,
          getFilter: () => null,
          createConditionalFormattingRule: () => ({}),
          getConditionalFormattingRules: () => [],
          clearConditionalFormatRules() {},
          setDataValidation() {},
          getDataValidation() {},
          getValidatorStatus: async () => null,
        }),
        insertRowsBefore() {},
        insertRowsAfter() {},
        deleteRows() {},
        insertColumnsBefore() {},
        insertColumnsAfter() {},
        deleteColumns() {},
        sort() {},
        getSelection: () => ({
          getActiveRange: () => ({
            getRow: () => 2,
            getColumn: () => 3,
            getWidth: () => 2,
            getHeight: () => 1,
          }),
        }),
      }),
      insertSheet() {},
      undo() {},
      redo() {},
    }),
  });
  assert.ok(port);
  assert.equal(port.selection.startRow, 2);
  assert.equal(port.selection.startColumn, 3);
  assert.equal(port.selection.endColumn, 4);
});

// ── A-48：闸必须挂上分发口看节点，不能只扫 if 字面量 ─────────────────────
const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
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

const HOST_PAGE = "https://oceanleo.com/workspace";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST_PAGE,
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
  CustomEvent: window.CustomEvent,
  localStorage: window.localStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const nextMarkerUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function GridUniverStage(props) {
    return jsx("div", {
      "data-grid-univer-stage": "1",
      "data-item-id": props.item && props.item.id ? props.item.id : "",
    });
  }
`);
const loadingStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function WorkbenchRouteLoading() {
    return jsx("div", { "data-grid-route-loading": "1" });
  }
`);
const dynamicStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  import { useEffect, useState } from ${JSON.stringify(reactUrl)};
  export default function dynamic(loader) {
    const pending = Promise.resolve().then(() => loader()).then((loaded) => {
      if (typeof loaded === "function") return loaded;
      return loaded && loaded.default ? loaded.default : loaded;
    });
    return function DynamicLoaded(props) {
      const [Comp, setComp] = useState(null);
      useEffect(() => {
        let cancelled = false;
        pending.then((next) => {
          if (!cancelled && next) setComp(() => next);
        });
        return () => { cancelled = true; };
      }, []);
      return Comp ? jsx(Comp, props) : null;
    };
  }
`);

function gridItem() {
  return {
    key: "grid-gate",
    source: "artifact",
    id: "grid-gate",
    title: "闸",
    kind: "sheet",
    siteId: "website",
    favorite: false,
    meta: {},
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let routeModule;
async function loadGridRoute() {
  if (!routeModule) {
    const url = await compileModule(
      "src/shell/advanced-routes/GridRoute.tsx",
      {
        "next/dynamic": dynamicStubUrl,
        "../doc-editors/GridUniverStage": nextMarkerUrl,
        "./WorkbenchRouteLoading": loadingStubUrl,
      },
    );
    routeModule = await import(url);
  }
  return routeModule;
}

async function mountNode(node) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  await flush();
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("loadGridUniverStage 返回的是舞台组件，不是 null", async () => {
  const { loadGridUniverStage } = await loadGridRoute();
  const Stage = await loadGridUniverStage();
  assert.equal(typeof Stage, "function", "next 舞台加载函数 return null，翻 flag 用户得到空白页");
});

test("jsdom 挂上 GridRoute：不翻任何 flag，Univer 舞台就在树上并拿到 item", async () => {
  const { GridRoute } = await loadGridRoute();
  const { container, unmount } = await mountNode(
    React.createElement(GridRoute, { item: gridItem(), onClose() {} }),
  );
  try {
    const next = container.querySelector("[data-grid-univer-stage]");
    assert.ok(
      next,
      "GridRoute 没有挂上 Univer 舞台。旧核已删，这里 return null 用户就是空白页。",
    );
    assert.equal(next.getAttribute("data-item-id"), "grid-gate");
    assert.equal(container.querySelector("[data-grid-legacy]"), null);
  } finally {
    await unmount();
  }
});
