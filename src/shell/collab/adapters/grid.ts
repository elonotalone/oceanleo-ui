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

/** 键顺序固定的 JSON，用来比较两个值是否相同。 */
export function stableStringify(value: Json): string {
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

/** 快照 → 实体（`bindJsonState` 的 `toEntities`）。 */
export function gridToEntities(state: GridWorkbookSnapshot): {
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
    meta[`${SHEET_META_PREFIX}${sheetId}`] = sheetMeta;

    const cellData = isRec(sheet.cellData) ? (sheet.cellData as Rec) : {};
    for (const row of numericKeys(cellData)) {
      const line = cellData[String(row)];
      if (!isRec(line)) continue;
      for (const col of numericKeys(line)) {
        const fields = gridCellToFields(line[String(col)], styles);
        if (!fields) continue;
        const key = gridCellKey(sheetId, row, col);
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
    const sheet: Rec = isRec(sheetMeta) ? clone(sheetMeta) : { id: sheetId };
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

  for (const [key, fields] of Object.entries(input.entities ?? {})) {
    const parsed = parseGridCellKey(key);
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
  return { order, entities, meta: isRec(metaJson) ? metaJson : {} };
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
  /** 完整范围，画描边用（大范围不展开成 id）。 */
  selectionRanges: Array<GridSelectionRange & { sheetId: string }>;
}

export const GRID_SELECTION_ID_CAP = 100;

export function gridSelectionToAwareness(
  sheetId: string,
  ranges: readonly GridSelectionRange[],
): GridAwarenessSelection {
  const selection: string[] = [];
  const selectionRanges: GridAwarenessSelection["selectionRanges"] = [];
  for (const range of ranges.slice(0, 20)) {
    const startRow = Math.max(0, Math.min(range.startRow, range.endRow));
    const endRow = Math.max(range.startRow, range.endRow);
    const startColumn = Math.max(0, Math.min(range.startColumn, range.endColumn));
    const endColumn = Math.max(range.startColumn, range.endColumn);
    selectionRanges.push({ sheetId, startRow, endRow, startColumn, endColumn });
    for (let row = startRow; row <= endRow && selection.length < GRID_SELECTION_ID_CAP; row += 1) {
      for (
        let col = startColumn;
        col <= endColumn && selection.length < GRID_SELECTION_ID_CAP;
        col += 1
      ) {
        selection.push(gridCellKey(sheetId, row, col));
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

/** 从感知状态里取出别人的选中格子（不含自己）。 */
export function gridPeerSelections(awareness: AwarenessLike): GridPeerSelection[] {
  const out: GridPeerSelection[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID || !isRec(state)) continue;
    const user = isRec(state.user) ? state.user : null;
    const raw = Array.isArray(state.selectionRanges) ? state.selectionRanges : [];
    const ranges: GridPeerSelection["ranges"] = [];
    for (const item of raw.slice(0, 20)) {
      if (!isRec(item) || typeof item.sheetId !== "string") continue;
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
}

export interface GridCollabRoomLike {
  doc: unknown;
  awareness: AwarenessLike;
  needsSeed: boolean;
  status: string;
  completeSeed(roots: string[]): void;
  subscribe(cb: () => void): () => void;
}

export interface GridJsonBinding {
  push(state: GridWorkbookSnapshot): void;
  seed(state: GridWorkbookSnapshot): void;
  onRemote(cb: (state: GridWorkbookSnapshot) => void): () => void;
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
  /** 本地变更合并后再推的等待毫秒数。 */
  debounceMs?: number;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface GridCollabBinder {
  /** 立刻把还没推出去的本地变更推出去。 */
  flush(): void;
  destroy(): void;
}

/**
 * 把一个 Univer 舞台接进协同房间：
 * - 种子：`needsSeed` 的客户端把当前工作簿写进去再 `completeSeed`；
 * - 本地变更 → 合并后整本 `push`（W11 按实体做差异，只改动变化的格子）；
 * - 远端状态 → 与「上次同步的状态」求差：只有格子变化就逐格写回，工作表结构变化才整本替换；
 *   尚未推出去的本地变更保留（叠在远端状态上）；
 * - 选区：本地选区写进感知（`selection` + `selectionRanges`），别人的选区交给 `port.highlightPeers`。
 */
export function createGridCollabBinder(options: GridCollabBinderOptions): GridCollabBinder {
  const { room, port } = options;
  const debounceMs = options.debounceMs ?? 250;
  const setTimer =
    options.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer =
    options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  const binding = options.bind({
    room,
    rootName: GRID_COLLAB_ROOT,
    toEntities: gridToEntities,
    fromEntities: gridFromEntities,
  });

  let destroyed = false;
  let applyingRemote = 0;
  let timer: unknown = null;
  /** 上一次与协同文档对齐的状态（推出去的，或收进来的）。 */
  let base: GridWorkbookSnapshot = port.getSnapshot();

  const pushNow = () => {
    if (destroyed) return;
    timer = null;
    const live = port.getSnapshot();
    binding.push(live);
    base = live;
  };

  const schedulePush = () => {
    if (destroyed || applyingRemote > 0) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(pushNow, debounceMs);
  };

  const disposeLocal = port.onLocalChange(schedulePush);

  const disposeRemote = binding.onRemote((remote) => {
    if (destroyed) return;
    const delta = diffGridSnapshots(base, remote);
    if (!delta.structural && delta.cells.length === 0) return;
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
  });

  const disposeSelection = port.onLocalSelection((sheetId, ranges) => {
    if (destroyed) return;
    const payload = gridSelectionToAwareness(sheetId, ranges);
    room.awareness.setLocalStateField("selection", payload.selection);
    room.awareness.setLocalStateField("selectionRanges", payload.selectionRanges);
  });

  const onAwareness = () => {
    if (!destroyed) port.highlightPeers(gridPeerSelections(room.awareness));
  };
  room.awareness.on("change", onAwareness);

  if (room.needsSeed) {
    binding.seed(port.getSnapshot());
    room.completeSeed([GRID_COLLAB_ROOT]);
    base = port.getSnapshot();
  }

  return {
    flush() {
      if (timer !== null) {
        clearTimer(timer);
        pushNow();
      }
    },
    destroy() {
      if (destroyed) return;
      if (timer !== null) clearTimer(timer);
      destroyed = true;
      disposeLocal();
      disposeRemote();
      disposeSelection();
      room.awareness.off("change", onAwareness);
      port.highlightPeers([]);
      binding.destroy();
    },
  };
}
