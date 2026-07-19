"use client";

import { useMemo, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
} from "../selection-context";
import {
  columnLabel,
  gridColCount,
  gridRowCount,
  type GridCellType,
} from "./grid-model";
import {
  rangesIntersect,
  type GridConditionalOperator,
} from "./grid-structure";
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
  const [condition, setCondition] = useState<{
    operator: GridConditionalOperator;
    value: string;
    color: string;
    background: string;
    bold: boolean;
  }>({
    operator: "greater-than",
    value: "0",
    color: "#166534",
    background: "#dcfce7",
    bold: true,
  });
  const hasMerge = editor.activeSheet.merges.some((merge) =>
    rangesIntersect(merge, range),
  );
  const hasConditional = editor.activeSheet.conditionalFormats.some((rule) =>
    rangesIntersect(rule.range, range),
  );
  const rowCount = gridRowCount(editor.activeSheet);
  const columnCount = gridColCount(editor.activeSheet);
  const wholeRows =
    range.firstCol === 0 && range.lastCol === columnCount - 1;
  const wholeColumns =
    range.firstRow === 0 && range.lastRow === rowCount - 1;
  const context = useMemo<SelectionContext>(
    () => ({
      version: 1,
      kind:
        wholeRows && wholeColumns
          ? "grid-sheet"
          : wholeRows
            ? "grid-row"
            : wholeColumns
              ? "grid-column"
              : range.firstRow === range.lastRow &&
                  range.firstCol === range.lastCol
          ? "grid-cell"
          : "grid-range",
      id: `cell:${editor.activeSheetId}:${address}`,
      label: `${address}${
        wholeRows && wholeColumns
          ? ` · ${tt("整张工作表")}`
          : wholeRows
            ? ` · ${tt("整行")}`
            : wholeColumns
              ? ` · ${tt("整列")}`
              : ""
      }`,
      revision: editor.editRevision,
      controls: [
        {
          id: "type",
          kind: "select",
          label: tt("数据类型"),
          icon: "table",
          iconOnly: true,
          group: "format",
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
          label: tt("粗体"),
          icon: "bold",
          iconOnly: true,
          group: "format",
          value: format.bold === true,
        },
        {
          id: "align",
          kind: "select",
          label: tt("对齐"),
          icon: "align-left",
          iconOnly: true,
          group: "format",
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
          icon: "font",
          iconOnly: true,
          group: "format",
          value: format.color || "#292524",
        },
        {
          id: "background",
          kind: "color",
          label: tt("底色"),
          icon: "background",
          iconOnly: true,
          group: "format",
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
          slot: "inspector",
          inspectorGroup: "grid-number-format",
          inspectorLabel: tt("数字格式"),
          inspectorIcon: "table",
        },
        {
          id: "row-before",
          kind: "action",
          label: tt("上方插入行"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-rows",
          inspectorLabel: tt("行"),
          inspectorIcon: "table",
        },
        {
          id: "row-after",
          kind: "action",
          label: tt("下方插入行"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-rows",
          inspectorLabel: tt("行"),
          inspectorIcon: "table",
        },
        {
          id: "row-delete",
          kind: "action",
          label: tt("删除所选行"),
          danger: true,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-rows",
          inspectorLabel: tt("行"),
          inspectorIcon: "table",
        },
        {
          id: "column-before",
          kind: "action",
          label: tt("左侧插入列"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-columns",
          inspectorLabel: tt("列"),
          inspectorIcon: "table",
        },
        {
          id: "column-after",
          kind: "action",
          label: tt("右侧插入列"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-columns",
          inspectorLabel: tt("列"),
          inspectorIcon: "table",
        },
        {
          id: "column-delete",
          kind: "action",
          label: tt("删除所选列"),
          danger: true,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-columns",
          inspectorLabel: tt("列"),
          inspectorIcon: "table",
        },
        {
          id: "sort-asc",
          kind: "action",
          label: tt("升序"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-data",
          inspectorLabel: tt("排序与筛选"),
          inspectorIcon: "filter",
        },
        {
          id: "sort-desc",
          kind: "action",
          label: tt("降序"),
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-data",
          inspectorLabel: tt("排序与筛选"),
          inspectorIcon: "filter",
        },
        {
          id: "header-row",
          kind: "toggle",
          label: tt("首行为表头"),
          value: editor.headerRow,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-data",
          inspectorLabel: tt("排序与筛选"),
          inspectorIcon: "filter",
        },
        {
          id: "filter-query",
          kind: "text",
          label: tt("筛选当前列"),
          value: editor.filterQuery,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-data",
          inspectorLabel: tt("排序与筛选"),
          inspectorIcon: "filter",
        },
        {
          id: "merge-cells",
          kind: "action",
          label: tt("合并所选单元格"),
          disabled:
            range.firstRow === range.lastRow && range.firstCol === range.lastCol,
          slot: "inspector",
          inspectorGroup: "grid-merge",
          inspectorLabel: tt("合并单元格"),
          inspectorIcon: "table",
        },
        {
          id: "split-cells",
          kind: "action",
          label: tt("拆分合并单元格"),
          disabled: !hasMerge,
          slot: "inspector",
          inspectorGroup: "grid-merge",
          inspectorLabel: tt("合并单元格"),
          inspectorIcon: "table",
        },
        {
          id: "condition-operator",
          kind: "select",
          label: tt("条件"),
          value: condition.operator,
          options: [
            { value: "greater-than", label: tt("大于") },
            { value: "less-than", label: tt("小于") },
            { value: "equal", label: tt("等于") },
            { value: "not-equal", label: tt("不等于") },
            { value: "contains", label: tt("包含文字") },
          ],
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
        {
          id: "condition-value",
          kind: "text",
          label: tt("比较值"),
          value: condition.value,
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
        {
          id: "condition-color",
          kind: "color",
          label: tt("文字色"),
          value: condition.color,
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
        {
          id: "condition-background",
          kind: "color",
          label: tt("底色"),
          value: condition.background,
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
        {
          id: "condition-bold",
          kind: "toggle",
          label: tt("粗体"),
          value: condition.bold,
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
        {
          id: "condition-apply",
          kind: "action",
          label: tt("应用到所选区域"),
          disabled: !condition.value.trim(),
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
        {
          id: "condition-clear",
          kind: "action",
          label: tt("清除所选区域规则"),
          disabled: !hasConditional,
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
      ],
    }),
    [
      address,
      editor.activeSheetId,
      editor.editRevision,
      editor.filterQuery,
      editor.headerRow,
      editor.activeSheet.conditionalFormats,
      editor.activeSheet.merges,
      condition,
      format,
      hasConditional,
      hasMerge,
      range,
      wholeColumns,
      wholeRows,
      tt,
    ],
  );
  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    if (
      message.selectionRevision !== undefined &&
      message.selectionRevision !== editor.editRevision
    ) {
      return;
    }
    if (message.transactionId && message.phase !== "commit") return;
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
      case "header-row":
        editor.setHeaderRow(message.value === true);
        break;
      case "filter-query":
        editor.setFilterQuery(String(message.value || ""));
        break;
      case "merge-cells":
        editor.mergeSelection();
        break;
      case "split-cells":
        editor.splitSelection();
        break;
      case "condition-operator":
        setCondition((current) => ({
          ...current,
          operator: String(message.value) as GridConditionalOperator,
        }));
        break;
      case "condition-value":
        setCondition((current) => ({
          ...current,
          value: String(message.value || ""),
        }));
        break;
      case "condition-color":
        setCondition((current) => ({
          ...current,
          color: String(message.value || "#166534"),
        }));
        break;
      case "condition-background":
        setCondition((current) => ({
          ...current,
          background: String(message.value || "#dcfce7"),
        }));
        break;
      case "condition-bold":
        setCondition((current) => ({
          ...current,
          bold: message.value === true,
        }));
        break;
      case "condition-apply":
        editor.addConditionalFormat(condition);
        break;
      case "condition-clear":
        editor.clearConditionalFormats();
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
