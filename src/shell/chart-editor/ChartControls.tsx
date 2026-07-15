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
  accent = "#4f46e5",
}: {
  editor: ChartWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const [csv, setCsv] = useState(() => csvFromTable(editor.table));
  useEffect(() => setCsv(csvFromTable(editor.table)), [editor.table]);
  return (
    <fieldset
      disabled={editor.loading || editor.saving}
      className="space-y-4 overflow-y-auto p-3 text-[11px] text-stone-600 disabled:opacity-60"
    >
      <section className="space-y-2">
        <p className="font-semibold text-stone-800">{tt("图表数据")}</p>
        <textarea
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          aria-label={tt("图表 CSV 数据")}
          className="h-56 w-full resize-y rounded-lg border border-stone-200 p-2 font-mono text-[10px] leading-relaxed outline-none focus:border-stone-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="cursor-pointer rounded-lg border border-stone-200 px-2 py-2 text-center hover:bg-stone-50">
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
            className="rounded-lg border border-stone-200 px-2 py-2 hover:bg-stone-50"
          >
            {tt("应用数据")}
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-stone-400">
          {tt("点击图表后，标题、坐标轴、系列类型和颜色会出现在图表上方。")}
        </p>
      </section>
      <button
        type="button"
        disabled={editor.loading || editor.saving}
        onClick={() => void editor.save()}
        className="w-full rounded-lg px-3 py-2.5 font-semibold text-white disabled:opacity-50"
        style={{ background: accent }}
      >
        {editor.saving ? tt("保存中…") : tt("保存到我的库")}
      </button>
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
