/**
 * W12：表格的回放画法（纯函数在 `collab/adapters/grid.ts`，画法在 `replay/work/frames/grid.tsx`）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GRID_ARTIFACT_PROJECT_SCHEMA,
  GRID_COLLAB_ROOT,
  GRID_FRAME_MAX_COLS,
  GRID_FRAME_MAX_ROWS,
  describeGridChange,
  gridFrameModel,
  gridFromRevision,
  gridFromY,
  gridToArtifactJson,
  gridToEntities,
} from "../src/shell/collab/adapters/grid.ts";

let Y = null;
try {
  Y = await import("yjs");
} catch {
  Y = null;
}

function revision() {
  return {
    id: "wb",
    name: "预算",
    sheetOrder: ["s1", "s2"],
    styles: { b: { bl: 1 } },
    sheets: {
      s1: {
        id: "s1",
        name: "收入",
        rowCount: 100,
        columnCount: 26,
        cellData: {
          0: { 0: { v: "项目", t: 1, s: "b" }, 1: { v: 100, t: 2 } },
          1: { 0: { v: "合计", t: 1 }, 1: { f: "=B1", v: 100, t: 2 } },
        },
      },
      s2: { id: "s2", name: "支出", rowCount: 20, columnCount: 8, cellData: { 0: { 0: { v: true, t: 3 } } } },
    },
  };
}

function writeToY(doc, encoded) {
  const root = doc.getMap(GRID_COLLAB_ROOT);
  const order = new Y.Array();
  const entities = new Y.Map();
  const meta = new Y.Map();
  root.set("order", order);
  root.set("entities", entities);
  root.set("meta", meta);
  for (const key of encoded.order) {
    const entity = new Y.Map();
    entities.set(key, entity);
    for (const [field, value] of Object.entries(encoded.entities[key])) entity.set(field, value);
    order.push([key]);
  }
  for (const [key, value] of Object.entries(encoded.meta)) meta.set(key, value);
}

test("fromRevision 与 fromY 对同一内容得到等价快照", { skip: !Y }, () => {
  const doc = new Y.Doc();
  writeToY(doc, gridToEntities(revision()));
  assert.deepEqual(gridFromY(doc), gridFromRevision(revision()));
});

test("fromRevision 认工程档外壳，认不出给空簿", () => {
  const wrapped = { schema: "oceanleo.grid.univer.v1", data: revision() };
  assert.deepEqual(gridFromRevision(wrapped), gridFromRevision(revision()));
  assert.deepEqual(gridFromRevision(null).sheetOrder, []);
  assert.deepEqual(gridFromRevision({ sheets: [] }).sheetOrder, []);
});

test("describeChange：填格子、清格子、新增工作表、改名、结构调整、没变化", () => {
  const base = revision();
  assert.equal(describeGridChange(base, base), null);

  const filled = revision();
  for (let r = 2; r < 14; r += 1) filled.sheets.s1.cellData[r] = { 0: { v: `行${r}`, t: 1 } };
  assert.equal(describeGridChange(base, filled), "填了 12 个单元格");

  const cleared = revision();
  delete cleared.sheets.s1.cellData[1];
  assert.equal(describeGridChange(base, cleared), "清空了 2 个单元格");

  const sheet = revision();
  sheet.sheetOrder.push("s3");
  sheet.sheets.s3 = { id: "s3", name: "新表", rowCount: 20, columnCount: 8, cellData: { 0: { 0: { v: "x" } } } };
  assert.equal(describeGridChange(base, sheet), "新增 1 张工作表", "新工作表里的格子不重复计");

  const renamed = revision();
  renamed.sheets.s2.name = "成本";
  assert.equal(describeGridChange(base, renamed), "改了 1 张工作表的名字");

  const resized = revision();
  resized.sheets.s1.columnData = { 0: { w: 200 } };
  assert.equal(describeGridChange(base, resized), "调整了表格的行列或格式");

  const mixed = revision();
  mixed.sheets.s1.cellData[0][1] = { v: 1, t: 2 };
  mixed.sheetOrder.push("s3");
  mixed.sheets.s3 = { id: "s3", name: "新表", rowCount: 20, columnCount: 8, cellData: {} };
  assert.equal(describeGridChange(base, mixed), "新增 1 张工作表，填了 1 个单元格");

  assert.equal(describeGridChange(null, base), "新增 2 张工作表");
});

test("toArtifactJson：快照还原成工程档，再读回来无损", () => {
  const snapshot = gridFromRevision(revision());
  const json = gridToArtifactJson(snapshot);
  assert.equal(json.schema, GRID_ARTIFACT_PROJECT_SCHEMA);
  assert.deepEqual(gridFromRevision(json), snapshot);
  assert.deepEqual(gridToEntities(json.data), gridToEntities(snapshot));
});

test("一帧要画的网格：前 50 行 × 20 列，有上一帧时标出变化的格子，并切到变化所在的表", () => {
  const base = gridFromRevision(revision());
  const model = gridFrameModel(base);
  assert.equal(model.sheetName, "收入");
  assert.equal(model.sheetCount, 2);
  assert.deepEqual(model.rows, [["项目", "100"], ["合计", "100"]]);
  assert.equal(model.changed.size, 0);

  const next = revision();
  next.sheets.s2.cellData[0][1] = { v: "新", t: 1 };
  const nextModel = gridFrameModel(gridFromRevision(next), base);
  assert.equal(nextModel.sheetName, "支出", "切到有变化的那张表");
  assert.deepEqual([...nextModel.changed], ["0:1"]);
  assert.deepEqual(nextModel.rows, [["TRUE", "新"]]);

  const big = revision();
  for (let r = 0; r < 120; r += 1) {
    big.sheets.s1.cellData[r] = {};
    for (let c = 0; c < 40; c += 1) big.sheets.s1.cellData[r][c] = { v: `${r}-${c}`, t: 1 };
  }
  const bigModel = gridFrameModel(gridFromRevision(big));
  assert.equal(bigModel.rows.length, GRID_FRAME_MAX_ROWS);
  assert.equal(bigModel.rows[0].length, GRID_FRAME_MAX_COLS);
  assert.equal(bigModel.totalRows, 120);
  assert.equal(bigModel.totalCols, 40);
});

test("画法源码：默认导出带齐五件套，不用 iframe / innerHTML / dangerouslySetInnerHTML", () => {
  const source = readFileSync("src/shell/replay/work/frames/grid.tsx", "utf8");
  assert.match(source, /kind: "grid"/);
  for (const field of ["fromY", "fromRevision", "Frame", "describeChange", "toArtifactJson"]) {
    assert.match(source, new RegExp(`\\b${field}\\b`), field);
  }
  const code = source.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /iframe/i);
  assert.doesNotMatch(code, /innerHTML/);
  assert.doesNotMatch(code, /dangerouslySetInnerHTML/);
});
