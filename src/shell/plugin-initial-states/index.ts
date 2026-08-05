/**
 * 插件初始态清册 —— 「这个插件被点开、用户什么都还没输入时，第一屏是什么」的唯一出处。
 *
 * 查不到就返回 `null`。**调用方不许回退到通用起手件**：按 fail-closed 规则，
 * 没有初始态的插件按键不出现，这是设计好的行为，不是缺陷。回退到
 * `blank-draft-items.ts` 的五份通用模板恰恰是本波要根除的东西 —— 那是 2 177 枚
 * 按钮共用 5 份空白模板的来源。
 */

import { GEO_MAP_INITIAL_STATES } from "./geo-plugins";
import { GRID_INITIAL_STATES } from "./grid-plugins";
import { INTERACTIVE_DOC_INITIAL_STATES } from "./doc-plugins";
import { loadBuiltInGeoFeatures, loadBuiltInGeoPayload } from "./data/index";
import type {
  PluginGeoMapInitialState,
  PluginInitialItemInput,
  PluginInitialState,
} from "./types";

export type {
  PluginContentType,
  PluginGeoMapInitialState,
  PluginGridInitialState,
  PluginInitialItemInput,
  PluginInitialSheet,
  PluginInitialState,
  PluginInteractiveDocInitialState,
  PluginKernelId,
} from "./types";
export {
  BUILT_IN_GEO_ASSETS,
  builtInGeoAsset,
  loadBuiltInGeoFeatures,
  loadBuiltInGeoPayload,
} from "./data/index";
export type { BuiltInFeatureCollection, BuiltInGeoAsset } from "./data/index";
export {
  ANNOTATABLE_CITY_MAP_INITIAL_STATE,
  FLOORPLAN_ANNOTATION_INITIAL_STATE,
  INTERACTIVE_GLOBE_INITIAL_STATE,
} from "./geo-plugins";
export {
  LEDGER_REGISTER_INITIAL_STATE,
  LITERATURE_MATRIX_INITIAL_STATE,
  THREE_STATEMENT_MODEL_INITIAL_STATE,
} from "./grid-plugins";
export {
  FINANCIAL_CALCULATOR_INITIAL_STATE,
  SPACED_REPETITION_INITIAL_STATE,
  UNIT_CONVERTER_INITIAL_STATE,
} from "./doc-plugins";

const ALL_STATES: readonly PluginInitialState[] = Object.freeze([
  ...GEO_MAP_INITIAL_STATES,
  ...GRID_INITIAL_STATES,
  ...INTERACTIVE_DOC_INITIAL_STATES,
]);

const BY_PLUGIN_ID: ReadonlyMap<string, PluginInitialState> = new Map(
  ALL_STATES.map((state) => [state.pluginId, state]),
);

/** 有初始态的插件 id，按字典序。没进这张表的插件按键不出现。 */
export const PLUGIN_INITIAL_STATE_IDS: readonly string[] = Object.freeze(
  [...BY_PLUGIN_ID.keys()].sort(),
);

export function pluginInitialState(pluginId: unknown): PluginInitialState | null {
  const key = String(pluginId || "").trim();
  if (!key) return null;
  return BY_PLUGIN_ID.get(key) ?? null;
}

export function hasPluginInitialState(pluginId: unknown): boolean {
  return pluginInitialState(pluginId) !== null;
}

/** `LibraryItem.kind`：内核载体类型换成库里那套名字。 */
const KIND_BY_CONTENT_TYPE = {
  geo_map: "geo_map",
  grid: "sheet",
  interactive_doc: "interactive_doc",
} as const;

/**
 * 把初始态摊成入口层造 `LibraryItem` 要的那几格。
 *
 * `key` / `id` / `siteId` / `app_id` / 草稿标记由入口层补 —— 那是承载层的面。
 * 这里只负责内容与内容自带的元信息，其中 `source_manifest` 是地图三件的关键：
 * `useGeoMapWorkbench` 拿它核对依赖闭包，摘要对得上才判 `ready`。
 */
export function pluginInitialItemInput(
  pluginId: unknown,
): PluginInitialItemInput | null {
  const state = pluginInitialState(pluginId);
  if (!state) return null;
  const base = {
    pluginId: state.pluginId,
    title: state.title,
    kind: KIND_BY_CONTENT_TYPE[state.contentType],
    contentType: state.contentType,
  };
  if (state.kernel === "grid") {
    return {
      ...base,
      meta: {
        content_type: state.contentType,
        plugin_id: state.pluginId,
        sheets: state.sheets.map((sheet) => ({
          name: sheet.name,
          rows: sheet.rows.map((row) => [...row]),
          ...(sheet.formats ? { formats: sheet.formats } : {}),
        })),
      },
    };
  }
  const meta: Record<string, unknown> = {
    content_type: state.contentType,
    plugin_id: state.pluginId,
  };
  if (state.kernel === "geo-map") {
    meta.source_manifest = state.builtInData.map((asset) => ({
      path: asset.path,
      sha256: asset.sha256,
      byteSize: asset.byteSize,
    }));
  }
  return { ...base, content: JSON.stringify(state.project), meta };
}

/** 供渲染层用的 GeoJSON 要素集合：`sources` 的键 → 已解析的要素。 */
export interface PluginGeoFeatureCollection {
  type?: "FeatureCollection";
  features: Array<{
    type?: "Feature";
    geometry: unknown;
    properties?: Record<string, unknown>;
  }>;
}

/**
 * 取地图三件第一屏要画的要素。字节随包发布，这里没有网络 I/O；
 * payload 模块是动态 import 的，不渲地图的站不会为此多下 170 KB。
 *
 * 不是 `geo-map` 内核、或某一件内置数据取不到，一律返回 `null` ——
 * 渲染层收到 `null` 应当照实报「底图未载入」，不许拿空要素冒充画好了。
 */
export async function loadPluginGeoFeatures(
  pluginId: unknown,
): Promise<Record<string, PluginGeoFeatureCollection> | null> {
  const state = pluginInitialState(pluginId);
  if (!state || state.kernel !== "geo-map") return null;
  const geo = state as PluginGeoMapInitialState;
  const features: Record<string, PluginGeoFeatureCollection> = {};
  for (const [sourceKey, path] of Object.entries(geo.sourcePayloads)) {
    const payload = await loadBuiltInGeoPayload(path);
    if (!payload) return null;
    features[sourceKey] = JSON.parse(payload) as PluginGeoFeatureCollection;
  }
  return features;
}

/**
 * 渲染层实际走的口子：**按工程自己的 `sources` 取要素，不认插件 id**。
 *
 * 用 `dependencyPath` 而不是 `plugin_id` 当键，是因为一份地图存过之后仍然指着同一
 * 份内置底图，但它已经不是「某个插件的初始态」了；按路径取，存过的图与刚打开的图
 * 走同一条路。
 */
export async function loadGeoMapBuiltInFeatures(
  project: { sources?: Readonly<Record<string, { dependencyPath: string }>> } | null,
): Promise<Record<string, PluginGeoFeatureCollection>> {
  return loadBuiltInGeoFeatures(project?.sources);
}
