"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME, PanelSection } from "../editor-chrome";
import type { ChartWorkbenchState } from "./use-chart-workbench";

// 图表「数据」overlay 侧栏内容：CSV 表格编辑 / 导入 / 应用。图表类型、加系列、保存
// 已上移到统一顶栏（AdvancedTopBar）；标题、坐标轴、系列类型/颜色/标签在选中图表
// 浮动 bar（ChartContextToolbar）。全部走 CHROME/CSS 变量令牌跟随双主题。

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
  void accent;
  return (
    <fieldset
      disabled={editor.loading || editor.saving}
      className={`space-y-1 text-[11px] ${CHROME.fg2} disabled:opacity-60`}
    >
      <PanelSection title={tt("图表数据")}>
        <textarea
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          aria-label={tt("图表 CSV 数据")}
          className={`h-56 w-full resize-y rounded-lg border ${CHROME.border} ${CHROME.surface} p-2 font-mono text-[10px] leading-relaxed ${CHROME.fg} outline-none focus:border-[var(--fg-2,#57534e)]`}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className={`cursor-pointer rounded-lg border ${CHROME.border} px-2 py-2 text-center ${CHROME.hover}`}>
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
            className={`rounded-lg border ${CHROME.border} px-2 py-2 ${CHROME.hover}`}
          >
            {tt("应用数据")}
          </button>
        </div>
        <p className={`mt-1.5 text-[10px] leading-relaxed ${CHROME.muted}`}>
          {tt("点击图表后，标题、坐标轴、系列类型和颜色会出现在图表上方。")}
        </p>
      </PanelSection>
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
