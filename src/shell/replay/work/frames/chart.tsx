"use client";

// 图表的回放画法（work-chat W13，契约 §8.4）。
// 用图表编辑器现有的渲染口径（chartExportOption：画布与导出共用的那一份 option 投影）画只读图，
// 变化的系列用作者的颜色加粗描边。option 是纯数据（chart-schema 的 assertChartDataOnly 把关），不执行任何脚本；
// 不用 iframe，不用 dangerouslySetInnerHTML。
import { useEffect, useRef } from "react";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";
import { chartExportOption } from "../../../chart-editor/chart-render";
import type { ChartDocumentV1 } from "../../../chart-editor/chart-schema";
import {
  chartChangedSeries,
  chartDescribeChange,
  chartFromRevision,
  chartFromY,
  chartToArtifactJson,
} from "../../../collab/adapters/chart";

function ChartFrame({ snapshot, prev, width, height, authorColor }: ReplayFrameProps) {
  const host = useRef<HTMLDivElement>(null);
  const doc = snapshot as ChartDocumentV1 | null;
  const before = prev && (prev as ChartDocumentV1).option ? (prev as ChartDocumentV1) : null;
  useEffect(() => {
    const node = host.current;
    if (!node || !doc?.option) return;
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    void import("echarts").then((echarts) => {
      if (disposed || !host.current) return;
      chart = echarts.init(host.current, undefined, { renderer: "canvas", width, height });
      const option = chartExportOption(doc.option) as Record<string, unknown>;
      const changed = before ? chartChangedSeries(before, doc) : new Set<string>();
      const color = authorColor || "#6d5dfc";
      if (changed.size && Array.isArray(option.series)) {
        option.series = (option.series as Array<Record<string, unknown>>).map((series) =>
          changed.has(String(series.id))
            ? {
                ...series,
                lineStyle: { ...((series.lineStyle as Record<string, unknown>) || {}), width: 4 },
                itemStyle: { ...((series.itemStyle as Record<string, unknown>) || {}), borderColor: color, borderWidth: 3 },
              }
            : series,
        );
      }
      chart.setOption(option as never, { notMerge: true, lazyUpdate: false });
    });
    return () => {
      disposed = true;
      chart?.dispose();
    };
  }, [doc, before, width, height, authorColor]);
  return <div ref={host} data-replay-chart-frame="" style={{ width, height }} />;
}

const renderer: ReplayFrameRenderer | null = {
  kind: "chart",
  fromY: (doc) => chartFromY(doc),
  fromRevision: (json) => chartFromRevision(json),
  Frame: ChartFrame,
  describeChange: chartDescribeChange,
  toArtifactJson: chartToArtifactJson,
};

export default renderer;
