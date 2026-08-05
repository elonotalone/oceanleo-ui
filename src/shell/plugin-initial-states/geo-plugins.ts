/**
 * `geo-map` 内核的三个插件：地图、地球仪、户型标注。
 *
 * 缺陷二的正解在这里：今天的空白起手件把 `geo/ne_110m_ocean.geojson` 与
 * `geo/ne_110m_land.geojson` 写成 `sha256` 全 0、`byteSize` 为 1 的两条依赖，
 * 而这两个文件根本不存在，于是取不到底图，第一屏渲成一个淡蓝空矩形。
 * 这里换成一件**真实存在、字节随包发布、摘要对得上**的底图，
 * 依赖闭包因此判 `ready`，`tests/plugin-initial-states.test.mjs` 逐条锁死。
 *
 * 底图选的是 Natural Earth 1:110m 的 admin-0 国界面（177 个面，172 944 B），
 * 一件顶三件用：`background` 层出海面色，`fill` 层出陆地，两条 `line` 层分别出
 * 海岸线与国界。上游本身没有 1:110m 的 ocean / land 两档单独文件，用国界面既省
 * 一半体积，又顺带给标注留下了「点一个国家能弹出它的名字」这条真实交互。
 * 许可是 **PDM**（公有领域标记），不是 CC0。
 */

import { GEO_MAP_PALETTE } from "../geo-map-editor/geo-map-schema";
import { builtInGeoAsset } from "./data/index";
import type { BuiltInGeoAsset } from "./data/index";
import type { PluginGeoMapInitialState } from "./types";

const LAND_PATH = "geo/ne-110m-land.geojson";
const PLAN_GRID_PATH = "plan/grid-1m.geojson";
const PLAN_SHEET_PATH = "plan/sheet.geojson";

/** 内置件必须在清单里；缺了就是构建产物不完整，不许静默降级。 */
function requireAsset(path: string): BuiltInGeoAsset {
  const asset = builtInGeoAsset(path);
  if (!asset) {
    throw new Error(`plugin-initial-states: 内置数据 ${path} 不在清单里`);
  }
  return asset;
}

const LAND = requireAsset(LAND_PATH);
const PLAN_GRID = requireAsset(PLAN_GRID_PATH);
const PLAN_SHEET = requireAsset(PLAN_SHEET_PATH);

const CREATED_AT = "2026-08-05T00:00:00Z";

function dependencyOf(asset: BuiltInGeoAsset) {
  return {
    path: asset.path,
    sha256: asset.sha256,
    byteSize: asset.byteSize,
    mediaType: asset.mediaType,
  };
}

const NATURAL_EARTH_ATTRIBUTION = {
  text: "底图：Natural Earth 5.1.1（1:110m 国界面），公有领域",
  licenseCode: "PDM",
  licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
};

const OCEANLEO_PLAN_ATTRIBUTION = {
  text: "量图纸：OceanLeo 自制 1 m 网格",
  licenseCode: "CC0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
};

/** 三件共用的底图图层组：海面、陆地、海岸线、国界。 */
function basemapLayers() {
  return [
    {
      id: "ocean-base",
      type: "background",
      source: "land",
      paint: { fillColor: GEO_MAP_PALETTE["map.water"], fillOpacity: 1 },
    },
    {
      id: "land-fill",
      type: "fill",
      source: "land",
      paint: { fillColor: GEO_MAP_PALETTE["map.land"], fillOpacity: 1 },
    },
    {
      // 海陆两色只差 1.79:1，§2.1 要求补一条海岸线把边界扛住（SC 1.4.11）。
      id: "coast-line",
      type: "line",
      source: "land",
      paint: {
        lineColor: GEO_MAP_PALETTE["map.boundary.coast"],
        lineWidth: 1.25,
      },
    },
    {
      id: "country-border",
      type: "line",
      source: "land",
      paint: {
        lineColor: GEO_MAP_PALETTE["map.boundary.country"],
        lineWidth: 0.75,
      },
    },
  ];
}

function basemapSources() {
  return {
    land: {
      type: "geojson",
      dependencyPath: LAND.path,
      attribution: LAND.attribution,
      featureCount: LAND.featureCount,
    },
  };
}

function basemapLegend() {
  return {
    position: "bottom-left",
    title: "图例",
    entries: [
      {
        label: "陆地",
        swatch: GEO_MAP_PALETTE["map.land"],
        pattern: "solid",
        layerId: "land-fill",
      },
      {
        label: "海域",
        swatch: GEO_MAP_PALETTE["map.water"],
        pattern: "solid",
        layerId: "ocean-base",
      },
    ],
  };
}

/**
 * 地图。第一屏是一张**真的画出来的**世界底图，停在中国上空，一个标注都没有。
 * 点任何一个国家会弹出它的名字 —— 那是底图自带的属性，不是预置内容。
 */
export const ANNOTATABLE_CITY_MAP_INITIAL_STATE: PluginGeoMapInitialState = {
  pluginId: "annotatable-city-map",
  displayName: "地图",
  kernel: "geo-map",
  contentType: "geo_map",
  title: "未命名地图（尚无标注）",
  firstScreen: "一张画好的底图，海陆分明、有海岸线与国界；标注列表是空的。",
  firstAction: "加第一个标注",
  builtInData: Object.freeze([LAND]),
  sourcePayloads: Object.freeze({ land: LAND.path }),
  project: {
    schema: "oceanleo.geo-map.v1",
    version: 1,
    metadata: {
      title: "未命名地图（尚无标注）",
      locale: "zh-CN",
      createdAt: CREATED_AT,
    },
    projection: { name: "mercator" },
    camera: { center: [105, 35], zoom: 3, bearing: 0, pitch: 0 },
    basemap: {
      provider: "natural-earth",
      scaleBand: "1:110m",
      licenseCode: "PDM",
      layerNames: ["ne_110m_admin_0_countries"],
    },
    sources: basemapSources(),
    layers: basemapLayers(),
    annotations: [],
    legend: basemapLegend(),
    interactions: {
      pan: true,
      zoom: true,
      rotate: false,
      featureClick: "popup",
      popupFields: ["name"],
      keyboardPanStepPx: 80,
      keyboardZoomStep: 0.5,
    },
    attribution: { entries: [NATURAL_EARTH_ATTRIBUTION] },
    dependencies: [dependencyOf(LAND)],
  },
};

/**
 * 地球仪。同一份底图换 `globe` 投影，第一屏是一颗能转的球，不是空矩形。
 * 转动是交互不是内容，所以它在零数据下就成立。
 */
export const INTERACTIVE_GLOBE_INITIAL_STATE: PluginGeoMapInitialState = {
  pluginId: "interactive-globe",
  displayName: "地球仪",
  kernel: "geo-map",
  contentType: "geo_map",
  title: "未命名地球仪（尚无标记）",
  firstScreen: "一颗画好的地球，可拖动旋转、可缩放；上面没有任何标记。",
  firstAction: "转到你要看的地方",
  builtInData: Object.freeze([LAND]),
  sourcePayloads: Object.freeze({ land: LAND.path }),
  project: {
    schema: "oceanleo.geo-map.v1",
    version: 1,
    metadata: {
      title: "未命名地球仪（尚无标记）",
      subtitle: "拖动旋转，滚轮缩放",
      locale: "zh-CN",
      createdAt: CREATED_AT,
    },
    projection: { name: "globe" },
    camera: { center: [105, 20], zoom: 1.2, bearing: 0, pitch: 0 },
    basemap: {
      provider: "natural-earth",
      scaleBand: "1:110m",
      licenseCode: "PDM",
      layerNames: ["ne_110m_admin_0_countries"],
    },
    sources: basemapSources(),
    layers: basemapLayers(),
    annotations: [],
    legend: basemapLegend(),
    interactions: {
      pan: true,
      zoom: true,
      rotate: true,
      featureClick: "popup",
      popupFields: ["name"],
      keyboardPanStepPx: 80,
      keyboardZoomStep: 0.5,
    },
    attribution: { entries: [NATURAL_EARTH_ATTRIBUTION] },
    dependencies: [dependencyOf(LAND)],
  },
};

/**
 * 户型标注。它的「底图」不可能是地球 —— 零数据下正确的第一屏是**一张空的量图纸**：
 * 24 m × 18 m 的图框加 1 m 网格，一间房都没有。用户第一个动作是量第一面墙。
 * 网格是 OceanLeo 自制的（CC0），1 m 折算成赤道 1 米对应的度数落在原点附近，
 * geo-map 内核吃经纬度，这里把它当平面直角坐标用。
 */
export const FLOORPLAN_ANNOTATION_INITIAL_STATE: PluginGeoMapInitialState = {
  pluginId: "floorplan-annotation",
  displayName: "户型标注",
  kernel: "geo-map",
  contentType: "geo_map",
  title: "未命名户型图（空图纸）",
  firstScreen: "一张 24 m × 18 m 的空量图纸，1 m 网格，没有任何房间与标注。",
  firstAction: "量第一面墙",
  builtInData: Object.freeze([PLAN_GRID, PLAN_SHEET]),
  sourcePayloads: Object.freeze({
    grid: PLAN_GRID.path,
    sheet: PLAN_SHEET.path,
  }),
  project: {
    schema: "oceanleo.geo-map.v1",
    version: 1,
    metadata: {
      title: "未命名户型图（空图纸）",
      subtitle: "网格 1 m · 图纸 24 m × 18 m",
      locale: "zh-CN",
      createdAt: CREATED_AT,
    },
    projection: { name: "equirectangular" },
    camera: { center: [0, 0], zoom: 21.5, bearing: 0, pitch: 0 },
    // 图纸不是地球：没有任何上游底图供应商。
    basemap: { provider: "none", scaleBand: "1:10m", licenseCode: "CC0" },
    sources: {
      sheet: {
        type: "geojson",
        dependencyPath: PLAN_SHEET.path,
        attribution: PLAN_SHEET.attribution,
        featureCount: PLAN_SHEET.featureCount,
      },
      grid: {
        type: "geojson",
        dependencyPath: PLAN_GRID.path,
        attribution: PLAN_GRID.attribution,
        featureCount: PLAN_GRID.featureCount,
      },
    },
    layers: [
      {
        id: "paper",
        type: "background",
        source: "sheet",
        paint: { fillColor: "#FBFAF7", fillOpacity: 1 },
      },
      {
        id: "sheet-fill",
        type: "fill",
        source: "sheet",
        paint: { fillColor: "#FFFFFF", fillOpacity: 1 },
      },
      {
        id: "grid-line",
        type: "line",
        source: "grid",
        paint: { lineColor: "#D8D3C8", lineWidth: 0.25 },
      },
      {
        id: "sheet-border",
        type: "line",
        source: "sheet",
        paint: { lineColor: "#2B2B2B", lineWidth: 1.5 },
      },
    ],
    annotations: [],
    legend: {
      position: "bottom-left",
      title: "比例",
      entries: [{ label: "网格 1 m", swatch: "#D8D3C8", pattern: "solid", layerId: "grid-line" }],
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
    attribution: { entries: [OCEANLEO_PLAN_ATTRIBUTION] },
    dependencies: [dependencyOf(PLAN_SHEET), dependencyOf(PLAN_GRID)],
  },
};

export const GEO_MAP_INITIAL_STATES: readonly PluginGeoMapInitialState[] =
  Object.freeze([
    ANNOTATABLE_CITY_MAP_INITIAL_STATE,
    INTERACTIVE_GLOBE_INITIAL_STATE,
    FLOORPLAN_ANNOTATION_INITIAL_STATE,
  ]);
