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
  const context = useMemo<SelectionContext>(() => {
    const controls: SelectionControl[] = [
      {
        id: "title",
        kind: "text",
        label: tt("标题"),
        value: option.title.text,
      },
      {
        id: "legend-show",
        kind: "toggle",
        label: tt("图例"),
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
      },
      {
        id: "x-name",
        kind: "text",
        label: tt("X 轴"),
        value: option.xAxis.name,
        placement: "more",
      },
      {
        id: "y-name",
        kind: "text",
        label: tt("Y 轴"),
        value: option.yAxis.name,
        placement: "more",
      },
      {
        id: "add-series",
        kind: "action",
        label: "+ " + tt("系列"),
        placement: "more",
      },
    ];
    option.color.slice(0, 4).forEach((color, index) => {
      controls.push({
        id: `palette:${index}`,
        kind: "color",
        label: `${tt("配色")} ${index + 1}`,
        value: color,
        placement: "more",
      });
    });
    option.series.slice(0, 6).forEach((series) => {
      controls.push(
        {
          id: `series:${series.id}:name`,
          kind: "text",
          label: tt("系列名称"),
          value: series.name,
          placement: "more",
        },
        {
          id: `series:${series.id}:type`,
          kind: "select",
          label: series.name || tt("系列类型"),
          value: series.type,
          options: SERIES_OPTIONS.map((entry) => ({
            value: entry.value,
            label: tt(entry.label),
          })),
          placement: "more",
        },
        {
          id: `series:${series.id}:color`,
          kind: "color",
          label: tt("系列颜色"),
          value: series.color || option.color[0] || accent,
          placement: "more",
        },
        {
          id: `series:${series.id}:label`,
          kind: "toggle",
          label: tt("数据标签"),
          value: series.label.show,
          placement: "more",
        },
        {
          id: `series:${series.id}:delete`,
          kind: "action",
          label: tt("删除系列"),
          danger: true,
          disabled: option.series.length <= 1,
          placement: "more",
        },
      );
    });
    return {
      version: 1,
      kind: "chart",
      id: "chart",
      label: tt("图表"),
      controls: controls.slice(0, 32),
    };
  }, [accent, option, tt]);

  const command = (message: SelectionCommand) => {
    if (message.selectionId !== "chart") return;
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
