"use client";

import { useRef } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME, PanelSection, ToolButton } from "../editor-chrome";
import type { GridEditorState } from "./use-grid-editor";

// 表格「工作表设置」overlay 侧栏内容：工作簿导入 / 工作表管理 / 筛选与表头。
// 撤销重做与单元格格式（类型/加粗/对齐/颜色/行列）已上移到统一顶栏 + 选中浮动
// bar，这里只放需要面板承载的工作表级设置。全部走 CHROME/var 令牌跟随主题。

const FIELD =
  "w-full rounded-lg border px-2 py-1.5 text-[11px] outline-none " +
  `${CHROME.border} ${CHROME.subtle} ${CHROME.fg} placeholder:text-[var(--faint,#a8a29e)]`;

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
    <div className="space-y-1">
      <PanelSection title={tt("工作簿来源")}>
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
        <ToolButton
          label={editor.importing ? tt("导入中…") : tt("导入 CSV / XLSX")}
          icon="download"
          disabled={editor.importing}
          onClick={() => fileRef.current?.click()}
        />
        <p className={`px-1 text-[10px] leading-relaxed ${CHROME.muted}`}>
          {tt("选中单元格后，格式、排序和行列操作会出现在表格上方。")}
        </p>
      </PanelSection>

      <PanelSection title={tt("工作表")}>
        <label className={`block text-[10px] ${CHROME.muted}`}>
          {tt("工作表名称")}
          <input
            key={editor.activeSheetId}
            defaultValue={editor.activeSheet.name}
            onBlur={(event) => editor.renameSheet(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={`mt-1 ${FIELD}`}
          />
        </label>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <ToolButton
            label={tt("新增工作表")}
            icon="plus"
            onClick={editor.addSheet}
          />
          <ToolButton
            label={tt("删除工作表")}
            icon="delete"
            danger
            disabled={editor.sheets.length <= 1}
            onClick={editor.deleteSheet}
          />
        </div>
      </PanelSection>

      <PanelSection title={tt("筛选")}>
        <input
          value={editor.filterQuery}
          onChange={(event) => editor.setFilterQuery(event.target.value)}
          placeholder={tt("筛选当前列")}
          aria-label={tt("筛选当前列")}
          className={FIELD}
        />
        <label className={`mt-1.5 flex items-center gap-2 text-[10px] ${CHROME.fg2}`}>
          <input
            type="checkbox"
            checked={editor.headerRow}
            onChange={(event) => editor.setHeaderRow(event.target.checked)}
            style={{ accentColor: accent }}
          />
          {tt("第一行为表头")}
        </label>
        <p className={`mt-1.5 px-1 text-[10px] leading-relaxed ${CHROME.muted}`}>
          {tt("公式支持单元格引用，以及 SUM / AVERAGE / MIN / MAX / COUNT。")}
        </p>
      </PanelSection>
    </div>
  );
}
