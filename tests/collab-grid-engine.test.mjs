/**
 * 表格多人同改·真 Univer 引擎对照（work-chat 第二轮 F10）。
 *
 * 不开浏览器：用 @univerjs/core + @univerjs/sheets 在 Node 里起一个无界面的 Univer（只缺 `opentype.js`
 * 的命名导出，这里用一个桩模块顶上），对照三件事：
 *   1. 结构操作的参考语义（tests/collab-grid-sim.mjs）与真引擎的 mutation 效果逐条一致；
 *   2. 本机命令 → 结构操作的翻译（插入 / 删除行列、移动、整行排序 vs 只排部分列）；
 *   3. 两个真引擎 + 真端口 + 真绑定器：甲插行、乙同时改格子，不整张替换、工作簿对象不换。
 * 引擎起不来（依赖没装 / 版本变了）时整组跳过，不算失败。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  Y,
  makeNetwork,
  refApplyOp,
  sampleWorkbook,
} from "./collab-grid-sim.mjs";
import { bindJsonState } from "../src/shell/collab/bind-json-state.ts";
import {
  createGridCollabBinder,
  createGridUniverPort,
} from "../src/shell/collab/adapters/grid.ts";
import { createGridLayoutStore } from "../src/shell/doc-editors/grid-univer/collab-layout-store.ts";
import { executeRemotePlan } from "../src/shell/doc-editors/grid-univer/collab-univer-ops.ts";

const STUB =
  "data:text/javascript," +
  encodeURIComponent("export const parse=()=>({});export const load=()=>({});export default {parse,load};");
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s,c,n){if(s==="opentype.js")return{url:${JSON.stringify(STUB)},shortCircuit:true};return n(s,c);}`,
    ),
);

let core = null;
let sheets = null;
try {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", ".pnpm");
  const find = (prefix) => fs.readdirSync(root).find((name) => name.startsWith(prefix));
  const coreDir = find("@univerjs+core@0.25.1");
  const sheetsDir = find("@univerjs+sheets@0.25.1");
  core = await import(path.join(root, coreDir, "node_modules/@univerjs/core/lib/es/index.js"));
  sheets = await import(path.join(root, sheetsDir, "node_modules/@univerjs/sheets/lib/es/index.js"));
} catch {
  core = null;
  sheets = null;
}
const skip = !core || !sheets;

/** 起一个无界面的 Univer，返回「像 facade 一样」的 api 外壳。 */
function engine(snapshot) {
  const univer = new core.Univer({ locale: "enUS", locales: { enUS: {} } });
  univer.registerPlugin(sheets.UniverSheetsPlugin);
  const wb = univer.createUnit(core.UniverInstanceType.UNIVER_SHEET, structuredClone(snapshot));
  const cmd = univer.__getInjector().get(core.ICommandService);
  const api = {
    Event: { CommandExecuted: "CommandExecuted" },
    addEvent: (_name, cb) =>
      cmd.onCommandExecuted((info, options) => cb({ id: info.id, params: info.params, options })),
    syncExecuteCommand: (id, params, options) => cmd.syncExecuteCommand(id, params, options),
    getActiveWorkbook: () => ({
      getId: () => wb.getUnitId(),
      save: () => wb.save(),
    }),
  };
  return {
    univer,
    wb,
    cmd,
    api,
    unitId: wb.getUnitId(),
    save: () => wb.save(),
    dispose: () => univer.dispose(),
  };
}

const view = (sheet) => {
  const cells = {};
  for (const [row, line] of Object.entries(sheet.cellData ?? {})) {
    for (const [col, cell] of Object.entries(line ?? {})) {
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") cells[`${row},${col}`] = cell.v;
    }
  }
  return {
    cells,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    rowData: Object.fromEntries(Object.entries(sheet.rowData ?? {}).filter(([, v]) => v && Object.keys(v).length)),
    columnData: Object.fromEntries(
      Object.entries(sheet.columnData ?? {}).filter(([, v]) => v && Object.keys(v).length),
    ),
  };
};

function fixture() {
  const snapshot = sampleWorkbook({ rows: 20, cols: 6, filled: 12 });
  snapshot.sheets.s1.rowData = { 2: { h: 31 }, 9: { h: 52 } };
  snapshot.sheets.s1.columnData = { 1: { w: 90 }, 4: { w: 140 } };
  return snapshot;
}

const OPS = [
  { kind: "insert", axis: "row", sheetId: "s1", at: 0, count: 1 },
  { kind: "insert", axis: "row", sheetId: "s1", at: 5, count: 3 },
  { kind: "insert", axis: "row", sheetId: "s1", at: 20, count: 2 },
  { kind: "remove", axis: "row", sheetId: "s1", at: 4, count: 1 },
  { kind: "remove", axis: "row", sheetId: "s1", at: 1, count: 3 },
  { kind: "insert", axis: "col", sheetId: "s1", at: 2, count: 2 },
  { kind: "insert", axis: "col", sheetId: "s1", at: 0, count: 1 },
  { kind: "remove", axis: "col", sheetId: "s1", at: 2, count: 1 },
  { kind: "remove", axis: "col", sheetId: "s1", at: 0, count: 2 },
  { kind: "move", axis: "row", sheetId: "s1", from: 8, count: 1, to: 2 }, // 向前
  { kind: "move", axis: "row", sheetId: "s1", from: 2, count: 3, to: 9 }, // 向后
  { kind: "move", axis: "row", sheetId: "s1", from: 4, count: 1, to: 5 }, // 往后挪一格
  { kind: "move", axis: "col", sheetId: "s1", from: 4, count: 1, to: 0 },
  { kind: "move", axis: "col", sheetId: "s1", from: 0, count: 2, to: 4 },
  { kind: "reorder", sheetId: "s1", start: 0, order: [3, 2, 1, 0, 7, 6, 5, 4], cols: 6 },
];

test("清单自检：OPS 覆盖 insert/remove/move/reorder——表变空时下面那批引擎对照用例会静默不注册", () => {
  // `table-driven-registration-guard` 判据 2：按命名表 for-of 注册的用例必须配长度正对照。
  // 缺真 Univer 时引擎对照会 skip；这条永远跑，表变空当场红。
  assert.equal(OPS.length, 15, `OPS 应有 15 条结构操作，实测 ${OPS.length} 条`);
  const kinds = new Set(OPS.map((op) => op.kind));
  for (const kind of ["insert", "remove", "move", "reorder"]) {
    assert.equal(kinds.has(kind), true, `OPS 里至少要有一条 ${kind}，整类被删时下面那批用例会少注册`);
  }
});

for (const op of OPS) {
  const label =
    op.kind === "reorder"
      ? "整行排序 reorder"
      : `${op.axis === "row" ? "行" : "列"} ${op.kind} ${JSON.stringify(op)}`;
  test(`引擎对照：${label} 的参考语义与真 Univer 一致`, { skip }, () => {
    const snapshot = fixture();
    const eng = engine(snapshot);
    try {
      const expected = structuredClone(snapshot);
      refApplyOp(expected, op);
      const ok = executeRemotePlan(
        { fallback: false, reason: "", structure: [op], meta: [], cells: [], empty: false },
        { api: eng.api, unitId: eng.unitId, snapshot: eng.save(), cellValue: (c) => c },
      );
      assert.equal(ok, true, "mutation 执行成功");
      const got = view(eng.save().sheets.s1);
      const want = view(expected.sheets.s1);
      assert.deepEqual(got.cells, want.cells);
      assert.equal(got.rowCount, want.rowCount);
      assert.equal(got.columnCount, want.columnCount);
      // 排序（reorder）只搬格子内容，行高留在原处：参考语义里也是这样
      assert.deepEqual(got.rowData, want.rowData);
      assert.deepEqual(got.columnData, want.columnData);
    } finally {
      eng.dispose();
    }
  });
}

test("引擎对照：行高列宽 / 合并区域 / 工作表增删改名 / 排序的计划整体执行", { skip }, () => {
  const snapshot = fixture();
  const eng = engine(snapshot);
  try {
    const plan = {
      fallback: false,
      reason: "",
      structure: [],
      meta: [
        { kind: "row-data", sheetId: "s1", data: { 3: { h: 77 }, 9: null } },
        { kind: "col-data", sheetId: "s1", data: { 2: { w: 111 } } },
        {
          kind: "merge",
          sheetId: "s1",
          remove: [],
          add: [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }],
        },
        { kind: "sheet-name", sheetId: "s1", name: "改过名" },
        {
          kind: "sheet-insert",
          sheetId: "s2",
          index: 0,
          sheet: { id: "s2", name: "新表", rowCount: 5, columnCount: 4, cellData: { 0: { 0: { v: "hi", t: 1 } } } },
        },
        { kind: "sheet-order", order: ["s2", "s1"] },
        { kind: "workbook-name", name: "新名字" },
      ],
      cells: [{ sheetId: "s1", row: 1, col: 1, cell: { v: "格子", t: 1 } }],
      empty: false,
    };
    const ok = executeRemotePlan(plan, {
      api: eng.api,
      unitId: eng.unitId,
      snapshot: eng.save(),
      cellValue: (c) => c,
    });
    assert.equal(ok, true);
    const saved = eng.save();
    assert.equal(saved.sheets.s1.name, "改过名");
    assert.equal(saved.sheets.s1.rowData[3].h, 77);
    assert.equal(saved.sheets.s1.rowData[9] === undefined || saved.sheets.s1.rowData[9] === null, true);
    assert.equal(saved.sheets.s1.columnData[2].w, 111);
    assert.deepEqual(saved.sheets.s1.mergeData, [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }]);
    assert.equal(saved.sheets.s1.cellData[1][1].v, "格子");
    assert.ok(saved.sheets.s2, "新工作表插进来了");
    assert.deepEqual(saved.sheetOrder, ["s2", "s1"]);
    assert.equal(saved.name, "新名字");

    // 再删掉新工作表
    const removed = executeRemotePlan(
      {
        fallback: false,
        reason: "",
        structure: [],
        meta: [{ kind: "sheet-remove", sheetId: "s2", name: "新表" }],
        cells: [],
        empty: false,
      },
      { api: eng.api, unitId: eng.unitId, snapshot: eng.save(), cellValue: (c) => c },
    );
    assert.equal(removed, true);
    assert.equal(eng.save().sheets.s2, undefined);
  } finally {
    eng.dispose();
  }
});

test("引擎：本机命令 → 结构操作（插入 / 删除行列走命令，移动与排序走 mutation）", { skip }, () => {
  const eng = engine(fixture());
  try {
    const port = createGridUniverPort({
      getApi: () => eng.api,
      replaceWorkbook: () => assert.fail("不该整张替换"),
    });
    const seen = [];
    const off = port.onLocalStructure((op) => seen.push(op));

    // 用户在第 5 行上面插入 2 行（真命令，会连带触发别的 mutation）
    eng.cmd.syncExecuteCommand("sheet.command.insert-row-by-range", {
      unitId: eng.unitId,
      subUnitId: "s1",
      direction: core.Direction.UP,
      range: { startRow: 4, endRow: 5, startColumn: 0, endColumn: 5 },
    });
    // 删第 1 行
    eng.cmd.syncExecuteCommand("sheet.command.remove-row-by-range", {
      unitId: eng.unitId,
      subUnitId: "s1",
      range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 5 },
    });
    // 插列、删列
    eng.cmd.syncExecuteCommand("sheet.command.insert-col-by-range", {
      unitId: eng.unitId,
      subUnitId: "s1",
      direction: core.Direction.LEFT,
      range: { startColumn: 2, endColumn: 2, startRow: 0, endRow: 19 },
    });
    eng.cmd.syncExecuteCommand("sheet.command.remove-col-by-range", {
      unitId: eng.unitId,
      subUnitId: "s1",
      range: { startColumn: 0, endColumn: 0, startRow: 0, endRow: 19 },
    });
    assert.deepEqual(
      seen.map((op) => [op.kind, op.axis, op.at, op.count]),
      [
        ["insert", "row", 4, 2],
        ["remove", "row", 0, 1],
        ["insert", "col", 2, 1],
        ["remove", "col", 0, 1],
      ],
    );

    // 移动（mutation）：向前 / 向后
    seen.length = 0;
    eng.cmd.syncExecuteCommand("sheet.mutation.move-rows", {
      unitId: eng.unitId,
      subUnitId: "s1",
      sourceRange: { startRow: 6, endRow: 6, startColumn: 0, endColumn: 6 },
      targetRange: { startRow: 2, endRow: 2, startColumn: 0, endColumn: 6 },
    });
    eng.cmd.syncExecuteCommand("sheet.mutation.move-rows", {
      unitId: eng.unitId,
      subUnitId: "s1",
      sourceRange: { startRow: 2, endRow: 3, startColumn: 0, endColumn: 6 },
      targetRange: { startRow: 9, endRow: 9, startColumn: 0, endColumn: 6 },
    });
    assert.deepEqual(
      seen.map((op) => [op.kind, op.from, op.count, op.to]),
      [
        ["move", 6, 1, 2],
        ["move", 2, 2, 7],
      ],
    );

    // 整行排序：范围覆盖整张表的列 → 行 id 跟着内容走
    seen.length = 0;
    eng.cmd.syncExecuteCommand("sheet.mutation.reorder-range", {
      unitId: eng.unitId,
      subUnitId: "s1",
      range: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 6 },
      order: { 0: 3, 1: 2, 2: 1, 3: 0 },
    });
    assert.deepEqual(
      seen.map((op) => [op.kind, op.start, op.order]),
      [["reorder", 0, [3, 2, 1, 0]]],
    );

    // 只排部分列（范围之外的列有内容）→ 不是整行排序，按普通改格子处理（没有结构事件）
    seen.length = 0;
    eng.cmd.syncExecuteCommand("sheet.mutation.reorder-range", {
      unitId: eng.unitId,
      subUnitId: "s1",
      range: { startRow: 0, endRow: 3, startColumn: 0, endColumn: 1 },
      order: { 0: 3, 1: 2, 2: 1, 3: 0 },
    });
    assert.deepEqual(seen, []);
    off();
  } finally {
    eng.dispose();
  }
});

test("引擎：写入远端变化期间不触发本地结构事件", { skip }, () => {
  const eng = engine(fixture());
  try {
    const port = createGridUniverPort({ getApi: () => eng.api, replaceWorkbook: () => {} });
    const seen = [];
    port.onLocalStructure((op) => seen.push(op));
    const ok = port.applyRemotePlan({
      fallback: false,
      reason: "",
      structure: [{ kind: "insert", axis: "row", sheetId: "s1", at: 3, count: 1, ids: ["x"] }],
      meta: [],
      cells: [{ sheetId: "s1", row: 3, col: 0, cell: { v: "新行", t: 1 } }],
      empty: false,
    });
    assert.equal(ok, true);
    assert.deepEqual(seen, []);
    assert.equal(eng.save().sheets.s1.cellData[3][0].v, "新行");
    assert.equal(eng.save().sheets.s1.rowCount, 21);
  } finally {
    eng.dispose();
  }
});

test("两个真引擎：甲在第 5 行上插行并填值、乙同时改第 8 行的格子 → 不整张替换，乙的值跟着原来的行", { skip }, () => {
  const net = makeNetwork();
  const start = sampleWorkbook({ rows: 20, cols: 6, filled: 12 });
  const make = (doc, needsSeed, snapshot) => {
    const eng = engine(snapshot);
    const state = { replaced: 0, timers: [], unit: eng.wb };
    const listeners = new Set();
    const awareness = {
      clientID: doc.clientID,
      getStates: () => new Map(),
      on: () => {},
      off: () => {},
      setLocalStateField: () => {},
    };
    const room = {
      doc,
      awareness,
      role: "editor",
      status: "syncing",
      self: { id: `u${doc.clientID}` },
      lock: null,
      needsSeed,
      completeSeed: () => {},
      subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      setStatus(status) {
        room.status = status;
        listeners.forEach((cb) => cb());
      },
    };
    const port = createGridUniverPort({
      getApi: () => eng.api,
      replaceWorkbook: () => {
        state.replaced += 1;
      },
    });
    let counter = 0;
    const binder = createGridCollabBinder({
      room,
      port,
      bind: (opts) => bindJsonState({ ...opts, room }),
      layoutStore: createGridLayoutStore({ doc, canWrite: () => true }),
      newId: () => `e${doc.clientID % 997}-${(counter += 1)}`,
      setTimer: (cb) => {
        const handle = { cb, cancelled: false };
        state.timers.push(handle);
        return handle;
      },
      clearTimer: (handle) => {
        handle.cancelled = true;
      },
    });
    return {
      eng,
      room,
      binder,
      state,
      tick: () => {
        for (const t of state.timers.splice(0)) if (!t.cancelled) t.cb();
      },
      set(row, col, v) {
        eng.cmd.syncExecuteCommand("sheet.mutation.set-range-values", {
          unitId: eng.unitId,
          subUnitId: "s1",
          cellValue: { [row]: { [col]: { v, t: 1 } } },
        });
      },
    };
  };
  const a = make(net.a, true, start);
  net.sync();
  // 乙是从保存的版本打开的：画布内容与共享文档一致（初次同步没有差别，所以不需要整张替换）。
  const b = make(net.b, false, start);
  b.room.setStatus("synced");
  a.room.setStatus("synced");
  net.sync();
  const settle = () => {
    for (let i = 0; i < 4; i += 1) {
      a.tick();
      b.tick();
      net.sync();
    }
  };
  settle();
  assert.equal(b.eng.save().sheets.s1.cellData[3][0].v, "3-0");
  assert.equal(a.state.replaced + b.state.replaced, 0, "初次同步没有整张替换");
  const bookB = b.eng.wb;

  a.eng.cmd.syncExecuteCommand("sheet.command.insert-row-by-range", {
    unitId: a.eng.unitId,
    subUnitId: "s1",
    direction: core.Direction.UP,
    range: { startRow: 4, endRow: 4, startColumn: 0, endColumn: 5 },
  });
  a.set(4, 0, "甲插的");
  b.set(7, 1, "乙改的");
  settle();

  for (const side of [a, b]) {
    const sheet = side.eng.save().sheets.s1;
    assert.equal(sheet.rowCount, 21);
    assert.equal(sheet.cellData[4][0].v, "甲插的");
    assert.equal(sheet.cellData[8][1].v, "乙改的");
    assert.equal(sheet.cellData[7][1].v, "6-1");
  }
  assert.deepEqual(view(a.eng.save().sheets.s1).cells, view(b.eng.save().sheets.s1).cells);
  assert.equal(a.state.replaced + b.state.replaced, 0, "没有整张替换");
  assert.equal(b.eng.wb, bookB, "乙的工作簿对象没换");

  // 排序：甲把前 6 行倒过来，乙同时改其中一行
  const reorder = (side, order) =>
    side.eng.cmd.syncExecuteCommand("sheet.mutation.reorder-range", {
      unitId: side.eng.unitId,
      subUnitId: "s1",
      range: { startRow: 0, endRow: 5, startColumn: 0, endColumn: 5 },
      order,
    });
  const before = view(a.eng.save().sheets.s1).cells;
  reorder(a, { 0: 5, 1: 4, 2: 3, 3: 2, 4: 1, 5: 0 });
  b.set(2, 3, "乙在第3行");
  settle();
  for (const side of [a, b]) {
    const sheet = side.eng.save().sheets.s1;
    assert.equal(sheet.cellData[3][3].v, "乙在第3行", "原来的第 3 行排到了第 4 行，乙的改动跟着它");
    assert.equal(sheet.cellData[0][0].v, before["5,0"]);
  }
  assert.deepEqual(view(a.eng.save().sheets.s1).cells, view(b.eng.save().sheets.s1).cells);
  assert.equal(a.state.replaced + b.state.replaced, 0);

  // 删列
  a.eng.cmd.syncExecuteCommand("sheet.command.remove-col-by-range", {
    unitId: a.eng.unitId,
    subUnitId: "s1",
    range: { startColumn: 2, endColumn: 2, startRow: 0, endRow: 20 },
  });
  b.set(9, 3, "乙在D");
  settle();
  for (const side of [a, b]) {
    const sheet = side.eng.save().sheets.s1;
    assert.equal(sheet.columnCount, 5);
    assert.equal(sheet.cellData[9][2].v, "乙在D");
  }
  assert.deepEqual(view(a.eng.save().sheets.s1).cells, view(b.eng.save().sheets.s1).cells);
  assert.equal(a.state.replaced + b.state.replaced, 0);
  a.binder.destroy();
  b.binder.destroy();
  a.eng.dispose();
  b.eng.dispose();
});
