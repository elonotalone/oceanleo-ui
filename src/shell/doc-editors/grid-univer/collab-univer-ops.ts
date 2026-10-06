// 表格多人同改：Univer 一侧的翻译（work-chat 第二轮 F10）。
//
// - `structureEventFromCommand`：本机刚执行的 Univer mutation → 结构操作（插入 / 删除 / 移动行列、排序）；
// - `executeRemotePlan`：远端变化的增量计划 → 在本机用 Univer mutation 逐条执行，**不整张替换工作簿**
//   （整张替换会打断正在输入的人、丢选中、丢撤销栈）。
//
// 只依赖鸭子类型的 facade（`syncExecuteCommand`），不 import Univer；mutation 的参数形状取自
// `@univerjs/sheets@0.25.1`，并由 `tests/collab-grid-engine.test.mjs` 在真实的 Univer 引擎里逐条对照过。
//
// 翻译不了、会退回整张替换的：条件格式 / 数据校验 / 数字格式（resources）、冻结、工作表的其他设置
// （标签颜色、隐藏等）——见 `planGridRemote`。

import {
  gridSheetDims,
  type GridMetaOp,
  type GridRemotePlan,
  type GridStructureOp,
} from "./collab-layout-model";

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const UNIVER_INSERT_ROW = "sheet.mutation.insert-row";
export const UNIVER_REMOVE_ROWS = "sheet.mutation.remove-rows";
export const UNIVER_INSERT_COL = "sheet.mutation.insert-col";
export const UNIVER_REMOVE_COL = "sheet.mutation.remove-col";
export const UNIVER_MOVE_ROWS = "sheet.mutation.move-rows";
export const UNIVER_MOVE_COLS = "sheet.mutation.move-columns";
export const UNIVER_REORDER_RANGE = "sheet.mutation.reorder-range";
export const UNIVER_SET_RANGE_VALUES = "sheet.mutation.set-range-values";
export const UNIVER_SET_ROW_DATA = "sheet.mutation.set-row-data";
export const UNIVER_SET_COL_DATA = "sheet.mutation.set-col-data";
export const UNIVER_ADD_MERGE = "sheet.mutation.add-worksheet-merge";
export const UNIVER_REMOVE_MERGE = "sheet.mutation.remove-worksheet-merge";
export const UNIVER_SET_SHEET_NAME = "sheet.mutation.set-worksheet-name";
export const UNIVER_INSERT_SHEET = "sheet.mutation.insert-sheet";
export const UNIVER_REMOVE_SHEET = "sheet.mutation.remove-sheet";
export const UNIVER_SET_SHEET_ORDER = "sheet.mutation.set-worksheet-order";
export const UNIVER_SET_WORKBOOK_NAME = "sheet.mutation.set-workbook-name";

/** 这些 mutation 改的是行列结构（用来在本地事件里认出它们）。 */
export const UNIVER_STRUCTURE_MUTATIONS: readonly string[] = [
  UNIVER_INSERT_ROW,
  UNIVER_REMOVE_ROWS,
  UNIVER_INSERT_COL,
  UNIVER_REMOVE_COL,
  UNIVER_MOVE_ROWS,
  UNIVER_MOVE_COLS,
  UNIVER_REORDER_RANGE,
];

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function sheetOf(snapshot: unknown, sheetId: string): Rec | undefined {
  const sheets = isRec(snapshot) && isRec(snapshot.sheets) ? (snapshot.sheets as Rec) : {};
  const sheet = sheets[sheetId];
  return isRec(sheet) ? sheet : undefined;
}

function hasContent(cell: unknown): boolean {
  if (!isRec(cell)) return false;
  if (cell.v !== undefined && cell.v !== null && cell.v !== "") return true;
  if (typeof cell.f === "string" && cell.f) return true;
  if (isRec(cell.s) && Object.keys(cell.s).length > 0) return true;
  if (typeof cell.s === "string" && cell.s) return true;
  if (isRec(cell.p)) return true;
  return false;
}

/**
 * 这次排序是不是「整行」排序：被排序的那几行里，排序范围之外的列没有任何内容。
 * 是 → 行 id 跟着内容走（别人同时填的格子跟着那一行）；否 → 只有范围内的格子内容换了位置，按普通改格子处理。
 */
export function isFullRowReorder(
  snapshot: unknown,
  sheetId: string,
  range: { startRow: number; endRow: number; startColumn: number; endColumn: number },
): boolean {
  const sheet = sheetOf(snapshot, sheetId);
  if (!sheet) return false;
  const cellData = isRec(sheet.cellData) ? sheet.cellData : {};
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const line = cellData[String(row)];
    if (!isRec(line)) continue;
    for (const [col, cell] of Object.entries(line)) {
      const at = Number(col);
      if ((at < range.startColumn || at > range.endColumn) && hasContent(cell)) return false;
    }
  }
  return true;
}

/** 本机刚执行的 Univer 命令 → 结构操作；不是结构命令（或参数认不出）返回 null。 */
export function structureEventFromCommand(
  event: Rec,
  ctx: { unitId: string | undefined; getSnapshot: () => unknown },
): GridStructureOp | null {
  const id = event.id;
  if (typeof id !== "string" || !UNIVER_STRUCTURE_MUTATIONS.includes(id)) return null;
  const params = isRec(event.params) ? event.params : null;
  if (!params) return null;
  const sheetId = typeof params.subUnitId === "string" ? params.subUnitId : "";
  if (!sheetId) return null;
  if (ctx.unitId && typeof params.unitId === "string" && params.unitId !== ctx.unitId) return null;

  if (id === UNIVER_INSERT_ROW || id === UNIVER_REMOVE_ROWS) {
    const range = isRec(params.range) ? params.range : null;
    const start = int(range?.startRow);
    const end = int(range?.endRow);
    if (start === null || end === null || end < start) return null;
    return id === UNIVER_INSERT_ROW
      ? { kind: "insert", axis: "row", sheetId, at: start, count: end - start + 1 }
      : { kind: "remove", axis: "row", sheetId, at: start, count: end - start + 1 };
  }
  if (id === UNIVER_INSERT_COL || id === UNIVER_REMOVE_COL) {
    const range = isRec(params.range) ? params.range : null;
    const start = int(range?.startColumn);
    const end = int(range?.endColumn);
    if (start === null || end === null || end < start) return null;
    return id === UNIVER_INSERT_COL
      ? { kind: "insert", axis: "col", sheetId, at: start, count: end - start + 1 }
      : { kind: "remove", axis: "col", sheetId, at: start, count: end - start + 1 };
  }
  if (id === UNIVER_MOVE_ROWS || id === UNIVER_MOVE_COLS) {
    const rows = id === UNIVER_MOVE_ROWS;
    const source = isRec(params.sourceRange) ? params.sourceRange : null;
    const target = isRec(params.targetRange) ? params.targetRange : null;
    const from = int(rows ? source?.startRow : source?.startColumn);
    const end = int(rows ? source?.endRow : source?.endColumn);
    const dest = int(rows ? target?.startRow : target?.startColumn);
    if (from === null || end === null || dest === null || end < from) return null;
    const count = end - from + 1;
    const to = dest > from ? dest - count : dest;
    if (to === from) return null;
    return { kind: "move", axis: rows ? "row" : "col", sheetId, from, count, to };
  }
  // 排序：reorder-range，`order[新行] = 旧行`。
  const range = isRec(params.range) ? params.range : null;
  const order = isRec(params.order) ? params.order : null;
  if (!range || !order) return null;
  const startRow = int(range.startRow);
  const endRow = int(range.endRow);
  const startColumn = int(range.startColumn);
  const endColumn = int(range.endColumn);
  if (startRow === null || endRow === null || startColumn === null || endColumn === null) return null;
  if (!isFullRowReorder(ctx.getSnapshot(), sheetId, { startRow, endRow, startColumn, endColumn })) {
    return null;
  }
  const perm: number[] = [];
  for (let row = startRow; row <= endRow; row += 1) {
    const source = order[String(row)];
    perm.push(typeof source === "number" && Number.isInteger(source) ? source - startRow : row - startRow);
  }
  if (perm.some((value) => value < 0 || value > endRow - startRow)) return null;
  if (perm.every((value, i) => value === i)) return null;
  return { kind: "reorder", sheetId, start: startRow, order: perm, cols: 0 };
}

export interface UniverCommandRunner {
  syncExecuteCommand?(id: string, params?: Rec, options?: Rec): unknown;
}

type Dims = { rows: number; cols: number };

/**
 * 在本机执行远端变化的计划。顺序：删工作表 → 行列结构 → 行高列宽 / 合并区域 → 格子 → 新工作表 / 改名 / 排序 / 工作簿名。
 * 任何一步失败（返回 false 或抛错）整体返回 false，调用方退回整张替换。
 * 调用方负责在外面屏蔽本地变更事件。
 */
export function executeRemotePlan(
  plan: GridRemotePlan,
  ctx: {
    api: UniverCommandRunner;
    unitId: string;
    snapshot: unknown;
    cellValue: (cell: Rec) => Rec;
  },
): boolean {
  const { api, unitId } = ctx;
  if (!api.syncExecuteCommand) return false;
  const dims = new Map<string, Dims>();
  const dimsOf = (sheetId: string): Dims => {
    let d = dims.get(sheetId);
    if (!d) {
      d = gridSheetDims(sheetOf(ctx.snapshot, sheetId));
      dims.set(sheetId, d);
    }
    return d;
  };
  const run = (id: string, params: Rec): boolean => {
    try {
      return api.syncExecuteCommand!(id, { unitId, ...params }) !== false;
    } catch {
      return false;
    }
  };

  const metaOf = (kind: GridMetaOp["kind"]) => plan.meta.filter((op) => op.kind === kind);

  for (const op of metaOf("sheet-remove")) {
    if (op.kind !== "sheet-remove") continue;
    if (!run(UNIVER_REMOVE_SHEET, { subUnitId: op.sheetId, subUnitName: op.name })) return false;
  }

  for (const op of plan.structure) {
    const d = dimsOf(op.sheetId);
    const rowEnd = Math.max(0, d.rows - 1);
    const colEnd = Math.max(0, d.cols - 1);
    if (op.kind === "insert") {
      if (op.axis === "row") {
        const range = { startRow: op.at, endRow: op.at + op.count - 1, startColumn: 0, endColumn: colEnd };
        if (!run(UNIVER_INSERT_ROW, { subUnitId: op.sheetId, range })) return false;
        d.rows += op.count;
      } else {
        const range = { startColumn: op.at, endColumn: op.at + op.count - 1, startRow: 0, endRow: rowEnd };
        if (!run(UNIVER_INSERT_COL, { subUnitId: op.sheetId, range })) return false;
        d.cols += op.count;
      }
    } else if (op.kind === "remove") {
      if (op.axis === "row") {
        const range = { startRow: op.at, endRow: op.at + op.count - 1, startColumn: 0, endColumn: colEnd };
        if (!run(UNIVER_REMOVE_ROWS, { subUnitId: op.sheetId, range })) return false;
        d.rows = Math.max(0, d.rows - op.count);
      } else {
        const range = { startColumn: op.at, endColumn: op.at + op.count - 1, startRow: 0, endRow: rowEnd };
        if (!run(UNIVER_REMOVE_COL, { subUnitId: op.sheetId, range })) return false;
        d.cols = Math.max(0, d.cols - op.count);
      }
    } else if (op.kind === "move") {
      // Univer 的目标位置是「移动之前」的坐标：向后移动时块要落在 target 之前。
      const target = op.to > op.from ? op.to + op.count : op.to;
      if (op.axis === "row") {
        const ok = run(UNIVER_MOVE_ROWS, {
          subUnitId: op.sheetId,
          sourceRange: { startRow: op.from, endRow: op.from + op.count - 1, startColumn: 0, endColumn: colEnd },
          targetRange: { startRow: target, endRow: target, startColumn: 0, endColumn: colEnd },
        });
        if (!ok) return false;
      } else {
        const ok = run(UNIVER_MOVE_COLS, {
          subUnitId: op.sheetId,
          sourceRange: { startColumn: op.from, endColumn: op.from + op.count - 1, startRow: 0, endRow: rowEnd },
          targetRange: { startColumn: target, endColumn: target, startRow: 0, endRow: rowEnd },
        });
        if (!ok) return false;
      }
    } else {
      const length = op.order.length;
      const order: Record<string, number> = {};
      op.order.forEach((source, i) => {
        order[String(op.start + i)] = op.start + source;
      });
      const ok = run(UNIVER_REORDER_RANGE, {
        subUnitId: op.sheetId,
        range: { startRow: op.start, endRow: op.start + length - 1, startColumn: 0, endColumn: colEnd },
        order,
      });
      if (!ok) return false;
    }
  }

  for (const op of plan.meta) {
    if (op.kind === "row-data") {
      if (!run(UNIVER_SET_ROW_DATA, { subUnitId: op.sheetId, rowData: op.data })) return false;
    } else if (op.kind === "col-data") {
      if (!run(UNIVER_SET_COL_DATA, { subUnitId: op.sheetId, columnData: op.data })) return false;
    } else if (op.kind === "merge") {
      if (op.remove.length > 0 && !run(UNIVER_REMOVE_MERGE, { subUnitId: op.sheetId, ranges: op.remove })) {
        return false;
      }
      if (op.add.length > 0 && !run(UNIVER_ADD_MERGE, { subUnitId: op.sheetId, ranges: op.add })) {
        return false;
      }
    }
  }

  const bySheet = new Map<string, Record<number, Record<number, unknown>>>();
  for (const change of plan.cells) {
    const rows = bySheet.get(change.sheetId) ?? {};
    (rows[change.row] ??= {})[change.col] = change.cell ? ctx.cellValue(change.cell) : null;
    bySheet.set(change.sheetId, rows);
  }
  for (const [subUnitId, cellValue] of bySheet) {
    if (!run(UNIVER_SET_RANGE_VALUES, { subUnitId, cellValue })) return false;
  }

  for (const op of plan.meta) {
    if (op.kind === "sheet-insert") {
      if (!run(UNIVER_INSERT_SHEET, { index: op.index, sheet: JSON.parse(JSON.stringify(op.sheet)) })) {
        return false;
      }
    } else if (op.kind === "sheet-name") {
      if (!run(UNIVER_SET_SHEET_NAME, { subUnitId: op.sheetId, name: op.name })) return false;
    } else if (op.kind === "workbook-name") {
      if (!run(UNIVER_SET_WORKBOOK_NAME, { name: op.name })) return false;
    }
  }
  for (const op of plan.meta) {
    if (op.kind !== "sheet-order") continue;
    op.order.forEach((sheetId, index) => {
      run(UNIVER_SET_SHEET_ORDER, { subUnitId: sheetId, order: index });
    });
  }
  return true;
}
