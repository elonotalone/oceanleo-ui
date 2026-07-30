/**
 * `oceanleo.design-document.v1` carrier structure.
 *
 * Spec: docs/specs/oceanleo-material-and-game-v1/L1-carriers/design-document.md
 * — §2 visual targets, §3.1 JSON Schema, §4 constant table C1–C43, §5.4 licence.
 *
 * The JSON Schema below is the contract's §3.1 block transcribed literally; the
 * validator evaluates that literal rather than re-stating the bounds, so any
 * drift from the spec is a diff in one place.
 */

import {
  evaluateCarrierSchema,
  type CarrierSchemaViolation,
} from "./carrier-json-schema";

export const DESIGN_DOCUMENT_PROJECT_SCHEMA = "oceanleo.design-document.v1";

/** §2.1 canvas palette. `canvas.grid` stays editor-only and never exports. */
export const DESIGN_CANVAS_PALETTE = Object.freeze({
  "canvas.page": "#FFFFFF",
  "canvas.outside": "#E6E9ED",
  "canvas.text": "#1F2328",
  "canvas.accent": "#1F6FEB",
  "canvas.guide": "#E5484D",
  "canvas.grid": "#D0D7DE",
  "canvas.rule": "#7D8590",
});

/**
 * §2.1 contrast obligations. `canvas.rule` is judged against the darker of the
 * two backgrounds it can sit on (`canvas.outside`, 3.06:1), not against
 * `canvas.page` (3.73:1) — the spec's 2026-07-29 second correction.
 */
export const DESIGN_CANVAS_CONTRAST_OBLIGATIONS = Object.freeze([
  Object.freeze({
    token: "canvas.outside",
    against: "canvas.page",
    minimum: 1.15,
    measured: 1.22,
    successCriterion: null,
  }),
  Object.freeze({
    token: "canvas.text",
    against: "canvas.page",
    minimum: 4.5,
    measured: 15.8,
    successCriterion: "1.4.3",
  }),
  Object.freeze({
    token: "canvas.accent",
    against: "canvas.page",
    minimum: 3.0,
    measured: 4.63,
    successCriterion: "1.4.11",
  }),
  Object.freeze({
    token: "canvas.guide",
    against: "canvas.page",
    minimum: 3.0,
    measured: 3.91,
    successCriterion: "1.4.11",
  }),
  Object.freeze({
    token: "canvas.grid",
    against: "canvas.page",
    minimum: 1.05,
    measured: 1.45,
    successCriterion: null,
  }),
  Object.freeze({
    token: "canvas.rule",
    against: "canvas.outside",
    minimum: 3.0,
    measured: 3.06,
    successCriterion: "1.4.11",
  }),
]);

/** §2.2 artboard size tiers. */
export const DESIGN_ARTBOARD_TIERS = Object.freeze([
  Object.freeze({ id: "square", width: 1080, height: 1080, label: "社媒方图" }),
  Object.freeze({ id: "story", width: 1080, height: 1920, label: "竖屏" }),
  Object.freeze({ id: "wide", width: 1920, height: 1080, label: "横幅 / 封面" }),
  Object.freeze({
    id: "poster",
    width: 2480,
    height: 3508,
    label: "A4 300 dpi",
  }),
  Object.freeze({ id: "card", width: 1200, height: 630, label: "OG 卡片" }),
  Object.freeze({ id: "banner", width: 1456, height: 180, label: "站内横幅" }),
]);

export type DesignArtboardTierId =
  (typeof DESIGN_ARTBOARD_TIERS)[number]["id"];

/** §2.3 grid and snapping. */
export const DESIGN_GRID = Object.freeze({
  stepPx: 8,
  snapThresholdPx: 4,
  safeMarginRatio: 0.05,
  minimumSelectableEdgePx: 8,
  minimumHitAreaEdgePx: 24,
});

/** §2.4 font size tiers, expressed against the artboard short edge. */
export const DESIGN_FONT_SIZE_TIERS = Object.freeze([
  Object.freeze({ id: "display", ratio: 0.093, at1080: 100 }),
  Object.freeze({ id: "h1", ratio: 0.061, at1080: 66 }),
  Object.freeze({ id: "h2", ratio: 0.041, at1080: 44 }),
  Object.freeze({ id: "body", ratio: 0.026, at1080: 28 }),
  Object.freeze({ id: "caption", ratio: 0.017, at1080: 18 }),
]);

export type DesignFontSizeTierId =
  (typeof DESIGN_FONT_SIZE_TIERS)[number]["id"];

/** §4 numeric constants C1–C43. */
export const DESIGN_DOCUMENT_CONSTANTS = Object.freeze({
  C1_minimumElements: 20,
  C2_maximumElements: 2_000,
  C3_elementTypeCount: 9,
  C4_minimumElementTypesUsed: 3,
  C5_artboardWidth: Object.freeze({ minimum: 64, maximum: 8_000 }),
  C6_artboardHeight: Object.freeze({ minimum: 64, maximum: 8_000 }),
  C12_dpi: Object.freeze({ minimum: 72, maximum: 600, fallback: 96 }),
  C13_printDpi: 300,
  C14_gridStepPx: 8,
  C15_snapThresholdPx: 4,
  C16_safeMarginRatio: 0.05,
  C17_zRange: Object.freeze({ minimum: 0, maximum: 1_999 }),
  C18_rotationDeg: Object.freeze({ minimum: -360, maximum: 360 }),
  C19_opacity: Object.freeze({ minimum: 0, maximum: 1 }),
  C20_fontSizePx: Object.freeze({ minimum: 6, maximum: 800 }),
  C21_fontWeight: Object.freeze({ minimum: 100, maximum: 900 }),
  C22_lineHeight: Object.freeze({ minimum: 0.8, maximum: 3 }),
  C23_strokeWidthPx: Object.freeze({ minimum: 0, maximum: 200 }),
  C24_paletteColors: Object.freeze({ minimum: 3, maximum: 16 }),
  C25_maximumFontFamilies: 8,
  C26_maximumAssets: 200,
  C27_assetBytes: Object.freeze({ minimum: 512, maximum: 8_388_608 }),
  C28_maximumPathDataLength: 40_000,
  C29_maximumGroupChildren: 200,
  C30_textContrastMinimum: 4.5,
  C31_graphicContrastMinimum: 3.0,
  C32_minimumAltLength: 4,
  C33_minimumHitAreaEdgePx: 24,
  C34_minimumSourceBytes: 16_384,
  C35_maximumSourceBytes: 8_388_608,
  C36_libraryMeanSourceBytes: 45_179,
  C37_libraryMaximumSourceBytes: 293_322,
  C38_maximumClosureBytes: 67_108_864,
  C39_renderWallClockMs: 8_000,
  C40_minimumCoverEdgePx: 128,
  C41_minimumFrameColors: 24,
  C42_maximumFamilyJaccard: 0.85,
  C43_twinJaccard: 0.99,
});

/** §8.2 secondary thresholds that are not in the §4 table. */
export const DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS = Object.freeze({
  minimumTextElements: 2,
  minimumCoverageRatio: 0.25,
  minimumTitleLength: 8,
  minimumAttributionEntries: 1,
});

/** §5.4 font licence enum; `OFL-1.1` is SPDX and MUST NOT be used here. */
export const DESIGN_FONT_LICENSE_CODES = Object.freeze([
  "OFL",
  "Apache-2.0",
  "CC0",
  "PDM",
]);

/** §5.4: copyleft-with-share-alike components stay out of v1 composites. */
export const DESIGN_FORBIDDEN_LICENSE_CODES = Object.freeze(["CC-BY-SA"]);

export const DESIGN_DOCUMENT_ELEMENT_TYPES = Object.freeze([
  "text",
  "image",
  "rect",
  "ellipse",
  "line",
  "path",
  "icon",
  "group",
  "chart-embed",
]);

export type DesignDocumentElementType =
  (typeof DESIGN_DOCUMENT_ELEMENT_TYPES)[number];

export interface DesignDocumentElement {
  id: string;
  type: DesignDocumentElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  rotationDeg?: number;
  opacity?: number;
  decorative?: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  text?: string;
  fontFamily?: string;
  fontSizePx?: number;
  fontWeight?: number;
  lineHeight?: number;
  align?: "left" | "center" | "right" | "justify";
  assetId?: string;
  alt?: string;
  fit?: "cover" | "contain" | "fill";
  pathData?: string;
  childIds?: string[];
}

export interface DesignDocumentBody {
  width: number;
  height: number;
  dpi?: number;
  background: string;
  elements: DesignDocumentElement[];
}

export interface DesignDocumentFont {
  family: string;
  weights?: number[];
  licenseCode: "OFL" | "Apache-2.0" | "CC0" | "PDM";
  assetId?: string;
}

export interface DesignDocumentAsset {
  id: string;
  sha256: string;
  mediaType:
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/svg+xml"
    | "font/woff2";
  byteSize: number;
  licenseCode?: string;
}

export interface DesignDocumentAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
  assetId?: string;
}

export interface DesignDocumentProject {
  schema: typeof DESIGN_DOCUMENT_PROJECT_SCHEMA;
  version: 1;
  title: string;
  document: DesignDocumentBody;
  palette: string[];
  fonts?: DesignDocumentFont[];
  assets?: DesignDocumentAsset[];
  attribution: { entries: DesignDocumentAttributionEntry[] };
}

/** design-document.md §3.1, transcribed literally. */
export const DESIGN_DOCUMENT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oceanleo.com/schemas/oceanleo.design-document.v1.json",
  title: "oceanleo.design-document.v1",
  type: "object",
  additionalProperties: false,
  required: ["schema", "version", "title", "document", "palette", "attribution"],
  properties: {
    schema: { const: "oceanleo.design-document.v1" },
    version: { type: "integer", const: 1 },
    title: { type: "string", minLength: 8, maxLength: 300 },

    document: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height", "background", "elements"],
      properties: {
        width: { type: "integer", minimum: 64, maximum: 8000 },
        height: { type: "integer", minimum: 64, maximum: 8000 },
        dpi: { type: "integer", minimum: 72, maximum: 600, default: 96 },
        background: { $ref: "#/$defs/color" },
        elements: {
          type: "array",
          minItems: 20,
          maxItems: 2000,
          items: { $ref: "#/$defs/element" },
        },
      },
    },

    palette: {
      type: "array",
      minItems: 3,
      maxItems: 16,
      items: { $ref: "#/$defs/color" },
    },

    fonts: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["family", "licenseCode"],
        properties: {
          family: { type: "string", minLength: 1, maxLength: 80 },
          weights: {
            type: "array",
            maxItems: 9,
            items: { type: "integer", minimum: 100, maximum: 900 },
          },
          licenseCode: { enum: ["OFL", "Apache-2.0", "CC0", "PDM"] },
          assetId: { type: "string", maxLength: 64 },
        },
      },
    },

    assets: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "sha256", "mediaType", "byteSize"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 64 },
          sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
          mediaType: {
            enum: [
              "image/png",
              "image/jpeg",
              "image/webp",
              "image/svg+xml",
              "font/woff2",
            ],
          },
          byteSize: { type: "integer", minimum: 512, maximum: 8388608 },
          licenseCode: { type: "string", maxLength: 60 },
        },
      },
    },

    attribution: {
      type: "object",
      additionalProperties: false,
      required: ["entries"],
      properties: {
        entries: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "licenseCode", "licenseUrl"],
            properties: {
              text: { type: "string", minLength: 2, maxLength: 200 },
              licenseCode: { type: "string", minLength: 2, maxLength: 60 },
              licenseUrl: {
                type: "string",
                format: "uri",
                pattern: "^https://",
              },
              assetId: { type: "string", maxLength: 64 },
            },
          },
        },
      },
    },
  },

  $defs: {
    color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$" },

    element: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "x", "y", "width", "height", "z"],
      properties: {
        id: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
        type: {
          enum: [
            "text",
            "image",
            "rect",
            "ellipse",
            "line",
            "path",
            "icon",
            "group",
            "chart-embed",
          ],
        },
        x: { type: "number", minimum: -8000, maximum: 16000 },
        y: { type: "number", minimum: -8000, maximum: 16000 },
        width: { type: "number", exclusiveMinimum: 0, maximum: 16000 },
        height: { type: "number", exclusiveMinimum: 0, maximum: 16000 },
        z: { type: "integer", minimum: 0, maximum: 1999 },
        rotationDeg: {
          type: "number",
          minimum: -360,
          maximum: 360,
          default: 0,
        },
        opacity: { type: "number", minimum: 0, maximum: 1, default: 1 },
        decorative: { type: "boolean", default: false },
        fill: { $ref: "#/$defs/color" },
        stroke: { $ref: "#/$defs/color" },
        strokeWidth: { type: "number", minimum: 0, maximum: 200 },
        radius: { type: "number", minimum: 0, maximum: 2000 },
        text: { type: "string", maxLength: 2000 },
        fontFamily: { type: "string", maxLength: 80 },
        fontSizePx: { type: "number", minimum: 6, maximum: 800 },
        fontWeight: { type: "integer", minimum: 100, maximum: 900 },
        lineHeight: { type: "number", minimum: 0.8, maximum: 3 },
        align: { enum: ["left", "center", "right", "justify"] },
        assetId: { type: "string", maxLength: 64 },
        alt: { type: "string", maxLength: 300 },
        fit: { enum: ["cover", "contain", "fill"] },
        pathData: { type: "string", maxLength: 40000 },
        childIds: {
          type: "array",
          maxItems: 200,
          items: { type: "string", pattern: "^[a-z][a-zA-Z0-9_-]{0,47}$" },
        },
      },
      allOf: [
        {
          if: {
            properties: { type: { const: "text" } },
            required: ["type"],
          },
          then: { required: ["text", "fontSizePx"] },
        },
        {
          if: {
            properties: { type: { const: "image" } },
            required: ["type"],
          },
          then: { required: ["assetId"] },
        },
        {
          if: {
            properties: { type: { const: "path" } },
            required: ["type"],
          },
          then: { required: ["pathData"] },
        },
        {
          if: {
            properties: { type: { const: "group" } },
            required: ["type"],
          },
          then: { required: ["childIds"] },
        },
      ],
    },
  },
} as const;

export type DesignDocumentValidationError = CarrierSchemaViolation;

export type DesignDocumentValidation =
  | { ok: true; project: DesignDocumentProject }
  | { ok: false; errors: DesignDocumentValidationError[] };

export function validateDesignDocumentProject(
  value: unknown,
): DesignDocumentValidation {
  const errors = evaluateCarrierSchema(
    DESIGN_DOCUMENT_JSON_SCHEMA as unknown as Record<string, unknown>,
    value,
  );
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, project: value as DesignDocumentProject };
}

/** Deterministic serialization: stable key order, no incidental whitespace. */
export function serializeDesignDocumentProject(
  project: DesignDocumentProject,
): string {
  const elementKeys = Object.keys(
    DESIGN_DOCUMENT_JSON_SCHEMA.$defs.element.properties,
  );
  const orderedElement = (element: DesignDocumentElement) => {
    const out: Record<string, unknown> = {};
    for (const key of elementKeys) {
      const value = (element as unknown as Record<string, unknown>)[key];
      if (value !== undefined) out[key] = value;
    }
    return out;
  };
  const body: Record<string, unknown> = {
    width: project.document.width,
    height: project.document.height,
    ...(project.document.dpi === undefined ? {} : { dpi: project.document.dpi }),
    background: project.document.background,
    elements: project.document.elements.map(orderedElement),
  };
  const out: Record<string, unknown> = {
    schema: project.schema,
    version: project.version,
    title: project.title,
    document: body,
    palette: project.palette,
    ...(project.fonts === undefined ? {} : { fonts: project.fonts }),
    ...(project.assets === undefined ? {} : { assets: project.assets }),
    attribution: project.attribution,
  };
  return `${JSON.stringify(out)}\n`;
}

export function parseDesignDocumentProject(
  input: string | Uint8Array,
): DesignDocumentProject {
  const text =
    typeof input === "string" ? input : new TextDecoder().decode(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new DesignDocumentCarrierError(
      "design document source 不是有效 JSON。",
      "design-document-invalid-json",
    );
  }
  const validation = validateDesignDocumentProject(parsed);
  if (!validation.ok) {
    throw new DesignDocumentCarrierError(
      `design document source 未通过 §3.1 校验：${validation.errors
        .slice(0, 4)
        .map((error) => `${error.path || "<root>"} ${error.message}`)
        .join("；")}`,
      "design-document-invalid-structure",
      validation.errors,
    );
  }
  return validation.project;
}

/** §6 failure modes F1–F8 mapped to controlled codes. */
export type DesignDocumentFailureCode =
  | "design-document-invalid-json"
  | "design-document-invalid-structure"
  | "design-document-element-shortfall"
  | "design-document-padded-elements"
  | "design-document-evidence-mismatch"
  | "design-document-layer-ambiguous"
  | "design-document-font-missing"
  | "design-document-dangling-group"
  | "design-document-license-contagion"
  | "design-document-twin";

export const DESIGN_DOCUMENT_FAILURE_MODES = Object.freeze({
  F1: "design-document-element-shortfall",
  F2: "design-document-padded-elements",
  F3: "design-document-evidence-mismatch",
  F4: "design-document-layer-ambiguous",
  F5: "design-document-font-missing",
  F6: "design-document-dangling-group",
  F7: "design-document-license-contagion",
  F8: "design-document-twin",
});

export class DesignDocumentCarrierError extends Error {
  readonly code: DesignDocumentFailureCode;
  readonly violations: readonly DesignDocumentValidationError[];

  constructor(
    message: string,
    code: DesignDocumentFailureCode,
    violations: readonly DesignDocumentValidationError[] = [],
  ) {
    super(message);
    this.name = "DesignDocumentCarrierError";
    this.code = code;
    this.violations = violations;
  }
}

/** §2.2: resolve an artboard to its named tier, or null for a free size. */
export function designArtboardTier(
  width: number,
  height: number,
): DesignArtboardTierId | null {
  const tier = DESIGN_ARTBOARD_TIERS.find(
    (candidate) => candidate.width === width && candidate.height === height,
  );
  return tier ? tier.id : null;
}

/** §2.3: 8 px grid with a 4 px snap window; outside the window nothing moves. */
export function snapToDesignGrid(
  value: number,
  step = DESIGN_GRID.stepPx,
  threshold = DESIGN_GRID.snapThresholdPx,
): number {
  const nearest = Math.round(value / step) * step;
  return Math.abs(nearest - value) <= threshold ? nearest : value;
}

/** §2.4: font size tier resolved against the artboard short edge. */
export function designFontSizePx(
  tier: DesignFontSizeTierId,
  shortEdgePx: number,
): number {
  const entry = DESIGN_FONT_SIZE_TIERS.find((item) => item.id === tier);
  if (!entry) {
    throw new DesignDocumentCarrierError(
      `未知字号档 ${tier}。`,
      "design-document-invalid-structure",
    );
  }
  return Math.round(entry.ratio * shortEdgePx);
}

/** §2.3: safe margin is 5% of the short edge. */
export function designSafeMarginPx(width: number, height: number): number {
  return Math.round(Math.min(width, height) * DESIGN_GRID.safeMarginRatio);
}
