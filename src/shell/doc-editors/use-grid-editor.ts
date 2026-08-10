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
import {
  buildGridWorkbookBlob,
  cloneGridSheets,
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
  sanitizeSheetName,
  setGridCell,
  type GridCell,
  type GridCellFormat,
  type GridSheet,
} from "./grid-model";
import { resolveGridActiveSheetId } from "./grid-sheet-identity";
import { notifyOfficeAccessDenied } from "./office-file";
import {
  mergeGridRange,
  rangesIntersect,
  splitGridRange,
  transformGridRanges,
  type GridConditionalFormat,
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
  /** Re-run the source load for the same item after a failure. */
  reload: () => void;
  importSource: (file: File) => Promise<void>;
  exportCsv: () => void;
  exportXlsx: () => Promise<void>;
  save: () => Promise<GridSavedVersion | null>;
  restoreRecovery: (payload: unknown) => boolean;
}

/**
 * 一次真表格素材保存的回执。`saveTarget` 的宽类型暂由任务边界外的
 * `GridRoute.tsx` 消费；本 hook 只会返回 `material`。
 */
export interface GridSavedVersion extends PersistedEditorVersion {
  saveTarget: "material" | "plugin-instance";
}

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
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sourceFailed, setSourceFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [savedUrl, setSavedUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const sheetsRef = useRef(sheets);
  const activeRef = useRef(activeSheetId);
  const undoRef = useRef<GridSnapshot[]>([]);
  const redoRef = useRef<GridSnapshot[]>([]);
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
  const translate = useCallback(
    (value: string) => translateRef.current(value),
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
          );
          return {
            ...normalized,
            headerRow: project.headerRow !== false,
            filterQuery: String(project.filterQuery || "").slice(0, 500),
            filterColumn: Math.max(0, Number(project.filterColumn) || 0),
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
        applySnapshot({ sheets: next, activeSheetId: nextActive });
        setSelection({
          anchor: { row: 0, col: 0 },
          focus: { row: 0, col: 0 },
        });
        setHasSelectedCell(false);
        setFilterQuery(loaded.filterQuery);
        setFilterColumn(loaded.filterColumn);
        setHeaderRow(loaded.headerRow);
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
        saveTarget: "material",
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
  }, [baseTitle, filterColumn, filterQuery, headerRow, siteId, tt]);

  const restoreRecovery = useCallback(
    (payload: unknown): boolean => {
      if (!payload || typeof payload !== "object") return false;
      const project = payload as GridProject;
      const normalized = normalizeGridProjectSheetState(
        project.sheets,
        project.activeSheetId,
      );
      if (!normalized.sheets.length) return false;
      undoRef.current = [];
      redoRef.current = [];
      setSourceFailed(false);
      setError("");
      applySnapshot(normalized);
      setHeaderRow(project.headerRow !== false);
      setFilterQuery(String(project.filterQuery || "").slice(0, 500));
      setFilterColumn(Math.max(0, Number(project.filterColumn) || 0));
      setHasSelectedCell(false);
      revisionRef.current += 1;
      setDirty(true);
      setSavedUrl("");
      return true;
    },
    [applySnapshot],
  );

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
    reload,
    importSource,
    exportCsv,
    exportXlsx,
    save,
    restoreRecovery,
  };
}
