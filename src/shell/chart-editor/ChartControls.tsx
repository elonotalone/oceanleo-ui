"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { ChartWorkbenchState } from "./use-chart-workbench";

function csvFromTable(table: ChartWorkbenchState["table"]): string {
  return table
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

export function ChartControls({
  editor,
}: {
  editor: ChartWorkbenchState;
}) {
  const tt = useUI();
  const [csv, setCsv] = useState(() => csvFromTable(editor.table));
  useEffect(() => setCsv(csvFromTable(editor.table)), [editor.table]);
  return (
    <fieldset
      disabled={editor.loading || editor.saving}
      className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4 text-[11px] text-[var(--fg-2,#57534e)] disabled:opacity-60"
    >
      <section className="space-y-2">
        <p className="font-semibold text-[var(--fg,#292524)]">{tt("图表数据")}</p>
        <textarea
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          aria-label={tt("图表 CSV 数据")}
          className="h-56 w-full resize-y rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2.5 font-mono text-[10px] leading-relaxed text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="cursor-pointer rounded-xl border border-[var(--border,#e7e5e4)] px-2.5 py-2 text-center hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]">
            {tt("导入 CSV")}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  setCsv(text);
                  editor.importCsv(text);
                });
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => editor.importCsv(csv)}
            className="rounded-xl border border-[var(--border,#e7e5e4)] px-2.5 py-2 hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
          >
            {tt("应用数据")}
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("点击图表后，标题、坐标轴、系列类型和颜色会出现在图表上方。")}
        </p>
      </section>
      {(editor.error || editor.notice) && (
        <p
          role={editor.error ? "alert" : "status"}
          className={editor.error ? "text-rose-600" : "text-emerald-600"}
        >
          {editor.error || editor.notice}
        </p>
      )}
    </fieldset>
  );
}
