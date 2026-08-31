// ============================================================================
// 「重新计算」这个动作 —— A3 的铸戳点与 P4 增量重算的消费方，是同一个缺口
// ----------------------------------------------------------------------------
// V3 判 A3「部分」：引擎侧绿、编辑器侧红。W12 补完了引擎侧
// （`normalizeGridProjectSheetState` 开出 `options.recalc`，坏戳 fail-closed），
// 但端到端仍不通 —— `GridProject` 连 `recalc` 字段都没有，存盘也不写它，
// **工程档格式盛不下一个戳**，于是用户敲 `=TODAY()` 屏幕上还是错误值。
// 同一个缺口另一头是 P4：`recalcGridWorkbook` 能力面已绿，`src/` 零消费方。
//
// 所以这份测试**不判源码文本**。它把 `useGridEditor` 真渲染起来，
// 走用户那条路：打开一份工程档 → 看 A1 显示什么 → 点「重新计算」→ 再看 →
// 存盘 → 把存下来的字节当成下一次的工程档再打开一次。
// 「代码在 ≠ 用户能用」是本波的头号教训，判据得站在屏幕这一侧。
//
// 锁四件（任务书 P3）：
//   1. 存盘写了 `recalc`、读盘读得回来；
//   2. 旧文档（无 `recalc` 字段）读盘不炸，按无戳处理，且**不给它编一个**；
//   3. 点「重新计算」后戳更新，`TODAY()` 跟着走；
//   4. 同一份文档两次加载结果逐字相同（A3 的原始判据，别丢）。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { gridDateToSerial } from "../src/shell/doc-editors/grid-formula.ts";
import {
  gridRecalcSummary,
  mintGridRecalcStamp,
  recalcGridSheets,
} from "../src/shell/doc-editors/grid-recalc-action.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

/* ------------------------------ jsdom 宿主 ------------------------------- */
// `jsdom` 不是直接依赖，跟着 fabric 装进来。取法与
// `tests/rendition-callback-identity.test.mjs` 一致（canvas 的原生绑定绕开）。

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
  url: "https://excel.oceanleo.com/workspace",
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
  MouseEvent: window.MouseEvent,
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

/* ------------------------------ 被测编辑器 ------------------------------- */
// 只给网络与宿主渲染打桩。**`grid-model` / `grid-formula` / `grid-structure`
// 一律走真模块** —— 戳能不能从工程档走到画布上，正是这份测试要问的事，
// 把求值链换成替身就等于自己判自己绿。

globalThis.__gridProject = null;
globalThis.__gridSaved = [];

// 这个替身要跟 `useUI()` 的真实契约一样：未命中回退中文原文，**并且把插值位填上**。
//
// 原来它是 `(value) => value`，只收一个入参。`UITranslate` 的第二个入参是可选的，
// 所以少收一个在 TS 里**是合法赋值**，编译器一声不响；而 `gridRecalcSummary` 那句
// 回执带 `{cells}`／`{formulas}`。于是这个替身比产品更宽松：真的把 `{cells}`
// 四个字印到用户屏幕上，这份判据也照样绿。补上之后
// 「重算 \d+ 个格子」那条断言才真的在验一个数字。
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      let out = value;
      for (const [name, replacement] of Object.entries(vars)) {
        out = out.split("{" + name + "}").join(String(replacement));
      }
      return out;
    };
  }
`);

const docIoStubUrl = dataModule(`
  export function downloadBlob() {}
  export function downloadText() {}
  export function urlExtension(url) {
    const match = /\\.([a-z0-9]+)(?:[?#]|$)/i.exec(String(url || ""));
    return match ? match[1].toLowerCase() : "";
  }
  export async function loadEditorProject() {
    if (!globalThis.__gridProject) throw new Error("测试没有可编辑工程");
    return structuredClone(globalThis.__gridProject);
  }
  export async function saveFileToLibrary(input) {
    // 存盘要写进 sidecar 的那份 JSON。判据 1 判的就是它。
    globalThis.__gridSaved.push(structuredClone(input.project));
    return {
      ok: true,
      url: "https://cdn.test/saved.xlsx",
      versionId: "v-1",
      projectUrl: "https://cdn.test/saved.project.json",
      projectSchema: input.project.schema,
      title: input.title,
      fileName: "saved.xlsx",
      savedAt: "2026-08-31T00:00:00.000Z",
      artifactId: "artifact-1",
      revisionId: "revision-2",
      previousRevisionId: "revision-1",
    };
  }
`);

const previewRasterStubUrl = dataModule(`
  export async function renderGridPreviewPng() {
    return null;
  }
`);

const officeFileStubUrl = dataModule(`
  export function notifyOfficeAccessDenied() {}
  export async function fetchValidatedSpreadsheetSource() {
    throw new Error("测试不读远端表格");
  }
  export function validateOfficePackageBlob() {
    return { ok: true };
  }
  export function validateSpreadsheetParserBytes() {
    return { ok: true };
  }
`);

const STUBS = {
  "../../i18n/ui/useUI": uiStubUrl,
  "./doc-io": docIoStubUrl,
  "./editor-preview-raster": previewRasterStubUrl,
  "./office-file": officeFileStubUrl,
};

const { useGridEditor } = await import(
  await compileModule("src/shell/doc-editors/use-grid-editor.ts", STUBS)
);

/* -------------------------------- 夹具 ---------------------------------- */

/** 8/31 那一天。V3/W12 的读数 `46265` 就是这一天的序列号。 */
const AUGUST_31 = { at: "2026-08-31T00:00:00.000Z", seed: 12345 };
const SEPTEMBER_1 = { at: "2026-09-01T00:00:00.000Z", seed: 12345 };
const SERIAL_08_31 = gridDateToSerial(2026, 8, 31);
const SERIAL_09_01 = gridDateToSerial(2026, 9, 1);
/** 判据 3 的基线：必须离「今天」足够远，否则新旧戳算出同一个数，断言一致地绿。 */
const LONG_AGO = { at: "2001-02-03T04:05:06.000Z", seed: 12345 };
const SERIAL_LONG_AGO = gridDateToSerial(2001, 2, 3);

/** A1 是 `=TODAY()`，B1 读 A1 —— 下游跟不跟着走也要判。 */
function todaySheets() {
  return [
    {
      id: "sheet-1",
      name: "表一",
      rows: [["=TODAY()", "=A1+1", "5"]],
      formats: {},
      merges: [],
      conditionalFormats: [],
    },
  ];
}

function projectWith(recalc) {
  return {
    sheets: todaySheets(),
    activeSheetId: "sheet-1",
    headerRow: false,
    ...(recalc === undefined ? {} : { recalc }),
  };
}

function gridItem() {
  return {
    key: "artifact:grid",
    source: "artifact",
    id: "grid-1",
    title: "月度台账",
    kind: "sheet",
    siteId: "excel",
    favorite: false,
    url: "https://cdn.test/book.xlsx",
    artifactId: "artifact-1",
    revisionId: "revision-1",
    meta: {
      editor_project_url: "https://cdn.test/book.project.json",
      editor_project_schema: "oceanleo.grid.v1",
    },
  };
}

async function mountEditor(project) {
  globalThis.__gridProject = project;
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const seen = { current: null };

  function Probe() {
    seen.current = useGridEditor(gridItem(), "excel");
    return null;
  }

  await act(async () => {
    root.render(React.createElement(Probe));
  });
  // 载入是异步的（`loadEditorProject` → `applySnapshot`），让 microtask 排空。
  await act(async () => {
    await Promise.resolve();
  });

  return {
    get editor() {
      return seen.current;
    },
    /** 屏幕上 `第 row 行第 col 列` 那一格显示的字。走的是选区那条真实读值路径。 */
    async displayAt(row, col) {
      await act(async () => seen.current.selectCell({ row, col }));
      return seen.current.selectedDisplayValue;
    },
    async run(action) {
      let result;
      await act(async () => {
        result = await action(seen.current);
      });
      return result;
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/* ============================ 判据 2 —— 旧文档 ============================ */

test("判据 2：旧文档没有 recalc 字段，读盘不炸，按无戳处理（fail-closed）", async () => {
  const mounted = await mountEditor(projectWith(undefined));
  try {
    assert.equal(mounted.editor.loading, false, "旧文档把载入卡死了");
    assert.equal(mounted.editor.sourceFailed, false, "旧文档把载入判成失败了");
    const shown = await mounted.displayAt(0, 0);
    // 无戳 ⇒ volatile 拒绝。但落到格子里的必须是 Excel 错误值，
    // 不是 `grid-formula-nondeterministic` 那行 lint 码（W12 追记三）。
    assert.equal(shown, "#NAME?");
    assert.doesNotMatch(shown, /grid-formula-/, "拒绝码泄漏到了用户屏幕上");
  } finally {
    await mounted.unmount();
  }
});

test("判据 2 的另一半：无戳的旧文档存盘时不给它编一个戳出来", async () => {
  globalThis.__gridSaved.length = 0;
  const mounted = await mountEditor(projectWith(undefined));
  try {
    await mounted.run((editor) => editor.save());
    assert.equal(globalThis.__gridSaved.length, 1);
    const data = globalThis.__gridSaved[0].data;
    assert.equal(
      Object.hasOwn(data, "recalc"),
      false,
      "没戳的文档被存盘偷偷补了一个戳，那是在替用户决定「按哪一刻算」",
    );
  } finally {
    await mounted.unmount();
  }
});

test("坏戳与没戳同一个下场：缺 seed / 非 UTC / 非整数一律不当戳用", async () => {
  const broken = [
    { at: "2026-08-31T00:00:00.000Z" },
    { seed: 1 },
    { at: "2026-08-31T00:00:00.000+08:00", seed: 1 },
    { at: "2026-08-31T00:00:00.000Z", seed: 1.5 },
    { at: "2026-08-31T00:00:00.000Z", seed: -1 },
    { at: 1_756_598_400_000, seed: 1 },
    "2026-08-31",
  ];
  for (const recalc of broken) {
    globalThis.__gridSaved.length = 0;
    const mounted = await mountEditor(projectWith(recalc));
    try {
      assert.equal(
        await mounted.displayAt(0, 0),
        "#NAME?",
        `坏戳 ${JSON.stringify(recalc)} 被当成好戳用了`,
      );
      await mounted.run((editor) => editor.save());
      assert.equal(
        Object.hasOwn(globalThis.__gridSaved[0].data, "recalc"),
        false,
        `坏戳 ${JSON.stringify(recalc)} 被原样存回了工程档`,
      );
    } finally {
      await mounted.unmount();
    }
  }
});

/* ======================= 判据 4 —— 带戳打开、两次同值 ====================== */

test("判据 4：带戳打开 =TODAY() 屏幕上出结果，同一份文档两次加载逐字相同", async () => {
  const first = await mountEditor(projectWith(AUGUST_31));
  let firstShown;
  try {
    firstShown = await first.displayAt(0, 0);
    assert.equal(firstShown, String(SERIAL_08_31));
    assert.equal(firstShown, "46265", "8/31 的序列号与 V3/W12 的读数对不上");
    // 下游也要跟着走，否则戳只到了 volatile 那一格。
    assert.equal(await first.displayAt(0, 1), String(SERIAL_08_31 + 1));
  } finally {
    await first.unmount();
  }

  const second = await mountEditor(projectWith(AUGUST_31));
  try {
    assert.equal(
      await second.displayAt(0, 0),
      firstShown,
      "同一份文档两次加载给了不同的数 —— §5.4 确定性破了",
    );
  } finally {
    await second.unmount();
  }
});

test("证伪：戳挪一天，屏幕上的数正好跟着走一天（说明真在读戳）", async () => {
  const mounted = await mountEditor(projectWith(SEPTEMBER_1));
  try {
    const shown = await mounted.displayAt(0, 0);
    assert.equal(shown, String(SERIAL_09_01));
    assert.equal(
      Number(shown) - SERIAL_08_31,
      1,
      "戳挪了一天而数没跟着挪一天，那 46265 就是个巧合值",
    );
  } finally {
    await mounted.unmount();
  }
});

/* ==================== 判据 3 —— 点「重新计算」，戳更新 ==================== */

test("判据 3：点「重新计算」铸出新戳，TODAY() 跟着走到今天", async () => {
  globalThis.__gridSaved.length = 0;
  // 刻意用一个**很久以前**的戳，不用 AUGUST_31：这份测试今天跑在 2026-08-31，
  // 拿当天的戳当基线的话，「没铸新戳」与「铸了新戳」算出来是同一个数，
  // 屏幕那一半断言会一致地绿——那正是 W12 记下的「一致地坏也叫两次同值」陷阱。
  const mounted = await mountEditor(projectWith(LONG_AGO));
  try {
    assert.equal(await mounted.displayAt(0, 0), String(SERIAL_LONG_AGO));

    await mounted.run((editor) => editor.recalculate());

    const now = new Date();
    const todaySerial = gridDateToSerial(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
    );
    assert.equal(
      await mounted.displayAt(0, 0),
      String(todaySerial),
      "点了「重新计算」，格子里还是旧戳算出来的数",
    );
    assert.equal(await mounted.displayAt(0, 1), String(todaySerial + 1));

    // 戳真的换了一枚，而且是**新的那一枚**被存了下去。
    await mounted.run((editor) => editor.save());
    const saved = globalThis.__gridSaved.at(-1).data.recalc;
    assert.ok(saved, "重新计算之后存盘还是没写 recalc");
    assert.notEqual(
      saved.at,
      LONG_AGO.at,
      "「重新计算」没有铸新戳，把旧戳原样存了回去",
    );
    assert.match(saved.at, /Z$/);
    assert.equal(Number.isInteger(saved.seed), true);
  } finally {
    await mounted.unmount();
  }
});

test("重新计算把文档标脏（有新 revision 可存），空计划则不标脏", async () => {
  const volatileDoc = await mountEditor(projectWith(AUGUST_31));
  try {
    assert.equal(volatileDoc.editor.dirty, false, "刚载入就是脏的");
    await volatileDoc.run((editor) => editor.recalculate());
    assert.equal(volatileDoc.editor.dirty, true);
    assert.match(volatileDoc.editor.recalcSummary, /重算 \d+ 个格子/);
  } finally {
    await volatileDoc.unmount();
  }

  // 一张没有 volatile 公式的表：重算多少次结果都一样，
  // 为它造一个新 revision 只会让「未保存」的红点说谎。
  const flatDoc = await mountEditor({
    sheets: [
      {
        id: "sheet-1",
        name: "表一",
        rows: [["1", "=A1*2"]],
        formats: {},
        merges: [],
        conditionalFormats: [],
      },
    ],
    activeSheetId: "sheet-1",
  });
  try {
    await flatDoc.run((editor) => editor.recalculate());
    assert.equal(
      flatDoc.editor.dirty,
      false,
      "没有会随时间变的公式，重算却把文档标脏了",
    );
    assert.match(flatDoc.editor.recalcSummary, /不随时间变/);
  } finally {
    await flatDoc.unmount();
  }
});

/* ==================== 判据 1 —— 存盘写、读盘读得回来 ==================== */

test("判据 1：存盘写了 recalc，把存下来的工程档再打开一次，值不乱跳", async () => {
  globalThis.__gridSaved.length = 0;
  const first = await mountEditor(projectWith(undefined));
  let afterRecalc;
  let savedData;
  try {
    // 旧文档 → 点一次「重新计算」→ 存盘。这就是用户第一次让 TODAY() 活过来的路径。
    assert.equal(await first.displayAt(0, 0), "#NAME?");
    await first.run((editor) => editor.recalculate());
    afterRecalc = await first.displayAt(0, 0);
    assert.match(afterRecalc, /^\d+$/, "重新计算之后格子里仍不是一个数");

    await first.run((editor) => editor.save());
    savedData = globalThis.__gridSaved.at(-1).data;
    assert.ok(savedData.recalc, "存盘没有写 recalc，戳下次打开就没了");
    assert.equal(typeof savedData.recalc.at, "string");
    assert.equal(typeof savedData.recalc.seed, "number");
  } finally {
    await first.unmount();
  }

  // 读盘：把刚才那份 payload 原样当成工程档再打开一次。
  const second = await mountEditor(savedData);
  try {
    assert.equal(
      await second.displayAt(0, 0),
      afterRecalc,
      "存下来的戳读不回去 —— 关掉重开值就变了",
    );
  } finally {
    await second.unmount();
  }

  // 第三次打开还是同一个数：确定性不是「碰巧两次相同」。
  const third = await mountEditor(savedData);
  try {
    assert.equal(await third.displayAt(0, 0), afterRecalc);
  } finally {
    await third.unmount();
  }
});

test("崩溃恢复那条路也带着戳（restoreRecovery 与载入同口径）", async () => {
  const mounted = await mountEditor(projectWith(undefined));
  try {
    assert.equal(await mounted.displayAt(0, 0), "#NAME?");
    await mounted.run((editor) =>
      editor.restoreRecovery(projectWith(AUGUST_31)),
    );
    assert.equal(await mounted.displayAt(0, 0), String(SERIAL_08_31));
    // 坏戳在这条路上同样 fail-closed。
    await mounted.run((editor) =>
      editor.restoreRecovery(projectWith({ at: "昨天", seed: 1 })),
    );
    assert.equal(await mounted.displayAt(0, 0), "#NAME?");
  } finally {
    await mounted.unmount();
  }
});

test("编辑一格之后戳还在（登记跟着 cloneGridSheets 走）", async () => {
  const mounted = await mountEditor(projectWith(AUGUST_31));
  try {
    await mounted.run((editor) => editor.setCell(2, 0, "备注"));
    assert.equal(
      await mounted.displayAt(0, 0),
      String(SERIAL_08_31),
      "改了一格，戳就掉了 —— 编辑之后 TODAY() 又变回错误值",
    );
    await mounted.run((editor) => editor.undo());
    assert.equal(
      await mounted.displayAt(0, 0),
      String(SERIAL_08_31),
      "撤销一步把重算时刻也退回去了",
    );
  } finally {
    await mounted.unmount();
  }
});

/* =================== P4 消费方：增量计划本身的性质 =================== */

test("P4：重算的补丁里必须有 volatile 格自己，不只是它的下游", async () => {
  // `planGridRecalc(graph, changed)` 排的是 changed 的**下游**，不含 changed 自身。
  // 照 W12 追记四那段示例只调 `recalcGridWorkbook(ctx, graph, graph.volatileCells)`，
  // 拿到的补丁里没有 `=TODAY()` 那一格 —— 而那正是用户点按钮想看的地方。
  const outcome = recalcGridSheets(todaySheets(), AUGUST_31);
  assert.equal(outcome.patch.get("表一!0:0"), SERIAL_08_31);
  assert.equal(outcome.patch.get("表一!0:1"), SERIAL_08_31 + 1);
  assert.equal(outcome.volatileCells, 1);
  assert.equal(outcome.formulaCells, 2);
});

test("P4：增量而不是全表 —— 与 volatile 无关的公式不进补丁", async () => {
  const sheets = [
    {
      id: "sheet-1",
      name: "表一",
      rows: [
        ["=TODAY()", "=A1+1", "5"],
        ["7", "=A2*2", "=B2+1"],
      ],
      formats: {},
      merges: [],
      conditionalFormats: [],
    },
  ];
  const outcome = recalcGridSheets(sheets, AUGUST_31);
  assert.equal(outcome.formulaCells, 4);
  assert.deepEqual([...outcome.patch.keys()].sort(), ["表一!0:0", "表一!0:1"]);
  assert.equal(
    outcome.patch.has("表一!1:1"),
    false,
    "B2 跟戳无关，重算它就说明这不是增量",
  );
});

test("铸出来的戳形状必须过得了 normalizeGridRecalcStamp 那一关", async () => {
  const { normalizeGridRecalcStamp } = await import(
    "../src/shell/doc-editors/grid-model.ts"
  );
  for (let index = 0; index < 200; index += 1) {
    const stamp = mintGridRecalcStamp();
    assert.deepEqual(
      normalizeGridRecalcStamp(stamp),
      stamp,
      `铸出来的戳自己都过不了校验：${JSON.stringify(stamp)}`,
    );
  }
  // 边界：`Math.random()` 取到上确界时 seed 不许溢出 uint32。
  const top = mintGridRecalcStamp({ random: () => 0.999_999_999_999_999_9 });
  assert.equal(top.seed, 0xff_ff_ff_ff);
  assert.deepEqual(normalizeGridRecalcStamp(top), top);
  const bottom = mintGridRecalcStamp({ random: () => 0 });
  assert.equal(bottom.seed, 0);
  assert.deepEqual(normalizeGridRecalcStamp(bottom), bottom);
});

test("报数如实：空计划说「没有需要重算的」，不假装成功", async () => {
  const empty = recalcGridSheets(
    [
      {
        id: "s",
        name: "表一",
        rows: [["1", "2"]],
        formats: {},
        merges: [],
        conditionalFormats: [],
      },
    ],
    AUGUST_31,
  );
  assert.equal(empty.patch.size, 0);
  assert.equal(empty.formulaCells, 0);
  assert.match(gridRecalcSummary(empty), /还没有公式/);

  const flat = recalcGridSheets(
    [
      {
        id: "s",
        name: "表一",
        rows: [["1", "=A1*2"]],
        formats: {},
        merges: [],
        conditionalFormats: [],
      },
    ],
    AUGUST_31,
  );
  assert.equal(flat.patch.size, 0);
  assert.equal(flat.formulaCells, 1);
  assert.match(gridRecalcSummary(flat), /不随时间变/);
});
