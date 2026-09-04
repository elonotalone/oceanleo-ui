"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { chartXlsxListSheets } from "./chart-schema";
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
  onAdvise,
}: {
  editor: ChartWorkbenchState;
  onAdvise?: () => void;
}) {
  const tt = useUI();
  const [csv, setCsv] = useState(() => csvFromTable(editor.table));
  const [xlsxBytes, setXlsxBytes] = useState<Uint8Array | null>(null);
  const [xlsxSheets, setXlsxSheets] = useState<string[]>([]);
  const [xlsxSheet, setXlsxSheet] = useState("");
  const [xlsxRange, setXlsxRange] = useState("");
  const [xlsxHeader, setXlsxHeader] = useState<"auto" | "yes" | "no">("auto");
  useEffect(() => setCsv(csvFromTable(editor.table)), [editor.table]);

  const ingestStoredXlsx = (bytes: Uint8Array, sheet: string, range: string, header: "auto" | "yes" | "no") => {
    const headerRow = header === "auto" ? null : header === "yes";
    return editor.importXlsx(bytes, {
      ...(sheet ? { sheet } : {}),
      ...(range.trim() ? { range: range.trim() } : {}),
      headerRow,
    });
  };
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
          className="h-56 w-full resize-y rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2.5 font-mono text-[10px] leading-relaxed text-[var(--fg,#292524)] outline-none focus:border-[var(--awb-accent,#7c3aed)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="cursor-pointer rounded-xl border border-[var(--border,#e7e5e4)] px-2.5 py-2 text-center hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]">
            {tt("导入 CSV")}
            <input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
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
          <label className="cursor-pointer rounded-xl border border-[var(--border,#e7e5e4)] px-2.5 py-2 text-center hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]">
            导入 Excel
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.arrayBuffer().then(async (buffer) => {
                  const bytes = new Uint8Array(buffer);
                  setXlsxBytes(bytes);
                  try {
                    const sheets = await chartXlsxListSheets(bytes);
                    setXlsxSheets(sheets);
                    const sheet = sheets[0] || "";
                    setXlsxSheet(sheet);
                    await ingestStoredXlsx(bytes, sheet, xlsxRange, xlsxHeader);
                  } catch {
                    setXlsxSheets([]);
                  }
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
        {xlsxBytes ? (
          <div className="grid grid-cols-2 gap-2" data-chart-xlsx-options="">
            {xlsxSheets.length > 1 ? (
              <label className="col-span-2 space-y-1">
                <span>工作表</span>
                <select
                  value={xlsxSheet}
                  onChange={(event) => {
                    const sheet = event.target.value;
                    setXlsxSheet(sheet);
                    void ingestStoredXlsx(xlsxBytes, sheet, xlsxRange, xlsxHeader);
                  }}
                  className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1.5"
                >
                  {xlsxSheets.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-1">
              <span>区域（A1 记法）</span>
              <input
                value={xlsxRange}
                placeholder="整表"
                onChange={(event) => setXlsxRange(event.target.value)}
                onBlur={() =>
                  void ingestStoredXlsx(xlsxBytes, xlsxSheet, xlsxRange, xlsxHeader)
                }
                className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1.5 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span>第一行是表头</span>
              <select
                value={xlsxHeader}
                onChange={(event) => {
                  const header = event.target.value as "auto" | "yes" | "no";
                  setXlsxHeader(header);
                  void ingestStoredXlsx(xlsxBytes, xlsxSheet, xlsxRange, header);
                }}
                className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 py-1.5"
              >
                <option value="auto">自动猜</option>
                <option value="yes">是</option>
                <option value="no">否</option>
              </select>
            </label>
          </div>
        ) : null}
        {onAdvise ? (
          <button
            type="button"
            onClick={onAdvise}
            className="w-full rounded-xl border border-[var(--border,#e7e5e4)] px-2.5 py-2 hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
          >
            推荐图型
          </button>
        ) : null}
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("点击图表后，标题、坐标轴、系列类型和颜色会出现在图表上方。")}
        </p>
      </section>
      {(editor.error || editor.notice) && (
        <p
          role={editor.error ? "alert" : "status"}
          className={
            editor.error ? "text-[var(--awb-danger)]" : "text-[var(--awb-ok)]"
          }
        >
          {editor.error || editor.notice}
        </p>
      )}
    </fieldset>
  );
}
