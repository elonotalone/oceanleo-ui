"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  columnLabel,
  gridCellFormat,
  gridCellValue,
  gridColCount,
  gridDisplayValue,
} from "./grid-model";
import type { GridEditorState } from "./use-grid-editor";

const ROW_HEIGHT = 34;
const WINDOW_ROWS = 72;

function withinSelection(
  editor: GridEditorState,
  row: number,
  col: number,
): boolean {
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
  const columnCount = gridColCount(editor.activeSheet);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 8);
  const end = Math.min(rows.length, start + WINDOW_ROWS);
  const windowRows = useMemo(() => rows.slice(start, end), [end, rows, start]);
  const selectedAddress = `${columnLabel(editor.selection.focus.col)}${
    editor.selection.focus.row + 1
  }`;

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
    <div className="flex h-full min-h-0 flex-col bg-[var(--card,#fff)]">
      <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)] px-3 py-2">
        <select
          value={editor.activeSheetId}
          onChange={(event) => editor.setActiveSheet(event.target.value)}
          aria-label={tt("工作表")}
          className="h-8 w-32 shrink-0 rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[10px] font-medium text-[var(--fg,#292524)] outline-none"
        >
          {editor.sheets.map((sheet) => (
            <option key={sheet.id} value={sheet.id}>
              {sheet.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={editor.addSheet}
          aria-label={tt("新增工作表")}
          title={tt("新增工作表")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-sm text-[var(--fg-2,#57534e)]"
        >
          +
        </button>
        <button
          type="button"
          onClick={editor.deleteSheet}
          disabled={editor.sheets.length <= 1}
          aria-label={tt("删除工作表")}
          title={tt("删除工作表")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-sm text-[var(--fg-2,#57534e)] disabled:opacity-30"
        >
          ×
        </button>
        <input
          key={editor.activeSheetId}
          defaultValue={editor.activeSheet.name}
          onBlur={(event) => editor.renameSheet(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label={tt("工作表名称")}
          className="h-8 w-28 shrink-0 rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[10px] text-[var(--fg,#292524)] outline-none"
        />
        <label className="flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] text-[var(--muted,#78716c)]">
          <input
            type="checkbox"
            checked={editor.headerRow}
            onChange={(event) => editor.setHeaderRow(event.target.checked)}
            style={{ accentColor: accent }}
          />
          {tt("表头")}
        </label>
        <input
          value={editor.filterQuery}
          onChange={(event) => editor.setFilterQuery(event.target.value)}
          placeholder={tt("筛选当前列")}
          aria-label={tt("筛选当前列")}
          className="h-8 w-32 shrink-0 rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[10px] text-[var(--fg,#292524)] outline-none"
        />
        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border,#e7e5e4)]" />
        <span className="w-16 shrink-0 rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1.5 text-center text-[11px] font-medium text-[var(--muted,#78716c)]">
          {selectedAddress}
        </span>
        <span className="text-[13px] font-semibold text-[var(--muted,#78716c)]">fx</span>
        <input
          value={editor.selectedValue}
          onChange={(event) => editor.setSelectedValue(event.target.value)}
          aria-label={tt("公式栏")}
          placeholder={tt("输入内容或以 = 开头的公式")}
          className="min-w-0 flex-1 rounded-md border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)]"
        />
        {editor.selectedValue.startsWith("=") && (
          <span
            className="max-w-48 truncate text-[10px] text-[var(--muted,#78716c)]"
            title={editor.selectedDisplayValue}
          >
            {tt("结果")}：{editor.selectedDisplayValue}
          </span>
        )}
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-auto bg-[var(--card,#fff)]"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {editor.loading && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-[var(--card,#fff)]/90 text-[12px] text-[var(--muted,#78716c)]">
            {tt("正在读取工作簿…")}
          </div>
        )}
        <table className="border-separate border-spacing-0 text-[11px]">
          <thead className="sticky top-0 z-30">
            <tr>
              <th className="sticky left-0 z-40 h-8 w-12 min-w-12 border-b border-r border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)]" />
              {Array.from({ length: columnCount }, (_, col) => (
                <th
                  key={col}
                  className="h-8 min-w-28 border-b border-r border-[var(--border,#e7e5e4)] bg-[var(--surface,#f5f5f4)] px-2 font-medium text-[var(--muted,#78716c)]"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    editor.selectCell({ row: editor.selection.focus.row, col });
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
                    editor.selectCell({ row, col: editor.selection.focus.col });
                  }}
                >
                  {row + 1}
                </th>
                {Array.from({ length: columnCount }, (_, col) => {
                  const focused =
                    editor.selection.focus.row === row &&
                    editor.selection.focus.col === col;
                  const selected = withinSelection(editor, row, col);
                  const raw = gridCellValue(editor.activeSheet, row, col);
                  const value = focused
                    ? raw
                    : gridDisplayValue(editor.activeSheet, row, col);
                  const format = gridCellFormat(editor.activeSheet, row, col);
                  return (
                    <td
                      key={col}
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
                        title={raw.startsWith("=") ? `${raw} → ${value}` : value}
                        onFocus={() => editor.selectCell({ row, col })}
                        onMouseDown={(event) =>
                          editor.selectCell({ row, col }, event.shiftKey)
                        }
                        onChange={(event) =>
                          editor.setCell(row, col, event.target.value)
                        }
                        onKeyDown={(event) =>
                          onCellKeyDown(event, row, col)
                        }
                        className="h-full w-full min-w-28 bg-transparent px-2 outline-none"
                        style={{
                          color:
                            value.startsWith("#") && raw.startsWith("=")
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
    </div>
  );
}
