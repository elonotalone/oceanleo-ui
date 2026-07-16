"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import { columnLabel, type GridCellType } from "./grid-model";
import type { GridEditorState } from "./use-grid-editor";

export function GridContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: GridEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const range = editor.selectionRange;
  const address =
    range.firstRow === range.lastRow && range.firstCol === range.lastCol
      ? `${columnLabel(range.firstCol)}${range.firstRow + 1}`
      : `${columnLabel(range.firstCol)}${range.firstRow + 1}:${columnLabel(
          range.lastCol,
        )}${range.lastRow + 1}`;
  const format = editor.selectedFormat;
  const context = useMemo<SelectionContext>(
    () => ({
      version: 1,
      kind:
        range.firstRow === range.lastRow && range.firstCol === range.lastCol
          ? "grid-cell"
          : "grid-range",
      id: `cell:${editor.activeSheetId}:${address}`,
      label: address,
      controls: [
        {
          id: "type",
          kind: "select",
          label: tt("数据类型"),
          value: format.type || "auto",
          options: [
            { value: "auto", label: tt("自动") },
            { value: "text", label: tt("文本") },
            { value: "number", label: tt("数字") },
            { value: "currency", label: tt("人民币") },
            { value: "percent", label: tt("百分比") },
            { value: "date", label: tt("日期") },
          ],
        },
        {
          id: "bold",
          kind: "toggle",
          label: "B",
          value: format.bold === true,
        },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          value: format.align || "left",
          options: [
            { value: "left", label: tt("左") },
            { value: "center", label: tt("中") },
            { value: "right", label: tt("右") },
          ],
        },
        {
          id: "color",
          kind: "color",
          label: tt("文字"),
          value: format.color || "#292524",
        },
        {
          id: "background",
          kind: "color",
          label: tt("底色"),
          value: format.background || "#ffffff",
        },
        {
          id: "decimals",
          kind: "number",
          label: tt("小数位"),
          value: format.decimals ?? 2,
          min: 0,
          max: 8,
          placement: "more",
        },
        { id: "row-before", kind: "action", label: tt("上方插入行"), placement: "more" },
        { id: "row-after", kind: "action", label: tt("下方插入行"), placement: "more" },
        {
          id: "row-delete",
          kind: "action",
          label: tt("删除所选行"),
          danger: true,
          placement: "more",
        },
        { id: "column-before", kind: "action", label: tt("左侧插入列"), placement: "more" },
        { id: "column-after", kind: "action", label: tt("右侧插入列"), placement: "more" },
        {
          id: "column-delete",
          kind: "action",
          label: tt("删除所选列"),
          danger: true,
          placement: "more",
        },
        { id: "sort-asc", kind: "action", label: tt("升序"), placement: "more" },
        { id: "sort-desc", kind: "action", label: tt("降序"), placement: "more" },
      ],
    }),
    [address, editor.activeSheetId, format, range, tt],
  );
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    switch (message.controlId) {
      case "type":
        editor.applyFormat({ type: String(message.value) as GridCellType });
        break;
      case "bold":
        editor.applyFormat({ bold: message.value === true });
        break;
      case "align":
        if (["left", "center", "right"].includes(String(message.value))) {
          editor.applyFormat({
            align: message.value as "left" | "center" | "right",
          });
        }
        break;
      case "color":
      case "background":
        editor.applyFormat({
          [message.controlId]: String(message.value || "#ffffff"),
        });
        break;
      case "decimals":
        if (typeof message.value === "number") {
          editor.applyFormat({
            decimals: Math.max(0, Math.min(8, message.value)),
          });
        }
        break;
      case "row-before":
        editor.insertRow("before");
        break;
      case "row-after":
        editor.insertRow("after");
        break;
      case "row-delete":
        editor.deleteRows();
        break;
      case "column-before":
        editor.insertColumn("before");
        break;
      case "column-after":
        editor.insertColumn("after");
        break;
      case "column-delete":
        editor.deleteColumns();
        break;
      case "sort-asc":
        editor.sort("asc");
        break;
      case "sort-desc":
        editor.sort("desc");
        break;
    }
  };
  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
