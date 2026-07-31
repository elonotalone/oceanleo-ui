/**
 * §5.4 render path. `maplibre-gl` is not in the dependency tree (§1.2), so the
 * only compliant v1 path is drawing the §3.2 primitive set through a Canvas 2D
 * surface with closed-form projections. Nothing here fetches: every byte the
 * renderer touches is handed in by the caller from the dependency closure.
 */

import {
  GEO_MAP_CONSTANTS,
  GEO_MAP_PALETTE,
  type GeoMapAnnotation,
  type GeoMapColor,
  type GeoMapColorOrRamp,
  type GeoMapErrorCode,
  type GeoMapGeometry,
  type GeoMapLayer,
  type GeoMapProject,
  type GeoMapValidationError,
} from "./geo-map-schema";

/** §2.2 版面栅格. */
export const GEO_MAP_LAYOUT = {
  canvasWidthPx: GEO_MAP_CONSTANTS.exportCanvasWidthPx,
  canvasHeightPx: GEO_MAP_CONSTANTS.exportCanvasHeightPx,
  gridColumns: 12,
  gridMarginPx: 32,
  gridGutterPx: 16,
  legendSafeAreaPx: 24,
  legendMaxColumns: GEO_MAP_CONSTANTS.legendMaxGridColumns,
  attributionBarHeightPx: GEO_MAP_CONSTANTS.attributionBarHeightPx,
} as const;

/** §2.3 字号档 (px / line-height px). */
export const GEO_MAP_TYPE_SCALE = {
  title: { size: 28, lineHeight: 36 },
  subtitle: { size: 18, lineHeight: 26 },
  legend: { size: 14, lineHeight: 20 },
  "label.major": { size: 13, lineHeight: 18 },
  "label.minor": { size: 11, lineHeight: 15 },
  attribution: { size: 10, lineHeight: 14 },
} as const;

export interface GeoMapFeature {
  type?: "Feature";
  geometry: GeoMapGeometry;
  properties?: Record<string, unknown>;
}

export interface GeoMapFeatureCollection {
  type?: "FeatureCollection";
  features: GeoMapFeature[];
}

/**
 * Paint slot type as the platform declares it. `CanvasRenderingContext2D`
 * accepts a gradient or a pattern here, so narrowing this to `string` would
 * make the DOM context fail to satisfy the subset below. This renderer only
 * ever writes CSS colour strings.
 */
export type GeoMapCanvasPaint = string | CanvasGradient | CanvasPattern;

/** The Canvas 2D subset this path needs; `@napi-rs/canvas` and the DOM both satisfy it. */
export interface GeoMapRenderContext {
  fillStyle: GeoMapCanvasPaint;
  strokeStyle: GeoMapCanvasPaint;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineJoin: string;
  lineCap: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect?(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeText?(text: string, x: number, y: number): void;
  measureText?(text: string): { width: number };
  setLineDash?(segments: number[]): void;
}

export interface GeoMapCanvasLike {
  width?: number;
  height?: number;
  getContext(contextId: "2d"): GeoMapRenderContext | null;
}

export type GeoMapDegradation =
  | "heatmap-to-graduated-bands"
  | "fill-extrusion-to-shaded-polygon"
  | "raster-to-flat-band"
  | "pitch-flattened"
  | "globe-backface-clipped";

export interface GeoMapSkippedLayer {
  id: string;
  reason:
    | "hidden"
    | "zoom-range"
    | "missing-data"
    | "unsupported-paint"
    | "outside-viewport";
}

export interface GeoMapRenderArgs {
  project: GeoMapProject;
  canvas?: GeoMapCanvasLike;
  context?: GeoMapRenderContext;
  width?: number;
  height?: number;
  /** Decoded GeoJSON per `sources` key, resolved from the dependency closure. */
  features?: Record<string, GeoMapFeatureCollection>;
  /** Render the legend / attribution chrome. Defaults to true. */
  chrome?: boolean;
}

export interface GeoMapRenderResult {
  ok: boolean;
  width: number;
  height: number;
  /** §3.3 `degraded`: something could not be drawn from the closure at hand. */
  degraded: boolean;
  drawnLayerIds: string[];
  skippedLayers: GeoMapSkippedLayer[];
  degradations: Array<{ layerId: string; kind: GeoMapDegradation }>;
  missingSourceKeys: string[];
  /** Distinct colours actually written; the ≥24 frame floor (C38) is judged on the capture. */
  colors: string[];
  annotationsDrawn: number;
  errors: GeoMapValidationError[];
  warnings: GeoMapValidationError[];
}

export interface GeoMapViewport {
  width: number;
  height: number;
}

export interface GeoMapProjector {
  project(lonLat: readonly [number, number]): [number, number] | null;
  unproject(point: readonly [number, number]): [number, number] | null;
  worldSize: number;
}

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

function renderError(
  code: GeoMapErrorCode,
  path: string,
  message: string,
): GeoMapValidationError {
  return { code, path, message };
}

function worldSize(zoom: number): number {
  return GEO_MAP_CONSTANTS.tileSizeDefault * Math.pow(2, zoom);
}

function clampLatitude(latitude: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, latitude));
}

/**
 * §4 C1-C8 in closed form. Mercator and equirectangular are invertible, which is
 * what the viewport layer needs for pan / keyboard stepping; albers and globe are
 * forward-only in v1 and report `unproject() === null`.
 */
export function createGeoMapProjector(
  project: GeoMapProject,
  viewport: GeoMapViewport,
): GeoMapProjector {
  const size = worldSize(project.camera.zoom);
  const [centerLon, centerLat] = project.camera.center;
  const bearing = ((project.camera.bearing ?? 0) * Math.PI) / 180;
  const pitchSquash = Math.cos((project.camera.pitch ?? 0) * DEGREES_TO_RADIANS);
  const name = project.projection.name;
  const parallels = project.projection.parallels ?? [20, 50];

  const forwardPlane = (
    lon: number,
    lat: number,
  ): [number, number] | null => {
    if (name === "mercator") {
      const clamped = clampLatitude(lat, GEO_MAP_CONSTANTS.mercatorLatitudeLimit);
      const x = ((lon + 180) / 360) * size;
      const sin = Math.sin(clamped * DEGREES_TO_RADIANS);
      const y =
        (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
      return [x, y];
    }
    if (name === "equirectangular") {
      return [((lon + 180) / 360) * size, ((90 - lat) / 180) * (size / 2)];
    }
    if (name === "albers") {
      const phi1 = parallels[0] * DEGREES_TO_RADIANS;
      const phi2 = parallels[1] * DEGREES_TO_RADIANS;
      const n = 0.5 * (Math.sin(phi1) + Math.sin(phi2));
      if (Math.abs(n) < 1e-9) return null;
      const constant =
        Math.cos(phi1) * Math.cos(phi1) + 2 * n * Math.sin(phi1);
      const rho = (value: number): number => {
        const inner = constant - 2 * n * Math.sin(value * DEGREES_TO_RADIANS);
        return inner <= 0 ? 0 : Math.sqrt(inner) / n;
      };
      const theta = n * (lon - centerLon) * DEGREES_TO_RADIANS;
      const radius = rho(lat);
      const radiusOrigin = rho(centerLat);
      const scale = size / (2 * Math.PI);
      return [
        radius * Math.sin(theta) * scale,
        (radiusOrigin - radius * Math.cos(theta)) * scale,
      ];
    }
    // globe: orthographic about the camera centre; the far hemisphere is clipped.
    const lambda = (lon - centerLon) * DEGREES_TO_RADIANS;
    const phi = lat * DEGREES_TO_RADIANS;
    const phi0 = centerLat * DEGREES_TO_RADIANS;
    const cosC =
      Math.sin(phi0) * Math.sin(phi) +
      Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
    if (cosC < 0) return null;
    const scale = size / (2 * Math.PI);
    return [
      Math.cos(phi) * Math.sin(lambda) * scale,
      -(
        Math.cos(phi0) * Math.sin(phi) -
        Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda)
      ) * scale,
    ];
  };

  const origin = forwardPlane(centerLon, centerLat) ?? [0, 0];

  const toScreen = (plane: [number, number]): [number, number] => {
    let dx = plane[0] - origin[0];
    let dy = (plane[1] - origin[1]) * (pitchSquash > 0 ? pitchSquash : 1);
    if (bearing !== 0) {
      const cos = Math.cos(bearing);
      const sin = Math.sin(bearing);
      const rotatedX = dx * cos - dy * sin;
      const rotatedY = dx * sin + dy * cos;
      dx = rotatedX;
      dy = rotatedY;
    }
    return [viewport.width / 2 + dx, viewport.height / 2 + dy];
  };

  return {
    worldSize: size,
    project(lonLat) {
      const plane = forwardPlane(lonLat[0], lonLat[1]);
      return plane ? toScreen(plane) : null;
    },
    unproject(point) {
      if (name !== "mercator" && name !== "equirectangular") return null;
      let dx = point[0] - viewport.width / 2;
      let dy = point[1] - viewport.height / 2;
      if (bearing !== 0) {
        const cos = Math.cos(-bearing);
        const sin = Math.sin(-bearing);
        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;
        dx = rotatedX;
        dy = rotatedY;
      }
      if (pitchSquash > 0) dy /= pitchSquash;
      const planeX = origin[0] + dx;
      const planeY = origin[1] + dy;
      if (name === "equirectangular") {
        return [
          (planeX / size) * 360 - 180,
          90 - (planeY / (size / 2)) * 180,
        ];
      }
      const longitude = (planeX / size) * 360 - 180;
      const normalized = 0.5 - planeY / size;
      const latitude =
        (2 * Math.atan(Math.exp(normalized * 2 * Math.PI)) - Math.PI / 2) *
        RADIANS_TO_DEGREES;
      return [longitude, latitude];
    },
  };
}

function rampColor(
  ramp: GeoMapColorOrRamp,
  properties: Record<string, unknown> | undefined,
): GeoMapColor | null {
  if (typeof ramp === "string") return ramp;
  const raw = properties?.[ramp.property];
  const value = typeof raw === "number" ? raw : Number(raw);
  const stops = [...ramp.stops].sort((left, right) => left[0] - right[0]);
  if (!Number.isFinite(value)) return stops[0]?.[1] ?? null;
  let chosen = stops[0]?.[1] ?? null;
  for (const [at, color] of stops) {
    if (value >= at) chosen = color;
  }
  return chosen;
}

function darken(color: GeoMapColor, amount: number): GeoMapColor {
  const value = Number.parseInt(color.slice(1), 16);
  const channels = [
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ].map((channel) => Math.max(0, Math.round(channel * (1 - amount))));
  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

interface Painter {
  ctx: GeoMapRenderContext;
  colors: Set<string>;
  fill(color: GeoMapColor): void;
  stroke(color: GeoMapColor, width: number, dash?: number[]): void;
}

function painter(ctx: GeoMapRenderContext): Painter {
  const colors = new Set<string>();
  return {
    ctx,
    colors,
    fill(color) {
      ctx.fillStyle = color;
      colors.add(color.toUpperCase());
      ctx.fill();
    },
    stroke(color, width, dash) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      colors.add(color.toUpperCase());
      ctx.setLineDash?.(dash ?? []);
      ctx.stroke();
    },
  };
}

type Ring = Array<[number, number]>;

function coordinateRings(geometry: GeoMapGeometry): Ring[] {
  const coordinates = geometry.coordinates;
  const asPair = (value: unknown): [number, number] | null =>
    Array.isArray(value) &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
      ? [value[0], value[1]]
      : null;
  if (geometry.type === "Point") {
    const pair = asPair(coordinates);
    return pair ? [[pair]] : [];
  }
  if (geometry.type === "LineString") {
    if (!Array.isArray(coordinates)) return [];
    const ring = coordinates
      .map(asPair)
      .filter((pair): pair is [number, number] => pair !== null);
    return ring.length ? [ring] : [];
  }
  if (geometry.type === "Polygon") {
    if (!Array.isArray(coordinates)) return [];
    return coordinates
      .map((ring) =>
        Array.isArray(ring)
          ? ring
              .map(asPair)
              .filter((pair): pair is [number, number] => pair !== null)
          : [],
      )
      .filter((ring) => ring.length > 2);
  }
  if (!Array.isArray(coordinates)) return [];
  const rings: Ring[] = [];
  for (const polygon of coordinates) {
    if (!Array.isArray(polygon)) continue;
    for (const ring of polygon) {
      if (!Array.isArray(ring)) continue;
      const points = ring
        .map(asPair)
        .filter((pair): pair is [number, number] => pair !== null);
      if (points.length > 2) rings.push(points);
    }
  }
  return rings;
}

function tracePath(
  ctx: GeoMapRenderContext,
  projector: GeoMapProjector,
  rings: Ring[],
  close: boolean,
  offsetY = 0,
): boolean {
  let drew = false;
  ctx.beginPath();
  for (const ring of rings) {
    let started = false;
    for (const coordinate of ring) {
      const point = projector.project(coordinate);
      if (!point) continue;
      if (started) ctx.lineTo(point[0], point[1] + offsetY);
      else {
        ctx.moveTo(point[0], point[1] + offsetY);
        started = true;
      }
      drew = true;
    }
    if (started && close) ctx.closePath();
  }
  return drew;
}

function textWidth(ctx: GeoMapRenderContext, text: string, size: number): number {
  const measured = ctx.measureText?.(text);
  return measured ? measured.width : text.length * size * 0.58;
}

function drawLabel(
  paint: Painter,
  text: string,
  x: number,
  y: number,
  size: number,
  color: GeoMapColor,
  haloColor: GeoMapColor,
  haloWidth: number,
): void {
  const { ctx } = paint;
  ctx.font = `${size}px sans-serif`;
  if (haloWidth > 0 && ctx.strokeText) {
    ctx.strokeStyle = haloColor;
    ctx.lineWidth = haloWidth;
    paint.colors.add(haloColor.toUpperCase());
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  paint.colors.add(color.toUpperCase());
  ctx.fillText(text, x, y);
}

function visibleAtZoom(layer: GeoMapLayer, zoom: number): boolean {
  if (layer.minzoom !== undefined && zoom < layer.minzoom) return false;
  if (layer.maxzoom !== undefined && zoom > layer.maxzoom) return false;
  return true;
}

function pointsOf(features: GeoMapFeature[]): Array<{
  point: [number, number];
  properties: Record<string, unknown> | undefined;
}> {
  const points: Array<{
    point: [number, number];
    properties: Record<string, unknown> | undefined;
  }> = [];
  for (const feature of features) {
    for (const ring of coordinateRings(feature.geometry)) {
      for (const coordinate of ring) {
        points.push({ point: coordinate, properties: feature.properties });
        if (feature.geometry.type !== "Point") break;
      }
    }
  }
  return points;
}

function drawLegend(paint: Painter, project: GeoMapProject, viewport: GeoMapViewport): void {
  const legend = project.legend;
  if (!legend) return;
  const { ctx } = paint;
  const size = GEO_MAP_TYPE_SCALE.legend;
  const columnWidth =
    (viewport.width - GEO_MAP_LAYOUT.gridMarginPx * 2) /
    GEO_MAP_LAYOUT.gridColumns;
  const boxWidth = Math.min(
    columnWidth * GEO_MAP_LAYOUT.legendMaxColumns,
    viewport.width / 2,
  );
  const boxHeight =
    size.lineHeight * legend.entries.length +
    (legend.title ? size.lineHeight : 0) +
    GEO_MAP_LAYOUT.legendSafeAreaPx;
  const left = legend.position.endsWith("left")
    ? GEO_MAP_LAYOUT.legendSafeAreaPx
    : viewport.width - GEO_MAP_LAYOUT.legendSafeAreaPx - boxWidth;
  const top = legend.position.startsWith("top")
    ? GEO_MAP_LAYOUT.legendSafeAreaPx
    : viewport.height -
      GEO_MAP_LAYOUT.attributionBarHeightPx -
      GEO_MAP_LAYOUT.legendSafeAreaPx -
      boxHeight;
  ctx.fillStyle = GEO_MAP_PALETTE["map.label.halo"];
  paint.colors.add(GEO_MAP_PALETTE["map.label.halo"]);
  ctx.fillRect(left, top, boxWidth, boxHeight);
  let cursor = top + size.lineHeight;
  if (legend.title) {
    drawLabel(
      paint,
      legend.title,
      left + 12,
      cursor,
      GEO_MAP_TYPE_SCALE.subtitle.size,
      GEO_MAP_PALETTE["map.label.primary"],
      GEO_MAP_PALETTE["map.label.halo"],
      0,
    );
    cursor += size.lineHeight;
  }
  for (const entry of legend.entries) {
    ctx.fillStyle = entry.swatch;
    paint.colors.add(entry.swatch.toUpperCase());
    ctx.fillRect(left + 12, cursor - size.size + 2, 14, 14);
    // §2.4 / C28: pattern hatching keeps colour from being the only channel.
    if (entry.pattern && entry.pattern !== "solid") {
      ctx.beginPath();
      ctx.moveTo(left + 12, cursor + 2);
      ctx.lineTo(left + 26, cursor - size.size + 2);
      paint.stroke(GEO_MAP_PALETTE["map.label.primary"], 1);
    }
    drawLabel(
      paint,
      entry.label,
      left + 34,
      cursor,
      size.size,
      GEO_MAP_PALETTE["map.label.primary"],
      GEO_MAP_PALETTE["map.label.halo"],
      0,
    );
    cursor += size.lineHeight;
  }
}

function drawAttribution(
  paint: Painter,
  project: GeoMapProject,
  viewport: GeoMapViewport,
): void {
  const { ctx } = paint;
  const bar = GEO_MAP_LAYOUT.attributionBarHeightPx;
  ctx.fillStyle = GEO_MAP_PALETTE["map.label.halo"];
  paint.colors.add(GEO_MAP_PALETTE["map.label.halo"]);
  ctx.fillRect(0, viewport.height - bar, viewport.width, bar);
  const text = project.attribution.entries
    .map((entry) => `${entry.text} (${entry.licenseCode})`)
    .join(" · ");
  drawLabel(
    paint,
    text,
    GEO_MAP_LAYOUT.gridMarginPx,
    viewport.height - bar / 2 + GEO_MAP_TYPE_SCALE.attribution.size / 2 - 2,
    GEO_MAP_TYPE_SCALE.attribution.size,
    GEO_MAP_PALETTE["map.label.primary"],
    GEO_MAP_PALETTE["map.label.halo"],
    0,
  );
}

function drawAnnotations(
  paint: Painter,
  annotations: readonly GeoMapAnnotation[],
  projector: GeoMapProjector,
): number {
  const { ctx } = paint;
  let drawn = 0;
  for (const annotation of annotations) {
    const rings = coordinateRings(annotation.geometry);
    const first = rings[0]?.[0];
    if (!first) continue;
    const anchor = projector.project(first);
    if (!anchor) continue;
    const [offsetX, offsetY] = annotation.offsetPx ?? [0, 0];
    const x = anchor[0] + offsetX;
    const y = anchor[1] + offsetY;
    if (annotation.kind === "marker") {
      ctx.beginPath();
      // C22: the drawn dot is 12 px, the hit box the viewport layer installs is 24 px.
      ctx.arc(x, y, GEO_MAP_CONSTANTS.hitTargetMinPx / 4, 0, Math.PI * 2);
      paint.fill(GEO_MAP_PALETTE["map.marker.fill"]);
    }
    const size =
      annotation.kind === "area-label"
        ? GEO_MAP_TYPE_SCALE["label.major"].size
        : GEO_MAP_TYPE_SCALE["label.minor"].size;
    drawLabel(
      paint,
      annotation.text,
      x + 8,
      y - 6,
      size,
      GEO_MAP_PALETTE["map.label.primary"],
      GEO_MAP_PALETTE["map.label.halo"],
      GEO_MAP_CONSTANTS.textHaloWidthPx,
    );
    drawn += 1;
  }
  return drawn;
}

/**
 * §2.1 订正记录: the 1.79:1 water/land fill difference cannot carry SC 1.4.11 on
 * its own, so a project that fills both water and land MUST also stroke a coast
 * line in `map.boundary.coast`.
 */
export function auditGeoMapCoastline(
  project: GeoMapProject,
): GeoMapValidationError[] {
  const colorsIn = (value: GeoMapColorOrRamp | undefined): string[] =>
    typeof value === "string"
      ? [value.toUpperCase()]
      : value
        ? value.stops.map(([, color]) => color.toUpperCase())
        : [];
  const fills = project.layers.flatMap((layer) => colorsIn(layer.paint.fillColor));
  const strokes = project.layers.flatMap((layer) =>
    colorsIn(layer.paint.lineColor),
  );
  const hasWater = fills.includes(GEO_MAP_PALETTE["map.water"]);
  const hasLand = fills.includes(GEO_MAP_PALETTE["map.land"]);
  if (
    hasWater &&
    hasLand &&
    !strokes.includes(GEO_MAP_PALETTE["map.boundary.coast"])
  ) {
    return [
      renderError(
        "geo-map-label-contrast",
        "layers[].paint.lineColor",
        `water/land fills differ by only 1.79:1; a ${GEO_MAP_PALETTE["map.boundary.coast"]} coast line is required to carry SC 1.4.11`,
      ),
    ];
  }
  return [];
}

export function renderGeoMapToCanvas(
  args: GeoMapRenderArgs,
): GeoMapRenderResult {
  const width = args.width ?? args.canvas?.width ?? GEO_MAP_LAYOUT.canvasWidthPx;
  const height =
    args.height ?? args.canvas?.height ?? GEO_MAP_LAYOUT.canvasHeightPx;
  const ctx = args.context ?? args.canvas?.getContext("2d") ?? null;
  const errors: GeoMapValidationError[] = [];
  const warnings: GeoMapValidationError[] = [];
  if (!ctx) {
    return {
      ok: false,
      width,
      height,
      degraded: true,
      drawnLayerIds: [],
      skippedLayers: [],
      degradations: [],
      missingSourceKeys: [],
      colors: [],
      annotationsDrawn: 0,
      errors: [
        renderError(
          "geo-map-render-unsupported",
          "$",
          "renderGeoMapToCanvas needs a Canvas 2D context; the §5.4 path has no other renderer",
        ),
      ],
      warnings,
    };
  }
  const { project } = args;
  const viewport: GeoMapViewport = { width, height };
  const projector = createGeoMapProjector(project, viewport);
  const paint = painter(ctx);
  const features = args.features ?? {};
  const drawnLayerIds: string[] = [];
  const skippedLayers: GeoMapSkippedLayer[] = [];
  const degradations: Array<{ layerId: string; kind: GeoMapDegradation }> = [];
  const missingSourceKeys = new Set<string>();
  const featureClick = project.interactions?.featureClick ?? "none";

  if ((project.camera.pitch ?? 0) > 0) {
    degradations.push({ layerId: "$camera", kind: "pitch-flattened" });
  }
  if (project.projection.name === "globe") {
    degradations.push({ layerId: "$camera", kind: "globe-backface-clipped" });
  }
  errors.push(...auditGeoMapCoastline(project));

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  for (const layer of project.layers) {
    if (layer.layout?.visibility === "none") {
      skippedLayers.push({ id: layer.id, reason: "hidden" });
      continue;
    }
    if (!visibleAtZoom(layer, project.camera.zoom)) {
      skippedLayers.push({ id: layer.id, reason: "zoom-range" });
      continue;
    }
    if (layer.type === "background") {
      const color = rampColor(layer.paint.fillColor ?? GEO_MAP_PALETTE["map.water"], undefined);
      if (!color) {
        skippedLayers.push({ id: layer.id, reason: "unsupported-paint" });
        continue;
      }
      ctx.globalAlpha = layer.paint.fillOpacity ?? 1;
      ctx.fillStyle = color;
      paint.colors.add(color.toUpperCase());
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      drawnLayerIds.push(layer.id);
      continue;
    }
    if (layer.type === "raster") {
      // No network in the sandbox: a raster layer degrades to a flat band tinted
      // by its own paint, and the result reports the degradation instead of
      // pretending the tiles were drawn.
      const color =
        rampColor(layer.paint.fillColor ?? GEO_MAP_PALETTE["map.water"], undefined) ??
        GEO_MAP_PALETTE["map.water"];
      ctx.globalAlpha = layer.paint.rasterOpacity ?? 1;
      ctx.fillStyle = color;
      paint.colors.add(color.toUpperCase());
      ctx.fillRect(0, 0, width, height - GEO_MAP_LAYOUT.attributionBarHeightPx);
      ctx.globalAlpha = 1;
      degradations.push({ layerId: layer.id, kind: "raster-to-flat-band" });
      drawnLayerIds.push(layer.id);
      continue;
    }
    const collection = features[layer.source];
    if (!collection || !Array.isArray(collection.features) || !collection.features.length) {
      missingSourceKeys.add(layer.source);
      skippedLayers.push({ id: layer.id, reason: "missing-data" });
      continue;
    }
    let drew = false;
    if (layer.type === "fill" || layer.type === "fill-extrusion") {
      const height3d = layer.paint.fillExtrusionHeight ?? 0;
      for (const feature of collection.features) {
        const rings = coordinateRings(feature.geometry);
        if (!rings.length) continue;
        const color = rampColor(
          layer.paint.fillColor ?? GEO_MAP_PALETTE["map.accent.1"],
          feature.properties,
        );
        if (!color) continue;
        if (tracePath(ctx, projector, rings, true)) {
          ctx.globalAlpha = layer.paint.fillOpacity ?? 1;
          paint.fill(color);
          ctx.globalAlpha = 1;
          drew = true;
        }
        if (layer.type === "fill-extrusion" && height3d > 0) {
          // §5.4: extrusion degrades to a shaded polygon (a screen-space lifted
          // roof plus a darker outline), never to nothing at all.
          const lift = -Math.min(24, Math.max(2, height3d / 200));
          if (tracePath(ctx, projector, rings, true, lift)) {
            paint.fill(darken(color, 0.25));
            tracePath(ctx, projector, rings, true, lift);
            paint.stroke(darken(color, 0.45), 1);
          }
        }
      }
      if (layer.type === "fill-extrusion") {
        degradations.push({
          layerId: layer.id,
          kind: "fill-extrusion-to-shaded-polygon",
        });
      }
    } else if (layer.type === "line") {
      for (const feature of collection.features) {
        const rings = coordinateRings(feature.geometry);
        if (!rings.length) continue;
        const color = rampColor(
          layer.paint.lineColor ?? GEO_MAP_PALETTE["map.boundary.country"],
          feature.properties,
        );
        if (!color) continue;
        const close = feature.geometry.type !== "LineString";
        if (tracePath(ctx, projector, rings, close)) {
          paint.stroke(
            color,
            layer.paint.lineWidth ?? GEO_MAP_CONSTANTS.countryLineWidthWorldPx,
            layer.paint.lineDasharray,
          );
          drew = true;
        }
      }
    } else if (layer.type === "circle" || layer.type === "heatmap") {
      const radius =
        layer.type === "heatmap"
          ? (layer.paint.heatmapRadius ?? 16)
          : (layer.paint.circleRadius ?? 4);
      if (
        layer.type === "circle" &&
        featureClick !== "none" &&
        radius * 2 < GEO_MAP_CONSTANTS.hitTargetMinPx
      ) {
        warnings.push(
          renderError(
            "geo-map-render-unsupported",
            `layers.${layer.id}.paint.circleRadius`,
            `clickable circles draw at ${radius * 2} px; SC 2.5.8 needs a ${GEO_MAP_CONSTANTS.hitTargetMinPx} px hit box from the viewport layer`,
          ),
        );
      }
      const bands = layer.type === "heatmap" ? [1, 0.6, 0.3] : [1];
      for (const entry of pointsOf(collection.features)) {
        const point = projector.project(entry.point);
        if (!point) continue;
        const color = rampColor(
          layer.paint.circleColor ??
            layer.paint.fillColor ??
            GEO_MAP_PALETTE["map.accent.3"],
          entry.properties,
        );
        if (!color) continue;
        // §5.4: heatmap degrades to graduated colour bands, not a blur.
        bands.forEach((scale, index) => {
          ctx.beginPath();
          ctx.arc(point[0], point[1], radius * scale, 0, Math.PI * 2);
          paint.fill(index === 0 ? color : darken(color, 0.15 * index));
        });
        drew = true;
      }
      if (layer.type === "heatmap") {
        degradations.push({
          layerId: layer.id,
          kind: "heatmap-to-graduated-bands",
        });
      }
    } else if (layer.type === "symbol") {
      const size = layer.layout?.textSize ?? GEO_MAP_TYPE_SCALE["label.major"].size;
      const template = layer.layout?.textField ?? "";
      for (const entry of pointsOf(collection.features)) {
        const point = projector.project(entry.point);
        if (!point) continue;
        const text = template.replace(
          /\{([a-zA-Z0-9_:-]{1,64})\}/g,
          (_, key: string) => String(entry.properties?.[key] ?? ""),
        );
        if (!text.trim()) continue;
        drawLabel(
          paint,
          text,
          point[0] - textWidth(ctx, text, size) / 2,
          point[1],
          size,
          layer.paint.textColor ?? GEO_MAP_PALETTE["map.label.primary"],
          layer.paint.textHaloColor ?? GEO_MAP_PALETTE["map.label.halo"],
          layer.paint.textHaloWidth ?? GEO_MAP_CONSTANTS.textHaloWidthPx,
        );
        drew = true;
      }
    }
    if (drew) drawnLayerIds.push(layer.id);
    else skippedLayers.push({ id: layer.id, reason: "outside-viewport" });
  }

  const annotationsDrawn = drawAnnotations(
    paint,
    project.annotations ?? [],
    projector,
  );
  if (args.chrome !== false) {
    drawAttribution(paint, project, viewport);
    drawLegend(paint, project, viewport);
  }
  ctx.restore();

  const degraded =
    missingSourceKeys.size > 0 ||
    skippedLayers.some((entry) => entry.reason === "missing-data");
  return {
    ok: errors.length === 0 && drawnLayerIds.length > 0,
    width,
    height,
    degraded,
    drawnLayerIds,
    skippedLayers,
    degradations,
    missingSourceKeys: [...missingSourceKeys].sort(),
    colors: [...paint.colors].sort(),
    annotationsDrawn,
    errors,
    warnings,
  };
}
