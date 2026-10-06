// 表格（Univer）的多人同改适配：W12，work-chat 契约 §8.4 / §9.15，做法见 tasks/_EDITORS.md。
//
// 这个文件只放「纯函数 + 一个和 Univer 解耦的绑定器」：
//   - 工作簿快照 ⇄ 实体（单元格 = 实体，工作表等 = meta），不 import Univer，也不 import `yjs`，
//     所以单测可以直接喂快照对象；
//   - `createGridCollabBinder` 通过 `GridCollabPort` 与真正的 Univer 舞台对接
//     （舞台里的 port 实现见 `GridUniverStage.tsx`）。W11 的 `bindJsonState` 由调用方注入，
//     本文件不依赖 W11 的运行时模块。
//
// 实体键 `"<sheetId>!<row>!<col>"`；字段 `v 值 / t 值类型 / f 公式 / si 共享公式 / s 样式（内联对象）/ p 富文本`。
// meta：`workbook`（名字等）、`sheetOrder`、`sheet:<id>`（每张表一份，行高列宽/合并/冻结在里面）、`resources`。
// 同一单元格不同字段并发修改都保留，同一字段后写者胜（由 W11 的实体绑定保证）。

import {
  GRID_LAYOUT_COLS_PREFIX,
  GRID_LAYOUT_FORMAT,
  GRID_LAYOUT_FORMAT_KEY,
  GRID_LAYOUT_ROWS_PREFIX,
  applyGridStructureOp,
  cloneGridLayout,
  fitGridLayout,
  gridSheetDims,
  gridCellIdKey,
  gridSheetMetaFromIds,
  gridSheetMetaToIds,
  indexMap,
  initialGridLayout,
  newGridLayoutId,
  parseGridCellIdKey,
  planGridRemote,
  stableStringify,
  strayGridId,
  type GridLayout,
  type GridLayoutStore,
  type GridMetaOp,
  type GridPlanEntities,
  type GridRemotePlan,
  type GridStructureOp,
} from "../../doc-editors/grid-univer/collab-layout-model";

import {
  executeRemotePlan,
  structureEventFromCommand,
} from "../../doc-editors/grid-univer/collab-univer-ops";

export { stableStringify };
export {
  GRID_LAYOUT_FORMAT,
  GRID_LAYOUT_FORMAT_KEY,
  gridCellIdKey,
  initialGridLayout,
  parseGridCellIdKey,
  planGridRemote,
} from "../../doc-editors/grid-univer/collab-layout-model";
export type {
  GridAxis,
  GridLayout,
  GridMetaOp,
  GridRemotePlan,
  GridSheetLayout,
  GridStructureOp,
} from "../../doc-editors/grid-univer/collab-layout-model";

export const GRID_COLLAB_ROOT = "oceanleo:grid";
export const GRID_COLLAB_EDITOR_KIND = "grid";

type Json = unknown;
type Rec = Record<string, unknown>;

export interface GridCellFields {
  v?: string | number | boolean;
  t?: number;
  f?: string;
  si?: string;
  s?: Rec;
  p?: Rec;
}

export interface GridEntityInput {
  order: string[];
  entities: Record<string, Record<string, unknown>>;
  meta: Record<string, unknown>;
  /**
   * 第二轮 F10：每张工作表的行 id 顺序 / 列 id 顺序。有它，格子键是 `sheet!rowId!colId`；
   * 没有（老文档、回放里录下来的老格式），格子键是 `sheet!row!col`（按位置）。
   */
  layout?: GridLayout;
}

/** 与 Univer `IWorkbookData` 兼容的宽松形状（本文件不 import Univer）。 */
export type GridWorkbookSnapshot = Rec & {
  id?: string;
  name?: string;
  sheetOrder?: string[];
  sheets?: Record<string, Rec>;
  styles?: Record<string, Rec>;
};

/** 每个人自己的视图状态，不进协同文档。 */
const VIEW_LOCAL_SHEET_KEYS = new Set([
  "cellData",
  "zoomRatio",
  "scrollTop",
  "scrollLeft",
  "selections",
  "status",
]);

const SHEET_META_PREFIX = "sheet:";

function isRec(value: unknown): value is Rec {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function gridCellKey(sheetId: string, row: number, col: number): string {
  return `${sheetId}!${row}!${col}`;
}

export function parseGridCellKey(
  key: string,
): { sheetId: string; row: number; col: number } | null {
  const colAt = key.lastIndexOf("!");
  if (colAt <= 0) return null;
  const rowAt = key.lastIndexOf("!", colAt - 1);
  if (rowAt <= 0) return null;
  const sheetId = key.slice(0, rowAt);
  const row = Number(key.slice(rowAt + 1, colAt));
  const col = Number(key.slice(colAt + 1));
  if (!sheetId || !Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || col < 0) return null;
  return { sheetId, row, col };
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function hasRichRuns(p: unknown): boolean {
  if (!isRec(p)) return false;
  const body = p.body;
  if (!isRec(body)) return false;
  const runs = body.textRuns;
  const custom = body.customRanges;
  return (
    (Array.isArray(runs) && runs.length > 0) ||
    (Array.isArray(custom) && custom.length > 0)
  );
}

function resolveStyle(
  raw: unknown,
  styles: Record<string, Rec> | undefined,
): Rec | undefined {
  let style: unknown = raw;
  if (typeof raw === "string") style = styles?.[raw];
  if (!isRec(style)) return undefined;
  const cleaned = clone(style);
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/** 一个 Univer 格子 → 协同字段；空格子返回 null。 */
export function gridCellToFields(
  cell: unknown,
  styles?: Record<string, Rec>,
): GridCellFields | null {
  if (!isRec(cell)) return null;
  const fields: GridCellFields = {};
  const value = cell.v;
  if (!isEmptyValue(value) && ["string", "number", "boolean"].includes(typeof value)) {
    fields.v = value as string | number | boolean;
  }
  if (typeof cell.t === "number" && !isEmptyValue(value)) fields.t = cell.t;
  if (typeof cell.f === "string" && cell.f) fields.f = cell.f;
  if (typeof cell.si === "string" && cell.si) fields.si = cell.si;
  const style = resolveStyle(cell.s, styles);
  if (style) fields.s = style;
  // 纯文本格子的 `p` 只是 `v` 的画布副本（打开时由舞台补回），不进协同；只有真正的富文本才存。
  if (hasRichRuns(cell.p) || (isEmptyValue(value) && isRec(cell.p) && !fields.f)) {
    const rich = clone(cell.p as Rec);
    const stream = isRec(rich.body) ? String(rich.body.dataStream ?? "") : "";
    if (hasRichRuns(rich) || stream.replace(/[\r\n]/g, "")) fields.p = rich;
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/** 协同字段 → Univer 格子数据。 */
export function gridFieldsToCell(fields: Record<string, unknown>): Rec {
  const cell: Rec = {};
  for (const key of ["v", "t", "f", "si"] as const) {
    if (fields[key] !== undefined) cell[key] = fields[key];
  }
  if (isRec(fields.s)) cell.s = clone(fields.s);
  if (isRec(fields.p)) cell.p = clone(fields.p);
  return cell;
}

function numericKeys(record: Rec): number[] {
  return Object.keys(record)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);
}

/**
 * 快照 → 实体（`bindJsonState` 的 `toEntities`）。
 * 给了 `layout`：格子按行列 id 存（`sheet!rowId!colId`），行高列宽 / 合并区域也按 id 存，行列数由布局决定；
 * 不给：和第一轮一样按位置存。
 */
export function gridToEntities(state: GridWorkbookSnapshot, layout?: GridLayout): {
  order: string[];
  entities: Record<string, Record<string, unknown>>;
  meta: Record<string, unknown>;
} {
  const sheets = isRec(state?.sheets) ? (state.sheets as Record<string, Rec>) : {};
  const styles = isRec(state?.styles) ? (state.styles as Record<string, Rec>) : undefined;
  const declaredOrder = Array.isArray(state?.sheetOrder)
    ? (state.sheetOrder as unknown[]).filter(
        (id): id is string => typeof id === "string" && id in sheets,
      )
    : [];
  const rest = Object.keys(sheets)
    .filter((id) => !declaredOrder.includes(id))
    .sort();
  const sheetOrder = [...declaredOrder, ...rest];

  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  const meta: Record<string, unknown> = {};

  for (const sheetId of sheetOrder) {
    const sheet = sheets[sheetId];
    if (!isRec(sheet)) continue;
    const sheetMeta: Rec = {};
    for (const [key, value] of Object.entries(sheet)) {
      if (VIEW_LOCAL_SHEET_KEYS.has(key) || value === undefined) continue;
      sheetMeta[key] = clone(value);
    }
    sheetMeta.id = sheetId;
    const ls = layout ? (layout[sheetId] ?? { rows: [], cols: [] }) : null;
    meta[`${SHEET_META_PREFIX}${sheetId}`] = ls ? gridSheetMetaToIds(sheetMeta, ls) : sheetMeta;

    const cellData = isRec(sheet.cellData) ? (sheet.cellData as Rec) : {};
    for (const row of numericKeys(cellData)) {
      const line = cellData[String(row)];
      if (!isRec(line)) continue;
      for (const col of numericKeys(line)) {
        const fields = gridCellToFields(line[String(col)], styles);
        if (!fields) continue;
        const key = ls
          ? gridCellIdKey(
              sheetId,
              ls.rows[row] ?? strayGridId("row", row),
              ls.cols[col] ?? strayGridId("col", col),
            )
          : gridCellKey(sheetId, row, col);
        entities[key] = fields as Record<string, unknown>;
        order.push(key);
      }
    }
  }

  meta.sheetOrder = sheetOrder;
  const workbook: Rec = {};
  for (const key of ["name", "locale", "appVersion"]) {
    if (typeof state?.[key] === "string") workbook[key] = state[key];
  }
  meta.workbook = workbook;
  if (Array.isArray(state?.resources) && state.resources.length > 0) {
    meta.resources = clone(state.resources);
  }
  return { order, entities, meta };
}

/** 实体 → 快照（`bindJsonState` 的 `fromEntities`）。`prev` 只用来保留本机的视图状态与工作簿 id。 */
export function gridFromEntities(
  input: GridEntityInput,
  prev: GridWorkbookSnapshot | null,
): GridWorkbookSnapshot {
  const meta = input.meta ?? {};
  const sheetIds: string[] = [];
  for (const key of Object.keys(meta)) {
    if (key.startsWith(SHEET_META_PREFIX)) sheetIds.push(key.slice(SHEET_META_PREFIX.length));
  }
  const declared = Array.isArray(meta.sheetOrder)
    ? (meta.sheetOrder as unknown[]).filter(
        (id): id is string => typeof id === "string" && sheetIds.includes(id),
      )
    : [];
  const sheetOrder = [
    ...declared,
    ...sheetIds.filter((id) => !declared.includes(id)).sort(),
  ];

  const sheets: Record<string, Rec> = {};
  for (const sheetId of sheetOrder) {
    const sheetMeta = meta[`${SHEET_META_PREFIX}${sheetId}`];
    const ids = input.layout ? (input.layout[sheetId] ?? { rows: [], cols: [] }) : null;
    const sheet: Rec = isRec(sheetMeta)
      ? ids
        ? gridSheetMetaFromIds(sheetMeta, ids)
        : clone(sheetMeta)
      : { id: sheetId };
    sheet.id = sheetId;
    sheet.cellData = {};
    const before = prev?.sheets?.[sheetId];
    if (isRec(before)) {
      for (const key of VIEW_LOCAL_SHEET_KEYS) {
        if (key !== "cellData" && before[key] !== undefined) sheet[key] = clone(before[key]);
      }
    }
    sheets[sheetId] = sheet;
  }

  const layoutIndex = new Map<string, { rows: Map<string, number>; cols: Map<string, number> }>();
  for (const [key, fields] of Object.entries(input.entities ?? {})) {
    let parsed: { sheetId: string; row: number; col: number } | null;
    if (input.layout) {
      const idKey = parseGridCellIdKey(key);
      parsed = null;
      if (idKey && input.layout[idKey.sheetId]) {
        let index = layoutIndex.get(idKey.sheetId);
        if (!index) {
          index = {
            rows: indexMap(input.layout[idKey.sheetId]!.rows),
            cols: indexMap(input.layout[idKey.sheetId]!.cols),
          };
          layoutIndex.set(idKey.sheetId, index);
        }
        const row = index.rows.get(idKey.rowId);
        const col = index.cols.get(idKey.colId);
        // 行或列已被删掉：格子随之丢弃。
        if (row !== undefined && col !== undefined) parsed = { sheetId: idKey.sheetId, row, col };
      }
    } else {
      parsed = parseGridCellKey(key);
    }
    if (!parsed || !isRec(fields)) continue;
    const sheet = sheets[parsed.sheetId];
    if (!sheet) continue; // 工作表已被别人删掉：它的格子一并丢弃
    const cellData = sheet.cellData as Record<string, Record<string, unknown>>;
    const line = (cellData[String(parsed.row)] ??= {});
    line[String(parsed.col)] = gridFieldsToCell(fields);
  }

  const workbookMeta = isRec(meta.workbook) ? (meta.workbook as Rec) : {};
  const snapshot: GridWorkbookSnapshot = {
    id: typeof prev?.id === "string" && prev.id ? prev.id : "workbook",
    name:
      typeof workbookMeta.name === "string"
        ? workbookMeta.name
        : typeof prev?.name === "string"
          ? prev.name
          : "",
    appVersion: typeof workbookMeta.appVersion === "string" ? workbookMeta.appVersion : "",
    locale: typeof workbookMeta.locale === "string" ? workbookMeta.locale : "zhCN",
    sheetOrder,
    sheets,
    styles: {},
  };
  if (Array.isArray(meta.resources)) snapshot.resources = clone(meta.resources);
  return snapshot;
}

/** 规范形式：样式展开成内联、去掉空格子、本机视图状态与工作簿 id。两份「内容相同」的快照规范化后全等。 */
export function normalizeGridSnapshot(state: GridWorkbookSnapshot): GridWorkbookSnapshot {
  return gridFromEntities(gridToEntities(state), null);
}

export interface GridCellChange {
  sheetId: string;
  row: number;
  col: number;
  /** null = 这个格子被清空了。 */
  cell: GridCellFields | null;
}

export interface GridSnapshotDiff {
  /** 工作表增删改名/排序、行高列宽、合并、冻结、资源等发生变化（不止格子内容）。 */
  structural: boolean;
  cells: GridCellChange[];
}

function metaChanged(a: Rec, b: Rec): boolean {
  return stableStringify(a) !== stableStringify(b);
}

export function diffGridEntities(a: GridEntityInput, b: GridEntityInput): GridSnapshotDiff {
  const cells: GridCellChange[] = [];
  const seen = new Set<string>();
  for (const [key, fields] of Object.entries(b.entities)) {
    seen.add(key);
    const before = a.entities[key];
    if (before && stableStringify(before) === stableStringify(fields)) continue;
    const parsed = parseGridCellKey(key);
    if (parsed) cells.push({ ...parsed, cell: fields as GridCellFields });
  }
  for (const key of Object.keys(a.entities)) {
    if (seen.has(key)) continue;
    const parsed = parseGridCellKey(key);
    if (parsed) cells.push({ ...parsed, cell: null });
  }
  return { structural: metaChanged(a.meta ?? {}, b.meta ?? {}), cells };
}

export function diffGridSnapshots(
  a: GridWorkbookSnapshot,
  b: GridWorkbookSnapshot,
): GridSnapshotDiff {
  const left = gridToEntities(a);
  const right = gridToEntities(b);
  return diffGridEntities(
    { ...left, meta: left.meta },
    { ...right, meta: right.meta },
  );
}

/** 把一批格子变化叠到快照上（返回新快照，不改入参）。 */
export function applyGridCellChanges(
  state: GridWorkbookSnapshot,
  changes: readonly GridCellChange[],
): GridWorkbookSnapshot {
  const encoded = gridToEntities(state);
  for (const change of changes) {
    const key = gridCellKey(change.sheetId, change.row, change.col);
    if (change.cell) {
      encoded.entities[key] = change.cell as Record<string, unknown>;
      if (!encoded.order.includes(key)) encoded.order.push(key);
    } else {
      delete encoded.entities[key];
      encoded.order = encoded.order.filter((id) => id !== key);
    }
  }
  return gridFromEntities(encoded, state);
}

// ── 回放：协同文档 / 作品版本 → 快照，一句话描述变化，接手时还原作品 JSON ────

/** 作品版本里表格工程档的 schema 名（与 `grid-univer/legacy-conversion.ts` 的 `GRID_UNIVER_PROJECT_SCHEMA` 一致）。 */
export const GRID_ARTIFACT_PROJECT_SCHEMA = "oceanleo.grid.univer.v1";

interface YMapLike {
  get(key: string): unknown;
  keys?(): IterableIterator<string>;
  entries?(): IterableIterator<[string, unknown]>;
  toJSON(): unknown;
  toArray?(): unknown[];
}
interface YDocLike {
  getMap(name: string): YMapLike;
}

/**
 * 读 `bindJsonState` 写进协同文档的实体布局（仲裁 A-3：`doc.getMap(root)` 下
 * `order` / `entities` / `meta`）。W11 的 `readEntityState` 落地后与它等价；
 * 这里自带一份，是因为 `collab/index.ts` 会连带加载 `.tsx` 组件，Node 单测加载不了。
 */
export function readGridEntityState(doc: unknown, rootName = GRID_COLLAB_ROOT): GridEntityInput {
  const root = (doc as YDocLike).getMap(rootName);
  const orderRaw = root.get("order") as YMapLike | undefined;
  const entitiesRaw = root.get("entities") as YMapLike | undefined;
  const metaRaw = root.get("meta") as YMapLike | undefined;
  const entities: Record<string, Record<string, unknown>> = {};
  if (entitiesRaw?.entries) {
    for (const [key, value] of entitiesRaw.entries()) {
      const json = (value as YMapLike)?.toJSON?.() ?? value;
      if (isRec(json)) entities[key] = json;
    }
  }
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of (orderRaw?.toArray?.() ?? []) as unknown[]) {
    if (typeof id === "string" && id in entities && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  const metaJson = metaRaw?.toJSON?.();
  const state: GridEntityInput = { order, entities, meta: isRec(metaJson) ? metaJson : {} };
  const layout = readGridLayout(root);
  if (layout) state.layout = layout;
  return state;
}

/** 根 Map 里有行列 id 格式标记时，读出每张工作表的行 / 列 id 顺序（按第一次出现去重）；老格式返回 null。 */
function readGridLayout(root: YMapLike): GridLayout | null {
  if (root.get(GRID_LAYOUT_FORMAT_KEY) !== GRID_LAYOUT_FORMAT) return null;
  const layout: GridLayout = {};
  const keys = root.keys ? Array.from(root.keys()) : [];
  const idsOf = (key: string): string[] => {
    const arr = root.get(key) as YMapLike | undefined;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of (arr?.toArray?.() ?? []) as unknown[]) {
      if (typeof id === "string" && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  };
  for (const key of keys) {
    let axis: "rows" | "cols" | null = null;
    let sheetId = "";
    if (key.startsWith(GRID_LAYOUT_ROWS_PREFIX)) {
      axis = "rows";
      sheetId = key.slice(GRID_LAYOUT_ROWS_PREFIX.length);
    } else if (key.startsWith(GRID_LAYOUT_COLS_PREFIX)) {
      axis = "cols";
      sheetId = key.slice(GRID_LAYOUT_COLS_PREFIX.length);
    }
    if (!axis || !sheetId) continue;
    const sheet = (layout[sheetId] ??= { rows: [], cols: [] });
    sheet[axis] = idsOf(key);
  }
  return layout;
}

/**
 * 老格式（按位置存格子）的共享文档 → 行列 id 格式：返回确定性的行列 id（r0 r1 … / c0 c1 …）和用它重新编码的实体。
 * 纯函数、结果只取决于输入，所以两个客户端同时迁移得到完全相同的内容（写进同一个文档不会重复）。
 */
export function migrateGridEntities(input: GridEntityInput): {
  layout: GridLayout;
  encoded: { order: string[]; entities: Record<string, Record<string, unknown>>; meta: Record<string, unknown> };
} {
  const snapshot = gridFromEntities({ ...input, layout: undefined }, null);
  const layout = initialGridLayout(snapshot);
  return { layout, encoded: gridToEntities(snapshot, layout) };
}

export function gridFromY(doc: unknown): GridWorkbookSnapshot {
  return normalizeGridSnapshot(gridFromEntities(readGridEntityState(doc), null));
}

/** 作品版本 JSON（Univer 工作簿快照，或带 `schema/data` 外壳的工程档）→ 规范快照；认不出返回空簿。 */
export function gridFromRevision(json: unknown): GridWorkbookSnapshot {
  let candidate: unknown = json;
  if (isRec(candidate) && isRec(candidate.data) && !isRec(candidate.sheets)) candidate = candidate.data;
  if (isRec(candidate) && isRec(candidate.sheets) && !Array.isArray(candidate.sheets)) {
    return normalizeGridSnapshot(candidate as GridWorkbookSnapshot);
  }
  return normalizeGridSnapshot({ sheetOrder: [], sheets: {} });
}

/** 「从这一步接手」：还原成表格编辑器能打开的工程档（和保存时的 `project` 同形）。 */
export function gridToArtifactJson(snapshot: unknown): {
  schema: string;
  data: GridWorkbookSnapshot;
} {
  const state = isRec(snapshot) ? (snapshot as GridWorkbookSnapshot) : { sheetOrder: [], sheets: {} };
  return { schema: GRID_ARTIFACT_PROJECT_SCHEMA, data: normalizeGridSnapshot(state) };
}

export type GridTranslate = (zh: string, vars?: Record<string, string | number>) => string;

const plainTranslate: GridTranslate = (zh, vars) =>
  vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;

function sheetNames(state: GridWorkbookSnapshot): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, sheet] of Object.entries(state.sheets ?? {})) {
    out.set(id, typeof sheet?.name === "string" ? sheet.name : id);
  }
  return out;
}

/** 一句话说清这一步改了什么；没有变化返回 null。`tt` 缺省时返回中文原文。 */
export function describeGridChange(
  prev: unknown,
  next: unknown,
  tt: GridTranslate = plainTranslate,
): string | null {
  const empty: GridWorkbookSnapshot = { sheetOrder: [], sheets: {} };
  const before = isRec(prev) ? (prev as GridWorkbookSnapshot) : empty;
  const after = isRec(next) ? (next as GridWorkbookSnapshot) : empty;
  const diff = diffGridSnapshots(before, after);
  const left = sheetNames(before);
  const right = sheetNames(after);
  const added = [...right.keys()].filter((id) => !left.has(id)).length;
  const removed = [...left.keys()].filter((id) => !right.has(id)).length;
  const renamed = [...right.entries()].filter(
    ([id, name]) => left.has(id) && left.get(id) !== name,
  ).length;
  // 新增工作表上的格子算在「新增工作表」里，不再重复数一遍。
  const newSheets = new Set([...right.keys()].filter((id) => !left.has(id)));
  const filled = diff.cells.filter((c) => c.cell && !newSheets.has(c.sheetId)).length;
  const cleared = diff.cells.filter((c) => !c.cell).length;
  const parts: string[] = [];
  if (added > 0) parts.push(tt("新增 {n} 张工作表", { n: added }));
  if (removed > 0) parts.push(tt("删除 {n} 张工作表", { n: removed }));
  if (renamed > 0) parts.push(tt("改了 {n} 张工作表的名字", { n: renamed }));
  if (filled > 0) parts.push(tt("填了 {n} 个单元格", { n: filled }));
  if (cleared > 0) parts.push(tt("清空了 {n} 个单元格", { n: cleared }));
  if (parts.length === 0 && diff.structural) parts.push(tt("调整了表格的行列或格式"));
  return parts.length > 0 ? parts.reduce((a, b) => tt("{a}，{b}", { a, b })) : null;
}

export const GRID_FRAME_MAX_ROWS = 50;
export const GRID_FRAME_MAX_COLS = 20;

export interface GridFrameModel {
  sheetName: string;
  sheetCount: number;
  rows: string[][];
  /** 与上一帧相比变化的格子，`"<row>:<col>"`。 */
  changed: Set<string>;
  totalRows: number;
  totalCols: number;
}

function displayCell(cell: Rec | undefined): string {
  if (!cell) return "";
  const value = cell.v;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value !== undefined && value !== null && value !== "") return String(value);
  if (typeof cell.f === "string") return cell.f;
  if (isRec(cell.p) && isRec(cell.p.body)) {
    return String(cell.p.body.dataStream ?? "").replace(/[\r\n]+/g, " ").trim();
  }
  return "";
}

/** 取一帧要画的网格（前 50 行 × 20 列）；有上一帧时标出变化的格子。 */
export function gridFrameModel(snapshot: unknown, prev?: unknown): GridFrameModel {
  const state = isRec(snapshot) ? (snapshot as GridWorkbookSnapshot) : { sheetOrder: [], sheets: {} };
  const order = (state.sheetOrder ?? []).filter((id) => isRec(state.sheets?.[id]));
  let sheetId = order[0];
  const diff = isRec(prev) ? diffGridSnapshots(prev as GridWorkbookSnapshot, state) : null;
  const touched = diff?.cells.find((c) => order.includes(c.sheetId));
  if (touched) sheetId = touched.sheetId;
  const sheet = sheetId ? (state.sheets?.[sheetId] as Rec) : undefined;
  const cellData = isRec(sheet?.cellData) ? (sheet?.cellData as Rec) : {};
  const rows: string[][] = [];
  let totalRows = 0;
  let totalCols = 0;
  for (const row of numericKeys(cellData)) {
    const line = cellData[String(row)];
    if (!isRec(line)) continue;
    for (const col of numericKeys(line)) {
      if (displayCell(line[String(col)] as Rec) === "" && !isRec((line[String(col)] as Rec)?.s)) continue;
      totalRows = Math.max(totalRows, row + 1);
      totalCols = Math.max(totalCols, col + 1);
    }
  }
  const height = Math.min(GRID_FRAME_MAX_ROWS, Math.max(totalRows, 1));
  const width = Math.min(GRID_FRAME_MAX_COLS, Math.max(totalCols, 1));
  for (let r = 0; r < height; r += 1) {
    const line = isRec(cellData[String(r)]) ? (cellData[String(r)] as Rec) : {};
    const out: string[] = [];
    for (let c = 0; c < width; c += 1) out.push(displayCell(line[String(c)] as Rec | undefined));
    rows.push(out);
  }
  const changed = new Set<string>();
  if (diff && sheetId) {
    for (const change of diff.cells) {
      if (change.sheetId === sheetId) changed.add(`${change.row}:${change.col}`);
    }
  }
  return {
    sheetName: typeof sheet?.name === "string" ? sheet.name : "",
    sheetCount: order.length,
    rows,
    changed,
    totalRows,
    totalCols,
  };
}

// ── 选择 / 感知 ─────────────────────────────────────────────────────────────

export interface GridSelectionRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface GridAwarenessSelection {
  /** 契约规定的 `selection`：被选中的实体 id（最多 100 个）。 */
  selection: string[];
  /** 完整范围，画描边用（大范围不展开成 id）。行列 id 格式下附带两端的行列 id，别人那边的描边跟着行列走。 */
  selectionRanges: Array<
    GridSelectionRange & {
      sheetId: string;
      startRowId?: string;
      endRowId?: string;
      startColumnId?: string;
      endColumnId?: string;
    }
  >;
}

export const GRID_SELECTION_ID_CAP = 100;

export function gridSelectionToAwareness(
  sheetId: string,
  ranges: readonly GridSelectionRange[],
  layout?: GridLayout | null,
): GridAwarenessSelection {
  const selection: string[] = [];
  const selectionRanges: GridAwarenessSelection["selectionRanges"] = [];
  const ls = layout?.[sheetId];
  for (const range of ranges.slice(0, 20)) {
    const startRow = Math.max(0, Math.min(range.startRow, range.endRow));
    const endRow = Math.max(range.startRow, range.endRow);
    const startColumn = Math.max(0, Math.min(range.startColumn, range.endColumn));
    const endColumn = Math.max(range.startColumn, range.endColumn);
    const entry: GridAwarenessSelection["selectionRanges"][number] = {
      sheetId,
      startRow,
      endRow,
      startColumn,
      endColumn,
    };
    if (ls) {
      const sr = ls.rows[startRow];
      const er = ls.rows[endRow];
      const sc = ls.cols[startColumn];
      const ec = ls.cols[endColumn];
      if (sr && er && sc && ec) {
        entry.startRowId = sr;
        entry.endRowId = er;
        entry.startColumnId = sc;
        entry.endColumnId = ec;
      }
    }
    selectionRanges.push(entry);
    for (let row = startRow; row <= endRow && selection.length < GRID_SELECTION_ID_CAP; row += 1) {
      for (
        let col = startColumn;
        col <= endColumn && selection.length < GRID_SELECTION_ID_CAP;
        col += 1
      ) {
        const rowId = ls?.rows[row];
        const colId = ls?.cols[col];
        selection.push(
          ls && rowId && colId ? gridCellIdKey(sheetId, rowId, colId) : gridCellKey(sheetId, row, col),
        );
      }
    }
  }
  return { selection, selectionRanges };
}

export interface GridPeerSelection {
  userId: string;
  name: string;
  color: string;
  ranges: Array<GridSelectionRange & { sheetId: string }>;
}

const SAFE_COLOR = /^(?:#[0-9a-fA-F]{3,8}|hsl\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?%\s*,\s*\d{1,3}(?:\.\d+)?%\s*\))$/;

/** 颜色只认 `#rgb` 与 `hsl(…)`；别的一律回落，避免把别人的数据拼进样式。 */
export function safePeerColor(color: unknown, fallback = "#6366f1"): string {
  return typeof color === "string" && SAFE_COLOR.test(color.trim()) ? color.trim() : fallback;
}

interface AwarenessLike {
  clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  on(event: "change", cb: (...args: unknown[]) => void): void;
  off(event: "change", cb: (...args: unknown[]) => void): void;
  setLocalStateField(field: string, value: unknown): void;
}

function finiteInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 2_000_000
    ? value
    : null;
}

/** 从感知状态里取出别人的选中格子（不含自己）。给了 `layout` 且对方带了行列 id，按 id 解析位置（行列被挪动后描边跟着走）。 */
export function gridPeerSelections(
  awareness: AwarenessLike,
  layout?: GridLayout | null,
): GridPeerSelection[] {
  const out: GridPeerSelection[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID || !isRec(state)) continue;
    const user = isRec(state.user) ? state.user : null;
    const raw = Array.isArray(state.selectionRanges) ? state.selectionRanges : [];
    const ranges: GridPeerSelection["ranges"] = [];
    for (const item of raw.slice(0, 20)) {
      if (!isRec(item) || typeof item.sheetId !== "string") continue;
      const ls = layout?.[item.sheetId];
      if (
        ls &&
        typeof item.startRowId === "string" &&
        typeof item.endRowId === "string" &&
        typeof item.startColumnId === "string" &&
        typeof item.endColumnId === "string"
      ) {
        const sr = ls.rows.indexOf(item.startRowId);
        const er = ls.rows.indexOf(item.endRowId);
        const sc = ls.cols.indexOf(item.startColumnId);
        const ec = ls.cols.indexOf(item.endColumnId);
        if (sr >= 0 && er >= 0 && sc >= 0 && ec >= 0) {
          ranges.push({
            sheetId: item.sheetId,
            startRow: Math.min(sr, er),
            endRow: Math.max(sr, er),
            startColumn: Math.min(sc, ec),
            endColumn: Math.max(sc, ec),
          });
          continue;
        }
      }
      const startRow = finiteInt(item.startRow);
      const endRow = finiteInt(item.endRow);
      const startColumn = finiteInt(item.startColumn);
      const endColumn = finiteInt(item.endColumn);
      if (startRow === null || endRow === null || startColumn === null || endColumn === null) continue;
      ranges.push({ sheetId: item.sheetId, startRow, endRow, startColumn, endColumn });
    }
    if (ranges.length === 0) continue;
    out.push({
      userId: typeof user?.id === "string" ? user.id : String(clientId),
      name: typeof user?.name === "string" ? user.name.slice(0, 40) : "",
      color: safePeerColor(user?.color),
      ranges,
    });
  }
  return out;
}

// ── Univer 端口（只依赖鸭子类型的 facade，不 import Univer） ────────────────

const SET_RANGE_VALUES_MUTATION = "sheet.mutation.set-range-values";
const SET_SELECTIONS_OPERATION = "sheet.operation.set-selections";
/** 这些 mutation 不改文档内容（切换活动表、滚动、缩放、公式引擎内部状态），不算本地改动。 */
const NON_CONTENT_COMMAND =
  /formula\.|set-worksheet-active|scroll|zoom|selection|activate|render|set-active/;

export function isGridContentCommand(id: unknown): boolean {
  return typeof id === "string" && id.includes(".mutation.") && !NON_CONTENT_COMMAND.test(id);
}

interface DisposableLike {
  dispose(): void;
}

interface UniverSheetLike {
  getSheetId?(): string;
  getRange?(row: number, col: number, rows: number, cols: number): unknown;
  highlightRanges?(ranges: unknown[], style?: Rec, primary?: unknown): DisposableLike | undefined;
}

interface UniverWorkbookLike {
  getId?(): string;
  save?(): unknown;
  getSnapshot?(): unknown;
  getSheetBySheetId?(id: string): UniverSheetLike | null | undefined;
  getSheets?(): UniverSheetLike[];
}

export interface GridUniverCollabApi {
  Event?: { CommandExecuted?: string } & Rec;
  addEvent?(event: string, cb: (params: Rec) => void): DisposableLike | undefined;
  onCommandExecuted?(cb: (command: Rec) => void): DisposableLike | undefined;
  syncExecuteCommand?(id: string, params?: Rec, options?: Rec): unknown;
  getActiveWorkbook?(): UniverWorkbookLike | null | undefined;
}

/** 把 `#rgb(a)` 或 `hsl(…)` 变成带透明度的颜色；不认识的回落成默认色。 */
export function colorWithAlpha(color: string, alpha: number): string {
  const safe = safePeerColor(color);
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(safe);
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    const n = Number.parseInt(raw, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const hsl = /^hsl\((.+)\)$/.exec(safe);
  if (hsl) return `hsla(${hsl[1]}, ${alpha})`;
  return `rgba(99, 102, 241, ${alpha})`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 把 Univer 的 facade 包成 `GridCollabPort`：
 * - 读：`workbook.save()`；
 * - 写别人的格子：`syncExecuteCommand("sheet.mutation.set-range-values")`——mutation 不进本机撤销栈，
 *   写入期间屏蔽本地变更事件，所以不会回推；
 * - 别人的选区：`worksheet.highlightRanges`（他的颜色描边 + 淡底）。
 */
export function createGridUniverPort(options: {
  getApi: () => GridUniverCollabApi | null | undefined;
  /** 整本替换（舞台负责建新簿、卸旧簿、恢复界面档位）。 */
  replaceWorkbook: (snapshot: GridWorkbookSnapshot) => void;
}): GridCollabPort {
  let muted = 0;
  let highlights: DisposableLike[] = [];
  let highlightKey = "";

  const workbook = () => options.getApi()?.getActiveWorkbook?.() ?? null;

  const subscribe = (cb: (event: Rec) => void): (() => void) => {
    const api = options.getApi();
    if (!api) return () => {};
    const name = api.Event?.CommandExecuted;
    const handle =
      api.addEvent && name
        ? api.addEvent(name, cb)
        : api.onCommandExecuted?.((command) => cb(command));
    return () => handle?.dispose();
  };

  const snapshotNow = (): GridWorkbookSnapshot => {
    const wb = workbook();
    const data = wb?.save?.() ?? wb?.getSnapshot?.();
    return isRec(data) ? (cloneJson(data) as GridWorkbookSnapshot) : { sheetOrder: [], sheets: {} };
  };

  return {
    getSnapshot: snapshotNow,
    onLocalStructure(cb) {
      return subscribe((event) => {
        if (muted > 0) return;
        const op = structureEventFromCommand(event, {
          unitId: workbook()?.getId?.(),
          getSnapshot: snapshotNow,
        });
        if (op) cb(op);
      });
    },
    applyRemotePlan(plan) {
      const api = options.getApi();
      const unitId = workbook()?.getId?.();
      if (!api?.syncExecuteCommand || !unitId) return false;
      muted += 1;
      try {
        return executeRemotePlan(plan, {
          api,
          unitId,
          snapshot: snapshotNow(),
          cellValue: (cell) => gridFieldsToCell(cell),
        });
      } finally {
        muted -= 1;
      }
    },
    applyCellChanges(changes) {
      const api = options.getApi();
      const wb = workbook();
      const unitId = wb?.getId?.();
      if (!api?.syncExecuteCommand || !unitId) return;
      const bySheet = new Map<string, Record<number, Record<number, unknown>>>();
      for (const change of changes) {
        const rows = bySheet.get(change.sheetId) ?? {};
        (rows[change.row] ??= {})[change.col] = change.cell ? gridFieldsToCell(change.cell as Rec) : null;
        bySheet.set(change.sheetId, rows);
      }
      muted += 1;
      try {
        for (const [subUnitId, cellValue] of bySheet) {
          api.syncExecuteCommand(SET_RANGE_VALUES_MUTATION, { unitId, subUnitId, cellValue });
        }
      } finally {
        muted -= 1;
      }
    },
    replaceWorkbook(snapshot) {
      muted += 1;
      try {
        options.replaceWorkbook(snapshot);
      } finally {
        muted -= 1;
      }
      highlightKey = "";
    },
    onLocalChange(cb) {
      return subscribe((event) => {
        if (muted > 0 || !isGridContentCommand(event.id)) return;
        cb();
      });
    },
    onLocalSelection(cb) {
      return subscribe((event) => {
        if (muted > 0 || event.id !== SET_SELECTIONS_OPERATION || !isRec(event.params)) return;
        const params = event.params;
        const sheetId = typeof params.subUnitId === "string" ? params.subUnitId : "";
        const selections = Array.isArray(params.selections) ? params.selections : [];
        const ranges: GridSelectionRange[] = [];
        for (const item of selections) {
          const range = isRec(item) && isRec(item.range) ? item.range : null;
          if (!range) continue;
          const startRow = finiteInt(range.startRow);
          const endRow = finiteInt(range.endRow);
          const startColumn = finiteInt(range.startColumn);
          const endColumn = finiteInt(range.endColumn);
          if (startRow === null || endRow === null || startColumn === null || endColumn === null) continue;
          ranges.push({ startRow, endRow, startColumn, endColumn });
        }
        if (sheetId && ranges.length > 0) cb(sheetId, ranges);
      });
    },
    highlightPeers(peers) {
      const key = stableStringify(peers);
      if (key === highlightKey) return;
      highlightKey = key;
      for (const handle of highlights) {
        try {
          handle.dispose();
        } catch {
          // 工作簿已被替换时旧描边可能已不在，忽略。
        }
      }
      highlights = [];
      const wb = workbook();
      if (!wb) return;
      for (const peer of peers) {
        for (const range of peer.ranges) {
          const sheet =
            wb.getSheetBySheetId?.(range.sheetId) ??
            wb.getSheets?.().find((candidate) => candidate.getSheetId?.() === range.sheetId);
          if (!sheet?.highlightRanges || !sheet.getRange) continue;
          const target = sheet.getRange(
            range.startRow,
            range.startColumn,
            range.endRow - range.startRow + 1,
            range.endColumn - range.startColumn + 1,
          );
          const handle = sheet.highlightRanges([target], {
            stroke: peer.color,
            strokeWidth: 2,
            fill: colorWithAlpha(peer.color, 0.12),
          });
          if (handle) highlights.push(handle);
        }
      }
    },
  };
}

// ── 绑定器 ──────────────────────────────────────────────────────────────────

export interface GridCollabPort {
  /** 当前 Univer 工作簿的快照。 */
  getSnapshot(): GridWorkbookSnapshot;
  /** 把一批格子变化写进正在显示的工作簿（不进撤销栈、不触发本地变更事件）。 */
  applyCellChanges(changes: readonly GridCellChange[]): void;
  /** 整本替换（别人改了工作表结构时）。 */
  replaceWorkbook(snapshot: GridWorkbookSnapshot): void;
  /** 用户自己改了内容（任何会改变工作簿的命令）；写入远端变化时不应触发。 */
  onLocalChange(cb: () => void): () => void;
  /** 用户自己换了选中区域。 */
  onLocalSelection(cb: (sheetId: string, ranges: GridSelectionRange[]) => void): () => void;
  /** 在画布上描出别人选中的格子。 */
  highlightPeers(peers: readonly GridPeerSelection[]): void;
  /** 用户自己插入 / 删除 / 移动了行列，或对整行做了排序（第二轮 F10）；写入远端变化时不应触发。 */
  onLocalStructure?(cb: (op: GridStructureOp) => void): () => void;
  /**
   * 在画布上增量执行远端变化的计划（行列结构、行高列宽、合并区域、格子、工作表增删改名），
   * 不整张替换工作簿；任何一步失败返回 false，绑定器随即退回整张替换。
   */
  applyRemotePlan?(plan: GridRemotePlan): boolean;
}

export interface GridCollabRoomLike {
  doc: unknown;
  awareness: AwarenessLike;
  needsSeed: boolean;
  status: string;
  completeSeed(roots: string[]): void;
  subscribe(cb: () => void): () => void;
}

export type GridCollabPhase = "off" | "waiting" | "live";

/**
 * 表格在协同里是否可以编辑：不在协同里 → off；播种者建好绑定器就是 live；
 * 其余人要等到同步完成（`synced`）才 live，断线后继续编辑不退回等待。
 */
export function gridCollabPhase(input: {
  room: { status: string; needsSeed: boolean } | null | undefined;
  wasLive?: boolean;
}): GridCollabPhase {
  const { room } = input;
  if (!room || room.status === "denied" || room.status === "disabled") return "off";
  if (room.needsSeed) return "live";
  if (room.status === "synced") return "live";
  return input.wasLive ? "live" : "waiting";
}

export interface GridJsonBinding {
  push(state: GridWorkbookSnapshot): void;
  /** W11 的 `seed` 自己会 `completeSeed([rootName])`。 */
  seed(state: GridWorkbookSnapshot): void;
  onRemote(cb: (state: GridWorkbookSnapshot) => void): () => void;
  /** 读出协同文档里现有的状态；文档里还没有内容时返回 null。 */
  read?(): GridWorkbookSnapshot | null;
  destroy(): void;
}

export interface GridCollabBinderOptions {
  room: GridCollabRoomLike;
  port: GridCollabPort;
  /** W11 的 `bindJsonState`，由调用方注入。 */
  bind: (opts: {
    room: GridCollabRoomLike;
    rootName: string;
    toEntities: typeof gridToEntities;
    fromEntities: typeof gridFromEntities;
  }) => GridJsonBinding;
  /**
   * 第二轮 F10：行列 id 布局的存取。给了它，格子按行列 id 存，插入 / 删除 / 排序行列不再整张推送；
   * 老格式文档在第一次打开时就地迁移。不给就和第一轮一样按位置存、结构变化整张替换。
   */
  layoutStore?: GridLayoutStore;
  /** 新行 / 新列的 id 生成器（测试注入固定序列）。 */
  newId?: () => string;
  /** 本地变更合并后再推的等待毫秒数。 */
  debounceMs?: number;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** 本地改了内容 / 收进了别人的改动（保存者据此知道「文档变了、该存」）。 */
  onActivity?: (origin: "local" | "remote") => void;
  /** 远端变化只能整张替换工作簿时调用（界面据此提示「表格已重新载入」）。 */
  onFullReplace?: (reason: string) => void;
}

export interface GridCollabBinder {
  /** 立刻把还没推出去的本地变更推出去。 */
  flush(): void;
  /** 外部新版本（AI、专业模式存的）：整本换进画布，并整张写进协同文档。 */
  adopt(snapshot: GridWorkbookSnapshot): void;
  /** 画布现在的行列 id 布局；还在老格式（没有布局存储）时是 null。 */
  getLayout(): GridLayout | null;
  destroy(): void;
}

function planEntities(
  encoded: { entities: Record<string, Record<string, unknown>>; meta: Record<string, unknown> },
  layout: GridLayout | null,
): GridPlanEntities {
  return { entities: encoded.entities, meta: encoded.meta, ...(layout ? { layout } : {}) };
}

/**
 * 把一个 Univer 舞台接进协同房间：
 * - 种子：`needsSeed` 的客户端把当前工作簿写进去再 `completeSeed`；
 * - 本地变更 → 合并后 `push`（W11 按实体做差异，只改动变化的格子）；
 * - 远端状态 → 与「上次同步的状态」求差。第一轮：只有格子变化就逐格写回，工作表结构变化才整本替换。
 *   第二轮（给了 `layoutStore`）：格子按行列 id 存，本地插入 / 删除 / 移动行列、整行排序马上写进行列顺序，
 *   远端的行列变化翻译成 Univer 命令在本地增量执行（`planGridRemote` + `port.applyRemotePlan`），
 *   只有翻译不了的变化（冻结、条件格式等）才整本替换；
 * - 选区：本地选区写进感知（`selection` + `selectionRanges`），别人的选区交给 `port.highlightPeers`。
 */
export function createGridCollabBinder(options: GridCollabBinderOptions): GridCollabBinder {
  const { room, port } = options;
  const store = options.layoutStore ?? null;
  const makeId = options.newId ?? newGridLayoutId;
  const debounceMs = options.debounceMs ?? 250;
  const setTimer =
    options.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer =
    options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  /** 行列 id 布局（画布现在的）；null = 还在老格式（或没有布局存储）。 */
  let layout: GridLayout | null = null;
  /** 行列 id 格式下，上次与协同文档对齐的状态（按 id 存的格子与 meta）。 */
  let baseIds: GridPlanEntities | null = null;
  let lastEncoded: ReturnType<typeof gridToEntities> | null = null;

  const toEntities = ((state: GridWorkbookSnapshot) => {
    const encoded = gridToEntities(state, layout ?? undefined);
    lastEncoded = encoded;
    return encoded;
  }) as typeof gridToEntities;
  const fromEntities = ((input: GridEntityInput, prev: GridWorkbookSnapshot | null) => {
    const stored = store?.read() ?? null;
    return gridFromEntities(stored ? { ...input, layout: stored } : input, prev);
  }) as typeof gridFromEntities;

  const binding = options.bind({
    room,
    rootName: GRID_COLLAB_ROOT,
    toEntities: store ? toEntities : gridToEntities,
    fromEntities: store ? fromEntities : gridFromEntities,
  });

  let destroyed = false;
  let applyingRemote = 0;
  let timer: unknown = null;
  /** 一次推送里用到的「画布 → 行列 id」映射由 layout 决定；这里是老格式下上次与协同文档对齐的状态。 */
  let base: GridWorkbookSnapshot = port.getSnapshot();

  /** 让行列布局与画布对齐（行列数变了、新建了工作表）；有变化就写进协同文档。 */
  const reconcileLayout = (live: GridWorkbookSnapshot) => {
    if (!layout || !store) return;
    const fit = fitGridLayout(live, layout, makeId);
    if (!fit.changed) return;
    layout = fit.layout;
    store.sync(layout, fit.removed);
  };

  const pushNow = () => {
    if (destroyed) return;
    timer = null;
    const live = port.getSnapshot();
    if (layout && store) {
      lastEncoded = null;
      store.batch(() => {
        reconcileLayout(live);
        binding.push(live);
      });
      baseIds = planEntities(lastEncoded ?? gridToEntities(live, layout), layout);
    } else {
      binding.push(live);
    }
    base = live;
  };

  const schedulePush = () => {
    if (destroyed || applyingRemote > 0) return;
    options.onActivity?.("local");
    if (timer !== null) clearTimer(timer);
    timer = setTimer(pushNow, debounceMs);
  };

  const disposeLocal = port.onLocalChange(schedulePush);

  /** 本地用户插入 / 删除 / 移动了行列（或整行排序）：马上写进行列顺序，格子随后按 id 推。 */
  const disposeStructure =
    port.onLocalStructure?.((event) => {
      if (destroyed || applyingRemote > 0 || !store || !layout) return;
      const applied = applyGridStructureOp(layout, event, makeId);
      layout = applied.layout;
      store.applyLocal(applied.op);
      schedulePush();
    }) ?? (() => {});

  // ── 老格式：按位置比较，结构变化整本替换（第一轮的做法） ──
  const applyRemoteLegacy = (remote: GridWorkbookSnapshot) => {
    if (destroyed) return;
    const delta = diffGridSnapshots(base, remote);
    if (!delta.structural && delta.cells.length === 0) return;
    options.onActivity?.("remote");
    const live = port.getSnapshot();
    applyingRemote += 1;
    try {
      if (delta.structural) {
        // 本地还没推出去的格子改动叠在远端结构上；结构冲突时远端为准。
        const pending = diffGridSnapshots(base, live);
        const target = pending.structural
          ? remote
          : applyGridCellChanges(remote, pending.cells);
        port.replaceWorkbook(target);
        options.onFullReplace?.("legacy-structure");
        base = remote;
        if (pending.cells.length > 0 && !pending.structural) {
          if (timer !== null) clearTimer(timer);
          timer = setTimer(pushNow, 0);
        }
      } else {
        port.applyCellChanges(delta.cells);
        base = remote;
      }
    } finally {
      applyingRemote -= 1;
    }
  };

  /** 老格式文档第一次进入行列 id 格式（我们自己迁移，或别人迁移了）：以文档里的布局为准，重建对齐基线。 */
  const adoptLayout = (stored: GridLayout) => {
    layout = stored;
    const live = port.getSnapshot();
    baseIds = planEntities(gridToEntities(live, layout), layout);
    base = live;
  };

  // ── 行列 id 格式：按 id 比较，行列结构增量翻译 ──
  const dimsMatch = (snapshot: GridWorkbookSnapshot, want: GridLayout, skip: ReadonlySet<string>) => {
    for (const [sheetId, ids] of Object.entries(want)) {
      const sheet = snapshot.sheets?.[sheetId];
      if (!sheet || skip.has(sheetId)) continue;
      const dims = gridSheetDims(sheet as Rec);
      if (dims.rows !== ids.rows.length || dims.cols !== ids.cols.length) return false;
    }
    return true;
  };

  const applyRemoteIds = () => {
    if (destroyed || !store || !layout) return;
    store.dedupe();
    const live = port.getSnapshot();
    reconcileLayout(live);
    const stored = store.read();
    if (!stored) return;
    const state = readGridEntityState(room.doc);
    const remote: GridEntityInput = { ...state, layout: stored };
    const remoteSnapshot = gridFromEntities(remote, live);
    const before = baseIds ?? planEntities(gridToEntities(live, layout), layout);
    const plan = planGridRemote({
      base: before,
      localLayout: layout,
      remote,
      remoteSnapshot,
      live,
    });
    // 本地新建、还没推出去的工作表：不在 base 里，保留它们的行列布局。
    const knownSheets = new Set(
      Object.keys(before.meta)
        .filter((key) => key.startsWith(SHEET_META_PREFIX))
        .map((key) => key.slice(SHEET_META_PREFIX.length)),
    );
    const localOnly: GridLayout = {};
    for (const [sheetId, ids] of Object.entries(layout)) {
      if (!knownSheets.has(sheetId) && !(sheetId in stored)) localOnly[sheetId] = ids;
    }
    const nextBase = planEntities({ entities: remote.entities, meta: remote.meta }, stored);
    if (plan.empty) {
      layout = { ...stored, ...localOnly };
      baseIds = nextBase;
      return;
    }
    options.onActivity?.("remote");
    applyingRemote += 1;
    let replaced = false;
    try {
      let done = false;
      if (!plan.fallback && port.applyRemotePlan) {
        try {
          done = port.applyRemotePlan(plan);
        } catch {
          done = false;
        }
        if (done && plan.structure.length > 0) {
          done = dimsMatch(port.getSnapshot(), stored, new Set(Object.keys(localOnly)));
        }
      }
      if (!done) {
        replaced = true;
        // 本地还没推出去的格子改动叠在远端状态上；本地改了工作表设置时远端为准。
        const liveEntities = gridToEntities(live, layout);
        const pendingMeta = stableStringify(before.meta) !== stableStringify(liveEntities.meta);
        const entities: Record<string, Record<string, unknown>> = { ...remote.entities };
        let pendingCount = 0;
        if (!pendingMeta) {
          const have = (key: string) => {
            const id = parseGridCellIdKey(key);
            const ids = id ? stored[id.sheetId] : undefined;
            return Boolean(id && ids && ids.rows.includes(id.rowId) && ids.cols.includes(id.colId));
          };
          for (const [key, fields] of Object.entries(liveEntities.entities)) {
            const was = before.entities[key];
            if (was && stableStringify(was) === stableStringify(fields)) continue;
            if (!have(key)) continue;
            entities[key] = fields;
            pendingCount += 1;
          }
          for (const key of Object.keys(before.entities)) {
            if (key in liveEntities.entities || !(key in entities) || !have(key)) continue;
            delete entities[key];
            pendingCount += 1;
          }
        }
        const target = gridFromEntities(
          { order: Object.keys(entities), entities, meta: remote.meta, layout: stored },
          live,
        );
        port.replaceWorkbook(target);
        options.onFullReplace?.(plan.reason || "apply-failed");
        if (pendingCount > 0) {
          if (timer !== null) clearTimer(timer);
          timer = setTimer(pushNow, 0);
        }
      }
    } finally {
      applyingRemote -= 1;
    }
    layout = replaced ? stored : { ...stored, ...localOnly };
    baseIds = nextBase;
    onAwareness();
  };

  const applyRemote = (remote: GridWorkbookSnapshot) => {
    if (destroyed) return;
    const stored = store?.read() ?? null;
    if (!store || !stored) {
      applyRemoteLegacy(remote);
      return;
    }
    if (!layout) {
      // 第一次看到行列 id 格式：内容与画布做一次按位置的比较，然后以文档里的布局为准。
      applyRemoteLegacy(remote);
      adoptLayout(stored);
      initialApplied = true;
      return;
    }
    applyRemoteIds();
  };
  const disposeRemote = binding.onRemote(applyRemote);

  // 非播种者：同步完成后把协同文档里的状态读出来换进画布（之后的变化走 onRemote）。
  let initialApplied = false;
  const applyInitial = () => {
    if (initialApplied || destroyed || room.needsSeed || room.status !== "synced") return;
    const state = binding.read?.();
    if (!state) return;
    initialApplied = true;
    applyRemoteLegacy(state);
    if (!store) return;
    let stored = store.read();
    if (!stored && store.canWrite() && store.isLegacy() && store.migrate()) stored = store.read();
    if (stored) adoptLayout(stored);
  };
  const disposeRoom = room.subscribe(applyInitial);

  const disposeSelection = port.onLocalSelection((sheetId, ranges) => {
    if (destroyed) return;
    const payload = gridSelectionToAwareness(sheetId, ranges, layout);
    room.awareness.setLocalStateField("selection", payload.selection);
    room.awareness.setLocalStateField("selectionRanges", payload.selectionRanges);
  });

  function onAwareness() {
    if (!destroyed) port.highlightPeers(gridPeerSelections(room.awareness, layout));
  }
  room.awareness.on("change", onAwareness);

  if (room.needsSeed) {
    const live = port.getSnapshot();
    if (store) {
      layout = initialGridLayout(live);
      store.seed(layout);
    }
    lastEncoded = null;
    binding.seed(live);
    base = port.getSnapshot();
    if (layout) baseIds = planEntities(lastEncoded ?? gridToEntities(live, layout), layout);
  } else {
    applyInitial();
  }

  return {
    flush() {
      if (timer !== null) {
        clearTimer(timer);
        pushNow();
      }
    },
    adopt(snapshot) {
      if (destroyed) return;
      if (timer !== null) clearTimer(timer);
      timer = null;
      applyingRemote += 1;
      try {
        port.replaceWorkbook(snapshot);
      } finally {
        applyingRemote -= 1;
      }
      pushNow();
    },
    getLayout: () => (layout ? cloneGridLayout(layout) : null),
    destroy() {
      if (destroyed) return;
      if (timer !== null) clearTimer(timer);
      destroyed = true;
      disposeLocal();
      disposeStructure();
      disposeRemote();
      disposeRoom();
      disposeSelection();
      room.awareness.off("change", onAwareness);
      port.highlightPeers([]);
      binding.destroy();
    },
  };
}
