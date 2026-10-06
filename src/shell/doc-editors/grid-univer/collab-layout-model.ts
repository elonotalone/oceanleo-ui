// 表格多人同改：稳定行列 id 的纯函数层（work-chat 第二轮 F10）。
//
// 为什么要有它：第一轮格子按位置存（`sheet!row!col`），插一行下面所有格子的位置都变，只能整张替换，
// 后到的人把先到的人整张覆盖。这里给每张工作表一份「行 id 顺序」和一份「列 id 顺序」，格子按
// `sheet!rowId!colId` 存：插行 = 往行顺序里插一个新 id，删行 = 删掉那个 id，排序 = 只改行顺序，
// 格子内容不搬，所以别人同时填的格子永远跟着它自己所在的行列走。
//
// 本文件不 import `yjs`、不 import Univer，只放：id / 布局的纯函数、结构操作（插入 / 删除 / 移动 / 排序）
// 作用在布局上的语义、两份 id 顺序的差分（远端变化 → 本地要执行的结构操作）、
// 以及「远端变化 → 增量计划」（`planGridRemote`）。Y.Array 的读写在 `collab-layout-store.ts`。

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 键顺序固定的 JSON（用来比较两个值是否相同）。 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRec(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// ── 常量与类型 ──────────────────────────────────────────────────────────────

/** 共享文档根 Map 里的格式标记：有它 = 格子按行列 id 存。 */
export const GRID_LAYOUT_FORMAT_KEY = "format";
export const GRID_LAYOUT_FORMAT = "ids-v2";
export const GRID_LAYOUT_ROWS_PREFIX = "rows:";
export const GRID_LAYOUT_COLS_PREFIX = "cols:";

export type GridAxis = "row" | "col";

export interface GridSheetLayout {
  rows: string[];
  cols: string[];
}

/** 工作表 id → 行 id 顺序 / 列 id 顺序。 */
export type GridLayout = Record<string, GridSheetLayout>;

/**
 * 结构操作。索引都是「操作发生那一刻」的位置：
 * - insert：在 `at` 前插入 `count` 行/列；远端操作带 `ids`，本地事件不带（由绑定器分配）。
 * - remove：删掉从 `at` 起的 `count` 行/列。
 * - move：把从 `from` 起的 `count` 行/列取出，再插回去，使这一块的第一项落在 `to`（取出之后的下标）。
 * - reorder：只用于行（排序）：`start` 起的这一段，新的第 i 行 = 旧的第 `order[i]` 行（`order` 相对 `start`）；
 *   `cols` 是列数（给 Univer 的范围用）。
 */
export type GridStructureOp =
  | { kind: "insert"; axis: GridAxis; sheetId: string; at: number; count: number; ids?: string[] }
  | { kind: "remove"; axis: GridAxis; sheetId: string; at: number; count: number }
  | { kind: "move"; axis: GridAxis; sheetId: string; from: number; count: number; to: number }
  | { kind: "reorder"; sheetId: string; start: number; order: number[]; cols: number };

export interface GridRangeLike {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  [key: string]: unknown;
}

export type GridMetaOp =
  | { kind: "row-data"; sheetId: string; data: Record<string, Rec | null> }
  | { kind: "col-data"; sheetId: string; data: Record<string, Rec | null> }
  | { kind: "merge"; sheetId: string; remove: GridRangeLike[]; add: GridRangeLike[] }
  | { kind: "sheet-name"; sheetId: string; name: string }
  | { kind: "sheet-insert"; sheetId: string; index: number; sheet: Rec }
  | { kind: "sheet-remove"; sheetId: string; name: string }
  | { kind: "sheet-order"; order: string[] }
  | { kind: "workbook-name"; name: string };

export interface GridPlanCell {
  sheetId: string;
  row: number;
  col: number;
  cell: Rec | null;
}

export interface GridRemotePlan {
  /** 有翻译不了的变化：调用方退回整张替换。 */
  fallback: boolean;
  /** 退回整张替换的原因（给日志与交付说明用）。 */
  reason: string;
  structure: GridStructureOp[];
  meta: GridMetaOp[];
  cells: GridPlanCell[];
  /** 没有任何要执行的东西。 */
  empty: boolean;
}

/** 行列 id 布局在共享文档里的存取（实现见 `collab-layout-store.ts`，绑定器只认这个形状）。 */
export interface GridLayoutStore {
  /** 读出行列 id 布局；文档还是老格式（或还没内容）返回 null。 */
  read(): GridLayout | null;
  /** 文档里有按位置存的格子 / 工作表设置，但还没有行列 id 格式标记。 */
  isLegacy(): boolean;
  /** 当前账号能不能写（只读的人不写）。 */
  canWrite(): boolean;
  /** 一次事务里做完一批写入（多个小写入合成一次远端更新）。 */
  batch(fn: () => void): void;
  /** 种子：写格式标记和整套布局（并入种子事务）。 */
  seed(layout: GridLayout): void;
  /** 一个本地结构操作：按位置精确写进对应的数组。 */
  applyLocal(op: GridStructureOp): void;
  /** 让文档里的布局和 `layout` 一致（补新工作表、行列数变化、删掉已不存在的工作表）。 */
  sync(layout: GridLayout, removedSheets?: readonly string[]): void;
  /** 老格式文档就地迁移成行列 id 格式；已经迁移过 / 没东西可迁返回 false。 */
  migrate(): boolean;
  /** 删掉数组里后出现的重复 id。返回删了几个。 */
  dedupe(): number;
}

// ── id ──────────────────────────────────────────────────────────────────────

let idSeq = 0;

/** 新行 / 新列 id：不含 `!`，永远不是纯数字，也不会和 `legacyGridId` 撞。 */
export function newGridLayoutId(): string {
  idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `g${Date.now().toString(36)}${rand}${idSeq.toString(36)}`;
}

/** 老文档就地迁移时的确定性 id：两个客户端同时迁移得到的内容完全一样。 */
export function legacyGridId(axis: GridAxis, index: number): string {
  return `${axis === "row" ? "r" : "c"}${index}`;
}

/** 布局没覆盖到的位置（理论上不会发生：绑定器先 fit 再编码）用的兜底 id，不会和别的撞。 */
export function strayGridId(axis: GridAxis, index: number): string {
  return `x${axis === "row" ? "r" : "c"}${index}`;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeGridId(id: unknown): id is string {
  return typeof id === "string" && SAFE_ID.test(id);
}

export function gridCellIdKey(sheetId: string, rowId: string, colId: string): string {
  return `${sheetId}!${rowId}!${colId}`;
}

/** 解析 `sheet!rowId!colId`；行列 id 不含 `!`，工作表 id 可以。老格式（纯数字行列）返回 null。 */
export function parseGridCellIdKey(
  key: string,
): { sheetId: string; rowId: string; colId: string } | null {
  const colAt = key.lastIndexOf("!");
  if (colAt <= 0) return null;
  const rowAt = key.lastIndexOf("!", colAt - 1);
  if (rowAt <= 0) return null;
  const sheetId = key.slice(0, rowAt);
  const rowId = key.slice(rowAt + 1, colAt);
  const colId = key.slice(colAt + 1);
  if (!sheetId || !isSafeGridId(rowId) || !isSafeGridId(colId)) return null;
  if (/^\d+$/.test(rowId) || /^\d+$/.test(colId)) return null;
  return { sheetId, rowId, colId };
}

export function gridLayoutKey(axis: GridAxis, sheetId: string): string {
  return `${axis === "row" ? GRID_LAYOUT_ROWS_PREFIX : GRID_LAYOUT_COLS_PREFIX}${sheetId}`;
}

// ── 布局 ────────────────────────────────────────────────────────────────────

export function cloneGridLayout(layout: GridLayout): GridLayout {
  const out: GridLayout = {};
  for (const [sheetId, sheet] of Object.entries(layout)) {
    out[sheetId] = { rows: sheet.rows.slice(), cols: sheet.cols.slice() };
  }
  return out;
}

export function sameGridLayout(a: GridLayout, b: GridLayout): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function indexMap(ids: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  ids.forEach((id, i) => {
    if (!map.has(id)) map.set(id, i);
  });
  return map;
}

function numericKeys(record: Rec): number[] {
  return Object.keys(record)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);
}

/** 一张工作表需要的行数 / 列数：声明的数量与实际有内容的最远格子，取大的。 */
export function gridSheetDims(sheet: Rec | undefined): { rows: number; cols: number } {
  if (!isRec(sheet)) return { rows: 0, cols: 0 };
  let rows = typeof sheet.rowCount === "number" && sheet.rowCount > 0 ? Math.floor(sheet.rowCount) : 0;
  let cols =
    typeof sheet.columnCount === "number" && sheet.columnCount > 0
      ? Math.floor(sheet.columnCount)
      : 0;
  const cellData = isRec(sheet.cellData) ? sheet.cellData : {};
  for (const row of numericKeys(cellData)) {
    const line = cellData[String(row)];
    if (!isRec(line)) continue;
    for (const col of numericKeys(line)) {
      rows = Math.max(rows, row + 1);
      cols = Math.max(cols, col + 1);
    }
  }
  return { rows, cols };
}

interface SnapshotLike {
  sheetOrder?: string[];
  sheets?: Record<string, Rec>;
}

function sheetIdsOf(state: SnapshotLike): string[] {
  const sheets = isRec(state?.sheets) ? (state.sheets as Record<string, Rec>) : {};
  const declared = Array.isArray(state?.sheetOrder)
    ? state.sheetOrder.filter((id): id is string => typeof id === "string" && id in sheets)
    : [];
  const rest = Object.keys(sheets)
    .filter((id) => !declared.includes(id))
    .sort();
  return [...declared, ...rest];
}

/** 老文档 / 种子：按快照的行列数造确定性 id（r0 r1 … / c0 c1 …）。 */
export function initialGridLayout(state: SnapshotLike): GridLayout {
  const layout: GridLayout = {};
  const sheets = isRec(state?.sheets) ? (state.sheets as Record<string, Rec>) : {};
  for (const sheetId of sheetIdsOf(state)) {
    const dims = gridSheetDims(sheets[sheetId]);
    layout[sheetId] = {
      rows: Array.from({ length: dims.rows }, (_, i) => legacyGridId("row", i)),
      cols: Array.from({ length: dims.cols }, (_, i) => legacyGridId("col", i)),
    };
  }
  return layout;
}

export interface GridLayoutFit {
  layout: GridLayout;
  changed: boolean;
  /** 快照里已经没有的工作表。 */
  removed: string[];
}

/**
 * 让布局与画布对齐：新工作表补出一份布局；行列数多了在尾部补新 id，少了从尾部截掉；
 * 画布里没有的工作表丢掉。其余部分原样保留，所以本地结构命令已经精确维护好的 id 不会被打乱。
 */
export function fitGridLayout(
  state: SnapshotLike,
  layout: GridLayout,
  makeId: () => string = newGridLayoutId,
): GridLayoutFit {
  const sheets = isRec(state?.sheets) ? (state.sheets as Record<string, Rec>) : {};
  const present = sheetIdsOf(state);
  const next: GridLayout = {};
  let changed = false;
  for (const sheetId of present) {
    const dims = gridSheetDims(sheets[sheetId]);
    const have = layout[sheetId];
    const rows = have ? have.rows.slice() : [];
    const cols = have ? have.cols.slice() : [];
    if (!have) changed = true;
    while (rows.length < dims.rows) {
      rows.push(makeId());
      changed = true;
    }
    if (rows.length > dims.rows) {
      rows.length = dims.rows;
      changed = true;
    }
    while (cols.length < dims.cols) {
      cols.push(makeId());
      changed = true;
    }
    if (cols.length > dims.cols) {
      cols.length = dims.cols;
      changed = true;
    }
    next[sheetId] = { rows, cols };
  }
  const removed = Object.keys(layout).filter((id) => !present.includes(id));
  if (removed.length > 0) changed = true;
  return { layout: next, changed, removed };
}

/** 把一个结构操作作用在布局上；返回新布局和补全了 id 的操作（插入时本地事件没有 ids）。 */
export function applyGridStructureOp(
  layout: GridLayout,
  op: GridStructureOp,
  makeId: () => string = newGridLayoutId,
): { layout: GridLayout; op: GridStructureOp } {
  const next = cloneGridLayout(layout);
  const sheet = (next[op.sheetId] ??= { rows: [], cols: [] });
  if (op.kind === "reorder") {
    const arr = sheet.rows;
    const old = arr.slice(op.start, op.start + op.order.length);
    op.order.forEach((source, i) => {
      const id = old[source];
      if (id !== undefined) arr[op.start + i] = id;
    });
    return { layout: next, op };
  }
  const arr = op.axis === "row" ? sheet.rows : sheet.cols;
  if (op.kind === "insert") {
    const at = Math.max(0, Math.min(op.at, arr.length));
    const ids =
      Array.isArray(op.ids) && op.ids.length === op.count
        ? op.ids
        : Array.from({ length: op.count }, () => makeId());
    arr.splice(at, 0, ...ids);
    return { layout: next, op: { ...op, at, ids } };
  }
  if (op.kind === "remove") {
    arr.splice(op.at, op.count);
    return { layout: next, op };
  }
  const block = arr.splice(op.from, op.count);
  arr.splice(Math.max(0, Math.min(op.to, arr.length)), 0, ...block);
  return { layout: next, op };
}

// ── 两份 id 顺序的差分 ──────────────────────────────────────────────────────

/** 最长递增子序列：返回被保留（不用移动）的下标。 */
function lisKeep(values: number[]): Set<number> {
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev: number[] = new Array(values.length).fill(-1);
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i]!;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1]! : -1;
  }
  const keep = new Set<number>();
  let k = tailIdx.length ? tailIdx[tailIdx.length - 1]! : -1;
  while (k >= 0) {
    keep.add(k);
    k = prev[k]!;
  }
  return keep;
}

export const GRID_MAX_SINGLE_MOVES = 24;

/**
 * 从 `from` 变成 `to` 要执行的结构操作：先删（从后往前）、再移动留下来的项、最后插入新项（从前往后）。
 * 行方向上移动的项很多（排序）时合成一个 `reorder`。两边都不应有重复 id。
 */
export function diffGridIdSequence(
  sheetId: string,
  axis: GridAxis,
  from: readonly string[],
  to: readonly string[],
  cols = 0,
): GridStructureOp[] {
  const ops: GridStructureOp[] = [];
  const toSet = new Set(to);
  const keep = from.map((id) => toSet.has(id));
  let i = from.length - 1;
  while (i >= 0) {
    if (keep[i]) {
      i -= 1;
      continue;
    }
    let j = i;
    while (j > 0 && !keep[j - 1]) j -= 1;
    ops.push({ kind: "remove", axis, sheetId, at: j, count: i - j + 1 });
    i = j - 1;
  }
  let working = from.filter((id) => toSet.has(id));
  const workSet = new Set(working);
  const commonTo = to.filter((id) => workSet.has(id));

  // 留下来的项顺序不一致：移动。
  if (working.some((id, idx) => id !== commonTo[idx])) {
    const pos = new Map<string, number>();
    commonTo.forEach((id, idx) => pos.set(id, idx));
    const stay = lisKeep(working.map((id) => pos.get(id) ?? -1));
    const stayIds = new Set(working.filter((_, idx) => stay.has(idx)));
    const moving = commonTo.filter((id) => !stayIds.has(id));
    if (axis === "row" && moving.length > GRID_MAX_SINGLE_MOVES) {
      const oldIndex = new Map<string, number>();
      working.forEach((id, idx) => oldIndex.set(id, idx));
      ops.push({
        kind: "reorder",
        sheetId,
        start: 0,
        order: commonTo.map((id) => oldIndex.get(id) ?? 0),
        cols,
      });
      working = commonTo.slice();
    } else {
      for (const id of moving) {
        const fromAt = working.indexOf(id);
        working.splice(fromAt, 1);
        const p = pos.get(id)!;
        const predecessor = p > 0 ? commonTo[p - 1] : undefined;
        const toAt = predecessor === undefined ? 0 : working.indexOf(predecessor) + 1;
        working.splice(toAt, 0, id);
        if (toAt !== fromAt) ops.push({ kind: "move", axis, sheetId, from: fromAt, count: 1, to: toAt });
      }
    }
  }

  // 新项：working 与 to 的公共部分已对齐，从前往后成段插入。
  let k = 0;
  while (k < to.length) {
    if (workSet.has(to[k]!)) {
      k += 1;
      continue;
    }
    let e = k;
    while (e + 1 < to.length && !workSet.has(to[e + 1]!)) e += 1;
    const ids = to.slice(k, e + 1);
    ops.push({ kind: "insert", axis, sheetId, at: k, count: ids.length, ids });
    working.splice(k, 0, ...ids);
    for (const id of ids) workSet.add(id);
    k = e + 1;
  }
  return ops;
}

// ── 工作表 meta 里的位置 ⇄ id ──────────────────────────────────────────────

const MERGE_ID_KEYS = ["sr", "er", "sc", "ec"] as const;

function rangeToIds(range: Rec, ls: GridSheetLayout): Rec | null {
  const sr = ls.rows[Number(range.startRow)];
  const er = ls.rows[Number(range.endRow)];
  const sc = ls.cols[Number(range.startColumn)];
  const ec = ls.cols[Number(range.endColumn)];
  if (!sr || !er || !sc || !ec) return null;
  const rest: Rec = {};
  for (const [key, value] of Object.entries(range)) {
    if (!["startRow", "endRow", "startColumn", "endColumn"].includes(key)) rest[key] = value;
  }
  return { ...rest, sr, er, sc, ec };
}

function rangeFromIds(
  entry: unknown,
  rows: Map<string, number>,
  cols: Map<string, number>,
): GridRangeLike | null {
  if (!isRec(entry)) return null;
  const sr = rows.get(String(entry.sr));
  const er = rows.get(String(entry.er));
  const sc = cols.get(String(entry.sc));
  const ec = cols.get(String(entry.ec));
  if (sr === undefined || er === undefined || sc === undefined || ec === undefined) return null;
  const rest: Rec = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!(MERGE_ID_KEYS as readonly string[]).includes(key)) rest[key] = value;
  }
  return {
    ...rest,
    startRow: Math.min(sr, er),
    endRow: Math.max(sr, er),
    startColumn: Math.min(sc, ec),
    endColumn: Math.max(sc, ec),
  };
}

function dataByIds(data: unknown, ids: readonly string[], axis: GridAxis): Rec | undefined {
  if (!isRec(data)) return undefined;
  const out: Rec = {};
  for (const key of numericKeys(data)) {
    const id = ids[key] ?? strayGridId(axis, key);
    out[id] = clone(data[String(key)]);
  }
  return out;
}

function dataByPosition(data: unknown, ids: readonly string[]): Rec | undefined {
  if (!isRec(data)) return undefined;
  const index = indexMap(ids);
  const out: Rec = {};
  const entries: Array<[number, unknown]> = [];
  for (const [id, value] of Object.entries(data)) {
    const at = index.get(id);
    if (at !== undefined) entries.push([at, value]);
  }
  entries.sort((a, b) => a[0] - b[0]);
  for (const [at, value] of entries) out[String(at)] = clone(value);
  return out;
}

/** 位置形式的工作表设置 → id 形式（行高列宽按行列 id 存，合并区域按两端的行列 id 存，行列数由布局决定）。 */
export function gridSheetMetaToIds(sheetMeta: Rec, ls: GridSheetLayout): Rec {
  const out = clone(sheetMeta);
  delete out.rowCount;
  delete out.columnCount;
  if (out.rowData !== undefined) out.rowData = dataByIds(out.rowData, ls.rows, "row") ?? {};
  if (out.columnData !== undefined) out.columnData = dataByIds(out.columnData, ls.cols, "col") ?? {};
  if (Array.isArray(out.mergeData)) {
    out.mergeData = (out.mergeData as unknown[])
      .map((entry) => (isRec(entry) ? rangeToIds(entry, ls) : null))
      .filter((entry): entry is Rec => entry !== null);
  }
  return out;
}

/** id 形式的工作表设置 → 位置形式；认不出的行列 id（已被删掉）对应的项丢掉。 */
export function gridSheetMetaFromIds(sheetMeta: Rec, ls: GridSheetLayout): Rec {
  const out = clone(sheetMeta);
  out.rowCount = ls.rows.length;
  out.columnCount = ls.cols.length;
  if (out.rowData !== undefined) out.rowData = dataByPosition(out.rowData, ls.rows) ?? {};
  if (out.columnData !== undefined) out.columnData = dataByPosition(out.columnData, ls.cols) ?? {};
  if (Array.isArray(out.mergeData)) {
    const rows = indexMap(ls.rows);
    const cols = indexMap(ls.cols);
    out.mergeData = (out.mergeData as unknown[])
      .map((entry) => rangeFromIds(entry, rows, cols))
      .filter((entry): entry is GridRangeLike => entry !== null);
  }
  return out;
}

// ── 远端变化 → 增量计划 ─────────────────────────────────────────────────────

export interface GridPlanEntities {
  entities: Record<string, Record<string, unknown>>;
  meta: Record<string, unknown>;
  layout?: GridLayout;
}

interface PlanSnapshot extends SnapshotLike {
  name?: string;
  sheets?: Record<string, Rec>;
}

const SHEET_PREFIX = "sheet:";
const IGNORED_TOP_META = new Set(["sheetOrder", "workbook", "resources"]);

function sheetMetaIds(meta: Rec): string[] {
  return Object.keys(meta)
    .filter((key) => key.startsWith(SHEET_PREFIX))
    .map((key) => key.slice(SHEET_PREFIX.length));
}

function normalizeMerges(list: unknown): string {
  if (!Array.isArray(list)) return "[]";
  return stableStringify(
    list
      .filter(isRec)
      .map((m) => ({
        startRow: m.startRow,
        endRow: m.endRow,
        startColumn: m.startColumn,
        endColumn: m.endColumn,
      }))
      .sort(
        (a, b) =>
          Number(a.startRow) - Number(b.startRow) || Number(a.startColumn) - Number(b.startColumn),
      ),
  );
}

function emptyPlan(reason = ""): GridRemotePlan {
  return { fallback: false, reason, structure: [], meta: [], cells: [], empty: true };
}

function fallbackPlan(reason: string): GridRemotePlan {
  return { fallback: true, reason, structure: [], meta: [], cells: [], empty: false };
}

/**
 * 远端状态 `remote` 相对上次对齐的 `base` 变了什么，翻译成 Univer 能增量执行的操作。
 *
 * - 行列：`localLayout`（画布现在的行列 id）→ `remote.layout` 的差分；
 * - 行高列宽 / 工作表改名、增删、换顺序 / 工作簿改名：按 id 比较 meta 后直接给出；
 * - 合并区域：用位置比较「画布现在的」和「远端的」（原生命令不会替我们挪合并区域，所以不能只比 id）；
 * - 格子：按 id 键比较，位置用远端布局解析（行列已被删掉的格子不用管）；
 * - 冻结、条件格式 / 数据校验（resources）等没法逐项翻译的变化：`fallback`。
 */
export function planGridRemote(args: {
  base: GridPlanEntities;
  localLayout: GridLayout;
  remote: GridPlanEntities;
  remoteSnapshot: PlanSnapshot;
  live: PlanSnapshot;
}): GridRemotePlan {
  const { base, localLayout, remote, remoteSnapshot, live } = args;
  const remoteLayout = remote.layout;
  if (!remoteLayout) return fallbackPlan("远端文档不是行列 id 格式");
  const bm = base.meta ?? {};
  const rm = remote.meta ?? {};

  // 没法逐项翻译的顶层 meta。
  const topKeys = new Set([...Object.keys(bm), ...Object.keys(rm)]);
  for (const key of topKeys) {
    if (key.startsWith(SHEET_PREFIX) || IGNORED_TOP_META.has(key)) continue;
    if (stableStringify(bm[key]) !== stableStringify(rm[key])) return fallbackPlan(`meta:${key}`);
  }
  if (stableStringify(bm.resources) !== stableStringify(rm.resources)) {
    return fallbackPlan("resources（条件格式 / 数据校验 / 数字格式）");
  }

  const baseSheets = new Set(sheetMetaIds(bm));
  const remoteSheets = sheetMetaIds(rm);
  const remoteSet = new Set(remoteSheets);
  const liveSheets = isRec(live?.sheets) ? (live.sheets as Record<string, Rec>) : {};
  const remoteSnapSheets = isRec(remoteSnapshot?.sheets)
    ? (remoteSnapshot.sheets as Record<string, Rec>)
    : {};

  const structure: GridStructureOp[] = [];
  const meta: GridMetaOp[] = [];
  const touched = new Set<string>();

  // 工作表增删：本地新建还没推出去的表（不在 base 里）不能被当成「远端删了」。
  const removedSheets = [...baseSheets].filter((id) => !remoteSet.has(id) && id in liveSheets);
  for (const sheetId of removedSheets) {
    const name = typeof liveSheets[sheetId]?.name === "string" ? (liveSheets[sheetId]!.name as string) : sheetId;
    meta.push({ kind: "sheet-remove", sheetId, name });
  }
  const addedSheets = remoteSheets.filter((id) => !(id in liveSheets));
  const addedSet = new Set(addedSheets);

  for (const sheetId of remoteSheets) {
    if (addedSet.has(sheetId)) continue;
    const have = localLayout[sheetId];
    const want = remoteLayout[sheetId];
    if (!want) return fallbackPlan(`远端缺少工作表 ${sheetId} 的行列顺序`);
    if (!have) return fallbackPlan(`本地缺少工作表 ${sheetId} 的行列顺序`);
    const rowOps = diffGridIdSequence(sheetId, "row", have.rows, want.rows, want.cols.length);
    const colOps = diffGridIdSequence(sheetId, "col", have.cols, want.cols);
    if (rowOps.length || colOps.length) touched.add(sheetId);
    structure.push(...rowOps, ...colOps);

    const bs = isRec(bm[`${SHEET_PREFIX}${sheetId}`]) ? (bm[`${SHEET_PREFIX}${sheetId}`] as Rec) : {};
    const rs = isRec(rm[`${SHEET_PREFIX}${sheetId}`]) ? (rm[`${SHEET_PREFIX}${sheetId}`] as Rec) : {};
    const keys = new Set([...Object.keys(bs), ...Object.keys(rs)]);
    for (const key of keys) {
      if (key === "id" || key === "mergeData") continue;
      if (stableStringify(bs[key]) === stableStringify(rs[key])) continue;
      if (key === "name") continue; // 改名按「远端 vs 画布」比较，见下
      if (key === "rowData" || key === "columnData") {
        const before = isRec(bs[key]) ? (bs[key] as Rec) : {};
        const after = isRec(rs[key]) ? (rs[key] as Rec) : {};
        const ids = key === "rowData" ? want.rows : want.cols;
        const index = indexMap(ids);
        const data: Record<string, Rec | null> = {};
        for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (stableStringify(before[id]) === stableStringify(after[id])) continue;
          const at = index.get(id);
          if (at === undefined) continue;
          data[String(at)] = isRec(after[id]) ? clone(after[id] as Rec) : null;
        }
        if (Object.keys(data).length > 0) {
          meta.push({ kind: key === "rowData" ? "row-data" : "col-data", sheetId, data });
          touched.add(sheetId);
        }
        continue;
      }
      return fallbackPlan(`工作表 ${sheetId} 的 ${key}`);
    }

    // 改名：远端 vs 画布。
    const remoteName = remoteSnapSheets[sheetId]?.name;
    if (typeof remoteName === "string" && remoteName !== liveSheets[sheetId]?.name) {
      if (stableStringify(bs.name) !== stableStringify(rs.name)) {
        meta.push({ kind: "sheet-name", sheetId, name: remoteName });
        touched.add(sheetId);
      }
    }

    // 合并区域：位置比较。
    const remoteMerges = remoteSnapSheets[sheetId]?.mergeData;
    const liveMerges = liveSheets[sheetId]?.mergeData;
    const idLevelMergeChanged =
      stableStringify(bs.mergeData) !== stableStringify(rs.mergeData) ||
      rowOps.length > 0 ||
      colOps.length > 0;
    if (idLevelMergeChanged && normalizeMerges(remoteMerges) !== normalizeMerges(liveMerges)) {
      meta.push({
        kind: "merge",
        sheetId,
        remove: Array.isArray(liveMerges) ? (clone(liveMerges) as GridRangeLike[]) : [],
        add: Array.isArray(remoteMerges) ? (clone(remoteMerges) as GridRangeLike[]) : [],
      });
      touched.add(sheetId);
    }
  }

  // 新工作表：整张插入（含格子）。
  const order = Array.isArray(rm.sheetOrder)
    ? (rm.sheetOrder as unknown[]).filter((id): id is string => typeof id === "string" && remoteSet.has(id))
    : remoteSheets;
  const fullOrder = [...order, ...remoteSheets.filter((id) => !order.includes(id))];
  for (const sheetId of addedSheets) {
    const sheet = remoteSnapSheets[sheetId];
    if (!isRec(sheet)) return fallbackPlan(`新工作表 ${sheetId} 读不出来`);
    meta.push({
      kind: "sheet-insert",
      sheetId,
      index: Math.max(0, fullOrder.indexOf(sheetId)),
      sheet: clone(sheet),
    });
  }

  // 顺序：远端顺序在前，本地新建但还没推出去的表排在最后。
  const liveOrder = sheetIdsOf(live as SnapshotLike);
  const localOnly = liveOrder.filter((id) => !remoteSet.has(id) && !removedSheets.includes(id));
  const targetOrder = [...fullOrder, ...localOnly];
  const currentOrder = [
    ...liveOrder.filter((id) => !removedSheets.includes(id)),
    ...addedSheets,
  ];
  if (stableStringify(targetOrder) !== stableStringify(currentOrder) && targetOrder.length > 1) {
    meta.push({ kind: "sheet-order", order: targetOrder });
  }

  // 工作簿名。
  const bw = isRec(bm.workbook) ? (bm.workbook as Rec) : {};
  const rw = isRec(rm.workbook) ? (rm.workbook as Rec) : {};
  if (
    typeof rw.name === "string" &&
    rw.name !== bw.name &&
    rw.name !== (typeof live?.name === "string" ? live.name : undefined)
  ) {
    meta.push({ kind: "workbook-name", name: rw.name });
  }

  // 格子：按 id 键比较，位置用远端布局解析。
  const cells: GridPlanCell[] = [];
  const layoutIndex = new Map<string, { rows: Map<string, number>; cols: Map<string, number> }>();
  const resolve = (key: string) => {
    const parsed = parseGridCellIdKey(key);
    if (!parsed || addedSet.has(parsed.sheetId) || removedSheets.includes(parsed.sheetId)) return null;
    const have = remoteLayout[parsed.sheetId];
    if (!have) return null;
    let index = layoutIndex.get(parsed.sheetId);
    if (!index) {
      index = { rows: indexMap(have.rows), cols: indexMap(have.cols) };
      layoutIndex.set(parsed.sheetId, index);
    }
    const row = index.rows.get(parsed.rowId);
    const col = index.cols.get(parsed.colId);
    if (row === undefined || col === undefined) return null;
    return { sheetId: parsed.sheetId, row, col };
  };
  for (const [key, fields] of Object.entries(remote.entities ?? {})) {
    const before = base.entities?.[key];
    if (before && stableStringify(before) === stableStringify(fields)) continue;
    const at = resolve(key);
    if (at) cells.push({ ...at, cell: fields });
  }
  for (const key of Object.keys(base.entities ?? {})) {
    if (remote.entities && key in remote.entities) continue;
    const at = resolve(key);
    if (at) cells.push({ ...at, cell: null });
  }
  for (const cell of cells) touched.add(cell.sheetId);

  if (structure.length === 0 && meta.length === 0 && cells.length === 0) return emptyPlan();
  return { fallback: false, reason: "", structure, meta, cells, empty: false };
}
