// 图表的多人同改适配器 + 回放纯函数（work-chat W13，契约 §8.4 / §9.15）。
//
// 实体模型：
//   order    = 全部实体 key：先是 `series:<系列 id>`（先后 = 系列顺序），再是下面的配置块 key（W11 的绑定只保留 order 里列出的实体）；
//   系列实体  key = `series:<id>`，字段 = 该系列 JSON 的顶层键（name/type/data/color/label/stack/markLine…）；
//   配置块    `block:title`（option.title）、`block:xAxis`、`block:yAxis`（单轴 shape="single" + 轴字段，双轴 shape="array" + axes）、
//             `block:legend`、`block:dataset`（有才有）、`block:option`（option 里其余键：color、tooltip…）、`block:doc`（文档顶层其余键：schema、title、indicators…）；
//   meta     = {}。
// 同一系列的不同属性、不同系列、标题、坐标轴、图例、数据集各自独立合并；同一属性后写者胜。
// 系列的可选字段缺失时写 null（清掉某个属性也能同步），fromEntities 把 null 还原成「没有」。
//
// 纯函数，不依赖 React / 浏览器 / yjs；React 部分在 src/shell/replay/work/frames/chart.tsx。
import type { ChartDocumentV1 } from "../../chart-editor/chart-schema";
import { normalizeChartDocument } from "../../chart-editor/chart-schema";

export const CHART_COLLAB_ROOT = "oceanleo:chart";

export interface EntityState {
  order: string[];
  entities: Record<string, Record<string, unknown>>;
  meta: Record<string, unknown>;
}

/** 从协同文档读实体（W11 的 `readEntityState` 落地后可替换；布局见 W13-requests）。 */
export function readEntityStateFromY(doc: unknown, rootName: string): EntityState {
  const root = (doc as { getMap?: (name: string) => { get(key: string): unknown } } | null)?.getMap?.(rootName);
  const plain = (value: unknown): unknown =>
    value && typeof (value as { toJSON?: () => unknown }).toJSON === "function"
      ? (value as { toJSON: () => unknown }).toJSON()
      : value;
  const order = plain(root?.get("order"));
  const entities = plain(root?.get("entities"));
  const meta = plain(root?.get("meta"));
  return {
    order: Array.isArray(order) ? order.map(String) : [],
    entities: entities && typeof entities === "object" ? (entities as EntityState["entities"]) : {},
    meta: meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {},
  };
}

type Rec = Record<string, unknown>;

const SERIES_FIELDS = ["id", "name", "type", "data", "color", "label", "yAxisIndex", "stack", "areaStyle", "markLine", "markArea"] as const;

export const CHART_BLOCKS = {
  title: "block:title",
  xAxis: "block:xAxis",
  yAxis: "block:yAxis",
  legend: "block:legend",
  dataset: "block:dataset",
  option: "block:option",
  doc: "block:doc",
} as const;

export const chartSeriesKey = (id: string): string => `series:${id}`;

function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function asRec(value: unknown): Rec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

function withKind(kind: string, fields: Rec): Rec {
  return { kind, ...cloneJson(fields) };
}

export function chartToEntities(document: ChartDocumentV1): EntityState {
  const { option: rawOption, dataset, ...docRest } = document as unknown as Rec & { option: Rec };
  const option = asRec(rawOption);
  const { title, legend, xAxis, yAxis, series, ...optionRest } = option;
  const entities: Record<string, Rec> = {};
  const order: string[] = [];
  const seen = new Set<string>();
  (Array.isArray(series) ? series : []).forEach((item, index) => {
    const row = asRec(item);
    let id = typeof row.id === "string" && row.id ? row.id : `series-${index + 1}`;
    while (seen.has(id)) id = `${id}~${index}`;
    seen.add(id);
    const entity: Rec = { kind: "series" };
    for (const name of SERIES_FIELDS) entity[name] = row[name] === undefined ? null : cloneJson(row[name]);
    entity.id = id;
    for (const name of Object.keys(row)) if (!(name in entity)) entity[name] = cloneJson(row[name]);
    entities[chartSeriesKey(id)] = entity;
    order.push(chartSeriesKey(id));
  });
  entities[CHART_BLOCKS.title] = withKind("title", asRec(title));
  entities[CHART_BLOCKS.legend] = withKind("legend", asRec(legend));
  entities[CHART_BLOCKS.xAxis] = withKind("xAxis", asRec(xAxis));
  entities[CHART_BLOCKS.yAxis] = Array.isArray(yAxis)
    ? { kind: "yAxis", shape: "array", axes: cloneJson(yAxis) }
    : withKind("yAxis", { ...asRec(yAxis), shape: "single" });
  if (dataset !== undefined && dataset !== null) entities[CHART_BLOCKS.dataset] = withKind("dataset", asRec(dataset));
  entities[CHART_BLOCKS.option] = withKind("option", optionRest);
  entities[CHART_BLOCKS.doc] = withKind("doc", docRest);
  for (const key of Object.values(CHART_BLOCKS)) if (entities[key]) order.push(key);
  return { order, entities, meta: {} };
}

function fields(entity: Rec | undefined, drop: string[] = []): Rec {
  const out: Rec = {};
  for (const [name, value] of Object.entries(entity ?? {})) {
    if (name === "kind" || drop.includes(name)) continue;
    if (value === null || value === undefined) continue;
    out[name] = cloneJson(value);
  }
  return out;
}

export function chartFromEntities(input: EntityState, prev: ChartDocumentV1 | null): ChartDocumentV1 {
  const prevOption = asRec((prev as unknown as Rec | null)?.option);
  const series: Rec[] = [];
  const seen = new Set<string>();
  for (const key of input.order) {
    const entity = input.entities[key];
    if (seen.has(key) || !entity || entity.kind !== "series") continue;
    seen.add(key);
    series.push(fields(entity));
  }
  const blocks = input.entities;
  const title = blocks[CHART_BLOCKS.title] ? fields(blocks[CHART_BLOCKS.title]) : asRec(prevOption.title);
  const legend = blocks[CHART_BLOCKS.legend] ? fields(blocks[CHART_BLOCKS.legend]) : asRec(prevOption.legend);
  const xAxis = blocks[CHART_BLOCKS.xAxis] ? fields(blocks[CHART_BLOCKS.xAxis]) : asRec(prevOption.xAxis);
  const yBlock = blocks[CHART_BLOCKS.yAxis];
  const yAxis: unknown = yBlock
    ? yBlock.shape === "array" && Array.isArray(yBlock.axes)
      ? cloneJson(yBlock.axes)
      : fields(yBlock, ["shape"])
    : prevOption.yAxis;
  const option: Rec = {
    ...fields(blocks[CHART_BLOCKS.option]),
    title,
    legend,
    xAxis,
    yAxis,
    series,
  };
  const doc: Rec = { ...fields(blocks[CHART_BLOCKS.doc]), option };
  if (blocks[CHART_BLOCKS.dataset]) doc.dataset = fields(blocks[CHART_BLOCKS.dataset]);
  return doc as unknown as ChartDocumentV1;
}

/** awareness 的选择：选中的系列 → 实体 key。 */
export function chartSelectionKeys(seriesIds: readonly string[]): string[] {
  return seriesIds.filter(Boolean).map(chartSeriesKey);
}

// ---------------------------------------------------------------- 回放用纯函数

export function chartFromY(doc: unknown): ChartDocumentV1 | null {
  const state = readEntityStateFromY(doc, CHART_COLLAB_ROOT);
  return state.order.length || state.entities[CHART_BLOCKS.option] ? chartFromEntities(state, null) : null;
}

/** 版本 JSON → 快照（用图表编辑器自己的归一化；读不懂返回 null）。 */
export function chartFromRevision(json: unknown): ChartDocumentV1 | null {
  try {
    return normalizeChartDocument(json);
  } catch {
    return null;
  }
}

export function chartToArtifactJson(snapshot: unknown): unknown {
  const value = snapshot as ChartDocumentV1 | null;
  if (!value || !value.option || !Array.isArray(value.option.series)) return null;
  return cloneJson(value);
}

interface ChangeNote {
  zh: string;
  vars?: Record<string, string | number>;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function seriesOf(document: ChartDocumentV1 | null | undefined): Rec[] {
  const list = (document as unknown as { option?: { series?: unknown } } | null | undefined)?.option?.series;
  return Array.isArray(list) ? (list as Rec[]) : [];
}

/** 两版之间变了的系列 id（新增 + 改动）。 */
export function chartChangedSeries(prev: ChartDocumentV1 | null | undefined, next: ChartDocumentV1): Set<string> {
  const before = new Map(seriesOf(prev).map((item) => [String(item.id), item]));
  const out = new Set<string>();
  for (const item of seriesOf(next)) {
    const id = String(item.id);
    if (!before.has(id) || !sameJson(before.get(id), item)) out.add(id);
  }
  return out;
}

export function chartChangeNote(prevRaw: unknown, nextRaw: unknown): ChangeNote | null {
  const prev = prevRaw as ChartDocumentV1 | null | undefined;
  const next = nextRaw as ChartDocumentV1 | null | undefined;
  if (!next || !next.option) return null;
  if (!prev || !prev.option) return { zh: "创建了图表" };
  const before = new Map(seriesOf(prev).map((item) => [String(item.id), item]));
  const after = new Map(seriesOf(next).map((item) => [String(item.id), item]));
  for (const [id, item] of after) {
    if (!before.has(id)) return { zh: "新增了系列「{name}」", vars: { name: String(item.name ?? id) } };
  }
  for (const [id, item] of before) {
    if (!after.has(id)) return { zh: "删除了系列「{name}」", vars: { name: String(item.name ?? id) } };
  }
  for (const [id, item] of after) {
    const was = before.get(id) as Rec;
    if (sameJson(was, item)) continue;
    const name = String(item.name ?? id);
    if (!sameJson(was.data, item.data)) return { zh: "改了系列「{name}」的数据", vars: { name } };
    if (was.name !== item.name) return { zh: "给系列改了名「{name}」", vars: { name } };
    return { zh: "改了系列「{name}」的样式", vars: { name } };
  }
  if (!sameJson(seriesOf(prev).map((item) => item.id), seriesOf(next).map((item) => item.id))) return { zh: "调整了系列顺序" };
  const a = prev.option as unknown as Rec;
  const b = next.option as unknown as Rec;
  if (!sameJson(a.title, b.title)) return { zh: "改了图表标题" };
  if (!sameJson(a.xAxis, b.xAxis) || !sameJson(a.yAxis, b.yAxis)) return { zh: "改了坐标轴" };
  if (!sameJson(a.legend, b.legend)) return { zh: "改了图例" };
  if (!sameJson((prev as unknown as Rec).dataset, (next as unknown as Rec).dataset)) return { zh: "改了数据表" };
  if (!sameJson(a.color, b.color) || !sameJson(a.tooltip, b.tooltip)) return { zh: "改了配色或提示框" };
  if (!sameJson({ ...(prev as unknown as Rec), option: null }, { ...(next as unknown as Rec), option: null })) return { zh: "改了图表说明" };
  return null;
}

export function chartDescribeChange(prev: unknown, next: unknown): string | null {
  const note = chartChangeNote(prev, next);
  if (!note) return null;
  return note.zh.replace(/\{(\w+)\}/g, (match, key: string) => (note.vars && key in note.vars ? String(note.vars[key]) : match));
}
