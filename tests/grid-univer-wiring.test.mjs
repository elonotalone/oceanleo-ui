// 表格换核的接线闸（W03 · editor-core-swap）。
//
// 四份 `grid-univer-*.test.mjs` 判的是纯模块内容（preset 水印、chrome、命令表、
// 快照转换、L4 chips）。这一份判的是**接线**：那些模块有没有真被路由用上、
// 双核 flag 有没有在顶层判一次、专业模式走的是不是 `buildSetModeMessage` 校验
// 后的 chrome，而不是 postMessage。
//
// 为什么是读源码断言 + 真调用纯函数：接线错了的编辑器在单测里长得和接对了一样。
// 「真的画出一张 Univer 表」那半在浏览器里，归 V1（不许拿浏览器当验收）。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_EDITOR_CORE } from "../src/shell/editor-core-flags.ts";
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

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("grid"\) === "next"\)/);
  assert.doesNotMatch(route, /from "@univerjs\//);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/doc-editors\/GridUniverStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<GridUniverStage \{\.\.\.props\} \/>/);
  assert.match(route, /function GridLegacyRoute/);
  assert.match(route, /<GridStage editor=\{editor\} accent=\{accent\} \/>/);
  assert.match(route, /useGridEditor/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
});

test("professional mode uses buildSetModeMessage without postMessage, and does not dispose", () => {
  assert.equal(GRID_UNIVER_DEFAULT_MODE, "normal");
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(plan, /buildSetModeMessage/);
  assert.match(leaf, /applyGridUniverMode/);
  assert.match(leaf, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
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

  assert.equal((leaf.match(/univer\.dispose/g) || []).length, 1);
  assert.match(leaf, /return \(\) => \{\s*created\.univer\.dispose\(\);/);
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
