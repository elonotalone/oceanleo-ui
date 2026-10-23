/**
 * W10（2026-10-23 编辑器整改）表格「编辑」页：
 * - 统一文字栏用规范 id、按 §4 顺序，值跟着当前格子；
 * - 新控件都落到真 Facade 写口（下划线 / 删除线一次点击一条撤销记录）；
 * - 「本人改动」= 撤销栈栈顶变了（格子里打字也触发保存，公式回写 / 换簿不触发）；
 * - 深色只换画布默认色，用户设的颜色原样；有浅色填充的格子里默认黑字留黑；
 * - 普通模式舞台给停靠编辑栏让出上边距，栏不盖列头。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  GRID_DEFAULT_TEXT_STYLE,
  GRID_TEXT_BAR_IDS,
  gridBorderState,
  gridCellTextStyleFromStyleData,
  gridTextBarControls,
} from "../src/shell/doc-editors/grid-univer/text-bar.ts";
import { runGridUniverCommand, gridUniverCommand } from "../src/shell/doc-editors/grid-univer/facade-commands.ts";
import { gridUniverSelectionContext } from "../src/shell/doc-editors/grid-univer/stage-plan.ts";
import { createGridEditWatch } from "../src/shell/doc-editors/grid-univer/edit-watch.ts";
import {
  GRID_DARK_CANVAS,
  GRID_DARK_STAGE_CSS,
  gridCellFillAt,
  gridDarkCanvasColor,
  gridDarkFillColor,
  gridDarkKeepBlackOn,
  installGridDarkBackgroundPass,
  installGridDarkCanvas,
  installGridDarkFontFill,
} from "../src/shell/doc-editors/grid-univer/dark-canvas.ts";
import { GRID_NORMAL_EDIT_BAR_INSET_PX, gridStageTopInset } from "../src/shell/doc-editors/grid-univer/chrome.ts";
import { gridNumberTypeFromPattern, readGridSelectionStyle } from "../src/shell/doc-editors/grid-univer/selection-style.ts";

const tt = (zh) => zh;

test("文字栏：规范 id、§4 顺序在前，表格特有控件在后，不出 list / line-height", () => {
  const ids = gridTextBarControls(GRID_DEFAULT_TEXT_STYLE, tt).map((c) => c.id);
  assert.deepEqual(ids.slice(0, GRID_TEXT_BAR_IDS.length), [...GRID_TEXT_BAR_IDS]);
  assert.deepEqual(GRID_TEXT_BAR_IDS, [
    "font-family", "font-size", "bold", "italic", "underline", "strike", "text-color", "highlight", "align",
  ]);
  assert.ok(!ids.includes("list") && !ids.includes("line-height"));
  assert.ok(ids.indexOf("grid-valign") > ids.indexOf("align"));
  // 单个普通格子不出合并（点了没效果 = 死按钮）。
  assert.ok(!ids.includes("merge-cells"));
});

test("文字栏的值跟着当前格子（Univer IStyleData → 栏）", () => {
  const style = gridCellTextStyleFromStyleData(
    {
      ff: "Calibri", fs: 14, bl: 1, it: 0, ul: { s: 1 }, st: { s: 0 },
      cl: { rgb: "#C00000" }, bg: { rgb: "rgb(255,255,0)" }, ht: 2, vt: 1, tb: 3,
      bd: { t: { s: 1 }, b: { s: 1 }, l: { s: 1 }, r: { s: 1 } },
    },
    { multiCell: true },
  );
  const byId = Object.fromEntries(gridTextBarControls(style, tt).map((c) => [c.id, c]));
  assert.equal(byId["font-family"].value, "Calibri");
  assert.ok(byId["font-family"].options.some((o) => o.value === "Calibri"), "文件里的字体名要能显示");
  assert.equal(byId["font-size"].value, 14);
  assert.equal(byId.bold.value, true);
  assert.equal(byId.italic.value, false);
  assert.equal(byId.underline.value, true);
  assert.equal(byId["text-color"].value, "#c00000");
  assert.equal(byId.highlight.value, "#ffff00");
  assert.equal(byId.align.value, "center");
  assert.equal(byId["grid-valign"].value, "top");
  assert.equal(byId["grid-wrap"].value, true);
  assert.equal(byId["grid-border"].value, "all");
  assert.equal(byId["merge-cells"].value, false);
  const merged = gridTextBarControls({ ...style, merged: true }, tt).find((c) => c.id === "merge-cells");
  assert.equal(merged.value, true);
  assert.equal(merged.label, "取消合并");
  assert.equal(gridBorderState({ b: { s: 1 } }), "bottom");
  assert.equal(gridBorderState(null), "none");
});

test("选区上下文：真实选区与当前样式进上下文，且声明 bar 之前也能单独用", () => {
  const context = gridUniverSelectionContext({
    selection: { startRow: 1, endRow: 3, startColumn: 0, endColumn: 0 },
    style: { bold: true },
    numberType: "percent",
  });
  assert.equal(context.id, "cell:sheet:1:0");
  const bold = context.controls.find((c) => c.id === "bold");
  assert.equal(bold.value, true);
  assert.ok(context.controls.some((c) => c.id === "merge-cells"), "多格选区出合并开关");
  assert.equal(context.controls.find((c) => c.id === "type").value, "percent");
  const icons = context.controls.filter((c) => c.icon && !c.slot && c.placement !== "more").map((c) => c.icon);
  assert.equal(new Set(icons).size, icons.length, "同一条栏里不许有两个一样的图标");
});

function port() {
  const calls = [];
  const rec = (name) => (...args) => {
    calls.push([name, ...args]);
    return name;
  };
  const range = new Proxy({}, { get: (_t, prop) => rec(`range.${String(prop)}`) });
  return {
    calls,
    port: {
      api: { newDataValidation() {} },
      workbook: {},
      sheet: { getSheetId: () => "s1" },
      range,
      selection: { startRow: 2, endRow: 3, startColumn: 1, endColumn: 1 },
      unitId: "u1",
      execute: rec("execute"),
    },
  };
}

test("新控件落到 Facade：字体、字号（钳到范围）、斜体、垂直对齐、换行、边框、清除格式", () => {
  const { calls, port: p } = port();
  runGridUniverCommand("font-family", p, { value: "SimSun" });
  runGridUniverCommand("font-size", p, { value: 400 });
  runGridUniverCommand("italic", p, { on: true });
  runGridUniverCommand("italic", p, { on: false });
  runGridUniverCommand("grid-valign", p, { value: "middle" });
  runGridUniverCommand("grid-wrap", p, { on: false });
  runGridUniverCommand("grid-border", p, { value: "outside" });
  runGridUniverCommand("grid-border", p, { value: "none" });
  runGridUniverCommand("clear-format", p, {});
  runGridUniverCommand("merge-cells", p, { on: false });
  assert.deepEqual(calls, [
    ["range.setFontFamily", "SimSun"],
    ["range.setFontSize", 96],
    ["range.setFontStyle", "italic"],
    ["range.setFontStyle", "normal"],
    ["range.setVerticalAlignment", "middle"],
    ["range.setWrap", false],
    ["range.setBorder", "outside", 1, "#000000"],
    ["range.setBorder", "none", 0, undefined],
    ["range.clearFormat"],
    ["range.breakApart"],
  ]);
});

test("下划线 / 删除线各自开关：一条 set-style 命令，只动自己那条线", () => {
  const { calls, port: p } = port();
  runGridUniverCommand("underline", p, { on: false });
  runGridUniverCommand("strike", p, { on: true });
  assert.deepEqual(calls.map((c) => [c[0], c[1], c[2].style]), [
    ["execute", "sheet.command.set-style", { type: "ul", value: { s: 0 } }],
    ["execute", "sheet.command.set-style", { type: "st", value: { s: 1 } }],
  ]);
  assert.deepEqual(calls[0][2].range, { startRow: 2, endRow: 3, startColumn: 1, endColumn: 1 });
});

test("旧 id 经别名落到规范执行器：color → text-color，background → highlight", () => {
  assert.equal(gridUniverCommand("color").id, "text-color");
  assert.equal(gridUniverCommand("background").id, "highlight");
});

function fakeUndo() {
  const undo = [];
  const redo = [];
  return {
    undo,
    redo,
    service: {
      pitchTopUndoElement: () => undo[undo.length - 1] ?? null,
      pitchTopRedoElement: () => redo[redo.length - 1] ?? null,
    },
  };
}

test("本人改动 = 撤销栈栈顶变了：打字算、公式回写不算、换簿不算、栈满仍算", () => {
  const stack = fakeUndo();
  let writes = 0;
  const history = [];
  const watch = createGridEditWatch({
    undo: stack.service,
    onPersonWrite: () => (writes += 1),
    onHistory: (s) => history.push(s),
  });
  assert.equal(watch.observe(), false, "打开后什么都没做");
  stack.undo.push({ id: "type-A1" });
  assert.equal(watch.observe(), true, "格子里打字进了撤销栈");
  assert.equal(watch.observe(), false, "公式回写 / 选区变化：栈没动");
  // 栈满：长度不变，但栈顶换成新对象。
  stack.undo.shift();
  stack.undo.push({ id: "type-A2" });
  assert.equal(watch.observe(), true);
  // 撤销：栈顶移到重做栈。
  stack.redo.push(stack.undo.pop());
  assert.equal(watch.observe(), true);
  assert.deepEqual(history.at(-1), { canUndo: false, canRedo: true });
  // 换簿：两栈都空，不算改动。
  stack.redo.length = 0;
  assert.equal(watch.observe(), false);
  assert.equal(writes, 3);
});

test("只读时栈动了也不算本人改动（不会开自动保存）", () => {
  const stack = fakeUndo();
  let writes = 0;
  const watch = createGridEditWatch({
    undo: stack.service,
    onPersonWrite: () => (writes += 1),
    onHistory() {},
    blocked: () => true,
  });
  stack.undo.push({});
  watch.observe();
  assert.equal(writes, 0);
});

test("image Undo publishes its late native stack move, without duplicate writes or post-dispose listeners", () => {
  const stack = fakeUndo();
  stack.undo.push({ id: 'insert-image' });
  const listeners = new Set();
  const commands = new Set();
  stack.service.undoRedoStatus$ = { subscribe: callback => {
    listeners.add(callback);
    return { unsubscribe: () => listeners.delete(callback) };
  } };
  let writes = 0, blocked = false;
  const history = [];
  const watch = createGridEditWatch({
    undo: stack.service,
    events: { onCommandExecuted: callback => { commands.add(callback); return { dispose: () => commands.delete(callback) }; } },
    onPersonWrite: () => writes++, onHistory: state => history.push(state), blocked: () => blocked,
  });
  // Real image Undo finishes its final mutation before popUndoToRedo emits
  // undoRedoStatus$. No later CommandExecuted event is guaranteed.
  for (const callback of commands) callback({ id: 'drawing.mutation.apply' });
  stack.redo.push(stack.undo.pop());
  for (const callback of listeners) callback({ undos: 0, redos: 1 });
  assert.deepEqual(history.at(-1), { canUndo: false, canRedo: true });
  assert.equal(writes, 1);
  for (const callback of listeners) callback({ undos: 0, redos: 1 });
  assert.equal(writes, 1, 'duplicate status notifications do not duplicate an edit');
  blocked = true;
  stack.undo.push(stack.redo.pop());
  for (const callback of listeners) callback({ undos: 1, redos: 0 });
  assert.deepEqual(history.at(-1), { canUndo: true, canRedo: false });
  assert.equal(writes, 1, 'readonly/initial-sync gate remains authoritative');
  watch.dispose();
  assert.equal(commands.size, 0);
  assert.equal(listeners.size, 0);
});

test("深色画布：默认黑字变浅、表头和网格线变深，用户色原样", () => {
  assert.equal(gridDarkCanvasColor("rgb(0,0,0)"), GRID_DARK_CANVAS.text);
  assert.equal(gridDarkCanvasColor("#000000"), GRID_DARK_CANVAS.text);
  assert.equal(gridDarkCanvasColor("#fff"), GRID_DARK_CANVAS.cell);
  assert.equal(gridDarkCanvasColor("rgb(248,249,250)"), GRID_DARK_CANVAS.headerBackground);
  assert.equal(gridDarkCanvasColor("rgb(214,216,219)"), GRID_DARK_CANVAS.gridline);
  for (const user of ["#FFFF00", "#1f4e79", "#C00000", "rgb(198,239,206)"]) {
    assert.equal(gridDarkCanvasColor(user), user, `${user} 是用户设的颜色，不许改`);
  }
});

test("深色画布装进颜色服务：浅色透传，深色只换默认色，主题 token 交回原实现", () => {
  let dark = false;
  const service = { getRenderColor: (c) => (c === "primary.600" ? "#2563eb" : `inverted(${c})`) };
  const uninstall = installGridDarkCanvas(service, () => dark);
  assert.equal(service.getRenderColor("#000000"), "#000000");
  dark = true;
  assert.equal(service.getRenderColor("#000000"), GRID_DARK_CANVAS.text);
  assert.equal(service.getRenderColor("#ffff00"), "#ffff00");
  assert.equal(service.getRenderColor("primary.600"), "#2563eb");
  assert.equal(service.getRenderColor("transparent"), "transparent");
  uninstall();
  assert.equal(service.getRenderColor("#ffff00"), "inverted(#ffff00)");
});

test("数字类型跟着格式串；读不到工作簿时返回 null 而不是抛", () => {
  assert.equal(gridNumberTypeFromPattern(""), "auto");
  assert.equal(gridNumberTypeFromPattern("@"), "text");
  assert.equal(gridNumberTypeFromPattern("#,##0.00"), "number");
  assert.equal(gridNumberTypeFromPattern("¥#,##0.00"), "currency");
  assert.equal(gridNumberTypeFromPattern("0.0%"), "percent");
  assert.equal(gridNumberTypeFromPattern("yyyy-mm-dd"), "date");
  assert.equal(readGridSelectionStyle(null), null);
  const read = readGridSelectionStyle({
    getActiveWorkbook: () => ({
      getActiveSheet: () => ({
        getSheetId: () => "s9",
        getSelection: () => ({
          getActiveRange: () => ({
            getRow: () => 4, getColumn: () => 2, getWidth: () => 2, getHeight: () => 1,
            getCellStyleData: () => ({ bl: 1, n: { pattern: "0%" } }),
            isMerged: () => false,
          }),
        }),
      }),
    }),
  });
  assert.equal(read.style.bold, true);
  assert.equal(read.style.multiCell, true);
  assert.equal(read.numberType, "percent");
  assert.deepEqual(read.selection, { startRow: 4, endRow: 4, startColumn: 2, endColumn: 3 });
});

test("深色：浅色填充上的默认黑字留黑，深色填充 / 白底（画成深格）/ 无填充换浅字", () => {
  // 开发槽实测（R2）：黄底「Travel」、浅绿底「due」在深色下是浅字压浅底，看不清。
  for (const fill of ["#FFFF00", "rgb(198,239,206)", "#d9d9d9"]) {
    assert.equal(gridDarkKeepBlackOn(fill), true, `${fill} 上黑字更清楚`);
    assert.equal(gridDarkCanvasColor("rgb(0,0,0)", fill), "rgb(0,0,0)");
  }
  for (const fill of ["#1f4e79", "#C00000", "#ffffff", "rgba(255,255,0,0)", null]) {
    assert.equal(gridDarkKeepBlackOn(fill), false, `${fill} 上该用浅字`);
    assert.equal(gridDarkCanvasColor("rgb(0,0,0)", fill), GRID_DARK_CANVAS.text);
  }
  // 用户自己设的非黑字色在任何底上都原样。
  assert.equal(gridDarkCanvasColor("#C00000", "#FFFF00"), "#C00000");
  // 用户填充画法：白底 = 默认底换深格，其它（含与表头边同值的 Excel 灰 #D9D9D9）原样。
  assert.equal(gridDarkFillColor("#ffffff"), GRID_DARK_CANVAS.cell);
  assert.equal(gridDarkFillColor("rgb(217,217,217)"), "rgb(217,217,217)");
});

test("深色：背景扩展这一趟里每一笔都是用户填充，原样画（白底除外），画完复位", () => {
  const service = { getRenderColor: (c) => `inverted(${c})` };
  const offColor = installGridDarkCanvas(service, () => true);
  const drawn = [];
  const bg = {
    draw() {
      for (const c of ["#d9d9d9", "#FFFF00", "rgb(255,255,255)"]) drawn.push(service.getRenderColor(c));
    },
  };
  const off = installGridDarkBackgroundPass(bg, () => true);
  bg.draw();
  assert.deepEqual(drawn, ["#d9d9d9", "#FFFF00", GRID_DARK_CANVAS.cell]);
  // 趟外：#d9d9d9 仍是表头边，照常换深。
  assert.equal(service.getRenderColor("#d9d9d9"), GRID_DARK_CANVAS.headerBorder);
  off();
  assert.equal(Object.prototype.hasOwnProperty.call(bg, "draw"), true);
  offColor();
});

test("深色：字体扩展逐格画字时把填充交给取色层，画完复位；浅色不查；只包一次、可卸载", () => {
  let dark = true;
  const service = { getRenderColor: (c) => `inverted(${c})` };
  const offColor = installGridDarkCanvas(service, () => dark);
  const matrix = (cells) => ({ getValue: (r, c) => cells[`${r}:${c}`] });
  const skeleton = { stylesCache: { background: { "#FFFF00": matrix({ "2:0": "#FFFF00" }), "#1f4e79": matrix({ "0:0": "#1f4e79" }) } } };
  assert.equal(gridCellFillAt(skeleton, 2, 0), "#FFFF00");
  assert.equal(gridCellFillAt(skeleton, 5, 5), null);
  const seen = [];
  const ext = {
    _renderFontEachCell(ctx, row, col) {
      seen.push(service.getRenderColor("rgb(0,0,0)"));
      return `${row}:${col}`;
    },
  };
  const offFont = installGridDarkFontFill(ext, () => dark);
  assert.equal(installGridDarkFontFill(ext, () => dark), offFont, "同一扩展不许包两层");
  const ctx = { spreadsheetSkeleton: skeleton };
  assert.equal(ext._renderFontEachCell(ctx, 2, 0), "2:0");
  ext._renderFontEachCell(ctx, 0, 0);
  ext._renderFontEachCell(ctx, 5, 5);
  assert.deepEqual(seen, ["rgb(0,0,0)", GRID_DARK_CANVAS.text, GRID_DARK_CANVAS.text]);
  // 画完复位：格子外（选区、表头）的黑色照常换浅。
  assert.equal(service.getRenderColor("rgb(0,0,0)"), GRID_DARK_CANVAS.text);
  dark = false;
  ext._renderFontEachCell(ctx, 2, 0);
  assert.equal(seen.at(-1), "rgb(0,0,0)");
  offFont();
  assert.equal(Object.prototype.hasOwnProperty.call(ext, "_renderFontEachCell"), true, "自有方法卸载后还原");
  offColor();
  assert.equal(installGridDarkFontFill(null, () => true)(), undefined);
});

test("普通模式舞台给停靠编辑栏让出上边距（栏不盖列头），专业模式不留", () => {
  assert.ok(GRID_NORMAL_EDIT_BAR_INSET_PX >= 41, "实测栏底边在舞台顶 +41px");
  assert.equal(gridStageTopInset("normal"), GRID_NORMAL_EDIT_BAR_INSET_PX);
  assert.equal(gridStageTopInset("pro"), 0);
  const stage = readFileSync(new URL("../src/shell/doc-editors/GridUniverStage.tsx", import.meta.url), "utf8");
  assert.match(stage, /style=\{\{\s*paddingTop:\s*gridStageTopInset\(mode\)\s*\}\}/);
  assert.match(stage, /renderManager:\s*IRenderManagerService/);
  // 让出的那一条在深色下与格子同色。
  assert.match(GRID_DARK_STAGE_CSS, /:has\(> \[data-grid-univer-stage\]\[data-grid-univer-theme="dark"\]\)/);
});
