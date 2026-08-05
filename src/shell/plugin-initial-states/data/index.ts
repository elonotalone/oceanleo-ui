/**
 * 内置数据的取字节口。
 *
 * 每个 payload 模块都是**动态 import** 的：清单（路径、sha256、字节数）可以被入口层
 * 静态引用，而十几万字节的底图只在真的要渲第一屏时才进内存。共享包被 36 个站消费，
 * 这条分界是体积上的硬要求，不是风格。
 *
 * 这里没有任何网络 I/O：编辑器沙箱跑在 `connect-src 'none'` 下，字节只能随包来。
 */

import type { GeoMapFeatureCollection } from "../../geo-map-editor/geo-map-render";
import {
  BUILT_IN_GEO_ASSETS,
  type BuiltInGeoAsset,
} from "./geo/manifest";

export {
  BUILT_IN_GEO_ASSETS,
  PLAN_HEIGHT_METRES,
  PLAN_METRE_IN_DEGREES,
  PLAN_WIDTH_METRES,
} from "./geo/manifest";
export type { BuiltInGeoAsset } from "./geo/manifest";

const ASSET_BY_PATH: ReadonlyMap<string, BuiltInGeoAsset> = new Map(
  BUILT_IN_GEO_ASSETS.map((asset) => [asset.path, asset]),
);

export function builtInGeoAsset(path: string): BuiltInGeoAsset | null {
  return ASSET_BY_PATH.get(String(path || "")) ?? null;
}

/**
 * `renderGeoMapToCanvas({ features })` 要的那个形状。这里只借类型，
 * `import type` 在编译期就被抹掉，运行期不会把渲染器拖进这个数据模块。
 */
export type BuiltInFeatureCollection = GeoMapFeatureCollection;

/**
 * 按一份 geo-map 工程的 `sources` 取要素：**键是 source 键，值是解析好的要素集合**，
 * 正好是渲染器 `features` 参数的形状。
 *
 * 只认内置件。指向平台 revision 依赖的 source 取不到，就**不放进返回值** ——
 * 渲染器会把它记进 `missingSourceKeys` 并如实报「这层没画」，
 * 而不是被这里塞一个空要素集冒充画好了。
 */
export async function loadBuiltInGeoFeatures(
  sources: Readonly<Record<string, { dependencyPath: string }>> | undefined,
): Promise<Record<string, BuiltInFeatureCollection>> {
  const features: Record<string, BuiltInFeatureCollection> = {};
  for (const [key, source] of Object.entries(sources ?? {})) {
    const payload = await loadBuiltInGeoPayload(String(source?.dependencyPath || ""));
    if (!payload) continue;
    // 这些字节是生成物，形状由 `build-basemap.mjs` 保证、由
    // `tests/plugin-initial-states.test.mjs` 逐件按 sha256 与要素数对账，
    // 所以这里断言而不是再跑一遍运行期校验。
    features[key] = JSON.parse(payload) as BuiltInFeatureCollection;
  }
  return features;
}

/**
 * 取一件内置数据的字节。路径不在清单里就返回 `null` —— 调用方不许猜一个回退件
 * （与 `blankDraftLibraryItem` 同一条 fail-closed 约定）。
 */
export async function loadBuiltInGeoPayload(
  path: string,
): Promise<string | null> {
  switch (path) {
    case "geo/ne-110m-land.geojson": {
      const module = await import("./geo/ne-110m-land");
      return module.NE_110M_LAND_GEOJSON;
    }
    case "plan/grid-1m.geojson": {
      const module = await import("./geo/plan-sheet");
      return module.PLAN_GRID_GEOJSON;
    }
    case "plan/sheet.geojson": {
      const module = await import("./geo/plan-sheet");
      return module.PLAN_SHEET_GEOJSON;
    }
    default:
      return null;
  }
}
