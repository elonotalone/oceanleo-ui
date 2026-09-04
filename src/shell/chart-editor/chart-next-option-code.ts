/**
 * L3 专业模式：直接编辑 ECharts option JSON（R4）。
 *
 * 校验走 JSON.parse + 既有 `normalizeChartDocument`（ECharts 认识的 option
 * 形态）。不自研一套 option schema。lint 另走 AVA（`chart-next-ava-advisor`）。
 */
import {
  CHART_DOCUMENT_SCHEMA,
  normalizeChartDocument,
  type ChartDocumentV1,
  type ChartOption,
} from "./chart-schema";

export type ChartOptionJsonParse =
  | { ok: true; document: ChartDocumentV1; option: ChartOption }
  | { ok: false; reason: string };

export function chartOptionJsonFromDocument(document: ChartDocumentV1): string {
  return `${JSON.stringify(document.option, null, 2)}\n`;
}

export function parseChartOptionJson(
  text: string,
  current?: ChartDocumentV1,
): ChartOptionJsonParse {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return { ok: false, reason: "代码是空的。请贴一段 ECharts option JSON。" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return {
      ok: false,
      reason: `这段不是合法 JSON（${message}）。请检查逗号、引号和括号。`,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: "ECharts option 必须是一个 JSON 对象，不能是数组或字符串。",
    };
  }
  const root = parsed as Record<string, unknown>;
  const option = (root.option && typeof root.option === "object"
    ? root.option
    : parsed) as ChartOption;
  try {
    const document = normalizeChartDocument({
      schema: CHART_DOCUMENT_SCHEMA,
      ...(current
        ? {
            dataset: current.dataset,
            title: current.title,
            indicators: current.indicators,
            narrative: current.narrative,
            attribution: current.attribution,
          }
        : {}),
      option,
    });
    if (!document.option.series.length) {
      return { ok: false, reason: "option 里没有 series，ECharts 画不出任何一条线。" };
    }
    return { ok: true, document, option: document.option };
  } catch (caught) {
    return {
      ok: false,
      reason:
        caught instanceof Error
          ? `option 校验失败：${caught.message}`
          : "option 校验失败。",
    };
  }
}
