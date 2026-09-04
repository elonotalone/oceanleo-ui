/**
 * 存量图表：只读打开 + 一键转换（R7）。
 *
 * 已经是 `oceanleo.chart.v1` 且带 option 的，不必转。
 * 只有 HTML / PNG / SVG 渲染产物的，转不成——必须给人话原因，不许从像素反推 option。
 */
import {
  CHART_DOCUMENT_SCHEMA,
  normalizeChartDocument,
  type ChartDocumentV1,
} from "./chart-schema";
import { CHART_SOURCE_REPAIR } from "./chart-source";

export const CHART_LEGACY_READONLY_NOTICE =
  "这份图表只有渲染产物（HTML / PNG / SVG），没有可编辑的 ECharts option 源，现在是只读打开的。";

export const CHART_CONVERT_FAIL_NO_OPTION =
  "无法转换成可编辑图表：文件里没有 ECharts option 和数据，只有画出来的图。请用原来的表格或 CSV 重新制图，不要从图片反推。";

export type ChartConversionState =
  | "editable"
  | "readonly"
  | "converting"
  | "converted"
  | "failed";

export type ChartConversionEvent =
  | { type: "request" }
  | { type: "resolve" }
  | { type: "reject" }
  | { type: "retry" };

export function nextChartConversionState(
  state: ChartConversionState,
  event: ChartConversionEvent,
): ChartConversionState {
  switch (state) {
    case "readonly":
      return event.type === "request" ? "converting" : "readonly";
    case "converting":
      if (event.type === "resolve") return "converted";
      if (event.type === "reject") return "failed";
      return "converting";
    case "failed":
      return event.type === "retry" ? "converting" : "failed";
    case "converted":
    case "editable":
      return state;
    default:
      return state;
  }
}

export type ChartLegacyConversion =
  | { ok: true; document: ChartDocumentV1; summary: string }
  | { ok: false; reason: string };

export function planChartLegacyConversion(input: {
  carrierState: string;
  document?: unknown;
}): ChartLegacyConversion {
  if (input.carrierState === "legacy-render-only") {
    return { ok: false, reason: CHART_CONVERT_FAIL_NO_OPTION };
  }
  if (input.document == null) {
    return {
      ok: false,
      reason: `${CHART_CONVERT_FAIL_NO_OPTION} ${CHART_SOURCE_REPAIR}`,
    };
  }
  try {
    const document = normalizeChartDocument(input.document);
    if (document.schema !== CHART_DOCUMENT_SCHEMA) {
      return {
        ok: false,
        reason: `这份图表的 schema 是 ${String(document.schema)}，不是 ${CHART_DOCUMENT_SCHEMA}，不能当成新核源打开。`,
      };
    }
    if (!document.option?.series?.length) {
      return { ok: false, reason: CHART_CONVERT_FAIL_NO_OPTION };
    }
    return {
      ok: true,
      document,
      summary: "已经是可编辑的 ECharts option 源，不用转换。",
    };
  } catch (caught) {
    return {
      ok: false,
      reason:
        caught instanceof Error
          ? `转换失败：${caught.message}`
          : "转换失败：图表源读不出来。",
    };
  }
}
