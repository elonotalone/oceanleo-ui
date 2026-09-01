// ============================================================================
// 装戳是**双锚**的 —— 这份判据分别钉住那两条路，摘掉任一条都当场红
// ----------------------------------------------------------------------------
// 为什么要新开一份（`V3` 裁决 §8.3，2026-08-31）
//
// 用户打开表格、`=TODAY()` 在屏幕上出数，靠的是「重算戳登记到工作簿上」这件事。
// 今天有**两条**路各自把戳装上去，彼此冗余：
//
//   A（`W12`）`use-grid-editor.ts` 的载入路径把 `{ recalc: project.recalc }`
//      传给 `normalizeGridProjectSheetState`，函数内部 `bindGridWorkbook` 登记一次；
//   B（`W32`）`applySnapshot` 在每次 `cloneGridSheets` 之后，
//      按 `recalcRef.current` **重新登记一次**。
//
// `V3` 的双向证伪（实测）：只摘 A → `grid-recalc-action` 那 14 例 **14/14 全绿**；
// 只摘 B → 12 绿 / 2 红。⇒ **冗余是有意的**（`V3` 定案：不是缺陷），
// 但它也意味着：谁哪天「顺手清理」掉 A，全量一声不响；
// 而 A 正是 `normalizeGridProjectSheetState` 这个**公共函数**的调用边——
// 不经 `applySnapshot` 的调用方只有它管得着。
//
// ── 这份判据为什么必须观测运行期数据流，而不是「屏幕上出不出数」──────────
//
// **载入那一刻，两条路在行为上互相区分不出来。** 三个机制叠在一起：
//   · 两者读的是同一个 `project.recalc`，走的是同一个 `normalizeGridRecalcStamp`；
//   · `cloneGridSheets` 会从来源那本工作簿**继承**戳；
//   · B 的守卫 `if (recalcRef.current)` 与 A 的入参同源同值。
// 所以「打开文档看 A1 显示什么」这种判据，摘掉任一条都照样绿——
// `V3` 的 14/14 就是这么来的，那不是判据松，是**这个观测点分辨不出两条路**。
//
// ⇒ 这里换观测点：把 `./grid-model` 换成**包着真模块的记录器**（真实现一行不改，
// 只在进出口记一笔），于是「戳是谁装上去的」变成可断言的运行期事实：
//   · 锚点 A 可见 = `normalizeGridProjectSheetState` 收到了带戳的第三个入参，
//     **并且它的返回值在 `applySnapshot` 还没跑之前就已经出数**；
//   · 锚点 B 可见 = hook **直接**调了一次 `bindGridWorkbook`（不是经由
//     `normalizeGridProjectSheetState` 内部那次），且被登记的正是当前这一枚戳。
// 两个观测点互不重叠：摘 A 只让 A 那组红，摘 B 只让 B 那组红（双向反面验证见
// `verdicts/W47-delivery.md` §①）。
//
// ⚠️ 这份判据锁的是「**两条都在**」，不是逼谁去删一条（`V3` 定案）。
//    真要合并成一条路，得先让判据跟着改，并在这里写明为什么只剩一条也够。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { gridDateToSerial } from "../src/shell/doc-editors/grid-formula.ts";
import { gridDisplayValue } from "../src/shell/doc-editors/grid-model.ts";

import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";

/* ------------------------------ jsdom 宿主 ------------------------------- */
// 取法与 `tests/grid-recalc-action.test.mjs` 一致：`jsdom` 跟着 fabric 装进来，
// canvas 的原生绑定要绕开，否则 require 它会炸。

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

/* --------------------------- grid-model 记录器 --------------------------- */
// **真模块一行不改**：`export *` 把它整份透出去，只把两个函数换成包装版。
// 包装版做两件事：记一笔调用，以及**在返回的那一刻**就地问一句「这本工作簿出数了吗」。
// 后者是关键：等到 `applySnapshot` 跑完再问，问到的是两条路叠加之后的结果，
// 分不出是谁装的——那正是 `V3` 14/14 的成因。
//
// ⚠️ 记录器只包 hook 那一侧的调用边。`normalizeGridProjectSheetState` 内部
// 对 `bindGridWorkbook` 的调用是 grid-model 的**模块内私有调用**，走不到这里，
// 所以「A 的登记」与「B 的登记」天然分得开，不需要靠调用栈猜。

globalThis.__stampCalls = { normalize: [], bind: [] };

const gridModelSpyUrl = dataModule(`
  import * as real from ${JSON.stringify(
    realModule("src/shell/doc-editors/grid-model.ts"),
  )};

  export * from ${JSON.stringify(
    realModule("src/shell/doc-editors/grid-model.ts"),
  )};

  /** 这本工作簿现在出不出数？volatile 那一格显示的字就是答案。 */
  function volatileReading(sheets) {
    if (!Array.isArray(sheets) || !sheets.length) return "";
    try {
      return real.gridDisplayValue(sheets[0], 0, 0);
    } catch (caught) {
      return "throw:" + caught.message;
    }
  }

  export function normalizeGridProjectSheetState(value, activeSheetId, options) {
    const state = real.normalizeGridProjectSheetState(value, activeSheetId, options);
    globalThis.__stampCalls.normalize.push({
      // 三个入参的位置本身也是判据的一部分：签名从两个变三个正是 W12 补的那一手。
      arity: arguments.length,
      recalcArgument: options === undefined ? undefined : options.recalc,
      // 返回值这一刻已经出数了吗？A 装上了才会出数，此时 B 还没跑。
      readingAtReturn: volatileReading(state.sheets),
    });
    return state;
  }

  export function bindGridWorkbook(sheets, options) {
    const bound = real.bindGridWorkbook(sheets, options);
    globalThis.__stampCalls.bind.push({
      recalcArgument: options === undefined ? undefined : options.recalc,
      readingAtReturn: volatileReading(bound),
    });
    return bound;
  }
`);

/* ------------------------------ 被测编辑器 ------------------------------- */
// 网络与宿主渲染打桩；求值链（`grid-formula` / `grid-structure`）一律真模块。

globalThis.__gridProject = null;
globalThis.__gridSaved = [];

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

const { useGridEditor } = await import(
  await compileModule("src/shell/doc-editors/use-grid-editor.ts", {
    "../../i18n/ui/useUI": uiStubUrl,
    "./doc-io": docIoStubUrl,
    "./editor-preview-raster": previewRasterStubUrl,
    "./office-file": officeFileStubUrl,
    "./grid-model": gridModelSpyUrl,
  })
);

/* -------------------------------- 夹具 ---------------------------------- */

/** 基线刻意取得很远（25 年前），免得新旧戳算出同一个数、断言一致地绿（`§7b⑨`）。 */
const LONG_AGO = { at: "2001-02-03T04:05:06.000Z", seed: 12_345 };
const SERIAL_LONG_AGO = gridDateToSerial(2001, 2, 3);

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
  globalThis.__stampCalls = { normalize: [], bind: [] };
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
    /** 屏幕上那一格显示的字。走的是选区那条真实读值路径。 */
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

/** 载入路径那一次 `normalizeGridProjectSheetState` 调用（`restoreRecovery` 也走同一个函数）。 */
function loadCall() {
  const calls = globalThis.__stampCalls.normalize;
  assert.ok(
    calls.length > 0,
    "整场载入里 normalizeGridProjectSheetState 一次都没被调到。" +
      "载入路径换了函数的话，锚点 A 已经不在这里了，这份判据要跟着重写——" +
      "**不许把这条改成 skip**",
  );
  return calls.at(-1);
}

/** 由 hook **直接**发起的 `bindGridWorkbook`（即锚点 B；A 那次在 grid-model 模块内部，记不到）。 */
function directBindCalls() {
  return globalThis.__stampCalls.bind;
}

/* ===========================================================================
 * 〇 · 记录器自检（`§6`：零命中是最贵的一类断言）
 *
 * 记录器坏了，下面每一条都会安静地绿。所以先证明它**看得见**、
 * 而且它的读数**分得出**「装了戳」与「没装戳」。
 * ========================================================================= */

test("自检：记录器真的看得见两条路，且它的读数分得出有戳无戳", async () => {
  // 两个包装函数**各自**要有正控，而且正控不许借道被测代码：
  // 若拿「hook 有没有直接调过 bindGridWorkbook」当正控，摘掉锚点 B 时这里也会红，
  // 报的却是「桩没换进去」——把一条真缺陷说成工具坏了。所以这里自己调一次。
  const spy = await import(gridModelSpyUrl);
  globalThis.__stampCalls = { normalize: [], bind: [] };
  spy.bindGridWorkbook(todaySheets(), { recalc: LONG_AGO });
  assert.equal(
    directBindCalls().length,
    1,
    "bindGridWorkbook 的包装版没记到自己这一次调用——记录器坏了",
  );
  assert.equal(
    directBindCalls()[0].readingAtReturn,
    String(SERIAL_LONG_AGO),
    "包装版记下的读数与真实现对不上——记录器的观测点是错的",
  );

  const stamped = await mountEditor(projectWith(LONG_AGO));
  try {
    assert.ok(
      globalThis.__stampCalls.normalize.length > 0,
      "记录器没记到任何 normalizeGridProjectSheetState 调用——桩没换进去",
    );
    // 正控：这一份带戳，屏幕上必须出数。出不了数说明整条链已经断了，
    // 下面所有「谁装的」结论一律作废。
    assert.equal(
      await stamped.displayAt(0, 0),
      String(SERIAL_LONG_AGO),
      "带戳的文档在屏幕上都不出数，这份判据的前提不成立",
    );
  } finally {
    await stamped.unmount();
  }

  // 反控：同一个观测点，换一份**没有戳**的工程档，读数必须变成 `#NAME?`。
  // 这一条证明「readingAtReturn 出数」不是一个恒真的读数——没有它，
  // 锚点 A 那条断言可能只是在验一个永远为真的字符串。
  const bare = await mountEditor(projectWith(undefined));
  try {
    assert.equal(
      loadCall().readingAtReturn,
      "#NAME?",
      "无戳文档在载入函数返回时就已经出数了——记录器的读数是恒真的，分不出两条路",
    );
    assert.equal(await bare.displayAt(0, 0), "#NAME?");
  } finally {
    await bare.unmount();
  }
});

/* ===========================================================================
 * ① 锚点 A —— 载入路径自己就把戳装上，不靠 applySnapshot
 *
 * 这一条是 `V3` §8.6 记为欠账的那个交叉形状：今天摘掉它全量不红。
 * 观测点是「载入函数返回的那一刻」，此时 `applySnapshot`（锚点 B）还没跑。
 * ========================================================================= */

test("锚点 A：载入函数收到带戳的第三个入参，返回时工作簿就已经出数", async () => {
  const mounted = await mountEditor(projectWith(LONG_AGO));
  try {
    const call = loadCall();

    // A-1 调用边：hook 真的把戳递进去了。
    // 摘掉 `use-grid-editor.ts` 载入处的 `{ recalc: project.recalc }` 之后，
    // 屏幕上照样出数（锚点 B 顶着），但这里当场红。
    assert.equal(
      call.arity,
      3,
      "载入路径只用两个入参调 normalizeGridProjectSheetState——" +
        "戳没有递进去。今天靠 applySnapshot 那条路顶着，所以屏幕上看不出来；" +
        "不经 applySnapshot 的调用方（grid-model 的 normalizeGridProjectSheetStateSheets 一族）" +
        "从此拿不到戳",
    );
    assert.deepEqual(
      call.recalcArgument,
      LONG_AGO,
      "递进去的不是这份工程档里那一枚戳（是 undefined 还是被改写了？）",
    );

    // A-2 效果：入参递进去还不够，函数得真按它登记。
    // 摘掉 `grid-model.ts` 里 `bindGridWorkbook(sheets, { recalc: … })` 的
    // recalc 那一项之后，这里当场红。
    assert.equal(
      call.readingAtReturn,
      String(SERIAL_LONG_AGO),
      "载入函数返回的工作簿还没出数 —— 戳递进去了却没被登记上。" +
        "屏幕上仍可能正常（applySnapshot 会重新登记一次），但公共函数的承诺已经空了",
    );
  } finally {
    await mounted.unmount();
  }
});

test("锚点 A 的第二条边：崩溃恢复走的是同一个载入函数、同一枚戳", async () => {
  // `restoreRecovery` 是 `normalizeGridProjectSheetState` 在 hook 里的第二个调用点。
  // 两处口径必须一致，否则「恢复出来的文档」和「打开的文档」算出两个数。
  const mounted = await mountEditor(projectWith(undefined));
  try {
    assert.equal(await mounted.displayAt(0, 0), "#NAME?");
    globalThis.__stampCalls.normalize.length = 0;
    await mounted.run((editor) => editor.restoreRecovery(projectWith(LONG_AGO)));
    const call = loadCall();
    assert.equal(call.arity, 3, "restoreRecovery 没把戳递给载入函数");
    assert.deepEqual(call.recalcArgument, LONG_AGO);
    assert.equal(
      call.readingAtReturn,
      String(SERIAL_LONG_AGO),
      "恢复路径拿到的工作簿在载入函数返回时没出数",
    );
  } finally {
    await mounted.unmount();
  }
});

/* ===========================================================================
 * ② 锚点 B —— applySnapshot 每次克隆之后自己重新登记，不靠载入函数
 *
 * `V3` F4 实测摘掉它 12 绿 / 2 红，所以它今天**已经**有守卫（`grid-recalc-action`
 * 的「撤销一步」与「点重算」两条）。这里再钉一次的理由不是重复：
 * 那两条判的是**结果**（屏幕上的数对不对），这里判的是**机制**
 * （这一次登记是 hook 自己发起的，不是从载入函数那儿蹭来的），
 * 于是「两条都在」这件事本身第一次有了判据。
 * ========================================================================= */

test("锚点 B：hook 在克隆之后自己重新登记一次，登记的是当前这一枚戳", async () => {
  const mounted = await mountEditor(projectWith(LONG_AGO));
  try {
    const withStamp = directBindCalls().filter(
      (call) => call.recalcArgument !== undefined,
    );
    assert.ok(
      withStamp.length > 0,
      "hook 一次都没有自己发起带戳的 bindGridWorkbook —— applySnapshot 里那次" +
        "重新登记被摘掉了。屏幕上初次载入照样出数（载入函数那条路顶着），" +
        "但撤销一步会把重算时刻一起退回去，点「重新计算」也不再更新",
    );
    for (const call of withStamp) {
      assert.deepEqual(
        call.recalcArgument,
        LONG_AGO,
        "重新登记用的不是当前这一枚戳",
      );
      assert.equal(
        call.readingAtReturn,
        String(SERIAL_LONG_AGO),
        "重新登记之后这本工作簿仍然不出数",
      );
    }
  } finally {
    await mounted.unmount();
  }
});

test("锚点 B 只有它管得着的那件事：点「重新计算」，屏幕上的数跟着走", async () => {
  // 这条路上**根本没有载入函数**：`recalculate` 直接
  // `applySnapshot({ sheets: sheetsRef.current })`，戳只能由锚点 B 装上。
  // 所以它是 B 的纯净证据，摘掉 A 一个字都不影响它。
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
    assert.notEqual(
      todaySerial,
      SERIAL_LONG_AGO,
      "基线取得离今天太近了，这条断言分辨不出「铸了新戳」与「没铸」",
    );
    assert.equal(
      await mounted.displayAt(0, 0),
      String(todaySerial),
      "点了「重新计算」，格子里还是旧戳算出来的数",
    );

    // 撤销一步不许把重算时刻退回去（戳是文档级属性，不受 undo 栈支配）。
    await mounted.run((editor) => editor.setCell(2, 0, "备注"));
    await mounted.run((editor) => editor.undo());
    assert.equal(
      await mounted.displayAt(0, 0),
      String(todaySerial),
      "撤销一步把重算时刻也退回去了",
    );
  } finally {
    await mounted.unmount();
  }
});

/* ===========================================================================
 * ③ 两条都在 —— `V3` §8.6 第 1 条要的那条判据
 * ========================================================================= */

test("一次载入里有两次彼此独立的登记：冗余仍然是两条，不是一条", async () => {
  // `V3` 定案：这份冗余**是有意的**，防的是任一条路被人改坏。
  // 但冗余只有在「两条都在」时才是冗余；剩一条的时候它是个假象——
  // 判据全绿，而下一次谁再动那一条就直接塌到用户屏幕上。
  //
  // 摘掉任一条，这一条都会红，且报错文案直接说清剩下的是哪一条。
  const mounted = await mountEditor(projectWith(LONG_AGO));
  try {
    // 「在」的标准是**装上了戳**，不是「调用形状对」：只数入参的话，
    // 递进去而没被登记（`grid-model` 那一手被摘掉）也算它在。
    const stamped = String(SERIAL_LONG_AGO);
    const anchorA = globalThis.__stampCalls.normalize.filter(
      (call) =>
        call.arity === 3 &&
        call.recalcArgument !== undefined &&
        call.readingAtReturn === stamped,
    );
    const anchorB = directBindCalls().filter(
      (call) =>
        call.recalcArgument !== undefined && call.readingAtReturn === stamped,
    );
    assert.deepEqual(
      { anchorA: anchorA.length > 0, anchorB: anchorB.length > 0 },
      { anchorA: true, anchorB: true },
      "装戳的冗余不再是两条。A = 载入函数的 options.recalc 入参（W12）；" +
        "B = applySnapshot 在 cloneGridSheets 之后的重新登记（W32）。" +
        "V3 §8.3 定案：两条都要在。要合并成一条，先在这份判据里写明为什么一条也够",
    );
    // 两次登记必须落在**不同**的工作簿对象上：A 装在载入函数返回的那一批表上，
    // B 装在 `cloneGridSheets` 出来的新一批上。若两者是同一批，说明克隆漏斗被绕开了。
    assert.equal(
      await mounted.displayAt(0, 0),
      String(SERIAL_LONG_AGO),
      "两条都在，屏幕上却不出数",
    );
    assert.equal(
      gridDisplayValue(mounted.editor.sheets[0], 0, 0),
      String(SERIAL_LONG_AGO),
      "hook 交给画布的那一批表没有登记在册 —— 画布拿不到戳",
    );
  } finally {
    await mounted.unmount();
  }
});
