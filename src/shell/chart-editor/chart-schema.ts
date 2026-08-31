export const CHART_DOCUMENT_SCHEMA = "oceanleo.chart.v1" as const;
export const CHART_SOURCE_MAX_BYTES = 2_000_000;
export const CHART_SOURCE_MAX_DEPTH = 32;
export const CHART_SOURCE_MAX_NODES = 25_000;

export type ChartStructuredSourceKind = "canonical" | "manifest-option";

export type ChartSeriesType =
  | "bar"
  | "line"
  | "pie"
  | "gauge"
  | "scatter"
  | "radar"
  | "funnel"
  | "heatmap"
  | "boxplot"
  | "candlestick";
export type ChartDatum =
  | number
  | number[]
  | ({
      name: string;
      value: number | number[];
    } & Record<string, unknown>);

export interface ChartAxis {
  [key: string]: unknown;
  type: "category" | "value";
  name: string;
  show: boolean;
  data: string[];
  min?: number;
  max?: number;
  interval?: number;
  axisTick: { show: boolean } & Record<string, unknown>;
  axisLabel: {
    show: boolean;
    rotate: number;
    color?: string;
  } & Record<string, unknown>;
  splitLine: {
    show: boolean;
    lineStyle: { color?: string } & Record<string, unknown>;
  } & Record<string, unknown>;
}

/** ECharts `markLine` / `markArea` 的一条标注。`type` 是统计线,`yAxis` 是常量阈值线。 */
export interface ChartMarkPoint {
  [key: string]: unknown;
  name?: string;
  type?: "average" | "min" | "max" | "median";
  yAxis?: number;
  xAxis?: number | string;
}

/** §P5 标注层。`markArea.data` 的每一项是「起点 / 终点」两点一对。 */
export interface ChartMarkLine {
  [key: string]: unknown;
  silent: boolean;
  data: ChartMarkPoint[];
}

export interface ChartMarkArea {
  [key: string]: unknown;
  silent: boolean;
  data: Array<[ChartMarkPoint, ChartMarkPoint]>;
}

export interface ChartSeries {
  [key: string]: unknown;
  id: string;
  name: string;
  type: ChartSeriesType;
  data: ChartDatum[];
  color?: string;
  label: { show: boolean } & Record<string, unknown>;
  /**
   * 系列绑定到第几条 y 轴(0 = 主轴)。单轴文档里恒为 0 且不落字段,
   * 因此旧文档的字节不因本字段而改变。
   */
  yAxisIndex?: number;
  /** 同名 `stack` 的系列在 ECharts 里堆叠。空串等于不堆叠,这里一律省略。 */
  stack?: string;
  /** `line` + `areaStyle` = 面积图。`bar` 上无意义,归一化时会剔除。 */
  areaStyle?: Record<string, unknown>;
  markLine?: ChartMarkLine;
  markArea?: ChartMarkArea;
}

export interface ChartOption {
  [key: string]: unknown;
  title: { text: string } & Record<string, unknown>;
  color: string[];
  legend: {
    show: boolean;
    position: "top" | "bottom" | "left" | "right";
  } & Record<string, unknown>;
  tooltip: {
    show: boolean;
    trigger: "item" | "axis";
    backgroundColor?: string;
    borderColor?: string;
    borderWidth: number;
    formatter: string;
    textStyle: {
      color?: string;
      fontSize: number;
    } & Record<string, unknown>;
  } & Record<string, unknown>;
  xAxis: ChartAxis;
  /**
   * 单轴文档是一个对象,双轴文档是一个长度 2 的数组 —— 两种形态都是 ECharts
   * 原生接受的写法。**形态被原样保留**:单对象进来还是单对象出去,所以库内
   * 既有文档过一遍归一化后字节不变(无损升级的机器定义,见 `chartYAxes`)。
   */
  yAxis: ChartAxis | ChartAxis[];
  series: ChartSeries[];
}

/** chart.md §3.1 `dataset.dimensions[]`。 */
export interface ChartDatasetDimension {
  name: string;
  type: "ordinal" | "number" | "time";
  unit?: string;
}

/** chart.md §3.1 `dataset`。 */
export interface ChartDataset {
  dimensions: ChartDatasetDimension[];
  source: Array<Array<string | number | null>>;
}

/** chart.md §3.1 `indicators[]`。 */
export interface ChartIndicator {
  key: string;
  label: string;
  unit?: string;
  precision?: number;
}

/** chart.md §3.1 `narrative`。 */
export interface ChartNarrative {
  takeaway?: string;
  method?: string;
  caveat?: string;
}

/** chart.md §3.1 `attribution.entries[]`(三字段齐全,URL 必须 https)。 */
export interface ChartAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
}

/** chart.md §3.1 `attribution`。 */
export interface ChartAttribution {
  entries: ChartAttributionEntry[];
}

/**
 * 编辑器工作模型。契约 §3.1 的八个顶层字段这里全部存在,但除 `schema` /
 * `option` 外都是可选:库内 88 份既有 native chart 只有 `schema` + `option`,
 * 载入它们 MUST NOT 失败。新产出的合规判定走 `validateChartProjectV1`,
 * 它按 §3.1 把 `version` / `title` / `dataset` / `indicators` / `attribution`
 * 一律要求齐全。
 */
export interface ChartDocumentV1 {
  [key: string]: unknown;
  schema: typeof CHART_DOCUMENT_SCHEMA;
  version?: 1;
  title?: string;
  editor?: string;
  category?: string;
  effect?: string;
  dataset?: ChartDataset;
  option: ChartOption;
  indicators?: ChartIndicator[];
  narrative?: ChartNarrative;
  attribution?: ChartAttribution;
}

/** §3.1 的严格形态:`required` 五项齐全,是 `editability = native` 的落库门槛。 */
export interface ChartProjectV1 extends ChartDocumentV1 {
  version: 1;
  title: string;
  dataset: ChartDataset;
  indicators: ChartIndicator[];
  attribution: ChartAttribution;
}

export type ChartDataTable = Array<Array<string | number>>;

/**
 * chart.md §2.1 序列色序前 8 位。取值是契约本身(位次 2 已由契约从 `#D9822B`
 * 订正到 `#C47323`,因为前者对白底只有 2.93:1),与 deck `a:accent*`、
 * geo-map `map.accent.*`、vector `vec.accent.*` 逐字对齐,MUST NOT 为观感改值。
 */
export const CHART_SERIES_PALETTE = [
  "#1F6FEB",
  "#C47323",
  "#2E8B6F",
  "#8E5BA6",
  "#CF222E",
  "#57606A",
  "#0A7EA4",
  "#B45309",
] as const;

const DEFAULT_COLORS: string[] = [...CHART_SERIES_PALETTE];
/**
 * 编辑器**载入闸**认的全部图型。契约 §3.1 的 C10 八种(`CHART_SPEC_SERIES_TYPES`)
 * 全在内,另加 `gauge` / `funnel` 两种历史图型 —— 见 `CHART_EDITOR_ONLY_SERIES_TYPES`
 * 对这两种为何不能落库的说明。
 */
export const CHART_EDITOR_SERIES_TYPES = [
  "bar",
  "line",
  "pie",
  "gauge",
  "scatter",
  "radar",
  "funnel",
  "heatmap",
  "boxplot",
  "candlestick",
] as const;

/**
 * 编辑器能画、但 §3.1 的 C10 枚举不收,因而 `validateChartProjectV1` 会判不合规
 * 的图型。工具栏必须把这件事讲给用户听,不能等到保存时才报一句 enum 错误。
 * 收窄承诺而不是偷改契约:C10 = 8 是 chart.md 的数值常量,不由编辑器改。
 */
export const CHART_EDITOR_ONLY_SERIES_TYPES = ["gauge", "funnel"] as const;

const SERIES_TYPES = new Set<ChartSeriesType>(CHART_EDITOR_SERIES_TYPES);
/** 系列绑定到的 y 轴条数上限。双轴是财务报表刚需,三轴以上读不出来。 */
export const CHART_MAX_Y_AXES = 2;
export const CHART_MAX_SERIES = 20;
export const CHART_MAX_POINTS = 500;
export const CHART_MAX_DIMENSIONS = 32;

/** chart.md §2.2 版面(px)。`option.grid` 的默认留白直接取这四个值。 */
export const CHART_LAYOUT = {
  canvasWidth: 960,
  canvasHeight: 540,
  gridLeft: 64,
  gridRight: 32,
  gridTop: 56,
  gridBottom: 56,
  legendHeight: 28,
  axisLineWidth: 1,
  splitLineWidth: 1,
  lineWidth: 2,
  symbolRadius: 4,
} as const;

/** chart.md §2.3 字号档(px)。 */
export const CHART_FONT_SCALE = {
  title: 18,
  subtitle: 13,
  axis: 12,
  legend: 12,
  label: 11,
  caption: 10,
} as const;

/**
 * chart.md §4 数值常量表 C1–C35。这里只收录能在编辑器/校验侧机检的条目;
 * C28(渲染墙钟)、C29/C30(抓帧)、C31(封面边长)、C32/C33(库内存量)、
 * C34/C35(Jaccard)由抓帧与 catalog 侧承担,见 marker 的 §9 对账表。
 */
export const CHART_SPEC_CONSTANTS = {
  C1_minSeries: 1,
  C2_maxSeries: 12,
  C3_minIndicators: 3,
  C4_maxIndicators: 24,
  C5_minDataPoints: 6,
  C6_maxDataPoints: 5_000,
  C7_minDatasetRows: 3,
  C8_maxDatasetRows: 5_000,
  C9_minDimensions: 2,
  C9_maxDimensions: 24,
  C10_seriesTypeCount: 8,
  C11_symbolCount: 7,
  C12_paletteLength: 8,
  C14_colorOnlyThreshold: 3,
  C23_minTitleTextLength: 4,
  C24_minTakeawayLength: 8,
  C25_maxPrecision: 8,
  C26_minSourceBytes: 4_096,
  C27_maxSourceBytes: 4_194_304,
  C29_minFrameColors: 12,
  C30_frameWidth: 960,
  C30_frameHeight: 540,
} as const;

/** chart.md §3.1 `option.series[].type` 枚举(C10 = 8 种)。 */
export const CHART_SPEC_SERIES_TYPES = [
  "line",
  "bar",
  "pie",
  "scatter",
  "radar",
  "heatmap",
  "boxplot",
  "candlestick",
] as const;

/**
 * 这种图型能不能落库。`gauge` / `funnel` 编辑器画得出来但 C10 枚举不收,
 * 工具栏据此在选项上直说,免得用户做完一张漏斗图才在保存时撞一句 enum 报错。
 */
export function chartSeriesTypePublishable(type: string): boolean {
  return (CHART_SPEC_SERIES_TYPES as readonly string[]).includes(type);
}

/** chart.md §3.1 `option.series[].symbol` 枚举(C11 = 7 种)。 */
export const CHART_SPEC_SYMBOLS = [
  "circle",
  "rect",
  "triangle",
  "diamond",
  "pin",
  "arrow",
  "none",
] as const;

/** chart.md §3.1 `dataset.dimensions[].type` 枚举。 */
export const CHART_DIMENSION_TYPES = ["ordinal", "number", "time"] as const;

const FORBIDDEN_OPTION_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "renderitem",
]);
const textEncoder = new TextEncoder();

function unsafeOptionString(
  value: string,
  key: string,
  httpsAllowed = false,
): boolean {
  const trimmed = value.trim();
  const resourceField =
    !httpsAllowed &&
    (/(?:url|uri|href|link|src|image)$/i.test(key) ||
      key.toLowerCase() === "symbol");
  if (
    /^(?:javascript|vbscript|file|blob):/i.test(trimmed) ||
    /^data:(?:text\/html|application\/(?:xhtml\+xml|javascript)|image\/svg\+xml)/i.test(
      trimmed,
    ) ||
    /^image:\/\/\s*(?:javascript|vbscript|file|data:(?:text\/html|image\/svg\+xml))/i.test(
      trimmed,
    ) ||
    /url\(\s*['"]?\s*(?:javascript|vbscript|file|blob|https?):/i.test(trimmed) ||
    (resourceField &&
      /^(?:https?:|\/\/|image:\/\/\s*(?:https?:|\/\/))/i.test(trimmed))
  ) {
    return true;
  }
  return (
    key.toLowerCase().endsWith("formatter") &&
    /<\s*\/?\s*[a-z][^>]*>/i.test(value)
  );
}

function assertChartDataOnly(
  value: unknown,
  options: { allowUndefined?: boolean } = {},
): void {
  let nodes = 0;
  const ancestors = new Set<object>();
  // `attribution[].licenseUrl` is contract-mandated to be an `https://` URL
  // (§3.1) and is never handed to ECharts, so the option-only ban on remote
  // resource references would otherwise make a conforming document unsavable.
  const visit = (
    entry: unknown,
    depth: number,
    key = "",
    inAttribution = false,
  ): void => {
    nodes += 1;
    if (nodes > CHART_SOURCE_MAX_NODES) {
      throw new Error(
        `chart option exceeds ${CHART_SOURCE_MAX_NODES} data nodes`,
      );
    }
    if (depth > CHART_SOURCE_MAX_DEPTH) {
      throw new Error(
        `chart option exceeds ${CHART_SOURCE_MAX_DEPTH} nesting levels`,
      );
    }
    if (
      entry === null ||
      typeof entry === "boolean" ||
      typeof entry === "number"
    ) {
      if (typeof entry === "number" && !Number.isFinite(entry)) {
        throw new Error("chart option contains a non-finite number");
      }
      return;
    }
    if (typeof entry === "string") {
      if (
        unsafeOptionString(entry, key, inAttribution && key === "licenseUrl")
      ) {
        throw new Error(`chart option contains unsafe executable content at ${key}`);
      }
      return;
    }
    if (entry === undefined && options.allowUndefined) return;
    if (typeof entry !== "object") {
      throw new Error("chart option must contain JSON data only");
    }
    if (ancestors.has(entry)) {
      throw new Error("chart option contains a circular reference");
    }
    const prototype = Object.getPrototypeOf(entry);
    if (
      !Array.isArray(entry) &&
      prototype !== Object.prototype &&
      prototype !== null
    ) {
      throw new Error("chart option must contain plain JSON objects only");
    }
    ancestors.add(entry);
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    if (Object.getOwnPropertySymbols(entry).length > 0) {
      throw new Error("chart option contains symbol-keyed data");
    }
    if (Array.isArray(entry)) {
      const elementKeys = Object.keys(descriptors).filter(
        (childKey) => childKey !== "length",
      );
      if (
        entry.length > CHART_SOURCE_MAX_NODES ||
        elementKeys.length !== entry.length ||
        elementKeys.some(
          (childKey) =>
            !/^(?:0|[1-9]\d*)$/.test(childKey) ||
            Number(childKey) >= entry.length,
        )
      ) {
        throw new Error("chart option arrays must be dense JSON arrays");
      }
    }
    for (const [childKey, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(entry) && childKey === "length") continue;
      if (descriptor.get || descriptor.set) {
        throw new Error(`chart option contains an accessor at ${childKey}`);
      }
      if (
        FORBIDDEN_OPTION_KEYS.has(childKey.toLowerCase()) ||
        /^on(?:click|load|error|mouse|key|touch|pointer|focus|blur|submit)/i.test(
          childKey,
        )
      ) {
        throw new Error(`chart option contains forbidden key: ${childKey}`);
      }
      visit(
        descriptor.value,
        depth + 1,
        childKey,
        inAttribution || (depth === 0 && childKey === "attribution"),
      );
    }
    ancestors.delete(entry);
  };
  visit(value, 0);
}

function chartValueByteLength(value: unknown): number {
  const encoded = JSON.stringify(value);
  if (typeof encoded !== "string") {
    throw new Error("chart option must be serializable JSON data");
  }
  return textEncoder.encode(encoded).byteLength;
}

function assertChartSourceSize(value: unknown): void {
  if (chartValueByteLength(value) > CHART_SOURCE_MAX_BYTES) {
    throw new Error("chart source exceeds the 2MB safety limit");
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, fallback = "", max = 160): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max)
    : fallback;
}

function colorValue(value: unknown): string {
  const color = boundedText(value, "", 40);
  return /^(?:#[0-9a-f]{3,8}|rgb(?:a)?\([0-9.,%\s]+\)|hsl(?:a)?\([0-9.,%\s]+\))$/i.test(
    color,
  )
    ? color
    : "";
}

function finiteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function optionalFinite(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function safeId(value: unknown, fallback: string): string {
  const id = boundedText(value, "", 80)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || fallback;
}

function firstRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]) || {};
  return asRecord(value) || {};
}

function normalizeAxis(
  value: unknown,
  fallbackType: ChartAxis["type"],
): ChartAxis {
  const axis = firstRecord(value);
  const rawData = Array.isArray(axis.data) ? axis.data : [];
  if (rawData.length > CHART_MAX_POINTS) {
    throw new Error(`chart axis exceeds ${CHART_MAX_POINTS} data points`);
  }
  const axisTick = asRecord(axis.axisTick) || {};
  const axisLabel = asRecord(axis.axisLabel) || {};
  const splitLine = asRecord(axis.splitLine) || {};
  const splitLineStyle = asRecord(splitLine.lineStyle) || {};
  const min = optionalFinite(axis.min);
  const max = optionalFinite(axis.max);
  const interval = optionalFinite(axis.interval);
  return {
    ...axis,
    type: axis.type === "category" || axis.type === "value"
      ? axis.type
      : fallbackType,
    name: boundedText(axis.name),
    show: axis.show !== false,
    data: rawData.map((entry) => boundedText(entry, String(entry), 120)),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(interval !== undefined && interval > 0 ? { interval } : {}),
    axisTick: { ...axisTick, show: axisTick.show !== false },
    axisLabel: {
      ...axisLabel,
      show: axisLabel.show !== false,
      rotate: Math.max(-90, Math.min(90, finiteNumber(axisLabel.rotate))),
      ...(colorValue(axisLabel.color)
        ? { color: colorValue(axisLabel.color) }
        : {}),
    },
    splitLine: {
      ...splitLine,
      show: splitLine.show !== false,
      lineStyle: {
        ...splitLineStyle,
        ...(colorValue(splitLineStyle.color)
          ? { color: colorValue(splitLineStyle.color) }
          : {}),
      },
    },
  };
}

/**
 * y 轴既可以是单对象也可以是数组。**形态原样保留**是这里唯一重要的规则:
 * 把单对象升成 `[axis]` 会改掉库内每一份既有图表的字节,
 * 把数组压回单对象会静默丢掉第二条轴(这正是本轮之前 `firstRecord` 的行为)。
 */
function normalizeAxisSlot(
  value: unknown,
  fallbackType: ChartAxis["type"],
): ChartAxis | ChartAxis[] {
  if (!Array.isArray(value)) return normalizeAxis(value, fallbackType);
  if (!value.length) return normalizeAxis(undefined, fallbackType);
  if (value.length > CHART_MAX_Y_AXES) {
    throw new Error(`chart supports at most ${CHART_MAX_Y_AXES} y axes`);
  }
  return value.map((entry, index) =>
    normalizeAxis(
      // 第二条轴默认画在右侧,否则两条轴会重叠在左边,谁也读不出来。
      index > 0 && asRecord(entry)?.position === undefined
        ? { ...(asRecord(entry) || {}), position: "right" }
        : entry,
      fallbackType,
    ),
  );
}

/** 无论文档是单对象还是数组形态,都拿到一个至少一条的 y 轴列表。 */
export function chartYAxes(option: ChartOption): ChartAxis[] {
  return Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis];
}

/** 当前文档绑了几条 y 轴。单对象形态恒为 1。 */
export function chartYAxisCount(option: ChartOption): number {
  return chartYAxes(option).length;
}

function normalizeVector(value: unknown[]): number[] {
  if (value.length > CHART_MAX_DIMENSIONS) {
    throw new Error(
      `chart data vector exceeds ${CHART_MAX_DIMENSIONS} dimensions`,
    );
  }
  return value.map(finiteNumber);
}

function normalizeDatum(value: unknown, index: number): ChartDatum {
  if (Array.isArray(value)) return normalizeVector(value);
  const record = asRecord(value);
  if (record) {
    const rawValue = record.value;
    return {
      ...record,
      name: boundedText(record.name, `数据 ${index + 1}`, 120),
      value: Array.isArray(rawValue)
        ? normalizeVector(rawValue)
        : finiteNumber(rawValue),
    };
  }
  return finiteNumber(value);
}

const MARK_STAT_TYPES = new Set(["average", "min", "max", "median"]);
/** 一条系列上最多几条标注线 / 几段高亮区。再多就不是「说明观点」而是噪声。 */
export const CHART_MAX_MARKS = 8;

function normalizeMarkPoint(value: unknown): ChartMarkPoint | null {
  const point = asRecord(value);
  if (!point) return null;
  const statType = boundedText(point.type, "", 16);
  const yAxis = optionalFinite(point.yAxis);
  const xAxis =
    typeof point.xAxis === "number"
      ? optionalFinite(point.xAxis)
      : point.xAxis === undefined
        ? undefined
        : boundedText(point.xAxis, "", 120);
  // 一条标注要么锚在统计量上,要么锚在一个具体坐标上。两者都没有 = 画不出来,
  // ECharts 会静默忽略它,这正是最难查的一类「设置了却没生效」。
  if (!MARK_STAT_TYPES.has(statType) && yAxis === undefined && xAxis === undefined) {
    return null;
  }
  const label = asRecord(point.label);
  return {
    ...point,
    ...(boundedText(point.name, "", 80)
      ? { name: boundedText(point.name, "", 80) }
      : {}),
    ...(MARK_STAT_TYPES.has(statType)
      ? { type: statType as ChartMarkPoint["type"] }
      : {}),
    ...(yAxis !== undefined ? { yAxis } : {}),
    ...(xAxis !== undefined ? { xAxis } : {}),
    ...(label
      ? { label: { ...label, show: label.show !== false } }
      : {}),
  };
}

function normalizeMarkLine(value: unknown): ChartMarkLine | undefined {
  const markLine = asRecord(value);
  if (!markLine) return undefined;
  const raw = Array.isArray(markLine.data) ? markLine.data : [];
  if (raw.length > CHART_MAX_MARKS) {
    throw new Error(`chart series declares more than ${CHART_MAX_MARKS} mark lines`);
  }
  const data = raw
    .map(normalizeMarkPoint)
    .filter((entry): entry is ChartMarkPoint => entry !== null);
  if (!data.length) return undefined;
  return { ...markLine, silent: markLine.silent !== false, data };
}

function normalizeMarkArea(value: unknown): ChartMarkArea | undefined {
  const markArea = asRecord(value);
  if (!markArea) return undefined;
  const raw = Array.isArray(markArea.data) ? markArea.data : [];
  if (raw.length > CHART_MAX_MARKS) {
    throw new Error(`chart series declares more than ${CHART_MAX_MARKS} mark areas`);
  }
  const data: Array<[ChartMarkPoint, ChartMarkPoint]> = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const from = normalizeMarkPoint(pair[0]);
    const to = normalizeMarkPoint(pair[1]);
    if (from && to) data.push([from, to]);
  }
  if (!data.length) return undefined;
  return { ...markArea, silent: markArea.silent !== false, data };
}

function normalizeSeries(
  value: unknown,
  index: number,
  yAxisCount = 1,
): ChartSeries {
  const series = asRecord(value);
  if (!series) throw new Error(`chart series ${index + 1} must be an object`);
  const type = boundedText(series.type, "bar") as ChartSeriesType;
  if (!SERIES_TYPES.has(type)) {
    throw new Error(`unsupported chart series type: ${type || "unknown"}`);
  }
  if (Array.isArray(series.data) && series.data.length > CHART_MAX_POINTS) {
    throw new Error(
      `chart series ${index + 1} exceeds ${CHART_MAX_POINTS} data points`,
    );
  }
  const label = asRecord(series.label);
  const itemStyle = asRecord(series.itemStyle);
  const color =
    colorValue(series.color) ||
    colorValue(itemStyle?.color) ||
    "";
  // 越界的绑定按主轴处理而不是报错:双轴收回成单轴时,残留的 `yAxisIndex: 1`
  // 不该把整份文档锁在编辑器外。
  const boundAxis = Math.max(
    0,
    Math.min(
      Math.max(1, Math.min(yAxisCount, CHART_MAX_Y_AXES)) - 1,
      Math.trunc(optionalFinite(series.yAxisIndex) ?? 0),
    ),
  );
  const stack = boundedText(series.stack, "", 60).trim();
  // 面积只有折线画得出来。柱状图上留着 `areaStyle` 会让「换回柱状」之后
  // 再换成折线时冒出用户没要过的填充。
  const areaStyle = type === "line" ? asRecord(series.areaStyle) : null;
  const markLine = normalizeMarkLine(series.markLine);
  const markArea = normalizeMarkArea(series.markArea);
  const normalized: ChartSeries = {
    ...series,
    id: safeId(series.id, `series-${index + 1}`),
    name: boundedText(series.name, `系列 ${index + 1}`, 120),
    type,
    data: (Array.isArray(series.data) ? series.data : []).map(normalizeDatum),
    ...(color
      ? { color, itemStyle: { ...(itemStyle || {}), color } }
      : {}),
    // 主轴绑定不落字段:单轴文档的字节因此与本轮改动前逐字相同。
    ...(boundAxis > 0 ? { yAxisIndex: boundAxis } : { yAxisIndex: undefined }),
    ...(stack ? { stack } : { stack: undefined }),
    ...(areaStyle ? { areaStyle } : { areaStyle: undefined }),
    ...(markLine ? { markLine } : { markLine: undefined }),
    ...(markArea ? { markArea } : { markArea: undefined }),
    label: {
      ...(label || {}),
      show: label?.show === true,
      position: [
        "top",
        "bottom",
        "left",
        "right",
        "inside",
        "insideTop",
        "insideBottom",
      ].includes(String(label?.position))
        ? label?.position
        : "top",
      ...(colorValue(label?.color)
        ? { color: colorValue(label?.color) }
        : {}),
      fontSize: Math.max(
        8,
        Math.min(72, optionalFinite(label?.fontSize) ?? 12),
      ),
      fontWeight: label?.fontWeight === "bold" ? "bold" : "normal",
      formatter: boundedText(label?.formatter, "{c}", 200),
    },
  };
  // 上面五个字段必须能被「取消」:`...series` 会把旧值带过来,所以先显式写成
  // undefined 盖掉。但**留着一个值为 undefined 的键不行**——在 `deepStrictEqual`
  // 眼里它与「没有这个键」是两回事,而存读往返的另一侧来自 JSON(JSON 不存
  // undefined),既有的 chart-editor 往返判据会当场红。所以覆盖完就把键删掉。
  for (const key of [
    "yAxisIndex",
    "stack",
    "areaStyle",
    "markLine",
    "markArea",
  ] as const) {
    if (normalized[key] === undefined) delete normalized[key];
  }
  return normalized;
}

function normalizeDataset(value: unknown): ChartDataset | undefined {
  const dataset = asRecord(value);
  if (!dataset) return undefined;
  const rawDimensions = Array.isArray(dataset.dimensions)
    ? dataset.dimensions
    : [];
  const rawRows = Array.isArray(dataset.source) ? dataset.source : [];
  if (rawDimensions.length > CHART_SPEC_CONSTANTS.C9_maxDimensions) {
    throw new Error(
      `chart dataset exceeds ${CHART_SPEC_CONSTANTS.C9_maxDimensions} dimensions`,
    );
  }
  if (rawRows.length > CHART_SPEC_CONSTANTS.C8_maxDatasetRows) {
    throw new Error(
      `chart dataset exceeds ${CHART_SPEC_CONSTANTS.C8_maxDatasetRows} rows`,
    );
  }
  return {
    dimensions: rawDimensions.map((entry, index) => {
      const dimension = asRecord(entry) || {};
      const type = boundedText(dimension.type, "", 16);
      const unit = boundedText(dimension.unit, "", 24);
      return {
        name: boundedText(dimension.name, `维度 ${index + 1}`, 64),
        type: (CHART_DIMENSION_TYPES as readonly string[]).includes(type)
          ? (type as ChartDatasetDimension["type"])
          : "ordinal",
        ...(unit ? { unit } : {}),
      };
    }),
    // `null` 是缺失值的唯一合法表达(§5.3:MUST NOT 读成 0),因此原样保留。
    source: rawRows.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => {
        if (cell === null) return null;
        if (typeof cell === "number") {
          return Number.isFinite(cell) ? cell : null;
        }
        return boundedText(cell, "", 120);
      }),
    ),
  };
}

function normalizeIndicators(value: unknown): ChartIndicator[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length > CHART_SPEC_CONSTANTS.C4_maxIndicators) {
    throw new Error(
      `chart declares more than ${CHART_SPEC_CONSTANTS.C4_maxIndicators} indicators`,
    );
  }
  return value.map((entry, index) => {
    const indicator = asRecord(entry) || {};
    const unit = boundedText(indicator.unit, "", 24);
    const precision = optionalFinite(indicator.precision);
    return {
      key: boundedText(indicator.key, `indicator-${index + 1}`, 64),
      label: boundedText(indicator.label, `指标 ${index + 1}`, 120),
      ...(unit ? { unit } : {}),
      ...(precision !== undefined
        ? {
            precision: Math.max(
              0,
              Math.min(
                CHART_SPEC_CONSTANTS.C25_maxPrecision,
                Math.trunc(precision),
              ),
            ),
          }
        : {}),
    };
  });
}

function normalizeNarrative(value: unknown): ChartNarrative | undefined {
  const narrative = asRecord(value);
  if (!narrative) return undefined;
  const takeaway = boundedText(narrative.takeaway, "", 600);
  const method = boundedText(narrative.method, "", 600);
  const caveat = boundedText(narrative.caveat, "", 400);
  return {
    ...(takeaway ? { takeaway } : {}),
    ...(method ? { method } : {}),
    ...(caveat ? { caveat } : {}),
  };
}

function normalizeAttribution(value: unknown): ChartAttribution | undefined {
  const attribution = asRecord(value);
  if (!attribution) return undefined;
  const rawEntries = Array.isArray(attribution.entries)
    ? attribution.entries
    : [];
  if (rawEntries.length > 12) {
    throw new Error("chart attribution declares more than 12 entries");
  }
  return {
    entries: rawEntries.map((entry) => {
      const record = asRecord(entry) || {};
      return {
        text: boundedText(record.text, "", 200),
        licenseCode: boundedText(record.licenseCode, "", 60),
        licenseUrl: boundedText(record.licenseUrl, "", 300),
      };
    }),
  };
}

function uniqueSeriesIds(series: ChartSeries[]): ChartSeries[] {
  const used = new Set<string>();
  return series.map((entry, index) => {
    const base = safeId(entry.id, `series-${index + 1}`);
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return id === entry.id ? entry : { ...entry, id };
  });
}

export function normalizeChartDocument(value: unknown): ChartDocumentV1 {
  assertChartDataOnly(value, { allowUndefined: true });
  assertChartSourceSize(value);
  const root = asRecord(value);
  if (!root) throw new Error("chart JSON root must be an object");
  if ("schema" in root && root.schema !== CHART_DOCUMENT_SCHEMA) {
    throw new Error(`unsupported chart schema: ${String(root.schema || "missing")}`);
  }
  const versioned = root.schema === CHART_DOCUMENT_SCHEMA;
  if (versioned && root.version !== undefined && root.version !== 1) {
    // §3.1: `version` is `{ "const": 1 }`. Coercing a future version down to 1
    // would silently reinterpret fields this build does not understand.
    throw new Error(
      `unsupported chart document version: ${String(root.version)}`,
    );
  }
  const optionCandidate =
    versioned
      ? root.option
      : asRecord(root.option) || root;
  const option = asRecord(optionCandidate);
  if (!option) throw new Error("chart JSON option must be an object");
  const title = firstRecord(option.title);
  const legend = firstRecord(option.legend);
  const tooltip = firstRecord(option.tooltip);
  const tooltipTextStyle = asRecord(tooltip.textStyle) || {};
  const rawColors = Array.isArray(option.color) ? option.color : [];
  if (rawColors.length > CHART_MAX_SERIES) {
    throw new Error(`chart palette exceeds ${CHART_MAX_SERIES} colors`);
  }
  const rawSeries = Array.isArray(option.series) ? option.series : [];
  if (rawSeries.length > CHART_MAX_SERIES) {
    throw new Error(`chart supports at most ${CHART_MAX_SERIES} series`);
  }
  const yAxis = normalizeAxisSlot(option.yAxis, "value");
  const yAxisCount = Array.isArray(yAxis) ? yAxis.length : 1;
  const series = uniqueSeriesIds(
    // 显式 arrow:`map(normalizeSeries)` 会把数组本身当第三个参数传进去。
    rawSeries.map((entry, index) => normalizeSeries(entry, index, yAxisCount)),
  );
  if (!series.length) throw new Error("chart JSON must contain at least one series");
  const position =
    legend.position === "bottom" ||
    legend.position === "left" ||
    legend.position === "right"
      ? legend.position
      : "top";
  const colors = rawColors.map(colorValue).filter(Boolean);
  const dataset = versioned ? normalizeDataset(root.dataset) : undefined;
  const indicators = versioned ? normalizeIndicators(root.indicators) : undefined;
  const narrative = versioned ? normalizeNarrative(root.narrative) : undefined;
  const attribution = versioned
    ? normalizeAttribution(root.attribution)
    : undefined;
  const documentTitle =
    versioned && typeof root.title === "string"
      ? boundedText(root.title, "", 300)
      : "";
  return {
    ...(versioned ? root : {}),
    schema: CHART_DOCUMENT_SCHEMA,
    ...(versioned && root.version !== undefined ? { version: 1 as const } : {}),
    ...(documentTitle ? { title: documentTitle } : {}),
    ...(dataset ? { dataset } : {}),
    ...(indicators ? { indicators } : {}),
    ...(narrative ? { narrative } : {}),
    ...(attribution ? { attribution } : {}),
    ...(versioned && typeof root.editor === "string"
      ? { editor: boundedText(root.editor, "", 80) }
      : {}),
    ...(versioned && typeof root.category === "string"
      ? { category: boundedText(root.category, "", 80) }
      : {}),
    ...(versioned && typeof root.effect === "string"
      ? { effect: boundedText(root.effect, "", 80) }
      : {}),
    option: {
      ...option,
      title: {
        ...title,
        text:
          typeof option.title === "string"
            ? boundedText(option.title)
            : boundedText(title.text),
      },
      color: colors.length ? colors : [...DEFAULT_COLORS],
      legend: {
        ...legend,
        show: legend.show !== false,
        position,
        data: series.map((entry) => entry.name),
      },
      tooltip: {
        ...tooltip,
        show: tooltip.show !== false,
        trigger: tooltip.trigger === "axis" ? "axis" : "item",
        ...(colorValue(tooltip.backgroundColor)
          ? { backgroundColor: colorValue(tooltip.backgroundColor) }
          : {}),
        ...(colorValue(tooltip.borderColor)
          ? { borderColor: colorValue(tooltip.borderColor) }
          : {}),
        borderWidth: Math.max(
          0,
          Math.min(10, optionalFinite(tooltip.borderWidth) ?? 1),
        ),
        formatter: boundedText(tooltip.formatter, "", 500),
        textStyle: {
          ...tooltipTextStyle,
          ...(colorValue(tooltipTextStyle.color)
            ? { color: colorValue(tooltipTextStyle.color) }
            : {}),
          fontSize: Math.max(
            8,
            Math.min(48, optionalFinite(tooltipTextStyle.fontSize) ?? 12),
          ),
        },
      },
      xAxis: normalizeAxis(option.xAxis, "category"),
      yAxis,
      series,
    },
  };
}

function structuredChartDocument(
  value: unknown,
  sourceKind: ChartStructuredSourceKind,
): ChartDocumentV1 {
  assertChartDataOnly(value);
  assertChartSourceSize(value);
  const root = asRecord(value);
  if (!root) throw new Error("chart JSON root must be an object");
  if (sourceKind === "canonical") {
    if (root.schema !== CHART_DOCUMENT_SCHEMA) {
      throw new Error(
        `chart source must declare schema ${CHART_DOCUMENT_SCHEMA}`,
      );
    }
  } else if (
    root.schema !== undefined &&
    root.schema !== CHART_DOCUMENT_SCHEMA
  ) {
    throw new Error(`unsupported chart schema: ${String(root.schema)}`);
  }
  if (
    sourceKind === "manifest-option" &&
    root.schema !== CHART_DOCUMENT_SCHEMA &&
    asRecord(root.option)
  ) {
    throw new Error(
      "chart-editor@1 option source must be the option object, not an unversioned wrapper",
    );
  }
  return normalizeChartDocument(value);
}

export function chartDocumentFromStructuredValue(
  value: unknown,
  sourceKind: ChartStructuredSourceKind,
): ChartDocumentV1 {
  return structuredChartDocument(value, sourceKind);
}

export function chartDocumentFromJson(
  json: string,
  sourceKind: ChartStructuredSourceKind = "canonical",
): ChartDocumentV1 {
  const source = json.replace(/^\uFEFF/, "");
  if (!source.trim()) throw new Error("chart source is empty");
  if (textEncoder.encode(source).byteLength > CHART_SOURCE_MAX_BYTES) {
    throw new Error("chart source exceeds the 2MB safety limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("chart source must be valid JSON; HTML/scripts are never evaluated");
  }
  return structuredChartDocument(parsed, sourceKind);
}

export function chartDocumentFromManifestOptionJson(
  json: string,
): ChartDocumentV1 {
  return chartDocumentFromJson(json, "manifest-option");
}

export function chartDocumentToJson(document: ChartDocumentV1): string {
  const json = JSON.stringify(normalizeChartDocument(document), null, 2);
  if (textEncoder.encode(json).byteLength > CHART_SOURCE_MAX_BYTES) {
    throw new Error("chart source exceeds the 2MB safety limit");
  }
  return json;
}

function cloneDocument(document: ChartDocumentV1): ChartDocumentV1 {
  return chartDocumentFromJson(chartDocumentToJson(document));
}

export function patchChartAxis(
  document: ChartDocumentV1,
  axis: "x" | "y",
  patch: Partial<ChartAxis>,
  axisIndex = 0,
): ChartDocumentV1 {
  const next = cloneDocument(document);
  if (axis === "x") {
    next.option.xAxis = normalizeAxis(
      { ...next.option.xAxis, ...patch },
      "category",
    );
    return normalizeChartDocument(next);
  }
  const axes = chartYAxes(next.option);
  if (axisIndex < 0 || axisIndex >= axes.length) {
    throw new Error(`unknown chart y axis: ${axisIndex}`);
  }
  const patched = normalizeAxis({ ...axes[axisIndex], ...patch }, "value");
  next.option.yAxis = Array.isArray(next.option.yAxis)
    ? axes.map((entry, index) => (index === axisIndex ? patched : entry))
    : patched;
  return normalizeChartDocument(next);
}

/**
 * 把 y 轴在「一条」与「两条」之间切换。金额与增长率同图是财务与运营报表的
 * 刚需,而它们的量纲差两三个数量级,共用一条轴时增长率会被压成一条贴底的直线。
 *
 * **无损**的具体含义:`1 → 2 → 1` 之后文档回到单对象形态,
 * 且序列上的 `yAxisIndex` 一并清掉,与升级前逐字相同。
 */
export function setChartYAxisCount(
  document: ChartDocumentV1,
  count: number,
): ChartDocumentV1 {
  if (count !== 1 && count !== 2) {
    throw new Error(`chart supports 1 or ${CHART_MAX_Y_AXES} y axes, got ${count}`);
  }
  const next = cloneDocument(document);
  const axes = chartYAxes(next.option);
  if (count === 1) {
    next.option.yAxis = axes[0];
    next.option.series = next.option.series.map((series) => ({
      ...series,
      yAxisIndex: undefined,
    }));
    return normalizeChartDocument(next);
  }
  next.option.yAxis = [
    axes[0],
    axes[1] ||
      normalizeAxis(
        {
          type: "value",
          name: "",
          position: "right",
          // 副轴自带网格线会和主轴的网格线错格,画面立刻脏掉。
          splitLine: { show: false },
        },
        "value",
      ),
  ];
  return normalizeChartDocument(next);
}

/** 把一条系列绑到指定 y 轴。`axisIndex` 越界即报错,不静默落回主轴。 */
export function bindChartSeriesToAxis(
  document: ChartDocumentV1,
  id: string,
  axisIndex: number,
): ChartDocumentV1 {
  const axes = chartYAxes(document.option);
  if (!Number.isInteger(axisIndex) || axisIndex < 0 || axisIndex >= axes.length) {
    throw new Error(
      `chart has ${axes.length} y axis/axes; cannot bind series to axis ${axisIndex}`,
    );
  }
  return patchChartSeries(document, id, {
    yAxisIndex: axisIndex === 0 ? undefined : axisIndex,
  });
}

export function patchChartTooltip(
  document: ChartDocumentV1,
  patch: Partial<ChartOption["tooltip"]>,
): ChartDocumentV1 {
  const next = cloneDocument(document);
  next.option.tooltip = {
    ...next.option.tooltip,
    ...patch,
    ...(patch.textStyle
      ? {
          textStyle: {
            ...next.option.tooltip.textStyle,
            ...patch.textStyle,
          },
        }
      : {}),
  };
  return normalizeChartDocument(next);
}

export function patchChartSeries(
  document: ChartDocumentV1,
  id: string,
  patch: Partial<ChartSeries>,
): ChartDocumentV1 {
  const next = cloneDocument(document);
  const index = next.option.series.findIndex((series) => series.id === id);
  if (index < 0) throw new Error(`unknown chart series: ${id}`);
  const current = next.option.series[index];
  next.option.series[index] = normalizeSeries(
    {
      ...current,
      ...patch,
      ...(patch.label
        ? { label: { ...current.label, ...patch.label } }
        : {}),
      ...(patch.color
        ? {
            itemStyle: {
              ...(asRecord(current.itemStyle) || {}),
              color: patch.color,
            },
          }
        : {}),
    },
    index,
    chartYAxisCount(next.option),
  );
  return normalizeChartDocument(next);
}

export function appendChartSeries(
  document: ChartDocumentV1,
  series: ChartSeries,
): ChartDocumentV1 {
  const next = cloneDocument(document);
  if (next.option.series.length >= CHART_MAX_SERIES) {
    throw new Error(`chart supports at most ${CHART_MAX_SERIES} series`);
  }
  next.option.series.push(
    normalizeSeries(
      series,
      next.option.series.length,
      chartYAxisCount(next.option),
    ),
  );
  return normalizeChartDocument(next);
}

export function replaceChartData(
  document: ChartDocumentV1,
  table: ChartDataTable,
): ChartDocumentV1 {
  if (table.length < 2 || table[0].length < 2) {
    throw new Error("chart data table needs a header and at least one row");
  }
  const next = cloneDocument(document);
  if (table[0].length > CHART_MAX_SERIES + 1) {
    throw new Error(`chart data supports at most ${CHART_MAX_SERIES} series`);
  }
  if (table.length > CHART_MAX_POINTS + 1) {
    throw new Error(`chart data supports at most ${CHART_MAX_POINTS} rows`);
  }
  const header = table[0];
  const rows = table.slice(1);
  next.option.xAxis = {
    ...next.option.xAxis,
    type: "category",
    data: rows.map((row) => boundedText(row[0], String(row[0] ?? ""), 120)),
  };
  next.option.series = header.slice(1).map((name, index) => {
    const existing = next.option.series[index];
    return normalizeSeries(
      {
        ...(existing || {}),
        id: existing?.id || safeId(name, `series-${index + 1}`),
        name: boundedText(name, `系列 ${index + 1}`, 120),
        type: existing?.type || "bar",
        data: rows.map((row) => finiteNumber(row[index + 1])),
      },
      index,
      chartYAxisCount(next.option),
    );
  });
  return normalizeChartDocument(next);
}

export function chartDataTable(document: ChartDocumentV1): ChartDataTable {
  const categories = document.option.xAxis.data;
  const length = Math.max(
    categories.length,
    ...document.option.series.map((series) => series.data.length),
  );
  return [
    ["分类", ...document.option.series.map((series) => series.name)],
    ...Array.from({ length }, (_, rowIndex) => [
      categories[rowIndex] || `数据 ${rowIndex + 1}`,
      ...document.option.series.map((series) => {
        const datum = series.data[rowIndex];
        if (typeof datum === "number") return datum;
        if (Array.isArray(datum)) return datum[1] ?? datum[0] ?? 0;
        return Array.isArray(datum?.value)
          ? datum.value[1] ?? datum.value[0] ?? 0
          : datum?.value || 0;
      }),
    ]),
  ];
}

function chartDataDelimiter(source: string): "," | "\t" {
  let quoted = false;
  let commas = 0;
  let tabs = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\n" || character === "\r")) {
      break;
    } else if (!quoted && character === ",") {
      commas += 1;
    } else if (!quoted && character === "\t") {
      tabs += 1;
    }
  }
  return tabs > commas ? "\t" : ",";
}

function parseChartDataRows(source: string): string[][] {
  if (textEncoder.encode(source).byteLength > CHART_SOURCE_MAX_BYTES) {
    throw new Error("CSV 超过 2MB 安全上限");
  }
  const delimiter = chartDataDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV 包含未闭合的引号");
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

// ---------------------------------------------------------------------------
// chart.md §1.2 / §3.1 / §8 —— 落库门槛层
//
// 上面的 `normalizeChartDocument` 是**载入**路径:它必须能吃下库内 88 份既有
// native chart(只有 `schema` + `option`)。下面这一层是**落库/发布**门槛:
// 按 §3.1 逐字校验 `oceanleo.chart.v1`,按 §8.1/§8.2 判完备,空 option 与空图
// 一律判不合格。两层刻意分开,收紧载入会把既有素材锁死在编辑器外。
// ---------------------------------------------------------------------------

/** C26 源字节下限(§8.1)。catalog 侧的 `minimumSourceBytesByEditorClass["chart_editing"]` 取同值。 */
export const CHART_SPEC_MIN_SOURCE_BYTES = CHART_SPEC_CONSTANTS.C26_minSourceBytes;
/** C27 源字节上限(§8.1)。 */
export const CHART_SPEC_MAX_SOURCE_BYTES = CHART_SPEC_CONSTANTS.C27_maxSourceBytes;

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export interface ChartValidationError {
  code: string;
  path: string;
  message: string;
}

export type ChartValidationResult =
  | { ok: true; project: ChartProjectV1 }
  | { ok: false; errors: ChartValidationError[] };

function issue(code: string, path: string, message: string): ChartValidationError {
  return { code, path, message };
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return asRecord(value);
}

function checkString(
  errors: ChartValidationError[],
  value: unknown,
  path: string,
  bounds: { min?: number; max?: number },
): void {
  if (typeof value !== "string") {
    errors.push(issue("type", path, `${path} 必须是字符串`));
    return;
  }
  if (bounds.min !== undefined && value.length < bounds.min) {
    errors.push(
      issue("min-length", path, `${path} 至少 ${bounds.min} 字符,实际 ${value.length}`),
    );
  }
  if (bounds.max !== undefined && value.length > bounds.max) {
    errors.push(
      issue("max-length", path, `${path} 至多 ${bounds.max} 字符,实际 ${value.length}`),
    );
  }
}

function validateDatasetShape(
  errors: ChartValidationError[],
  value: unknown,
): void {
  const dataset = plainObject(value);
  if (!dataset) {
    errors.push(issue("type", "dataset", "dataset 必须是对象"));
    return;
  }
  for (const extra of Object.keys(dataset)) {
    if (!["dimensions", "source"].includes(extra)) {
      errors.push(
        issue("additional-property", `dataset.${extra}`, `dataset 不接受额外字段 ${extra}`),
      );
    }
  }
  const dimensions = dataset.dimensions;
  if (!Array.isArray(dimensions)) {
    errors.push(issue("required", "dataset.dimensions", "dataset.dimensions 必须是数组"));
  } else {
    if (
      dimensions.length < CHART_SPEC_CONSTANTS.C9_minDimensions ||
      dimensions.length > CHART_SPEC_CONSTANTS.C9_maxDimensions
    ) {
      errors.push(
        issue(
          "items-range",
          "dataset.dimensions",
          `dataset.dimensions 需 ${CHART_SPEC_CONSTANTS.C9_minDimensions}–${CHART_SPEC_CONSTANTS.C9_maxDimensions} 个(C9),实际 ${dimensions.length}`,
        ),
      );
    }
    dimensions.forEach((entry, index) => {
      const path = `dataset.dimensions[${index}]`;
      const dimension = plainObject(entry);
      if (!dimension) {
        errors.push(issue("type", path, `${path} 必须是对象`));
        return;
      }
      for (const extra of Object.keys(dimension)) {
        if (!["name", "type", "unit"].includes(extra)) {
          errors.push(
            issue("additional-property", `${path}.${extra}`, `${path} 不接受额外字段 ${extra}`),
          );
        }
      }
      checkString(errors, dimension.name, `${path}.name`, { min: 1, max: 64 });
      if (
        !(CHART_DIMENSION_TYPES as readonly unknown[]).includes(dimension.type)
      ) {
        errors.push(
          issue(
            "enum",
            `${path}.type`,
            `${path}.type 必须是 ${CHART_DIMENSION_TYPES.join(" / ")}`,
          ),
        );
      }
      if (dimension.unit !== undefined) {
        checkString(errors, dimension.unit, `${path}.unit`, { max: 24 });
      }
    });
  }
  const rows = dataset.source;
  if (!Array.isArray(rows)) {
    errors.push(issue("required", "dataset.source", "dataset.source 必须是数组"));
    return;
  }
  if (
    rows.length < CHART_SPEC_CONSTANTS.C7_minDatasetRows ||
    rows.length > CHART_SPEC_CONSTANTS.C8_maxDatasetRows
  ) {
    errors.push(
      issue(
        "items-range",
        "dataset.source",
        `dataset.source 需 ${CHART_SPEC_CONSTANTS.C7_minDatasetRows}–${CHART_SPEC_CONSTANTS.C8_maxDatasetRows} 行(C7/C8),实际 ${rows.length}`,
      ),
    );
  }
  rows.forEach((row, index) => {
    const path = `dataset.source[${index}]`;
    if (!Array.isArray(row)) {
      errors.push(issue("type", path, `${path} 必须是数组`));
      return;
    }
    if (
      row.length < CHART_SPEC_CONSTANTS.C9_minDimensions ||
      row.length > CHART_SPEC_CONSTANTS.C9_maxDimensions
    ) {
      errors.push(
        issue(
          "items-range",
          path,
          `${path} 需 ${CHART_SPEC_CONSTANTS.C9_minDimensions}–${CHART_SPEC_CONSTANTS.C9_maxDimensions} 列,实际 ${row.length}`,
        ),
      );
    }
  });
}

function validateOptionShape(
  errors: ChartValidationError[],
  value: unknown,
): void {
  const option = plainObject(value);
  if (!option) {
    errors.push(issue("type", "option", "option 必须是对象"));
    return;
  }
  // §3.1 刻意不给 option 写 additionalProperties:false —— 它要投影成 ECharts
  // option,字段远多于本 schema。这里只校验「必须存在且必须合规」的那部分。
  if (option.color !== undefined) {
    if (!Array.isArray(option.color)) {
      errors.push(issue("type", "option.color", "option.color 必须是数组"));
    } else {
      if (option.color.length < 1 || option.color.length > 24) {
        errors.push(
          issue(
            "items-range",
            "option.color",
            `option.color 需 1–24 个,实际 ${option.color.length}`,
          ),
        );
      }
      option.color.forEach((entry, index) => {
        if (typeof entry !== "string" || !HEX_COLOR_PATTERN.test(entry)) {
          errors.push(
            issue(
              "pattern",
              `option.color[${index}]`,
              `option.color[${index}] 必须匹配 ^#[0-9A-Fa-f]{6}$,实际 ${String(entry)}`,
            ),
          );
        }
      });
    }
  }
  if (option.title !== undefined) {
    const title = plainObject(option.title);
    if (!title) {
      errors.push(issue("type", "option.title", "option.title 必须是对象"));
    } else {
      checkString(errors, title.text, "option.title.text", {
        min: CHART_SPEC_CONSTANTS.C23_minTitleTextLength,
        max: 200,
      });
      if (title.subtext !== undefined) {
        checkString(errors, title.subtext, "option.title.subtext", { max: 300 });
      }
    }
  }
  if (option.grid !== undefined) {
    const grid = plainObject(option.grid);
    if (!grid) {
      errors.push(issue("type", "option.grid", "option.grid 必须是对象"));
    } else {
      for (const side of ["left", "right", "top", "bottom"] as const) {
        const edge = grid[side];
        if (
          edge !== undefined &&
          typeof edge !== "number" &&
          typeof edge !== "string"
        ) {
          errors.push(
            issue("type", `option.grid.${side}`, `option.grid.${side} 必须是 number 或 string`),
          );
        }
      }
    }
  }
  for (const key of ["legend", "tooltip"] as const) {
    if (option[key] !== undefined && !plainObject(option[key])) {
      errors.push(issue("type", `option.${key}`, `option.${key} 必须是对象`));
    }
  }
  for (const key of ["xAxis", "yAxis"] as const) {
    const axis = option[key];
    if (axis !== undefined && !plainObject(axis) && !Array.isArray(axis)) {
      errors.push(
        issue("type", `option.${key}`, `option.${key} 必须是对象或数组`),
      );
    }
  }
  const yAxisCount = Array.isArray(option.yAxis)
    ? option.yAxis.length
    : 1;
  if (yAxisCount > CHART_MAX_Y_AXES) {
    errors.push(
      issue(
        "items-range",
        "option.yAxis",
        `option.yAxis 至多 ${CHART_MAX_Y_AXES} 条,实际 ${yAxisCount}`,
      ),
    );
  }
  const series = option.series;
  if (!Array.isArray(series)) {
    errors.push(issue("required", "option.series", "option.series 必须是数组"));
    return;
  }
  if (
    series.length < CHART_SPEC_CONSTANTS.C1_minSeries ||
    series.length > CHART_SPEC_CONSTANTS.C2_maxSeries
  ) {
    errors.push(
      issue(
        "items-range",
        "option.series",
        `option.series 需 ${CHART_SPEC_CONSTANTS.C1_minSeries}–${CHART_SPEC_CONSTANTS.C2_maxSeries} 条(C1/C2),实际 ${series.length}`,
      ),
    );
  }
  series.forEach((entry, index) => {
    const path = `option.series[${index}]`;
    const item = plainObject(entry);
    if (!item) {
      errors.push(issue("type", path, `${path} 必须是对象`));
      return;
    }
    if (!(CHART_SPEC_SERIES_TYPES as readonly unknown[]).includes(item.type)) {
      errors.push(
        issue(
          "enum",
          `${path}.type`,
          `${path}.type 必须是 ${CHART_SPEC_SERIES_TYPES.join(" / ")}(C10),实际 ${String(item.type)}`,
        ),
      );
    }
    checkString(errors, item.name, `${path}.name`, { min: 1, max: 80 });
    // 绑到不存在的 y 轴,ECharts 既不报错也不画这条系列。跟 F3 悬空维度绑定
    // 同一类病:静默不画是最难查的图表病。
    if (item.yAxisIndex !== undefined) {
      const bound = item.yAxisIndex;
      if (
        typeof bound !== "number" ||
        !Number.isInteger(bound) ||
        bound < 0 ||
        bound >= yAxisCount
      ) {
        errors.push(
          issue(
            "dangling-axis",
            `${path}.yAxisIndex`,
            `序列「${String(item.name)}」绑定了不存在的 y 轴 ${String(bound)};当前只有 ${yAxisCount} 条`,
          ),
        );
      }
    }
    if (item.encode !== undefined && !plainObject(item.encode)) {
      errors.push(issue("type", `${path}.encode`, `${path}.encode 必须是对象`));
    }
    if (item.data !== undefined) {
      if (!Array.isArray(item.data)) {
        errors.push(issue("type", `${path}.data`, `${path}.data 必须是数组`));
      } else if (item.data.length > CHART_SPEC_CONSTANTS.C6_maxDataPoints) {
        errors.push(
          issue(
            "items-range",
            `${path}.data`,
            `${path}.data 至多 ${CHART_SPEC_CONSTANTS.C6_maxDataPoints} 点(C6),实际 ${item.data.length}`,
          ),
        );
      }
    }
    if (
      item.symbol !== undefined &&
      !(CHART_SPEC_SYMBOLS as readonly unknown[]).includes(item.symbol)
    ) {
      errors.push(
        issue(
          "enum",
          `${path}.symbol`,
          `${path}.symbol 必须是 ${CHART_SPEC_SYMBOLS.join(" / ")}(C11)`,
        ),
      );
    }
    for (const key of ["itemStyle", "label"] as const) {
      if (item[key] !== undefined && !plainObject(item[key])) {
        errors.push(issue("type", `${path}.${key}`, `${path}.${key} 必须是对象`));
      }
    }
  });
}

function validateIndicatorsShape(
  errors: ChartValidationError[],
  value: unknown,
): void {
  if (!Array.isArray(value)) {
    errors.push(issue("type", "indicators", "indicators 必须是数组"));
    return;
  }
  if (
    value.length < CHART_SPEC_CONSTANTS.C3_minIndicators ||
    value.length > CHART_SPEC_CONSTANTS.C4_maxIndicators
  ) {
    errors.push(
      issue(
        "items-range",
        "indicators",
        `indicators 需 ${CHART_SPEC_CONSTANTS.C3_minIndicators}–${CHART_SPEC_CONSTANTS.C4_maxIndicators} 条(C3/C4),实际 ${value.length}`,
      ),
    );
  }
  value.forEach((entry, index) => {
    const path = `indicators[${index}]`;
    const indicator = plainObject(entry);
    if (!indicator) {
      errors.push(issue("type", path, `${path} 必须是对象`));
      return;
    }
    for (const extra of Object.keys(indicator)) {
      if (!["key", "label", "unit", "precision"].includes(extra)) {
        errors.push(
          issue("additional-property", `${path}.${extra}`, `${path} 不接受额外字段 ${extra}`),
        );
      }
    }
    checkString(errors, indicator.key, `${path}.key`, { min: 1, max: 64 });
    checkString(errors, indicator.label, `${path}.label`, { min: 1, max: 120 });
    if (indicator.unit !== undefined) {
      checkString(errors, indicator.unit, `${path}.unit`, { max: 24 });
    }
    if (indicator.precision !== undefined) {
      const precision = indicator.precision;
      if (
        typeof precision !== "number" ||
        !Number.isInteger(precision) ||
        precision < 0 ||
        precision > CHART_SPEC_CONSTANTS.C25_maxPrecision
      ) {
        errors.push(
          issue(
            "range",
            `${path}.precision`,
            `${path}.precision 需 0–${CHART_SPEC_CONSTANTS.C25_maxPrecision} 的整数(C25)`,
          ),
        );
      }
    }
  });
}

function validateNarrativeShape(
  errors: ChartValidationError[],
  value: unknown,
): void {
  const narrative = plainObject(value);
  if (!narrative) {
    errors.push(issue("type", "narrative", "narrative 必须是对象"));
    return;
  }
  for (const extra of Object.keys(narrative)) {
    if (!["takeaway", "method", "caveat"].includes(extra)) {
      errors.push(
        issue("additional-property", `narrative.${extra}`, `narrative 不接受额外字段 ${extra}`),
      );
    }
  }
  if (narrative.takeaway !== undefined) {
    checkString(errors, narrative.takeaway, "narrative.takeaway", {
      min: CHART_SPEC_CONSTANTS.C24_minTakeawayLength,
      max: 600,
    });
  }
  if (narrative.method !== undefined) {
    checkString(errors, narrative.method, "narrative.method", { max: 600 });
  }
  if (narrative.caveat !== undefined) {
    checkString(errors, narrative.caveat, "narrative.caveat", { max: 400 });
  }
}

function validateAttributionShape(
  errors: ChartValidationError[],
  value: unknown,
): void {
  const attribution = plainObject(value);
  if (!attribution) {
    errors.push(issue("type", "attribution", "attribution 必须是对象"));
    return;
  }
  for (const extra of Object.keys(attribution)) {
    if (extra !== "entries") {
      errors.push(
        issue("additional-property", `attribution.${extra}`, `attribution 不接受额外字段 ${extra}`),
      );
    }
  }
  const entries = attribution.entries;
  if (!Array.isArray(entries)) {
    errors.push(issue("required", "attribution.entries", "attribution.entries 必须是数组"));
    return;
  }
  if (entries.length < 1 || entries.length > 12) {
    errors.push(
      issue(
        "items-range",
        "attribution.entries",
        `attribution.entries 需 1–12 条,实际 ${entries.length}`,
      ),
    );
  }
  entries.forEach((entry, index) => {
    const path = `attribution.entries[${index}]`;
    const record = plainObject(entry);
    if (!record) {
      errors.push(issue("type", path, `${path} 必须是对象`));
      return;
    }
    for (const extra of Object.keys(record)) {
      if (!["text", "licenseCode", "licenseUrl"].includes(extra)) {
        errors.push(
          issue("additional-property", `${path}.${extra}`, `${path} 不接受额外字段 ${extra}`),
        );
      }
    }
    checkString(errors, record.text, `${path}.text`, { min: 2, max: 200 });
    checkString(errors, record.licenseCode, `${path}.licenseCode`, {
      min: 2,
      max: 60,
    });
    checkString(errors, record.licenseUrl, `${path}.licenseUrl`, { max: 300 });
    // §3.1 `"format": "uri", "pattern": "^https://"` —— F8「来源不可追」的正面解。
    if (
      typeof record.licenseUrl !== "string" ||
      !/^https:\/\//.test(record.licenseUrl)
    ) {
      errors.push(
        issue(
          "pattern",
          `${path}.licenseUrl`,
          `${path}.licenseUrl 必须是 https:// 开头的 URI`,
        ),
      );
    }
  });
}

const SPEC_ROOT_KEYS = [
  "schema",
  "version",
  "title",
  "dataset",
  "option",
  "indicators",
  "narrative",
  "attribution",
];

const SPEC_ROOT_REQUIRED = [
  "schema",
  "version",
  "title",
  "dataset",
  "option",
  "indicators",
  "attribution",
];

/**
 * chart.md §3.1 `oceanleo.chart.v1` 的逐字校验。这是 `editability = native`
 * 的落库门槛(§9 C-2),不是载入门槛。
 */
export function validateChartProjectV1(value: unknown): ChartValidationResult {
  const errors: ChartValidationError[] = [];
  const root = plainObject(value);
  if (!root) {
    return {
      ok: false,
      errors: [issue("type", "", "oceanleo.chart.v1 根必须是 JSON 对象")],
    };
  }
  if (root.schema !== CHART_DOCUMENT_SCHEMA) {
    errors.push(
      issue("const", "schema", `schema 必须逐字为 ${CHART_DOCUMENT_SCHEMA}`),
    );
  }
  if (root.version !== 1) {
    errors.push(issue("const", "version", "version 必须是整数 1"));
  }
  for (const key of SPEC_ROOT_REQUIRED) {
    if (root[key] === undefined) {
      errors.push(issue("required", key, `缺少必填顶层字段 ${key}`));
    }
  }
  // §3.1 根上写了 `"additionalProperties": false`。既有 88 份 native chart 常带
  // `editor` / `category` / `effect` 三个历史键,载入层保留它们,但落库层按规格拒。
  for (const key of Object.keys(root)) {
    if (!SPEC_ROOT_KEYS.includes(key)) {
      errors.push(
        issue("additional-property", key, `oceanleo.chart.v1 不接受额外顶层字段 ${key}`),
      );
    }
  }
  if (root.title !== undefined) {
    checkString(errors, root.title, "title", { min: 8, max: 300 });
  }
  if (root.dataset !== undefined) validateDatasetShape(errors, root.dataset);
  if (root.option !== undefined) validateOptionShape(errors, root.option);
  if (root.indicators !== undefined) {
    validateIndicatorsShape(errors, root.indicators);
  }
  if (root.narrative !== undefined) {
    validateNarrativeShape(errors, root.narrative);
  }
  if (root.attribution !== undefined) {
    validateAttributionShape(errors, root.attribution);
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, project: root as unknown as ChartProjectV1 };
}

/**
 * chart.md §3.2 `option-linked → invalid` 与 F3「悬空维度绑定」:
 * `option.series[].encode` 引用的维度名 MUST 在 `dataset.dimensions` 里真实存在,
 * 且 MUST 逐条列出悬空的序列名与维度名(静默不画是最难查的图表病)。
 */
export function chartDimensionBindingErrors(
  value: unknown,
): ChartValidationError[] {
  const errors: ChartValidationError[] = [];
  const root = plainObject(value);
  const dataset = plainObject(root?.dataset);
  const option = plainObject(root?.option);
  const series = Array.isArray(option?.series) ? option.series : [];
  const dimensions = Array.isArray(dataset?.dimensions)
    ? dataset.dimensions
    : [];
  const names = new Set(
    dimensions
      .map((entry) => plainObject(entry)?.name)
      .filter((name): name is string => typeof name === "string"),
  );
  series.forEach((entry, index) => {
    const item = plainObject(entry);
    const encode = plainObject(item?.encode);
    if (!encode) return;
    const seriesName =
      typeof item?.name === "string" ? item.name : `series[${index}]`;
    for (const [channel, bound] of Object.entries(encode)) {
      const references = Array.isArray(bound) ? bound : [bound];
      for (const reference of references) {
        // 数字下标按位次绑定,只校验按名绑定的引用。
        if (typeof reference !== "string") continue;
        if (!names.has(reference)) {
          errors.push(
            issue(
              "dangling-dimension",
              `option.series[${index}].encode.${channel}`,
              `序列「${seriesName}」的 encode.${channel} 绑定了 dataset.dimensions 中不存在的维度「${reference}」`,
            ),
          );
        }
      }
    }
  });
  return errors;
}

function datasetPointCount(dataset: Record<string, unknown> | null): number {
  const rows = Array.isArray(dataset?.source) ? dataset.source : [];
  return rows.reduce<number>(
    (total, row) =>
      total +
      (Array.isArray(row)
        ? row.filter((cell) => typeof cell === "number").length
        : 0),
    0,
  );
}

function seriesPointCount(series: unknown[]): number {
  return series.reduce<number>((total, entry) => {
    const data = plainObject(entry)?.data;
    return total + (Array.isArray(data) ? data.length : 0);
  }, 0);
}

export interface ChartCompletenessReport {
  ok: boolean;
  byteLength: number;
  failures: ChartValidationError[];
}

/**
 * chart.md §8.1 字节下限 + §8.2 内容完备判据(全部 MUST 同时成立)。
 * 空 `option`、空图、单色多序列、无标题无结论都在这里被判不合格 —— 这是
 * 「233 B 空壳」治理在编辑器侧的正面解。
 *
 * `byteLength` 不传时按确定性序列化后的 UTF-8 字节数计。
 */
export function chartCompletenessReport(
  value: unknown,
  options: { byteLength?: number } = {},
): ChartCompletenessReport {
  const failures: ChartValidationError[] = [];
  const root = plainObject(value);
  let byteLength = options.byteLength ?? 0;
  if (options.byteLength === undefined) {
    try {
      byteLength = chartValueByteLength(value ?? null);
    } catch {
      byteLength = 0;
    }
  }
  if (!root) {
    return {
      ok: false,
      byteLength,
      failures: [issue("type", "", "chart source 必须是 JSON 对象")],
    };
  }
  // §8.1
  if (byteLength < CHART_SPEC_MIN_SOURCE_BYTES) {
    failures.push(
      issue(
        "byte-floor",
        "",
        `source 字节 ${byteLength} 低于 §8.1 下限 ${CHART_SPEC_MIN_SOURCE_BYTES} B`,
      ),
    );
  }
  if (byteLength > CHART_SPEC_MAX_SOURCE_BYTES) {
    failures.push(
      issue(
        "byte-ceiling",
        "",
        `source 字节 ${byteLength} 超过 §8.1 上限 ${CHART_SPEC_MAX_SOURCE_BYTES} B`,
      ),
    );
  }
  // §8.2
  const option = plainObject(root.option);
  const series = Array.isArray(option?.series) ? option.series : [];
  if (series.length < CHART_SPEC_CONSTANTS.C1_minSeries) {
    failures.push(
      issue("series-count", "option.series", "option.series 条数需 ≥ 1"),
    );
  }
  const indicators = Array.isArray(root.indicators) ? root.indicators : [];
  if (indicators.length < CHART_SPEC_CONSTANTS.C3_minIndicators) {
    failures.push(
      issue(
        "indicator-count",
        "indicators",
        `indicators 条数需 ≥ ${CHART_SPEC_CONSTANTS.C3_minIndicators},实际 ${indicators.length}`,
      ),
    );
  }
  const dataset = plainObject(root.dataset);
  const points = Math.max(datasetPointCount(dataset), seriesPointCount(series));
  if (points < CHART_SPEC_CONSTANTS.C5_minDataPoints) {
    failures.push(
      issue(
        "data-point-count",
        "dataset.source",
        `数据点总数需 ≥ ${CHART_SPEC_CONSTANTS.C5_minDataPoints}(C5),实际 ${points}`,
      ),
    );
  }
  const rows = Array.isArray(dataset?.source) ? dataset.source : [];
  if (rows.length < CHART_SPEC_CONSTANTS.C7_minDatasetRows) {
    failures.push(
      issue(
        "dataset-row-count",
        "dataset.source",
        `dataset.source 行数需 ≥ ${CHART_SPEC_CONSTANTS.C7_minDatasetRows}(C7),实际 ${rows.length}`,
      ),
    );
  }
  const dimensions = Array.isArray(dataset?.dimensions)
    ? dataset.dimensions
    : [];
  if (dimensions.length < CHART_SPEC_CONSTANTS.C9_minDimensions) {
    failures.push(
      issue(
        "dimension-count",
        "dataset.dimensions",
        `dataset.dimensions 个数需 ≥ ${CHART_SPEC_CONSTANTS.C9_minDimensions}(C9),实际 ${dimensions.length}`,
      ),
    );
  }
  const titleText = plainObject(option?.title)?.text;
  if (
    typeof titleText !== "string" ||
    titleText.length < CHART_SPEC_CONSTANTS.C23_minTitleTextLength
  ) {
    failures.push(
      issue(
        "title-text",
        "option.title.text",
        `option.title.text 长度需 ≥ ${CHART_SPEC_CONSTANTS.C23_minTitleTextLength}(C23,治 F5)`,
      ),
    );
  }
  const takeaway = plainObject(root.narrative)?.takeaway;
  if (
    typeof takeaway !== "string" ||
    takeaway.length < CHART_SPEC_CONSTANTS.C24_minTakeawayLength
  ) {
    failures.push(
      issue(
        "narrative-takeaway",
        "narrative.takeaway",
        `narrative.takeaway 长度需 ≥ ${CHART_SPEC_CONSTANTS.C24_minTakeawayLength}(C24,治 F5)`,
      ),
    );
  }
  // 治 F2「全序列同色」:不同序列色数 ≥ 序列数。
  const paletteColors = Array.isArray(option?.color)
    ? option.color.filter((entry): entry is string => typeof entry === "string")
    : [];
  const seriesColors = series
    .map((entry) => {
      const item = plainObject(entry);
      const inline = item?.color ?? plainObject(item?.itemStyle)?.color;
      return typeof inline === "string" ? inline : "";
    })
    .filter(Boolean);
  const distinctColors = new Set(
    [...paletteColors, ...seriesColors].map((entry) => entry.toLowerCase()),
  );
  if (series.length > 0 && distinctColors.size < series.length) {
    failures.push(
      issue(
        "series-color-variety",
        "option.color",
        `不同序列色数需 ≥ 序列数(治 F2):序列 ${series.length} 条,可区分色 ${distinctColors.size} 种`,
      ),
    );
  }
  // WCAG 2.2 SC 1.4.1 / §2.1 V4:序列 ≥ 3 时颜色 MUST NOT 是唯一编码手段。
  if (series.length >= CHART_SPEC_CONSTANTS.C14_colorOnlyThreshold) {
    const symbols = new Set(
      series
        .map((entry) => {
          const item = plainObject(entry);
          const symbol = item?.symbol;
          const lineType = plainObject(item?.lineStyle)?.type;
          return typeof symbol === "string"
            ? `symbol:${symbol}`
            : typeof lineType === "string"
              ? `lineStyle:${lineType}`
              : "";
        })
        .filter(Boolean),
    );
    if (symbols.size < 2) {
      failures.push(
        issue(
          "non-color-encoding",
          "option.series[].symbol",
          "序列 ≥ 3 时不同 symbol / lineStyle.type 种数需 ≥ 2(SC 1.4.1)",
        ),
      );
    }
  }
  const entries = Array.isArray(plainObject(root.attribution)?.entries)
    ? (plainObject(root.attribution)!.entries as unknown[])
    : [];
  const completeEntries = entries.filter((entry) => {
    const record = plainObject(entry);
    return (
      typeof record?.text === "string" &&
      record.text.length >= 2 &&
      typeof record.licenseCode === "string" &&
      record.licenseCode.length >= 2 &&
      typeof record.licenseUrl === "string" &&
      /^https:\/\//.test(record.licenseUrl)
    );
  });
  if (completeEntries.length < 1) {
    failures.push(
      issue(
        "attribution-entries",
        "attribution.entries",
        "attribution.entries 需 ≥ 1 且 text / licenseCode / licenseUrl 三字段齐全(治 F8)",
      ),
    );
  }
  // `reviewed_material_catalog.py:3309` 的标题下限。
  if (typeof root.title !== "string" || root.title.length < 8) {
    failures.push(
      issue("document-title", "title", "顶层 title 长度需 ≥ 8 字符"),
    );
  }
  failures.push(...chartDimensionBindingErrors(root));
  return { ok: failures.length === 0, byteLength, failures };
}

/**
 * chart.md §1.2 硬禁令 + §3.2 `parsing → legacy-render-only`:
 * 渲染产物(HTML / PNG / SVG)MAY 做 rendition,MUST NOT 做 source。
 * 返回命中的渲染产物形态,`null` 表示不是渲染产物。
 */
export function chartRenderArtifactKind(
  input: string | Uint8Array | null | undefined,
): "html" | "png" | "svg" | null {
  if (input == null) return null;
  if (typeof input !== "string") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (
      input.byteLength >= png.length &&
      png.every((byte, index) => input[index] === byte)
    ) {
      return "png";
    }
    let head = "";
    try {
      head = new TextDecoder("utf-8", { fatal: false }).decode(
        input.subarray(0, 512),
      );
    } catch {
      return null;
    }
    return chartRenderArtifactKind(head);
  }
  const head = input.replace(/^\uFEFF/, "").trimStart().slice(0, 512);
  if (/^<!doctype\s+html/i.test(head) || /^<html[\s>]/i.test(head)) return "html";
  if (/^<svg[\s>]/i.test(head)) return "svg";
  if (/^<\?xml[\s\S]*?<svg[\s>]/i.test(head)) return "svg";
  if (/^<script[\s>]/i.test(head)) return "html";
  return null;
}

/** chart.md §1.2:`source_format` 为 `html` 的图表 MUST NOT 落库为可编辑源。 */
export function chartSourceFormatIsForbidden(format: unknown): boolean {
  const normalized = String(format || "").trim().toLowerCase();
  return (
    normalized === "html" ||
    normalized === "text/html" ||
    normalized === "png" ||
    normalized === "image/png" ||
    normalized === "svg" ||
    normalized === "image/svg+xml"
  );
}

export class ChartHtmlSourceRejected extends Error {
  readonly code = "chart-html-source-forbidden" as const;
  readonly detected: string;

  constructor(detected: string) {
    super(
      `chart.md §1.2 硬禁令:渲染产物(${detected})只能做 preview/full/thumbnail rendition,MUST NOT 作为 oceanleo.chart.v1 的 source 落库。`,
    );
    this.name = "ChartHtmlSourceRejected";
    this.detected = detected;
  }
}

/**
 * 落库前的最后一道闸:source_format 与实际字节都不得是渲染产物。
 * `chart_option_evidence_is_present`(后端 `typed_artifact_models.py:513-521`)
 * 只认 `echarts-option+json` / `oceanleo.chart.v1`,本函数保证 UI 侧不会把
 * 别的东西送到那个断言面前。
 */
export function assertChartSourceIsNotRenderArtifact(args: {
  sourceFormat?: unknown;
  bytes?: string | Uint8Array | null;
}): void {
  if (chartSourceFormatIsForbidden(args.sourceFormat)) {
    throw new ChartHtmlSourceRejected(
      `source_format=${String(args.sourceFormat)}`,
    );
  }
  const kind = chartRenderArtifactKind(args.bytes);
  if (kind) throw new ChartHtmlSourceRejected(`${kind} bytes`);
}

export function chartDocumentFromCsv(csv: string): ChartDataTable {
  const rows = parseChartDataRows(csv.replace(/^\uFEFF/, ""))
    .map((row) =>
      row.map((cell, index) => {
        // parseChartDataRows already removes CSV quoting and unescapes doubled
        // quotes. Stripping quote characters again would corrupt literal data.
        const trimmed = cell.trim();
        const numeric = Number(trimmed);
        return index > 0 && trimmed !== "" && Number.isFinite(numeric)
          ? numeric
          : trimmed;
      }),
    );
  if (rows.length < 2) throw new Error("CSV 至少需要标题行和一行数据");
  if (rows.length > CHART_MAX_POINTS + 1) {
    throw new Error(`CSV 超过 ${CHART_MAX_POINTS} 行数据安全上限`);
  }
  if (rows.some((row) => row.length > CHART_MAX_SERIES + 1)) {
    throw new Error(`CSV 超过 ${CHART_MAX_SERIES} 个系列安全上限`);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// P1 XLSX 摄入
//
// 与 CSV 一样落在 schema 层:路由/workbench 动态 import 后调这里,
// 不把 exceljs 绑进 SSR 首包。日期 MUST 读单元格类型(Date/公式结果),
// MUST NOT 读 numFmt 渲染出来的显示文本。
// ---------------------------------------------------------------------------

export interface ChartXlsxIngestOptions {
  /** 工作表名或 1 基序号;缺省第一张。 */
  sheet?: string | number;
  /** A1 记法区域,如 `B2:E20`;缺省整张已用区域。 */
  range?: string;
  /** 首行是否表头;`null` 时自动猜,用户可在 UI 上翻。 */
  headerRow?: boolean | null;
}

export interface ChartXlsxIngestResult {
  table: ChartDataTable;
  sheets: string[];
  sheet: string;
  range?: string;
  headerRow: boolean;
  notices: string[];
}

type ExcelJsModule = typeof import("exceljs");

async function loadExcelJS(): Promise<ExcelJsModule> {
  const imported = (await import("exceljs")) as ExcelJsModule & {
    default?: ExcelJsModule;
  };
  return imported.Workbook ? imported : (imported.default ?? imported);
}

function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index;
}

/** 解析 `A1:D10` 为 1 基闭区间;列/行上下界会自动对调。 */
export function parseChartXlsxA1Range(
  range: string,
): { top: number; left: number; bottom: number; right: number } {
  const match = /^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/.exec(range.trim());
  if (!match) {
    throw new Error(`Excel 区域必须是 A1 记法,如 B2:E20,收到 ${range}`);
  }
  const left = columnLettersToIndex(match[1]);
  const top = Number(match[2]);
  const right = columnLettersToIndex(match[3]);
  const bottom = Number(match[4]);
  if (
    !Number.isFinite(top) ||
    !Number.isFinite(bottom) ||
    top < 1 ||
    bottom < 1
  ) {
    throw new Error(`Excel 区域行号无效: ${range}`);
  }
  return {
    top: Math.min(top, bottom),
    left: Math.min(left, right),
    bottom: Math.max(top, bottom),
    right: Math.max(left, right),
  };
}

/**
 * 从 ExcelJS 单元格取值。默认走类型(Date/Number/公式结果);
 * `preferDisplayText: true` 仅用于测试反面验证 —— 生产路径 MUST NOT 打开。
 */
export function chartXlsxCellValue(
  cell: {
    type?: number;
    value?: unknown;
    text?: string;
    result?: unknown;
  },
  options: { preferDisplayText?: boolean } = {},
): string | number | null {
  if (options.preferDisplayText) {
    const text = String(cell.text ?? "").trim();
    if (!text) return null;
    const numeric = Number(text);
    return Number.isFinite(numeric) && text !== "" ? numeric : text;
  }
  const valueTypeDate = 4;
  const valueTypeNumber = 2;
  const valueTypeFormula = 6;
  const valueTypeString = 3;
  if (cell.type === valueTypeDate) {
    const date =
      cell.value instanceof Date
        ? cell.value
        : new Date(String(cell.value ?? ""));
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }
  if (cell.type === valueTypeNumber) {
    return typeof cell.value === "number" && Number.isFinite(cell.value)
      ? cell.value
      : null;
  }
  if (cell.type === valueTypeFormula) {
    const formula = asRecord(cell.value);
    const result = formula?.result ?? cell.result;
    if (result instanceof Date) {
      return result.toISOString().slice(0, 10);
    }
    if (typeof result === "number" && Number.isFinite(result)) return result;
    if (result === null || result === undefined || result === "") return null;
    return boundedText(result, "", 120);
  }
  if (cell.type === valueTypeString) {
    const text = String(cell.value ?? cell.text ?? "").trim();
    return text || null;
  }
  const fallback = String(cell.value ?? cell.text ?? "").trim();
  if (!fallback) return null;
  const numeric = Number(fallback);
  return Number.isFinite(numeric) ? numeric : boundedText(fallback, "", 120);
}

function xlsxMergedMasterOnly(
  cell: { isMerged?: boolean; address?: string; master?: { address?: string } },
  notices: string[],
): boolean {
  if (!cell.isMerged) return true;
  const masterAddress = cell.master?.address || cell.address;
  if (cell.address !== masterAddress) {
    if (!notices.some((entry) => entry.includes("合并单元格"))) {
      notices.push(
        "合并单元格只保留左上角那一格的值,其余格跳过,不会重复计数。",
      );
    }
    return false;
  }
  return true;
}

/** 列出工作簿里全部工作表名,供 UI 下拉。 */
export async function chartXlsxListSheets(
  input: ArrayBuffer | Uint8Array,
): Promise<string[]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);
  return workbook.worksheets.map((sheet) => sheet.name);
}

/** XLSX 字节 → 与 CSV 相同形状的 `ChartDataTable`。 */
export async function chartTableFromXlsx(
  input: ArrayBuffer | Uint8Array,
  options: ChartXlsxIngestOptions = {},
): Promise<ChartXlsxIngestResult> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);
  const sheets = workbook.worksheets.map((sheet) => sheet.name);
  if (!sheets.length) throw new Error("Excel 文件里没有工作表");
  const sheetRef = options.sheet ?? sheets[0];
  const worksheet =
    typeof sheetRef === "number"
      ? workbook.worksheets[sheetRef - 1]
      : workbook.getWorksheet(sheetRef) || workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`找不到工作表 ${String(sheetRef)}`);
  }
  const notices: string[] = [];
  const bounds = options.range
    ? parseChartXlsxA1Range(options.range)
    : {
        top: 1,
        left: 1,
        bottom: worksheet.rowCount || 1,
        right: worksheet.columnCount || 1,
      };
  if (bounds.bottom - bounds.top + 1 > CHART_MAX_POINTS + 1) {
    throw new Error(`Excel 区域超过 ${CHART_MAX_POINTS} 行数据安全上限`);
  }
  if (bounds.right - bounds.left + 1 > CHART_MAX_SERIES + 1) {
    throw new Error(`Excel 区域超过 ${CHART_MAX_SERIES} 个系列安全上限`);
  }
  const rawRows: ChartDataTable = [];
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    const cells: Array<string | number> = [];
    let emptyRow = true;
    for (let col = bounds.left; col <= bounds.right; col += 1) {
      const cell = worksheet.getCell(row, col);
      if (!xlsxMergedMasterOnly(cell, notices)) {
        cells.push("");
        continue;
      }
      const value = chartXlsxCellValue(cell);
      if (value !== null && value !== "") emptyRow = false;
      cells.push(value === null ? "" : value);
    }
    if (!emptyRow) rawRows.push(cells);
  }
  if (rawRows.length < 2) {
    throw new Error("Excel 区域至少需要标题行和一行数据");
  }
  const headerRow =
    options.headerRow ??
    guessHeaderRow(
      rawRows.map((row) =>
        row.map((cell) =>
          cell === "" ? null : typeof cell === "number" ? cell : String(cell),
        ),
      ),
    );
  if (options.headerRow === null || options.headerRow === undefined) {
    notices.push(
      headerRow
        ? "已把区域第一行当作表头；如果不对，可以在导入时改掉。"
        : "区域第一行看起来是数据，已按「没有表头」处理。",
    );
  }
  const table = headerRow
    ? rawRows
    : [
        Array.from({ length: rawRows[0].length }, (_, index) =>
          index === 0 ? "分类" : `系列 ${index}`,
        ),
        ...rawRows,
      ];
  return {
    table,
    sheets,
    sheet: worksheet.name,
    ...(options.range ? { range: options.range } : {}),
    headerRow,
    notices,
  };
}

/** XLSX 字节 → 图表文档(与 CSV 导入后的 `replaceChartData` 等价结果)。 */
export async function chartDocumentFromXlsx(
  input: ArrayBuffer | Uint8Array,
  options: ChartXlsxIngestOptions & {
    title?: string;
    type?: ChartSeriesType;
  } = {},
): Promise<{ document: ChartDocumentV1; ingest: ChartXlsxIngestResult }> {
  const ingest = await chartTableFromXlsx(input, options);
  const stub = normalizeChartDocument({
    schema: CHART_DOCUMENT_SCHEMA,
    option: {
      title: { text: options.title || ingest.sheet },
      xAxis: { type: "category", data: ["—"] },
      yAxis: { type: "value" },
      series: [
        {
          id: "series-1",
          name: "系列 1",
          type: "bar",
          data: [0],
          label: { show: false },
        },
      ],
    },
  });
  let document = replaceChartData(stub, ingest.table);
  if (options.type) {
    document = normalizeChartDocument({
      ...document,
      option: {
        ...document.option,
        series: document.option.series.map((series) => ({
          ...series,
          type: options.type,
        })),
      },
    });
  }
  if (options.title) {
    document = normalizeChartDocument({
      ...document,
      option: {
        ...document.option,
        title: { ...document.option.title, text: options.title },
      },
    });
  }
  return { document, ingest };
}

// ---------------------------------------------------------------------------
// P5 标注预设
//
// 图表默认只「展示数据」。一条平均线、一条目标线、一段区间高亮,是让它开始
// 「说明观点」的最小一步 —— 读者不必自己在心里算平均值。
// ---------------------------------------------------------------------------

/** 平均 / 最小 / 最大 / 中位数四条统计线,由 ECharts 自己按当前数据算。 */
export function chartStatMarkLine(
  kinds: ReadonlyArray<"average" | "min" | "max" | "median">,
  labels: Partial<Record<"average" | "min" | "max" | "median", string>> = {},
): ChartMarkLine | undefined {
  return normalizeMarkLine({
    silent: true,
    data: kinds.map((type) => ({
      type,
      name: labels[type] || "",
      label: { show: true, formatter: labels[type] || "" },
    })),
  });
}

/** 一条常量阈值线(目标值 / 红线 / 预算)。 */
export function chartThresholdMarkLine(
  value: number,
  name = "",
): ChartMarkLine | undefined {
  return normalizeMarkLine({
    silent: true,
    data: [{ yAxis: value, name, label: { show: true, formatter: name } }],
  });
}

/** 一段纵向区间高亮(达标带 / 风险带)。 */
export function chartBandMarkArea(
  from: number,
  to: number,
  name = "",
): ChartMarkArea | undefined {
  return normalizeMarkArea({
    silent: true,
    data: [[{ yAxis: Math.min(from, to), name }, { yAxis: Math.max(from, to) }]],
  });
}

// ---------------------------------------------------------------------------
// P2 表格 → 图表
//
// 用户在表格里把数据整理好之后,今天唯一的成图路径是「导出 CSV,再到图表编辑器
// 导入」。下面这一层是图表侧的接收端:grid 侧只需要把一段选区按**值的类型**
// 交过来,剩下的图型推荐、维度命名、文档构造都在这里。
//
// **单向快照,不是活链接**:表格后续改动不会回流到图表。跨 artifact 的依赖追踪
// 是另一件事,不在本轮。
// ---------------------------------------------------------------------------

/** grid 侧要发的命令 id。参数与语义见 `ChartRangeSnapshotV1`。 */
export const CHART_CREATE_FROM_RANGE_COMMAND =
  "chart-editor@1.create-from-range" as const;

export const CHART_RANGE_SNAPSHOT_SCHEMA =
  "oceanleo.chart.range-snapshot.v1" as const;

export type ChartRangeCell = string | number | null;

/**
 * 表格选区快照。**每一格给值,不要给显示文本** —— 日期在这里最容易错成字符串:
 * grid 画布上显示的 `2024/03` 是格式化结果,交过来的必须是 `2024-03-01` 这类
 * 可判定的值,或者由 `columnTypes` 明说这一列是 `time`。
 */
export interface ChartRangeSnapshotV1 {
  schema: typeof CHART_RANGE_SNAPSHOT_SCHEMA;
  /** 源表格名,进图表标题;缺省时标题留给用户自己填。 */
  sourceName?: string;
  /** 选区的 A1 记法,只用于回溯与提示文案,图表侧不解析它。 */
  range?: string;
  /** 首行是不是表头。grid 侧确定就给,不确定给 `null`,由图表侧猜。 */
  headerRow: boolean | null;
  /** 首列是不是分类标签列。同上。 */
  headerColumn: boolean | null;
  /** 每一列的语义,grid 侧知道就给;长度与选区列数对齐,不知道的位置给 `null`。 */
  columnTypes?: Array<"ordinal" | "number" | "time" | null>;
  /** 选区单元格,行优先。空格子给 `null`,MUST NOT 给 `0`。 */
  cells: ChartRangeCell[][];
}

export type ChartRecommendedType = Extract<
  ChartSeriesType,
  "bar" | "line" | "scatter" | "pie"
>;

export interface ChartTypeRecommendation {
  type: ChartRecommendedType;
  /** 讲给用户听的一句话,不是内部代号。推荐永远可以被改掉。 */
  reason: string;
}

export interface ChartRangeIngest {
  table: ChartDataTable;
  recommendation: ChartTypeRecommendation;
  dimensions: ChartDatasetDimension[];
  /** 摄入过程中做过的、用户需要知道的处理(丢空行、截断、猜表头)。 */
  notices: string[];
}

function rangeCellText(value: ChartRangeCell): string {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? String(value) : boundedText(value, "", 120);
}

function rangeCellNumber(value: ChartRangeCell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

// 只认带分隔符的日期形态。光一个 `2024` 既可能是年份也可能是销量,
// 把它判成时间序列会让一整列数值被当成分类轴。
const DATE_LIKE = /^\d{4}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?$|^\d{4}-\d{2}$/;

function dateLike(value: ChartRangeCell): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return DATE_LIKE.test(trimmed) && Number.isFinite(Date.parse(trimmed.replace(/[年月]/g, "-").replace(/日$/, "")));
}

function looksNumericColumn(column: ChartRangeCell[]): boolean {
  const filled = column.filter((cell) => cell !== null && cell !== "");
  if (!filled.length) return false;
  return filled.every((cell) => rangeCellNumber(cell) !== null);
}

export function normalizeChartRangeSnapshot(
  value: unknown,
): ChartRangeSnapshotV1 {
  const root = asRecord(value);
  if (!root) throw new Error("表格选区快照必须是一个对象");
  if (root.schema !== CHART_RANGE_SNAPSHOT_SCHEMA) {
    throw new Error(
      `表格选区快照的 schema 必须是 ${CHART_RANGE_SNAPSHOT_SCHEMA},收到 ${String(root.schema || "缺失")}`,
    );
  }
  const rawCells = Array.isArray(root.cells) ? root.cells : [];
  // 空行整行丢掉:表格里的视觉分隔空行不该在图表上变成一个空分类。
  const cells = rawCells
    .map((row) =>
      (Array.isArray(row) ? row : []).map((cell): ChartRangeCell => {
        if (cell === null || cell === undefined || cell === "") return null;
        if (typeof cell === "number") {
          return Number.isFinite(cell) ? cell : null;
        }
        return boundedText(cell, "", 120);
      }),
    )
    .filter((row) => row.some((cell) => cell !== null));
  if (cells.length < 2) {
    throw new Error("表格选区至少要有两行(表头 + 一行数据,或两行数据)");
  }
  const width = Math.max(...cells.map((row) => row.length));
  if (width < 2) {
    throw new Error("表格选区至少要有两列");
  }
  if (width > CHART_MAX_SERIES + 1) {
    throw new Error(`表格选区超过 ${CHART_MAX_SERIES} 个系列安全上限`);
  }
  if (cells.length > CHART_MAX_POINTS + 1) {
    throw new Error(`表格选区超过 ${CHART_MAX_POINTS} 行数据安全上限`);
  }
  const columnTypes = Array.isArray(root.columnTypes)
    ? Array.from({ length: width }, (_, index) => {
        const declared = root.columnTypes as unknown[];
        const entry = boundedText(declared[index], "", 16);
        return (CHART_DIMENSION_TYPES as readonly string[]).includes(entry)
          ? (entry as ChartDatasetDimension["type"])
          : null;
      })
    : undefined;
  return {
    schema: CHART_RANGE_SNAPSHOT_SCHEMA,
    ...(boundedText(root.sourceName, "", 120)
      ? { sourceName: boundedText(root.sourceName, "", 120) }
      : {}),
    ...(boundedText(root.range, "", 40)
      ? { range: boundedText(root.range, "", 40) }
      : {}),
    headerRow: typeof root.headerRow === "boolean" ? root.headerRow : null,
    headerColumn:
      typeof root.headerColumn === "boolean" ? root.headerColumn : null,
    ...(columnTypes ? { columnTypes } : {}),
    // 补齐成矩形:grid 的选区右下角可能是空格子,行长不齐。
    cells: cells.map((row) =>
      Array.from({ length: width }, (_, index) => row[index] ?? null),
    ),
  };
}

/**
 * 四种数据形态各推荐一种画法。推荐是**默认值不是强制**:
 * `chartDocumentFromRangeSnapshot` 的 `type` 参数一律优先于这里的结论。
 */
export function recommendChartType(
  snapshot: ChartRangeSnapshotV1,
): ChartTypeRecommendation {
  const { cells } = snapshot;
  const headerRow = snapshot.headerRow ?? guessHeaderRow(cells);
  const body = headerRow ? cells.slice(1) : cells;
  const width = cells[0].length;
  const columns = Array.from({ length: width }, (_, index) =>
    body.map((row) => row[index] ?? null),
  );
  const declared = snapshot.columnTypes || [];
  const numericColumn = columns.map((column, index) =>
    declared[index] === "number" ? true : declared[index] ? false : looksNumericColumn(column),
  );
  const firstIsCategory =
    snapshot.headerColumn ?? (declared[0] ? declared[0] !== "number" : !numericColumn[0]);

  if (!firstIsCategory && numericColumn.filter(Boolean).length >= 2) {
    return {
      type: "scatter",
      reason: "两列都是数值，用散点看它们之间有没有关系。",
    };
  }
  const timeColumn =
    declared[0] === "time" ||
    (columns[0].filter((cell) => cell !== null).length > 0 &&
      columns[0]
        .filter((cell) => cell !== null)
        .every((cell) => dateLike(cell)));
  if (firstIsCategory && timeColumn) {
    return {
      type: "line",
      reason: "第一列是时间，用折线看走势。",
    };
  }
  const valueColumns = numericColumn.slice(1).filter(Boolean).length;
  if (firstIsCategory && valueColumns === 1) {
    const values = columns[numericColumn.findIndex((flag, index) => flag && index > 0)]
      .map(rangeCellNumber)
      .filter((entry): entry is number => entry !== null);
    const total = values.reduce((sum, entry) => sum + entry, 0);
    const shareHeader = headerRow
      ? /占比|比例|份额|share|percent|ratio|%/i.test(rangeCellText(cells[0][1]))
      : false;
    const sumsToWhole =
      values.length > 1 &&
      values.every((entry) => entry >= 0) &&
      (Math.abs(total - 100) < 0.5 || Math.abs(total - 1) < 0.005);
    if ((shareHeader || sumsToWhole) && values.length <= 12) {
      return {
        type: "pie",
        reason: "这一列是各部分占整体的比例，用饼图看构成。",
      };
    }
  }
  return {
    type: "bar",
    reason: "一列分类配一列数值，用柱状图比大小。",
  };
}

function guessHeaderRow(cells: ChartRangeCell[][]): boolean {
  if (cells.length < 2) return false;
  const first = cells[0];
  const second = cells[1];
  const firstHasNumber = first
    .slice(1)
    .some((cell) => typeof cell === "number" || rangeCellNumber(cell) !== null);
  const secondHasNumber = second
    .slice(1)
    .some((cell) => rangeCellNumber(cell) !== null);
  return !firstHasNumber && secondHasNumber;
}

/** 表头行的猜测结果。用户可以在 UI 上翻掉它,所以要能单独问。 */
export function guessChartRangeHeaderRow(
  snapshot: ChartRangeSnapshotV1,
): boolean {
  return snapshot.headerRow ?? guessHeaderRow(snapshot.cells);
}

export function chartTableFromRangeSnapshot(
  snapshot: ChartRangeSnapshotV1,
  options: { headerRow?: boolean } = {},
): ChartRangeIngest {
  const notices: string[] = [];
  const headerRow = options.headerRow ?? guessChartRangeHeaderRow(snapshot);
  if (snapshot.headerRow === null && options.headerRow === undefined) {
    notices.push(
      headerRow
        ? "已把选区第一行当作表头；如果不对，可以在导入时改掉。"
        : "选区第一行看起来是数据，已按「没有表头」处理。",
    );
  }
  const width = snapshot.cells[0].length;
  const header = headerRow
    ? snapshot.cells[0].map((cell, index) =>
        rangeCellText(cell) || (index === 0 ? "分类" : `系列 ${index}`),
      )
    : Array.from({ length: width }, (_, index) =>
        index === 0 ? "分类" : `系列 ${index}`,
      );
  const body = headerRow ? snapshot.cells.slice(1) : snapshot.cells;
  if (!body.length) throw new Error("表格选区去掉表头之后没有数据行");
  const table: ChartDataTable = [
    header,
    ...body.map((row) =>
      row.map((cell, index) => {
        if (index === 0) return rangeCellText(cell) || "—";
        const numeric = rangeCellNumber(cell);
        // 空格子不补 0:0 是一个真实的读数,缺失不是。
        return numeric === null ? "" : numeric;
      }),
    ),
  ];
  const dimensions: ChartDatasetDimension[] = header.map((name, index) => ({
    name: boundedText(name, `维度 ${index + 1}`, 64),
    type:
      snapshot.columnTypes?.[index] ??
      (index === 0
        ? body.every((row) => row[0] === null || dateLike(row[0]))
          ? "time"
          : "ordinal"
        : "number"),
  }));
  return {
    table,
    dimensions,
    notices,
    recommendation: recommendChartType({ ...snapshot, headerRow }),
  };
}

/**
 * 接收端入口:一段选区 → 一份可编辑的图表文档。
 * `type` 传了就用传的,这是「推荐可被覆盖」的机器保证。
 */
export function chartDocumentFromRangeSnapshot(
  value: unknown,
  options: { type?: ChartSeriesType; headerRow?: boolean; title?: string } = {},
): { document: ChartDocumentV1; ingest: ChartRangeIngest } {
  const snapshot = normalizeChartRangeSnapshot(value);
  const ingest = chartTableFromRangeSnapshot(snapshot, {
    ...(options.headerRow === undefined ? {} : { headerRow: options.headerRow }),
  });
  const type = options.type || ingest.recommendation.type;
  if (!SERIES_TYPES.has(type)) {
    throw new Error(`unsupported chart series type: ${type}`);
  }
  const [header, ...rows] = ingest.table;
  const title =
    options.title ||
    (snapshot.sourceName
      ? `${snapshot.sourceName}${snapshot.range ? ` ${snapshot.range}` : ""}`
      : "");
  const document = normalizeChartDocument({
    schema: CHART_DOCUMENT_SCHEMA,
    ...(title ? { title } : {}),
    dataset: {
      dimensions: ingest.dimensions,
      source: [header, ...rows],
    },
    option: {
      title: { text: title },
      grid: {
        left: CHART_LAYOUT.gridLeft,
        right: CHART_LAYOUT.gridRight,
        top: CHART_LAYOUT.gridTop,
        bottom: CHART_LAYOUT.gridBottom,
      },
      xAxis: {
        type: "category",
        name: header[0],
        data: rows.map((row) => String(row[0])),
      },
      yAxis: { type: "value" },
      series: header.slice(1).map((name, index) => ({
        id: safeId(name, `series-${index + 1}`),
        name: String(name),
        type,
        data:
          type === "pie"
            ? rows.map((row) => ({
                name: String(row[0]),
                value: finiteNumber(row[index + 1]),
              }))
            : rows.map((row) => finiteNumber(row[index + 1])),
        label: { show: false },
      })),
    },
  });
  return { document, ingest };
}
