"use client";

import { useRef, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { GridEditorState } from "./use-grid-editor";

const BUTTON =
  "rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg-2,#57534e)] transition hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] disabled:cursor-not-allowed disabled:opacity-35";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-b border-[var(--border,#e7e5e4)] pb-4 last:border-0">
      <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">{title}</p>
      {children}
    </section>
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
  return (
    <div className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4">
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
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("选中单元格后，格式、排序和行列操作会出现在表格上方。")}
        </p>
      </Section>

      <Section title={tt("工作表")}>
        <label className="block text-[10px] text-[var(--muted,#78716c)]">
          {tt("工作表名称")}
          <input
            key={editor.activeSheetId}
            defaultValue={editor.activeSheet.name}
            onBlur={(event) => editor.renameSheet(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="mt-1 w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)]"
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

      <Section title={tt("筛选")}>
        <input
          value={editor.filterQuery}
          onChange={(event) => editor.setFilterQuery(event.target.value)}
          placeholder={tt("筛选当前列")}
          aria-label={tt("筛选当前列")}
          className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)]"
        />
        <label className="flex items-center gap-2 text-[10px] text-[var(--muted,#78716c)]">
          <input
            type="checkbox"
            checked={editor.headerRow}
            onChange={(event) => editor.setHeaderRow(event.target.checked)}
            style={{ accentColor: accent }}
          />
          {tt("第一行为表头")}
        </label>
      </Section>

      <Section title={tt("公式")}>
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("公式支持单元格引用，以及 SUM / AVERAGE / MIN / MAX / COUNT。")}
        </p>
      </Section>
    </div>
  );
}
