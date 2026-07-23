"use client";

import {
  useEffect,
  useMemo,
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
import { gridMergeAt } from "./grid-structure";
import type { GridEditorState } from "./use-grid-editor";

const ROW_HEIGHT = 34;
const WINDOW_ROWS = 72;

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

export function GridStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: GridEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const [scrollTop, setScrollTop] = useState(0);
  const rows = editor.visibleRowIndexes;
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
  const rawStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 8);
  const firstVisibleRow = rows[rawStart] ?? 0;
  const coveringMerge = editor.filterQuery
    ? undefined
    : editor.activeSheet.merges.find(
        (merge) =>
          merge.firstRow < firstVisibleRow && merge.lastRow >= firstVisibleRow,
      );
  const start = coveringMerge ? coveringMerge.firstRow : rawStart;
  const baseEnd = Math.min(rows.length, start + WINDOW_ROWS);
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
  const selectedAddress = editor.selectedCell
    ? `${columnLabel(editor.selectedCell.col)}${editor.selectedCell.row + 1}`
    : "";
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
                  ? "text-red-600"
                  : "text-[var(--muted,#78716c)]"
              }`}
            >
              {editor.selectedDisplayValue}
            </span>
          )}
        </div>
      )}

      <div
        className="relative min-h-0 flex-1 overflow-auto bg-[var(--card,#fff)]"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
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
        {!editor.loading && editor.error && (
          <div
            role="alert"
            className="sticky left-1/2 top-3 z-40 w-fit max-w-[calc(100%_-_2rem)] -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 shadow-sm"
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
          className="border-separate border-spacing-0 text-[11px]"
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
              {Array.from({ length: columnCount }, (_, col) => (
                <th
                  key={col}
                  className="h-8 min-w-28 border-b border-r border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)] px-2 font-medium text-[var(--muted,#78716c)]"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectRange(
                      { row: 0, col },
                      { row: Math.max(0, rowCount - 1), col },
                    );
                  }}
                >
                  {columnLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {start > 0 && (
              <tr aria-hidden>
                <td
                  colSpan={columnCount + 1}
                  style={{ height: start * ROW_HEIGHT }}
                />
              </tr>
            )}
            {windowRows.map((row) => (
              <tr key={row} style={{ height: ROW_HEIGHT }}>
                <th
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
                  return (
                    <td
                      key={col}
                      rowSpan={
                        merge ? merge.lastRow - merge.firstRow + 1 : undefined
                      }
                      colSpan={
                        merge ? merge.lastCol - merge.firstCol + 1 : undefined
                      }
                      className="relative h-[34px] min-w-28 border-b border-r border-[var(--border,#e7e5e4)] p-0"
                      style={
                        selected
                          ? { background: `${accent}0d` }
                          : { background: format.background || "#ffffff" }
                      }
                      onMouseEnter={(event) => {
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
                        className="h-full w-full min-w-28 bg-transparent px-2 outline-none"
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
                    </td>
                  );
                })}
              </tr>
            ))}
            {end < rows.length && (
              <tr aria-hidden>
                <td
                  colSpan={columnCount + 1}
                  style={{ height: (rows.length - end) * ROW_HEIGHT }}
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
          className="w-8 shrink-0 text-sm text-[var(--muted,#78716c)] hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        >
          ×
        </button>
      </div>
    </div>
  );
}
