/**
 * @deprecated 整个模块已废弃，**不许再有新的调用方**。
 *
 * 它是「按键点下去总得显示点什么」那一版的产物：5 份通用空白模板，按载体类型
 * 反查发给全平台所有按键。结果是点地图、点台账、点换算器打开的都是同一份
 * 「未命名可算文档 · 输入 A / 输入 B / 比例」——操作员那句「显示的极其简陋」
 * 说的就是它。按键现在按插件身份派发，第一屏由该插件自己的初始态提供
 * （`plugin-initial-state.ts` + `plugin-initial-states/`），**没有任何一枚按键
 * 还会走到本模块**：`ResultCanvas` 与 `workbench-routes` 的两处消费都已拆掉。
 *
 * 文件保留而不是删掉，只为一个理由：`tests/blank-draft-starter.test.mjs` 用各
 * 载体**真正的解析器**校验下面这些字节，那是一份仍然有效的载体契约验证
 * （geo-map / interactive-doc / chart 三份 schema 与 grid / pdf 两条空态约定）。
 * 删文件会连带砍掉那份验证。要新增一个插件的第一屏，去
 * `plugin-initial-states/`，不要往这里加。
 *
 * ---
 * 以下为原注释，描述这些字节为什么长这样：
 *
 * 空手起手件（blank draft）—— 一个功能在**没有任何素材**时被点开时，右栏拿到的那份素材。
 *
 * 这不是第三种约定：形状与共享包里既有的两条空白草稿逐字一致（`workbench-routes.ts`
 * 的网站空白草稿与画布空白草稿）——`meta.draft`/`meta.blank` 为真、且没有 `url` /
 * `previewUrl`。差别只在**本地 route 需要字节**：website / design-canvas 是 embed，
 * 空白态由外站宿主自己生；地图、可算文档、图表落在本地 route 上，它们的载入器都是
 * 「先读内联 source，再退到 URL」，没有内联字节就只能报「缺少 source」。所以这三类
 * 的起手件带一份**能过各自 schema 校验的最小工程**，表格与 PDF 不带：
 *   · `grid` 的 `loadGridSheets()` 在无 URL 无内容时本来就回一张空表；
 *   · `pdf` 的 `usePdfWorkbench()` 在 `source === "creation"` 且没有
 *     `editor_project_schema` 时会自建一页空白 PDF。
 *
 * 本模块只有类型导入，运行时零依赖：它被路由层与右栏同时引用，不能反向拖进任何
 * 编辑器主体。起手件的字节由 `tests/blank-draft-starter.test.mjs` 用各载体**真正的
 * 解析器**校验，不靠这里的注释担保。
 */

import type { LibraryItem, LibraryKind } from "./library-data";

/** 能空手起手的五类功能。`office` 是拒绝哨兵、`vector-editor` 是死代码，都不在内。 */
export type BlankDraftFeatureId =
  | "interactive_doc_editing"
  | "geo_map_editing"
  | "spreadsheet_editing"
  | "chart_editing"
  | "pdf_editing";

export const BLANK_DRAFT_FEATURE_IDS: readonly BlankDraftFeatureId[] =
  Object.freeze([
    "interactive_doc_editing",
    "geo_map_editing",
    "spreadsheet_editing",
    "chart_editing",
    "pdf_editing",
  ]);

const BLANK_DRAFT_FEATURE_SET = new Set<string>(BLANK_DRAFT_FEATURE_IDS);

export function isBlankDraftFeatureId(
  value: unknown,
): value is BlankDraftFeatureId {
  return BLANK_DRAFT_FEATURE_SET.has(String(value || ""));
}

const GEO_MAP_STARTER = {
  schema: "oceanleo.geo-map.v1",
  version: 1,
  metadata: {
    title: "未命名地图工程（空白起手）",
    locale: "zh-CN",
    createdAt: "2026-08-04T00:00:00Z",
  },
  projection: { name: "mercator" },
  camera: { center: [0, 20], zoom: 1.5, bearing: 0, pitch: 0 },
  basemap: {
    provider: "natural-earth",
    scaleBand: "1:110m",
    licenseCode: "PDM",
    layerNames: ["ne_110m_ocean", "ne_110m_land", "ne_110m_coastline"],
  },
  dependencies: [
    {
      path: "geo/ne_110m_ocean.geojson",
      sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
      byteSize: 1,
      mediaType: "application/geo+json",
    },
    {
      path: "geo/ne_110m_land.geojson",
      sha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
      byteSize: 1,
      mediaType: "application/geo+json",
    },
  ],
  sources: {
    ocean: {
      type: "geojson",
      dependencyPath: "geo/ne_110m_ocean.geojson",
      attribution: "Natural Earth 5.1.1 ocean polygons",
      featureCount: 1,
    },
    land: {
      type: "geojson",
      dependencyPath: "geo/ne_110m_land.geojson",
      attribution: "Natural Earth 5.1.1 land polygons",
      featureCount: 1,
    },
  },
  layers: [
    {
      id: "ocean-base",
      type: "background",
      source: "ocean",
      paint: { fillColor: "#D7E7F5", fillOpacity: 1 },
    },
    {
      id: "land-fill",
      type: "fill",
      source: "land",
      paint: { fillColor: "#F2EFE9", fillOpacity: 1 },
    },
    {
      id: "coastline",
      type: "line",
      source: "land",
      paint: { lineColor: "#6E7781", lineWidth: 1.25 },
    },
  ],
  annotations: [],
  legend: {
    position: "bottom-left",
    title: "图例",
    entries: [
      {
        label: "陆地",
        swatch: "#F2EFE9",
        pattern: "solid",
        layerId: "land-fill",
      },
    ],
  },
  interactions: {
    pan: true,
    zoom: true,
    rotate: false,
    featureClick: "none",
    popupFields: [],
    keyboardPanStepPx: 80,
    keyboardZoomStep: 0.5,
  },
  attribution: {
    entries: [
      {
        text: "Natural Earth 5.1.1，公有领域底图",
        licenseCode: "PDM",
        licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      },
    ],
  },
};

const INTERACTIVE_DOC_STARTER = {
  schema: "oceanleo.interactive-doc.v1",
  version: 1,
  metadata: {
    title: "未命名可算文档（空白起手）",
    locale: "zh-CN",
    docKind: "calculator",
    createdAt: "2026-08-04T00:00:00Z",
  },
  theme: { accent: "#1F6FEB", density: "regular", gridColumns: 12 },
  parameters: [
    {
      id: "input_a",
      label: "输入 A",
      kind: "number",
      unit: "个",
      min: 0,
      max: 1000000,
      step: 1,
      precision: 2,
      default: 100,
    },
    {
      id: "input_b",
      label: "输入 B",
      kind: "number",
      unit: "个",
      min: 0,
      max: 1000000,
      step: 1,
      precision: 2,
      default: 20,
    },
    {
      id: "rate",
      label: "比例",
      kind: "percent",
      unit: "%",
      min: 0,
      max: 100,
      step: 0.5,
      precision: 2,
      default: 10,
    },
  ],
  computations: [
    { id: "total", label: "合计", expression: "input_a + input_b", precision: 2 },
    {
      id: "scaled",
      label: "按比例",
      expression: "total * rate / 100",
      precision: 2,
    },
  ],
  blocks: [
    {
      id: "intro",
      kind: "prose",
      span: 12,
      text: "这是一份空白起手的可算文档。改动上方任一参数，下方结果会按拓扑序重算。把它当作骨架：先替换参数与公式，再补正文与表格。",
    },
    {
      id: "params",
      kind: "parameter-panel",
      span: 12,
      parameterIds: ["input_a", "input_b", "rate"],
    },
    { id: "metric_total", kind: "metric", span: 6, title: "合计", bind: "total" },
    {
      id: "metric_scaled",
      kind: "metric",
      span: 6,
      title: "按比例",
      bind: "scaled",
    },
  ],
  attribution: {
    entries: [
      {
        text: "OceanLeo interactive-doc-editor 起手模板",
        licenseCode: "CC0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      },
    ],
  },
};

const CHART_STARTER = {
  schema: "oceanleo.chart.v1",
  version: 1,
  title: "未命名图表",
  option: {
    title: { text: "未命名图表" },
    grid: { left: 56, right: 24, top: 56, bottom: 48 },
    xAxis: { type: "category", data: ["A", "B", "C"] },
    yAxis: { type: "value" },
    series: [{ id: "series-1", name: "系列 1", type: "bar", data: [0, 0, 0] }],
  },
};

/** 图表载入器只认带回写声明的 manifest；起手件自带，免得空白态被当成渲染残片。 */
const CHART_STARTER_MANIFEST = {
  schema: "oceanleo.editor-manifest.v1",
  id: "chart-editor",
  version: 1,
  capabilities: ["load", "mutate", "save", "reopen"],
  source: { kind: "inline", format: "oceanleo.chart.v1" },
};

interface BlankDraftShape {
  kind: LibraryKind;
  contentType: string;
  title: string;
  content?: string;
  meta?: Record<string, unknown>;
}

const BLANK_DRAFT_SHAPE: Readonly<Record<BlankDraftFeatureId, BlankDraftShape>> =
  Object.freeze({
    interactive_doc_editing: {
      kind: "interactive_doc",
      contentType: "interactive_doc",
      title: "未命名可算文档",
      content: JSON.stringify(INTERACTIVE_DOC_STARTER),
    },
    geo_map_editing: {
      kind: "geo_map",
      contentType: "geo_map",
      title: "未命名地图工程",
      content: JSON.stringify(GEO_MAP_STARTER),
    },
    spreadsheet_editing: {
      kind: "sheet",
      contentType: "grid",
      title: "未命名表格",
    },
    chart_editing: {
      kind: "image",
      contentType: "chart",
      title: "未命名图表",
      content: JSON.stringify(CHART_STARTER),
      meta: { editor: CHART_STARTER_MANIFEST },
    },
    pdf_editing: {
      kind: "document",
      contentType: "pdf",
      title: "未命名 PDF",
    },
  });

/**
 * 载体类型 → 能空手起手的功能 id。**从 `BLANK_DRAFT_SHAPE` 反查得来,不另写一份清单**:
 * 上面每一格的 `contentType` 就是该功能起手件的 `artifact_type`,与 `artifact-contract`
 * 的 `ARTIFACT_TYPES` 同名。入口侧(按键条)手上只有映射行的 `artifactType`,要把它换成
 * 总线认的 `featureId`,缺的就是这张表。
 *
 * 反查而非手写的理由是判据性的:五类中任何一类改了 `contentType`,这张表跟着变;
 * 手抄一份就会出现「起手件改了、入口还按旧名换算」这种两边各自都绿、合起来不通的缝。
 */
const BLANK_DRAFT_FEATURE_BY_CONTENT_TYPE: ReadonlyMap<
  string,
  BlankDraftFeatureId
> = new Map(
  BLANK_DRAFT_FEATURE_IDS.map((featureId) => [
    BLANK_DRAFT_SHAPE[featureId].contentType,
    featureId,
  ]),
);

/**
 * @deprecated 这张反查表正是「2177 枚按键只对应 5 份模板」的换算环节。
 * 派发已改成带 `pluginId`，没有任何产品路径再调用它。
 *
 * 这个载体类型能不能空手起手。不能就返回 `null` —— 调用方不许猜一个回退功能
 * (与 `blankDraftLibraryItem` 同一条 fail-closed 约定)。
 *
 * 十六类载体里只有五类能空手起手;其余(视频、音频、三维……)没有素材就无从开工,
 * 它们的按钮是素材库筛选器,不是编辑器启动器。
 */
export function blankDraftFeatureIdForContentType(
  contentType: unknown,
): BlankDraftFeatureId | null {
  const key = String(contentType || "").trim();
  if (!key) return null;
  return BLANK_DRAFT_FEATURE_BY_CONTENT_TYPE.get(key) ?? null;
}

export interface BlankDraftOptions {
  siteId?: string;
  appId?: string;
  title?: string;
  /** 每次起手换一枚，好让右栏按 key 重挂一份干净的编辑器实例。 */
  nonce?: string;
}

/**
 * @deprecated 通用空白模板已废弃；插件的第一屏走
 * `pluginInstanceLibraryItem()`（`plugin-initial-state.ts`）。
 *
 * 造一份空手起手件。功能不在五类之内就返回 `null` —— 调用方不许猜一个回退编辑器。
 */
export function blankDraftLibraryItem(
  featureId: string,
  options: BlankDraftOptions = {},
): LibraryItem | null {
  if (!isBlankDraftFeatureId(featureId)) return null;
  const shape = BLANK_DRAFT_SHAPE[featureId];
  const nonce = String(options.nonce || "").trim() || "1";
  const id = `blank-draft:${featureId}:${nonce}`;
  return {
    key: id,
    source: "creation",
    id,
    title: String(options.title || "").trim() || shape.title,
    kind: shape.kind,
    siteId: String(options.siteId || "").trim() || "oceanleo",
    favorite: false,
    ...(shape.content ? { content: shape.content } : {}),
    meta: {
      // 既有两条空白草稿逐字同形：草稿 + 无 URL。路由只认这两个键与载体类型。
      draft: true,
      blank: true,
      content_type: shape.contentType,
      ...(options.appId ? { app_id: options.appId } : {}),
      ...(shape.meta || {}),
    },
  };
}
