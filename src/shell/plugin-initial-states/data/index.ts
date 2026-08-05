/**
 * 内置数据的取字节口。
 *
 * 每个 payload 模块都是**动态 import** 的：清单（路径、sha256、字节数）可以被入口层
 * 静态引用，而十几万字节的底图只在真的要渲第一屏时才进内存。共享包被 36 个站消费，
 * 这条分界是体积上的硬要求，不是风格。
 *
 * 这里没有任何网络 I/O：编辑器沙箱跑在 `connect-src 'none'` 下，字节只能随包来。
 */

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
