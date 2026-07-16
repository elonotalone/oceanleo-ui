"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import {
  AdvancedWorkbenchShell,
  type EditorPanelDescriptor,
} from "../AdvancedWorkbenchShell";
import type { TopBarModel } from "../advanced-topbar";
import { useUI } from "../../i18n/ui/useUI";
import { GridContextToolbar } from "../doc-editors/GridContextToolbar";
import { GridControls } from "../doc-editors/GridControls";
import { GridStage } from "../doc-editors/GridStage";
import { useGridEditor } from "../doc-editors/use-grid-editor";
import type { GridCellType } from "../doc-editors/grid-model";
import { editorToolLabel } from "../workbench-routes";

export function GridRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useGridEditor(item, siteId);
  const format = editor.selectedFormat;

  const savedItem = useMemo(
    () =>
      editor.savedUrl
        ? advancedSavedItem(item, { url: editor.savedUrl })
        : null,
    [editor.savedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.save();
    return url
      ? { ok: true as const, item: advancedSavedItem(item, { url }) }
      : { ok: false as const };
  }, [editor.save, item]);

  // 统一顶栏：撤销/重做 · 插入行/列 · 单元格格式（加粗/对齐/数字类型）· 工作表
  // 设置面板 —— 收尾区：导出 CSV/XLSX/保存。格式类按钮跟随当前选区格式态。
  const topBarModel = useMemo<TopBarModel>(
    () => ({
      groups: [
        {
          id: "history",
          actions: [
            {
              kind: "action",
              id: "undo",
              label: tt("撤销"),
              icon: "undo",
              iconOnly: true,
              disabled: !editor.canUndo,
              onRun: editor.undo,
            },
            {
              kind: "action",
              id: "redo",
              label: tt("重做"),
              icon: "redo",
              iconOnly: true,
              disabled: !editor.canRedo,
              onRun: editor.redo,
            },
          ],
        },
        {
          id: "insert",
          actions: [
            {
              kind: "action",
              id: "row-after",
              label: tt("插入行"),
              icon: "plus",
              onRun: () => editor.insertRow("after"),
            },
            {
              kind: "action",
              id: "column-after",
              label: tt("插入列"),
              icon: "plus",
              onRun: () => editor.insertColumn("after"),
            },
          ],
        },
        {
          id: "format",
          actions: [
            {
              kind: "toggle",
              id: "bold",
              label: tt("加粗"),
              icon: "bold",
              iconOnly: true,
              active: format.bold === true,
              onRun: () => editor.applyFormat({ bold: !(format.bold === true) }),
            },
            {
              kind: "dropdown",
              id: "align",
              label: tt("对齐"),
              icon: "align-left",
              value: format.align || "left",
              options: [
                { value: "left", label: tt("左") },
                { value: "center", label: tt("中") },
                { value: "right", label: tt("右") },
              ],
              onSelect: (value) => {
                if (["left", "center", "right"].includes(value)) {
                  editor.applyFormat({
                    align: value as "left" | "center" | "right",
                  });
                }
              },
            },
            {
              kind: "dropdown",
              id: "type",
              label: tt("数字格式"),
              icon: "type",
              value: format.type || "auto",
              options: [
                { value: "auto", label: tt("自动") },
                { value: "text", label: tt("文本") },
                { value: "number", label: tt("数字") },
                { value: "currency", label: tt("人民币") },
                { value: "percent", label: tt("百分比") },
                { value: "date", label: tt("日期") },
              ],
              onSelect: (value) =>
                editor.applyFormat({ type: value as GridCellType }),
            },
          ],
        },
        {
          id: "sheet",
          actions: [
            {
              kind: "panel",
              id: "sheet-panel",
              label: tt("工作表"),
              icon: "layout",
              panelId: "sheet",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "export-csv",
          label: tt("导出 CSV"),
          icon: "download",
          iconOnly: true,
          disabled: editor.loading,
          onRun: editor.exportCsv,
        },
        {
          kind: "action",
          id: "export-xlsx",
          label: editor.exporting ? tt("导出中…") : tt("导出 XLSX"),
          icon: "grid",
          disabled: editor.loading || editor.exporting,
          onRun: () => void editor.exportXlsx(),
        },
        {
          kind: "action",
          id: "save",
          label: editor.saving ? tt("保存中…") : tt("保存"),
          icon: "save",
          disabled: editor.loading || editor.saving,
          onRun: () => void editor.save(),
        },
      ],
    }),
    [
      editor,
      format.align,
      format.bold,
      format.type,
      tt,
    ],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "sheet",
        title: tt("工作表设置"),
        width: 300,
        content: <GridControls editor={editor} accent={accent} />,
      },
    ],
    [accent, editor, tt],
  );

  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "grid" })}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
      editorContextualToolbar={
        <GridContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<GridStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        (editor.dirty
          ? "有未保存的修改"
          : editor.savedUrl
          ? "已保存到我的库"
          : editor.loading
            ? "正在载入表格"
            : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
