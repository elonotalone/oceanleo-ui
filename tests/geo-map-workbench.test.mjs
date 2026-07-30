import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GEO_MAP_ILLEGAL_TRANSITIONS,
  GEO_MAP_LOAD_TRANSITIONS,
  GeoMapLoadMachine,
  GeoMapProjectHistory,
  geoMapIsIllegalTransition,
  geoMapNextLoadState,
  geoMapStateAllowsMutation,
  geoMapStateAllowsSave,
} from "../src/shell/geo-map-editor/geo-map-history.ts";
import {
  GEO_MAP_CONSTANTS,
  GEO_MAP_CONTRAST_OBLIGATIONS,
  GEO_MAP_LAYOUT,
  GEO_MAP_PALETTE,
  GEO_MAP_SCALE_BAND_ZOOM,
  GEO_MAP_SERIES_TOKENS,
  GEO_MAP_TYPE_SCALE,
  applyGeoMapAdvancedCommand,
  geoMapAdvancedControls,
  geoMapContrastAudit,
  geoMapContrastRatio,
  geoMapCountryLineWidth,
  geoMapLatitudeLimit,
  geoMapLegendPatternObligation,
} from "../src/shell/geo-map-editor/geo-map-advanced-controls.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const read = (relative) => readFileSync(`${ROOT}${relative}`, "utf8");

const HOOK_SOURCE = read("src/shell/geo-map-editor/use-geo-map-workbench.ts");
const STAGE_SOURCE = read("src/shell/geo-map-editor/GeoMapStage.tsx");
const CONTROLS_SOURCE = read("src/shell/geo-map-editor/GeoMapControls.tsx");
const TOOLBAR_SOURCE = read("src/shell/geo-map-editor/GeoMapContextToolbar.tsx");
const ROUTE_SOURCE = read("src/shell/advanced-routes/GeoMapRoute.tsx");

const tt = (text, vars) =>
  vars
    ? Object.entries(vars).reduce(
        (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
        text,
      )
    : text;

function fixtureProject(overrides = {}) {
  return {
    schema: "oceanleo.geo-map.v1",
    version: 1,
    metadata: {
      title: "全球海岸线与人口分布",
      locale: "zh-CN",
      createdAt: "2026-07-29T00:00:00Z",
    },
    projection: { name: "mercator" },
    camera: { center: [10, 20], zoom: 3.5, bearing: 0, pitch: 0 },
    basemap: {
      provider: "natural-earth",
      scaleBand: "1:50m",
      licenseCode: "PDM",
    },
    sources: {
      coast: { type: "geojson", dependencyPath: "data/coast.geojson" },
      cities: { type: "geojson", dependencyPath: "data/cities.geojson" },
    },
    layers: [
      {
        id: "background",
        type: "background",
        source: "coast",
        paint: { fillColor: GEO_MAP_PALETTE["map.land"] },
      },
      {
        id: "coastline",
        type: "line",
        source: "coast",
        paint: {
          lineColor: GEO_MAP_PALETTE["map.boundary.coast"],
          lineWidth: 1.25,
        },
      },
      {
        id: "cities",
        type: "circle",
        source: "cities",
        paint: {
          circleColor: GEO_MAP_PALETTE["map.accent.1"],
          circleRadius: 4,
        },
      },
      {
        id: "labels",
        type: "symbol",
        source: "cities",
        layout: { textField: "{name}", textSize: 13 },
        paint: {
          textColor: GEO_MAP_PALETTE["map.label.primary"],
          textHaloWidth: 1.5,
        },
      },
    ],
    legend: {
      position: "bottom-right",
      entries: [
        { label: "海岸线", swatch: GEO_MAP_PALETTE["map.boundary.coast"] },
        { label: "城市", swatch: GEO_MAP_PALETTE["map.accent.1"] },
        { label: "人口", swatch: GEO_MAP_PALETTE["map.accent.2"] },
      ],
    },
    interactions: {},
    attribution: {
      entries: [
        {
          text: "Natural Earth",
          licenseCode: "PDM",
          licenseUrl: "https://example.org/pdm",
        },
      ],
    },
    dependencies: [
      { path: "data/coast.geojson", sha256: "a".repeat(64), mediaType: "application/geo+json" },
      { path: "data/cities.geojson", sha256: "b".repeat(64), mediaType: "application/geo+json" },
    ],
    ...overrides,
  };
}

function recordingEditor() {
  const calls = [];
  return {
    calls,
    setCamera: (patch) => calls.push(["setCamera", patch]),
    setInteractions: (patch) => calls.push(["setInteractions", patch]),
    patchLayer: (id, patch) => calls.push(["patchLayer", id, patch]),
  };
}

function command(controlId, value) {
  return { requestId: "r1", selectionId: "geo-map", controlId, value };
}

// ---------------------------------------------------------------------------
// §2.1 色板逐值
// ---------------------------------------------------------------------------

test("§2.1 palette carries every spec token at its literal hex value", () => {
  assert.deepEqual(GEO_MAP_PALETTE, {
    "map.water": "#88BDE0",
    "map.land": "#F4F1EA",
    "map.boundary.country": "#6B6259",
    "map.boundary.admin1": "#A79E93",
    "map.boundary.coast": "#2F5A73",
    "map.label.primary": "#2B2B2B",
    "map.label.halo": "#FFFFFF",
    "map.accent.1": "#1F6FEB",
    "map.accent.2": "#C47323",
    "map.accent.3": "#2E8B6F",
    "map.accent.4": "#8E5BA6",
    "map.marker.fill": "#E5484D",
  });
});

test("§2.1 map.accent.1 stays #1F6FEB and is not re-tuned for contrast", () => {
  assert.equal(GEO_MAP_PALETTE["map.accent.1"], "#1F6FEB");
  const ratio = geoMapContrastRatio(
    GEO_MAP_PALETTE["map.accent.1"],
    GEO_MAP_PALETTE["map.land"],
  );
  // §2.1 measures 4.11:1 and states the token MUST NOT be re-tinted.
  assert.ok(Math.abs(ratio - 4.11) < 0.02, `accent.1 measured ${ratio}`);
  assert.ok(ratio >= 3);
});

test("§2.4 every §2.1 contrast obligation holds at its measured value", () => {
  const audit = geoMapContrastAudit();
  assert.equal(audit.length, GEO_MAP_CONTRAST_OBLIGATIONS.length);
  for (const row of audit) {
    assert.ok(
      row.ok,
      `${row.foreground} on ${row.background}: ${row.actual} < ${row.minimum}`,
    );
    assert.ok(
      Math.abs(row.actual - row.specMeasured) < 0.02,
      `${row.foreground} on ${row.background}: computed ${row.actual}, spec ${row.specMeasured}`,
    );
  }
});

test("§2.4 SC 1.4.3 rows clear 4.5:1 and SC 1.4.11 rows clear 3.0:1", () => {
  const audit = geoMapContrastAudit();
  const text = audit.filter((row) => row.successCriterion === "1.4.3");
  const nonText = audit.filter((row) => row.successCriterion === "1.4.11");
  assert.ok(text.length >= 2);
  assert.ok(nonText.length >= 6);
  for (const row of text) assert.ok(row.actual >= 4.5, `${row.foreground}`);
  for (const row of nonText) assert.ok(row.actual >= 3, `${row.foreground}`);
  // §2.1 订正: the coastline, not the water/land fill difference, carries the
  // SC 1.4.11 water/land distinction on both sides.
  const coast = audit.filter((row) => row.foreground === "map.boundary.coast");
  assert.equal(coast.length, 2);
  for (const row of coast) {
    assert.equal(row.successCriterion, "1.4.11");
    assert.ok(row.actual >= 3);
  }
  const water = audit.find((row) => row.foreground === "map.water");
  assert.equal(water.successCriterion, null);
  assert.ok(water.actual >= 1.6);
});

test("§2.4 colour is not the only series cue once three series exist (C28)", () => {
  const project = fixtureProject();
  const flat = geoMapLegendPatternObligation(project);
  assert.equal(flat.seriesCount, 3);
  assert.equal(flat.required, true);
  assert.equal(flat.satisfied, false);

  project.legend.entries[1].pattern = "hatch";
  const patterned = geoMapLegendPatternObligation(project);
  assert.equal(patterned.patternCount, 2);
  assert.equal(patterned.satisfied, true);

  const two = fixtureProject();
  two.legend.entries = two.legend.entries.slice(0, 2);
  assert.equal(geoMapLegendPatternObligation(two).required, false);
  assert.equal(GEO_MAP_CONSTANTS.patternRequiredSeriesCount, 3);
});

// ---------------------------------------------------------------------------
// §2.2 / §2.3 版面与字号
// ---------------------------------------------------------------------------

test("§2.2 layout grid matches the spec table", () => {
  assert.equal(GEO_MAP_LAYOUT.canvasWidthPx, 1600);
  assert.equal(GEO_MAP_LAYOUT.canvasHeightPx, 1000);
  assert.equal(GEO_MAP_LAYOUT.gridColumns, 12);
  assert.equal(GEO_MAP_LAYOUT.gridMarginPx, 32);
  assert.equal(GEO_MAP_LAYOUT.gridGutterPx, 16);
  assert.equal(GEO_MAP_LAYOUT.legendSafeAreaPx, 24);
  assert.equal(GEO_MAP_LAYOUT.legendMaxColumns, 3);
  assert.equal(GEO_MAP_LAYOUT.attributionBarHeightPx, 28);
});

test("§2.3 type scale matches the spec table", () => {
  assert.deepEqual(GEO_MAP_TYPE_SCALE, {
    title: { size: 28, lineHeight: 36 },
    subtitle: { size: 18, lineHeight: 26 },
    legend: { size: 14, lineHeight: 20 },
    "label.major": { size: 13, lineHeight: 18 },
    "label.minor": { size: 11, lineHeight: 15 },
    attribution: { size: 10, lineHeight: 14 },
  });
});

// ---------------------------------------------------------------------------
// §4 数值常量表
// ---------------------------------------------------------------------------

test("§4 C1-C40 constants hold their spec values", () => {
  const expected = {
    zoomMin: 0,
    zoomMax: 24,
    zoomWorldDefault: 1.2,
    zoomContinentDefault: 3.5,
    zoomCountryDefault: 5,
    longitudeMin: -180,
    longitudeMax: 180,
    mercatorLatitudeLimit: 85.0511,
    geographicLatitudeLimit: 90,
    bearingMin: 0,
    bearingExclusiveMax: 360,
    pitchMax: 60,
    layersMin: 3,
    layersMax: 60,
    sourcesMax: 24,
    featureCountMax: 200000,
    dependencyByteMax: 33554432,
    dependencyCountMax: 512,
    lineWidthMin: 0.25,
    lineWidthMax: 24,
    countryLineWidthWorldPx: 1.25,
    countryLineWidthRegionalPx: 1.75,
    admin1LineWidthDetailPx: 0.75,
    circleRadiusMin: 1,
    circleRadiusMax: 64,
    textSizeMin: 9,
    textSizeMax: 40,
    textHaloWidthPx: 1.5,
    textHaloWidthMax: 4,
    hitTargetMinPx: 24,
    keyboardPanStepDefaultPx: 80,
    keyboardPanStepMinPx: 20,
    keyboardPanStepMaxPx: 200,
    keyboardZoomStepDefault: 0.5,
    keyboardZoomStepMin: 0.25,
    keyboardZoomStepMax: 2,
    tileSizeDefault: 512,
    legendEntriesMax: 24,
    legendMaxGridColumns: 3,
    patternRequiredSeriesCount: 3,
    annotationsMax: 200,
    rampStopsMin: 2,
    rampStopsMax: 12,
    exportCanvasWidthPx: 1600,
    exportCanvasHeightPx: 1000,
    attributionBarHeightPx: 28,
    sourceBytesMax: 1048576,
    sourceBytesMin: 6144,
    dependencyClosureBytesMax: 134217728,
    previewRenderBudgetMs: 4000,
    coverMinEdgePx: 128,
    frameColorCountMin: 24,
    jaccardMax: 0.85,
    twinThreshold: 0.99,
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(GEO_MAP_CONSTANTS[key], value, `C constant ${key}`);
  }
});

test("§4 C2-C4 scale band zoom defaults and C16-C18 line widths", () => {
  assert.deepEqual(GEO_MAP_SCALE_BAND_ZOOM, {
    "1:110m": 1.2,
    "1:50m": 3.5,
    "1:10m": 5,
  });
  assert.equal(geoMapCountryLineWidth("1:110m"), 1.25);
  assert.equal(geoMapCountryLineWidth("1:50m"), 1.75);
  assert.equal(geoMapCountryLineWidth("1:10m"), 1.75);
  assert.equal(GEO_MAP_CONSTANTS.admin1LineWidthDetailPx, 0.75);
});

test("§4 C6 latitude limit only relaxes to 90 for equirectangular", () => {
  assert.equal(geoMapLatitudeLimit("mercator"), 85.0511);
  assert.equal(geoMapLatitudeLimit("albers"), 85.0511);
  assert.equal(geoMapLatitudeLimit("globe"), 85.0511);
  assert.equal(geoMapLatitudeLimit("equirectangular"), 90);
});

test("series token order is the four §2.1 accents", () => {
  assert.deepEqual(GEO_MAP_SERIES_TOKENS, [
    "map.accent.1",
    "map.accent.2",
    "map.accent.3",
    "map.accent.4",
  ]);
});

// ---------------------------------------------------------------------------
// §3.3 载入状态机
// ---------------------------------------------------------------------------

test("§3.3 transition table is exactly the ten spec rows", () => {
  assert.equal(GEO_MAP_LOAD_TRANSITIONS.length, 10);
  assert.deepEqual(
    GEO_MAP_LOAD_TRANSITIONS.map((row) => `${row.from}->${row.to}`),
    [
      "empty->parsing",
      "parsing->invalid",
      "parsing->resolving",
      "resolving->ready",
      "resolving->degraded",
      "resolving->invalid",
      "ready->dirty",
      "dirty->saving",
      "saving->ready",
      "saving->dirty",
    ],
  );
  for (const row of GEO_MAP_LOAD_TRANSITIONS) {
    assert.ok(row.trigger.length > 0, `${row.from}->${row.to} has no trigger`);
  }
});

test("§3.3 happy path reaches ready through resolving, never skipping it", () => {
  const machine = new GeoMapLoadMachine();
  assert.equal(machine.state, "empty");
  assert.equal(machine.send("source-bytes"), true);
  assert.equal(machine.state, "parsing");
  assert.equal(machine.send("schema-ok"), true);
  assert.equal(machine.state, "resolving");
  assert.equal(machine.send("closure-complete"), true);
  assert.equal(machine.state, "ready");
  assert.deepEqual(machine.visited, ["empty", "parsing", "resolving", "ready"]);
  assert.equal(machine.failure, null);
});

test("§3.3 resolving splits into ready / degraded / invalid", () => {
  const toResolving = () => {
    const machine = new GeoMapLoadMachine();
    machine.send("source-bytes");
    machine.send("schema-ok");
    return machine;
  };
  assert.equal(
    (() => {
      const m = toResolving();
      m.send("closure-complete");
      return m.state;
    })(),
    "ready",
  );
  const degraded = toResolving();
  degraded.send("closure-partial", {
    code: "geo-map-dependency-closure-incomplete",
    summary: "缺依赖",
    details: ["data/cities.geojson"],
  });
  assert.equal(degraded.state, "degraded");
  assert.deepEqual(degraded.failure.details, ["data/cities.geojson"]);
  const invalid = toResolving();
  invalid.send("closure-empty", {
    code: "geo-map-dependency-closure-incomplete",
    summary: "闭包为空",
    details: [],
  });
  assert.equal(invalid.state, "invalid");
});

test("§3.3 parse failure lands in invalid carrying a §6 code", () => {
  const machine = new GeoMapLoadMachine();
  machine.send("source-bytes");
  machine.send("parse-failed", {
    code: "geo-map-dangling-layer-source",
    summary: "悬空图层",
    details: ["layers[2].source"],
  });
  assert.equal(machine.state, "invalid");
  assert.equal(machine.failure.code, "geo-map-dangling-layer-source");
  assert.deepEqual(machine.failure.details, ["layers[2].source"]);
});

test("§3.3 all five illegal transitions are refused", () => {
  assert.equal(GEO_MAP_ILLEGAL_TRANSITIONS.length, 5);
  assert.deepEqual(
    GEO_MAP_ILLEGAL_TRANSITIONS.map((row) => `${row.from}->${row.to}`),
    [
      "parsing->ready",
      "degraded->saving",
      "invalid->dirty",
      "ready->empty",
      "saving->invalid",
    ],
  );
  for (const row of GEO_MAP_ILLEGAL_TRANSITIONS) {
    assert.equal(geoMapIsIllegalTransition(row.from, row.to), true);
    assert.ok(row.reason.length > 0);
  }

  // parsing -> ready: no event reaches ready without resolving.
  assert.equal(geoMapNextLoadState("parsing", "closure-complete"), null);
  // degraded -> saving: degraded accepts no mutation or commit event at all.
  assert.equal(geoMapNextLoadState("degraded", "edit"), null);
  assert.equal(geoMapNextLoadState("degraded", "commit"), null);
  assert.equal(geoMapStateAllowsMutation("degraded"), false);
  assert.equal(geoMapStateAllowsSave("degraded"), false);
  // invalid -> dirty
  assert.equal(geoMapNextLoadState("invalid", "edit"), null);
  assert.equal(geoMapStateAllowsMutation("invalid"), false);
  // ready -> empty
  assert.equal(geoMapNextLoadState("ready", "source-bytes"), null);
  // saving -> invalid: a rejected commit returns to dirty.
  assert.equal(geoMapNextLoadState("saving", "parse-failed"), null);
  assert.equal(geoMapNextLoadState("saving", "commit-conflict"), "dirty");
});

test("§3.3 save conflict keeps local bytes by returning to dirty", () => {
  const machine = new GeoMapLoadMachine();
  machine.send("source-bytes");
  machine.send("schema-ok");
  machine.send("closure-complete");
  machine.send("edit");
  assert.equal(machine.state, "dirty");
  assert.equal(geoMapStateAllowsSave("dirty"), true);
  machine.send("commit");
  assert.equal(machine.state, "saving");
  machine.send("commit-conflict");
  assert.equal(machine.state, "dirty");
  machine.send("commit");
  machine.send("commit-accepted");
  assert.equal(machine.state, "ready");
});

test("§3.3 editing while dirty stays dirty and never re-enters ready silently", () => {
  assert.equal(geoMapNextLoadState("dirty", "edit"), "dirty");
  assert.equal(geoMapNextLoadState("ready", "commit"), null);
  assert.equal(geoMapNextLoadState("ready", "edit"), "dirty");
});

// ---------------------------------------------------------------------------
// 历史栈
// ---------------------------------------------------------------------------

test("project history records one snapshot per real mutation", () => {
  const history = new GeoMapProjectHistory();
  const a = fixtureProject();
  const b = fixtureProject({ camera: { center: [10, 20], zoom: 6 } });
  assert.equal(history.canUndo, false);
  assert.equal(history.record(a, a), false, "no-op must not enter the stack");
  assert.equal(history.record(a, b), true);
  assert.equal(history.canUndo, true);
  const undone = history.undo(b);
  assert.equal(undone.camera.zoom, 3.5);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo(undone).camera.zoom, 6);
  history.reset();
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

// ---------------------------------------------------------------------------
// 控件族与 §4 钳制
// ---------------------------------------------------------------------------

test("advanced controls cover camera, accessibility and the active layer", () => {
  const project = fixtureProject();
  const controls = geoMapAdvancedControls(project, project.layers[3], tt);
  const ids = controls.map((control) => control.id);
  for (const id of [
    "camera-zoom",
    "camera-lon",
    "camera-lat",
    "camera-bearing",
    "camera-pitch",
    "interaction-pan",
    "interaction-zoom",
    "interaction-rotate",
    "interaction-feature-click",
    "interaction-pan-step",
    "interaction-zoom-step",
    "layer:labels:color",
    "layer:labels:line-width",
    "layer:labels:circle-radius",
    "layer:labels:text-size",
    "layer:labels:halo-width",
  ]) {
    assert.ok(ids.includes(id), `missing control ${id}`);
  }
  const pitch = controls.find((control) => control.id === "camera-pitch");
  assert.equal(pitch.max, 60, "§4 C8 tightens pitch to 60");
  const panStep = controls.find((control) => control.id === "interaction-pan-step");
  assert.equal(panStep.min, 20);
  assert.equal(panStep.max, 200);
  assert.equal(panStep.value, 80);
  const zoomStep = controls.find(
    (control) => control.id === "interaction-zoom-step",
  );
  assert.equal(zoomStep.value, 0.5);
  const lat = controls.find((control) => control.id === "camera-lat");
  assert.equal(lat.max, 85.0511);
});

test("camera commands clamp to the §4 domains", () => {
  const project = fixtureProject();
  const editor = recordingEditor();

  assert.equal(
    applyGeoMapAdvancedCommand(editor, project, command("camera-zoom", 99)),
    true,
  );
  assert.deepEqual(editor.calls.at(-1), ["setCamera", { zoom: 24 }]);

  applyGeoMapAdvancedCommand(editor, project, command("camera-zoom", -5));
  assert.deepEqual(editor.calls.at(-1), ["setCamera", { zoom: 0 }]);

  applyGeoMapAdvancedCommand(editor, project, command("camera-pitch", 85));
  assert.deepEqual(editor.calls.at(-1), ["setCamera", { pitch: 60 }]);

  // C7: bearing has period 360, so 360 folds onto 0 rather than being rejected.
  applyGeoMapAdvancedCommand(editor, project, command("camera-bearing", 360));
  assert.deepEqual(editor.calls.at(-1), ["setCamera", { bearing: 0 }]);
  applyGeoMapAdvancedCommand(editor, project, command("camera-bearing", -1));
  assert.deepEqual(editor.calls.at(-1), ["setCamera", { bearing: 359 }]);

  applyGeoMapAdvancedCommand(editor, project, command("camera-lon", 999));
  assert.deepEqual(editor.calls.at(-1), ["setCamera", { center: [180, 20] }]);
  applyGeoMapAdvancedCommand(editor, project, command("camera-lat", 89));
  assert.deepEqual(editor.calls.at(-1), ["setCamera", { center: [10, 85.0511] }]);

  const equirect = fixtureProject({ projection: { name: "equirectangular" } });
  applyGeoMapAdvancedCommand(editor, equirect, command("camera-lat", 89));
  assert.deepEqual(editor.calls.at(-1), ["setCamera", { center: [10, 89] }]);
});

test("interaction and layer commands clamp to the §4 domains", () => {
  const project = fixtureProject();
  const editor = recordingEditor();

  applyGeoMapAdvancedCommand(editor, project, command("interaction-pan-step", 900));
  assert.deepEqual(editor.calls.at(-1), ["setInteractions", { keyboardPanStepPx: 200 }]);
  applyGeoMapAdvancedCommand(editor, project, command("interaction-zoom-step", 0.01));
  assert.deepEqual(editor.calls.at(-1), ["setInteractions", { keyboardZoomStep: 0.25 }]);
  applyGeoMapAdvancedCommand(
    editor,
    project,
    command("interaction-feature-click", "popup+highlight"),
  );
  assert.deepEqual(editor.calls.at(-1), [
    "setInteractions",
    { featureClick: "popup+highlight" },
  ]);
  applyGeoMapAdvancedCommand(
    editor,
    project,
    command("interaction-feature-click", "javascript:alert(1)"),
  );
  assert.equal(
    editor.calls.at(-1)[1].featureClick,
    "popup+highlight",
    "an out-of-enum mode must not be forwarded",
  );

  applyGeoMapAdvancedCommand(editor, project, command("layer:coastline:line-width", 99));
  assert.deepEqual(editor.calls.at(-1), [
    "patchLayer",
    "coastline",
    { paint: { lineColor: "#2F5A73", lineWidth: 24 } },
  ]);
  applyGeoMapAdvancedCommand(editor, project, command("layer:cities:circle-radius", 0));
  assert.equal(editor.calls.at(-1)[2].paint.circleRadius, 1);
  applyGeoMapAdvancedCommand(editor, project, command("layer:labels:text-size", 3));
  assert.equal(editor.calls.at(-1)[2].layout.textSize, 9);
  applyGeoMapAdvancedCommand(editor, project, command("layer:labels:halo-width", 40));
  assert.equal(editor.calls.at(-1)[2].paint.textHaloWidth, 4);

  // A control for a layer that no longer exists is swallowed, not applied.
  const before = editor.calls.length;
  applyGeoMapAdvancedCommand(editor, project, command("layer:ghost:color", "#000000"));
  assert.equal(editor.calls.length, before);
  assert.equal(
    applyGeoMapAdvancedCommand(editor, project, command("unrelated-control", 1)),
    false,
  );
});

test("layer colour commands write the paint key that matches the layer type", () => {
  const project = fixtureProject();
  const editor = recordingEditor();
  applyGeoMapAdvancedCommand(editor, project, command("layer:coastline:color", "#2F5A73"));
  assert.ok("lineColor" in editor.calls.at(-1)[2].paint);
  applyGeoMapAdvancedCommand(editor, project, command("layer:cities:color", "#1F6FEB"));
  assert.ok("circleColor" in editor.calls.at(-1)[2].paint);
  applyGeoMapAdvancedCommand(editor, project, command("layer:labels:color", "#2B2B2B"));
  assert.ok("textColor" in editor.calls.at(-1)[2].paint);
  applyGeoMapAdvancedCommand(editor, project, command("layer:background:color", "#F4F1EA"));
  assert.ok("fillColor" in editor.calls.at(-1)[2].paint);
});

test("a transaction only applies on commit", () => {
  const project = fixtureProject();
  const editor = recordingEditor();
  const handled = applyGeoMapAdvancedCommand(editor, project, {
    ...command("camera-zoom", 10),
    transactionId: "t1",
    phase: "update",
  });
  assert.equal(handled, true);
  assert.equal(editor.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 视口层与 Route 接线(源码断言;.tsx 与 useUI 链路不能在 node --test 内求值)
// ---------------------------------------------------------------------------

test("the hook drives the machine and imports only W4's published contract", () => {
  for (const symbol of [
    "parseGeoMapSource",
    "assertGeoMapRoundtrip",
    "validateGeoMapProject",
    "resolveGeoMapDependencyClosure",
    "GEO_MAP_PROJECT_SCHEMA",
  ]) {
    assert.ok(HOOK_SOURCE.includes(symbol), `hook must use ${symbol}`);
  }
  // §5 determinism: the roundtrip guard runs before the commit, not after.
  assert.ok(
    HOOK_SOURCE.indexOf("assertGeoMapRoundtrip(snapshot)") <
      HOOK_SOURCE.indexOf("await commitGeoMapProject"),
  );
  // The Route owns serialization for the JSON export.
  assert.ok(ROUTE_SOURCE.includes("serializeGeoMapProject"));
  assert.ok(HOOK_SOURCE.includes('from "./geo-map-source"'));
  assert.ok(HOOK_SOURCE.includes("commitGeoMapProject"));
  assert.ok(HOOK_SOURCE.includes('from "./geo-map-persistence"'));
  for (const event of [
    '"source-bytes"',
    '"parse-failed"',
    '"schema-ok"',
    '"closure-complete"',
    '"closure-partial"',
    '"closure-empty"',
    '"edit"',
    '"commit"',
    '"commit-accepted"',
    '"commit-conflict"',
  ]) {
    assert.ok(HOOK_SOURCE.includes(`send(${event}`), `hook must send ${event}`);
  }
  assert.ok(
    HOOK_SOURCE.includes("geoMapStateAllowsSave"),
    "save must be gated on the machine, not on a boolean flag",
  );
  assert.ok(HOOK_SOURCE.includes("geoMapStateAllowsMutation"));
  // A new artifact restarts the machine rather than transitioning ready -> empty.
  assert.ok(HOOK_SOURCE.includes("new GeoMapLoadMachine()"));
});

test("the stage renders a distinct surface for every load state", () => {
  for (const state of [
    '"empty"',
    '"parsing"',
    '"resolving"',
    '"invalid"',
    '"degraded"',
  ]) {
    assert.ok(STAGE_SOURCE.includes(state), `stage must handle ${state}`);
  }
  assert.ok(STAGE_SOURCE.includes('role="alert"'), "failures announce themselves");
  assert.ok(STAGE_SOURCE.includes('role="status"'));
  assert.ok(
    STAGE_SOURCE.includes("failure?.details"),
    "each failing item is listed, never silently skipped",
  );
  assert.ok(STAGE_SOURCE.includes("missingSourceKeys"));
  assert.ok(
    !/return null;\s*}\s*$/.test(STAGE_SOURCE),
    "the stage never returns an empty surface",
  );
});

test("SC 2.1.1: pan, zoom, layer visibility and feature focus all have keys", () => {
  for (const key of [
    '"ArrowLeft"',
    '"ArrowRight"',
    '"ArrowUp"',
    '"ArrowDown"',
    '"+"',
    '"-"',
    '"["',
    '"]"',
    '"v"',
  ]) {
    assert.ok(STAGE_SOURCE.includes(`case ${key}`), `missing key handler ${key}`);
  }
  assert.ok(STAGE_SOURCE.includes("editor.panBy"));
  assert.ok(STAGE_SOURCE.includes("editor.zoomBy"));
  assert.ok(STAGE_SOURCE.includes("editor.toggleLayerVisibility"));
  assert.ok(STAGE_SOURCE.includes("editor.focusFeature"));
  assert.ok(STAGE_SOURCE.includes("tabIndex={0}"), "the viewport is focusable");
  assert.ok(
    STAGE_SOURCE.includes("focus-visible:ring"),
    "focus must be visible on the viewport",
  );
  assert.ok(CONTROLS_SOURCE.includes("focus-visible:ring"));
  for (const method of ["panBy", "zoomBy", "toggleLayerVisibility", "focusFeature"]) {
    assert.ok(HOOK_SOURCE.includes(`${method}:`), `hook must expose ${method}`);
  }
});

test("SC 2.5.8: clickable targets declare the 24 px floor", () => {
  assert.equal(GEO_MAP_CONSTANTS.hitTargetMinPx, 24);
  for (const source of [STAGE_SOURCE, CONTROLS_SOURCE]) {
    assert.ok(source.includes("hitTargetMinPx"));
    assert.ok(source.includes("minWidth"));
    assert.ok(source.includes("minHeight"));
  }
});

test("the context toolbar is a shared-ownership SelectionToolbar", () => {
  assert.ok(TOOLBAR_SOURCE.includes("SelectionToolbar"));
  assert.ok(TOOLBAR_SOURCE.includes("geoMapAdvancedControls"));
  assert.ok(TOOLBAR_SOURCE.includes("applyGeoMapAdvancedCommand"));
  for (const id of [
    '"title"',
    '"projection-name"',
    '"basemap-provider"',
    '"basemap-scale-band"',
    '"legend-position"',
    '"layer-selector"',
  ]) {
    assert.ok(TOOLBAR_SOURCE.includes(id), `toolbar must expose ${id}`);
  }
  assert.ok(
    TOOLBAR_SOURCE.includes("message.selectionRevision !== editor.editRevision"),
    "stale toolbar commands must be dropped",
  );
});

test("GeoMapRoute default-exports and actually mounts the editor", () => {
  assert.ok(
    /export default GeoMapRoute;/.test(ROUTE_SOURCE),
    "W3 dispatches on the default export",
  );
  assert.ok(/export function GeoMapRoute\(/.test(ROUTE_SOURCE));
  assert.ok(ROUTE_SOURCE.includes("useGeoMapWorkbench(item, siteId)"));
  assert.ok(ROUTE_SOURCE.includes("<GeoMapStage editor={editor} />"));
  assert.ok(ROUTE_SOURCE.includes("<GeoMapControls editor={editor} />"));
  assert.ok(ROUTE_SOURCE.includes("<GeoMapContextToolbar editor={editor}"));
  assert.ok(ROUTE_SOURCE.includes("AdvancedWorkbenchShell"));
  // Registration semantics: adapter id "geo-map", content viewport, shared
  // toolbar, project persistence.
  assert.ok(ROUTE_SOURCE.includes('const GEO_MAP_ADAPTER_ID = "geo-map" as const'));
  assert.ok(ROUTE_SOURCE.includes("nativeChrome: { viewport: true }"));
  assert.ok(
    !/nativeChrome:\s*\{[^}]*toolbar:\s*true/.test(ROUTE_SOURCE),
    "toolbarOwnership is shared, so the editor must not claim the toolbar",
  );
  assert.ok(ROUTE_SOURCE.includes("persistence: {"));
  assert.ok(ROUTE_SOURCE.includes("editorToolLabel({ type: \"geo-map\" })"));
  assert.ok(
    ROUTE_SOURCE.includes("advancedRecoveryKey"),
    "the route must register a recovery key",
  );
});

test("the viewport layer never widens the sandbox or edits W4's plane", () => {
  const owned = [HOOK_SOURCE, STAGE_SOURCE, CONTROLS_SOURCE, TOOLBAR_SOURCE, ROUTE_SOURCE];
  for (const source of owned) {
    assert.ok(!/\bnew Function\b|\beval\(/.test(source));
    assert.ok(!/dangerouslySetInnerHTML/.test(source));
    assert.ok(!/postMessage\(/.test(source));
    assert.ok(!/<iframe/.test(source));
    assert.ok(!/https?:\/\/(?!json-schema|example)/.test(source), "no third-party origin");
  }
  // The only remote read is the first-party, byte-bounded rendition fetch.
  assert.ok(HOOK_SOURCE.includes("fetchMediaBlob"));
  assert.ok(HOOK_SOURCE.includes("GEO_MAP_CONSTANTS.sourceBytesMax"));
});
