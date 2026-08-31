"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  columnLabel,
  gridCellValue,
  gridColCount,
  gridDisplayFormat,
  gridDisplayValue,
  gridRowCount,
} from "./grid-model";
import {
  GRID_DEFAULT_COL_WIDTH,
  GRID_DEFAULT_ROW_HEIGHT,
  gridAxisSize,
  gridMergeAt,
  gridRowSpacer,
  gridRowWindowRange,
} from "./grid-structure";
import type { GridEditorState, GridSelectionRange } from "./use-grid-editor";

const WINDOW_ROWS = 72;

/** 一次尺寸拖拽：按下时记住指针位置与当时的尺寸，移动时按位移算新值。 */
interface AxisDrag {
  index: number;
  origin: number;
  size: number;
}

function SheetNameInput({
  name,
  label,
  accent,
  onCommit,
}: {
  name: string;
  label: string;
  accent: string;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    if (draft !== name) onCommit(draft);
    // The model owns normalization and duplicate-name rejection. Reset now;
    // the next model render supplies the accepted value.
    setDraft(name);
  };
  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(name);
        }
      }}
      role="tab"
      aria-selected
      aria-label={label}
      className="w-28 shrink-0 border-x border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 text-[10px] font-semibold outline-none"
      style={{ color: accent }}
    />
  );
}

function withinSelection(
  editor: GridEditorState,
  row: number,
  col: number,
): boolean {
  if (!editor.selectedCell) return false;
  const range = editor.selectionRange;
  return (
    row >= range.firstRow &&
    row <= range.lastRow &&
    col >= range.firstCol &&
    col <= range.lastCol
  );
}

/**
 * 剪贴板里只有一个纯文本值时把事件交回浏览器：用户是在单元格里插一段字，
 * 不是粘一片表。吃下它只会让「在格子里改半个词」这种最常见的操作变得别扭。
 */
function isSingleValuePaste(html: string, text: string): boolean {
  if (html && /<table/i.test(html)) return false;
  return !/[\t\r\n]/.test(text);
}

/** 光标正在某个输入框里选中了一段文字——复制/剪切该给浏览器，不该整格拿走。 */
function hasInlineTextSelection(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement)) return false;
  return active.selectionStart !== active.selectionEnd;
}

export function GridStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: GridEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(
    WINDOW_ROWS * GRID_DEFAULT_ROW_HEIGHT,
  );
  const [fillAnchor, setFillAnchor] = useState<GridSelectionRange | null>(null);
  const [fillFocus, setFillFocus] = useState<{ row: number; col: number } | null>(
    null,
  );
  const [rowDrag, setRowDrag] = useState<AxisDrag | null>(null);
  const [colDrag, setColDrag] = useState<AxisDrag | null>(null);

  const rows = editor.visibleRowIndexes;
  const rowHeights = editor.rowHeights;
  const colWidths = editor.colWidths;
  const selectionRange = editor.selectionRange;
  const hasContent = useMemo(
    () =>
      editor.sheets.some((sheet) =>
        sheet.rows.some((row) =>
          row.some((cell) => String(cell ?? "").trim().length > 0),
        ),
      ),
    [editor.sheets],
  );
  const columnCount = gridColCount(editor.activeSheet);
  const rowCount = gridRowCount(editor.activeSheet);

  // 行高可变之后 `floor(scrollTop / 34)` 不成立了，定位改走累计高度；
  // 没有任何自定义行高时这个函数内部仍然走那条除法快路。
  const windowRange = useMemo(
    () =>
      gridRowWindowRange(rows, {
        scrollTop,
        viewportHeight,
        sizes: rowHeights,
        defaultHeight: GRID_DEFAULT_ROW_HEIGHT,
        overscan: 8,
        maxWindow: WINDOW_ROWS,
      }),
    [rowHeights, rows, scrollTop, viewportHeight],
  );
  const rawStart = windowRange.start;
  const firstVisibleRow = rows[rawStart] ?? 0;
  const coveringMerge = editor.filterQuery
    ? undefined
    : editor.activeSheet.merges.find(
        (merge) =>
          merge.firstRow < firstVisibleRow && merge.lastRow >= firstVisibleRow,
      );
  const start = coveringMerge ? coveringMerge.firstRow : rawStart;
  const baseEnd = Math.min(
    rows.length,
    Math.max(start + WINDOW_ROWS, windowRange.end),
  );
  const extendedRow = editor.filterQuery
    ? baseEnd
    : editor.activeSheet.merges.reduce(
        (last, merge) =>
          merge.firstRow < baseEnd && merge.lastRow >= start
            ? Math.max(last, merge.lastRow + 1)
            : last,
        baseEnd,
      );
  const end = Math.min(rows.length, start + 500, extendedRow);
  const windowRows = useMemo(() => rows.slice(start, end), [end, rows, start]);
  // spacer 必须用**撑开之后**的 start/end 算：合并区会把窗口往两头推，
  // 先算 spacer 再推窗口，滚动条长度就错了。
  const spacer = useMemo(
    () =>
      gridRowSpacer(rows, {
        start,
        end,
        sizes: rowHeights,
        defaultHeight: GRID_DEFAULT_ROW_HEIGHT,
      }),
    [end, rowHeights, rows, start],
  );
  const selectedAddress = editor.selectedCell
    ? `${columnLabel(editor.selectedCell.col)}${editor.selectedCell.row + 1}`
    : "";
  const activeMatch = editor.findOpen
    ? editor.findMatches[editor.findActiveIndex]
    : undefined;
  const fillRange = useMemo<GridSelectionRange | null>(() => {
    if (!fillAnchor || !fillFocus) return null;
    return {
      firstRow: fillAnchor.firstRow,
      firstCol: fillAnchor.firstCol,
      lastRow: Math.max(fillAnchor.lastRow, fillFocus.row),
      lastCol: Math.max(fillAnchor.lastCol, fillFocus.col),
    };
  }, [fillAnchor, fillFocus]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) setViewportHeight(node.clientHeight);
  }, []);

  const { fillFromSelection, setColumnWidth, setRowHeight } = editor;

  useEffect(() => {
    if (!fillAnchor) return;
    // 松手才落数据：拖拽过程只画预览，中途松在哪儿就填到哪儿。
    const finish = () => {
      if (fillRange) fillFromSelection(fillRange);
      setFillAnchor(null);
      setFillFocus(null);
    };
    window.addEventListener("mouseup", finish);
    return () => window.removeEventListener("mouseup", finish);
  }, [fillAnchor, fillFromSelection, fillRange]);

  useEffect(() => {
    if (!colDrag) return;
    const move = (event: MouseEvent) =>
      setColumnWidth(colDrag.index, colDrag.size + (event.clientX - colDrag.origin));
    const up = () => setColDrag(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [colDrag, setColumnWidth]);

  useEffect(() => {
    if (!rowDrag) return;
    const move = (event: MouseEvent) =>
      setRowHeight(rowDrag.index, rowDrag.size + (event.clientY - rowDrag.origin));
    const up = () => setRowDrag(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [rowDrag, setRowHeight]);

  const selectRange = (
    anchor: { row: number; col: number },
    focus: { row: number; col: number },
  ) => {
    editor.selectCell(anchor);
    editor.selectCell(focus, true);
  };

  const focusCell = (row: number, col: number) => {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>(`[data-grid-cell="${row}:${col}"]`)
        ?.focus();
    });
  };

  const onCellKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    let nextRow = row;
    let nextCol = col;
    if (event.key === "ArrowUp") nextRow -= 1;
    else if (event.key === "ArrowDown" || event.key === "Enter") nextRow += 1;
    else if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0) {
      nextCol -= 1;
    } else if (
      event.key === "ArrowRight" &&
      event.currentTarget.selectionStart === event.currentTarget.value.length
    ) {
      nextCol += 1;
    } else if (event.key === "Tab") {
      nextCol += event.shiftKey ? -1 : 1;
    } else {
      return;
    }
    nextRow = Math.max(0, nextRow);
    nextCol = Math.max(0, Math.min(columnCount - 1, nextCol));
    if (nextRow === row && nextCol === col) return;
    event.preventDefault();
    editor.selectCell({ row: nextRow, col: nextCol }, event.shiftKey);
    focusCell(nextRow, nextCol);
  };

  return (
    <div
      role="region"
      aria-label={tt("表格编辑器")}
      aria-busy={editor.loading}
      className="flex h-full min-h-0 flex-col bg-[var(--card,#fff)]"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          editor.setFindOpen(true);
          return;
        }
        if (event.key === "Escape" && editor.findOpen) {
          event.preventDefault();
          editor.setFindOpen(false);
        }
      }}
    >
      {editor.selectedCell && (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border,#e7e5e4)] px-3">
          <span className="w-14 shrink-0 text-center text-[11px] font-medium text-[var(--muted,#78716c)]">
            {selectedAddress}
          </span>
          <span className="text-[12px] font-semibold text-[var(--muted,#78716c)]">fx</span>
          <input
            value={editor.selectedValue}
            onChange={(event) => editor.setSelectedValue(event.target.value)}
            onFocus={editor.beginCellGesture}
            onBlur={editor.endCellGesture}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                editor.cancelCellGesture();
                event.currentTarget.blur();
              }
            }}
            aria-label={tt("公式栏")}
            placeholder={tt("输入内容或以 = 开头的公式")}
            className="min-w-0 flex-1 bg-transparent px-1 font-mono text-[11px] text-[var(--fg,#292524)] outline-none"
          />
          {editor.selectedValue.startsWith("=") && (
            <span
              role={
                editor.selectedDisplayValue.startsWith("#")
                  ? "alert"
                  : "status"
              }
              className={`max-w-48 truncate text-[10px] ${
                editor.selectedDisplayValue.startsWith("#")
                  ? "text-[var(--awb-danger)]"
                  : "text-[var(--muted,#78716c)]"
              }`}
            >
              {editor.selectedDisplayValue}
            </span>
          )}
        </div>
      )}

      {editor.findOpen && (
        <div
          role="search"
          aria-label={tt("查找和替换")}
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)] px-3 py-1.5"
        >
          <input
            autoFocus
            value={editor.findQuery}
            onChange={(event) => editor.setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              editor.stepFindMatch(event.shiftKey ? -1 : 1);
            }}
            aria-label={tt("查找内容")}
            placeholder={tt("查找")}
            className="h-7 w-36 min-w-0 rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[11px] text-[var(--fg,#292524)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          />
          <input
            value={editor.findReplacement}
            onChange={(event) => editor.setFindReplacement(event.target.value)}
            aria-label={tt("替换为")}
            placeholder={tt("替换为")}
            className="h-7 w-36 min-w-0 rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[11px] text-[var(--fg,#292524)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          />
          <span
            role="status"
            aria-live="polite"
            className="min-w-14 text-center text-[10px] tabular-nums text-[var(--muted,#78716c)]"
          >
            {editor.findMatches.length
              ? `${editor.findActiveIndex + 1} / ${editor.findMatches.length}`
              : editor.findQuery
                ? tt("无结果")
                : ""}
          </span>
          <button
            type="button"
            onClick={() => editor.stepFindMatch(-1)}
            disabled={!editor.findMatches.length}
            aria-label={tt("上一个匹配")}
            className="min-h-7 rounded-md border border-[var(--border,#e7e5e4)] px-2 text-[11px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => editor.stepFindMatch(1)}
            disabled={!editor.findMatches.length}
            aria-label={tt("下一个匹配")}
            className="min-h-7 rounded-md border border-[var(--border,#e7e5e4)] px-2 text-[11px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            ↓
          </button>
          <div
            role="radiogroup"
            aria-label={tt("查找范围")}
            className="flex items-center overflow-hidden rounded-md border border-[var(--border,#e7e5e4)]"
          >
            {(["value", "formula"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                role="radio"
                aria-checked={editor.findScope === scope}
                onClick={() => editor.setFindScope(scope)}
                className="min-h-7 px-2 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
                style={
                  editor.findScope === scope
                    ? { background: `${accent}1a`, color: accent }
                    : undefined
                }
              >
                {scope === "value" ? tt("在值里找") : tt("在公式里找")}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-[10px] text-[var(--muted,#78716c)]">
            <input
              type="checkbox"
              checked={editor.findCaseSensitive}
              onChange={(event) =>
                editor.setFindCaseSensitive(event.target.checked)
              }
            />
            {tt("区分大小写")}
          </label>
          <label className="flex items-center gap-1 text-[10px] text-[var(--muted,#78716c)]">
            <input
              type="checkbox"
              checked={editor.findWholeWord}
              onChange={(event) => editor.setFindWholeWord(event.target.checked)}
            />
            {tt("全字匹配")}
          </label>
          <button
            type="button"
            onClick={() => editor.replaceAll()}
            disabled={!editor.findMatches.length}
            className="min-h-7 rounded-md border border-[var(--border,#e7e5e4)] px-2 text-[11px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            {tt("全部替换")}
          </button>
          <button
            type="button"
            onClick={() => editor.setFindOpen(false)}
            aria-label={tt("关闭查找")}
            className="ml-auto min-h-7 w-7 rounded-md text-[13px] text-[var(--muted,#78716c)] hover:bg-[var(--surface-hover,#fafaf9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            ×
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto bg-[var(--card,#fff)]"
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
          setViewportHeight(event.currentTarget.clientHeight);
        }}
        onCopy={(event) => {
          if (!editor.selectedCell || hasInlineTextSelection()) return;
          const payload = editor.copySelection();
          event.clipboardData.setData("text/plain", payload.text);
          event.clipboardData.setData("text/html", payload.html);
          event.preventDefault();
        }}
        onCut={(event) => {
          if (!editor.selectedCell || hasInlineTextSelection()) return;
          const payload = editor.copySelection();
          event.clipboardData.setData("text/plain", payload.text);
          event.clipboardData.setData("text/html", payload.html);
          event.preventDefault();
          editor.clearSelection();
        }}
        onPaste={(event) => {
          if (!editor.selectedCell) return;
          const html = event.clipboardData.getData("text/html");
          const text = event.clipboardData.getData("text/plain");
          if (isSingleValuePaste(html, text)) return;
          if (editor.pasteClipboard({ html, text })) event.preventDefault();
        }}
      >
        {editor.loading && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-40 grid place-items-center bg-[var(--card,#fff)]/90 text-[12px] text-[var(--muted,#78716c)]"
          >
            {tt("正在读取工作簿…")}
          </div>
        )}
        {!editor.loading && editor.sourceFailed && (
          <div
            role="alert"
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[var(--card,#fff)]/95 px-6 text-center"
          >
            <p className="max-w-md text-[12px] leading-relaxed text-[var(--fg-2,#57534e)]">
              {tt(editor.error)}
            </p>
            <button
              type="button"
              onClick={editor.reload}
              className="min-h-9 rounded-lg border border-[var(--border,#e7e5e4)] px-3 text-[12px] font-medium text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {tt("重新载入")}
            </button>
          </div>
        )}
        {!editor.loading && !editor.sourceFailed && editor.error && (
          <div
            role="alert"
            className="sticky left-1/2 top-3 z-40 w-fit max-w-[calc(100%_-_2rem)] -translate-x-1/2 rounded-lg border border-[color-mix(in_srgb,var(--awb-danger)_35%,transparent)] bg-[var(--awb-danger-soft)] px-3 py-2 text-[11px] text-[var(--awb-danger)] shadow-sm"
          >
            {tt(editor.error)}
          </div>
        )}
        {!editor.loading && !editor.error && !hasContent && (
          <p
            role="status"
            className="pointer-events-none absolute left-16 top-11 z-20 rounded-md bg-[var(--card,#fff)]/90 px-2 py-1 text-[11px] text-[var(--muted,#78716c)]"
          >
            {tt("空白工作簿，选择单元格开始输入")}
          </p>
        )}
        <table
          aria-label={tt("工作簿网格")}
          className="table-fixed border-separate border-spacing-0 text-[11px]"
        >
          <thead className="sticky top-0 z-30">
            <tr>
              <th className="sticky left-0 z-40 h-8 w-12 min-w-12 border-b border-r border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)]">
                <button
                  type="button"
                  aria-label={tt("选择整张工作表")}
                  onClick={() =>
                    selectRange(
                      { row: 0, col: 0 },
                      {
                        row: Math.max(0, rowCount - 1),
                        col: Math.max(0, columnCount - 1),
                      },
                    )
                  }
                  className="h-full w-full text-[9px] text-[var(--muted,#78716c)] hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
                >
                  ◢
                </button>
              </th>
              {Array.from({ length: columnCount }, (_, col) => {
                const width = gridAxisSize(
                  colWidths,
                  col,
                  GRID_DEFAULT_COL_WIDTH,
                );
                return (
                  <th
                    key={col}
                    style={{ width, minWidth: width }}
                    className="relative h-8 border-b border-r border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)] px-2 font-medium text-[var(--muted,#78716c)]"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectRange(
                        { row: 0, col },
                        { row: Math.max(0, rowCount - 1), col },
                      );
                    }}
                  >
                    {columnLabel(col)}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`${tt("调整列宽")} ${columnLabel(col)}`}
                      title={tt("拖动改列宽，双击按内容自适应")}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setColDrag({
                          index: col,
                          origin: event.clientX,
                          size: width,
                        });
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        editor.autoFitColumn(col);
                      }}
                      className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize hover:bg-[var(--muted,#78716c)]"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {start > 0 && (
              <tr aria-hidden>
                <td
                  colSpan={columnCount + 1}
                  style={{ height: spacer.leadingHeight }}
                />
              </tr>
            )}
            {windowRows.map((row) => {
              const height = gridAxisSize(
                rowHeights,
                row,
                GRID_DEFAULT_ROW_HEIGHT,
              );
              return (
                <tr key={row} style={{ height }}>
                  <th
                    style={{ height }}
                    className="sticky left-0 z-20 w-12 min-w-12 border-b border-r border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)] px-2 text-right font-medium text-[var(--muted,#78716c)]"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectRange(
                        { row, col: 0 },
                        { row, col: Math.max(0, columnCount - 1) },
                      );
                    }}
                  >
                    {row + 1}
                    <span
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label={`${tt("调整行高")} ${row + 1}`}
                      title={tt("拖动改行高")}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setRowDrag({
                          index: row,
                          origin: event.clientY,
                          size: height,
                        });
                      }}
                      className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize hover:bg-[var(--muted,#78716c)]"
                    />
                  </th>
                  {Array.from({ length: columnCount }, (_, col) => {
                    const merge = editor.filterQuery
                      ? undefined
                      : gridMergeAt(editor.activeSheet.merges, row, col);
                    if (
                      merge &&
                      (merge.firstRow !== row || merge.firstCol !== col)
                    ) {
                      return null;
                    }
                    const focused =
                      Boolean(editor.selectedCell) &&
                      editor.selection.focus.row === row &&
                      editor.selection.focus.col === col;
                    const selected = withinSelection(editor, row, col);
                    const raw = gridCellValue(editor.activeSheet, row, col);
                    const displayValue = gridDisplayValue(
                      editor.activeSheet,
                      row,
                      col,
                    );
                    const value = focused
                      ? raw
                      : displayValue;
                    const formulaError =
                      raw.startsWith("=") && displayValue.startsWith("#");
                    const format = gridDisplayFormat(editor.activeSheet, row, col);
                    const width = gridAxisSize(
                      colWidths,
                      col,
                      GRID_DEFAULT_COL_WIDTH,
                    );
                    const isActiveMatch =
                      activeMatch?.row === row && activeMatch?.col === col;
                    const inFillPreview =
                      fillRange !== null &&
                      row >= fillRange.firstRow &&
                      row <= fillRange.lastRow &&
                      col >= fillRange.firstCol &&
                      col <= fillRange.lastCol;
                    const isFillOrigin =
                      Boolean(editor.selectedCell) &&
                      row === selectionRange.lastRow &&
                      col === selectionRange.lastCol;
                    return (
                      <td
                        key={col}
                        rowSpan={
                          merge ? merge.lastRow - merge.firstRow + 1 : undefined
                        }
                        colSpan={
                          merge ? merge.lastCol - merge.firstCol + 1 : undefined
                        }
                        className="relative border-b border-r border-[var(--border,#e7e5e4)] p-0"
                        style={{
                          width,
                          minWidth: width,
                          ...(merge ? {} : { height }),
                          background: selected
                            ? `${accent}0d`
                            : format.background || "#ffffff",
                          outline: isActiveMatch
                            ? `2px solid ${accent}`
                            : inFillPreview
                              ? `1px dashed ${accent}`
                              : undefined,
                          outlineOffset: isActiveMatch
                            ? -2
                            : inFillPreview
                              ? -1
                              : undefined,
                        }}
                        onMouseEnter={(event) => {
                          if (fillAnchor) {
                            setFillFocus({ row, col });
                            return;
                          }
                          if (event.buttons === 1) {
                            editor.selectCell({ row, col }, true);
                          }
                        }}
                      >
                        <input
                          data-grid-cell={`${row}:${col}`}
                          value={value}
                          aria-invalid={formulaError}
                          aria-label={`${columnLabel(col)}${row + 1}`}
                          title={
                            raw.startsWith("=")
                              ? `${raw} → ${displayValue}`
                              : value
                          }
                          onFocus={() => {
                            editor.selectCell({ row, col });
                            editor.beginCellGesture();
                          }}
                          onBlur={editor.endCellGesture}
                          onMouseDown={(event) =>
                            editor.selectCell({ row, col }, event.shiftKey)
                          }
                          onChange={(event) =>
                            editor.setCell(row, col, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              editor.cancelCellGesture();
                              event.currentTarget.blur();
                              return;
                            }
                            onCellKeyDown(event, row, col);
                          }}
                          className="h-full w-full bg-transparent px-2 outline-none"
                          style={{
                            color:
                              formulaError
                                ? "#dc2626"
                                : format.color || "#44403c",
                            fontWeight: format.bold ? 650 : 400,
                            textAlign: format.align || "left",
                            boxShadow: focused
                              ? `inset 0 0 0 2px ${accent}`
                              : undefined,
                          }}
                        />
                        {isFillOrigin && (
                          <span
                            role="button"
                            tabIndex={-1}
                            aria-label={tt("填充柄")}
                            title={tt("拖动填充，双击沿相邻列向下填满")}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setFillAnchor(selectionRange);
                              setFillFocus({ row, col });
                            }}
                            onDoubleClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setFillAnchor(null);
                              setFillFocus(null);
                              editor.autoFillDown();
                            }}
                            className="absolute -bottom-0.5 -right-0.5 z-20 h-2 w-2 cursor-crosshair rounded-[1px] border border-[var(--card,#fff)]"
                            style={{ background: accent }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {end < rows.length && (
              <tr aria-hidden>
                <td
                  colSpan={columnCount + 1}
                  style={{ height: spacer.trailingHeight }}
                />
              </tr>
            )}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="grid h-full place-items-center text-[12px] text-[var(--muted,#78716c)]">
            {tt("没有符合筛选条件的行")}
          </div>
        )}
      </div>
      <div
        role="tablist"
        aria-label={tt("工作表")}
        className="flex h-9 shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)] px-2"
      >
        {editor.sheets.map((sheet) =>
          sheet.id === editor.activeSheetId ? (
            <SheetNameInput
              key={sheet.id}
              name={sheet.name}
              label={tt("工作表名称")}
              accent={accent}
              onCommit={editor.renameSheet}
            />
          ) : (
            <button
              key={sheet.id}
              type="button"
              role="tab"
              aria-selected={false}
              onClick={() => editor.setActiveSheet(sheet.id)}
              className="shrink-0 px-3 text-[10px] text-[var(--muted,#78716c)] hover:bg-[var(--card,#fff)]"
            >
              {sheet.name}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={editor.addSheet}
          aria-label={tt("新增工作表")}
          className="w-8 shrink-0 text-sm text-[var(--muted,#78716c)] hover:bg-[var(--card,#fff)]"
        >
          +
        </button>
        <button
          type="button"
          onClick={editor.deleteSheet}
          disabled={editor.sheets.length <= 1}
          aria-label={tt("删除工作表")}
          className="w-8 shrink-0 text-sm text-[var(--muted,#78716c)] hover:bg-[var(--awb-danger-soft)] hover:text-[var(--awb-danger)] disabled:opacity-30"
        >
          ×
        </button>
      </div>
    </div>
  );
}
