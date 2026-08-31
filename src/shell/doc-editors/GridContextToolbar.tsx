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
import { describeConditionalRule } from "./grid-format/conditional-format";
import { NUMBER_FORMAT_PRESETS } from "./grid-format/number-format";
import {
  GRID_VALIDATION_KINDS,
  type GridValidationKind,
  type GridValidationOperator,
} from "./grid-format/data-validation";
import {
  NUMFMT_MAX_LENGTH,
  conditionalRuleOptions,
  conditionalRulesFromSheet,
  describeValidationDraft,
  numberFormatPatternForPreset,
  numberFormatPresetId,
  numberFormatPreview,
  runValidationCheck,
  validationNeedsSecondBound,
  validationRuleFromDraft,
  type GridValidationDraft,
} from "./grid-format/toolbar-bridge";
import type { GridEditorState } from "./use-grid-editor";

/**
 * The operators the stored `GridConditionalFormat` can hold. The engine knows
 * twelve; reading a rule back into the editable fields must not offer the
 * seven the legacy store would silently drop on apply.
 */
const LEGACY_CONDITION_OPERATORS = new Set<string>([
  "greater-than",
  "less-than",
  "equal",
  "not-equal",
  "contains",
]);

const VALIDATION_OPERATORS = new Set<string>([
  "between",
  "not-between",
  "equal",
  "not-equal",
  "greater-than",
  "less-than",
  "greater-equal",
  "less-equal",
]);

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
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [validation, setValidation] = useState<GridValidationDraft>({
    kind: "list",
    operator: "between",
    value: "",
    value2: "",
    behavior: "warn",
  });
  const [validationReport, setValidationReport] = useState("");
  const hasMerge = editor.activeSheet.merges.some((merge) =>
    rangesIntersect(merge, range),
  );
  // The stored five-operator rules lifted into the engine's shape purely so the
  // reader can *see* them. Listing is the half of a rule manager the legacy
  // store can back; editing one in place needs a write seam that
  // `use-grid-editor` does not expose yet (signals/W13-request.md R4).
  const conditionalRules = useMemo(
    () => conditionalRulesFromSheet(editor.activeSheet.conditionalFormats),
    [editor.activeSheet.conditionalFormats],
  );
  const rulesInSelection = conditionalRules.filter((rule) =>
    rangesIntersect(rule.range, range),
  );
  const hasConditional = rulesInSelection.length > 0;
  const inspectedRule =
    conditionalRules.find((rule) => rule.id === selectedRuleId) || null;
  const numberPattern = format.numFmt || "";
  const numberPreview = numberFormatPreview(
    editor.selectedValue,
    numberPattern,
  );
  const activePreset = numberFormatPresetId(numberPattern);
  const validationRule = useMemo(
    () => validationRuleFromDraft(validation, range),
    [range, validation],
  );
  const needsSecondBound = validationNeedsSecondBound(validation);
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
          id: "numfmt-preset",
          kind: "select",
          label: tt("格式预设"),
          value: activePreset,
          options: [
            ...NUMBER_FORMAT_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
            })),
            { value: "custom", label: tt("自定义") },
          ],
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-number-format",
          inspectorLabel: tt("数字格式"),
          inspectorIcon: "table",
        },
        {
          id: "numfmt-pattern",
          kind: "text",
          label: tt("格式串"),
          value: numberPattern,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "grid-number-format",
          inspectorLabel: tt("数字格式"),
          inspectorIcon: "table",
        },
        {
          id: "numfmt-preview",
          kind: "text",
          label: tt("预览"),
          value: numberPreview,
          disabled: true,
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
          id: "condition-rule",
          kind: "select",
          label: tt("本表规则"),
          value: selectedRuleId,
          options: conditionalRuleOptions(conditionalRules, tt("新建规则")),
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
        {
          id: "condition-rule-detail",
          kind: "text",
          label: tt("规则说明"),
          value: inspectedRule ? describeConditionalRule(inspectedRule) : "",
          disabled: true,
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
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
          // The count is the difference between "clear" and "clear what?" —
          // this button used to delete an unknown number of rules silently.
          suffix: hasConditional ? String(rulesInSelection.length) : "",
          danger: true,
          disabled: !hasConditional,
          slot: "inspector",
          inspectorGroup: "grid-conditional",
          inspectorLabel: tt("条件格式"),
          inspectorIcon: "filter",
        },
        {
          id: "validation-kind",
          kind: "select",
          label: tt("验证类型"),
          value: validation.kind,
          options: [
            { value: "list", label: tt("列表（下拉）") },
            { value: "whole", label: tt("整数") },
            { value: "decimal", label: tt("小数") },
            { value: "date", label: tt("日期") },
            { value: "text-length", label: tt("文本长度") },
            { value: "custom", label: tt("自定义公式") },
          ],
          slot: "inspector",
          inspectorGroup: "grid-validation",
          inspectorLabel: tt("数据验证"),
          inspectorIcon: "filter",
        },
        {
          id: "validation-operator",
          kind: "select",
          label: tt("比较"),
          value: validation.operator,
          disabled:
            validation.kind === "list" || validation.kind === "custom",
          options: [
            { value: "between", label: tt("介于") },
            { value: "not-between", label: tt("不介于") },
            { value: "equal", label: tt("等于") },
            { value: "not-equal", label: tt("不等于") },
            { value: "greater-than", label: tt("大于") },
            { value: "less-than", label: tt("小于") },
            { value: "greater-equal", label: tt("大于等于") },
            { value: "less-equal", label: tt("小于等于") },
          ],
          slot: "inspector",
          inspectorGroup: "grid-validation",
          inspectorLabel: tt("数据验证"),
          inspectorIcon: "filter",
        },
        {
          id: "validation-value",
          kind: "text",
          label:
            validation.kind === "list"
              ? tt("候选项或区域引用")
              : validation.kind === "custom"
                ? tt("公式")
                : tt("下限或值"),
          value: validation.value,
          slot: "inspector",
          inspectorGroup: "grid-validation",
          inspectorLabel: tt("数据验证"),
          inspectorIcon: "filter",
        },
        {
          id: "validation-value2",
          kind: "text",
          label: tt("上限"),
          value: validation.value2,
          disabled: !needsSecondBound,
          slot: "inspector",
          inspectorGroup: "grid-validation",
          inspectorLabel: tt("数据验证"),
          inspectorIcon: "filter",
        },
        {
          id: "validation-behavior",
          kind: "select",
          label: tt("违规时"),
          value: validation.behavior,
          options: [
            { value: "warn", label: tt("警告（仍可录入）") },
            { value: "block", label: tt("阻止录入") },
          ],
          slot: "inspector",
          inspectorGroup: "grid-validation",
          inspectorLabel: tt("数据验证"),
          inspectorIcon: "filter",
        },
        {
          id: "validation-check",
          kind: "action",
          label: tt("圈出所选区域的无效数据"),
          disabled: !validationRule,
          slot: "inspector",
          inspectorGroup: "grid-validation",
          inspectorLabel: tt("数据验证"),
          inspectorIcon: "filter",
        },
        {
          id: "validation-report",
          kind: "text",
          label: tt("检查结果"),
          value: validationReport || describeValidationDraft(validationRule),
          disabled: true,
          slot: "inspector",
          inspectorGroup: "grid-validation",
          inspectorLabel: tt("数据验证"),
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
      activePreset,
      condition,
      conditionalRules,
      format,
      hasConditional,
      hasMerge,
      inspectedRule,
      needsSecondBound,
      numberPattern,
      numberPreview,
      range,
      rulesInSelection,
      selectedRuleId,
      validation,
      validationReport,
      validationRule,
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
      case "numfmt-preset": {
        // "custom" is not a preset: it means "leave the pattern box alone".
        const pattern = numberFormatPatternForPreset(String(message.value));
        if (pattern === null) break;
        editor.applyFormat({ numFmt: pattern });
        break;
      }
      case "numfmt-pattern":
        editor.applyFormat({
          numFmt: String(message.value || "").slice(0, NUMFMT_MAX_LENGTH),
        });
        break;
      case "condition-rule": {
        const id = String(message.value || "");
        setSelectedRuleId(id);
        const picked = conditionalRules.find((rule) => rule.id === id);
        if (!picked) break;
        // Loading a stored rule back into the fields is the only "edit" the
        // legacy store supports: read it, tweak it, apply it to a selection.
        if (picked.kind !== "cell-value" && picked.kind !== "text") break;
        setCondition((current) => ({
          operator: LEGACY_CONDITION_OPERATORS.has(picked.operator)
            ? (picked.operator as GridConditionalOperator)
            : current.operator,
          value: picked.value,
          color: picked.style.color || current.color,
          background: picked.style.background || current.background,
          bold: picked.style.bold === true,
        }));
        break;
      }
      case "validation-kind": {
        const kind = String(message.value) as GridValidationKind;
        if (!GRID_VALIDATION_KINDS.includes(kind)) break;
        setValidation((current) => ({ ...current, kind }));
        setValidationReport("");
        break;
      }
      case "validation-operator": {
        const operator = String(message.value);
        if (!VALIDATION_OPERATORS.has(operator)) break;
        setValidation((current) => ({
          ...current,
          operator: operator as GridValidationOperator,
        }));
        setValidationReport("");
        break;
      }
      case "validation-value":
        setValidation((current) => ({
          ...current,
          value: String(message.value || ""),
        }));
        setValidationReport("");
        break;
      case "validation-value2":
        setValidation((current) => ({
          ...current,
          value2: String(message.value || ""),
        }));
        setValidationReport("");
        break;
      case "validation-behavior":
        setValidation((current) => ({
          ...current,
          behavior: message.value === "block" ? "block" : "warn",
        }));
        break;
      case "validation-check": {
        const check = runValidationCheck(
          validationRule,
          {
            rows: editor.activeSheet.rows,
            sheetName: editor.activeSheet.name,
            // Cross-sheet list sources (`=Sheet2!A1:A9`) resolve against the
            // live workbook rather than being refused.
            workbook: Object.fromEntries(
              editor.sheets.map((sheet) => [sheet.name, sheet.rows]),
            ),
          },
          tt("所选区域全部符合"),
        );
        setValidationReport(check.report);
        break;
      }
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
