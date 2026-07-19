"use client";

import { useMemo } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SelectionToolbar } from "../SelectionToolbar";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import type { ChartSeries, ChartSeriesType } from "./chart-schema";
import type { ChartWorkbenchState } from "./use-chart-workbench";
import {
  applyChartAdvancedCommand,
  chartAdvancedControls,
} from "./chart-advanced-controls";

const SERIES_OPTIONS: Array<{ value: ChartSeriesType; label: string }> = [
  { value: "bar", label: "柱状" },
  { value: "line", label: "折线" },
  { value: "pie", label: "饼图" },
  { value: "gauge", label: "仪表" },
  { value: "scatter", label: "散点" },
  { value: "radar", label: "雷达" },
  { value: "funnel", label: "漏斗" },
];

export function ChartContextToolbar({
  editor,
  accent = "#4f46e5",
}: {
  editor: ChartWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const option = editor.document.option;
  const legendTextStyle =
    option.legend.textStyle &&
    typeof option.legend.textStyle === "object" &&
    !Array.isArray(option.legend.textStyle)
      ? (option.legend.textStyle as Record<string, unknown>)
      : {};
  const legendColor = /^#[0-9a-f]{6}$/i.test(String(legendTextStyle.color || ""))
    ? String(legendTextStyle.color)
    : "#292524";
  const rawLegendFontSize = Number(legendTextStyle.fontSize);
  const legendFontSize = Number.isFinite(rawLegendFontSize)
    ? Math.max(8, Math.min(48, rawLegendFontSize))
    : 12;
  const activeSeries =
    option.series.find((series) => series.id === editor.activeSeriesId) ||
    option.series[0];
  const context = useMemo<SelectionContext>(() => {
    const controls: SelectionControl[] = [
      {
        id: "title",
        kind: "text",
        label: tt("标题"),
        value: option.title.text,
        slot: "inspector",
        inspectorGroup: "chart-title",
        inspectorLabel: tt("标题"),
        inspectorIcon: "text",
      },
      {
        id: "legend-show",
        kind: "toggle",
        label: tt("图例"),
        icon: "select",
        iconOnly: true,
        group: "legend",
        value: option.legend.show,
      },
      {
        id: "legend-position",
        kind: "select",
        label: tt("图例位置"),
        value: option.legend.position,
        options: [
          { value: "top", label: tt("上") },
          { value: "bottom", label: tt("下") },
          { value: "left", label: tt("左") },
          { value: "right", label: tt("右") },
        ],
        slot: "inspector",
        inspectorGroup: "chart-legend",
        inspectorLabel: tt("图例样式"),
        inspectorIcon: "position",
      },
      {
        id: "legend-color",
        kind: "color",
        label: tt("图例文字色"),
        value: legendColor,
        slot: "inspector",
        inspectorGroup: "chart-legend",
        inspectorLabel: tt("图例样式"),
        inspectorIcon: "text",
      },
      {
        id: "legend-font-size",
        kind: "number",
        label: tt("图例字号"),
        value: legendFontSize,
        min: 8,
        max: 48,
        step: 1,
        slot: "inspector",
        inspectorGroup: "chart-legend",
        inspectorLabel: tt("图例样式"),
        inspectorIcon: "font",
      },
      {
        id: "x-name",
        kind: "text",
        label: tt("X 轴"),
        value: option.xAxis.name,
        placement: "more",
        slot: "inspector",
        inspectorGroup: "chart-axis",
        inspectorLabel: tt("坐标轴"),
        inspectorIcon: "position",
      },
      {
        id: "y-name",
        kind: "text",
        label: tt("Y 轴"),
        value: option.yAxis.name,
        placement: "more",
        slot: "inspector",
        inspectorGroup: "chart-axis",
        inspectorLabel: tt("坐标轴"),
        inspectorIcon: "position",
      },
      {
        id: "x-show",
        kind: "toggle",
        label: tt("显示 X 轴"),
        value: option.xAxis.show,
        slot: "inspector",
        inspectorGroup: "chart-axis",
        inspectorLabel: tt("坐标轴"),
        inspectorIcon: "position",
      },
      {
        id: "y-show",
        kind: "toggle",
        label: tt("显示 Y 轴"),
        value: option.yAxis.show,
        slot: "inspector",
        inspectorGroup: "chart-axis",
        inspectorLabel: tt("坐标轴"),
        inspectorIcon: "position",
      },
      {
        id: "x-type",
        kind: "select",
        label: tt("X 轴类型"),
        value: option.xAxis.type,
        options: [
          { value: "category", label: tt("分类轴") },
          { value: "value", label: tt("数值轴") },
        ],
        slot: "inspector",
        inspectorGroup: "chart-axis",
        inspectorLabel: tt("坐标轴"),
        inspectorIcon: "position",
      },
      {
        id: "y-type",
        kind: "select",
        label: tt("Y 轴类型"),
        value: option.yAxis.type,
        options: [
          { value: "category", label: tt("分类轴") },
          { value: "value", label: tt("数值轴") },
        ],
        slot: "inspector",
        inspectorGroup: "chart-axis",
        inspectorLabel: tt("坐标轴"),
        inspectorIcon: "position",
      },
      {
        id: "add-series",
        kind: "action",
        label: "+ " + tt("系列"),
        placement: "more",
        icon: "add",
      },
      ...(option.series.length > 1
        ? [
            {
              id: "series-selector",
              kind: "select" as const,
              label: tt("当前系列（单选）"),
              icon: "line" as const,
              iconOnly: true,
              group: "series",
              value: activeSeries?.id || "",
              options: option.series.map((series) => ({
                value: series.id,
                label: series.name || series.id,
              })),
            },
          ]
        : []),
    ];
    option.color.slice(0, 4).forEach((color, index) => {
      controls.push({
        id: `palette:${index}`,
        kind: "color",
        label: `${tt("配色")} ${index + 1}`,
        value: color,
        placement: "more",
        slot: "inspector",
        inspectorGroup: "chart-palette",
        inspectorLabel: tt("整体配色"),
        inspectorIcon: "background",
      });
    });
    if (activeSeries) {
      const series = activeSeries;
      controls.push(
        {
          id: `series:${series.id}:name`,
          kind: "text",
          label: tt("系列名称"),
          value: series.name,
          placement: "more",
          slot: "inspector",
          inspectorGroup: "chart-series",
          inspectorLabel: tt("当前系列"),
          inspectorIcon: "line",
        },
        {
          id: `series:${series.id}:type`,
          kind: "select",
          label: series.name || tt("系列类型"),
          icon: "line",
          iconOnly: true,
          group: "series",
          value: series.type,
          options: SERIES_OPTIONS.map((entry) => ({
            value: entry.value,
            label: tt(entry.label),
          })),
        },
        {
          id: `series:${series.id}:color`,
          kind: "color",
          label: tt("系列颜色"),
          icon: "color",
          iconOnly: true,
          group: "series",
          value: series.color || option.color[0] || accent,
        },
        {
          id: `series:${series.id}:label`,
          kind: "toggle",
          label: tt("数据标签"),
          icon: "text",
          iconOnly: true,
          group: "series",
          value: series.label.show,
        },
        {
          id: `series:${series.id}:delete`,
          kind: "action",
          label: tt("删除系列"),
          icon: "delete",
          danger: true,
          disabled: option.series.length <= 1,
          placement: "more",
        },
      );
    }
    controls.push(...chartAdvancedControls(option, activeSeries, tt));
    return {
      version: 1,
      kind: activeSeries ? "chart-series" : "chart",
      id: activeSeries ? `chart-series:${activeSeries.id}` : "chart",
      label: activeSeries?.name || tt("图表"),
      revision: editor.editRevision,
      controls,
    };
  }, [
    accent,
    activeSeries,
    legendColor,
    legendFontSize,
    legendTextStyle,
    option,
    editor.editRevision,
    tt,
  ]);

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== context.id) return;
    if (
      message.selectionRevision !== undefined &&
      message.selectionRevision !== editor.editRevision
    ) {
      return;
    }
    if (message.transactionId && message.phase !== "commit") return;
    if (applyChartAdvancedCommand(editor, option, message)) return;
    if (message.controlId === "title") {
      editor.setTitle(String(message.value ?? ""));
      return;
    }
    if (message.controlId === "legend-show") {
      editor.setLegend({ show: message.value === true });
      return;
    }
    if (message.controlId === "legend-position") {
      editor.setLegend({
        position: String(message.value) as "top" | "bottom" | "left" | "right",
      });
      return;
    }
    if (
      message.controlId === "legend-color" ||
      message.controlId === "legend-font-size"
    ) {
      editor.setLegend({
        textStyle: {
          ...legendTextStyle,
          [message.controlId === "legend-color" ? "color" : "fontSize"]:
            message.controlId === "legend-color"
              ? String(message.value || "#292524")
              : Math.max(8, Math.min(48, Number(message.value) || 12)),
        },
      });
      return;
    }
    if (message.controlId === "x-name" || message.controlId === "y-name") {
      editor.setAxis(message.controlId[0] as "x" | "y", {
        name: String(message.value ?? ""),
      });
      return;
    }
    if (message.controlId === "add-series") {
      editor.addSeries("bar");
      return;
    }
    if (message.controlId === "series-selector") {
      const next = String(message.value || "");
      if (option.series.some((series) => series.id === next)) {
        editor.selectSeries(next);
      }
      return;
    }
    if (message.controlId === "x-show" || message.controlId === "y-show") {
      editor.setAxis(message.controlId[0] as "x" | "y", {
        show: message.value === true,
      });
      return;
    }
    if (message.controlId === "x-type" || message.controlId === "y-type") {
      const type = String(message.value);
      if (type === "category" || type === "value") {
        editor.setAxis(message.controlId[0] as "x" | "y", { type });
      }
      return;
    }
    const palette = /^palette:(\d+)$/.exec(message.controlId);
    if (palette) {
      const index = Number(palette[1]);
      const colors = [...option.color];
      if (index >= 0 && index < colors.length) {
        colors[index] = String(message.value || colors[index]);
        editor.setColors(colors);
      }
      return;
    }
    const match = /^series:([^:]+):(name|type|color|label|delete)$/.exec(
      message.controlId,
    );
    if (!match) return;
    const [, id, field] = match;
    if (field === "delete") {
      editor.removeSeries(id);
      return;
    }
    const patch: Partial<ChartSeries> =
      field === "label"
        ? { label: { show: message.value === true } }
        : field === "type"
          ? { type: String(message.value) as ChartSeriesType }
          : { [field]: String(message.value ?? "") };
    editor.patchSeries(id, patch);
  };
  return (
    <SelectionToolbar
      context={context}
      onCommand={command}
      accent={accent}
    />
  );
}
