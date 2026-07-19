export const CHART_DOCUMENT_SCHEMA = "oceanleo.chart.v1" as const;

export type ChartSeriesType =
  | "bar"
  | "line"
  | "pie"
  | "gauge"
  | "scatter"
  | "radar"
  | "funnel";
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

export interface ChartSeries {
  [key: string]: unknown;
  id: string;
  name: string;
  type: ChartSeriesType;
  data: ChartDatum[];
  color?: string;
  label: { show: boolean } & Record<string, unknown>;
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
  yAxis: ChartAxis;
  series: ChartSeries[];
}

export interface ChartDocumentV1 {
  [key: string]: unknown;
  schema: typeof CHART_DOCUMENT_SCHEMA;
  editor?: string;
  category?: string;
  effect?: string;
  option: ChartOption;
}

export type ChartDataTable = Array<Array<string | number>>;

const DEFAULT_COLORS = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
];
const SERIES_TYPES = new Set<ChartSeriesType>([
  "bar",
  "line",
  "pie",
  "gauge",
  "scatter",
  "radar",
  "funnel",
]);
const MAX_SERIES = 20;
const MAX_POINTS = 500;
const MAX_DIMENSIONS = 32;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
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
    data: rawData.slice(0, MAX_POINTS).map((entry) => boundedText(entry, String(entry), 120)),
    min,
    max,
    interval: interval !== undefined && interval > 0 ? interval : undefined,
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

function normalizeDatum(value: unknown, index: number): ChartDatum {
  if (Array.isArray(value)) {
    return value.slice(0, MAX_DIMENSIONS).map(finiteNumber);
  }
  const record = asRecord(value);
  if (record) {
    const rawValue = record.value;
    return {
      ...record,
      name: boundedText(record.name, `数据 ${index + 1}`, 120),
      value: Array.isArray(rawValue)
        ? rawValue.slice(0, MAX_DIMENSIONS).map(finiteNumber)
        : finiteNumber(rawValue),
    };
  }
  return finiteNumber(value);
}

function normalizeSeries(value: unknown, index: number): ChartSeries {
  const series = asRecord(value);
  if (!series) throw new Error(`chart series ${index + 1} must be an object`);
  const type = boundedText(series.type, "bar") as ChartSeriesType;
  if (!SERIES_TYPES.has(type)) {
    throw new Error(`unsupported chart series type: ${type || "unknown"}`);
  }
  const label = asRecord(series.label);
  const itemStyle = asRecord(series.itemStyle);
  const color =
    colorValue(series.color) ||
    colorValue(itemStyle?.color) ||
    "";
  return {
    ...series,
    id: safeId(series.id, `series-${index + 1}`),
    name: boundedText(series.name, `系列 ${index + 1}`, 120),
    type,
    data: (Array.isArray(series.data) ? series.data : [])
      .slice(0, MAX_POINTS)
      .map(normalizeDatum),
    ...(color
      ? { color, itemStyle: { ...(itemStyle || {}), color } }
      : {}),
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
  const root = asRecord(value);
  if (!root) throw new Error("chart JSON root must be an object");
  const versioned = root.schema === CHART_DOCUMENT_SCHEMA;
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
  const series = uniqueSeriesIds(
    (Array.isArray(option.series) ? option.series : [])
      .slice(0, MAX_SERIES)
      .map(normalizeSeries),
  );
  if (!series.length) throw new Error("chart JSON must contain at least one series");
  const position =
    legend.position === "bottom" ||
    legend.position === "left" ||
    legend.position === "right"
      ? legend.position
      : "top";
  const colors = rawColors.map(colorValue).filter(Boolean).slice(0, MAX_SERIES);
  return {
    ...(versioned ? root : {}),
    schema: CHART_DOCUMENT_SCHEMA,
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
      yAxis: normalizeAxis(option.yAxis, "value"),
      series,
    },
  };
}

export function chartDocumentFromJson(json: string): ChartDocumentV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("chart source must be valid JSON; HTML/scripts are never evaluated");
  }
  return normalizeChartDocument(parsed);
}

export function chartDocumentToJson(document: ChartDocumentV1): string {
  return JSON.stringify(normalizeChartDocument(document), null, 2);
}

function cloneDocument(document: ChartDocumentV1): ChartDocumentV1 {
  return chartDocumentFromJson(chartDocumentToJson(document));
}

export function patchChartAxis(
  document: ChartDocumentV1,
  axis: "x" | "y",
  patch: Partial<ChartAxis>,
): ChartDocumentV1 {
  const next = cloneDocument(document);
  const key = axis === "x" ? "xAxis" : "yAxis";
  next.option[key] = normalizeAxis(
    { ...next.option[key], ...patch },
    axis === "x" ? "category" : "value",
  );
  return normalizeChartDocument(next);
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
  );
  return normalizeChartDocument(next);
}

export function appendChartSeries(
  document: ChartDocumentV1,
  series: ChartSeries,
): ChartDocumentV1 {
  const next = cloneDocument(document);
  if (next.option.series.length >= MAX_SERIES) {
    throw new Error(`chart supports at most ${MAX_SERIES} series`);
  }
  next.option.series.push(normalizeSeries(series, next.option.series.length));
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
  const header = table[0].slice(0, MAX_SERIES + 1);
  const rows = table.slice(1, MAX_POINTS + 1);
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
  if (source.length > 2_000_000) throw new Error("CSV 超过 2MB 安全上限");
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

export function chartDocumentFromCsv(csv: string): ChartDataTable {
  const rows = parseChartDataRows(csv.replace(/^\uFEFF/, ""))
    .slice(0, MAX_POINTS + 1)
    .map((row) =>
      row.slice(0, MAX_SERIES + 1).map((cell, index) => {
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
  return rows;
}
