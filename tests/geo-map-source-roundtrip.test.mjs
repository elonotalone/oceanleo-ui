import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GEO_MAP_CONSTANTS,
  GEO_MAP_LICENSE_CODES,
  GEO_MAP_PALETTE,
  GEO_MAP_PROJECT_SCHEMA,
  canonicalGeoMapProject,
  evaluateGeoMapCompleteness,
  evaluateGeoMapSimilarity,
  geoMapContrastRatio,
  geoMapJaccardSimilarity,
  geoMapPaintColors,
  geoMapProjectByteLength,
  repairGeoMapLabelContrast,
  serializeGeoMapProject,
  validateGeoMapProject,
} from "../src/shell/geo-map-editor/geo-map-schema.ts";
import {
  GeoMapSourceError,
  assertGeoMapRoundtrip,
  auditGeoMapNetworkReach,
  geoMapDependencyRoute,
  geoMapSourceBudget,
  parseGeoMapSource,
  resolveGeoMapDependencyClosure,
} from "../src/shell/geo-map-editor/geo-map-source.ts";
import {
  createGeoMapProjector,
  renderGeoMapToCanvas,
} from "../src/shell/geo-map-editor/geo-map-render.ts";
import { commitGeoMapProject } from "../src/shell/geo-map-editor/geo-map-persistence.ts";

const DEPENDENCY_PATHS = [
  "geo/ne_50m_ocean.geojson",
  "geo/ne_50m_land.geojson",
  "geo/ne_50m_admin_0_countries.geojson",
  "data/rainfall_1991_2020.geojson",
  "data/stations.geojson",
];

function dependencyBytes(path) {
  // ~2 KiB per file keeps the closure above the 8,192 B §8.1 floor.
  return Buffer.from(`${path}:${"0123456789abcdef".repeat(140)}`, "utf8");
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function annotations(count) {
  const cities = [
    ["wuhan", "武汉 · 年降水 1269 mm", 114.31, 30.59],
    ["shanghai", "上海 · 年降水 1173 mm", 121.47, 31.23],
    ["guangzhou", "广州 · 年降水 1736 mm", 113.26, 23.13],
    ["chengdu", "成都 · 年降水 947 mm", 104.07, 30.67],
    ["beijing", "北京 · 年降水 534 mm", 116.4, 39.9],
    ["xian", "西安 · 年降水 584 mm", 108.94, 34.34],
    ["kunming", "昆明 · 年降水 1011 mm", 102.83, 24.88],
    ["harbin", "哈尔滨 · 年降水 524 mm", 126.53, 45.8],
  ];
  return Array.from({ length: count }, (_, index) => {
    const [id, text, lon, lat] = cities[index % cities.length];
    return {
      id: `${id}-${index}`,
      kind: index % 3 === 0 ? "marker" : index % 3 === 1 ? "callout" : "area-label",
      geometry: { type: "Point", coordinates: [lon, lat] },
      text: `${text}（观测站 ${index + 1}，1991-2020 平均值，来源 Natural Earth 站点集）`,
      anchor: "top",
      offsetPx: [8, -8],
    };
  });
}

function baseProject() {
  return {
    schema: "oceanleo.geo-map.v1",
    version: 1,
    metadata: {
      title: "东亚季风带年降水分布（1991-2020）",
      subtitle: "三十年平均降水量，按 1:50m 比例尺底图绘制",
      locale: "zh-CN",
      createdAt: "2026-07-29T08:00:00Z",
      topic: "climate",
    },
    projection: { name: "mercator" },
    camera: { center: [114.2, 30.5], zoom: 3.5, bearing: 0, pitch: 0 },
    basemap: {
      provider: "natural-earth",
      scaleBand: "1:50m",
      licenseCode: "CC0",
      layerNames: [
        "ne_50m_ocean",
        "ne_50m_land",
        "ne_50m_admin_0_countries",
        "ne_50m_coastline",
      ],
    },
    sources: {
      ocean: {
        type: "geojson",
        dependencyPath: DEPENDENCY_PATHS[0],
        attribution: "Natural Earth 5.1.1 ocean polygons",
        featureCount: 1,
      },
      land: {
        type: "geojson",
        dependencyPath: DEPENDENCY_PATHS[1],
        attribution: "Natural Earth 5.1.1 land polygons",
        featureCount: 12,
      },
      countries: {
        type: "geojson",
        dependencyPath: DEPENDENCY_PATHS[2],
        attribution: "Natural Earth 5.1.1 admin 0 countries",
        featureCount: 42,
        minzoom: 0,
        maxzoom: 12,
      },
      rainfall: {
        type: "geojson",
        dependencyPath: DEPENDENCY_PATHS[3],
        featureCount: 96,
      },
      stations: {
        type: "geojson",
        dependencyPath: DEPENDENCY_PATHS[4],
        featureCount: 64,
      },
    },
    layers: [
      {
        id: "ocean-base",
        type: "background",
        source: "ocean",
        paint: { fillColor: GEO_MAP_PALETTE["map.water"], fillOpacity: 1 },
      },
      {
        id: "land-fill",
        type: "fill",
        source: "land",
        paint: { fillColor: GEO_MAP_PALETTE["map.land"], fillOpacity: 1 },
      },
      {
        id: "coastline",
        type: "line",
        source: "land",
        paint: {
          lineColor: GEO_MAP_PALETTE["map.boundary.coast"],
          lineWidth: 1.25,
        },
      },
      {
        id: "country-borders",
        type: "line",
        source: "countries",
        paint: {
          lineColor: GEO_MAP_PALETTE["map.boundary.country"],
          lineWidth: 1.75,
          lineDasharray: [4, 2],
        },
      },
      {
        id: "rainfall-choropleth",
        type: "fill",
        source: "rainfall",
        paint: {
          fillColor: {
            property: "mm",
            stops: [
              [0, GEO_MAP_PALETTE["map.accent.1"]],
              [400, GEO_MAP_PALETTE["map.accent.3"]],
              [900, GEO_MAP_PALETTE["map.accent.2"]],
              [1600, GEO_MAP_PALETTE["map.accent.4"]],
            ],
          },
          fillOpacity: 0.75,
        },
      },
      {
        id: "station-dots",
        type: "circle",
        source: "stations",
        paint: {
          circleColor: GEO_MAP_PALETTE["map.marker.fill"],
          circleRadius: 12,
        },
      },
      {
        id: "city-labels",
        type: "symbol",
        source: "stations",
        layout: { textField: "{name}", textSize: 13, visibility: "visible" },
        paint: {
          textColor: GEO_MAP_PALETTE["map.label.primary"],
          textHaloColor: GEO_MAP_PALETTE["map.label.halo"],
          textHaloWidth: 1.5,
        },
      },
    ],
    annotations: annotations(12),
    legend: {
      position: "bottom-left",
      title: "年降水量（mm）",
      entries: [
        { label: "0 – 400", swatch: GEO_MAP_PALETTE["map.accent.1"], pattern: "solid", layerId: "rainfall-choropleth" },
        { label: "400 – 900", swatch: GEO_MAP_PALETTE["map.accent.3"], pattern: "hatch", layerId: "rainfall-choropleth" },
        { label: "900 – 1600", swatch: GEO_MAP_PALETTE["map.accent.2"], pattern: "dot", layerId: "rainfall-choropleth" },
        { label: "1600 以上", swatch: GEO_MAP_PALETTE["map.accent.4"], pattern: "cross", layerId: "rainfall-choropleth" },
        { label: "观测站", swatch: GEO_MAP_PALETTE["map.marker.fill"], pattern: "dot", layerId: "station-dots" },
        { label: "海岸线", swatch: GEO_MAP_PALETTE["map.boundary.coast"], pattern: "solid", layerId: "coastline" },
        { label: "国界", swatch: GEO_MAP_PALETTE["map.boundary.country"], pattern: "solid", layerId: "country-borders" },
      ],
    },
    interactions: {
      pan: true,
      zoom: true,
      rotate: false,
      featureClick: "popup+highlight",
      popupFields: ["name", "mm"],
      keyboardPanStepPx: 80,
      keyboardZoomStep: 0.5,
    },
    attribution: {
      entries: [
        {
          text: "Natural Earth 5.1.1，公有领域底图",
          licenseCode: "PDM",
          licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
          sourceId: "natural-earth-50m",
        },
        {
          text: "降水量统计整理自公开气象年鉴",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          sourceId: "rainfall-1991-2020",
        },
        {
          text: "观测站点位来自 Natural Earth populated places",
          licenseCode: "PDM",
          licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
          sourceId: "ne-populated-places",
        },
        {
          text: "制图 OceanLeo geo-map-editor",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
    dependencies: DEPENDENCY_PATHS.map((path) => {
      const bytes = dependencyBytes(path);
      return {
        path,
        sha256: sha256Hex(bytes),
        mediaType: "application/geo+json",
        byteSize: bytes.byteLength,
      };
    }),
  };
}

function hollowProject() {
  return {
    schema: "oceanleo.geo-map.v1",
    version: 1,
    metadata: {
      title: "空壳地图样例（无数据层）",
      locale: "zh-CN",
      createdAt: "2026-07-29T08:00:00Z",
    },
    projection: { name: "mercator" },
    camera: { center: [0, 0], zoom: 1.2 },
    basemap: {
      provider: "natural-earth",
      scaleBand: "1:110m",
      licenseCode: "CC0",
    },
    sources: {
      ocean: { type: "geojson", dependencyPath: "geo/ne_110m_ocean.geojson" },
    },
    layers: [
      { id: "bg", type: "background", source: "ocean", paint: { fillColor: "#88BDE0" } },
      { id: "bg2", type: "background", source: "ocean", paint: { fillColor: "#88BDE0" } },
      { id: "bg3", type: "background", source: "ocean", paint: { fillColor: "#88BDE0" } },
    ],
    attribution: {
      entries: [
        {
          text: "Natural Earth",
          licenseCode: "PDM",
          licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
        },
      ],
    },
  };
}

function withPatch(patch) {
  const project = baseProject();
  return patch(project) ?? project;
}

function parseFailure(project, options) {
  try {
    parseGeoMapSource(JSON.stringify(project), options);
  } catch (caught) {
    assert.ok(caught instanceof GeoMapSourceError, "failure must be a coded error");
    return caught;
  }
  throw new Error("expected parseGeoMapSource to reject");
}

function shuffledJson(project) {
  const shuffle = (value) => {
    if (Array.isArray(value)) return value.map(shuffle);
    if (value && typeof value === "object") {
      const keys = Object.keys(value).reverse();
      const target = {};
      for (const key of keys) target[key] = shuffle(value[key]);
      return target;
    }
    return value;
  };
  return JSON.stringify(shuffle(project));
}

function stubContext() {
  const ops = [];
  const state = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    lineJoin: "round",
    lineCap: "round",
    ops,
    save: () => ops.push(["save"]),
    restore: () => ops.push(["restore"]),
    beginPath: () => ops.push(["beginPath"]),
    closePath: () => ops.push(["closePath"]),
    moveTo: (x, y) => ops.push(["moveTo", x, y]),
    lineTo: (x, y) => ops.push(["lineTo", x, y]),
    arc: (x, y, r) => ops.push(["arc", x, y, r]),
    fill: () => ops.push(["fill", state.fillStyle]),
    stroke: () => ops.push(["stroke", state.strokeStyle, state.lineWidth]),
    fillRect: (x, y, w, h) => ops.push(["fillRect", state.fillStyle, x, y, w, h]),
    fillText: (text, x, y) => ops.push(["fillText", text, state.fillStyle, x, y]),
    strokeText: (text) => ops.push(["strokeText", text, state.strokeStyle]),
    measureText: (text) => ({ width: text.length * 7 }),
    setLineDash: (segments) => ops.push(["setLineDash", segments.join(",")]),
  };
  return state;
}

function pointCollection(points) {
  return {
    type: "FeatureCollection",
    features: points.map(([lon, lat, name, mm]) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { name, mm },
    })),
  };
}

function polygonCollection() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [100, 20],
              [130, 20],
              [130, 45],
              [100, 45],
              [100, 20],
            ],
          ],
        },
        properties: { mm: 1200 },
      },
    ],
  };
}

function renderFeatures() {
  return {
    ocean: polygonCollection(),
    land: polygonCollection(),
    countries: polygonCollection(),
    rainfall: polygonCollection(),
    stations: pointCollection([
      [114.31, 30.59, "武汉", 1269],
      [121.47, 31.23, "上海", 1173],
      [113.26, 23.13, "广州", 1736],
    ]),
  };
}

function pngBytes(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes.set(
    [
      (width >> 24) & 0xff,
      (width >> 16) & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
    ],
    16,
  );
  bytes.set(
    [
      (height >> 24) & 0xff,
      (height >> 16) & 0xff,
      (height >> 8) & 0xff,
      height & 0xff,
    ],
    20,
  );
  return bytes;
}

function libraryItem(patch = {}) {
  const artifactId = "artifact-geo-map-1";
  const revisionId = "revision-geo-map-1";
  return {
    key: "geo_map:fixture",
    id: "geo-map-fixture",
    siteId: "atlas",
    artifactId,
    revisionId,
    artifactType: "geo_map",
    meta: {},
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      artifactType: "geo_map",
      sourceFormat: GEO_MAP_PROJECT_SCHEMA,
      editorCapability: "geo-map-editor",
      integrity: { ok: true },
      access: { canRead: true, canEdit: true, canFork: true },
      owner: { visibility: "private" },
      renditions: {
        source: {
          purpose: "source",
          revisionId,
          url: "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/geo/source.json",
          digest: "0".repeat(64),
          expiresAt: null,
        },
      },
    },
    ...patch,
  };
}

function commitRuntime(overrides = {}) {
  const uploads = [];
  const runtime = {
    digest: async (blob) =>
      sha256Hex(Buffer.from(new Uint8Array(await blob.arrayBuffer()))),
    upload: async (blob, options) => {
      const digest = sha256Hex(
        Buffer.from(new Uint8Array(await blob.arrayBuffer())),
      );
      uploads.push({ filename: options.filename, digest, size: blob.size });
      return {
        ok: true,
        url: `https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/geo/${digest.slice(0, 12)}`,
        digest,
      };
    },
    publish: async (artifactId, commit) => {
      const item = libraryItem();
      return {
        ok: true,
        item: {
          ...item,
          revisionId: "revision-geo-map-2",
          artifact: {
            ...item.artifact,
            revisionId: "revision-geo-map-2",
            renditions: {
              source: {
                purpose: "source",
                revisionId: "revision-geo-map-2",
                url: commit.source.url,
                digest: commit.source.digest,
                expiresAt: null,
              },
            },
          },
        },
      };
    },
    ...overrides,
  };
  return { runtime, uploads };
}

function commitArgs(overrides = {}) {
  const project = baseProject();
  return {
    item: libraryItem(),
    title: "东亚季风带年降水分布",
    editRevision: 3,
    project,
    siteId: "atlas",
    previewBlob: new Blob([pngBytes(1600, 1000)], { type: "image/png" }),
    dependencyBlobs: DEPENDENCY_PATHS.map((path) => ({
      path,
      mediaType: "application/geo+json",
      blob: new Blob([dependencyBytes(path)], { type: "application/geo+json" }),
    })),
    ...overrides,
  };
}

test("valid fixture satisfies §3.2, §8.1 and §8.2", () => {
  const validated = validateGeoMapProject(baseProject());
  assert.equal(validated.ok, true, JSON.stringify(validated.errors ?? [], null, 2));
  const project = validated.project;
  assert.equal(project.schema, GEO_MAP_PROJECT_SCHEMA);
  const bytes = geoMapProjectByteLength(project);
  assert.ok(
    bytes >= GEO_MAP_CONSTANTS.sourceBytesMin,
    `fixture is ${bytes} B, must clear the 6144 B floor`,
  );
  assert.ok(bytes <= GEO_MAP_CONSTANTS.sourceBytesMax);
  const completeness = evaluateGeoMapCompleteness({ project });
  assert.deepEqual(completeness.failures, []);
  assert.equal(completeness.ok, true);
  assert.ok(completeness.metrics.featureCountTotal >= 24);
  assert.ok(completeness.metrics.paintColors >= 4);
  assert.ok(completeness.metrics.legendPatterns >= 2);
  assert.equal(geoMapSourceBudget(project).aboveFloor, true);
});

test("parse → serialize roundtrip is byte deterministic", () => {
  const json = serializeGeoMapProject(validateGeoMapProject(baseProject()).project);
  const first = parseGeoMapSource(json);
  const second = parseGeoMapSource(serializeGeoMapProject(first));
  assert.equal(serializeGeoMapProject(first), json);
  assert.equal(serializeGeoMapProject(second), json);
  assert.equal(
    sha256Hex(Buffer.from(serializeGeoMapProject(second), "utf8")),
    sha256Hex(Buffer.from(json, "utf8")),
  );
  // Key order in the incoming bytes must not change the outgoing bytes.
  const reordered = parseGeoMapSource(shuffledJson(baseProject()));
  assert.equal(serializeGeoMapProject(reordered), json);
  // Uint8Array and string inputs agree.
  const fromBytes = parseGeoMapSource(new TextEncoder().encode(json));
  assert.equal(serializeGeoMapProject(fromBytes), json);
  assert.equal(assertGeoMapRoundtrip(fromBytes), json);
});

test("§3.2 field constraints are enforced one by one", () => {
  const cases = [
    ["$.schema", (p) => { p.schema = "oceanleo.geo-map.v2"; }],
    ["$.version", (p) => { p.version = 2; }],
    ["$.metadata.title", (p) => { p.metadata.title = "短"; }],
    ["metadata.locale", (p) => { p.metadata.locale = "zh_CN"; }],
    ["metadata.createdAt", (p) => { p.metadata.createdAt = "2026-07-29"; }],
    ["metadata.topic", (p) => { p.metadata.topic = "x".repeat(121); }],
    ["metadata.unknown", (p) => { p.metadata.unknown = 1; }],
    ["projection.name", (p) => { p.projection.name = "robinson"; }],
    ["projection.parallels[0]", (p) => { p.projection = { name: "albers", parallels: [-91, 50] }; }],
    ["camera.center[0]", (p) => { p.camera.center = [181, 30]; }],
    ["camera.center[1]", (p) => { p.camera.center = [114, 86]; }],
    ["camera.zoom", (p) => { p.camera.zoom = 25; }],
    ["camera.bearing", (p) => { p.camera.bearing = 360; }],
    ["camera.pitch", (p) => { p.camera.pitch = 61; }],
    ["camera.bounds", (p) => { p.camera.bounds = [1, 2, 3]; }],
    ["basemap.provider", (p) => { p.basemap.provider = "osm"; }],
    ["basemap.scaleBand", (p) => { p.basemap.scaleBand = "1:25m"; }],
    ["basemap.layerNames[0]", (p) => { p.basemap.layerNames = ["osm_land"]; }],
    ["sources.BAD", (p) => { p.sources.BadKey = p.sources.ocean; }],
    ["sources.ocean.type", (p) => { p.sources.ocean.type = "video"; }],
    ["sources.ocean.tileSize", (p) => { p.sources.ocean.tileSize = 1024; }],
    ["sources.ocean.featureCount", (p) => { p.sources.ocean.featureCount = 200001; }],
    ["sources.ocean.minzoom", (p) => { p.sources.ocean.minzoom = 25; }],
    ["layers.minItems", (p) => { p.layers = p.layers.slice(0, 2); }],
    ["layers[].id", (p) => { p.layers[1].id = "Land Fill"; }],
    ["layers[].type", (p) => { p.layers[1].type = "hillshade"; }],
    ["layers[].paint.lineWidth", (p) => { p.layers[3].paint.lineWidth = 25; }],
    ["layers[].paint.circleRadius", (p) => { p.layers[5].paint.circleRadius = 65; }],
    ["layers[].paint.unknown", (p) => { p.layers[1].paint.glow = "#FFFFFF"; }],
    ["layers[].paint.empty", (p) => { p.layers[1].paint = {}; }],
    ["layers[].layout.textSize", (p) => { p.layers[6].layout.textSize = 41; }],
    ["layers[].symbol.textField", (p) => { delete p.layers[6].layout.textField; }],
    ["layers[].filter", (p) => { p.layers[4].filter = ["like", "mm", 1]; }],
    ["layers[].ramp.stops", (p) => { p.layers[4].paint.fillColor.stops = [[0, "#1F6FEB"]]; }],
    ["layers[].ramp.color", (p) => { p.layers[4].paint.fillColor.stops[0][1] = "blue"; }],
    ["annotations[].kind", (p) => { p.annotations[0].kind = "pin"; }],
    ["annotations[].geometry.type", (p) => { p.annotations[0].geometry.type = "GeometryCollection"; }],
    ["annotations[].offsetPx", (p) => { p.annotations[0].offsetPx = [201, 0]; }],
    ["legend.position", (p) => { p.legend.position = "middle"; }],
    ["legend.entries[].swatch", (p) => { p.legend.entries[0].swatch = "#FFF"; }],
    ["legend.entries[].pattern", (p) => { p.legend.entries[0].pattern = "stripe"; }],
    ["interactions.keyboardPanStepPx", (p) => { p.interactions.keyboardPanStepPx = 201; }],
    ["interactions.keyboardZoomStep", (p) => { p.interactions.keyboardZoomStep = 2.5; }],
    ["interactions.featureClick", (p) => { p.interactions.featureClick = "tooltip"; }],
    ["attribution.entries.min", (p) => { p.attribution.entries = []; }],
    ["attribution.entries[].licenseUrl", (p) => { p.attribution.entries[0].licenseUrl = "http://example.com"; }],
    ["dependencies[].sha256", (p) => { p.dependencies[0].sha256 = "zz"; }],
    ["dependencies[].mediaType", (p) => { p.dependencies[0].mediaType = "text/html"; }],
    ["dependencies[].byteSize", (p) => { p.dependencies[0].byteSize = 33554433; }],
    ["$.unknown", (p) => { p.extra = true; }],
  ];
  for (const [label, mutate] of cases) {
    const result = validateGeoMapProject(withPatch(mutate));
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.ok(result.errors.length > 0, `${label} must report an error`);
  }
  for (const [, mutate] of cases) {
    assert.throws(
      () => parseGeoMapSource(JSON.stringify(withPatch(mutate))),
      GeoMapSourceError,
    );
  }
});

test("§4 C6: latitude domain follows the projection", () => {
  const mercator = validateGeoMapProject(
    withPatch((p) => {
      p.camera.center = [0, 86];
    }),
  );
  assert.equal(mercator.ok, false);
  const geographic = validateGeoMapProject(
    withPatch((p) => {
      p.projection = { name: "equirectangular" };
      p.camera.center = [0, 88];
    }),
  );
  assert.equal(geographic.ok, true);
  const beyondPole = validateGeoMapProject(
    withPatch((p) => {
      p.projection = { name: "equirectangular" };
      p.camera.center = [0, 91];
    }),
  );
  assert.equal(beyondPole.ok, false);
});

test("§6 F1 hollow: the 233 B shell is rejected by both floor and criteria", () => {
  const shell = hollowProject();
  const json = JSON.stringify(shell);
  assert.ok(
    Buffer.byteLength(json, "utf8") < GEO_MAP_CONSTANTS.sourceBytesMin,
    "shell fixture must be below the floor to be meaningful",
  );
  const structural = validateGeoMapProject(shell);
  assert.equal(structural.ok, true, "the shell is structurally legal, which is why §8 exists");
  const completeness = evaluateGeoMapCompleteness({ project: structural.project });
  assert.equal(completeness.ok, false);
  const codes = new Set(completeness.failures.map((entry) => entry.code));
  assert.ok(codes.has("geo-map-hollow"));
  const messages = completeness.failures.map((entry) => entry.message).join("\n");
  assert.match(messages, /6144 B reviewed floor/);
  assert.match(messages, /non-background layers/);
  assert.match(messages, /featureCount total/);
  assert.match(messages, /annotations must be/);
  const failure = parseFailure(shell, { enforceMinimumBytes: true });
  assert.equal(failure.code, "geo-map-hollow");
});

test("§6 F2 dangling layer source is invalid, never skipped", () => {
  const failure = parseFailure(
    withPatch((p) => {
      p.layers[4].source = "precipitation";
    }),
  );
  assert.equal(failure.code, "geo-map-dangling-layer-source");
  assert.match(failure.errors[0].message, /missing source key precipitation/);
});

test("§6 F3 dependency closure gaps drive ready / degraded / invalid", () => {
  const project = validateGeoMapProject(baseProject()).project;
  const available = project.dependencies.map((entry) => ({
    path: entry.path,
    sha256: entry.sha256,
    byteSize: entry.byteSize,
  }));
  const ready = resolveGeoMapDependencyClosure(project, available);
  assert.equal(ready.verdict, "ready");
  assert.equal(ready.canSave, true);
  const partial = resolveGeoMapDependencyClosure(project, available.slice(0, 3));
  assert.equal(partial.verdict, "degraded");
  assert.equal(partial.canSave, false, "§3.3 forbids degraded → saving");
  assert.equal(partial.missingPaths.length, 2);
  assert.equal(
    partial.errors[0].code,
    "geo-map-dependency-closure-incomplete",
  );
  const empty = resolveGeoMapDependencyClosure(project, []);
  assert.equal(empty.verdict, "invalid");
  const mismatched = resolveGeoMapDependencyClosure(project, [
    { ...available[0], sha256: "f".repeat(64) },
    ...available.slice(1),
  ]);
  assert.equal(mismatched.verdict, "degraded");
  assert.deepEqual(mismatched.digestMismatchPaths, [available[0].path]);
  const noBasemap = validateGeoMapProject(
    withPatch((p) => {
      p.basemap.provider = "none";
    }),
  ).project;
  assert.equal(
    resolveGeoMapDependencyClosure(noBasemap, available.slice(0, 3)).verdict,
    "invalid",
  );
});

test("§6 F4 licence contagion: exactly CC0 / PDM / NASA-OPEN", () => {
  assert.deepEqual([...GEO_MAP_LICENSE_CODES], ["CC0", "PDM", "NASA-OPEN"]);
  for (const rejected of ["CC-BY-SA", "NASA-PD", "PD", "US-GOV", "cc0"]) {
    const failure = parseFailure(
      withPatch((p) => {
        p.basemap.licenseCode = rejected;
      }),
    );
    assert.equal(failure.code, "geo-map-license-contagion", rejected);
  }
  const attributionFailure = parseFailure(
    withPatch((p) => {
      p.attribution.entries[0].licenseCode = "CC-BY";
    }),
  );
  assert.equal(attributionFailure.code, "geo-map-license-contagion");
  const nasa = parseGeoMapSource(
    JSON.stringify(
      withPatch((p) => {
        p.basemap.provider = "nasa-gibs";
        p.basemap.licenseCode = "NASA-OPEN";
        p.attribution.entries[0] = {
          text: "NASA Worldview / GIBS imagery",
          licenseCode: "NASA-OPEN",
          licenseUrl: "https://earthdata.nasa.gov/earth-observation-data/data-use-policy",
        };
      }),
    ),
  );
  assert.equal(nasa.basemap.licenseCode, "NASA-OPEN");
  // §1.3: NASA-OPEN never waives the attribution obligation.
  const missingAttribution = parseFailure(
    withPatch((p) => {
      p.basemap.provider = "nasa-gibs";
      p.basemap.licenseCode = "NASA-OPEN";
    }),
  );
  assert.equal(missingAttribution.code, "geo-map-attribution-missing");
});

test("§6 F5 colour collapse is caught in paint values and in frame colours", () => {
  const flat = validateGeoMapProject(
    withPatch((p) => {
      for (const layer of p.layers) {
        if (layer.paint.fillColor) layer.paint.fillColor = "#88BDE0";
        if (layer.paint.lineColor) layer.paint.lineColor = "#88BDE0";
        if (layer.paint.circleColor) layer.paint.circleColor = "#88BDE0";
        delete layer.paint.textColor;
        delete layer.paint.textHaloColor;
      }
    }),
  ).project;
  assert.ok(geoMapPaintColors(flat).length < 4);
  const collapsed = evaluateGeoMapCompleteness({ project: flat });
  assert.ok(
    collapsed.failures.some((entry) => entry.code === "geo-map-color-collapse"),
  );
  const frame = evaluateGeoMapCompleteness({
    project: validateGeoMapProject(baseProject()).project,
    frameColorCount: 3,
  });
  assert.ok(
    frame.failures.some(
      (entry) =>
        entry.code === "geo-map-color-collapse" && /3 colours/.test(entry.message),
    ),
  );
  // C28: three or more data layers must not lean on colour alone.
  const noPatterns = validateGeoMapProject(
    withPatch((p) => {
      for (const entry of p.legend.entries) delete entry.pattern;
    }),
  ).project;
  assert.ok(
    evaluateGeoMapCompleteness({ project: noPatterns }).failures.some((entry) =>
      /legend patterns/.test(entry.message),
    ),
  );
});

test("§6 F6 twin detection uses structural shingles, not the title", () => {
  const original = validateGeoMapProject(baseProject()).project;
  const renamed = validateGeoMapProject(
    withPatch((p) => {
      p.metadata.title = "另一张东亚降水地图（换了标题）";
    }),
  ).project;
  assert.equal(geoMapJaccardSimilarity(original, renamed), 1);
  const twin = evaluateGeoMapSimilarity(renamed, [original]);
  assert.equal(twin.twin, true);
  assert.equal(twin.failures[0].code, "geo-map-twin");
  const diversified = validateGeoMapProject(
    withPatch((p) => {
      p.camera.center = [10.4, 51.1];
      p.camera.zoom = 5;
      p.basemap.scaleBand = "1:10m";
      p.basemap.layerNames = ["ne_10m_land", "ne_10m_coastline"];
      p.sources.rainfall.dependencyPath = "data/europe_rainfall.geojson";
      p.sources.stations.dependencyPath = "data/europe_stations.geojson";
      p.dependencies[3].path = "data/europe_rainfall.geojson";
      p.dependencies[4].path = "data/europe_stations.geojson";
      p.layers[4].paint.fillColor.stops[0][0] = 40;
      p.layers[5].paint.circleRadius = 14;
      p.annotations = annotations(6);
    }),
  ).project;
  const verdict = evaluateGeoMapSimilarity(diversified, [original]);
  assert.ok(
    verdict.similarity < GEO_MAP_CONSTANTS.jaccardMax,
    `diversified map still scores ${verdict.similarity}`,
  );
  assert.equal(verdict.ok, true);
});

test("§6 F7 albers without parallels is a coded failure, not a mercator fallback", () => {
  const failure = parseFailure(
    withPatch((p) => {
      p.projection = { name: "albers" };
    }),
  );
  assert.equal(failure.code, "geo-map-projection-parameters-missing");
  const albers = parseGeoMapSource(
    JSON.stringify(
      withPatch((p) => {
        p.projection = { name: "albers", parallels: [20, 50] };
      }),
    ),
  );
  assert.deepEqual(albers.projection.parallels, [20, 50]);
});

test("§6 F8 label contrast flips the halo once and then rejects", () => {
  const project = validateGeoMapProject(baseProject()).project;
  const overLand = repairGeoMapLabelContrast({ project });
  assert.equal(overLand.ok, true);
  assert.deepEqual(overLand.repairedLayerIds, []);
  assert.ok(
    geoMapContrastRatio(
      GEO_MAP_PALETTE["map.label.primary"],
      GEO_MAP_PALETTE["map.land"],
    ) >= 4.5,
  );
  const overDark = repairGeoMapLabelContrast({
    project,
    underlyingColorByLayerId: { "city-labels": "#3A3A3A" },
  });
  assert.equal(overDark.ok, false);
  assert.equal(overDark.failures[0].code, "geo-map-label-contrast");
  const rescued = repairGeoMapLabelContrast({
    project: validateGeoMapProject(
      withPatch((p) => {
        p.layers[6].paint.textColor = "#FFFFFF";
        p.layers[6].paint.textHaloColor = "#FFFFFF";
      }),
    ).project,
    underlyingColorByLayerId: { "city-labels": "#F4F1EA" },
  });
  assert.equal(rescued.ok, true);
  assert.deepEqual(rescued.repairedLayerIds, ["city-labels"]);
  assert.equal(rescued.project.layers[6].paint.textHaloColor, "#000000");
});

test("parse plane rejects empty, HTML, non-UTF8, oversized and non-JSON bytes", () => {
  assert.equal(
    (() => {
      try {
        parseGeoMapSource("   ");
      } catch (caught) {
        return caught.code;
      }
    })(),
    "geo-map-empty-source",
  );
  for (const html of ["<!doctype html><html></html>", "<html><body>map</body></html>"]) {
    try {
      parseGeoMapSource(html);
      assert.fail("HTML must never load as a geo-map source");
    } catch (caught) {
      assert.equal(caught.code, "geo-map-html-source");
    }
  }
  try {
    parseGeoMapSource("{ not json ");
    assert.fail("expected invalid JSON rejection");
  } catch (caught) {
    assert.equal(caught.code, "geo-map-invalid-json");
  }
  try {
    parseGeoMapSource(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]));
    assert.fail("expected non-UTF8 rejection");
  } catch (caught) {
    assert.equal(caught.code, "geo-map-not-utf8");
  }
  const oversized = new Uint8Array(GEO_MAP_CONSTANTS.sourceBytesMax + 1).fill(0x20);
  oversized[0] = 0x7b;
  try {
    parseGeoMapSource(oversized);
    assert.fail("expected C33 rejection");
  } catch (caught) {
    assert.equal(caught.code, "geo-map-source-too-large");
  }
});

test("no network: dependency paths stay same-origin and the modules never fetch", () => {
  const remote = parseFailure(
    withPatch((p) => {
      p.sources.rainfall.dependencyPath =
        "https://tile.openstreetmap.org/3/6/3.png";
    }),
  );
  assert.equal(remote.code, "geo-map-remote-fetch-forbidden");
  const traversal = parseFailure(
    withPatch((p) => {
      p.dependencies[0].path = "../../etc/passwd";
    }),
  );
  assert.equal(traversal.code, "geo-map-remote-fetch-forbidden");
  const project = validateGeoMapProject(baseProject()).project;
  assert.deepEqual(auditGeoMapNetworkReach(project), []);
  assert.match(
    geoMapDependencyRoute("artifact-1", "revision-1", DEPENDENCY_PATHS[0]),
    /^\/v1\/artifacts\/artifact-1\/revisions\/revision-1\/dependencies\/geo\/ne_50m_ocean\.geojson$/,
  );
  for (const file of [
    "geo-map-schema.ts",
    "geo-map-source.ts",
    "geo-map-render.ts",
  ]) {
    const text = readFileSync(
      new URL(`../src/shell/geo-map-editor/${file}`, import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /new\s+Image\s*\(/,
      /createImageBitmap/,
      /\bimport\s*\(/,
      /navigator\.sendBeacon/,
    ]) {
      assert.ok(
        !forbidden.test(text),
        `${file} must not reach the network (${forbidden})`,
      );
    }
  }
});

test("§5.4 canvas 2D path draws every primitive and reports its degradations", () => {
  const project = validateGeoMapProject(
    withPatch((p) => {
      p.layers.push({
        id: "rain-heat",
        type: "heatmap",
        source: "stations",
        paint: { heatmapRadius: 20, circleColor: GEO_MAP_PALETTE["map.accent.2"] },
      });
      p.layers.push({
        id: "city-blocks",
        type: "fill-extrusion",
        source: "rainfall",
        paint: {
          fillColor: GEO_MAP_PALETTE["map.accent.4"],
          fillExtrusionHeight: 1200,
        },
      });
      p.layers.push({
        id: "gibs-raster",
        type: "raster",
        source: "ocean",
        paint: { rasterOpacity: 0.6, fillColor: GEO_MAP_PALETTE["map.water"] },
      });
      p.layers.push({
        id: "hidden-grid",
        type: "line",
        source: "countries",
        layout: { visibility: "none" },
        paint: { lineColor: GEO_MAP_PALETTE["map.boundary.admin1"], lineWidth: 0.75 },
      });
    }),
  ).project;
  const context = stubContext();
  const result = renderGeoMapToCanvas({
    project,
    context,
    width: GEO_MAP_CONSTANTS.exportCanvasWidthPx,
    height: GEO_MAP_CONSTANTS.exportCanvasHeightPx,
    features: renderFeatures(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.width, 1600);
  assert.equal(result.height, 1000);
  assert.equal(result.degraded, false);
  assert.deepEqual(result.missingSourceKeys, []);
  for (const id of [
    "ocean-base",
    "land-fill",
    "coastline",
    "country-borders",
    "rainfall-choropleth",
    "station-dots",
    "city-labels",
    "rain-heat",
    "city-blocks",
    "gibs-raster",
  ]) {
    assert.ok(result.drawnLayerIds.includes(id), `${id} must be drawn`);
  }
  assert.deepEqual(
    result.skippedLayers.filter((entry) => entry.id === "hidden-grid"),
    [{ id: "hidden-grid", reason: "hidden" }],
  );
  const kinds = result.degradations.map((entry) => entry.kind);
  assert.ok(kinds.includes("heatmap-to-graduated-bands"));
  assert.ok(kinds.includes("fill-extrusion-to-shaded-polygon"));
  assert.ok(kinds.includes("raster-to-flat-band"));
  assert.equal(result.annotationsDrawn, 12);
  assert.ok(result.colors.includes(GEO_MAP_PALETTE["map.boundary.coast"]));
  assert.ok(result.colors.length >= 8);
  const texts = context.ops.filter((op) => op[0] === "fillText").map((op) => op[1]);
  assert.ok(texts.some((text) => text.includes("武汉")));
  assert.ok(texts.some((text) => text.includes("PDM")), "attribution bar must be drawn");
  assert.ok(texts.some((text) => text.includes("年降水量")), "legend must be drawn");

  const missing = renderGeoMapToCanvas({
    project,
    context: stubContext(),
    features: { ocean: renderFeatures().ocean },
  });
  assert.equal(missing.degraded, true);
  assert.ok(missing.missingSourceKeys.includes("stations"));
  const headless = renderGeoMapToCanvas({ project });
  assert.equal(headless.ok, false);
  assert.equal(headless.errors[0].code, "geo-map-render-unsupported");
});

test("projection helpers are closed form and invertible where §5.4 needs them", () => {
  const project = validateGeoMapProject(baseProject()).project;
  const viewport = { width: 1600, height: 1000 };
  const projector = createGeoMapProjector(project, viewport);
  const center = projector.project(project.camera.center);
  assert.deepEqual(center, [800, 500]);
  const east = projector.project([124.2, 30.5]);
  assert.ok(east[0] > center[0], "eastward longitude moves right");
  const north = projector.project([114.2, 40.5]);
  assert.ok(north[1] < center[1], "northward latitude moves up");
  const back = projector.unproject(east);
  assert.ok(Math.abs(back[0] - 124.2) < 1e-6);
  assert.ok(Math.abs(back[1] - 30.5) < 1e-6);
  const globe = createGeoMapProjector(
    { ...project, projection: { name: "globe" } },
    viewport,
  );
  assert.equal(globe.project([-65, -30]), null, "far hemisphere is clipped");
  assert.equal(globe.unproject([800, 500]), null, "globe is forward-only in v1");
});

test("commitGeoMapProject publishes the closure atomically", async () => {
  const { runtime, uploads } = commitRuntime();
  const result = await commitGeoMapProject(commitArgs({ runtime }));
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.projectSchema, GEO_MAP_PROJECT_SCHEMA);
  assert.equal(result.revisionId, "revision-geo-map-2");
  assert.equal(result.previousRevisionId, "revision-geo-map-1");
  assert.equal(result.closure.length, DEPENDENCY_PATHS.length);
  assert.ok(result.closureBytes >= 8192, "closure must clear the §8.1 floor");
  assert.equal(uploads.length, DEPENDENCY_PATHS.length + 2);
  assert.ok(uploads.some((entry) => entry.filename.endsWith(".preview.png")));
  assert.ok(
    uploads.some((entry) => entry.filename.endsWith(".oceanleo.geo-map.json")),
  );
  assert.equal(result.json, serializeGeoMapProject(result.project));
  assert.ok(result.closureDigest.length >= 8);
});

test("commit failures are coded, never silent", async () => {
  const { runtime } = commitRuntime();
  const missingClosure = await commitGeoMapProject(
    commitArgs({ runtime, dependencyBlobs: [] }),
  );
  assert.equal(missingClosure.ok, false);
  assert.ok(
    missingClosure.errors.every(
      (entry) => entry.code === "geo-map-dependency-closure-incomplete",
    ),
  );

  const badDigest = await commitGeoMapProject(
    commitArgs({
      runtime,
      dependencyBlobs: DEPENDENCY_PATHS.map((path) => ({
        path,
        mediaType: "application/geo+json",
        blob: new Blob([Buffer.from(`tampered:${path}`)], {
          type: "application/geo+json",
        }),
      })),
    }),
  );
  assert.equal(badDigest.ok, false);
  assert.ok(
    badDigest.errors.some((entry) => /hashes to/.test(entry.message)),
  );

  const hollow = await commitGeoMapProject(
    commitArgs({ runtime, project: hollowProject() }),
  );
  assert.equal(hollow.ok, false);
  assert.ok(hollow.errors.some((entry) => entry.code === "geo-map-hollow"));

  const noCover = await commitGeoMapProject(
    commitArgs({ runtime, previewBlob: undefined }),
  );
  assert.equal(noCover.ok, false);
  assert.ok(
    noCover.errors.some((entry) => /PNG 封面/.test(entry.message)),
  );

  const smallCover = await commitGeoMapProject(
    commitArgs({
      runtime,
      previewBlob: new Blob([pngBytes(96, 96)], { type: "image/png" }),
    }),
  );
  assert.equal(smallCover.ok, false);
  assert.ok(smallCover.errors.some((entry) => /128 px/.test(entry.message)));

  const conflictRuntime = commitRuntime({
    publish: async () => ({
      ok: false,
      code: "revision-conflict",
      error: "expected_revision_id 不匹配",
    }),
  });
  const conflict = await commitGeoMapProject(
    commitArgs({ runtime: conflictRuntime.runtime }),
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.errors[0].code, "geo-map-commit-conflict");

  const twin = await commitGeoMapProject(
    commitArgs({ runtime, cohort: [validateGeoMapProject(baseProject()).project] }),
  );
  assert.equal(twin.ok, false);
  assert.ok(twin.errors.some((entry) => entry.code === "geo-map-twin"));

  const wrongType = await commitGeoMapProject(
    commitArgs({
      runtime,
      item: libraryItem({ artifactType: "chart" }),
    }),
  );
  assert.equal(wrongType.ok, false);
  assert.ok(
    wrongType.errors.some((entry) => entry.code === "geo-map-commit-rejected"),
  );
});

test("W4 export contract is complete and canonicalization is idempotent", () => {
  assert.equal(GEO_MAP_PROJECT_SCHEMA, "oceanleo.geo-map.v1");
  assert.equal(typeof parseGeoMapSource, "function");
  assert.equal(typeof serializeGeoMapProject, "function");
  assert.equal(typeof validateGeoMapProject, "function");
  assert.equal(typeof commitGeoMapProject, "function");
  assert.equal(typeof renderGeoMapToCanvas, "function");
  const project = validateGeoMapProject(baseProject()).project;
  assert.deepEqual(canonicalGeoMapProject(project), canonicalGeoMapProject(canonicalGeoMapProject(project)));
  const failure = validateGeoMapProject({ schema: "oceanleo.geo-map.v1" });
  assert.equal(failure.ok, false);
  assert.ok(failure.errors.every((entry) => typeof entry.code === "string"));
  assert.ok(failure.errors.every((entry) => typeof entry.path === "string"));
});
