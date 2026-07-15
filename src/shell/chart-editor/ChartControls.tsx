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
        <p className="font-semibold text-stone-800">{tt("图表")}</p>
        <label className="block">
          <span className="mb-1 block text-stone-500">{tt("标题")}</span>
          <input
            value={editor.document.option.title.text}
            onChange={(event) => editor.setTitle(event.target.value)}
            className="w-full rounded-lg border border-stone-200 px-2.5 py-2 outline-none focus:border-stone-400"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-2">
            <input
              type="checkbox"
              checked={editor.document.option.legend.show}
              onChange={(event) => editor.setLegend({ show: event.target.checked })}
            />
            {tt("显示图例")}
          </label>
          <select
            value={editor.document.option.legend.position}
            onChange={(event) =>
              editor.setLegend({
                position: event.target.value as "top" | "bottom" | "left" | "right",
              })
            }
            className="rounded-lg border border-stone-200 bg-white px-2 py-2"
          >
            <option value="top">{tt("图例在上")}</option>
            <option value="bottom">{tt("图例在下")}</option>
            <option value="left">{tt("图例在左")}</option>
            <option value="right">{tt("图例在右")}</option>
          </select>
        </div>
      </section>

      <section className="space-y-2 border-t border-stone-100 pt-3">
        <p className="font-semibold text-stone-800">{tt("坐标轴")}</p>
        {(["x", "y"] as const).map((axis) => {
          const value =
            axis === "x" ? editor.document.option.xAxis : editor.document.option.yAxis;
          return (
            <div key={axis} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
              <span className="font-medium uppercase text-stone-400">{axis}</span>
              <input
                value={value.name}
                placeholder={tt("轴标题")}
                onChange={(event) => editor.setAxis(axis, { name: event.target.value })}
                className="min-w-0 rounded-lg border border-stone-200 px-2 py-1.5"
              />
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={value.show}
                  onChange={(event) => editor.setAxis(axis, { show: event.target.checked })}
                />
                {tt("显示")}
              </label>
            </div>
          );
        })}
      </section>

      <section className="space-y-2 border-t border-stone-100 pt-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-stone-800">{tt("数据与系列")}</p>
          <button
            type="button"
            onClick={() => editor.addSeries("bar")}
            className="rounded-md border border-stone-200 px-2 py-1 hover:bg-stone-50"
          >
            + {tt("系列")}
          </button>
        </div>
        {editor.document.option.series.map((series) => (
          <div key={series.id} className="space-y-2 rounded-xl border border-stone-200 p-2.5">
            <div className="grid grid-cols-[1fr_5rem_2rem] gap-1.5">
              <input
                value={series.name}
                aria-label={tt("系列名称")}
                onChange={(event) =>
                  editor.patchSeries(series.id, { name: event.target.value })
                }
                className="min-w-0 rounded-md border border-stone-200 px-2 py-1.5"
              />
              <select
                value={series.type}
                onChange={(event) =>
                  editor.patchSeries(series.id, {
                    type: event.target.value as typeof series.type,
                  })
                }
                className="rounded-md border border-stone-200 bg-white px-1"
              >
                <option value="bar">{tt("柱状")}</option>
                <option value="line">{tt("折线")}</option>
                <option value="pie">{tt("饼图")}</option>
                <option value="gauge">{tt("仪表")}</option>
                <option value="scatter">{tt("散点")}</option>
                <option value="radar">{tt("雷达")}</option>
                <option value="funnel">{tt("漏斗")}</option>
              </select>
              <input
                type="color"
                value={series.color || editor.document.option.color[0] || accent}
                aria-label={tt("系列颜色")}
                onChange={(event) =>
                  editor.patchSeries(series.id, { color: event.target.value })
                }
                className="h-7 w-8 rounded border border-stone-200 p-0.5"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={series.label.show}
                  onChange={(event) =>
                    editor.patchSeries(series.id, {
                      label: { show: event.target.checked },
                    })
                  }
                />
                {tt("显示数据标签")}
              </label>
              <button
                type="button"
                disabled={editor.document.option.series.length <= 1}
                onClick={() => editor.removeSeries(series.id)}
                className="text-rose-500 disabled:opacity-30"
              >
                {tt("删除")}
              </button>
            </div>
          </div>
        ))}
        <textarea
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          aria-label={tt("图表 CSV 数据")}
          className="h-36 w-full resize-y rounded-lg border border-stone-200 p-2 font-mono text-[10px] leading-relaxed outline-none focus:border-stone-400"
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
      </section>

      <section className="space-y-2 border-t border-stone-100 pt-3">
        <p className="font-semibold text-stone-800">{tt("配色")}</p>
        <div className="flex flex-wrap gap-1.5">
          {editor.document.option.color.map((color, index) => (
            <input
              key={`${index}:${color}`}
              type="color"
              value={color}
              aria-label={`${tt("配色")} ${index + 1}`}
              onChange={(event) => {
                const colors = [...editor.document.option.color];
                colors[index] = event.target.value;
                editor.setColors(colors);
              }}
              className="h-8 w-8 rounded border border-stone-200 p-0.5"
            />
          ))}
        </div>
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
