import type { UITranslate } from "../../i18n/ui/useUI";
import type {
  SelectionCommand,
  SelectionControl,
} from "../selection-context";
import type {
  ChartAxis,
  ChartOption,
  ChartSeries,
} from "./chart-schema";
import type { ChartWorkbenchState } from "./use-chart-workbench";

function optionalNumber(value: SelectionCommand["value"]): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function axisControls(
  axisKey: "x" | "y",
  axis: ChartAxis,
  tt: UITranslate,
): SelectionControl[] {
  const prefix = axisKey.toUpperCase();
  const group = {
    slot: "inspector" as const,
    inspectorGroup: `chart-${axisKey}-axis`,
    inspectorLabel: tt("{axis} 轴细节", { axis: prefix }),
    inspectorIcon: "position" as const,
  };
  const valueAxis = axis.type === "value";
  return [
    {
      id: `${axisKey}-min`,
      kind: "text",
      label: tt("最小值（留空自动）"),
      value: axis.min == null ? "" : String(axis.min),
      disabled: !valueAxis,
      ...group,
    },
    {
      id: `${axisKey}-max`,
      kind: "text",
      label: tt("最大值（留空自动）"),
      value: axis.max == null ? "" : String(axis.max),
      disabled: !valueAxis,
      ...group,
    },
    {
      id: `${axisKey}-interval`,
      kind: "text",
      label: tt("刻度间隔（留空自动）"),
      value: axis.interval == null ? "" : String(axis.interval),
      disabled: !valueAxis,
      ...group,
    },
    {
      id: `${axisKey}-ticks`,
      kind: "toggle",
      label: tt("显示刻度"),
      value: axis.axisTick.show,
      ...group,
    },
    {
      id: `${axisKey}-label-rotate`,
      kind: "range",
      label: tt("标签旋转"),
      value: axis.axisLabel.rotate,
      min: -90,
      max: 90,
      step: 5,
      ...group,
    },
    {
      id: `${axisKey}-label-color`,
      kind: "color",
      label: tt("刻度文字色"),
      value: axis.axisLabel.color || "#57534e",
      ...group,
    },
    {
      id: `${axisKey}-grid`,
      kind: "toggle",
      label: tt("显示网格线"),
      value: axis.splitLine.show,
      ...group,
    },
    {
      id: `${axisKey}-grid-color`,
      kind: "color",
      label: tt("网格线颜色"),
      value: String(axis.splitLine.lineStyle.color || "#e7e5e4"),
      ...group,
    },
  ];
}

export function chartAdvancedControls(
  option: ChartOption,
  activeSeries: ChartSeries | undefined,
  tt: UITranslate,
): SelectionControl[] {
  const tooltipGroup = {
    slot: "inspector" as const,
    inspectorGroup: "chart-tooltip",
    inspectorLabel: tt("提示框"),
    inspectorIcon: "note" as const,
  };
  const controls: SelectionControl[] = [
    ...axisControls("x", option.xAxis, tt),
    ...axisControls("y", option.yAxis, tt),
    {
      id: "tooltip-show",
      kind: "toggle",
      label: tt("显示提示框"),
      value: option.tooltip.show,
      ...tooltipGroup,
    },
    {
      id: "tooltip-trigger",
      kind: "select",
      label: tt("触发方式"),
      value: option.tooltip.trigger,
      options: [
        { value: "item", label: tt("数据项") },
        { value: "axis", label: tt("坐标轴") },
      ],
      ...tooltipGroup,
    },
    {
      id: "tooltip-background",
      kind: "color",
      label: tt("背景色"),
      value: option.tooltip.backgroundColor || "#292524",
      ...tooltipGroup,
    },
    {
      id: "tooltip-border-color",
      kind: "color",
      label: tt("边框色"),
      value: option.tooltip.borderColor || "#57534e",
      ...tooltipGroup,
    },
    {
      id: "tooltip-border-width",
      kind: "range",
      label: tt("边框宽度"),
      value: option.tooltip.borderWidth,
      min: 0,
      max: 10,
      step: 1,
      ...tooltipGroup,
    },
    {
      id: "tooltip-text-color",
      kind: "color",
      label: tt("文字色"),
      value: option.tooltip.textStyle.color || "#ffffff",
      ...tooltipGroup,
    },
    {
      id: "tooltip-font-size",
      kind: "number",
      label: tt("字号"),
      value: option.tooltip.textStyle.fontSize,
      min: 8,
      max: 48,
      step: 1,
      ...tooltipGroup,
    },
    {
      id: "tooltip-formatter",
      kind: "text",
      label: tt("格式模板"),
      value: option.tooltip.formatter,
      ...tooltipGroup,
    },
  ];
  if (!activeSeries) return controls;
  const labelGroup = {
    slot: "inspector" as const,
    inspectorGroup: "chart-data-label",
    inspectorLabel: tt("数据标签样式"),
    inspectorIcon: "text" as const,
  };
  controls.push(
    {
      id: `series:${activeSeries.id}:label-position`,
      kind: "select",
      label: tt("位置"),
      value: String(activeSeries.label.position || "top"),
      options: [
        { value: "top", label: tt("上") },
        { value: "bottom", label: tt("下") },
        { value: "left", label: tt("左") },
        { value: "right", label: tt("右") },
        { value: "inside", label: tt("内部") },
        { value: "insideTop", label: tt("内部上方") },
        { value: "insideBottom", label: tt("内部下方") },
      ],
      ...labelGroup,
    },
    {
      id: `series:${activeSeries.id}:label-color`,
      kind: "color",
      label: tt("文字色"),
      value: String(activeSeries.label.color || "#292524"),
      ...labelGroup,
    },
    {
      id: `series:${activeSeries.id}:label-font-size`,
      kind: "number",
      label: tt("字号"),
      value: Number(activeSeries.label.fontSize || 12),
      min: 8,
      max: 72,
      step: 1,
      ...labelGroup,
    },
    {
      id: `series:${activeSeries.id}:label-bold`,
      kind: "toggle",
      label: tt("粗体"),
      value: activeSeries.label.fontWeight === "bold",
      ...labelGroup,
    },
    {
      id: `series:${activeSeries.id}:label-formatter`,
      kind: "text",
      label: tt("格式模板"),
      value: String(activeSeries.label.formatter || "{c}"),
      ...labelGroup,
    },
  );
  return controls;
}

export function applyChartAdvancedCommand(
  editor: ChartWorkbenchState,
  option: ChartOption,
  message: SelectionCommand,
): boolean {
  const axisMatch = /^(x|y)-(min|max|interval|ticks|label-rotate|label-color|grid|grid-color)$/.exec(
    message.controlId,
  );
  if (axisMatch) {
    if (message.transactionId && message.phase !== "commit") return true;
    const axisKey = axisMatch[1] as "x" | "y";
    const field = axisMatch[2];
    const axis = axisKey === "x" ? option.xAxis : option.yAxis;
    let patch: Partial<ChartAxis>;
    if (field === "min" || field === "max" || field === "interval") {
      patch = { [field]: optionalNumber(message.value) };
    } else if (field === "ticks") {
      patch = { axisTick: { ...axis.axisTick, show: message.value === true } };
    } else if (field === "label-rotate") {
      patch = {
        axisLabel: {
          ...axis.axisLabel,
          rotate: Math.max(-90, Math.min(90, Number(message.value) || 0)),
        },
      };
    } else if (field === "label-color") {
      patch = {
        axisLabel: {
          ...axis.axisLabel,
          color: String(message.value || "#57534e"),
        },
      };
    } else if (field === "grid") {
      patch = {
        splitLine: { ...axis.splitLine, show: message.value === true },
      };
    } else {
      patch = {
        splitLine: {
          ...axis.splitLine,
          lineStyle: {
            ...axis.splitLine.lineStyle,
            color: String(message.value || "#e7e5e4"),
          },
        },
      };
    }
    editor.setAxis(axisKey, patch);
    return true;
  }

  if (message.controlId.startsWith("tooltip-")) {
    if (message.transactionId && message.phase !== "commit") return true;
    const field = message.controlId.slice("tooltip-".length);
    if (field === "show") {
      editor.setTooltip({ show: message.value === true });
    } else if (field === "trigger") {
      editor.setTooltip({
        trigger: message.value === "axis" ? "axis" : "item",
      });
    } else if (field === "background") {
      editor.setTooltip({ backgroundColor: String(message.value || "#292524") });
    } else if (field === "border-color") {
      editor.setTooltip({ borderColor: String(message.value || "#57534e") });
    } else if (field === "border-width") {
      editor.setTooltip({
        borderWidth: Math.max(0, Math.min(10, Number(message.value) || 0)),
      });
    } else if (field === "text-color") {
      editor.setTooltip({
        textStyle: {
          ...option.tooltip.textStyle,
          color: String(message.value || "#ffffff"),
        },
      });
    } else if (field === "font-size") {
      editor.setTooltip({
        textStyle: {
          ...option.tooltip.textStyle,
          fontSize: Math.max(8, Math.min(48, Number(message.value) || 12)),
        },
      });
    } else if (field === "formatter") {
      editor.setTooltip({ formatter: String(message.value || "").slice(0, 500) });
    }
    return true;
  }

  const labelMatch = /^series:([^:]+):label-(position|color|font-size|bold|formatter)$/.exec(
    message.controlId,
  );
  if (!labelMatch) return false;
  if (message.transactionId && message.phase !== "commit") return true;
  const [, id, field] = labelMatch;
  const series = option.series.find((entry) => entry.id === id);
  if (!series) return true;
  const value =
    field === "font-size"
      ? Math.max(8, Math.min(72, Number(message.value) || 12))
      : field === "bold"
        ? message.value === true
          ? "bold"
          : "normal"
        : String(message.value ?? "");
  editor.patchSeries(id, {
    label: {
      ...series.label,
      [field === "font-size"
        ? "fontSize"
        : field === "bold"
          ? "fontWeight"
          : field]: value,
    },
  });
  return true;
}
