/**
 * `oceanleo.geo-map.v1` structure plane.
 *
 * Every constraint here is transcribed from
 * `docs/specs/oceanleo-material-and-game-v1/L1-carriers/geo-map.md`:
 * §3.1 (top-level field list), §3.2 (JSON Schema Draft 2020-12, lines 212-525),
 * §4 (numeric constant table C1-C40), §8.1 byte floor and §8.2 completeness.
 * The validator is hand written rather than schema-driven so that every failure
 * carries the §6 error code the carrier contract asks for.
 */

export const GEO_MAP_PROJECT_SCHEMA = "oceanleo.geo-map.v1" as const;
export const GEO_MAP_PROJECT_VERSION = 1 as const;

/** §1.1 quadruple. Underscore for the DB enum, hyphen for capability/adapter/format. */
export const GEO_MAP_ARTIFACT_TYPE = "geo_map" as const;
export const GEO_MAP_FEATURE_ID = "geo_map_editing" as const;
export const GEO_MAP_EDITOR_CAPABILITY = "geo-map-editor" as const;
export const GEO_MAP_ADAPTER_ID = "geo-map" as const;
export const GEO_MAP_SOURCE_MEDIA_TYPE = "application/json" as const;

/** §4 C1-C40. Values are transcribed, not recomputed. */
export const GEO_MAP_CONSTANTS = {
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
  pitchMin: 0,
  pitchMax: 60,
  layersMin: 3,
  layersMax: 60,
  sourcesMin: 1,
  sourcesMax: 24,
  featureCountMax: 200_000,
  dependencyByteMax: 33_554_432,
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
  sourceBytesMax: 1_048_576,
  sourceBytesMin: 6_144,
  dependencyClosureBytesMax: 134_217_728,
  previewRenderBudgetMs: 4_000,
  coverMinEdgePx: 128,
  frameColorCountMin: 24,
  jaccardMax: 0.85,
  twinThreshold: 0.99,
} as const;

/** §8.1 floors that are not part of §4. */
export const GEO_MAP_CLOSURE_FLOORS = {
  dependencyCountMin: 1,
  dependencyClosureBytesMin: 8_192,
} as const;

/** §8.2 completeness thresholds. */
export const GEO_MAP_COMPLETENESS = {
  layersMin: 3,
  dataLayersMin: 2,
  sourceKeysMin: 1,
  featureCountTotalMin: 24,
  legendEntriesMin: 3,
  annotationsMin: 4,
  attributionEntriesMin: 1,
  frameColorCountMin: 24,
  paintColorsMin: 4,
  titleMinLength: 8,
} as const;

/** §2.1 palette. `map.accent.1` MUST NOT be re-tuned for contrast (§2.1 note). */
export const GEO_MAP_PALETTE = {
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
} as const;

export const GEO_MAP_PROJECTIONS = [
  "mercator",
  "equirectangular",
  "albers",
  "globe",
] as const;
export const GEO_MAP_BASEMAP_PROVIDERS = [
  "natural-earth",
  "nasa-gibs",
  "none",
] as const;
export const GEO_MAP_SCALE_BANDS = ["1:10m", "1:50m", "1:110m"] as const;
/** §1.3 + §3.2 + ADR-10: exactly three codes, `NASA-PD` MUST NOT appear. */
export const GEO_MAP_LICENSE_CODES = ["CC0", "PDM", "NASA-OPEN"] as const;
export const GEO_MAP_SOURCE_TYPES = [
  "geojson",
  "vector",
  "raster",
  "raster-dem",
  "image",
] as const;
export const GEO_MAP_LAYER_TYPES = [
  "fill",
  "line",
  "symbol",
  "circle",
  "heatmap",
  "fill-extrusion",
  "raster",
  "background",
] as const;
export const GEO_MAP_ANNOTATION_KINDS = [
  "marker",
  "callout",
  "area-label",
  "route-label",
] as const;
export const GEO_MAP_ANNOTATION_ANCHORS = [
  "top",
  "bottom",
  "left",
  "right",
  "center",
] as const;
export const GEO_MAP_LEGEND_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;
export const GEO_MAP_LEGEND_PATTERNS = ["solid", "hatch", "dot", "cross"] as const;
export const GEO_MAP_FEATURE_CLICK_MODES = [
  "none",
  "popup",
  "highlight",
  "popup+highlight",
] as const;
export const GEO_MAP_FILTER_OPERATORS = [
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "in",
  "!in",
  "all",
  "any",
] as const;
export const GEO_MAP_GEOMETRY_TYPES = [
  "Point",
  "LineString",
  "Polygon",
  "MultiPolygon",
] as const;
export const GEO_MAP_DEPENDENCY_MEDIA_TYPES = [
  "application/geo+json",
  "application/json",
  "image/png",
  "image/webp",
  "application/vnd.mapbox-vector-tile",
] as const;
export const GEO_MAP_TILE_SIZES = [256, 512] as const;
export const GEO_MAP_LAYER_VISIBILITIES = ["visible", "none"] as const;

export type GeoMapProjectionName = (typeof GEO_MAP_PROJECTIONS)[number];
export type GeoMapBasemapProvider = (typeof GEO_MAP_BASEMAP_PROVIDERS)[number];
export type GeoMapScaleBand = (typeof GEO_MAP_SCALE_BANDS)[number];
export type GeoMapLicenseCode = (typeof GEO_MAP_LICENSE_CODES)[number];
export type GeoMapSourceType = (typeof GEO_MAP_SOURCE_TYPES)[number];
export type GeoMapLayerType = (typeof GEO_MAP_LAYER_TYPES)[number];
export type GeoMapAnnotationKind = (typeof GEO_MAP_ANNOTATION_KINDS)[number];
export type GeoMapAnnotationAnchor = (typeof GEO_MAP_ANNOTATION_ANCHORS)[number];
export type GeoMapLegendPosition = (typeof GEO_MAP_LEGEND_POSITIONS)[number];
export type GeoMapLegendPattern = (typeof GEO_MAP_LEGEND_PATTERNS)[number];
export type GeoMapFeatureClickMode = (typeof GEO_MAP_FEATURE_CLICK_MODES)[number];
export type GeoMapFilterOperator = (typeof GEO_MAP_FILTER_OPERATORS)[number];
export type GeoMapGeometryType = (typeof GEO_MAP_GEOMETRY_TYPES)[number];
export type GeoMapDependencyMediaType =
  (typeof GEO_MAP_DEPENDENCY_MEDIA_TYPES)[number];
export type GeoMapTileSize = (typeof GEO_MAP_TILE_SIZES)[number];
export type GeoMapLayerVisibility = (typeof GEO_MAP_LAYER_VISIBILITIES)[number];

/** `$defs.color`: `^#[0-9A-Fa-f]{6}$`. */
export type GeoMapColor = string;

export interface GeoMapColorRamp {
  property: string;
  stops: Array<[number, GeoMapColor]>;
}

export type GeoMapColorOrRamp = GeoMapColor | GeoMapColorRamp;

/** `$defs.filter`: operator head plus up to 15 operands. */
export type GeoMapFilter = [GeoMapFilterOperator, ...unknown[]];

export interface GeoMapGeometry {
  type: GeoMapGeometryType;
  coordinates: unknown;
}

export interface GeoMapMetadata {
  title: string;
  subtitle?: string;
  locale: string;
  createdAt: string;
  topic?: string;
}

export interface GeoMapProjection {
  name: GeoMapProjectionName;
  parallels?: [number, number];
}

export interface GeoMapCamera {
  center: [number, number];
  zoom: number;
  bearing?: number;
  pitch?: number;
  bounds?: [number, number, number, number];
}

export interface GeoMapBasemap {
  provider: GeoMapBasemapProvider;
  scaleBand: GeoMapScaleBand;
  licenseCode: GeoMapLicenseCode;
  layerNames?: string[];
}

export interface GeoMapSourceEntry {
  type: GeoMapSourceType;
  dependencyPath: string;
  attribution?: string;
  minzoom?: number;
  maxzoom?: number;
  tileSize?: GeoMapTileSize;
  featureCount?: number;
}

export interface GeoMapLayerLayout {
  visibility?: GeoMapLayerVisibility;
  textField?: string;
  textSize?: number;
  iconImage?: string;
  symbolSpacing?: number;
}

export interface GeoMapLayerPaint {
  fillColor?: GeoMapColorOrRamp;
  fillOpacity?: number;
  lineColor?: GeoMapColorOrRamp;
  lineWidth?: number;
  lineDasharray?: number[];
  circleRadius?: number;
  circleColor?: GeoMapColorOrRamp;
  textColor?: GeoMapColor;
  textHaloColor?: GeoMapColor;
  textHaloWidth?: number;
  heatmapRadius?: number;
  rasterOpacity?: number;
  fillExtrusionHeight?: number;
}

export interface GeoMapLayer {
  id: string;
  type: GeoMapLayerType;
  source: string;
  sourceLayer?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: GeoMapFilter;
  layout?: GeoMapLayerLayout;
  paint: GeoMapLayerPaint;
}

export interface GeoMapAnnotation {
  id: string;
  kind: GeoMapAnnotationKind;
  geometry: GeoMapGeometry;
  text: string;
  anchor?: GeoMapAnnotationAnchor;
  offsetPx?: [number, number];
}

export interface GeoMapLegendEntry {
  label: string;
  swatch: GeoMapColor;
  pattern?: GeoMapLegendPattern;
  layerId?: string;
}

export interface GeoMapLegend {
  position: GeoMapLegendPosition;
  title?: string;
  entries: GeoMapLegendEntry[];
}

export interface GeoMapInteractions {
  pan?: boolean;
  zoom?: boolean;
  rotate?: boolean;
  featureClick?: GeoMapFeatureClickMode;
  popupFields?: string[];
  keyboardPanStepPx?: number;
  keyboardZoomStep?: number;
}

export interface GeoMapAttributionEntry {
  text: string;
  licenseCode: GeoMapLicenseCode;
  licenseUrl: string;
  sourceId?: string;
}

export interface GeoMapAttribution {
  entries: GeoMapAttributionEntry[];
}

export interface GeoMapDependency {
  path: string;
  sha256: string;
  mediaType: GeoMapDependencyMediaType;
  byteSize?: number;
}

/** §3.1: nine required members, four optional. */
export interface GeoMapProject {
  schema: typeof GEO_MAP_PROJECT_SCHEMA;
  version: typeof GEO_MAP_PROJECT_VERSION;
  metadata: GeoMapMetadata;
  projection: GeoMapProjection;
  camera: GeoMapCamera;
  basemap: GeoMapBasemap;
  sources: Record<string, GeoMapSourceEntry>;
  layers: GeoMapLayer[];
  annotations?: GeoMapAnnotation[];
  legend?: GeoMapLegend;
  interactions?: GeoMapInteractions;
  attribution: GeoMapAttribution;
  dependencies?: GeoMapDependency[];
}

/**
 * §6 F1-F8 plus the parse-plane codes. Every controlled failure in this editor
 * carries one of these; no bare strings and no silent defaults.
 */
export const GEO_MAP_ERROR_CODES = [
  "geo-map-empty-source",
  "geo-map-not-utf8",
  "geo-map-html-source",
  "geo-map-source-too-large",
  "geo-map-invalid-json",
  "geo-map-schema-violation",
  "geo-map-hollow",
  "geo-map-dangling-layer-source",
  "geo-map-dependency-closure-incomplete",
  "geo-map-license-contagion",
  "geo-map-color-collapse",
  "geo-map-twin",
  "geo-map-projection-parameters-missing",
  "geo-map-label-contrast",
  "geo-map-attribution-missing",
  "geo-map-remote-fetch-forbidden",
  "geo-map-commit-rejected",
  "geo-map-commit-conflict",
  "geo-map-render-unsupported",
] as const;

export type GeoMapErrorCode = (typeof GEO_MAP_ERROR_CODES)[number];

export interface GeoMapValidationError {
  code: GeoMapErrorCode;
  path: string;
  message: string;
}

export type GeoMapValidationResult =
  | { ok: true; project: GeoMapProject }
  | { ok: false; errors: GeoMapValidationError[] };

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;
const NATURAL_EARTH_LAYER_PATTERN = /^ne_(10m|50m|110m)_[a-z0-9_]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const HTTPS_URL_PATTERN = /^https:\/\/[^\s"'<>\\]{3,}$/;
/**
 * §1.2/§5.1: the sandbox runs under `connect-src 'none'`, so a dependency path
 * is always a same-origin relative route resolved by the platform, never a URL.
 */
const DEPENDENCY_PATH_PATTERN = /^[A-Za-z0-9._~][A-Za-z0-9._~/-]*$/;
const REMOTE_PATH_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const textEncoder = new TextEncoder();

function error(
  code: GeoMapErrorCode,
  path: string,
  message: string,
): GeoMapValidationError {
  return { code, path, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface ObjectShape {
  allowed: readonly string[];
  required: readonly string[];
}

function objectAt(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
  shape: ObjectShape,
): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    errors.push(
      error("geo-map-schema-violation", path, `${path} must be a JSON object`),
    );
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!shape.allowed.includes(key)) {
      errors.push(
        error(
          "geo-map-schema-violation",
          `${path}.${key}`,
          `${path} does not allow additional property ${key}`,
        ),
      );
    }
  }
  for (const key of shape.required) {
    if (value[key] === undefined) {
      errors.push(
        error(
          "geo-map-schema-violation",
          `${path}.${key}`,
          `${path} is missing required property ${key}`,
        ),
      );
    }
  }
  return value;
}

interface NumberBounds {
  min?: number;
  max?: number;
  exclusiveMax?: number;
  integer?: boolean;
}

function checkNumber(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
  bounds: NumberBounds = {},
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(
      error("geo-map-schema-violation", path, `${path} must be a finite number`),
    );
    return null;
  }
  if (bounds.integer && !Number.isInteger(value)) {
    errors.push(
      error("geo-map-schema-violation", path, `${path} must be an integer`),
    );
    return null;
  }
  if (bounds.min !== undefined && value < bounds.min) {
    errors.push(
      error(
        "geo-map-schema-violation",
        path,
        `${path} must be >= ${bounds.min}, got ${value}`,
      ),
    );
    return null;
  }
  if (bounds.max !== undefined && value > bounds.max) {
    errors.push(
      error(
        "geo-map-schema-violation",
        path,
        `${path} must be <= ${bounds.max}, got ${value}`,
      ),
    );
    return null;
  }
  if (bounds.exclusiveMax !== undefined && value >= bounds.exclusiveMax) {
    errors.push(
      error(
        "geo-map-schema-violation",
        path,
        `${path} must be < ${bounds.exclusiveMax}, got ${value}`,
      ),
    );
    return null;
  }
  return value;
}

interface StringBounds {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  code?: GeoMapErrorCode;
}

function checkString(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
  bounds: StringBounds = {},
): string | null {
  const code = bounds.code ?? "geo-map-schema-violation";
  if (typeof value !== "string") {
    errors.push(error(code, path, `${path} must be a string`));
    return null;
  }
  if (bounds.minLength !== undefined && value.length < bounds.minLength) {
    errors.push(
      error(
        code,
        path,
        `${path} must be at least ${bounds.minLength} characters, got ${value.length}`,
      ),
    );
    return null;
  }
  if (bounds.maxLength !== undefined && value.length > bounds.maxLength) {
    errors.push(
      error(
        code,
        path,
        `${path} must be at most ${bounds.maxLength} characters, got ${value.length}`,
      ),
    );
    return null;
  }
  if (bounds.pattern && !bounds.pattern.test(value)) {
    errors.push(
      error(code, path, `${path} does not match ${String(bounds.pattern)}`),
    );
    return null;
  }
  return value;
}

function checkEnum<T extends string | number>(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
  allowed: readonly T[],
  code: GeoMapErrorCode = "geo-map-schema-violation",
): T | null {
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    !allowed.includes(value as T)
  ) {
    errors.push(
      error(
        code,
        path,
        `${path} must be one of ${allowed.join(" / ")}, got ${JSON.stringify(value)}`,
      ),
    );
    return null;
  }
  return value as T;
}

function checkBoolean(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
): boolean | null {
  if (typeof value !== "boolean") {
    errors.push(
      error("geo-map-schema-violation", path, `${path} must be a boolean`),
    );
    return null;
  }
  return value;
}

interface ArrayBounds {
  minItems?: number;
  maxItems?: number;
  code?: GeoMapErrorCode;
}

function checkArray(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
  bounds: ArrayBounds = {},
): unknown[] | null {
  const code = bounds.code ?? "geo-map-schema-violation";
  if (!Array.isArray(value)) {
    errors.push(error(code, path, `${path} must be an array`));
    return null;
  }
  if (bounds.minItems !== undefined && value.length < bounds.minItems) {
    errors.push(
      error(
        code,
        path,
        `${path} must hold at least ${bounds.minItems} items, got ${value.length}`,
      ),
    );
    return null;
  }
  if (bounds.maxItems !== undefined && value.length > bounds.maxItems) {
    errors.push(
      error(
        code,
        path,
        `${path} must hold at most ${bounds.maxItems} items, got ${value.length}`,
      ),
    );
    return null;
  }
  return value;
}

function checkColor(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
): GeoMapColor | null {
  return checkString(errors, value, path, { pattern: COLOR_PATTERN });
}

function checkColorOrRamp(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
): GeoMapColorOrRamp | null {
  if (typeof value === "string") return checkColor(errors, value, path);
  const ramp = objectAt(errors, value, path, {
    allowed: ["property", "stops"],
    required: ["property", "stops"],
  });
  if (!ramp) return null;
  const property = checkString(errors, ramp.property, `${path}.property`, {
    maxLength: 80,
  });
  const stops = checkArray(errors, ramp.stops, `${path}.stops`, {
    minItems: GEO_MAP_CONSTANTS.rampStopsMin,
    maxItems: GEO_MAP_CONSTANTS.rampStopsMax,
  });
  if (property === null || !stops) return null;
  const normalized: Array<[number, GeoMapColor]> = [];
  stops.forEach((stop, index) => {
    const pair = checkArray(errors, stop, `${path}.stops[${index}]`, {
      minItems: 2,
      maxItems: 2,
    });
    if (!pair) return;
    const at = checkNumber(errors, pair[0], `${path}.stops[${index}][0]`);
    const color = checkColor(errors, pair[1], `${path}.stops[${index}][1]`);
    if (at !== null && color !== null) normalized.push([at, color]);
  });
  return normalized.length === stops.length
    ? { property, stops: normalized }
    : null;
}

function checkFilter(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
): GeoMapFilter | null {
  const filter = checkArray(errors, value, path, { minItems: 2, maxItems: 16 });
  if (!filter) return null;
  const operator = checkEnum(
    errors,
    filter[0],
    `${path}[0]`,
    GEO_MAP_FILTER_OPERATORS,
  );
  if (operator === null) return null;
  return [operator, ...filter.slice(1)];
}

function checkGeometry(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
): GeoMapGeometry | null {
  const geometry = objectAt(errors, value, path, {
    allowed: ["type", "coordinates"],
    required: ["type", "coordinates"],
  });
  if (!geometry) return null;
  const type = checkEnum(
    errors,
    geometry.type,
    `${path}.type`,
    GEO_MAP_GEOMETRY_TYPES,
  );
  if (type === null || geometry.coordinates === undefined) return null;
  return { type, coordinates: geometry.coordinates };
}

function checkDependencyPath(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
): string | null {
  const raw = checkString(errors, value, path, {
    minLength: 1,
    maxLength: 512,
  });
  if (raw === null) return null;
  if (REMOTE_PATH_PATTERN.test(raw)) {
    errors.push(
      error(
        "geo-map-remote-fetch-forbidden",
        path,
        `${path} must be a same-origin platform route; the editor sandbox runs under connect-src 'none' and never fetches ${raw}`,
      ),
    );
    return null;
  }
  if (!DEPENDENCY_PATH_PATTERN.test(raw) || raw.includes("..")) {
    errors.push(
      error(
        "geo-map-remote-fetch-forbidden",
        path,
        `${path} must be a normalized relative dependency path without traversal`,
      ),
    );
    return null;
  }
  return raw;
}

function validateMetadata(
  errors: GeoMapValidationError[],
  value: unknown,
): GeoMapMetadata | null {
  const raw = objectAt(errors, value, "metadata", {
    allowed: ["title", "subtitle", "locale", "createdAt", "topic"],
    required: ["title", "locale", "createdAt"],
  });
  if (!raw) return null;
  const title = checkString(errors, raw.title, "metadata.title", {
    minLength: 8,
    maxLength: 300,
  });
  const locale = checkString(errors, raw.locale, "metadata.locale", {
    pattern: LOCALE_PATTERN,
  });
  const createdAt = checkString(errors, raw.createdAt, "metadata.createdAt", {
    pattern: DATE_TIME_PATTERN,
  });
  const subtitle =
    raw.subtitle === undefined
      ? undefined
      : checkString(errors, raw.subtitle, "metadata.subtitle", {
          maxLength: 300,
        });
  const topic =
    raw.topic === undefined
      ? undefined
      : checkString(errors, raw.topic, "metadata.topic", { maxLength: 120 });
  if (title === null || locale === null || createdAt === null) return null;
  if (subtitle === null || topic === null) return null;
  return {
    title,
    ...(subtitle !== undefined ? { subtitle } : {}),
    locale,
    createdAt,
    ...(topic !== undefined ? { topic } : {}),
  };
}

function validateProjection(
  errors: GeoMapValidationError[],
  value: unknown,
): GeoMapProjection | null {
  const raw = objectAt(errors, value, "projection", {
    allowed: ["name", "parallels"],
    required: ["name"],
  });
  if (!raw) return null;
  const name = checkEnum(errors, raw.name, "projection.name", GEO_MAP_PROJECTIONS);
  let parallels: [number, number] | undefined;
  if (raw.parallels !== undefined) {
    const pair = checkArray(errors, raw.parallels, "projection.parallels", {
      minItems: 2,
      maxItems: 2,
    });
    if (pair) {
      const first = checkNumber(errors, pair[0], "projection.parallels[0]", {
        min: -90,
        max: 90,
      });
      const second = checkNumber(errors, pair[1], "projection.parallels[1]", {
        min: -90,
        max: 90,
      });
      if (first !== null && second !== null) parallels = [first, second];
    }
  }
  // §3.2 allOf/if-then and §6 F7: albers without parallels is a hard failure,
  // the renderer MUST NOT silently fall back to mercator.
  if (name === "albers" && parallels === undefined) {
    errors.push(
      error(
        "geo-map-projection-parameters-missing",
        "projection.parallels",
        "projection.name=albers requires parallels; the renderer must not silently fall back to mercator",
      ),
    );
    return null;
  }
  if (name === null) return null;
  return { name, ...(parallels ? { parallels } : {}) };
}

function validateCamera(
  errors: GeoMapValidationError[],
  value: unknown,
  projection: GeoMapProjection | null,
): GeoMapCamera | null {
  const raw = objectAt(errors, value, "camera", {
    allowed: ["center", "zoom", "bearing", "pitch", "bounds"],
    required: ["center", "zoom"],
  });
  if (!raw) return null;
  // §4 C6: mercator/albers/globe clamp at ±85.0511; equirectangular relaxes to ±90.
  const latitudeLimit =
    projection?.name === "equirectangular"
      ? GEO_MAP_CONSTANTS.geographicLatitudeLimit
      : GEO_MAP_CONSTANTS.mercatorLatitudeLimit;
  let center: [number, number] | null = null;
  const centerPair = checkArray(errors, raw.center, "camera.center", {
    minItems: 2,
    maxItems: 2,
  });
  if (centerPair) {
    const longitude = checkNumber(errors, centerPair[0], "camera.center[0]", {
      min: GEO_MAP_CONSTANTS.longitudeMin,
      max: GEO_MAP_CONSTANTS.longitudeMax,
    });
    const latitude = checkNumber(errors, centerPair[1], "camera.center[1]", {
      min: -latitudeLimit,
      max: latitudeLimit,
    });
    if (longitude !== null && latitude !== null) center = [longitude, latitude];
  }
  const zoom = checkNumber(errors, raw.zoom, "camera.zoom", {
    min: GEO_MAP_CONSTANTS.zoomMin,
    max: GEO_MAP_CONSTANTS.zoomMax,
  });
  const bearing =
    raw.bearing === undefined
      ? undefined
      : checkNumber(errors, raw.bearing, "camera.bearing", {
          min: GEO_MAP_CONSTANTS.bearingMin,
          exclusiveMax: GEO_MAP_CONSTANTS.bearingExclusiveMax,
        });
  const pitch =
    raw.pitch === undefined
      ? undefined
      : checkNumber(errors, raw.pitch, "camera.pitch", {
          min: GEO_MAP_CONSTANTS.pitchMin,
          max: GEO_MAP_CONSTANTS.pitchMax,
        });
  let bounds: [number, number, number, number] | undefined;
  if (raw.bounds !== undefined) {
    const quad = checkArray(errors, raw.bounds, "camera.bounds", {
      minItems: 4,
      maxItems: 4,
    });
    if (quad) {
      const numbers = quad.map((entry, index) =>
        checkNumber(errors, entry, `camera.bounds[${index}]`),
      );
      if (numbers.every((entry) => entry !== null)) {
        bounds = numbers as [number, number, number, number];
      }
    }
  }
  if (center === null || zoom === null) return null;
  if (bearing === null || pitch === null) return null;
  return {
    center,
    zoom,
    ...(bearing !== undefined ? { bearing } : {}),
    ...(pitch !== undefined ? { pitch } : {}),
    ...(bounds ? { bounds } : {}),
  };
}

function validateBasemap(
  errors: GeoMapValidationError[],
  value: unknown,
): GeoMapBasemap | null {
  const raw = objectAt(errors, value, "basemap", {
    allowed: ["provider", "scaleBand", "licenseCode", "layerNames"],
    required: ["provider", "scaleBand", "licenseCode"],
  });
  if (!raw) return null;
  const provider = checkEnum(
    errors,
    raw.provider,
    "basemap.provider",
    GEO_MAP_BASEMAP_PROVIDERS,
  );
  const scaleBand = checkEnum(
    errors,
    raw.scaleBand,
    "basemap.scaleBand",
    GEO_MAP_SCALE_BANDS,
  );
  // §6 F4 + ADR-10: the enum is the schema-level guard against SA contagion.
  const licenseCode = checkEnum(
    errors,
    raw.licenseCode,
    "basemap.licenseCode",
    GEO_MAP_LICENSE_CODES,
    "geo-map-license-contagion",
  );
  let layerNames: string[] | undefined;
  if (raw.layerNames !== undefined) {
    const list = checkArray(errors, raw.layerNames, "basemap.layerNames", {
      minItems: 1,
      maxItems: 24,
    });
    if (list) {
      const names = list.map((entry, index) =>
        checkString(errors, entry, `basemap.layerNames[${index}]`, {
          pattern: NATURAL_EARTH_LAYER_PATTERN,
        }),
      );
      if (names.every((entry) => entry !== null)) layerNames = names as string[];
    }
  }
  if (provider === null || scaleBand === null || licenseCode === null) {
    return null;
  }
  return {
    provider,
    scaleBand,
    licenseCode,
    ...(layerNames ? { layerNames } : {}),
  };
}

function validateSources(
  errors: GeoMapValidationError[],
  value: unknown,
): Record<string, GeoMapSourceEntry> | null {
  if (!isPlainObject(value)) {
    errors.push(
      error("geo-map-schema-violation", "sources", "sources must be an object"),
    );
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length < GEO_MAP_CONSTANTS.sourcesMin) {
    errors.push(
      error(
        "geo-map-schema-violation",
        "sources",
        `sources must declare at least ${GEO_MAP_CONSTANTS.sourcesMin} key`,
      ),
    );
  }
  if (keys.length > GEO_MAP_CONSTANTS.sourcesMax) {
    errors.push(
      error(
        "geo-map-schema-violation",
        "sources",
        `sources must declare at most ${GEO_MAP_CONSTANTS.sourcesMax} keys, got ${keys.length}`,
      ),
    );
  }
  const resolved: Record<string, GeoMapSourceEntry> = {};
  for (const key of keys) {
    const path = `sources.${key}`;
    if (!ID_PATTERN.test(key)) {
      errors.push(
        error(
          "geo-map-schema-violation",
          path,
          `source key ${key} does not match ${String(ID_PATTERN)}`,
        ),
      );
      continue;
    }
    const raw = objectAt(errors, value[key], path, {
      allowed: [
        "type",
        "dependencyPath",
        "attribution",
        "minzoom",
        "maxzoom",
        "tileSize",
        "featureCount",
      ],
      required: ["type", "dependencyPath"],
    });
    if (!raw) continue;
    const type = checkEnum(errors, raw.type, `${path}.type`, GEO_MAP_SOURCE_TYPES);
    const dependencyPath = checkDependencyPath(
      errors,
      raw.dependencyPath,
      `${path}.dependencyPath`,
    );
    const attribution =
      raw.attribution === undefined
        ? undefined
        : checkString(errors, raw.attribution, `${path}.attribution`, {
            minLength: 1,
            maxLength: 500,
          });
    const minzoom =
      raw.minzoom === undefined
        ? undefined
        : checkNumber(errors, raw.minzoom, `${path}.minzoom`, {
            min: GEO_MAP_CONSTANTS.zoomMin,
            max: GEO_MAP_CONSTANTS.zoomMax,
          });
    const maxzoom =
      raw.maxzoom === undefined
        ? undefined
        : checkNumber(errors, raw.maxzoom, `${path}.maxzoom`, {
            min: GEO_MAP_CONSTANTS.zoomMin,
            max: GEO_MAP_CONSTANTS.zoomMax,
          });
    const tileSize =
      raw.tileSize === undefined
        ? undefined
        : checkEnum(errors, raw.tileSize, `${path}.tileSize`, GEO_MAP_TILE_SIZES);
    const featureCount =
      raw.featureCount === undefined
        ? undefined
        : checkNumber(errors, raw.featureCount, `${path}.featureCount`, {
            min: 1,
            max: GEO_MAP_CONSTANTS.featureCountMax,
            integer: true,
          });
    if (
      type === null ||
      dependencyPath === null ||
      attribution === null ||
      minzoom === null ||
      maxzoom === null ||
      tileSize === null ||
      featureCount === null
    ) {
      continue;
    }
    resolved[key] = {
      type,
      dependencyPath,
      ...(attribution !== undefined ? { attribution } : {}),
      ...(minzoom !== undefined ? { minzoom } : {}),
      ...(maxzoom !== undefined ? { maxzoom } : {}),
      ...(tileSize !== undefined ? { tileSize } : {}),
      ...(featureCount !== undefined ? { featureCount } : {}),
    };
  }
  return Object.keys(resolved).length === keys.length ? resolved : null;
}

function validateLayerLayout(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
): GeoMapLayerLayout | null {
  const raw = objectAt(errors, value, path, {
    allowed: [
      "visibility",
      "textField",
      "textSize",
      "iconImage",
      "symbolSpacing",
    ],
    required: [],
  });
  if (!raw) return null;
  const visibility =
    raw.visibility === undefined
      ? undefined
      : checkEnum(
          errors,
          raw.visibility,
          `${path}.visibility`,
          GEO_MAP_LAYER_VISIBILITIES,
        );
  const textField =
    raw.textField === undefined
      ? undefined
      : checkString(errors, raw.textField, `${path}.textField`, {
          maxLength: 200,
        });
  const textSize =
    raw.textSize === undefined
      ? undefined
      : checkNumber(errors, raw.textSize, `${path}.textSize`, {
          min: GEO_MAP_CONSTANTS.textSizeMin,
          max: GEO_MAP_CONSTANTS.textSizeMax,
        });
  const iconImage =
    raw.iconImage === undefined
      ? undefined
      : checkString(errors, raw.iconImage, `${path}.iconImage`, {
          maxLength: 120,
        });
  const symbolSpacing =
    raw.symbolSpacing === undefined
      ? undefined
      : checkNumber(errors, raw.symbolSpacing, `${path}.symbolSpacing`, {
          min: 32,
          max: 512,
        });
  if (
    visibility === null ||
    textField === null ||
    textSize === null ||
    iconImage === null ||
    symbolSpacing === null
  ) {
    return null;
  }
  return {
    ...(visibility !== undefined ? { visibility } : {}),
    ...(textField !== undefined ? { textField } : {}),
    ...(textSize !== undefined ? { textSize } : {}),
    ...(iconImage !== undefined ? { iconImage } : {}),
    ...(symbolSpacing !== undefined ? { symbolSpacing } : {}),
  };
}

function validateLayerPaint(
  errors: GeoMapValidationError[],
  value: unknown,
  path: string,
): GeoMapLayerPaint | null {
  const raw = objectAt(errors, value, path, {
    allowed: [
      "fillColor",
      "fillOpacity",
      "lineColor",
      "lineWidth",
      "lineDasharray",
      "circleRadius",
      "circleColor",
      "textColor",
      "textHaloColor",
      "textHaloWidth",
      "heatmapRadius",
      "rasterOpacity",
      "fillExtrusionHeight",
    ],
    required: [],
  });
  if (!raw) return null;
  if (Object.keys(raw).length < 1) {
    errors.push(
      error(
        "geo-map-schema-violation",
        path,
        `${path} must declare at least one paint property`,
      ),
    );
    return null;
  }
  const paint: GeoMapLayerPaint = {};
  let failed = false;
  const takeColorOrRamp = (
    key: "fillColor" | "lineColor" | "circleColor",
  ): void => {
    if (raw[key] === undefined) return;
    const resolved = checkColorOrRamp(errors, raw[key], `${path}.${key}`);
    if (resolved === null) failed = true;
    else paint[key] = resolved;
  };
  const takeColor = (key: "textColor" | "textHaloColor"): void => {
    if (raw[key] === undefined) return;
    const resolved = checkColor(errors, raw[key], `${path}.${key}`);
    if (resolved === null) failed = true;
    else paint[key] = resolved;
  };
  const takeNumber = (
    key:
      | "fillOpacity"
      | "lineWidth"
      | "circleRadius"
      | "textHaloWidth"
      | "heatmapRadius"
      | "rasterOpacity"
      | "fillExtrusionHeight",
    bounds: NumberBounds,
  ): void => {
    if (raw[key] === undefined) return;
    const resolved = checkNumber(errors, raw[key], `${path}.${key}`, bounds);
    if (resolved === null) failed = true;
    else paint[key] = resolved;
  };
  takeColorOrRamp("fillColor");
  takeNumber("fillOpacity", { min: 0, max: 1 });
  takeColorOrRamp("lineColor");
  takeNumber("lineWidth", {
    min: GEO_MAP_CONSTANTS.lineWidthMin,
    max: GEO_MAP_CONSTANTS.lineWidthMax,
  });
  if (raw.lineDasharray !== undefined) {
    const dashes = checkArray(errors, raw.lineDasharray, `${path}.lineDasharray`, {
      minItems: 2,
      maxItems: 8,
    });
    if (!dashes) failed = true;
    else {
      const numbers = dashes.map((entry, index) =>
        checkNumber(errors, entry, `${path}.lineDasharray[${index}]`, {
          min: 0,
          max: 32,
        }),
      );
      if (numbers.some((entry) => entry === null)) failed = true;
      else paint.lineDasharray = numbers as number[];
    }
  }
  takeNumber("circleRadius", {
    min: GEO_MAP_CONSTANTS.circleRadiusMin,
    max: GEO_MAP_CONSTANTS.circleRadiusMax,
  });
  takeColorOrRamp("circleColor");
  takeColor("textColor");
  takeColor("textHaloColor");
  takeNumber("textHaloWidth", {
    min: 0,
    max: GEO_MAP_CONSTANTS.textHaloWidthMax,
  });
  takeNumber("heatmapRadius", { min: 4, max: 128 });
  takeNumber("rasterOpacity", { min: 0, max: 1 });
  takeNumber("fillExtrusionHeight", { min: 0, max: 10_000 });
  return failed ? null : paint;
}

function validateLayers(
  errors: GeoMapValidationError[],
  value: unknown,
  sources: Record<string, GeoMapSourceEntry> | null,
): GeoMapLayer[] | null {
  const list = checkArray(errors, value, "layers", {
    minItems: GEO_MAP_CONSTANTS.layersMin,
    maxItems: GEO_MAP_CONSTANTS.layersMax,
  });
  if (!list) return null;
  const layers: GeoMapLayer[] = [];
  const seen = new Set<string>();
  list.forEach((entry, index) => {
    const path = `layers[${index}]`;
    const raw = objectAt(errors, entry, path, {
      allowed: [
        "id",
        "type",
        "source",
        "sourceLayer",
        "minzoom",
        "maxzoom",
        "filter",
        "layout",
        "paint",
      ],
      required: ["id", "type", "source", "paint"],
    });
    if (!raw) return;
    const id = checkString(errors, raw.id, `${path}.id`, {
      pattern: ID_PATTERN,
    });
    if (id !== null && seen.has(id)) {
      errors.push(
        error(
          "geo-map-schema-violation",
          `${path}.id`,
          `layer id ${id} is declared twice`,
        ),
      );
      return;
    }
    if (id !== null) seen.add(id);
    const type = checkEnum(errors, raw.type, `${path}.type`, GEO_MAP_LAYER_TYPES);
    const source = checkString(errors, raw.source, `${path}.source`, {
      pattern: ID_PATTERN,
    });
    // §5.1 + §6 F2: a dangling source reference is invalid, never a skipped layer.
    if (source !== null && sources && !(source in sources)) {
      errors.push(
        error(
          "geo-map-dangling-layer-source",
          `${path}.source`,
          `layer ${id ?? index} references missing source key ${source}`,
        ),
      );
    }
    const sourceLayer =
      raw.sourceLayer === undefined
        ? undefined
        : checkString(errors, raw.sourceLayer, `${path}.sourceLayer`, {
            maxLength: 120,
          });
    const minzoom =
      raw.minzoom === undefined
        ? undefined
        : checkNumber(errors, raw.minzoom, `${path}.minzoom`, {
            min: GEO_MAP_CONSTANTS.zoomMin,
            max: GEO_MAP_CONSTANTS.zoomMax,
          });
    const maxzoom =
      raw.maxzoom === undefined
        ? undefined
        : checkNumber(errors, raw.maxzoom, `${path}.maxzoom`, {
            min: GEO_MAP_CONSTANTS.zoomMin,
            max: GEO_MAP_CONSTANTS.zoomMax,
          });
    const filter =
      raw.filter === undefined
        ? undefined
        : checkFilter(errors, raw.filter, `${path}.filter`);
    const layout =
      raw.layout === undefined
        ? undefined
        : validateLayerLayout(errors, raw.layout, `${path}.layout`);
    const paint = validateLayerPaint(errors, raw.paint, `${path}.paint`);
    // §3.2 allOf: symbol layers must carry layout.textField.
    if (type === "symbol" && layout !== null && !layout?.textField) {
      errors.push(
        error(
          "geo-map-schema-violation",
          `${path}.layout.textField`,
          "symbol layers require layout.textField",
        ),
      );
      return;
    }
    if (
      id === null ||
      type === null ||
      source === null ||
      paint === null ||
      sourceLayer === null ||
      minzoom === null ||
      maxzoom === null ||
      filter === null ||
      layout === null
    ) {
      return;
    }
    layers.push({
      id,
      type,
      source,
      ...(sourceLayer !== undefined ? { sourceLayer } : {}),
      ...(minzoom !== undefined ? { minzoom } : {}),
      ...(maxzoom !== undefined ? { maxzoom } : {}),
      ...(filter !== undefined ? { filter } : {}),
      ...(layout !== undefined ? { layout } : {}),
      paint,
    });
  });
  return layers.length === list.length ? layers : null;
}

function validateAnnotations(
  errors: GeoMapValidationError[],
  value: unknown,
): GeoMapAnnotation[] | null {
  const list = checkArray(errors, value, "annotations", {
    maxItems: GEO_MAP_CONSTANTS.annotationsMax,
  });
  if (!list) return null;
  const annotations: GeoMapAnnotation[] = [];
  list.forEach((entry, index) => {
    const path = `annotations[${index}]`;
    const raw = objectAt(errors, entry, path, {
      allowed: ["id", "kind", "geometry", "text", "anchor", "offsetPx"],
      required: ["id", "kind", "geometry", "text"],
    });
    if (!raw) return;
    const id = checkString(errors, raw.id, `${path}.id`, { pattern: ID_PATTERN });
    const kind = checkEnum(
      errors,
      raw.kind,
      `${path}.kind`,
      GEO_MAP_ANNOTATION_KINDS,
    );
    const geometry = checkGeometry(errors, raw.geometry, `${path}.geometry`);
    const text = checkString(errors, raw.text, `${path}.text`, {
      minLength: 1,
      maxLength: 400,
    });
    const anchor =
      raw.anchor === undefined
        ? undefined
        : checkEnum(
            errors,
            raw.anchor,
            `${path}.anchor`,
            GEO_MAP_ANNOTATION_ANCHORS,
          );
    let offsetPx: [number, number] | undefined;
    if (raw.offsetPx !== undefined) {
      const pair = checkArray(errors, raw.offsetPx, `${path}.offsetPx`, {
        minItems: 2,
        maxItems: 2,
      });
      if (pair) {
        const x = checkNumber(errors, pair[0], `${path}.offsetPx[0]`, {
          min: -200,
          max: 200,
        });
        const y = checkNumber(errors, pair[1], `${path}.offsetPx[1]`, {
          min: -200,
          max: 200,
        });
        if (x !== null && y !== null) offsetPx = [x, y];
      }
    }
    if (
      id === null ||
      kind === null ||
      geometry === null ||
      text === null ||
      anchor === null
    ) {
      return;
    }
    annotations.push({
      id,
      kind,
      geometry,
      text,
      ...(anchor !== undefined ? { anchor } : {}),
      ...(offsetPx ? { offsetPx } : {}),
    });
  });
  return annotations.length === list.length ? annotations : null;
}

function validateLegend(
  errors: GeoMapValidationError[],
  value: unknown,
): GeoMapLegend | null {
  const raw = objectAt(errors, value, "legend", {
    allowed: ["position", "title", "entries"],
    required: ["position", "entries"],
  });
  if (!raw) return null;
  const position = checkEnum(
    errors,
    raw.position,
    "legend.position",
    GEO_MAP_LEGEND_POSITIONS,
  );
  const title =
    raw.title === undefined
      ? undefined
      : checkString(errors, raw.title, "legend.title", { maxLength: 120 });
  const list = checkArray(errors, raw.entries, "legend.entries", {
    minItems: 1,
    maxItems: GEO_MAP_CONSTANTS.legendEntriesMax,
  });
  if (position === null || title === null || !list) return null;
  const entries: GeoMapLegendEntry[] = [];
  list.forEach((entry, index) => {
    const path = `legend.entries[${index}]`;
    const rawEntry = objectAt(errors, entry, path, {
      allowed: ["label", "swatch", "pattern", "layerId"],
      required: ["label", "swatch"],
    });
    if (!rawEntry) return;
    const label = checkString(errors, rawEntry.label, `${path}.label`, {
      minLength: 1,
      maxLength: 80,
    });
    const swatch = checkColor(errors, rawEntry.swatch, `${path}.swatch`);
    const pattern =
      rawEntry.pattern === undefined
        ? undefined
        : checkEnum(
            errors,
            rawEntry.pattern,
            `${path}.pattern`,
            GEO_MAP_LEGEND_PATTERNS,
          );
    const layerId =
      rawEntry.layerId === undefined
        ? undefined
        : checkString(errors, rawEntry.layerId, `${path}.layerId`, {
            pattern: ID_PATTERN,
          });
    if (
      label === null ||
      swatch === null ||
      pattern === null ||
      layerId === null
    ) {
      return;
    }
    entries.push({
      label,
      swatch,
      ...(pattern !== undefined ? { pattern } : {}),
      ...(layerId !== undefined ? { layerId } : {}),
    });
  });
  if (entries.length !== list.length) return null;
  return {
    position,
    ...(title !== undefined ? { title } : {}),
    entries,
  };
}

function validateInteractions(
  errors: GeoMapValidationError[],
  value: unknown,
): GeoMapInteractions | null {
  const raw = objectAt(errors, value, "interactions", {
    allowed: [
      "pan",
      "zoom",
      "rotate",
      "featureClick",
      "popupFields",
      "keyboardPanStepPx",
      "keyboardZoomStep",
    ],
    required: [],
  });
  if (!raw) return null;
  const interactions: GeoMapInteractions = {};
  let failed = false;
  for (const key of ["pan", "zoom", "rotate"] as const) {
    if (raw[key] === undefined) continue;
    const resolved = checkBoolean(errors, raw[key], `interactions.${key}`);
    if (resolved === null) failed = true;
    else interactions[key] = resolved;
  }
  if (raw.featureClick !== undefined) {
    const resolved = checkEnum(
      errors,
      raw.featureClick,
      "interactions.featureClick",
      GEO_MAP_FEATURE_CLICK_MODES,
    );
    if (resolved === null) failed = true;
    else interactions.featureClick = resolved;
  }
  if (raw.popupFields !== undefined) {
    const list = checkArray(errors, raw.popupFields, "interactions.popupFields", {
      maxItems: 12,
    });
    if (!list) failed = true;
    else {
      const fields = list.map((entry, index) =>
        checkString(errors, entry, `interactions.popupFields[${index}]`, {
          maxLength: 80,
        }),
      );
      if (fields.some((entry) => entry === null)) failed = true;
      else interactions.popupFields = fields as string[];
    }
  }
  if (raw.keyboardPanStepPx !== undefined) {
    const resolved = checkNumber(
      errors,
      raw.keyboardPanStepPx,
      "interactions.keyboardPanStepPx",
      {
        min: GEO_MAP_CONSTANTS.keyboardPanStepMinPx,
        max: GEO_MAP_CONSTANTS.keyboardPanStepMaxPx,
      },
    );
    if (resolved === null) failed = true;
    else interactions.keyboardPanStepPx = resolved;
  }
  if (raw.keyboardZoomStep !== undefined) {
    const resolved = checkNumber(
      errors,
      raw.keyboardZoomStep,
      "interactions.keyboardZoomStep",
      {
        min: GEO_MAP_CONSTANTS.keyboardZoomStepMin,
        max: GEO_MAP_CONSTANTS.keyboardZoomStepMax,
      },
    );
    if (resolved === null) failed = true;
    else interactions.keyboardZoomStep = resolved;
  }
  return failed ? null : interactions;
}

function validateAttribution(
  errors: GeoMapValidationError[],
  value: unknown,
  basemap: GeoMapBasemap | null,
): GeoMapAttribution | null {
  const raw = objectAt(errors, value, "attribution", {
    allowed: ["entries"],
    required: ["entries"],
  });
  if (!raw) return null;
  const list = checkArray(errors, raw.entries, "attribution.entries", {
    minItems: 1,
    maxItems: 12,
    code: "geo-map-attribution-missing",
  });
  if (!list) return null;
  const entries: GeoMapAttributionEntry[] = [];
  list.forEach((entry, index) => {
    const path = `attribution.entries[${index}]`;
    const rawEntry = objectAt(errors, entry, path, {
      allowed: ["text", "licenseCode", "licenseUrl", "sourceId"],
      required: ["text", "licenseCode", "licenseUrl"],
    });
    if (!rawEntry) return;
    const text = checkString(errors, rawEntry.text, `${path}.text`, {
      minLength: 2,
      maxLength: 200,
    });
    const licenseCode = checkEnum(
      errors,
      rawEntry.licenseCode,
      `${path}.licenseCode`,
      GEO_MAP_LICENSE_CODES,
      "geo-map-license-contagion",
    );
    const licenseUrl = checkString(errors, rawEntry.licenseUrl, `${path}.licenseUrl`, {
      pattern: HTTPS_URL_PATTERN,
    });
    const sourceId =
      rawEntry.sourceId === undefined
        ? undefined
        : checkString(errors, rawEntry.sourceId, `${path}.sourceId`, {
            maxLength: 64,
          });
    if (
      text === null ||
      licenseCode === null ||
      licenseUrl === null ||
      sourceId === null
    ) {
      return;
    }
    entries.push({
      text,
      licenseCode,
      licenseUrl,
      ...(sourceId !== undefined ? { sourceId } : {}),
    });
  });
  if (entries.length !== list.length) return null;
  // §1.3: NASA imagery keeps its attribution obligation even under NASA-OPEN.
  if (
    basemap?.provider === "nasa-gibs" &&
    !entries.some((entry) => /nasa/i.test(entry.text))
  ) {
    errors.push(
      error(
        "geo-map-attribution-missing",
        "attribution.entries",
        "basemap.provider=nasa-gibs requires at least one NASA attribution entry; NASA-OPEN does not waive attribution",
      ),
    );
    return null;
  }
  return { entries };
}

function validateDependencies(
  errors: GeoMapValidationError[],
  value: unknown,
): GeoMapDependency[] | null {
  const list = checkArray(errors, value, "dependencies", {
    minItems: 1,
    maxItems: GEO_MAP_CONSTANTS.dependencyCountMax,
  });
  if (!list) return null;
  const dependencies: GeoMapDependency[] = [];
  list.forEach((entry, index) => {
    const path = `dependencies[${index}]`;
    const raw = objectAt(errors, entry, path, {
      allowed: ["path", "sha256", "mediaType", "byteSize"],
      required: ["path", "sha256", "mediaType"],
    });
    if (!raw) return;
    const dependencyPath = checkDependencyPath(errors, raw.path, `${path}.path`);
    const sha256 = checkString(errors, raw.sha256, `${path}.sha256`, {
      pattern: SHA256_PATTERN,
    });
    const mediaType = checkEnum(
      errors,
      raw.mediaType,
      `${path}.mediaType`,
      GEO_MAP_DEPENDENCY_MEDIA_TYPES,
    );
    const byteSize =
      raw.byteSize === undefined
        ? undefined
        : checkNumber(errors, raw.byteSize, `${path}.byteSize`, {
            min: 1,
            max: GEO_MAP_CONSTANTS.dependencyByteMax,
            integer: true,
          });
    if (
      dependencyPath === null ||
      sha256 === null ||
      mediaType === null ||
      byteSize === null
    ) {
      return;
    }
    dependencies.push({
      path: dependencyPath,
      sha256,
      mediaType,
      ...(byteSize !== undefined ? { byteSize } : {}),
    });
  });
  return dependencies.length === list.length ? dependencies : null;
}

const ROOT_KEYS = [
  "schema",
  "version",
  "metadata",
  "projection",
  "camera",
  "basemap",
  "sources",
  "layers",
  "annotations",
  "legend",
  "interactions",
  "attribution",
  "dependencies",
] as const;

const ROOT_REQUIRED = [
  "schema",
  "version",
  "metadata",
  "projection",
  "camera",
  "basemap",
  "sources",
  "layers",
  "attribution",
] as const;

/**
 * §3.2 in full. Returns the canonical project on success so that callers get a
 * deterministic value regardless of the key order they handed in.
 */
export function validateGeoMapProject(
  project: unknown,
): GeoMapValidationResult {
  const errors: GeoMapValidationError[] = [];
  const raw = objectAt(errors, project, "$", {
    allowed: ROOT_KEYS,
    required: ROOT_REQUIRED,
  });
  if (!raw) return { ok: false, errors };
  if (raw.schema !== GEO_MAP_PROJECT_SCHEMA) {
    errors.push(
      error(
        "geo-map-schema-violation",
        "$.schema",
        `schema must be ${GEO_MAP_PROJECT_SCHEMA}, got ${JSON.stringify(raw.schema)}`,
      ),
    );
  }
  if (raw.version !== GEO_MAP_PROJECT_VERSION) {
    errors.push(
      error(
        "geo-map-schema-violation",
        "$.version",
        `version must be ${GEO_MAP_PROJECT_VERSION}, got ${JSON.stringify(raw.version)}`,
      ),
    );
  }
  const metadata = validateMetadata(errors, raw.metadata);
  const projection = validateProjection(errors, raw.projection);
  const camera = validateCamera(errors, raw.camera, projection);
  const basemap = validateBasemap(errors, raw.basemap);
  const sources = validateSources(errors, raw.sources);
  const layers = validateLayers(errors, raw.layers, sources);
  const annotations =
    raw.annotations === undefined
      ? undefined
      : validateAnnotations(errors, raw.annotations);
  const legend =
    raw.legend === undefined ? undefined : validateLegend(errors, raw.legend);
  const interactions =
    raw.interactions === undefined
      ? undefined
      : validateInteractions(errors, raw.interactions);
  const attribution = validateAttribution(errors, raw.attribution, basemap);
  const dependencies =
    raw.dependencies === undefined
      ? undefined
      : validateDependencies(errors, raw.dependencies);
  if (errors.length > 0) return { ok: false, errors };
  if (
    !metadata ||
    !projection ||
    !camera ||
    !basemap ||
    !sources ||
    !layers ||
    !attribution ||
    annotations === null ||
    legend === null ||
    interactions === null ||
    dependencies === null
  ) {
    return {
      ok: false,
      errors: [
        error(
          "geo-map-schema-violation",
          "$",
          "geo-map project failed structural validation",
        ),
      ],
    };
  }
  return {
    ok: true,
    project: canonicalGeoMapProject({
      schema: GEO_MAP_PROJECT_SCHEMA,
      version: GEO_MAP_PROJECT_VERSION,
      metadata,
      projection,
      camera,
      basemap,
      sources,
      layers,
      ...(annotations !== undefined ? { annotations } : {}),
      ...(legend !== undefined ? { legend } : {}),
      ...(interactions !== undefined ? { interactions } : {}),
      attribution,
      ...(dependencies !== undefined ? { dependencies } : {}),
    }),
  };
}

function pick<T extends object>(
  source: T,
  keys: ReadonlyArray<keyof T>,
): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) target[key as string] = value;
  }
  return target;
}

/**
 * Canonical form: every object emits its §3.2 declaration order, `sources` keys
 * are sorted, arrays keep author order. Two structurally equal projects always
 * canonicalize to the same bytes.
 */
export function canonicalGeoMapProject(project: GeoMapProject): GeoMapProject {
  const sources: Record<string, GeoMapSourceEntry> = {};
  for (const key of Object.keys(project.sources).sort()) {
    sources[key] = pick(project.sources[key], [
      "type",
      "dependencyPath",
      "attribution",
      "minzoom",
      "maxzoom",
      "tileSize",
      "featureCount",
    ]) as unknown as GeoMapSourceEntry;
  }
  const canonical: Record<string, unknown> = {
    schema: GEO_MAP_PROJECT_SCHEMA,
    version: GEO_MAP_PROJECT_VERSION,
    metadata: pick(project.metadata, [
      "title",
      "subtitle",
      "locale",
      "createdAt",
      "topic",
    ]),
    projection: pick(project.projection, ["name", "parallels"]),
    camera: pick(project.camera, [
      "center",
      "zoom",
      "bearing",
      "pitch",
      "bounds",
    ]),
    basemap: pick(project.basemap, [
      "provider",
      "scaleBand",
      "licenseCode",
      "layerNames",
    ]),
    sources,
    layers: project.layers.map((layer) => {
      const canonicalLayer = pick(layer, [
        "id",
        "type",
        "source",
        "sourceLayer",
        "minzoom",
        "maxzoom",
        "filter",
        "layout",
        "paint",
      ]);
      if (layer.layout) {
        canonicalLayer.layout = pick(layer.layout, [
          "visibility",
          "textField",
          "textSize",
          "iconImage",
          "symbolSpacing",
        ]);
      }
      canonicalLayer.paint = pick(layer.paint, [
        "fillColor",
        "fillOpacity",
        "lineColor",
        "lineWidth",
        "lineDasharray",
        "circleRadius",
        "circleColor",
        "textColor",
        "textHaloColor",
        "textHaloWidth",
        "heatmapRadius",
        "rasterOpacity",
        "fillExtrusionHeight",
      ]);
      return canonicalLayer;
    }),
  };
  if (project.annotations !== undefined) {
    canonical.annotations = project.annotations.map((annotation) => {
      const canonicalAnnotation = pick(annotation, [
        "id",
        "kind",
        "geometry",
        "text",
        "anchor",
        "offsetPx",
      ]);
      canonicalAnnotation.geometry = pick(annotation.geometry, [
        "type",
        "coordinates",
      ]);
      return canonicalAnnotation;
    });
  }
  if (project.legend !== undefined) {
    canonical.legend = {
      ...pick(project.legend, ["position", "title"]),
      entries: project.legend.entries.map((entry) =>
        pick(entry, ["label", "swatch", "pattern", "layerId"]),
      ),
    };
  }
  if (project.interactions !== undefined) {
    canonical.interactions = pick(project.interactions, [
      "pan",
      "zoom",
      "rotate",
      "featureClick",
      "popupFields",
      "keyboardPanStepPx",
      "keyboardZoomStep",
    ]);
  }
  canonical.attribution = {
    entries: project.attribution.entries.map((entry) =>
      pick(entry, ["text", "licenseCode", "licenseUrl", "sourceId"]),
    ),
  };
  if (project.dependencies !== undefined) {
    canonical.dependencies = project.dependencies.map((dependency) =>
      pick(dependency, ["path", "sha256", "mediaType", "byteSize"]),
    );
  }
  return canonical as unknown as GeoMapProject;
}

/** Deterministic serialization: same structure in, same bytes out. */
export function serializeGeoMapProject(project: GeoMapProject): string {
  return JSON.stringify(canonicalGeoMapProject(project), null, 2);
}

export function geoMapProjectByteLength(project: GeoMapProject): number {
  return textEncoder.encode(serializeGeoMapProject(project)).byteLength;
}

export function geoMapPaintColors(project: GeoMapProject): string[] {
  const colors = new Set<string>();
  const take = (value: GeoMapColorOrRamp | undefined): void => {
    if (typeof value === "string") colors.add(value.toUpperCase());
    else if (value) {
      for (const [, color] of value.stops) colors.add(color.toUpperCase());
    }
  };
  for (const layer of project.layers) {
    take(layer.paint.fillColor);
    take(layer.paint.lineColor);
    take(layer.paint.circleColor);
    if (layer.paint.textColor) colors.add(layer.paint.textColor.toUpperCase());
    if (layer.paint.textHaloColor) {
      colors.add(layer.paint.textHaloColor.toUpperCase());
    }
  }
  return [...colors].sort();
}

export function geoMapDataLayers(project: GeoMapProject): GeoMapLayer[] {
  return project.layers.filter((layer) => layer.type !== "background");
}

export interface GeoMapCompletenessInput {
  project: GeoMapProject;
  /** Defaults to the serialized canonical byte length. */
  sourceBytes?: number;
  /** §7 A5 / §8.2: supplied by the capture step, not by the data plane. */
  frameColorCount?: number;
  dependencyClosureBytes?: number;
}

export interface GeoMapCompletenessResult {
  ok: boolean;
  failures: GeoMapValidationError[];
  metrics: {
    sourceBytes: number;
    layers: number;
    dataLayers: number;
    sourceKeys: number;
    featureCountTotal: number;
    legendEntries: number;
    annotations: number;
    attributionEntries: number;
    dependencies: number;
    paintColors: number;
    titleLength: number;
    legendPatterns: number;
  };
}

/**
 * §8.1 byte floor plus every §8.2 MUST. `frameColorCount` stays optional: the
 * ≥24 colour assertion belongs to the capture step (§7 A5), and when the caller
 * supplies it we judge it here instead of assuming it passed.
 */
export function evaluateGeoMapCompleteness(
  input: GeoMapCompletenessInput,
): GeoMapCompletenessResult {
  const { project } = input;
  const failures: GeoMapValidationError[] = [];
  const sourceBytes = input.sourceBytes ?? geoMapProjectByteLength(project);
  const dataLayers = geoMapDataLayers(project);
  const sourceKeys = Object.keys(project.sources);
  const featureCountTotal = sourceKeys.reduce(
    (total, key) => total + (project.sources[key].featureCount ?? 0),
    0,
  );
  const legendEntries = project.legend?.entries.length ?? 0;
  const annotations = project.annotations?.length ?? 0;
  const attributionEntries = project.attribution.entries.length;
  const dependencies = project.dependencies?.length ?? 0;
  const paintColors = geoMapPaintColors(project);
  const legendPatterns = new Set(
    (project.legend?.entries ?? [])
      .map((entry) => entry.pattern)
      .filter((pattern): pattern is GeoMapLegendPattern => Boolean(pattern)),
  );

  if (sourceBytes < GEO_MAP_CONSTANTS.sourceBytesMin) {
    failures.push(
      error(
        "geo-map-hollow",
        "$",
        `source is ${sourceBytes} B, below the ${GEO_MAP_CONSTANTS.sourceBytesMin} B reviewed floor (§8.1)`,
      ),
    );
  }
  if (sourceBytes > GEO_MAP_CONSTANTS.sourceBytesMax) {
    failures.push(
      error(
        "geo-map-source-too-large",
        "$",
        `source is ${sourceBytes} B, above the ${GEO_MAP_CONSTANTS.sourceBytesMax} B first-screen budget (C33)`,
      ),
    );
  }
  if (project.layers.length < GEO_MAP_COMPLETENESS.layersMin) {
    failures.push(
      error(
        "geo-map-hollow",
        "layers",
        `layers must be >= ${GEO_MAP_COMPLETENESS.layersMin}, got ${project.layers.length}`,
      ),
    );
  }
  if (dataLayers.length < GEO_MAP_COMPLETENESS.dataLayersMin) {
    failures.push(
      error(
        "geo-map-hollow",
        "layers",
        `non-background layers must be >= ${GEO_MAP_COMPLETENESS.dataLayersMin}, got ${dataLayers.length}`,
      ),
    );
  }
  if (sourceKeys.length < GEO_MAP_COMPLETENESS.sourceKeysMin) {
    failures.push(
      error("geo-map-hollow", "sources", "sources must declare at least one key"),
    );
  }
  if (featureCountTotal < GEO_MAP_COMPLETENESS.featureCountTotalMin) {
    failures.push(
      error(
        "geo-map-hollow",
        "sources",
        `featureCount total must be >= ${GEO_MAP_COMPLETENESS.featureCountTotalMin}, got ${featureCountTotal}`,
      ),
    );
  }
  if (
    dataLayers.length >= GEO_MAP_COMPLETENESS.dataLayersMin &&
    legendEntries < GEO_MAP_COMPLETENESS.legendEntriesMin
  ) {
    failures.push(
      error(
        "geo-map-hollow",
        "legend.entries",
        `legend.entries must be >= ${GEO_MAP_COMPLETENESS.legendEntriesMin} once there are >= ${GEO_MAP_COMPLETENESS.dataLayersMin} data layers, got ${legendEntries}`,
      ),
    );
  }
  if (annotations < GEO_MAP_COMPLETENESS.annotationsMin) {
    failures.push(
      error(
        "geo-map-hollow",
        "annotations",
        `annotations must be >= ${GEO_MAP_COMPLETENESS.annotationsMin}, got ${annotations}`,
      ),
    );
  }
  if (attributionEntries < GEO_MAP_COMPLETENESS.attributionEntriesMin) {
    failures.push(
      error(
        "geo-map-attribution-missing",
        "attribution.entries",
        "attribution.entries must hold at least one complete entry",
      ),
    );
  }
  if (dependencies < GEO_MAP_CLOSURE_FLOORS.dependencyCountMin) {
    failures.push(
      error(
        "geo-map-hollow",
        "dependencies",
        `dependency closure must declare at least ${GEO_MAP_CLOSURE_FLOORS.dependencyCountMin} file (§8.1)`,
      ),
    );
  }
  if (paintColors.length < GEO_MAP_COMPLETENESS.paintColorsMin) {
    failures.push(
      error(
        "geo-map-color-collapse",
        "layers[].paint",
        `distinct paint colours must be >= ${GEO_MAP_COMPLETENESS.paintColorsMin}, got ${paintColors.length}`,
      ),
    );
  }
  if (project.metadata.title.length < GEO_MAP_COMPLETENESS.titleMinLength) {
    failures.push(
      error(
        "geo-map-hollow",
        "metadata.title",
        `metadata.title must be >= ${GEO_MAP_COMPLETENESS.titleMinLength} characters`,
      ),
    );
  }
  // §4 C28: three or more data series must not rely on colour alone.
  if (
    dataLayers.length >= GEO_MAP_CONSTANTS.patternRequiredSeriesCount &&
    legendPatterns.size < 2
  ) {
    failures.push(
      error(
        "geo-map-color-collapse",
        "legend.entries[].pattern",
        `>= ${GEO_MAP_CONSTANTS.patternRequiredSeriesCount} data layers require at least 2 distinct legend patterns (C28)`,
      ),
    );
  }
  if (
    input.frameColorCount !== undefined &&
    input.frameColorCount < GEO_MAP_COMPLETENESS.frameColorCountMin
  ) {
    failures.push(
      error(
        "geo-map-color-collapse",
        "$",
        `captured frame holds ${input.frameColorCount} colours, below the ${GEO_MAP_COMPLETENESS.frameColorCountMin} colour floor (C38)`,
      ),
    );
  }
  if (input.dependencyClosureBytes !== undefined) {
    if (
      input.dependencyClosureBytes <
      GEO_MAP_CLOSURE_FLOORS.dependencyClosureBytesMin
    ) {
      failures.push(
        error(
          "geo-map-hollow",
          "dependencies",
          `dependency closure is ${input.dependencyClosureBytes} B, below the ${GEO_MAP_CLOSURE_FLOORS.dependencyClosureBytesMin} B floor (§8.1)`,
        ),
      );
    }
    if (
      input.dependencyClosureBytes > GEO_MAP_CONSTANTS.dependencyClosureBytesMax
    ) {
      failures.push(
        error(
          "geo-map-dependency-closure-incomplete",
          "dependencies",
          `dependency closure is ${input.dependencyClosureBytes} B, above the ${GEO_MAP_CONSTANTS.dependencyClosureBytesMax} B budget (C35)`,
        ),
      );
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    metrics: {
      sourceBytes,
      layers: project.layers.length,
      dataLayers: dataLayers.length,
      sourceKeys: sourceKeys.length,
      featureCountTotal,
      legendEntries,
      annotations,
      attributionEntries,
      dependencies,
      paintColors: paintColors.length,
      titleLength: project.metadata.title.length,
      legendPatterns: legendPatterns.size,
    },
  };
}

function channelLuminance(channel: number): number {
  const ratio = channel / 255;
  return ratio <= 0.03928
    ? ratio / 12.92
    : Math.pow((ratio + 0.055) / 1.055, 2.4);
}

export function geoMapRelativeLuminance(color: GeoMapColor): number {
  if (!COLOR_PATTERN.test(color)) {
    throw new Error(`geo-map colour ${color} must match #RRGGBB`);
  }
  const value = Number.parseInt(color.slice(1), 16);
  return (
    0.2126 * channelLuminance((value >> 16) & 0xff) +
    0.7152 * channelLuminance((value >> 8) & 0xff) +
    0.0722 * channelLuminance(value & 0xff)
  );
}

/** WCAG 2.2 contrast ratio, used by SC 1.4.3 / SC 1.4.11 checks. */
export function geoMapContrastRatio(
  foreground: GeoMapColor,
  background: GeoMapColor,
): number {
  const first = geoMapRelativeLuminance(foreground);
  const second = geoMapRelativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface GeoMapLabelContrastInput {
  project: GeoMapProject;
  /** Dominant colour directly beneath each symbol layer, by layer id. */
  underlyingColorByLayerId?: Record<string, GeoMapColor>;
  fallbackUnderlyingColor?: GeoMapColor;
}

export interface GeoMapLabelContrastResult {
  ok: boolean;
  failures: GeoMapValidationError[];
  /** Layers whose halo had to flip to survive SC 1.4.3 (§6 F8 fallback). */
  repairedLayerIds: string[];
  project: GeoMapProject;
}

/**
 * §6 F8: recompute every label against the colour beneath it, flip the halo to
 * its inverse once, and only then reject. Silent acceptance is not an option.
 */
export function repairGeoMapLabelContrast(
  input: GeoMapLabelContrastInput,
): GeoMapLabelContrastResult {
  const failures: GeoMapValidationError[] = [];
  const repairedLayerIds: string[] = [];
  const fallback =
    input.fallbackUnderlyingColor ?? GEO_MAP_PALETTE["map.land"];
  const layers = input.project.layers.map((layer) => {
    if (layer.type !== "symbol") return layer;
    const textColor = layer.paint.textColor ?? GEO_MAP_PALETTE["map.label.primary"];
    const beneath = input.underlyingColorByLayerId?.[layer.id] ?? fallback;
    if (geoMapContrastRatio(textColor, beneath) >= 4.5) return layer;
    const halo = layer.paint.textHaloColor ?? GEO_MAP_PALETTE["map.label.halo"];
    const inverted = invertColor(halo);
    const repaired: GeoMapLayer = {
      ...layer,
      paint: {
        ...layer.paint,
        textHaloColor: inverted,
        textHaloWidth:
          layer.paint.textHaloWidth ?? GEO_MAP_CONSTANTS.textHaloWidthPx,
      },
    };
    if (geoMapContrastRatio(textColor, inverted) >= 4.5) {
      repairedLayerIds.push(layer.id);
      return repaired;
    }
    failures.push(
      error(
        "geo-map-label-contrast",
        `layers[${input.project.layers.indexOf(layer)}].paint.textColor`,
        `label ${layer.id} keeps ${geoMapContrastRatio(textColor, beneath).toFixed(2)}:1 against ${beneath} after halo inversion; SC 1.4.3 requires 4.5:1`,
      ),
    );
    return repaired;
  });
  return {
    ok: failures.length === 0,
    failures,
    repairedLayerIds,
    project: canonicalGeoMapProject({ ...input.project, layers }),
  };
}

function invertColor(color: GeoMapColor): GeoMapColor {
  const value = Number.parseInt(color.slice(1), 16);
  const inverted = 0xffffff - (value & 0xffffff);
  return `#${inverted.toString(16).padStart(6, "0").toUpperCase()}`;
}

/**
 * §6 F6 / §7 A10-A11: shingle the structural identity of a project so two
 * template clones that only renamed `metadata.title` still score ~1.0.
 */
export function geoMapSimilarityShingles(project: GeoMapProject): string[] {
  const shingles = new Set<string>();
  shingles.add(`projection:${project.projection.name}`);
  shingles.add(`scale:${project.basemap.scaleBand}`);
  shingles.add(`provider:${project.basemap.provider}`);
  shingles.add(
    `center:${project.camera.center[0].toFixed(3)},${project.camera.center[1].toFixed(3)}`,
  );
  shingles.add(`zoom:${project.camera.zoom.toFixed(2)}`);
  for (const [key, source] of Object.entries(project.sources)) {
    shingles.add(`source:${key}:${source.type}:${source.dependencyPath}`);
  }
  for (const layer of project.layers) {
    shingles.add(`layer:${layer.id}:${layer.type}:${layer.source}`);
    for (const [key, value] of Object.entries(layer.paint)) {
      shingles.add(`paint:${layer.id}:${key}:${JSON.stringify(value)}`);
    }
  }
  for (const annotation of project.annotations ?? []) {
    shingles.add(
      `annotation:${annotation.kind}:${JSON.stringify(annotation.geometry.coordinates)}`,
    );
  }
  return [...shingles].sort();
}

export function geoMapJaccardSimilarity(
  left: GeoMapProject,
  right: GeoMapProject,
): number {
  const first = new Set(geoMapSimilarityShingles(left));
  const second = new Set(geoMapSimilarityShingles(right));
  if (first.size === 0 && second.size === 0) return 1;
  let intersection = 0;
  for (const shingle of first) if (second.has(shingle)) intersection += 1;
  const union = first.size + second.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export interface GeoMapSimilarityVerdict {
  ok: boolean;
  similarity: number;
  twin: boolean;
  failures: GeoMapValidationError[];
}

/** §6 F6: >= 0.99 is a twin and is rejected; >= 0.85 must be diversified. */
export function evaluateGeoMapSimilarity(
  candidate: GeoMapProject,
  cohort: readonly GeoMapProject[],
): GeoMapSimilarityVerdict {
  let similarity = 0;
  for (const existing of cohort) {
    similarity = Math.max(similarity, geoMapJaccardSimilarity(candidate, existing));
  }
  const twin = similarity >= GEO_MAP_CONSTANTS.twinThreshold;
  const failures: GeoMapValidationError[] = [];
  if (twin) {
    failures.push(
      error(
        "geo-map-twin",
        "$",
        `candidate scores ${similarity.toFixed(4)} against an existing map, at or above the ${GEO_MAP_CONSTANTS.twinThreshold} twin threshold (C40)`,
      ),
    );
  } else if (similarity >= GEO_MAP_CONSTANTS.jaccardMax) {
    failures.push(
      error(
        "geo-map-twin",
        "$",
        `candidate scores ${similarity.toFixed(4)}, above the ${GEO_MAP_CONSTANTS.jaccardMax} ceiling (C39); change at least two of camera.center / basemap.scaleBand / data layers`,
      ),
    );
  }
  return { ok: failures.length === 0, similarity, twin, failures };
}
