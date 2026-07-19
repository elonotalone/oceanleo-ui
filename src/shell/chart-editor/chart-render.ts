import type { EChartsOption } from "echarts";
import type { ChartOption } from "./chart-schema";

function positionedLegend(source: ChartOption): Record<string, unknown> {
  const legend = { ...source.legend } as Record<string, unknown>;
  const position = legend.position;
  delete legend.position;
  delete legend.top;
  delete legend.bottom;
  delete legend.left;
  delete legend.right;
  delete legend.orient;
  if (position === "bottom") {
    legend.bottom = 8;
  } else if (position === "left" || position === "right") {
    legend[position] = 8;
    legend.top = "middle";
    legend.orient = "vertical";
  } else {
    legend.top = 8;
  }
  return legend;
}

/** The sole option projection used by the live canvas and every export. */
export function chartRenderOption(source: ChartOption): EChartsOption {
  return {
    ...source,
    legend: positionedLegend(source),
    animationDuration: 220,
    animationDurationUpdate: 180,
  } as EChartsOption;
}

/** Export pins the same projection but disables timing-dependent animation. */
export function chartExportOption(source: ChartOption): EChartsOption {
  return {
    ...chartRenderOption(source),
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
  };
}
