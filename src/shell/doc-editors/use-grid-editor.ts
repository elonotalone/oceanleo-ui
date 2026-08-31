"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import {
  downloadBlob,
  downloadText,
  loadEditorProject,
  saveFileToLibrary,
  type PersistedEditorVersion,
  type PreparedDeliveryUpload,
  type PreparedPreviewUpload,
  type PreparedProjectUpload,
} from "./doc-io";
import { artifactSaveStepMessage } from "./artifact-save-contract";
import { renderGridPreviewPng } from "./editor-preview-raster";
import type { GridRecalcStamp } from "./grid-formula";
import {
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
  bindGridWorkbook,
  buildGridWorkbookBlob,
  cloneGridSheets,
  columnLabel,
  emptyGridSheet,
  gridCellFormat,
  gridCellValue,
  gridColCount,
  gridDisplayValue,
  gridRowCount,
  gridSheetToCsv,
  loadGridFile,
  loadGridSheets,
  normalizeGridProjectSheetState,
  normalizeGridRecalcStamp,
  sanitizeSheetName,
  setGridCell,
  type GridCell,
  type GridCellFormat,
  type GridSheet,
} from "./grid-model";
import {
  gridRecalcSummary,
  mintGridRecalcStamp,
  recalcGridSheets,
} from "./grid-recalc-action";
import { resolveGridActiveSheetId } from "./grid-sheet-identity";
import { notifyOfficeAccessDenied } from "./office-file";
import {
  GRID_COL_WIDTH_RANGE,
  GRID_ROW_HEIGHT_RANGE,
  buildGridClipboardPayload,
  findGridMatches,
  gridFillDownLength,
  gridMergeAt,
  gridPasteTruncationMessage,
  measureGridAutoColumnWidth,
  mergeGridRange,
  normalizeGridAxisSizes,
  planGridFill,
  planGridPaste,
  planGridReplaceAll,
  rangesIntersect,
  readGridClipboard,
  splitGridRange,
  transformGridRanges,
  type GridAxisSizes,
  type GridClipboardCell,
  type GridClipboardMatrix,
  type GridConditionalFormat,
  type GridMatch,
  type GridRange,
  type GridSearchScope,
} from "./grid-structure";

export interface GridSelection {
  anchor: GridCell;
  focus: GridCell;
}

export interface GridSelectionRange {
  firstRow: number;
  lastRow: number;
  firstCol: number;
  lastCol: number;
}

export interface GridEditorState {
  item: LibraryItem;
  siteId: string;
  sheets: GridSheet[];
  activeSheet: GridSheet;
  activeSheetId: string;
  selection: GridSelection;
  /** Null until the user explicitly clicks or keyboard-selects a cell. */
  selectedCell: GridCell | null;
  selectionRange: GridSelectionRange;
  selectedValue: string;
  selectedDisplayValue: string;
  selectedFormat: GridCellFormat;
  visibleRowIndexes: number[];
  filterQuery: string;
  headerRow: boolean;
  /** 当前表的自定义行高/列宽（稀疏，只登记被改过的那几行几列）。 */
  rowHeights: GridAxisSizes;
  colWidths: GridAxisSizes;
  findOpen: boolean;
  findQuery: string;
  findReplacement: string;
  findScope: GridSearchScope;
  findCaseSensitive: boolean;
  findWholeWord: boolean;
  findMatches: GridMatch[];
  findActiveIndex: number;
  loading: boolean;
  importing: boolean;
  exporting: boolean;
  saving: boolean;
  dirty: boolean;
  editRevision: number;
  error: string;
  /** The source could not be read; the stage owes the user a retry, not a mask. */
  sourceFailed: boolean;
  savedUrl: string;
  canUndo: boolean;
  canRedo: boolean;
  setActiveSheet: (id: string) => void;
  selectCell: (cell: GridCell, extend?: boolean) => void;
  setCell: (row: number, col: number, value: string) => void;
  beginCellGesture: () => void;
  endCellGesture: () => void;
  cancelCellGesture: () => void;
  setSelectedValue: (value: string) => void;
  setFilterQuery: (value: string) => void;
  setHeaderRow: (value: boolean) => void;
  /** `true` = 这份剪贴板有表格语义，已经吃下；`false` = 交回浏览器默认行为。 */
  pasteClipboard: (payload: { html?: string; text?: string }) => boolean;
  copySelection: () => { text: string; html: string };
  clearSelection: () => void;
  fillFromSelection: (target: GridRange) => void;
  autoFillDown: () => void;
  setRowHeight: (row: number, height: number) => void;
  setColumnWidth: (col: number, width: number) => void;
  autoFitColumn: (col: number) => void;
  setFindOpen: (open: boolean) => void;
  setFindQuery: (value: string) => void;
  setFindReplacement: (value: string) => void;
  setFindScope: (scope: GridSearchScope) => void;
  setFindCaseSensitive: (value: boolean) => void;
  setFindWholeWord: (value: boolean) => void;
  stepFindMatch: (step: number) => void;
  replaceAll: () => { replaced: number; skippedFormulas: number };
  applyFormat: (patch: Partial<GridCellFormat>) => void;
  insertRow: (side: "before" | "after") => void;
  deleteRows: () => void;
  insertColumn: (side: "before" | "after") => void;
  deleteColumns: () => void;
  addSheet: () => void;
  renameSheet: (name: string) => void;
  deleteSheet: () => void;
  sort: (direction: "asc" | "desc") => void;
  mergeSelection: () => void;
  splitSelection: () => void;
  addConditionalFormat: (
    rule: Omit<GridConditionalFormat, "id" | "range">,
  ) => void;
  clearConditionalFormats: () => void;
  undo: () => void;
  redo: () => void;
  /**
   * 「重新计算」：铸一枚新的重算戳存进工程档，把随戳变化的公式和它们的下游重算一遍。
   * `TODAY()` 之类要能在屏幕上出结果，靠的就是这个动作——求值器自己永远不读时钟。
   */
  recalculate: () => void;
  /** 上一次「重新计算」的如实报数（含「无事可算」）；没点过是空串。 */
  recalcSummary: string;
  /** Re-run the source load for the same item after a failure. */
  reload: () => void;
  importSource: (file: File) => Promise<void>;
  exportCsv: () => void;
  exportXlsx: () => Promise<void>;
  save: () => Promise<GridSavedVersion | null>;
  restoreRecovery: (payload: unknown) => boolean;
}

/** 一次真表格素材保存的回执。 */
export type GridSavedVersion = PersistedEditorVersion;

interface GridSnapshot {
  sheets: GridSheet[];
  activeSheetId: string;
}

const HISTORY_LIMIT = 60;
export const GRID_PROJECT_SCHEMA = "oceanleo.grid.v1";
export const GRID_SOURCE_FORMAT = "xlsx";
export const GRID_SOURCE_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const GRID_EDITOR_CAPABILITY = "grid-editor";

/**
 * Carry the freshly published revision forward so the next save uses the new
 * pin as `expectedRevisionId`. Without this a second save inside one session
 * replays the stale pin and the CAS publish comes back 409.
 */
export function gridSavedItemForHandoff(
  original: LibraryItem,
  saved: PersistedEditorVersion,
): LibraryItem {
  const projectUrl = saved.projectUrl || "";
  const projectSchema = saved.projectSchema || GRID_PROJECT_SCHEMA;
  const base = saved.item || original;
  return {
    ...base,
    title: saved.title || base.title,
    url: saved.url || base.url,
    artifactId: saved.artifactId || base.artifactId,
    revisionId: saved.revisionId || base.revisionId,
    meta: {
      ...base.meta,
      source_format: saved.sourceFormat || GRID_SOURCE_FORMAT,
      source_media_type: saved.sourceMediaType || GRID_SOURCE_MEDIA_TYPE,
      delivery_format: GRID_SOURCE_FORMAT,
      ...(projectUrl
        ? {
            editor_project_url: projectUrl,
            editor_project_schema: projectSchema,
            editor_manifest_url: projectUrl,
            editor_manifest_schema: projectSchema,
            editor_working_head_url: projectUrl,
            editor_working_head_project_url: projectUrl,
            editor_working_head_schema: projectSchema,
          }
        : {}),
      ...(saved.savedAt ? { editor_saved_at: saved.savedAt } : {}),
      ...(saved.previousRevisionId
        ? { previous_revision_id: saved.previousRevisionId }
        : {}),
    },
  };
}

interface GridProject {
  sheets: unknown;
  activeSheetId?: string;
  headerRow?: boolean;
  filterQuery?: string;
  filterColumn?: number;
  /** 按 sheetId 分组的自定义行高/列宽；`GridSheet` 是 W12 的面，装不下它们。 */
  rowHeights?: unknown;
  colWidths?: unknown;
  /**
   * 这份工程档「按哪一刻算」（`{ at, seed }`，§规范三）。`TODAY()`/`NOW()`/`RAND()`
   * 一族读它，没有它就 fail-closed。
   *
   * 类型写成 `unknown` 是刻意的：**2026-08-31 之前存下的工程档里根本没有这个字段**，
   * 而磁盘上的 JSON 谁都可能写坏。判形状的活交给
   * `normalizeGridRecalcStamp`（缺 `seed` / 不是以 `Z` 结尾的 UTC ISO8601 /
   * `seed` 不是 uint32 一律当作**没有戳**），这里不预设它是对的，
   * 更不为缺失的旧文档编一个出来。
   */
  recalc?: unknown;
}

/** `{ sheetId: { 索引: 像素 } }`。 */
export type GridSizeMap = Record<string, GridAxisSizes>;

const EMPTY_AXIS_SIZES: GridAxisSizes = {};
const EMPTY_MATCHES: GridMatch[] = [];

function normalizeGridSizeMap(value: unknown, axis: "row" | "col"): GridSizeMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const [min, max] =
    axis === "row" ? GRID_ROW_HEIGHT_RANGE : GRID_COL_WIDTH_RANGE;
  const count = axis === "row" ? GRID_MAX_ROWS : GRID_MAX_COLS;
  const result: GridSizeMap = {};
  for (const [sheetId, sizes] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const normalized = normalizeGridAxisSizes(sizes, { count, min, max });
    if (Object.keys(normalized).length) result[sheetId] = normalized;
  }
  return result;
}

function clampAxisSize(pixels: number, axis: "row" | "col"): number {
  const [min, max] =
    axis === "row" ? GRID_ROW_HEIGHT_RANGE : GRID_COL_WIDTH_RANGE;
  return Math.round(Math.max(min, Math.min(max, pixels)));
}

/**
 * 值模式替换跳过公式格时的如实报数。这是本份活**刻意缩小的承诺**：
 * 改公式算出来的「结果」做不到（那要反解公式），Excel 的 Values 档同样禁掉替换。
 * 静默跳过比假装成功更坏，所以命中数与跳过数都摆出来，并指路公式模式。
 */
function gridReplaceSummary(
  plan: { edits: readonly unknown[]; skippedFormulas: number },
  translate: (value: string) => string,
): string {
  if (plan.skippedFormulas <= 0) return "";
  return [
    translate("已替换 "),
    String(plan.edits.length),
    translate(" 处；另有 "),
    String(plan.skippedFormulas),
    translate(" 处命中在公式格里。值模式改不了公式算出来的结果，已跳过；"),
    translate("要在公式原文里批量改引用，把查找范围切到「公式」。"),
  ].join("");
}

function gridRangeAddress(range: GridRange): string {
  const head = `${columnLabel(range.firstCol)}${range.firstRow + 1}`;
  const tail = `${columnLabel(range.lastCol)}${range.lastRow + 1}`;
  return head === tail ? head : `${head}:${tail}`;
}

/**
 * 选区 → 剪贴板矩阵。`value` 放**算出来的显示值**（Excel、邮件读到的是数字），
 * 公式另挂 `formula`；`origin` 让粘回本编辑器时能按位移平移相对引用。
 */
function gridSelectionMatrix(
  sheet: GridSheet,
  range: GridSelectionRange,
): GridClipboardMatrix {
  const rows: GridClipboardCell[][] = [];
  for (let row = range.firstRow; row <= range.lastRow; row += 1) {
    const line: GridClipboardCell[] = [];
    for (let col = range.firstCol; col <= range.lastCol; col += 1) {
      const merge = gridMergeAt(sheet.merges, row, col);
      if (merge && (merge.firstRow !== row || merge.firstCol !== col)) {
        line.push({ value: "" });
        continue;
      }
      const raw = gridCellValue(sheet, row, col);
      const format = gridCellFormat(sheet, row, col);
      const cell: GridClipboardCell = {
        value: gridDisplayValue(sheet, row, col),
      };
      if (raw.startsWith("=")) cell.formula = raw;
      if (Object.keys(format).length) cell.format = { ...format };
      if (merge) {
        // 跨出选区的合并按选区裁掉，否则粘贴方会收到一个撑破矩阵的跨度。
        const rowSpan = Math.min(merge.lastRow, range.lastRow) - row + 1;
        const colSpan = Math.min(merge.lastCol, range.lastCol) - col + 1;
        if (rowSpan > 1) cell.rowSpan = rowSpan;
        if (colSpan > 1) cell.colSpan = colSpan;
      }
      line.push(cell);
    }
    rows.push(line);
  }
  return {
    rows,
    height: rows.length,
    width: range.lastCol - range.firstCol + 1,
    origin: { row: range.firstRow, col: range.firstCol },
  };
}

export function gridSelectionRange(
  selection: GridSelection,
): GridSelectionRange {
  return {
    firstRow: Math.min(selection.anchor.row, selection.focus.row),
    lastRow: Math.max(selection.anchor.row, selection.focus.row),
    firstCol: Math.min(selection.anchor.col, selection.focus.col),
    lastCol: Math.max(selection.anchor.col, selection.focus.col),
  };
}

function formatCoordinates(
  formats: Record<string, GridCellFormat>,
  map: (row: number, col: number) => GridCell | null,
): Record<string, GridCellFormat> {
  const result: Record<string, GridCellFormat> = {};
  for (const [key, format] of Object.entries(formats)) {
    const [row, col] = key.split(":").map(Number);
    const next = map(row, col);
    if (next) result[`${next.row}:${next.col}`] = { ...format };
  }
  return result;
}

function normalizedSheetName(
  requested: string,
  sheets: GridSheet[],
  currentId: string,
): string {
  const base = sanitizeSheetName(requested);
  const used = new Set(
    sheets
      .filter((sheet) => sheet.id !== currentId)
      .map((sheet) => sheet.name.toLowerCase()),
  );
  if (!used.has(base.toLowerCase())) return base;
  let serial = 2;
  while (used.has(`${base.slice(0, 27)}-${serial}`.toLowerCase())) serial += 1;
  return `${base.slice(0, 27)}-${serial}`;
}

function boundedLoadKey(parts: readonly unknown[]): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(parts) || "";
  } catch {
    return "unserializable";
  }
  return serialized.length <= 8192
    ? serialized
    : `${serialized.length}:${serialized.slice(0, 8192)}`;
}

/**
 * Everything the load effect reads out of `item`, flattened into one string.
 * Keying the effect on the value rather than on the object identity is what
 * makes a caller that rebuilds `item` or the callbacks every render harmless.
 */
export function gridSourceLoadKey(item: LibraryItem): string {
  const meta = item.meta || {};
  return boundedLoadKey([
    item.id,
    item.key,
    item.kind,
    item.artifactId || "",
    item.revisionId || "",
    item.url || "",
    item.previewUrl || "",
    item.content || "",
    meta.editor_project_url ?? "",
    meta.editor_working_head_url ?? "",
    meta.sheets ?? null,
    meta.rows ?? null,
  ]);
}

/**
 * Name the step that failed and the way out. A bare「工作簿加载失败」tells the
 * user nothing they can act on, and an endless mask tells them even less.
 */
export function gridSourceFailureMessage(
  caught: unknown,
  translate: (value: string) => string,
): string {
  const detail =
    caught instanceof Error ? translate(caught.message).trim() : "";
  const head = translate("没能读到这份表格的源文件，现在停在一张空白工作簿上。");
  const tail = translate("点「重新载入」再试一次，或直接上传本地表格接着做。");
  return detail ? `${head}原因：${detail}。${tail}` : `${head}${tail}`;
}

export function useGridEditor(
  item: LibraryItem,
  siteId = "",
  onSourceAccessError?: () => void,
): GridEditorState {
  const tt = useUI();
  const initial = useMemo(() => emptyGridSheet(), []);
  const [sheets, setSheets] = useState<GridSheet[]>([initial]);
  const [activeSheetId, setActiveSheetId] = useState(initial.id);
  const [selection, setSelection] = useState<GridSelection>({
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  });
  const [hasSelectedCell, setHasSelectedCell] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterColumn, setFilterColumn] = useState(0);
  const [headerRow, setHeaderRow] = useState(true);
  const [rowHeightMap, setRowHeightMap] = useState<GridSizeMap>({});
  const [colWidthMap, setColWidthMap] = useState<GridSizeMap>({});
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findReplacement, setFindReplacement] = useState("");
  const [findScope, setFindScope] = useState<GridSearchScope>("value");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findWholeWord, setFindWholeWord] = useState(false);
  const [findActiveIndex, setFindActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sourceFailed, setSourceFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [savedUrl, setSavedUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [recalcSummary, setRecalcSummary] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const sheetsRef = useRef(sheets);
  const activeRef = useRef(activeSheetId);
  const undoRef = useRef<GridSnapshot[]>([]);
  const redoRef = useRef<GridSnapshot[]>([]);
  /**
   * 这份文档的重算戳。它**不在 React state 里也不在 undo 栈里**，因为它不是格子内容：
   * 求值时画布拿到它的途径是 `grid-model` 那张 `WeakMap` 登记表
   * （`bindGridWorkbook` / `cloneGridSheets`）。这里留一份是为了存盘写得回去，
   * 以及每次 `applySnapshot` 重新登记时有据可依。
   */
  const recalcRef = useRef<GridRecalcStamp | undefined>(undefined);
  const cellGestureRef = useRef<GridSnapshot | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const workingHeadUrlRef = useRef(item.url || item.previewUrl || "");
  /** The pin a save publishes against; advances with every committed revision. */
  const persistedItemRef = useRef(item);
  const preparedSaveRef = useRef<{
    key: string;
    project?: PreparedProjectUpload;
    delivery?: PreparedDeliveryUpload;
    preview?: PreparedPreviewUpload;
  } | null>(null);

  const applySnapshot = useCallback((snapshot: GridSnapshot) => {
    const next = cloneGridSheets(snapshot.sheets);
    // `cloneGridSheets` 从来源那本工作簿继承戳，够用于「编辑之后戳还在」；
    // 但 undo 栈里的快照是**盖新戳之前**克隆的，顺着继承走会让「撤销一步」
    // 把重算时刻也一起退回去。戳是文档级属性，不该被 undo 栈支配，所以在这里
    // 按当前这一枚重新登记一次。
    // ⚠️ 这条路上命名区域恒为空：hook 只经 `normalizeGridProjectSheetState`
    // 与 `readWorkbook`，两者都不带 `namedRanges`（带它的是 `gridIrToCarrierProject`，
    // 那是 IR → carrier，不是 hook 的载入路径）。哪天 hook 也开始收命名区域，
    // 这里要跟着一起传，否则会被这次重新登记抹掉。
    if (recalcRef.current) bindGridWorkbook(next, { recalc: recalcRef.current });
    const active = resolveGridActiveSheetId(next, snapshot.activeSheetId);
    sheetsRef.current = next;
    activeRef.current = active;
    setSheets(next);
    setActiveSheetId(active);
    setHistoryRevision((value) => value + 1);
  }, []);

  const commitSheets = useCallback(
    (next: GridSheet[], nextActiveId = activeRef.current) => {
      undoRef.current = [
        ...undoRef.current,
        {
          sheets: cloneGridSheets(sheetsRef.current),
          activeSheetId: activeRef.current,
        },
      ].slice(-HISTORY_LIMIT);
      redoRef.current = [];
      revisionRef.current += 1;
      applySnapshot({ sheets: next, activeSheetId: nextActiveId });
      setSavedUrl("");
      setDirty(true);
    },
    [applySnapshot],
  );

  const mutate = useCallback(
    (
      change: (draft: GridSheet[]) => void,
      nextActiveId = activeRef.current,
    ) => {
      const draft = cloneGridSheets(sheetsRef.current);
      change(draft);
      commitSheets(draft, nextActiveId);
    },
    [commitSheets],
  );

  const beginCellGesture = useCallback(() => {
    if (!cellGestureRef.current) {
      cellGestureRef.current = {
        sheets: cloneGridSheets(sheetsRef.current),
        activeSheetId: activeRef.current,
      };
    }
  }, []);
  const endCellGesture = useCallback(() => {
    const before = cellGestureRef.current;
    if (!before) return;
    cellGestureRef.current = null;
    if (JSON.stringify(before.sheets) === JSON.stringify(sheetsRef.current)) return;
    undoRef.current = [...undoRef.current, before].slice(-HISTORY_LIMIT);
    redoRef.current = [];
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
    setHistoryRevision((value) => value + 1);
  }, []);
  const cancelCellGesture = useCallback(() => {
    const before = cellGestureRef.current;
    if (!before) return;
    cellGestureRef.current = null;
    applySnapshot(before);
  }, [applySnapshot]);

  /**
   * The caller hands these in fresh on every render. Reading them through refs
   * is what keeps them out of the load effect's dependency array — with them in
   * it, every render restarted the load and the mask never came down.
   */
  const sourceAccessErrorRef = useRef(onSourceAccessError);
  useEffect(() => {
    sourceAccessErrorRef.current = onSourceAccessError;
  }, [onSourceAccessError]);
  const notifySourceAccessError = useCallback(() => {
    sourceAccessErrorRef.current?.();
  }, []);
  const itemRef = useRef(item);
  useEffect(() => {
    itemRef.current = item;
  }, [item]);
  // `tt` is memoized today, but it is a provider-owned function: one unmemoized
  // locale provider would re-arm the very loop this file exists to kill.
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  // 第二个入参必须转发：`gridRecalcSummary` 那句回执带 `{cells}`／`{formulas}`，
  // 丢掉 `vars` 的话屏幕上会原样印出 `{cells}` 四个字。
  //
  // 这里**故意不把它标注成 `UITranslate`**：`i18n-tt-key-coverage` 认翻译函数是
  // 按「类型文本里有没有 UITranslate」在**整份文件**里收名字的，一标注，本文件里
  // 另外两处同名 `translate`（`gridReplaceSummary` 的片段拼句、源文件读失败那两句）
  // 会一起被收进扫描面，而它们今天都还没有译文——那等于我把闸弄红。
  // 那几条是既有欠账，见 `W37-request.md`，不在这一笔里顺手改。
  const translate = useCallback(
    (value: string, vars?: Record<string, string | number>) =>
      translateRef.current(value, vars),
    [],
  );
  const loadKey = useMemo(() => gridSourceLoadKey(item), [item]);

  useEffect(() => {
    const source = itemRef.current;
    mountedRef.current = true;
    const controller = new AbortController();
    const operation = ++operationRef.current;
    setLoading(true);
    setError("");
    setSourceFailed(false);
    setSavedUrl("");
    setDirty(false);
    setFilterQuery("");
    setFilterColumn(0);
    setRecalcSummary("");
    recalcRef.current = undefined;
    revisionRef.current = 0;
    persistedItemRef.current = source;
    preparedSaveRef.current = null;
    workingHeadUrlRef.current = String(
      source.meta.editor_working_head_url ||
        source.url ||
        source.previewUrl ||
        "",
    );
    const projectUrl = String(source.meta.editor_project_url || "").trim();
    void (projectUrl
      ? loadEditorProject<GridProject>(
          projectUrl,
          GRID_PROJECT_SCHEMA,
          controller.signal,
        ).then((project) => {
          const normalized = normalizeGridProjectSheetState(
            project.sheets,
            project.activeSheetId,
            { recalc: project.recalc },
          );
          return {
            ...normalized,
            headerRow: project.headerRow !== false,
            filterQuery: String(project.filterQuery || "").slice(0, 500),
            filterColumn: Math.max(0, Number(project.filterColumn) || 0),
            rowHeights: normalizeGridSizeMap(project.rowHeights, "row"),
            colWidths: normalizeGridSizeMap(project.colWidths, "col"),
            // 同一个 fail-closed 口径判两次：一次给画布（上面那个入参），
            // 一次给存盘（下面这个）。坏戳两边都当作没有戳，绝不各判各的。
            recalc: normalizeGridRecalcStamp(project.recalc),
          };
        })
      : loadGridSheets(
          source,
          controller.signal,
          notifySourceAccessError,
        ).then((loaded) => ({
          sheets: loaded,
          activeSheetId: "",
          headerRow: true,
          filterQuery: "",
          filterColumn: 0,
          rowHeights: {} as GridSizeMap,
          colWidths: {} as GridSizeMap,
          // 直接读 xlsx/csv 的那条路没有工程档，也就没有戳：无戳就是无戳。
          recalc: undefined as GridRecalcStamp | undefined,
        }))
    )
      .then((loaded) => {
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          operation !== operationRef.current
        ) {
          return;
        }
        const next = loaded.sheets.length
          ? loaded.sheets
          : [emptyGridSheet()];
        const nextActive = resolveGridActiveSheetId(
          next,
          loaded.activeSheetId,
        );
        undoRef.current = [];
        redoRef.current = [];
        cellGestureRef.current = null;
        // 必须排在 `applySnapshot` 之前：它会按这一枚重新登记克隆出来的表。
        recalcRef.current = loaded.recalc;
        applySnapshot({ sheets: next, activeSheetId: nextActive });
        setSelection({
          anchor: { row: 0, col: 0 },
          focus: { row: 0, col: 0 },
        });
        setHasSelectedCell(false);
        setFilterQuery(loaded.filterQuery);
        setFilterColumn(loaded.filterColumn);
        setHeaderRow(loaded.headerRow);
        setRowHeightMap(loaded.rowHeights);
        setColWidthMap(loaded.colWidths);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || !mountedRef.current) return;
        notifyOfficeAccessDenied(caught, notifySourceAccessError);
        const fallback = emptyGridSheet();
        applySnapshot({ sheets: [fallback], activeSheetId: fallback.id });
        setHasSelectedCell(false);
        setSourceFailed(true);
        setError(gridSourceFailureMessage(caught, translate));
      })
      .finally(() => {
        if (mountedRef.current && operation === operationRef.current) {
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      operationRef.current += 1;
      mountedRef.current = false;
    };
  }, [
    applySnapshot,
    loadKey,
    notifySourceAccessError,
    reloadNonce,
    translate,
  ]);

  const reload = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  const activeSheet =
    sheets.find((sheet) => sheet.id === activeSheetId) ?? sheets[0];
  const range = useMemo(() => gridSelectionRange(selection), [selection]);
  const selectedValue = gridCellValue(
    activeSheet,
    selection.focus.row,
    selection.focus.col,
  );
  const selectedDisplayValue = gridDisplayValue(
    activeSheet,
    selection.focus.row,
    selection.focus.col,
  );
  const selectedFormat = gridCellFormat(
    activeSheet,
    selection.focus.row,
    selection.focus.col,
  );
  const visibleRowIndexes = useMemo(() => {
    const all = Array.from(
      { length: gridRowCount(activeSheet) },
      (_, index) => index,
    );
    const query = filterQuery.trim().toLocaleLowerCase();
    if (!query) return all;
    return all.filter(
      (row) =>
        (headerRow && row === 0) ||
        gridDisplayValue(activeSheet, row, filterColumn)
          .toLocaleLowerCase()
          .includes(query),
    );
  }, [activeSheet, filterColumn, filterQuery, headerRow]);

  const updateFilterQuery = useCallback(
    (value: string) => {
      setFilterQuery(value.slice(0, 500));
      setFilterColumn(selection.focus.col);
      revisionRef.current += 1;
      setDirty(true);
      setSavedUrl("");
    },
    [selection.focus.col],
  );

  const updateHeaderRow = useCallback((value: boolean) => {
    setHeaderRow(value);
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, []);

  const setActiveSheet = useCallback((id: string) => {
    if (!sheetsRef.current.some((sheet) => sheet.id === id)) return;
    activeRef.current = id;
    setActiveSheetId(id);
    setSelection({
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    });
    setHasSelectedCell(false);
    setFilterQuery("");
    setFilterColumn(0);
    cellGestureRef.current = null;
  }, []);

  const selectCell = useCallback((cell: GridCell, extend = false) => {
    setHasSelectedCell(true);
    setSelection((current) => ({
      anchor: extend ? current.anchor : cell,
      focus: cell,
    }));
  }, []);

  const setCellValue = useCallback(
    (row: number, col: number, value: string) => {
      if (cellGestureRef.current) {
        const draft = cloneGridSheets(sheetsRef.current);
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (sheet) setGridCell(sheet, row, col, value);
        applySnapshot({ sheets: draft, activeSheetId: activeRef.current });
        return;
      }
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (sheet) setGridCell(sheet, row, col, value);
      });
    },
    [applySnapshot, mutate],
  );

  const applyFormat = useCallback(
    (patch: Partial<GridCellFormat>) => {
      const selected = gridSelectionRange(selection);
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (!sheet) return;
        for (let row = selected.firstRow; row <= selected.lastRow; row += 1) {
          for (let col = selected.firstCol; col <= selected.lastCol; col += 1) {
            const key = `${row}:${col}`;
            sheet.formats[key] = { ...(sheet.formats[key] || {}), ...patch };
          }
        }
      });
    },
    [mutate, selection],
  );

  const insertRow = useCallback(
    (side: "before" | "after") => {
      const selected = gridSelectionRange(selection);
      const index =
        side === "before" ? selected.firstRow : selected.lastRow + 1;
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (!sheet) return;
        sheet.rows.splice(index, 0, Array(gridColCount(sheet)).fill(""));
        sheet.formats = formatCoordinates(sheet.formats, (row, col) => ({
          row: row >= index ? row + 1 : row,
          col,
        }));
        sheet.merges = transformGridRanges(sheet.merges, "row", index, 1);
        sheet.conditionalFormats = sheet.conditionalFormats.flatMap((rule) => {
          const [range] = transformGridRanges([rule.range], "row", index, 1);
          return range ? [{ ...rule, range }] : [];
        });
      });
      const cell = { row: index, col: selection.focus.col };
      setSelection({ anchor: cell, focus: cell });
    },
    [mutate, selection],
  );

  const deleteRows = useCallback(() => {
    const selected = gridSelectionRange(selection);
    mutate((draft) => {
      const sheet = draft.find((entry) => entry.id === activeRef.current);
      if (!sheet) return;
      const count = selected.lastRow - selected.firstRow + 1;
      sheet.rows.splice(selected.firstRow, count);
      if (sheet.rows.length === 0) sheet.rows.push(Array(gridColCount(sheet)).fill(""));
      sheet.formats = formatCoordinates(sheet.formats, (row, col) => {
        if (row >= selected.firstRow && row <= selected.lastRow) return null;
        return { row: row > selected.lastRow ? row - count : row, col };
      });
      sheet.merges = transformGridRanges(
        sheet.merges,
        "row",
        selected.firstRow,
        -count,
      ).filter(
        (merge) =>
          merge.firstRow !== merge.lastRow || merge.firstCol !== merge.lastCol,
      );
      sheet.conditionalFormats = sheet.conditionalFormats.flatMap((rule) => {
        const [range] = transformGridRanges(
          [rule.range],
          "row",
          selected.firstRow,
          -count,
        );
        return range ? [{ ...rule, range }] : [];
      });
    });
    const cell = {
      row: Math.max(0, selected.firstRow - 1),
      col: selection.focus.col,
    };
    setSelection({ anchor: cell, focus: cell });
  }, [mutate, selection]);

  const insertColumn = useCallback(
    (side: "before" | "after") => {
      const selected = gridSelectionRange(selection);
      const index =
        side === "before" ? selected.firstCol : selected.lastCol + 1;
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (!sheet) return;
        const rows = Math.max(sheet.rows.length, 1);
        while (sheet.rows.length < rows) sheet.rows.push([]);
        for (const row of sheet.rows) row.splice(index, 0, "");
        sheet.formats = formatCoordinates(sheet.formats, (row, col) => ({
          row,
          col: col >= index ? col + 1 : col,
        }));
        sheet.merges = transformGridRanges(sheet.merges, "col", index, 1);
        sheet.conditionalFormats = sheet.conditionalFormats.flatMap((rule) => {
          const [range] = transformGridRanges([rule.range], "col", index, 1);
          return range ? [{ ...rule, range }] : [];
        });
      });
      const cell = { row: selection.focus.row, col: index };
      setSelection({ anchor: cell, focus: cell });
    },
    [mutate, selection],
  );

  const deleteColumns = useCallback(() => {
    const selected = gridSelectionRange(selection);
    mutate((draft) => {
      const sheet = draft.find((entry) => entry.id === activeRef.current);
      if (!sheet) return;
      const count = selected.lastCol - selected.firstCol + 1;
      for (const row of sheet.rows) {
        row.splice(selected.firstCol, count);
        if (row.length === 0) row.push("");
      }
      sheet.formats = formatCoordinates(sheet.formats, (row, col) => {
        if (col >= selected.firstCol && col <= selected.lastCol) return null;
        return { row, col: col > selected.lastCol ? col - count : col };
      });
      sheet.merges = transformGridRanges(
        sheet.merges,
        "col",
        selected.firstCol,
        -count,
      ).filter(
        (merge) =>
          merge.firstRow !== merge.lastRow || merge.firstCol !== merge.lastCol,
      );
      sheet.conditionalFormats = sheet.conditionalFormats.flatMap((rule) => {
        const [range] = transformGridRanges(
          [rule.range],
          "col",
          selected.firstCol,
          -count,
        );
        return range ? [{ ...rule, range }] : [];
      });
    });
    const cell = {
      row: selection.focus.row,
      col: Math.max(0, selected.firstCol - 1),
    };
    setSelection({ anchor: cell, focus: cell });
  }, [mutate, selection]);

  const mergeSelection = useCallback(() => {
    const selected = gridSelectionRange(selection);
    try {
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (!sheet) return;
        sheet.merges = mergeGridRange(sheet.merges, selected);
        for (let row = selected.firstRow; row <= selected.lastRow; row += 1) {
          for (let col = selected.firstCol; col <= selected.lastCol; col += 1) {
            if (row !== selected.firstRow || col !== selected.firstCol) {
              setGridCell(sheet, row, col, "");
              delete sheet.formats[`${row}:${col}`];
            }
          }
        }
      });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? tt(caught.message) : tt("合并失败"));
    }
  }, [mutate, selection, tt]);

  const splitSelection = useCallback(() => {
    const selected = gridSelectionRange(selection);
    mutate((draft) => {
      const sheet = draft.find((entry) => entry.id === activeRef.current);
      if (sheet) sheet.merges = splitGridRange(sheet.merges, selected);
    });
  }, [mutate, selection]);

  const addConditionalFormat = useCallback(
    (rule: Omit<GridConditionalFormat, "id" | "range">) => {
      const selected = gridSelectionRange(selection);
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (!sheet) return;
        sheet.conditionalFormats.push({
          ...rule,
          id: `conditional-${Date.now().toString(36)}-${sheet.conditionalFormats.length + 1}`,
          range: selected,
        });
      });
    },
    [mutate, selection],
  );

  const clearConditionalFormats = useCallback(() => {
    const selected = gridSelectionRange(selection);
    mutate((draft) => {
      const sheet = draft.find((entry) => entry.id === activeRef.current);
      if (!sheet) return;
      sheet.conditionalFormats = sheet.conditionalFormats.filter(
        (rule) => !rangesIntersect(rule.range, selected),
      );
    });
  }, [mutate, selection]);

  const addSheet = useCallback(() => {
    const created = emptyGridSheet(`Sheet${sheetsRef.current.length + 1}`);
    created.name = normalizedSheetName(
      created.name,
      sheetsRef.current,
      created.id,
    );
    mutate((draft) => draft.push(created), created.id);
    setSelection({
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    });
    setHasSelectedCell(false);
  }, [mutate]);

  const renameSheet = useCallback(
    (name: string) => {
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (sheet) {
          sheet.name = normalizedSheetName(name, draft, sheet.id);
        }
      });
    },
    [mutate],
  );

  const deleteSheet = useCallback(() => {
    const current = sheetsRef.current;
    if (current.length <= 1) return;
    const index = current.findIndex((sheet) => sheet.id === activeRef.current);
    const remaining = current.filter(
      (sheet) => sheet.id !== activeRef.current,
    );
    const nextId = resolveGridActiveSheetId(
      remaining,
      current[index + 1]?.id,
      current[index - 1]?.id,
    );
    mutate(
      (draft) => {
        const target = draft.findIndex((sheet) => sheet.id === activeRef.current);
        if (target >= 0) draft.splice(target, 1);
      },
      nextId,
    );
    setHasSelectedCell(false);
  }, [mutate]);

  const sort = useCallback(
    (direction: "asc" | "desc") => {
      const column = selection.focus.col;
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (!sheet) return;
        const start = headerRow ? 1 : 0;
        const indexed = sheet.rows.slice(start).map((row, offset) => ({
          row,
          original: start + offset,
          value: gridDisplayValue(sheet, start + offset, column),
        }));
        indexed.sort((left, right) => {
          const leftNumber = Number(left.value);
          const rightNumber = Number(right.value);
          const compared =
            Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
              ? leftNumber - rightNumber
              : left.value.localeCompare(right.value, undefined, {
                  numeric: true,
                });
          return direction === "asc" ? compared : -compared;
        });
        const prefix = sheet.rows.slice(0, start);
        sheet.rows = [...prefix, ...indexed.map((entry) => entry.row)];
        const positions = new Map<number, number>();
        indexed.forEach((entry, offset) =>
          positions.set(entry.original, start + offset),
        );
        sheet.formats = formatCoordinates(sheet.formats, (row, col) => ({
          row: row < start ? row : positions.get(row) ?? row,
          col,
        }));
      });
    },
    [headerRow, mutate, selection.focus.col],
  );

  const undo = useCallback(() => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push({
      sheets: cloneGridSheets(sheetsRef.current),
      activeSheetId: activeRef.current,
    });
    applySnapshot(previous);
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push({
      sheets: cloneGridSheets(sheetsRef.current),
      activeSheetId: activeRef.current,
    });
    applySnapshot(next);
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, [applySnapshot]);

  const importSource = useCallback(
    async (file: File) => {
      const operation = ++operationRef.current;
      setImporting(true);
      setError("");
      try {
        const loaded = await loadGridFile(file);
        if (!mountedRef.current || operation !== operationRef.current) return;
        // An imported workbook replaces the source we could not read.
        setSourceFailed(false);
        setLoading(false);
        commitSheets(loaded, loaded[0].id);
        setSelection({
          anchor: { row: 0, col: 0 },
          focus: { row: 0, col: 0 },
        });
        setHasSelectedCell(false);
        setFilterQuery("");
      } catch (caught) {
        if (mountedRef.current && operation === operationRef.current) {
          setError(
            caught instanceof Error
              ? tt(caught.message)
              : tt("工作簿导入失败"),
          );
        }
      } finally {
        if (mountedRef.current && operation === operationRef.current) {
          setImporting(false);
        }
      }
    },
    [commitSheets, tt],
  );

  const baseTitle = item.title || tt("工作簿");
  const exportCsv = useCallback(() => {
    downloadText(
      `${baseTitle}-${activeSheet.name}.csv`,
      `\uFEFF${gridSheetToCsv(activeSheet)}`,
      "text/csv;charset=utf-8",
    );
  }, [activeSheet, baseTitle]);

  const exportXlsx = useCallback(async () => {
    setExporting(true);
    setError("");
    try {
      downloadBlob(`${baseTitle}.xlsx`, await buildGridWorkbookBlob(sheetsRef.current));
    } catch (caught) {
      if (mountedRef.current) {
        setError(
          caught instanceof Error ? tt(caught.message) : tt("导出 XLSX 失败"),
        );
      }
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }, [baseTitle, tt]);

  const save = useCallback(async (): Promise<GridSavedVersion | null> => {
    if (savingRef.current) return null;
    const savingRevision = revisionRef.current;
    const snapshot = cloneGridSheets(sheetsRef.current);
    const baseItem = persistedItemRef.current;
    const baseRevision = String(
      baseItem.revisionId || baseItem.meta.revision_id || baseItem.id,
    );
    const rootId = String(
      baseItem.artifactId || baseItem.meta.artifact_id || baseItem.id,
    );
    const saveKey = `grid:${savingRevision}:${baseRevision.slice(
      -80,
    )}:${rootId.slice(-80)}`;
    const prepared =
      preparedSaveRef.current?.key === saveKey
        ? preparedSaveRef.current
        : null;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${baseTitle}-${tt("编辑版")}`;
      const fileStem =
        title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 180) || "workbook";
      const result = await saveFileToLibrary({
        item: baseItem,
        siteId,
        fallbackSite: "excel",
        // Build the workbook only after the project sidecar is durable, so an
        // exporter failure cannot lose the recoverable edit state.
        createFile: async () => {
          const delivery = await buildGridWorkbookBlob(snapshot);
          return new File([delivery], `${fileStem}.xlsx`, {
            type: GRID_SOURCE_MEDIA_TYPE,
          });
        },
        createPreview: () =>
          renderGridPreviewPng(snapshot, { headerRow }),
        sourceFormat: GRID_SOURCE_FORMAT,
        sourceMediaType: GRID_SOURCE_MEDIA_TYPE,
        title,
        mediaType: "sheet",
        kind: "sheet",
        idempotencyKey: saveKey,
        workingHeadUrl: workingHeadUrlRef.current,
        preparedProject: prepared?.project,
        preparedDelivery: prepared?.delivery,
        preparedPreview: prepared?.preview,
        meta: {
          editor: "grid-v2",
          editor_capability: GRID_EDITOR_CAPABILITY,
          content_type: "grid",
          sheet_count: snapshot.length,
          sheet_names: snapshot.map((sheet) => sheet.name),
          delivery_format: GRID_SOURCE_FORMAT,
        },
        project: {
          schema: GRID_PROJECT_SCHEMA,
          data: {
            sheets: snapshot,
            activeSheetId: activeRef.current,
            headerRow,
            filterQuery,
            filterColumn,
            rowHeights: rowHeightMap,
            colWidths: colWidthMap,
            // 戳不写进去，下次打开这份文档 `TODAY()` 又回到 fail-closed，
            // 用户会以为「刚才点的重新计算白点了」。没有戳的文档照旧不写这个键，
            // 不给旧文档凭空造一个。
            ...(recalcRef.current ? { recalc: recalcRef.current } : {}),
          },
        },
        editorManifest: {
          id: GRID_EDITOR_CAPABILITY,
          format: GRID_PROJECT_SCHEMA,
        },
        // Editing an xlsx material used to go through the legacy creation path
        // only, so it never produced a new artifact revision.
        artifactRevision: {
          artifactType: "grid",
          provenance: {
            editorRevision: savingRevision,
            sheetCount: snapshot.length,
          },
        },
      });
      if (!mountedRef.current) return null;
      if (!result.ok) {
        preparedSaveRef.current =
          result.preparedProject ||
          result.preparedDelivery ||
          result.preparedPreview
            ? {
                key: saveKey,
                project: result.preparedProject,
                delivery: result.preparedDelivery,
                preview: result.preparedPreview,
              }
            : preparedSaveRef.current;
        setError(
          tt(result.error) ||
            artifactSaveStepMessage("revision-publish", ""),
        );
        return null;
      }
      preparedSaveRef.current = null;
      const version: GridSavedVersion = {
        url: result.url,
        versionId: result.versionId,
        projectUrl: result.projectUrl,
        projectSchema: result.projectSchema,
        sourceFormat: result.sourceFormat || GRID_SOURCE_FORMAT,
        sourceMediaType: result.sourceMediaType || GRID_SOURCE_MEDIA_TYPE,
        title: result.title,
        fileName: result.fileName,
        savedAt: result.savedAt,
        artifactId: result.artifactId,
        revisionId: result.revisionId,
        previousRevisionId: result.previousRevisionId,
        preparedProject: result.preparedProject,
        preparedDelivery: result.preparedDelivery,
      };
      const handoff = gridSavedItemForHandoff(baseItem, version);
      persistedItemRef.current = handoff;
      workingHeadUrlRef.current = result.projectUrl || result.url;
      setSavedUrl(result.url);
      if (revisionRef.current === savingRevision) setDirty(false);
      return { ...version, item: handoff };
    } catch (caught) {
      if (mountedRef.current) {
        setError(
          artifactSaveStepMessage(
            "revision-publish",
            caught instanceof Error ? tt(caught.message) : caught,
          ),
        );
      }
      return null;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [
    baseTitle,
    colWidthMap,
    filterColumn,
    filterQuery,
    headerRow,
    rowHeightMap,
    siteId,
    tt,
  ]);

  const restoreRecovery = useCallback(
    (payload: unknown): boolean => {
      if (!payload || typeof payload !== "object") return false;
      const project = payload as GridProject;
      const normalized = normalizeGridProjectSheetState(
        project.sheets,
        project.activeSheetId,
        { recalc: project.recalc },
      );
      if (!normalized.sheets.length) return false;
      undoRef.current = [];
      redoRef.current = [];
      setSourceFailed(false);
      setError("");
      recalcRef.current = normalizeGridRecalcStamp(project.recalc);
      applySnapshot(normalized);
      setHeaderRow(project.headerRow !== false);
      setFilterQuery(String(project.filterQuery || "").slice(0, 500));
      setFilterColumn(Math.max(0, Number(project.filterColumn) || 0));
      setRowHeightMap(normalizeGridSizeMap(project.rowHeights, "row"));
      setColWidthMap(normalizeGridSizeMap(project.colWidths, "col"));
      setHasSelectedCell(false);
      revisionRef.current += 1;
      setDirty(true);
      setSavedUrl("");
      return true;
    },
    [applySnapshot],
  );

  /**
   * 「重新计算」。**A3 的铸戳点与 P4 增量重算的消费方是同一个动作**，就是这一个。
   *
   * 求值器不许读宿主时钟（`grid-formula.ts` 上钉着源码级判据），所以
   * `=TODAY()` 想在屏幕上出结果，必须有人**把某一刻写进文档**——那个人就是这里。
   * 戳一旦铸出来，同一份文档关掉重开、导出、重算多少次都给同一个数，
   * 变的只有用户再点一次这个按钮的时候。
   *
   * 空计划不标脏：一份没有 volatile 公式的表格重算完逐格相同，
   * 为它造一个新 revision 只会让「未保存」的红点说谎。这就是增量计划的用处——
   * 它回答的不是「快不快」，而是「这次到底有没有事情发生」。
   */
  const recalculate = useCallback(() => {
    const stamp = mintGridRecalcStamp();
    const outcome = recalcGridSheets(sheetsRef.current, stamp);
    setRecalcSummary(gridRecalcSummary(outcome, translate));
    if (outcome.patch.size === 0) return;
    // 先立戳再 applySnapshot：后者会拿 `recalcRef.current` 给克隆出来的表重新登记。
    recalcRef.current = stamp;
    applySnapshot({
      sheets: sheetsRef.current,
      activeSheetId: activeRef.current,
    });
    // 撤销栈里不留记录：戳不是格子内容，`applySnapshot` 又总按当前这一枚登记，
    // 真压一条进去只会得到一个「按了没反应」的撤销。
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, [applySnapshot, translate]);

  /* ══════════════════════ 剪贴板：粘贴、复制、剪切 ══════════════════════ */

  const pasteClipboard = useCallback(
    (payload: { html?: string; text?: string }): boolean => {
      const matrix = readGridClipboard(payload);
      if (!matrix || !matrix.rows.length) return false;
      const plan = planGridPaste(matrix, gridSelectionRange(selection), {
        maxRows: GRID_MAX_ROWS,
        maxCols: GRID_MAX_COLS,
      });
      if (!plan.cells.length) return false;
      // 一次 `mutate()` = 一条 undo 记录：整片粘贴一步撤回。
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (!sheet) return;
        // 落点上的旧合并先拆开，否则新内容会被残留的跨度盖住。
        sheet.merges = splitGridRange(sheet.merges, plan.target);
        for (const cell of plan.cells) {
          setGridCell(sheet, cell.row, cell.col, cell.value);
          const key = `${cell.row}:${cell.col}`;
          if (cell.format) sheet.formats[key] = { ...cell.format };
          else delete sheet.formats[key];
        }
        for (const merge of plan.merges) {
          try {
            sheet.merges = mergeGridRange(sheet.merges, merge);
          } catch {
            // 单个跨度落不下不该让整片粘贴失败——值已经写进去了。
          }
        }
      });
      setSelection({
        anchor: { row: plan.target.firstRow, col: plan.target.firstCol },
        focus: { row: plan.target.lastRow, col: plan.target.lastCol },
      });
      setHasSelectedCell(true);
      setError(
        plan.truncated
          ? `${gridPasteTruncationMessage(plan, tt)}（${tt(
              "已写入",
            )} ${gridRangeAddress(plan.target)}）`
          : "",
      );
      return true;
    },
    [mutate, selection, tt],
  );

  const copySelection = useCallback((): { text: string; html: string } => {
    const sheet =
      sheetsRef.current.find((entry) => entry.id === activeRef.current) ??
      sheetsRef.current[0];
    return buildGridClipboardPayload(
      gridSelectionMatrix(sheet, gridSelectionRange(selection)),
    );
  }, [selection]);

  /** 剪切的后半段：值、格式、合并一起清掉，同样只占一条 undo。 */
  const clearSelection = useCallback(() => {
    const selected = gridSelectionRange(selection);
    mutate((draft) => {
      const sheet = draft.find((entry) => entry.id === activeRef.current);
      if (!sheet) return;
      sheet.merges = splitGridRange(sheet.merges, selected);
      for (let row = selected.firstRow; row <= selected.lastRow; row += 1) {
        for (let col = selected.firstCol; col <= selected.lastCol; col += 1) {
          setGridCell(sheet, row, col, "");
          delete sheet.formats[`${row}:${col}`];
        }
      }
    });
  }, [mutate, selection]);

  /* ══════════════════════════ 填充柄 ══════════════════════════ */

  const fillFromSelection = useCallback(
    (target: GridRange) => {
      const source = gridSelectionRange(selection);
      const downCount = Math.min(
        Math.max(0, target.lastRow - source.lastRow),
        GRID_MAX_ROWS - 1 - source.lastRow,
      );
      const rightCount = Math.min(
        Math.max(0, target.lastCol - source.lastCol),
        GRID_MAX_COLS - 1 - source.lastCol,
      );
      if (downCount <= 0 && rightCount <= 0) return;
      // 一次拖拽只沿一个轴走（Excel 行为）；两个方向都拉时按拉得更远的那个。
      const axis: "row" | "col" = downCount >= rightCount ? "row" : "col";
      mutate((draft) => {
        const sheet = draft.find((entry) => entry.id === activeRef.current);
        if (!sheet) return;
        if (axis === "row") {
          for (let col = source.firstCol; col <= source.lastCol; col += 1) {
            const column: string[] = [];
            for (let row = source.firstRow; row <= source.lastRow; row += 1) {
              column.push(gridCellValue(sheet, row, col));
            }
            planGridFill(column, downCount, { axis: "row" }).values.forEach(
              (value, offset) =>
                setGridCell(sheet, source.lastRow + 1 + offset, col, value),
            );
          }
          return;
        }
        for (let row = source.firstRow; row <= source.lastRow; row += 1) {
          const line: string[] = [];
          for (let col = source.firstCol; col <= source.lastCol; col += 1) {
            line.push(gridCellValue(sheet, row, col));
          }
          planGridFill(line, rightCount, { axis: "col" }).values.forEach(
            (value, offset) =>
              setGridCell(sheet, row, source.lastCol + 1 + offset, value),
          );
        }
      });
      setSelection({
        anchor: { row: source.firstRow, col: source.firstCol },
        focus: {
          row: axis === "row" ? source.lastRow + downCount : source.lastRow,
          col: axis === "col" ? source.lastCol + rightCount : source.lastCol,
        },
      });
      setHasSelectedCell(true);
    },
    [mutate, selection],
  );

  const autoFillDown = useCallback(() => {
    const sheet = sheetsRef.current.find(
      (entry) => entry.id === activeRef.current,
    );
    if (!sheet) return;
    const source = gridSelectionRange(selection);
    const length = gridFillDownLength(sheet.rows, source);
    // 0 = 两侧邻列都没数据。双击一个孤立格子不该凭空填出几千行。
    if (!length) return;
    fillFromSelection({ ...source, lastRow: source.lastRow + length });
  }, [fillFromSelection, selection]);

  /* ═══════════════════════ 行高与列宽 ═══════════════════════
   *
   * 尺寸不进 undo 栈：`commitSheets()` 的快照是 `GridSheet[]`，而尺寸按契约
   * 挂在工程档顶层（`GridSheet` 是 W12 的面，装不下）。它跟 `filterQuery`
   * / `headerRow` 同级，按同样的方式记脏。
   */

  const setRowHeight = useCallback((row: number, height: number) => {
    setRowHeightMap((current) => ({
      ...current,
      [activeRef.current]: {
        ...(current[activeRef.current] || {}),
        [row]: clampAxisSize(height, "row"),
      },
    }));
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, []);

  const setColumnWidth = useCallback((col: number, width: number) => {
    setColWidthMap((current) => ({
      ...current,
      [activeRef.current]: {
        ...(current[activeRef.current] || {}),
        [col]: clampAxisSize(width, "col"),
      },
    }));
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, []);

  const autoFitColumn = useCallback(
    (col: number) => {
      const sheet = sheetsRef.current.find(
        (entry) => entry.id === activeRef.current,
      );
      if (!sheet) return;
      // 量**显示值**而不是原文：用户看到的是 `¥1,200.00`，不是 `1200`。
      const values = Array.from({ length: gridRowCount(sheet) }, (_, row) =>
        gridDisplayValue(sheet, row, col),
      );
      setColumnWidth(col, measureGridAutoColumnWidth(values));
    },
    [setColumnWidth],
  );

  /* ═══════════════════════ 查找与替换 ═══════════════════════ */

  const findOptions = useMemo(
    () => ({
      query: findQuery,
      scope: findScope,
      caseSensitive: findCaseSensitive,
      wholeWord: findWholeWord,
    }),
    [findCaseSensitive, findQuery, findScope, findWholeWord],
  );

  const findMatches = useMemo(() => {
    if (!findOpen || !findQuery) return EMPTY_MATCHES;
    // 值模式按**显示值**找：用户看到「¥1,200.00」就该能搜到它，
    // 而不是只能搜到底下那个裸 1200。
    return findGridMatches(activeSheet.rows, findOptions, (row, col) =>
      gridDisplayValue(activeSheet, row, col),
    );
  }, [activeSheet, findOpen, findOptions, findQuery]);

  const updateFindQuery = useCallback((value: string) => {
    setFindQuery(value.slice(0, 500));
    setFindActiveIndex(0);
  }, []);

  const stepFindMatch = useCallback(
    (step: number) => {
      const total = findMatches.length;
      if (!total) return;
      const next = (((findActiveIndex + step) % total) + total) % total;
      const match = findMatches[next];
      setFindActiveIndex(next);
      setSelection({
        anchor: { row: match.row, col: match.col },
        focus: { row: match.row, col: match.col },
      });
      setHasSelectedCell(true);
    },
    [findActiveIndex, findMatches],
  );

  const replaceAll = useCallback((): {
    replaced: number;
    skippedFormulas: number;
  } => {
    const sheet = sheetsRef.current.find(
      (entry) => entry.id === activeRef.current,
    );
    if (!sheet || !findQuery) return { replaced: 0, skippedFormulas: 0 };
    const plan = planGridReplaceAll(
      sheet.rows,
      { ...findOptions, replacement: findReplacement },
      (row, col) => gridDisplayValue(sheet, row, col),
    );
    // 整份清单写在**一次** `mutate()` 里 ⇒ 撤一次回到替换前，不是撤两百次。
    if (plan.edits.length) {
      mutate((draft) => {
        const target = draft.find((entry) => entry.id === activeRef.current);
        if (!target) return;
        for (const edit of plan.edits) {
          setGridCell(target, edit.row, edit.col, edit.after);
        }
      });
    }
    setError(gridReplaceSummary(plan, tt));
    return {
      replaced: plan.edits.length,
      skippedFormulas: plan.skippedFormulas,
    };
  }, [findOptions, findQuery, findReplacement, mutate, tt]);

  void historyRevision;
  return {
    item,
    siteId,
    sheets,
    activeSheet,
    activeSheetId,
    selection,
    selectedCell: hasSelectedCell ? selection.focus : null,
    selectionRange: range,
    selectedValue,
    selectedDisplayValue,
    selectedFormat,
    visibleRowIndexes,
    filterQuery,
    headerRow,
    rowHeights: rowHeightMap[activeSheetId] ?? EMPTY_AXIS_SIZES,
    colWidths: colWidthMap[activeSheetId] ?? EMPTY_AXIS_SIZES,
    findOpen,
    findQuery,
    findReplacement,
    findScope,
    findCaseSensitive,
    findWholeWord,
    findMatches,
    findActiveIndex,
    loading,
    importing,
    exporting,
    saving,
    dirty,
    editRevision: revisionRef.current,
    error,
    sourceFailed,
    savedUrl,
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
    setActiveSheet,
    selectCell,
    setCell: setCellValue,
    beginCellGesture,
    endCellGesture,
    cancelCellGesture,
    setSelectedValue: (value) =>
      setCellValue(selection.focus.row, selection.focus.col, value),
    setFilterQuery: updateFilterQuery,
    setHeaderRow: updateHeaderRow,
    pasteClipboard,
    copySelection,
    clearSelection,
    fillFromSelection,
    autoFillDown,
    setRowHeight,
    setColumnWidth,
    autoFitColumn,
    setFindOpen,
    setFindQuery: updateFindQuery,
    setFindReplacement,
    setFindScope,
    setFindCaseSensitive,
    setFindWholeWord,
    stepFindMatch,
    replaceAll,
    applyFormat,
    insertRow,
    deleteRows,
    insertColumn,
    deleteColumns,
    addSheet,
    renameSheet,
    deleteSheet,
    sort,
    mergeSelection,
    splitSelection,
    addConditionalFormat,
    clearConditionalFormats,
    undo,
    redo,
    recalculate,
    recalcSummary,
    reload,
    importSource,
    exportCsv,
    exportXlsx,
    save,
    restoreRecovery,
  };
}
