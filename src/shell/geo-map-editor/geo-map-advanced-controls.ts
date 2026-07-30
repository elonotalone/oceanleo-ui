import type { UITranslate } from "../../i18n/ui/useUI";
import type {
  SelectionCommand,
  SelectionControl,
} from "../selection-context";
import {
  GEO_MAP_CONSTANTS,
  GEO_MAP_PALETTE,
  geoMapContrastRatio,
  type GeoMapLayer,
  type GeoMapProject,
} from "./geo-map-source";
import { GEO_MAP_LAYOUT, GEO_MAP_TYPE_SCALE } from "./geo-map-render";
import type { GeoMapWorkbenchState } from "./use-geo-map-workbench";

/**
 * §2.1 palette and §4 constants live in the schema plane; the viewport re-exports
 * them so surfaces read one set of values rather than a second transcription.
 * `map.accent.1` stays `#1F6FEB` to match the deck generator's theme.accent, and
 * §2.1 forbids re-tuning it for contrast because 4.11:1 already clears SC 1.4.11.
 */
export { GEO_MAP_CONSTANTS, GEO_MAP_PALETTE, geoMapContrastRatio };

export type GeoMapPaletteToken = keyof typeof GEO_MAP_PALETTE;

/** Data-series order; §2.4 forbids colour as the only series distinction. */
export const GEO_MAP_SERIES_TOKENS: readonly GeoMapPaletteToken[] =
  Object.freeze([
    "map.accent.1",
    "map.accent.2",
    "map.accent.3",
    "map.accent.4",
  ] as const);

/**
 * §2.2 grid and §2.3 type scale are declared once in the render plane, which is
 * the surface that has to lay pixels out; the toolbar re-exports them.
 */
export { GEO_MAP_LAYOUT, GEO_MAP_TYPE_SCALE };

/** Zoom default per §4 C2–C4, keyed by the §3.2 scaleBand enum. */
export const GEO_MAP_SCALE_BAND_ZOOM = Object.freeze({
  "1:110m": GEO_MAP_CONSTANTS.zoomWorldDefault,
  "1:50m": GEO_MAP_CONSTANTS.zoomContinentDefault,
  "1:10m": GEO_MAP_CONSTANTS.zoomCountryDefault,
} as const);

/**
 * §4 C6: only `equirectangular` reaches ±90; mercator, albers and globe clamp at
 * ±85.0511. Mirrors the schema plane's own rule so the two never disagree.
 */
export function geoMapLatitudeLimit(
  projectionName: GeoMapProject["projection"]["name"],
): number {
  return projectionName === "equirectangular"
    ? GEO_MAP_CONSTANTS.geographicLatitudeLimit
    : GEO_MAP_CONSTANTS.mercatorLatitudeLimit;
}

/** Country border width per §4 C16–C17. */
export function geoMapCountryLineWidth(scaleBand: string): number {
  return scaleBand === "1:110m"
    ? GEO_MAP_CONSTANTS.countryLineWidthWorldPx
    : GEO_MAP_CONSTANTS.countryLineWidthRegionalPx;
}

export interface GeoMapContrastObligation {
  foreground: GeoMapPaletteToken;
  background: GeoMapPaletteToken;
  minimum: number;
  /** Value printed in the §2.1 table, kept so drift is detectable. */
  specMeasured: number;
  /** WCAG 2.2 success criterion, or null for the spec's self-declared tiering. */
  successCriterion: "1.4.3" | "1.4.11" | null;
}

/** Every contrast obligation named in geo-map.md §2.1, in table order. */
export const GEO_MAP_CONTRAST_OBLIGATIONS: readonly GeoMapContrastObligation[] =
  Object.freeze([
    {
      foreground: "map.water",
      background: "map.land",
      minimum: 1.6,
      specMeasured: 1.79,
      successCriterion: null,
    },
    {
      foreground: "map.boundary.country",
      background: "map.land",
      minimum: 3,
      specMeasured: 5.29,
      successCriterion: "1.4.11",
    },
    {
      foreground: "map.boundary.admin1",
      background: "map.land",
      minimum: 1.8,
      specMeasured: 2.34,
      successCriterion: null,
    },
    {
      foreground: "map.boundary.coast",
      background: "map.water",
      minimum: 3,
      specMeasured: 3.67,
      successCriterion: "1.4.11",
    },
    {
      foreground: "map.boundary.coast",
      background: "map.land",
      minimum: 3,
      specMeasured: 6.58,
      successCriterion: "1.4.11",
    },
    {
      foreground: "map.label.primary",
      background: "map.land",
      minimum: 4.5,
      specMeasured: 12.55,
      successCriterion: "1.4.3",
    },
    {
      foreground: "map.label.primary",
      background: "map.water",
      minimum: 4.5,
      specMeasured: 7.01,
      successCriterion: "1.4.3",
    },
    {
      foreground: "map.accent.1",
      background: "map.land",
      minimum: 3,
      specMeasured: 4.11,
      successCriterion: "1.4.11",
    },
    {
      foreground: "map.accent.2",
      background: "map.land",
      minimum: 3,
      specMeasured: 3.2,
      successCriterion: "1.4.11",
    },
    {
      foreground: "map.accent.3",
      background: "map.land",
      minimum: 3,
      specMeasured: 3.69,
      successCriterion: "1.4.11",
    },
    {
      foreground: "map.accent.4",
      background: "map.land",
      minimum: 3,
      specMeasured: 4.44,
      successCriterion: "1.4.11",
    },
    {
      foreground: "map.marker.fill",
      background: "map.land",
      minimum: 3,
      specMeasured: 3.47,
      successCriterion: "1.4.11",
    },
  ] as const);

export interface GeoMapContrastResult extends GeoMapContrastObligation {
  actual: number;
  ok: boolean;
}

export function geoMapContrastAudit(): GeoMapContrastResult[] {
  return GEO_MAP_CONTRAST_OBLIGATIONS.map((obligation) => {
    const actual = geoMapContrastRatio(
      GEO_MAP_PALETTE[obligation.foreground],
      GEO_MAP_PALETTE[obligation.background],
    );
    return { ...obligation, actual, ok: actual >= obligation.minimum };
  });
}

/**
 * §2.4 last bullet + §4 C28. Three or more data series must carry at least two
 * distinct legend patterns so colour is never the only distinguishing cue.
 */
export function geoMapLegendPatternObligation(project: GeoMapProject): {
  required: boolean;
  satisfied: boolean;
  seriesCount: number;
  patternCount: number;
} {
  const entries = project.legend?.entries ?? [];
  const seriesCount = entries.length;
  const patternCount = new Set(
    entries.map((entry) => entry.pattern || "solid"),
  ).size;
  const required = seriesCount >= GEO_MAP_CONSTANTS.patternRequiredSeriesCount;
  return {
    required,
    satisfied: !required || patternCount >= 2,
    seriesCount,
    patternCount,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value: SelectionCommand["value"], fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The paint key a layer type colours through, per the §3.2 paint object. */
function layerColorKey(
  type: GeoMapLayer["type"],
): "lineColor" | "circleColor" | "textColor" | "fillColor" {
  if (type === "line") return "lineColor";
  if (type === "circle") return "circleColor";
  if (type === "symbol") return "textColor";
  return "fillColor";
}

function layerPaintColor(layer: GeoMapLayer): string {
  const { paint } = layer;
  for (const value of [
    paint.fillColor,
    paint.lineColor,
    paint.circleColor,
    paint.textColor,
  ]) {
    if (typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)) {
      return value;
    }
  }
  return GEO_MAP_PALETTE["map.accent.1"];
}

function cameraControls(
  project: GeoMapProject,
  tt: UITranslate,
): SelectionControl[] {
  const group = {
    slot: "inspector" as const,
    inspectorGroup: "geo-map-camera",
    inspectorLabel: tt("镜头"),
    inspectorIcon: "position" as const,
  };
  const latitudeLimit = geoMapLatitudeLimit(project.projection.name);
  return [
    {
      id: "camera-zoom",
      kind: "range",
      label: tt("缩放层级"),
      value: project.camera.zoom,
      min: GEO_MAP_CONSTANTS.zoomMin,
      max: GEO_MAP_CONSTANTS.zoomMax,
      step: GEO_MAP_CONSTANTS.keyboardZoomStepMin,
      ...group,
    },
    {
      id: "camera-lon",
      kind: "number",
      label: tt("中心经度"),
      value: project.camera.center[0],
      min: GEO_MAP_CONSTANTS.longitudeMin,
      max: GEO_MAP_CONSTANTS.longitudeMax,
      step: 0.1,
      ...group,
    },
    {
      id: "camera-lat",
      kind: "number",
      label: tt("中心纬度"),
      value: project.camera.center[1],
      min: -latitudeLimit,
      max: latitudeLimit,
      step: 0.1,
      ...group,
    },
    {
      id: "camera-bearing",
      kind: "range",
      label: tt("方位角"),
      value: project.camera.bearing ?? 0,
      min: GEO_MAP_CONSTANTS.bearingMin,
      max: 359.999,
      step: 1,
      ...group,
    },
    {
      id: "camera-pitch",
      kind: "range",
      label: tt("俯仰角"),
      value: project.camera.pitch ?? 0,
      min: 0,
      // §4 C8 tightens R1's 85°/180° to 60°, above which §2.4 4.5:1 label
      // contrast cannot be verified in the static export.
      max: GEO_MAP_CONSTANTS.pitchMax,
      step: 1,
      ...group,
    },
  ];
}

function accessibilityControls(
  project: GeoMapProject,
  tt: UITranslate,
): SelectionControl[] {
  const group = {
    slot: "inspector" as const,
    inspectorGroup: "geo-map-accessibility",
    inspectorLabel: tt("键盘与无障碍"),
    inspectorIcon: "select" as const,
  };
  const interactions = project.interactions ?? {};
  return [
    {
      id: "interaction-pan",
      kind: "toggle",
      label: tt("允许平移"),
      value: interactions.pan !== false,
      ...group,
    },
    {
      id: "interaction-zoom",
      kind: "toggle",
      label: tt("允许缩放"),
      value: interactions.zoom !== false,
      ...group,
    },
    {
      id: "interaction-rotate",
      kind: "toggle",
      label: tt("允许旋转"),
      value: interactions.rotate === true,
      ...group,
    },
    {
      id: "interaction-feature-click",
      kind: "select",
      label: tt("要素点击"),
      value: String(interactions.featureClick || "highlight"),
      options: [
        { value: "none", label: tt("不响应") },
        { value: "popup", label: tt("弹出卡片") },
        { value: "highlight", label: tt("高亮") },
        { value: "popup+highlight", label: tt("弹出并高亮") },
      ],
      ...group,
    },
    {
      id: "interaction-pan-step",
      kind: "range",
      label: tt("键盘平移步长 (px)"),
      value:
        interactions.keyboardPanStepPx ??
        GEO_MAP_CONSTANTS.keyboardPanStepDefaultPx,
      min: GEO_MAP_CONSTANTS.keyboardPanStepMinPx,
      max: GEO_MAP_CONSTANTS.keyboardPanStepMaxPx,
      step: 10,
      ...group,
    },
    {
      id: "interaction-zoom-step",
      kind: "range",
      label: tt("键盘缩放步长"),
      value:
        interactions.keyboardZoomStep ??
        GEO_MAP_CONSTANTS.keyboardZoomStepDefault,
      min: GEO_MAP_CONSTANTS.keyboardZoomStepMin,
      max: GEO_MAP_CONSTANTS.keyboardZoomStepMax,
      step: 0.25,
      ...group,
    },
  ];
}

export function geoMapAdvancedControls(
  project: GeoMapProject,
  activeLayer: GeoMapLayer | undefined,
  tt: UITranslate,
): SelectionControl[] {
  const controls: SelectionControl[] = [
    ...cameraControls(project, tt),
    ...accessibilityControls(project, tt),
  ];
  if (!activeLayer) return controls;
  const group = {
    slot: "inspector" as const,
    inspectorGroup: "geo-map-layer-paint",
    inspectorLabel: tt("当前图层样式"),
    inspectorIcon: "layers" as const,
  };
  const { paint } = activeLayer;
  controls.push(
    {
      id: `layer:${activeLayer.id}:color`,
      kind: "color",
      label: tt("图层颜色"),
      value: layerPaintColor(activeLayer),
      ...group,
    },
    {
      id: `layer:${activeLayer.id}:line-width`,
      kind: "range",
      label: tt("线宽 (px)"),
      value: Number(paint.lineWidth ?? GEO_MAP_CONSTANTS.countryLineWidthWorldPx),
      min: GEO_MAP_CONSTANTS.lineWidthMin,
      max: GEO_MAP_CONSTANTS.lineWidthMax,
      step: 0.25,
      disabled: activeLayer.type !== "line",
      ...group,
    },
    {
      id: `layer:${activeLayer.id}:circle-radius`,
      kind: "range",
      label: tt("点半径 (px)"),
      value: Number(paint.circleRadius ?? 4),
      min: GEO_MAP_CONSTANTS.circleRadiusMin,
      max: GEO_MAP_CONSTANTS.circleRadiusMax,
      step: 1,
      disabled: activeLayer.type !== "circle",
      ...group,
    },
    {
      id: `layer:${activeLayer.id}:text-size`,
      kind: "number",
      label: tt("标注字号 (px)"),
      value: Number(
        activeLayer.layout?.textSize ?? GEO_MAP_TYPE_SCALE["label.major"].size,
      ),
      min: GEO_MAP_CONSTANTS.textSizeMin,
      max: GEO_MAP_CONSTANTS.textSizeMax,
      step: 1,
      disabled: activeLayer.type !== "symbol",
      ...group,
    },
    {
      id: `layer:${activeLayer.id}:halo-width`,
      kind: "range",
      label: tt("描边宽度 (px)"),
      value: Number(
        paint.textHaloWidth ?? GEO_MAP_CONSTANTS.textHaloWidthPx,
      ),
      min: 0,
      max: GEO_MAP_CONSTANTS.textHaloWidthMax,
      step: 0.5,
      disabled: activeLayer.type !== "symbol",
      ...group,
    },
  );
  return controls;
}

export function applyGeoMapAdvancedCommand(
  editor: GeoMapWorkbenchState,
  project: GeoMapProject,
  message: SelectionCommand,
): boolean {
  if (message.controlId.startsWith("camera-")) {
    if (message.transactionId && message.phase !== "commit") return true;
    const field = message.controlId.slice("camera-".length);
    const latitudeLimit = geoMapLatitudeLimit(project.projection.name);
    if (field === "zoom") {
      editor.setCamera({
        zoom: clamp(
          numberOr(message.value, project.camera.zoom),
          GEO_MAP_CONSTANTS.zoomMin,
          GEO_MAP_CONSTANTS.zoomMax,
        ),
      });
    } else if (field === "lon" || field === "lat") {
      const [lon, lat] = project.camera.center;
      const next: [number, number] =
        field === "lon"
          ? [
              clamp(
                numberOr(message.value, lon),
                GEO_MAP_CONSTANTS.longitudeMin,
                GEO_MAP_CONSTANTS.longitudeMax,
              ),
              lat,
            ]
          : [
              lon,
              clamp(numberOr(message.value, lat), -latitudeLimit, latitudeLimit),
            ];
      editor.setCamera({ center: next });
    } else if (field === "bearing") {
      const raw = numberOr(message.value, project.camera.bearing ?? 0);
      // §4 C7: period 360, so 360 folds back onto 0 instead of being rejected.
      const bearing =
        ((raw % GEO_MAP_CONSTANTS.bearingExclusiveMax) +
          GEO_MAP_CONSTANTS.bearingExclusiveMax) %
        GEO_MAP_CONSTANTS.bearingExclusiveMax;
      editor.setCamera({ bearing });
    } else if (field === "pitch") {
      editor.setCamera({
        pitch: clamp(
          numberOr(message.value, project.camera.pitch ?? 0),
          0,
          GEO_MAP_CONSTANTS.pitchMax,
        ),
      });
    }
    return true;
  }

  if (message.controlId.startsWith("interaction-")) {
    if (message.transactionId && message.phase !== "commit") return true;
    const field = message.controlId.slice("interaction-".length);
    if (field === "pan" || field === "zoom" || field === "rotate") {
      editor.setInteractions({ [field]: message.value === true });
    } else if (field === "feature-click") {
      const value = String(message.value);
      if (["none", "popup", "highlight", "popup+highlight"].includes(value)) {
        editor.setInteractions({
          featureClick: value as NonNullable<
            GeoMapProject["interactions"]
          >["featureClick"],
        });
      }
    } else if (field === "pan-step") {
      editor.setInteractions({
        keyboardPanStepPx: clamp(
          numberOr(message.value, GEO_MAP_CONSTANTS.keyboardPanStepDefaultPx),
          GEO_MAP_CONSTANTS.keyboardPanStepMinPx,
          GEO_MAP_CONSTANTS.keyboardPanStepMaxPx,
        ),
      });
    } else if (field === "zoom-step") {
      editor.setInteractions({
        keyboardZoomStep: clamp(
          numberOr(message.value, GEO_MAP_CONSTANTS.keyboardZoomStepDefault),
          GEO_MAP_CONSTANTS.keyboardZoomStepMin,
          GEO_MAP_CONSTANTS.keyboardZoomStepMax,
        ),
      });
    }
    return true;
  }

  const layerMatch =
    /^layer:([a-z][a-z0-9_-]{0,63}):(color|line-width|circle-radius|text-size|halo-width)$/.exec(
      message.controlId,
    );
  if (!layerMatch) return false;
  if (message.transactionId && message.phase !== "commit") return true;
  const [, id, field] = layerMatch;
  const layer = project.layers.find((entry) => entry.id === id);
  if (!layer) return true;
  const { paint } = layer;
  if (field === "color") {
    const value = String(message.value || layerPaintColor(layer));
    editor.patchLayer(id, {
      paint: { ...paint, [layerColorKey(layer.type)]: value },
    });
    return true;
  }
  if (field === "line-width") {
    editor.patchLayer(id, {
      paint: {
        ...paint,
        lineWidth: clamp(
          numberOr(message.value, GEO_MAP_CONSTANTS.countryLineWidthWorldPx),
          GEO_MAP_CONSTANTS.lineWidthMin,
          GEO_MAP_CONSTANTS.lineWidthMax,
        ),
      },
    });
    return true;
  }
  if (field === "circle-radius") {
    editor.patchLayer(id, {
      paint: {
        ...paint,
        circleRadius: clamp(
          numberOr(message.value, 4),
          GEO_MAP_CONSTANTS.circleRadiusMin,
          GEO_MAP_CONSTANTS.circleRadiusMax,
        ),
      },
    });
    return true;
  }
  if (field === "halo-width") {
    editor.patchLayer(id, {
      paint: {
        ...paint,
        textHaloWidth: clamp(
          numberOr(message.value, GEO_MAP_CONSTANTS.textHaloWidthPx),
          0,
          GEO_MAP_CONSTANTS.textHaloWidthMax,
        ),
      },
    });
    return true;
  }
  editor.patchLayer(id, {
    layout: {
      ...(layer.layout ?? {}),
      textSize: clamp(
        numberOr(message.value, GEO_MAP_TYPE_SCALE["label.major"].size),
        GEO_MAP_CONSTANTS.textSizeMin,
        GEO_MAP_CONSTANTS.textSizeMax,
      ),
    },
  });
  return true;
}
