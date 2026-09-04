/**
 * `@antv/ava` Advisor 接线（判据 2）。
 *
 * 不自研推荐/检查引擎：只把表格行交给 `Advisor.advise` / `Advisor.lint`，
 * 再把 AVA 的 chart id 映射到本编辑器已经能画的 ECharts 系列类型。
 * 映射不上就说人话，不许静默改成柱状图。
 * `percent_stacked_*` 要真画占比（数据归一成 0–100，轴标 %），
 * 不许改写成和旁边 `stacked_*` 一样的绝对值堆叠还报「已按推荐画」。
 */
import { Advisor, type Advice, type Lint } from "@antv/ava";
import {
  chartYAxes,
  chartYAxisCount,
  patchChartAxis,
  patchChartSeries,
  type ChartDataTable,
  type ChartDatum,
  type ChartDocumentV1,
  type ChartRangeSnapshotV1,
  type ChartSeries,
  type ChartSeriesType,
} from "./chart-schema";
import {
  chartTableToRowObjects,
  chartTypedArtifactFromDocument,
  chartTypedArtifactFromRangeSnapshot,
  type ChartTypedArtifact,
} from "./chart-next-artifact";

export interface ChartAvaMapping {
  type: ChartSeriesType;
  stack?: string;
  areaStyle?: Record<string, unknown>;
  /** 为 true 时：系列归一成占比，数值轴锁 0–100% 并带 % 标签。 */
  percentStack?: boolean;
}

export type ChartAvaApplyResult =
  | { ok: true; document: ChartDocumentV1 }
  | { ok: false; reason: string };

/** 负数没法当「占多少」；拒绝时不许改图。 */
export const CHART_PERCENT_STACK_NEGATIVE_REASON =
  "数据里有负数，没法按占比堆叠（占比不能是负的），所以没有替你改图。";

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
    percentStack: true,
  },
  column_chart: { type: "bar" },
  grouped_column_chart: { type: "bar" },
  stacked_column_chart: { type: "bar", stack: "total" },
  percent_stacked_column_chart: {
    type: "bar",
    stack: "total",
    percentStack: true,
  },
  histogram: { type: "bar" },
  bar_chart: { type: "bar" },
  stacked_bar_chart: { type: "bar", stack: "total" },
  percent_stacked_bar_chart: {
    type: "bar",
    stack: "total",
    percentStack: true,
  },
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

function seriesScalar(datum: ChartDatum): number {
  if (typeof datum === "number") {
    return Number.isFinite(datum) ? datum : 0;
  }
  if (Array.isArray(datum)) {
    const last = datum[datum.length - 1];
    return typeof last === "number" && Number.isFinite(last) ? last : 0;
  }
  const raw = datum.value;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  const last = raw[raw.length - 1];
  return typeof last === "number" && Number.isFinite(last) ? last : 0;
}

function replaceSeriesScalar(datum: ChartDatum, nextValue: number): ChartDatum {
  if (typeof datum === "number") return nextValue;
  if (Array.isArray(datum)) {
    if (datum.length === 0) return [nextValue];
    return [...datum.slice(0, -1), nextValue];
  }
  if (Array.isArray(datum.value)) {
    const vector = datum.value;
    const nextVector =
      vector.length === 0 ? [nextValue] : [...vector.slice(0, -1), nextValue];
    return { ...datum, value: nextVector };
  }
  return { ...datum, value: nextValue };
}

function sharesFromNonNegative(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return values.map(() => 0);
  const shares = values.map((value) => (value / total) * 100);
  const drift = 100 - shares.reduce((sum, value) => sum + value, 0);
  const lastIndex = shares.length - 1;
  const lastShare = shares[lastIndex];
  if (lastShare !== undefined) shares[lastIndex] = lastShare + drift;
  return shares;
}

function percentStackSeriesData(
  seriesList: ChartSeries[],
): { ok: true; data: ChartDatum[][] } | { ok: false; reason: string } {
  const width = seriesList.reduce(
    (max, series) => Math.max(max, series.data.length),
    0,
  );
  const columns: number[][] = seriesList.map((series) =>
    Array.from({ length: width }, (_, index) => {
      const datum = series.data[index];
      return datum === undefined ? 0 : seriesScalar(datum);
    }),
  );
  for (const row of columns) {
    for (const value of row) {
      if (value < 0) {
        return { ok: false, reason: CHART_PERCENT_STACK_NEGATIVE_REASON };
      }
    }
  }
  const data: ChartDatum[][] = seriesList.map((series, seriesIndex) =>
    Array.from({ length: width }, (_, categoryIndex) => {
      const values = columns.map((column) => column[categoryIndex] ?? 0);
      const shares = sharesFromNonNegative(values);
      const original = series.data[categoryIndex];
      const share = shares[seriesIndex] ?? 0;
      return original === undefined
        ? share
        : replaceSeriesScalar(original, share);
    }),
  );
  return { ok: true, data };
}

function patchValueAxesAsPercent(document: ChartDocumentV1): ChartDocumentV1 {
  let next = document;
  if (next.option.xAxis.type === "value") {
    next = patchChartAxis(next, "x", {
      min: 0,
      max: 100,
      axisLabel: {
        ...next.option.xAxis.axisLabel,
        formatter: "{value}%",
      },
    });
  }
  const count = chartYAxisCount(next.option);
  for (let index = 0; index < count; index += 1) {
    const axis = chartYAxes(next.option)[index];
    if (!axis || axis.type !== "value") continue;
    next = patchChartAxis(
      next,
      "y",
      {
        min: 0,
        max: 100,
        axisLabel: {
          ...axis.axisLabel,
          formatter: "{value}%",
        },
      },
      index,
    );
  }
  return next;
}

function seriesPatchFromMapping(
  mapping: ChartAvaMapping,
): Pick<ChartSeries, "type" | "stack" | "areaStyle"> {
  return {
    type: mapping.type,
    stack: mapping.percentStack ? mapping.stack || "total" : mapping.stack,
    areaStyle: mapping.areaStyle,
  };
}

/**
 * 把 AVA 映射落到文档上。百分比堆叠会改数据和轴；做不到就用人话拒绝、不改图。
 */
export function applyAvaMappingToChartDocument(
  document: ChartDocumentV1,
  mapping: ChartAvaMapping,
): ChartAvaApplyResult {
  const ids = document.option.series.map((series) => series.id);
  if (mapping.percentStack) {
    const prepared = percentStackSeriesData(document.option.series);
    if (!prepared.ok) return prepared;
    let next = document;
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const data = prepared.data[index];
      if (id === undefined || data === undefined) continue;
      next = patchChartSeries(next, id, {
        ...seriesPatchFromMapping(mapping),
        data,
      });
    }
    return { ok: true, document: patchValueAxesAsPercent(next) };
  }
  let next = document;
  for (const id of ids) {
    next = patchChartSeries(next, id, seriesPatchFromMapping(mapping));
  }
  return { ok: true, document: next };
}

export function applyAvaAdviceToChartDocument(
  document: ChartDocumentV1,
  advised: ChartAvaAdviseResult,
): ChartAvaApplyResult {
  if (!advised.ok) return advised;
  return applyAvaMappingToChartDocument(document, advised.best.mapping);
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
  const applied = applyAvaMappingToChartDocument(
    baseline.document,
    advised.best.mapping,
  );
  if (!applied.ok) return applied;
  return {
    ...advised,
    artifact: chartTypedArtifactFromDocument(applied.document),
    type: advised.best.mapping.type,
  };
}
