/**
 * `@antv/ava` Advisor 接线（判据 2）。
 *
 * 不自研推荐/检查引擎：只把表格行交给 `Advisor.advise` / `Advisor.lint`，
 * 再把 AVA 的 chart id 映射到本编辑器已经能画的 ECharts 系列类型。
 * 映射不上就说人话，不许静默改成柱状图。
 */
import { Advisor, type Advice, type Lint } from "@antv/ava";
import type {
  ChartDataTable,
  ChartRangeSnapshotV1,
  ChartSeriesType,
} from "./chart-schema";
import {
  chartTableToRowObjects,
  chartTypedArtifactFromRangeSnapshot,
  type ChartTypedArtifact,
} from "./chart-next-artifact";

export interface ChartAvaMapping {
  type: ChartSeriesType;
  stack?: string;
  areaStyle?: Record<string, unknown>;
}

/** AVA CKB id → 本编辑器系列类型。未列出的 id 视为本版画不了。 */
export const AVA_CHART_TO_SERIES: Record<string, ChartAvaMapping> = {
  line_chart: { type: "line" },
  step_line_chart: { type: "line" },
  area_chart: { type: "line", areaStyle: { opacity: 0.18 } },
  stacked_area_chart: {
    type: "line",
    stack: "total",
    areaStyle: { opacity: 0.18 },
  },
  percent_stacked_area_chart: {
    type: "line",
    stack: "total",
    areaStyle: { opacity: 0.18 },
  },
  column_chart: { type: "bar" },
  grouped_column_chart: { type: "bar" },
  stacked_column_chart: { type: "bar", stack: "total" },
  percent_stacked_column_chart: { type: "bar", stack: "total" },
  histogram: { type: "bar" },
  bar_chart: { type: "bar" },
  stacked_bar_chart: { type: "bar", stack: "total" },
  percent_stacked_bar_chart: { type: "bar", stack: "total" },
  grouped_bar_chart: { type: "bar" },
  pie_chart: { type: "pie" },
  donut_chart: { type: "pie" },
  scatter_plot: { type: "scatter" },
  bubble_chart: { type: "scatter" },
  funnel_chart: { type: "funnel" },
  radar_chart: { type: "radar" },
  heatmap: { type: "heatmap" },
  density_heatmap: { type: "heatmap" },
  box_plot: { type: "boxplot" },
  candlestick_chart: { type: "candlestick" },
};

export interface ChartAvaLintNote {
  id: string;
  type: string;
  score: number;
  message: string;
}

export interface ChartAvaAdvice {
  avaType: string;
  score: number;
  mapping: ChartAvaMapping;
  lints: ChartAvaLintNote[];
}

export type ChartAvaAdviseResult =
  | {
      ok: true;
      best: ChartAvaAdvice;
      alternatives: ChartAvaAdvice[];
    }
  | { ok: false; reason: string };

let advisorSingleton: Advisor | null = null;

export function chartAvaAdvisor(): Advisor {
  if (!advisorSingleton) advisorSingleton = new Advisor();
  return advisorSingleton;
}

export function mapAvaChartType(avaType: string): ChartAvaMapping | null {
  return AVA_CHART_TO_SERIES[avaType] || null;
}

export function lintNoteFromAva(lint: Lint): ChartAvaLintNote {
  const docs = lint.docs as { lintText?: unknown } | string | undefined;
  const fromDocs =
    typeof docs === "string"
      ? docs
      : docs && typeof docs === "object" && docs.lintText != null
        ? String(docs.lintText)
        : "";
  return {
    id: String(lint.id || "unknown"),
    type: String(lint.type || ""),
    score: Number(lint.score) || 0,
    message:
      fromDocs.trim() ||
      `图表检查「${String(lint.id || "未知规则")}」未通过。`,
  };
}

function mappedAdvice(entry: Advice): ChartAvaAdvice | null {
  const mapping = mapAvaChartType(String(entry.type || ""));
  if (!mapping) return null;
  return {
    avaType: String(entry.type),
    score: Number(entry.score) || 0,
    mapping,
    lints: (entry.lint || []).map(lintNoteFromAva),
  };
}

export function adviseChartFromTable(table: ChartDataTable): ChartAvaAdviseResult {
  const rows = chartTableToRowObjects(table).filter((row) =>
    Object.values(row).some((cell) => cell !== null && cell !== ""),
  );
  if (rows.length < 1) {
    return { ok: false, reason: "没有可分析的数据行，AVA 没法推荐图型。" };
  }
  let advices: Advice[];
  try {
    advices = chartAvaAdvisor().advise({ data: rows });
  } catch (caught) {
    return {
      ok: false,
      reason:
        caught instanceof Error
          ? `AVA 推荐失败：${caught.message}`
          : "AVA 推荐失败，原因不明。",
    };
  }
  const mapped = (advices || [])
    .map(mappedAdvice)
    .filter((entry): entry is ChartAvaAdvice => Boolean(entry))
    .sort((left, right) => right.score - left.score);
  if (!mapped.length) {
    const raw = (advices || [])
      .map((entry) => entry.type)
      .filter(Boolean)
      .slice(0, 4)
      .join("、");
    return {
      ok: false,
      reason: raw
        ? `AVA 推荐了 ${raw}，这版图表编辑器还画不了这些类型。请改数据，或在工具栏里手动选一种已支持的图。`
        : "AVA 没有给出能画的图型。请检查数据是不是至少有一列分类、一列数值。",
    };
  }
  return { ok: true, best: mapped[0], alternatives: mapped.slice(1, 5) };
}

export function lintChartFromTable(table: ChartDataTable): {
  ok: boolean;
  notes: ChartAvaLintNote[];
  reason?: string;
} {
  const advised = adviseChartFromTable(table);
  if (!advised.ok) return { ok: false, notes: [], reason: advised.reason };
  const spec = (() => {
    try {
      const rows = chartTableToRowObjects(table);
      const result = chartAvaAdvisor().advise({ data: rows })[0];
      return result?.spec ?? null;
    } catch {
      return null;
    }
  })();
  if (!spec) {
    return { ok: true, notes: advised.best.lints };
  }
  try {
    const lints = chartAvaAdvisor().lint({ spec });
    return { ok: true, notes: (lints || []).map(lintNoteFromAva) };
  } catch (caught) {
    return {
      ok: false,
      notes: advised.best.lints,
      reason:
        caught instanceof Error
          ? `AVA 检查失败：${caught.message}`
          : "AVA 检查失败，原因不明。",
    };
  }
}

export function adviseChartTypedArtifact(
  snapshot: ChartRangeSnapshotV1,
  options: { headerRow?: boolean; title?: string } = {},
): ChartAvaAdviseResult & { artifact?: ChartTypedArtifact; type?: ChartSeriesType } {
  const baseline = chartTypedArtifactFromRangeSnapshot(snapshot, options);
  const advised = adviseChartFromTable(baseline.ingest.table);
  if (!advised.ok) return advised;
  const built = chartTypedArtifactFromRangeSnapshot(snapshot, {
    ...options,
    type: advised.best.mapping.type,
  });
  return {
    ...advised,
    artifact: built.artifact,
    type: advised.best.mapping.type,
  };
}
