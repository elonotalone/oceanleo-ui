/**
 * `oceanleo.vector.v1` carrier structure.
 *
 * Spec: docs/specs/oceanleo-material-and-game-v1/L1-carriers/vector.md
 * — §1.1 version lock, §1.3 licence tiers, §2 grids and palette,
 * §3.1 JSON Schema, §4 constant table C1–C47.
 *
 * The `source` bytes stay SVG text; this IR is the editable projection that
 * gives the carrier the three capabilities §5.1 names. The JSON Schema below is
 * the contract's §3.1 block transcribed literally and is what the validator
 * evaluates.
 */

import {
  evaluateCarrierSchema,
  type CarrierSchemaViolation,
} from "../image-editor/carrier-json-schema";

export const VECTOR_PROJECT_SCHEMA = "oceanleo.vector.v1";

/** §1.1 four-tuple. The adapter is the layered design canvas, never bitmap. */
export const VECTOR_VERSION_LOCK = Object.freeze({
  featureId: "design_canvas",
  artifactType: "vector_image",
  sourceFormat: "svg",
  sourceMediaType: "image/svg+xml",
  editorCapability: "vector-editor",
  adapter: "design-canvas",
  projectSchema: VECTOR_PROJECT_SCHEMA,
  editability: "native",
  sourceIntegrity: "content_addressed",
  openMode: "structured-project",
});

/**
 * §1.1: `_source_format_matches[VECTOR_IMAGE]` accepts svg / image/svg+xml /
 * ai / eps, but `ai` and `eps` are proprietary binaries with no platform
 * parser — they MUST stay `view_only`. Only `svg` may claim `native`.
 */
export const VECTOR_NATIVE_SOURCE_FORMATS = Object.freeze(["svg", "image/svg+xml"]);
export const VECTOR_VIEW_ONLY_SOURCE_FORMATS = Object.freeze(["ai", "eps"]);

export function vectorSourceFormatEditability(
  sourceFormat: string,
): "native" | "view_only" | null {
  const probe = sourceFormat.trim().toLowerCase();
  if (VECTOR_NATIVE_SOURCE_FORMATS.includes(probe)) return "native";
  if (VECTOR_VIEW_ONLY_SOURCE_FORMATS.includes(probe)) return "view_only";
  return null;
}

/** §2.1 icon grid. */
export const VECTOR_ICON_GRID = Object.freeze({
  baseUnits: 24,
  allowedUnits: Object.freeze([16, 24, 32, 48]),
  paddingUnits: 2,
  strokeWidthUnits: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  cornerRadiusUnits: 2,
  keylineStepUnits: 1,
});

/** §2.2 illustration grid. */
export const VECTOR_ILLUSTRATION_GRID = Object.freeze({
  baseCanvas: Object.freeze({ width: 800, height: 600 }),
  allowedCanvases: Object.freeze([
    Object.freeze({ width: 400, height: 300 }),
    Object.freeze({ width: 800, height: 600 }),
    Object.freeze({ width: 1200, height: 900 }),
  ]),
  safeMarginRatio: 0.05,
  minimumVisibleStrokeUnits: 0.5,
});

/**
 * §2.3 palette. `vec.accent.2` is `#C47323` after the 2026-07-29 correction
 * (`#D9822B` measured 2.93:1 and could never satisfy its own ≥ 3.0:1 claim);
 * `vec.neutral` has only 0.04 of headroom and MUST NOT be lightened.
 */
export const VECTOR_PALETTE = Object.freeze({
  "vec.white": "#FFFFFF",
  "vec.ink": "#1F2328",
  "vec.accent": "#1F6FEB",
  "vec.accent.2": "#C47323",
  "vec.neutral": "#8C959F",
  "vec.surface": "#F5F7FA",
});

export const VECTOR_CONTRAST_OBLIGATIONS = Object.freeze([
  Object.freeze({ token: "vec.ink", minimum: 4.5, measured: 15.8 }),
  Object.freeze({ token: "vec.accent", minimum: 3.0, measured: 4.63 }),
  Object.freeze({ token: "vec.accent.2", minimum: 3.0, measured: 3.61 }),
  Object.freeze({ token: "vec.neutral", minimum: 3.0, measured: 3.04 }),
  Object.freeze({ token: "vec.surface", minimum: 1.05, measured: 1.07 }),
]);

/** §4 numeric constants C1–C47. */
export const VECTOR_CONSTANTS = Object.freeze({
  C1_minimumShapes: 2,
  C2_maximumShapes: 2_000,
  C3_minimumIconShapes: 3,
  C4_minimumIllustrationShapes: 12,
  C5_shapeTypeCount: 10,
  C6_minimumShapeTypesUsed: 2,
  C7_baseIconGridUnits: 24,
  C8_allowedGridUnits: Object.freeze([16, 24, 32, 48]),
  C9_viewBoxEdge: Object.freeze({ minimum: 8, maximum: 4_096 }),
  C10_iconPaddingUnits: 2,
  C11_iconStrokeWidthUnits: 2,
  C12_canvasStrokeWidth: Object.freeze({ minimum: 0.5, maximum: 16 }),
  C13_shapeStrokeWidth: Object.freeze({ minimum: 0, maximum: 64 }),
  C14_iconCornerRadiusUnits: 2,
  C15_minimumVisibleStrokeUnits: 0.5,
  C16_illustrationCanvas: Object.freeze({ width: 800, height: 600 }),
  C17_safeMarginRatio: 0.05,
  C18_paletteTokens: Object.freeze({ minimum: 1, maximum: 16 }),
  C19_zRange: Object.freeze({ minimum: 0, maximum: 1_999 }),
  C20_maximumPathDataLength: 60_000,
  C21_maximumAnchorsPerShape: 20_000,
  C22_minimumTotalAnchors: 8,
  C23_maximumDefs: 64,
  C24_maximumGradientStops: 16,
  C25_maximumGroupChildren: 500,
  C26_minimumLabelLength: 4,
  C27_graphicContrastMinimum: 3.0,
  C28_dangerousConstructClasses: 8,
  C29_iconSourceByteFloor: 512,
  C30_illustrationSourceByteFloor: 4_096,
  C31_maximumSourceBytes: 4_194_304,
  C32_irByteFloor: 1_024,
  C33_sanitizeWallClockMs: 500,
  C34_renderWallClockMs: 2_000,
  C35_captureCanvas: Object.freeze({ width: 512, height: 512 }),
  C36_iconFrameColorFloor: 4,
  C37_illustrationFrameColorFloor: 16,
  C38_minimumCoverEdgePx: 128,
  C39_viewOnlyVectorBacklog: 46_487,
  C40_svgrepoTotal: 46_303,
  C41_svgrepoPdm: 21_289,
  C42_svgrepoCc0: 15_488,
  C43_svgrepoMit: 9_526,
  C44_tablerMit: 182,
  C45_openmojiCcBySaForbidden: 1_644,
  C46_maximumFamilyJaccard: 0.85,
  C47_twinJaccard: 0.99,
});

/** §8.2 thresholds that are not in the §4 table. */
export const VECTOR_COMPLETENESS_THRESHOLDS = Object.freeze({
  minimumTokenReferenceRatio: 0.8,
  minimumTitleLength: 8,
  minimumAttributionEntries: 1,
  minimumCoverageRatio: 0.1,
});

/** §3.1: `CC-BY-SA` is absent from the enum — that is §1.3 at schema level. */
export const VECTOR_LICENSE_CODES = Object.freeze([
  "PDM",
  "CC0",
  "MIT",
  "CC-BY",
  "OCEANLEO-AIGEN",
]);

export const VECTOR_SHAPE_TYPES = Object.freeze([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "group",
  "use",
  "text",
]);

export type VectorShapeType = (typeof VECTOR_SHAPE_TYPES)[number];

export type VectorCanvasKind =
  | "icon"
  | "illustration"
  | "logo"
  | "pattern"
  | "map-glyph";

export interface VectorCanvas {
  viewBoxWidth: number;
  viewBoxHeight: number;
  kind: VectorCanvasKind;
  gridUnits?: 16 | 24 | 32 | 48;
  strokeWidth?: number;
}

export interface VectorPaletteToken {
  token: string;
  value: string;
}

export interface VectorShape {
  id: string;
  type: VectorShapeType;
  z: number;
  d?: string;
  points?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  fillToken?: string;
  strokeToken?: string;
  strokeWidth?: number;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  fillRule?: "nonzero" | "evenodd";
  opacity?: number;
  transform?: string;
  text?: string;
  refId?: string;
  childIds?: string[];
  anchorCount?: number;
}

export interface VectorDef {
  id: string;
  kind: "linear-gradient" | "radial-gradient" | "clip-path" | "mask" | "symbol";
  stops?: { offset: number; colorToken: string; opacity?: number }[];
}

export interface VectorAccessibility {
  label: string;
  decorative: boolean;
  description?: string;
}

export interface VectorAttributionEntry {
  text: string;
  licenseCode: "PDM" | "CC0" | "MIT" | "CC-BY" | "OCEANLEO-AIGEN";
  licenseUrl: string;
  provider?: string;
}

export interface VectorProject {
  schema: typeof VECTOR_PROJECT_SCHEMA;
  version: 1;
  title: string;
  canvas: VectorCanvas;
  palette: VectorPaletteToken[];
  shapes: VectorShape[];
  defs?: VectorDef[];
  accessibility: VectorAccessibility;
  attribution: { entries: VectorAttributionEntry[] };
}

/** vector.md §3.1, transcribed literally. */
export const VECTOR_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oceanleo.com/schemas/oceanleo.vector.v1.json",
  title: "oceanleo.vector.v1",
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "version",
    "title",
    "canvas",
    "palette",
    "shapes",
    "accessibility",
    "attribution",
  ],
  properties: {
    schema: { const: "oceanleo.vector.v1" },
    version: { type: "integer", const: 1 },
    title: { type: "string", minLength: 8, maxLength: 300 },

    canvas: {
      type: "object",
      additionalProperties: false,
      required: ["viewBoxWidth", "viewBoxHeight", "kind"],
      properties: {
        viewBoxWidth: { type: "number", minimum: 8, maximum: 4096 },
        viewBoxHeight: { type: "number", minimum: 8, maximum: 4096 },
        kind: {
          enum: ["icon", "illustration", "logo", "pattern", "map-glyph"],
        },
        gridUnits: { enum: [16, 24, 32, 48] },
        strokeWidth: { type: "number", minimum: 0.5, maximum: 16 },
      },
    },

    palette: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["token", "value"],
        properties: {
          token: { type: "string", pattern: "^[a-z][a-z0-9-]{0,31}$" },
          value: {
            type: "string",
            pattern:
              "^(#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?|currentColor|none)$",
          },
        },
      },
    },

    shapes: {
      type: "array",
      minItems: 2,
      maxItems: 2000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "z"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
          type: {
            enum: [
              "path",
              "rect",
              "circle",
              "ellipse",
              "line",
              "polyline",
              "polygon",
              "group",
              "use",
              "text",
            ],
          },
          z: { type: "integer", minimum: 0, maximum: 1999 },
          d: { type: "string", maxLength: 60000 },
          points: { type: "string", maxLength: 20000 },
          x: { type: "number", minimum: -4096, maximum: 8192 },
          y: { type: "number", minimum: -4096, maximum: 8192 },
          width: { type: "number", exclusiveMinimum: 0, maximum: 8192 },
          height: { type: "number", exclusiveMinimum: 0, maximum: 8192 },
          cx: { type: "number", minimum: -4096, maximum: 8192 },
          cy: { type: "number", minimum: -4096, maximum: 8192 },
          r: { type: "number", exclusiveMinimum: 0, maximum: 4096 },
          rx: { type: "number", minimum: 0, maximum: 4096 },
          ry: { type: "number", minimum: 0, maximum: 4096 },
          fillToken: { type: "string", maxLength: 32 },
          strokeToken: { type: "string", maxLength: 32 },
          strokeWidth: { type: "number", minimum: 0, maximum: 64 },
          strokeLinecap: { enum: ["butt", "round", "square"] },
          strokeLinejoin: { enum: ["miter", "round", "bevel"] },
          fillRule: { enum: ["nonzero", "evenodd"] },
          opacity: { type: "number", minimum: 0, maximum: 1, default: 1 },
          transform: { type: "string", maxLength: 300 },
          text: { type: "string", maxLength: 300 },
          refId: { type: "string", maxLength: 48 },
          childIds: {
            type: "array",
            maxItems: 500,
            items: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
          },
          anchorCount: { type: "integer", minimum: 0, maximum: 20000 },
        },
        allOf: [
          {
            if: { properties: { type: { const: "path" } }, required: ["type"] },
            then: { required: ["d"] },
          },
          {
            if: {
              properties: { type: { const: "group" } },
              required: ["type"],
            },
            then: { required: ["childIds"] },
          },
          {
            if: { properties: { type: { const: "use" } }, required: ["type"] },
            then: { required: ["refId"] },
          },
        ],
      },
    },

    defs: {
      type: "array",
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
          kind: {
            enum: [
              "linear-gradient",
              "radial-gradient",
              "clip-path",
              "mask",
              "symbol",
            ],
          },
          stops: {
            type: "array",
            maxItems: 16,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["offset", "colorToken"],
              properties: {
                offset: { type: "number", minimum: 0, maximum: 1 },
                colorToken: { type: "string", maxLength: 32 },
                opacity: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
    },

    accessibility: {
      type: "object",
      additionalProperties: false,
      required: ["label", "decorative"],
      properties: {
        label: { type: "string", maxLength: 200 },
        decorative: { type: "boolean" },
        description: { type: "string", maxLength: 600 },
      },
      allOf: [
        {
          if: { properties: { decorative: { const: false } } },
          then: {
            properties: { label: { minLength: 4 } },
            required: ["label"],
          },
        },
      ],
    },

    attribution: {
      type: "object",
      additionalProperties: false,
      required: ["entries"],
      properties: {
        entries: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "licenseCode", "licenseUrl"],
            properties: {
              text: { type: "string", minLength: 2, maxLength: 200 },
              licenseCode: {
                enum: ["PDM", "CC0", "MIT", "CC-BY", "OCEANLEO-AIGEN"],
              },
              licenseUrl: {
                type: "string",
                format: "uri",
                pattern: "^https://",
              },
              provider: { type: "string", maxLength: 60 },
            },
          },
        },
      },
    },
  },
} as const;

export type VectorValidationError = CarrierSchemaViolation;

export type VectorValidation =
  | { ok: true; project: VectorProject }
  | { ok: false; errors: VectorValidationError[] };

export function validateVectorProject(value: unknown): VectorValidation {
  const errors = evaluateCarrierSchema(
    VECTOR_JSON_SCHEMA as unknown as Record<string, unknown>,
    value,
  );
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, project: value as VectorProject };
}

/** §6 failure modes F1–F8 mapped to controlled codes. */
export type VectorFailureCode =
  | "vector-invalid-xml"
  | "vector-missing-viewbox"
  | "vector-invalid-ir"
  | "vector-flattened-only"
  | "vector-raster-adapter-regression"
  | "vector-script-residue"
  | "vector-hardcoded-color"
  | "vector-dangling-reference"
  | "vector-license-violation"
  | "vector-missing-accessible-name"
  | "vector-twin";

export const VECTOR_FAILURE_MODES = Object.freeze({
  F1: "vector-flattened-only",
  F2: "vector-raster-adapter-regression",
  F3: "vector-script-residue",
  F4: "vector-hardcoded-color",
  F5: "vector-dangling-reference",
  F6: "vector-license-violation",
  F7: "vector-missing-accessible-name",
  F8: "vector-twin",
});

export class VectorCarrierError extends Error {
  readonly code: VectorFailureCode;
  readonly violations: readonly VectorValidationError[];

  constructor(
    message: string,
    code: VectorFailureCode,
    violations: readonly VectorValidationError[] = [],
  ) {
    super(message);
    this.name = "VectorCarrierError";
    this.code = code;
    this.violations = violations;
  }
}

/** Deterministic serialization with the schema's own key order. */
export function serializeVectorProject(project: VectorProject): string {
  const shapeKeys = Object.keys(VECTOR_JSON_SCHEMA.properties.shapes.items.properties);
  const orderedShape = (shape: VectorShape) => {
    const out: Record<string, unknown> = {};
    for (const key of shapeKeys) {
      const value = (shape as unknown as Record<string, unknown>)[key];
      if (value !== undefined) out[key] = value;
    }
    return out;
  };
  const out: Record<string, unknown> = {
    schema: project.schema,
    version: project.version,
    title: project.title,
    canvas: project.canvas,
    palette: project.palette,
    shapes: project.shapes.map(orderedShape),
    ...(project.defs === undefined ? {} : { defs: project.defs }),
    accessibility: project.accessibility,
    attribution: project.attribution,
  };
  return `${JSON.stringify(out)}\n`;
}

export function parseVectorProject(input: string | Uint8Array): VectorProject {
  const text =
    typeof input === "string" ? input : new TextDecoder().decode(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new VectorCarrierError(
      "vector IR 不是有效 JSON。",
      "vector-invalid-ir",
    );
  }
  const validation = validateVectorProject(parsed);
  if (!validation.ok) {
    throw new VectorCarrierError(
      `vector IR 未通过 §3.1 校验：${validation.errors
        .slice(0, 4)
        .map((error) => `${error.path || "<root>"} ${error.message}`)
        .join("；")}`,
      "vector-invalid-ir",
      validation.errors,
    );
  }
  return validation.project;
}

/** §8.1: the only carrier whose byte floor is tiered by `canvas.kind`. */
export function vectorSourceByteFloor(kind: VectorCanvasKind): number {
  return kind === "icon"
    ? VECTOR_CONSTANTS.C29_iconSourceByteFloor
    : VECTOR_CONSTANTS.C30_illustrationSourceByteFloor;
}

/** §8.2 / C36 / C37: capture-frame colour floor, also tiered by kind. */
export function vectorFrameColorFloor(kind: VectorCanvasKind): number {
  return kind === "icon"
    ? VECTOR_CONSTANTS.C36_iconFrameColorFloor
    : VECTOR_CONSTANTS.C37_illustrationFrameColorFloor;
}

/** §8.2 / C1 / C3 / C4: shape-count floor, tiered by kind. */
export function vectorShapeCountFloor(kind: VectorCanvasKind): number {
  if (kind === "icon") return VECTOR_CONSTANTS.C3_minimumIconShapes;
  if (kind === "illustration") {
    return VECTOR_CONSTANTS.C4_minimumIllustrationShapes;
  }
  return VECTOR_CONSTANTS.C1_minimumShapes;
}
