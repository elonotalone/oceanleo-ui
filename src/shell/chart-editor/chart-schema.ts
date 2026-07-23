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
export const CHART_MAX_SERIES = 20;
export const CHART_MAX_POINTS = 500;
export const CHART_MAX_DIMENSIONS = 32;

const FORBIDDEN_OPTION_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "renderitem",
]);
const textEncoder = new TextEncoder();

function unsafeOptionString(value: string, key: string): boolean {
  const trimmed = value.trim();
  const resourceField =
    /(?:url|uri|href|link|src|image)$/i.test(key) ||
    key.toLowerCase() === "symbol";
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
  const visit = (entry: unknown, depth: number, key = ""): void => {
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
      if (unsafeOptionString(entry, key)) {
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
      visit(descriptor.value, depth + 1, childKey);
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

function normalizeSeries(value: unknown, index: number): ChartSeries {
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
  return {
    ...series,
    id: safeId(series.id, `series-${index + 1}`),
    name: boundedText(series.name, `系列 ${index + 1}`, 120),
    type,
    data: (Array.isArray(series.data) ? series.data : []).map(normalizeDatum),
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
  assertChartDataOnly(value, { allowUndefined: true });
  assertChartSourceSize(value);
  const root = asRecord(value);
  if (!root) throw new Error("chart JSON root must be an object");
  if ("schema" in root && root.schema !== CHART_DOCUMENT_SCHEMA) {
    throw new Error(`unsupported chart schema: ${String(root.schema || "missing")}`);
  }
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
  if (rawColors.length > CHART_MAX_SERIES) {
    throw new Error(`chart palette exceeds ${CHART_MAX_SERIES} colors`);
  }
  const rawSeries = Array.isArray(option.series) ? option.series : [];
  if (rawSeries.length > CHART_MAX_SERIES) {
    throw new Error(`chart supports at most ${CHART_MAX_SERIES} series`);
  }
  const series = uniqueSeriesIds(
    rawSeries.map(normalizeSeries),
  );
  if (!series.length) throw new Error("chart JSON must contain at least one series");
  const position =
    legend.position === "bottom" ||
    legend.position === "left" ||
    legend.position === "right"
      ? legend.position
      : "top";
  const colors = rawColors.map(colorValue).filter(Boolean);
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
  if (next.option.series.length >= CHART_MAX_SERIES) {
    throw new Error(`chart supports at most ${CHART_MAX_SERIES} series`);
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
