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

/** Render a static PNG from the same option projection used by the live chart. */
export async function renderChartPreviewBlob(
  source: ChartOption,
): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("当前环境无法渲染 chart preview");
  }
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1200px;height:675px;pointer-events:none";
  document.body.appendChild(host);
  let chart: import("echarts").ECharts | null = null;
  try {
    const echarts = await import("echarts");
    chart = echarts.init(host, undefined, {
      renderer: "canvas",
      width: 1200,
      height: 675,
    });
    chart.setOption(chartExportOption(source), {
      notMerge: true,
      lazyUpdate: false,
    });
    const response = await fetch(
      chart.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      }),
    );
    const blob = await response.blob();
    if (!blob.size) throw new Error("chart preview 渲染为空");
    return blob;
  } finally {
    chart?.dispose();
    host.remove();
  }
}
