"use client";

import { useRef, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { columnLabel, type GridCellType } from "./grid-model";
import type { GridEditorState } from "./use-grid-editor";

const BUTTON =
  "rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-b border-stone-100 pb-3 last:border-0">
      <p className="text-[11px] font-semibold text-stone-800">{title}</p>
      {children}
    </section>
  );
}

function FormatButton({
  active,
  accent,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  accent: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={BUTTON}
      style={
        active
          ? {
              borderColor: accent,
              color: accent,
              background: `${accent}10`,
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}

export function GridControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: GridEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const range = editor.selectionRange;
  const address =
    range.firstRow === range.lastRow && range.firstCol === range.lastCol
      ? `${columnLabel(range.firstCol)}${range.firstRow + 1}`
      : `${columnLabel(range.firstCol)}${range.firstRow + 1}:${columnLabel(
          range.lastCol,
        )}${range.lastRow + 1}`;
  const type = editor.selectedFormat.type || "auto";
  const align = editor.selectedFormat.align || "left";

  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <Section title={tt("工作簿来源")}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void editor.importSource(file);
          }}
        />
        <button
          type="button"
          className={`${BUTTON} w-full py-2`}
          disabled={editor.importing}
          onClick={() => fileRef.current?.click()}
        >
          {editor.importing ? tt("导入中…") : tt("导入 CSV / XLSX")}
        </button>
        <p className="text-[10px] leading-relaxed text-stone-400">
          {tt("导入会创建可撤销的编辑状态，不会覆盖原素材。")}
        </p>
      </Section>

      <Section title={tt("工作表")}>
        <label className="block text-[10px] text-stone-400">
          {tt("工作表名称")}
          <input
            key={editor.activeSheetId}
            defaultValue={editor.activeSheet.name}
            onBlur={(event) => editor.renameSheet(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] text-stone-700 outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className={BUTTON} onClick={editor.addSheet}>
            {tt("新增工作表")}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={editor.sheets.length <= 1}
            onClick={editor.deleteSheet}
          >
            {tt("删除工作表")}
          </button>
        </div>
      </Section>

      <Section title={`${tt("选区")} · ${address}`}>
        <select
          aria-label={tt("数据类型")}
          value={type}
          onChange={(event) =>
            editor.applyFormat({ type: event.target.value as GridCellType })
          }
          className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] text-stone-700 outline-none"
        >
          <option value="auto">{tt("自动")}</option>
          <option value="text">{tt("文本")}</option>
          <option value="number">{tt("数字")}</option>
          <option value="currency">{tt("人民币")}</option>
          <option value="percent">{tt("百分比")}</option>
          <option value="date">{tt("日期")}</option>
        </select>
        {["number", "currency", "percent"].includes(type) && (
          <label className="flex items-center justify-between gap-2 text-[10px] text-stone-500">
            {tt("小数位")}
            <input
              type="number"
              min={0}
              max={8}
              value={editor.selectedFormat.decimals ?? 2}
              onChange={(event) =>
                editor.applyFormat({
                  decimals: Math.max(0, Math.min(8, Number(event.target.value))),
                })
              }
              className="w-16 rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] outline-none"
            />
          </label>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          <FormatButton
            active={editor.selectedFormat.bold}
            accent={accent}
            onClick={() =>
              editor.applyFormat({ bold: !editor.selectedFormat.bold })
            }
          >
            <span className="font-bold">B</span>
          </FormatButton>
          {(["left", "center", "right"] as const).map((value) => (
            <FormatButton
              key={value}
              active={align === value}
              accent={accent}
              onClick={() => editor.applyFormat({ align: value })}
            >
              {value === "left" ? "≡←" : value === "center" ? "≡" : "→≡"}
            </FormatButton>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1 text-[10px] text-stone-500">
            {tt("文字")}
            <input
              type="color"
              value={editor.selectedFormat.color || "#292524"}
              onChange={(event) =>
                editor.applyFormat({ color: event.target.value })
              }
              className="h-6 min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1 text-[10px] text-stone-500">
            {tt("底色")}
            <input
              type="color"
              value={editor.selectedFormat.background || "#ffffff"}
              onChange={(event) =>
                editor.applyFormat({ background: event.target.value })
              }
              className="h-6 min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
        </div>
      </Section>

      <Section title={tt("行与列")}>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={BUTTON}
            onClick={() => editor.insertRow("before")}
          >
            {tt("上方插入行")}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => editor.insertRow("after")}
          >
            {tt("下方插入行")}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={editor.deleteRows}
          >
            {tt("删除所选行")}
          </button>
          <span />
          <button
            type="button"
            className={BUTTON}
            onClick={() => editor.insertColumn("before")}
          >
            {tt("左侧插入列")}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => editor.insertColumn("after")}
          >
            {tt("右侧插入列")}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={editor.deleteColumns}
          >
            {tt("删除所选列")}
          </button>
        </div>
      </Section>

      <Section title={tt("排序与筛选")}>
        <input
          value={editor.filterQuery}
          onChange={(event) => editor.setFilterQuery(event.target.value)}
          placeholder={tt("筛选当前列")}
          aria-label={tt("筛选当前列")}
          className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] outline-none"
        />
        <label className="flex items-center gap-2 text-[10px] text-stone-500">
          <input
            type="checkbox"
            checked={editor.headerRow}
            onChange={(event) => editor.setHeaderRow(event.target.checked)}
            style={{ accentColor: accent }}
          />
          {tt("第一行为表头（排序时保留）")}
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={BUTTON}
            onClick={() => editor.sort("asc")}
          >
            {tt("升序")}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => editor.sort("desc")}
          >
            {tt("降序")}
          </button>
        </div>
      </Section>

      <Section title={tt("历史")}>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={BUTTON}
            disabled={!editor.canUndo}
            onClick={editor.undo}
          >
            {tt("撤销")}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!editor.canRedo}
            onClick={editor.redo}
          >
            {tt("重做")}
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-stone-400">
          {tt("公式支持 + − × ÷、括号、单元格引用，以及 SUM / AVERAGE / MIN / MAX / COUNT。")}
        </p>
      </Section>
    </div>
  );
}
