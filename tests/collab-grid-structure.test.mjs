/**
 * 表格多人同改·结构变化（work-chat 第二轮 F10）：
 * 两人同时插行、删列、排序，互相不冲掉；老格式文档就地迁移一次；远端结构变化不整张替换。
 * 两个模拟客户端共用一份文档（两个 Y.Doc 手动同步），绑定器、实体绑定、行列布局存储都是真的，
 * 画布是参考语义的假画布（和真 Univer 引擎的对照在 collab-grid-engine.test.mjs）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  GRID_COLLAB_ROOT,
  Y,
  gridFromY,
  makeClient,
  makeNetwork,
  refApplyOp,
  sampleWorkbook,
  seededPair,
} from "./collab-grid-sim.mjs";
import { writeJsonStateRoot } from "../src/shell/collab/bind-json-state.ts";
import {
  gridFromEntities,
  gridToEntities,
  migrateGridEntities,
  normalizeGridSnapshot,
  readGridEntityState,
} from "../src/shell/collab/adapters/grid.ts";
import {
  applyGridStructureOp,
  diffGridIdSequence,
  fitGridLayout,
  gridCellIdKey,
  initialGridLayout,
  parseGridCellIdKey,
} from "../src/shell/doc-editors/grid-univer/collab-layout-model.ts";

const values = (client, sheetId = "s1") => {
  const out = {};
  const data = client.live.sheets[sheetId].cellData;
  for (const row of Object.keys(data)) {
    for (const col of Object.keys(data[row])) {
      const cell = data[row][col];
      if (cell && cell.v !== undefined) out[`${row},${col}`] = cell.v;
    }
  }
  return out;
};

const docValues = (doc) => {
  const snapshot = gridFromY(doc);
  const out = {};
  const data = snapshot.sheets.s1.cellData;
  for (const row of Object.keys(data)) {
    for (const col of Object.keys(data[row])) {
      if (data[row][col].v !== undefined) out[`${row},${col}`] = data[row][col].v;
    }
  }
  return out;
};

function assertConverged(a, b) {
  assert.deepEqual(values(a), values(b), "两个画布的内容一致");
  assert.deepEqual(values(a), docValues(a.room.doc), "画布与共享文档一致");
  assert.deepEqual(a.live.sheets.s1.rowCount, b.live.sheets.s1.rowCount);
  assert.deepEqual(a.live.sheets.s1.columnCount, b.live.sheets.s1.columnCount);
  assert.deepEqual(a.binder.getLayout(), b.binder.getLayout(), "两边的行列 id 顺序一致");
  assert.deepEqual(normalizeGridSnapshot(a.live), normalizeGridSnapshot(b.live));
}

// ── 纯函数 ──────────────────────────────────────────────────────────────────

test("行列 id 键：往返解析；老格式（纯数字）不当成 id 键", () => {
  assert.equal(gridCellIdKey("s1", "r3", "c2"), "s1!r3!c2");
  assert.deepEqual(parseGridCellIdKey("s1!r3!c2"), { sheetId: "s1", rowId: "r3", colId: "c2" });
  assert.deepEqual(parseGridCellIdKey("a!b!gx1!gx2"), { sheetId: "a!b", rowId: "gx1", colId: "gx2" });
  assert.equal(parseGridCellIdKey("s1!3!2"), null);
  assert.equal(parseGridCellIdKey("s1!r3"), null);
});

test("布局：初始 id 确定；fit 补新 id 不动老 id；结构操作作用在布局上", () => {
  const snapshot = sampleWorkbook({ rows: 5, cols: 3, filled: 2 });
  const layout = initialGridLayout(snapshot);
  assert.deepEqual(layout.s1.rows, ["r0", "r1", "r2", "r3", "r4"]);
  assert.deepEqual(layout.s1.cols, ["c0", "c1", "c2"]);
  assert.deepEqual(initialGridLayout(snapshot), layout, "确定性：同样的快照永远同样的 id");

  const grown = structuredClone(snapshot);
  grown.sheets.s1.rowCount = 7;
  let n = 0;
  const fit = fitGridLayout(grown, layout, () => `new${(n += 1)}`);
  assert.equal(fit.changed, true);
  assert.deepEqual(fit.layout.s1.rows, ["r0", "r1", "r2", "r3", "r4", "new1", "new2"]);
  assert.deepEqual(fitGridLayout(snapshot, layout).changed, false);

  const inserted = applyGridStructureOp(layout, { kind: "insert", axis: "row", sheetId: "s1", at: 2, count: 2 }, () => "z");
  assert.deepEqual(inserted.layout.s1.rows, ["r0", "r1", "z", "z", "r2", "r3", "r4"]);
  const moved = applyGridStructureOp(layout, { kind: "move", axis: "row", sheetId: "s1", from: 3, count: 2, to: 0 });
  assert.deepEqual(moved.layout.s1.rows, ["r3", "r4", "r0", "r1", "r2"]);
  const sorted = applyGridStructureOp(layout, { kind: "reorder", sheetId: "s1", start: 1, order: [2, 0, 1], cols: 3 });
  assert.deepEqual(sorted.layout.s1.rows, ["r0", "r3", "r1", "r2", "r4"]);
});

test("差分：先删、再移动、最后插入；排序很多行时合成一次 reorder", () => {
  const from = ["a", "b", "c", "d", "e"];
  const ops = diffGridIdSequence("s", "row", from, ["a", "x", "c", "e", "d", "y"]);
  assert.deepEqual(
    ops.map((o) => o.kind),
    ["remove", "move", "insert", "insert"],
  );
  // 逐条作用在 from 上必须得到 to
  let layout = { s: { rows: from.slice(), cols: [] } };
  for (const op of ops) layout = applyGridStructureOp(layout, op).layout;
  assert.deepEqual(layout.s.rows, ["a", "x", "c", "e", "d", "y"]);

  const many = Array.from({ length: 60 }, (_, i) => `r${i}`);
  const reversed = many.slice().reverse();
  const sort = diffGridIdSequence("s", "row", many, reversed, 8);
  assert.equal(sort.length, 1);
  assert.equal(sort[0].kind, "reorder");
  let sorted = { s: { rows: many.slice(), cols: [] } };
  for (const op of sort) sorted = applyGridStructureOp(sorted, op).layout;
  assert.deepEqual(sorted.s.rows, reversed);
});

test("编码：给了布局格子按 id 存、行列数不进 meta；还原后与原快照等价（快照形状不变）", () => {
  const snapshot = sampleWorkbook({ rows: 6, cols: 4, filled: 3 });
  snapshot.sheets.s1.rowData = { 1: { h: 40 } };
  snapshot.sheets.s1.columnData = { 2: { w: 120 } };
  snapshot.sheets.s1.mergeData = [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }];
  const layout = initialGridLayout(snapshot);
  const encoded = gridToEntities(snapshot, layout);
  assert.ok(encoded.entities["s1!r0!c0"]);
  assert.equal(encoded.entities["s1!0!0"], undefined);
  const sheetMeta = encoded.meta["sheet:s1"];
  assert.equal(sheetMeta.rowCount, undefined);
  assert.deepEqual(sheetMeta.rowData, { r1: { h: 40 } });
  assert.deepEqual(sheetMeta.columnData, { c2: { w: 120 } });
  assert.deepEqual(sheetMeta.mergeData, [{ sr: "r0", er: "r1", sc: "c0", ec: "c1" }]);

  const back = gridFromEntities({ ...encoded, layout }, null);
  assert.equal(back.sheets.s1.rowCount, 6);
  assert.equal(back.sheets.s1.columnCount, 4);
  assert.deepEqual(back.sheets.s1.rowData, { 1: { h: 40 } });
  assert.deepEqual(back.sheets.s1.mergeData, [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }]);
  assert.deepEqual(normalizeGridSnapshot(back), normalizeGridSnapshot(snapshot));

  // 行被删掉：它的格子 / 行高随之消失；列顺序变了：格子跟着列走
  const shifted = structuredClone(layout);
  shifted.s1.rows.splice(1, 1);
  shifted.s1.cols.reverse();
  const reread = gridFromEntities({ ...encoded, layout: shifted }, null);
  assert.equal(reread.sheets.s1.rowCount, 5);
  assert.deepEqual(reread.sheets.s1.rowData, {});
  assert.equal(reread.sheets.s1.cellData[1][3].v, "2-0", "删掉第 2 行后原第 3 行上移到第 2 行，反转列顺序后原 A 列在最后一列");
  assert.equal(reread.sheets.s1.cellData[0][3].v, "0-0", "反转列顺序后原 A 列的值在最后一列");
});

// ── 两个客户端同时改 ────────────────────────────────────────────────────────

test("甲在第 5 行上插行并填值、乙同时改第 8 行的格子 → 乙的值落在原来那一行（现在是第 9 行）", () => {
  const { a, b, settle } = seededPair();
  a.calls.replace = b.calls.replace = 0;
  const undoBefore = [a.undoStack.length, b.undoStack.length];

  a.insertRows("s1", 4, 1); // 第 5 行上面插一行
  a.setCell("s1", 4, 0, { v: "甲插的", t: 1 });
  b.setCell("s1", 7, 1, { v: "乙改的", t: 1 }); // 第 8 行
  settle();

  for (const side of [a, b]) {
    assert.equal(side.cell("s1", 4, 0).v, "甲插的", "甲插的那行和数字在");
    assert.equal(side.cell("s1", 8, 1).v, "乙改的", "乙的值跟着原来的第 8 行走，现在在第 9 行");
    assert.equal(side.cell("s1", 7, 1).v, "6-1", "原来第 7 行的内容现在在第 8 行");
    assert.equal(side.live.sheets.s1.rowCount, 21);
  }
  assertConverged(a, b);
  assert.equal(a.calls.replace + b.calls.replace, 0, "没有整张替换");
  assert.deepEqual([a.undoStack.length, b.undoStack.length], undoBefore, "本地撤销栈没被清空");
  assert.ok(b.calls.plan >= 1, "乙那边是增量执行远端计划");
});

test("两人同时在同一位置各插一行 → 两行都在，顺序双方一致", () => {
  const { a, b, settle } = seededPair();
  a.calls.replace = b.calls.replace = 0;
  a.insertRows("s1", 3, 1);
  a.setCell("s1", 3, 0, { v: "甲的行", t: 1 });
  b.insertRows("s1", 3, 1);
  b.setCell("s1", 3, 0, { v: "乙的行", t: 1 });
  settle();
  assertConverged(a, b);
  assert.equal(a.live.sheets.s1.rowCount, 22);
  const col0 = [3, 4].map((row) => a.cell("s1", row, 0).v).sort();
  assert.deepEqual(col0, ["乙的行", "甲的行"], "两行都在");
  assert.equal(a.cell("s1", 5, 0).v, "3-0", "原来的第 4 行下移了两格");
  assert.equal(a.calls.replace + b.calls.replace, 0);
});

test("甲删 C 列、乙同时改 D 列 → 乙的值仍在原来的 D 列（删除后变成 C 列）", () => {
  const { a, b, settle } = seededPair();
  a.calls.replace = b.calls.replace = 0;
  a.removeCols("s1", 2, 1); // C 列
  b.setCell("s1", 5, 3, { v: "乙在D", t: 1 }); // D 列
  settle();
  assertConverged(a, b);
  for (const side of [a, b]) {
    assert.equal(side.cell("s1", 5, 2).v, "乙在D", "原来的 D 列现在是 C 列");
    assert.equal(side.live.sheets.s1.columnCount, 5);
    assert.equal(side.cell("s1", 0, 3).v, "0-4", "后面的列左移");
  }
  assert.equal(a.calls.replace + b.calls.replace, 0);
});

test("甲删一行、乙同时改被删的那行 → 行不见了，其余格子不错位", () => {
  const { a, b, settle } = seededPair();
  a.removeRows("s1", 2, 1);
  b.setCell("s1", 2, 0, { v: "改了被删的行", t: 1 });
  b.setCell("s1", 5, 0, { v: "别的行", t: 1 });
  settle();
  assertConverged(a, b);
  assert.equal(a.live.sheets.s1.rowCount, 19);
  assert.equal(a.cell("s1", 4, 0).v, "别的行", "第 6 行的改动现在在第 5 行");
  assert.ok(!Object.values(values(a)).includes("改了被删的行"));
});

test("甲排序、乙同时改某行 → 改动跟着那一行", () => {
  const { a, b, settle } = seededPair();
  a.calls.replace = b.calls.replace = 0;
  // 把前 12 行倒过来：新的第 i 行 = 旧的第 11-i 行
  a.reorderRows("s1", 0, Array.from({ length: 12 }, (_, i) => 11 - i));
  b.setCell("s1", 5, 2, { v: "乙改的", t: 1 });
  settle();
  assertConverged(a, b);
  for (const side of [a, b]) {
    assert.equal(side.cell("s1", 6, 2).v, "乙改的", "原第 6 行排到了第 7 行，乙的改动跟着它");
    assert.equal(side.cell("s1", 0, 0).v, "11-0");
    assert.equal(side.cell("s1", 11, 0).v, "0-0");
  }
  assert.equal(a.calls.replace + b.calls.replace, 0);
});

test("排序很多行：一次 reorder 增量执行，结果与甲一致", () => {
  const snapshot = sampleWorkbook({ rows: 80, cols: 4, filled: 60 });
  const { a, b, settle } = seededPair(snapshot);
  a.calls.replace = b.calls.replace = 0;
  a.reorderRows("s1", 0, Array.from({ length: 60 }, (_, i) => 59 - i));
  b.setCell("s1", 10, 1, { v: "乙", t: 1 });
  settle();
  assertConverged(a, b);
  assert.equal(b.cell("s1", 49, 1).v, "乙");
  assert.equal(a.calls.replace + b.calls.replace, 0);
});

test("连续多次结构变化 + 各自改格子，最终两边一致", () => {
  const { a, b, settle } = seededPair();
  a.insertRows("s1", 1, 2);
  a.removeCols("s1", 0, 1);
  b.insertCols("s1", 4, 1);
  b.setCell("s1", 3, 4, { v: "乙新列", t: 1 });
  b.removeRows("s1", 9, 2);
  a.setCell("s1", 1, 0, { v: "甲新行", t: 1 });
  settle();
  assertConverged(a, b);
  settle();
  assertConverged(a, b);
  assert.ok(Object.values(values(a)).includes("乙新列"));
  assert.ok(Object.values(values(a)).includes("甲新行"));
});

test("本地结构变化即时写进行列顺序（不等去抖），别人那边马上看到行变了", () => {
  const { net, a, b } = seededPair();
  a.insertRows("s1", 0, 1);
  // 没有 tick（去抖没到）：行顺序已经在文档里了
  const stored = a.store.read();
  assert.equal(stored.s1.rows.length, 21);
  net.sync();
  assert.equal(b.store.read().s1.rows.length, 21);
  assert.equal(b.live.sheets.s1.rowCount, 21, "乙画布上已经多了一行");
});

// ── 老格式文档迁移 ──────────────────────────────────────────────────────────

function legacyDoc(snapshot) {
  const doc = new Y.Doc();
  writeJsonStateRoot(doc, GRID_COLLAB_ROOT, gridToEntities(snapshot));
  return doc;
}

test("老格式文档：打开后迁移一次，迁移前后的快照一致", () => {
  const snapshot = sampleWorkbook({ rows: 30, cols: 8, filled: 10 });
  snapshot.sheets.s1.rowData = { 2: { h: 33 } };
  snapshot.sheets.s1.mergeData = [{ startRow: 1, endRow: 2, startColumn: 0, endColumn: 1 }];
  const net = makeNetwork();
  Y.applyUpdate(net.a, Y.encodeStateAsUpdate(legacyDoc(snapshot)), "relay");
  net.sync();
  const before = gridFromY(net.a);
  assert.equal(readGridEntityState(net.a).layout, undefined, "迁移前没有布局");

  const placeholder = { id: "w", sheetOrder: [], sheets: {} };
  const a = makeClient({ doc: net.a, needsSeed: false, snapshot: placeholder });
  a.room.setStatus("synced");
  assert.ok(readGridEntityState(net.a).layout, "打开后迁移成行列 id 格式");
  assert.equal(a.binder.getLayout().s1.rows.length, 30);
  assert.deepEqual(normalizeGridSnapshot(gridFromY(net.a)), normalizeGridSnapshot(before), "迁移前后快照一致");
  assert.deepEqual(normalizeGridSnapshot(a.live), normalizeGridSnapshot(before), "画布也是同一本");

  // 迁移后老键没有残留
  const state = readGridEntityState(net.a);
  assert.ok(Object.keys(state.entities).every((key) => parseGridCellIdKey(key)), "格子键全是 id 键");
  net.sync();
  // 已经迁移过：第二个客户端打开不再迁移
  const b = makeClient({ doc: net.b, needsSeed: false, snapshot: placeholder });
  assert.equal(b.store.isLegacy(), false);
  assert.equal(b.store.migrate(), false, "已经是新格式，不会再迁一遍");
  b.room.setStatus("synced");
  assert.deepEqual(normalizeGridSnapshot(b.live), normalizeGridSnapshot(before));
});

test("两个客户端同时打开老文档：各自迁移也不会重复，两边结果完全相同", () => {
  const snapshot = sampleWorkbook({ rows: 25, cols: 6, filled: 8 });
  const net = makeNetwork();
  Y.applyUpdate(net.a, Y.encodeStateAsUpdate(legacyDoc(snapshot)), "relay");
  net.sync();
  const before = gridFromY(net.a);
  const placeholder = { id: "w", sheetOrder: [], sheets: {} };
  const a = makeClient({ doc: net.a, needsSeed: false, snapshot: placeholder });
  const b = makeClient({ doc: net.b, needsSeed: false, snapshot: placeholder });
  // 双方都还没收到对方的迁移：各自在本地迁移
  a.room.setStatus("synced");
  b.room.setStatus("synced");
  assert.ok(a.store.read() && b.store.read(), "双方各自迁移了");
  net.sync();
  for (let i = 0; i < 3; i += 1) {
    a.tick();
    b.tick();
    net.sync();
  }
  const rowsA = net.a.getMap(GRID_COLLAB_ROOT).get("rows:s1");
  const rowsB = net.b.getMap(GRID_COLLAB_ROOT).get("rows:s1");
  assert.equal(rowsA.length, 25, "行顺序数组里没有重复");
  assert.equal(rowsB.length, 25);
  assert.equal(net.a.getMap(GRID_COLLAB_ROOT).get("cols:s1").length, 6);
  assert.deepEqual(rowsA.toArray(), Array.from({ length: 25 }, (_, i) => `r${i}`));
  const stateA = readGridEntityState(net.a);
  const stateB = readGridEntityState(net.b);
  assert.deepEqual(stateA, stateB);
  assert.equal(Object.keys(stateA.entities).length, 8 * 6, "格子没有重复也没有丢");
  assert.deepEqual(normalizeGridSnapshot(gridFromY(net.a)), normalizeGridSnapshot(before));
  assert.deepEqual(normalizeGridSnapshot(a.live), normalizeGridSnapshot(before));
  assert.deepEqual(normalizeGridSnapshot(b.live), normalizeGridSnapshot(before));

  // 迁移之后继续同时编辑仍然正常
  a.insertRows("s1", 2, 1);
  b.setCell("s1", 5, 0, { v: "乙", t: 1 });
  for (let i = 0; i < 3; i += 1) {
    a.tick();
    b.tick();
    net.sync();
  }
  assert.equal(a.cell("s1", 6, 0).v, "乙");
  assert.equal(b.cell("s1", 6, 0).v, "乙");
});

test("migrateGridEntities：确定性，同样的输入永远同样的输出", () => {
  const input = gridToEntities(sampleWorkbook({ rows: 9, cols: 3, filled: 4 }));
  assert.deepEqual(migrateGridEntities(input), migrateGridEntities(structuredClone(input)));
});

test("老格式的回放：gridFromEntities 读老键给出同样的快照形状（回放画法不用改）", () => {
  const snapshot = sampleWorkbook({ rows: 12, cols: 4, filled: 5 });
  const legacy = gridToEntities(snapshot);
  const { layout, encoded } = migrateGridEntities(legacy);
  const fromLegacy = gridFromEntities(legacy, null);
  const fromIds = gridFromEntities({ ...encoded, layout }, null);
  assert.deepEqual(normalizeGridSnapshot(fromIds), normalizeGridSnapshot(fromLegacy));
  assert.deepEqual(Object.keys(fromIds.sheets.s1.cellData), Object.keys(fromLegacy.sheets.s1.cellData));
});

// ── 退路与只读 ──────────────────────────────────────────────────────────────

test("翻译不了的远端变化（条件格式等）才整张替换；本地没推出去的格子改动保留", () => {
  const { a, b, settle } = seededPair();
  a.calls.replace = b.calls.replace = 0;
  // 乙本地先改了一格（还没推）
  b.setCell("s1", 1, 1, { v: "乙没推的", t: 1 });
  // 甲加了「resources」（条件格式）：翻译不了
  a.edit((snapshot) => {
    snapshot.resources = [{ name: "SHEET_CONDITIONAL_FORMATTING_PLUGIN", data: "{}" }];
  });
  a.tick();
  settle();
  assert.equal(b.calls.replace >= 1, true, "只有这种变化才整张替换");
  assert.ok(b.calls.replaceReasons.some((reason) => reason.includes("resources")));
  assert.equal(b.cell("s1", 1, 1).v, "乙没推的", "乙没推出去的格子改动叠在远端状态上");
  assert.equal(a.cell("s1", 1, 1).v, "乙没推的");
});

test("只读的人：能看到别人的结构变化，自己的本地事件不写共享文档", () => {
  const net = makeNetwork();
  const a = makeClient({ doc: net.a, needsSeed: true, snapshot: sampleWorkbook() });
  net.sync();
  const placeholder = { id: "w", sheetOrder: [], sheets: {} };
  const viewer = makeClient({ doc: net.b, needsSeed: false, snapshot: placeholder, readOnly: true });
  viewer.room.setStatus("synced");
  net.sync();
  assert.equal(viewer.cell("s1", 3, 0).v, "3-0", "只读的人看得到内容");
  a.insertRows("s1", 0, 2);
  a.tick();
  net.sync();
  assert.equal(viewer.live.sheets.s1.rowCount, 22, "别人插的行只读的人也看得到");
  assert.equal(viewer.cell("s1", 5, 0).v, "3-0");

  const before = Y.encodeStateVector(net.b);
  viewer.insertRows("s1", 0, 1); // 假设菜单没灰（不应发生），也不能写进共享文档
  viewer.tick();
  assert.deepEqual(Y.encodeStateVector(net.b), before, "只读的人没有写任何东西");
  assert.equal(viewer.store.canWrite(), false);
});

test("老格式文档、没有布局存储：和第一轮一样按位置同步，结构变化整张替换", () => {
  const net = makeNetwork();
  const a = makeClient({ doc: net.a, needsSeed: true, snapshot: sampleWorkbook(), withStore: false });
  net.sync();
  const placeholder = { id: "w", sheetOrder: [], sheets: {} };
  const b = makeClient({ doc: net.b, needsSeed: false, snapshot: placeholder, withStore: false });
  b.room.setStatus("synced");
  assert.equal(b.cell("s1", 3, 0).v, "3-0");
  assert.equal(readGridEntityState(net.a).layout, undefined);
  a.setCell("s1", 0, 0, { v: "改", t: 1 });
  a.tick();
  net.sync();
  assert.equal(b.cell("s1", 0, 0).v, "改");
  assert.equal(a.binder.getLayout(), null);
});

test("种子：新文档直接按行列 id 格式写，回放读出来是按位置的老形状", () => {
  const { net, a } = seededPair();
  const state = readGridEntityState(net.a);
  assert.ok(state.layout, "新文档有行列布局");
  assert.equal(state.layout.s1.rows.length, 20);
  assert.ok(Object.keys(state.entities).every((key) => parseGridCellIdKey(key)));
  const root = net.a.getMap(GRID_COLLAB_ROOT);
  assert.equal(root.get("format"), "ids-v2");
  const json = root.toJSON();
  assert.ok(Array.isArray(json["rows:s1"]) && Array.isArray(json["cols:s1"]), "服务端按根转 JSON 时带着行列顺序");
  const replay = gridFromY(net.a);
  assert.equal(replay.sheets.s1.cellData[3][0].v, "3-0");
  assert.equal(replay.sheets.s1.rowCount, 20);
  assert.equal(a.room.seeded.length, 1);
  refApplyOp(replay, { kind: "insert", axis: "row", sheetId: "s1", at: 0, count: 1 });
});
