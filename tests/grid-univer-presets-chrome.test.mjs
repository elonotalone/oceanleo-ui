/**
 * W03 判据 1/2 —— Univer preset 清单（A-13 水印守卫）与 L0/L3 chrome 开关。
 *
 * 这份闸守的是两件「错了只有用户看得见」的事：
 * ① 引到 Pro preset ⇒ 产品带水印、导入受限，构建不会失败；
 * ② 普通模式没关掉 ribbon/公式栏 ⇒ R3「默认普通模式」当场破功，而截图之外没人拦。
 *
 * 判据文件本身会被 Tailwind 自动内容探测扫进产物（`_COMMON.md` §7b⑧ 的 37 条），
 * 所以下面**不举任何真实 CSS 类名当例子**。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UNIVER_PINNED_VERSION,
  UNIVER_PRESETS_META_PACKAGE,
  UNIVER_SERVER_ONLY_PRESETS,
  UNIVER_SHEETS_OSS_PRESETS,
  UNIVER_WATERMARK_PRESETS,
  isAllowedUniverSpecifier,
  isWatermarkPreset,
} from "../src/shell/doc-editors/grid-univer/presets.ts";
import {
  GRID_UNIVER_DEFAULT_MODE,
  GRID_UNIVER_MODE_INVARIANTS,
  gridUniverChrome,
  gridUniverModeDrift,
} from "../src/shell/doc-editors/grid-univer/chrome.ts";

test("W01-deps 锁的那 11 个 OSS preset 一个不多一个不少，且版本钉死", () => {
  assert.equal(UNIVER_SHEETS_OSS_PRESETS.length, 11);
  assert.equal(UNIVER_PINNED_VERSION, "0.25.1");
  // 每一个都必须是 @univerjs/preset-sheets-* 形状；元包不在这张表里。
  for (const pkg of UNIVER_SHEETS_OSS_PRESETS) {
    assert.match(pkg, /^@univerjs\/preset-sheets-[a-z-]+$/);
  }
  assert.equal(
    UNIVER_SHEETS_OSS_PRESETS.includes(UNIVER_PRESETS_META_PACKAGE),
    false,
  );
});

test("两个 Pro preset 判为水印态，含元包 subpath 那条真实存在的绕路", () => {
  for (const pkg of UNIVER_WATERMARK_PRESETS) {
    assert.equal(isWatermarkPreset(pkg), true, pkg);
    assert.equal(isWatermarkPreset(`${pkg}/lib/index.js`), true, pkg);
    assert.equal(isAllowedUniverSpecifier(pkg), false, pkg);
  }
  // 元包 exports 里真的有这条路径，只查顶层包名会漏掉它。
  assert.equal(
    isWatermarkPreset("@univerjs/presets/preset-sheets-advanced"),
    true,
  );
  assert.equal(
    isAllowedUniverSpecifier("@univerjs/presets/preset-sheets-advanced"),
    false,
  );
});

test("OSS preset 与元包放行；服务端专用包不算水印但也不该在浏览器里用", () => {
  assert.equal(isAllowedUniverSpecifier(UNIVER_PRESETS_META_PACKAGE), true);
  for (const pkg of UNIVER_SHEETS_OSS_PRESETS) {
    assert.equal(isAllowedUniverSpecifier(pkg), true, pkg);
  }
  for (const pkg of UNIVER_SERVER_ONLY_PRESETS) {
    assert.equal(isWatermarkPreset(pkg), false, pkg);
  }
  assert.equal(isAllowedUniverSpecifier(""), false);
  assert.equal(isAllowedUniverSpecifier("   "), false);
});

test("判据 1：普通模式下 ribbon / 公式栏 / 状态栏统计全关", () => {
  assert.equal(GRID_UNIVER_DEFAULT_MODE, "normal");
  const normal = gridUniverChrome("normal");
  assert.equal(normal.header, false);
  assert.equal(normal.toolbar, false);
  assert.equal(normal.formulaBar, false);
  assert.equal(normal.statusBarStatistic, false);
});

test("普通模式保留页脚与右键菜单——藏深功能不等于删能力", () => {
  const normal = gridUniverChrome("normal");
  // 页脚里有工作表标签：关掉它多表工作簿就换不了表，那是能力丢失。
  assert.equal(normal.footer, true);
  // 右键菜单是选中对象后的直接动作（L1 语义），不是内核完整 UI。
  assert.equal(normal.contextMenu, true);
});

test("判据 3：专业模式把 ribbon / 公式栏打开，页脚与右键菜单不受影响", () => {
  const pro = gridUniverChrome("pro");
  assert.equal(pro.header, true);
  assert.equal(pro.toolbar, true);
  assert.equal(pro.formulaBar, true);
  assert.equal(pro.statusBarStatistic, true);
  assert.equal(pro.footer, true);
  assert.equal(pro.contextMenu, true);
});

test("判据 3：切模式的状态指纹逐字相等 = 状态没丢，不相等要点名丢了哪一项", () => {
  const before = {
    workbookId: "wb-1",
    activeSheetId: "sheet-1",
    selection: "A1:B2",
    editRevision: 7,
    undoDepth: 3,
  };
  assert.deepEqual(gridUniverModeDrift(before, { ...before }), []);
  // 返回差异项而不是布尔：丢的是选区还是撤销栈，处理方式完全不同。
  assert.deepEqual(gridUniverModeDrift(before, { ...before, undoDepth: 0 }), [
    "undoDepth",
  ]);
  assert.deepEqual(
    gridUniverModeDrift(before, {
      ...before,
      selection: "A1",
      editRevision: 8,
    }),
    ["selection", "editRevision"],
  );
  // 五项都在表里，漏一项等于那一项切模式时可以随便丢。
  assert.deepEqual([...GRID_UNIVER_MODE_INVARIANTS], [
    "workbookId",
    "activeSheetId",
    "selection",
    "editRevision",
    "undoDepth",
  ]);
});
