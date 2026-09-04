/**
 * 图表 typed artifact（判据 1）：ECharts option + 数据。
 *
 * rendition（HTML / SVG / PNG）只是画出来的样子，可以嵌进 PPT / 文档 / 网站；
 * 可编辑源永远是 option + data。把 HTML 当源打开会走进
 * `legacy-render-only`，那是故意的（chart.md §1.2）。
 *
 * 表格选区一键成图：本文件是图表侧入口。grid 侧不许 import 本目录；
 * 跨面的接线在 `signals/W12-request.md`。
 */
import {
  CHART_CREATE_FROM_RANGE_COMMAND,
  CHART_DOCUMENT_SCHEMA,
  CHART_RANGE_SNAPSHOT_SCHEMA,
  chartDataTable,
  chartDocumentFromRangeSnapshot,
  normalizeChartDocument,
  type ChartDataTable,
  type ChartDataset,
  type ChartDocumentV1,
  type ChartOption,
  type ChartRangeIngest,
  type ChartSeriesType,
} from "./chart-schema";

export const CHART_TYPED_ARTIFACT_SCHEMA = "oceanleo.chart.artifact.v1" as const;

export type ChartRenditionKind = "html" | "svg" | "png";

export const CHART_RENDITION_MIME: Record<ChartRenditionKind, string> = {
  html: "text/html;charset=utf-8",
  svg: "image/svg+xml;charset=utf-8",
  png: "image/png",
};

export interface ChartTypedArtifact {
  schema: typeof CHART_TYPED_ARTIFACT_SCHEMA;
  option: ChartOption;
  data: ChartDataset;
}

export function chartDatasetFromTable(table: ChartDataTable): ChartDataset {
  const header = (table[0] || []).map((cell, index) => String(cell || `维度 ${index + 1}`));
  const source = table.map((row) =>
    row.map((cell) => (cell === "" || cell == null ? null : cell)),
  );
  return {
    dimensions: header.map((name, index) => ({
      name,
      type: index === 0 ? "ordinal" : "number",
    })),
    source,
  };
}

export function chartTypedArtifactFromDocument(
  document: ChartDocumentV1,
): ChartTypedArtifact {
  const normalized = normalizeChartDocument(document);
  return {
    schema: CHART_TYPED_ARTIFACT_SCHEMA,
    option: normalized.option,
    data: normalized.dataset || chartDatasetFromTable(chartDataTable(normalized)),
  };
}

export function chartDocumentFromTypedArtifact(
  value: unknown,
): ChartDocumentV1 {
  const artifact = normalizeChartTypedArtifact(value);
  return normalizeChartDocument({
    schema: CHART_DOCUMENT_SCHEMA,
    dataset: artifact.data,
    option: artifact.option,
  });
}

export function normalizeChartTypedArtifact(value: unknown): ChartTypedArtifact {
  if (!value || typeof value !== "object") {
    throw new Error("图表成品必须是一个对象（option + 数据）。");
  }
  const root = value as Record<string, unknown>;
  if (root.schema !== CHART_TYPED_ARTIFACT_SCHEMA) {
    throw new Error(
      `图表成品的 schema 必须是 ${CHART_TYPED_ARTIFACT_SCHEMA}，收到 ${String(root.schema || "缺失")}。`,
    );
  }
  if (!root.option || typeof root.option !== "object") {
    throw new Error("图表成品缺少 ECharts option，没法编辑也没法重画。");
  }
  const document = normalizeChartDocument({
    schema: CHART_DOCUMENT_SCHEMA,
    option: root.option,
    ...(root.data && typeof root.data === "object" ? { dataset: root.data } : {}),
  });
  return chartTypedArtifactFromDocument(document);
}

/**
 * 表格选区 → typed artifact。推荐可被 `type` 覆盖（与既有
 * `chartDocumentFromRangeSnapshot` 同一条规则，不改那份闸的意图）。
 */
export function chartTypedArtifactFromRangeSnapshot(
  value: unknown,
  options: { type?: ChartSeriesType; headerRow?: boolean; title?: string } = {},
): {
  artifact: ChartTypedArtifact;
  document: ChartDocumentV1;
  ingest: ChartRangeIngest;
} {
  const { document, ingest } = chartDocumentFromRangeSnapshot(value, options);
  return {
    artifact: chartTypedArtifactFromDocument(document),
    document,
    ingest,
  };
}

/** 给 PPT / 文档 / 网站嵌的 HTML 片段：JSON 源 + 可选 SVG。 */
export function wrapChartArtifactHtml(
  artifact: ChartTypedArtifact,
  innerMarkup = "",
): string {
  const json = JSON.stringify(artifact).replace(/</g, "\\u003c");
  return (
    `<figure data-oceanleo-chart="${CHART_TYPED_ARTIFACT_SCHEMA}" data-rendition="html">` +
    `<script type="application/json">${json}</script>` +
    innerMarkup +
    `</figure>`
  );
}

export function chartTableToRowObjects(
  table: ChartDataTable,
): Array<Record<string, string | number | null>> {
  const header = (table[0] || []).map((cell, index) =>
    String(cell || `col_${index}`),
  );
  return table.slice(1).map((row) => {
    const record: Record<string, string | number | null> = {};
    header.forEach((name, index) => {
      const cell = row[index];
      record[name] = cell === "" || cell == null ? null : cell;
    });
    return record;
  });
}

export {
  CHART_CREATE_FROM_RANGE_COMMAND,
  CHART_RANGE_SNAPSHOT_SCHEMA,
};
