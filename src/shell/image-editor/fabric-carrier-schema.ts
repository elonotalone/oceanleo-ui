/**
 * `oceanleo.fabric-carrier.v1` — the single carrier behind both editing modes
 * (photo / design) of the merged Fabric 6 editor.
 *
 * Spec: `oceandino/docs/work-logs/2026-09/editor-core-swap/signals/W04-carrier.md`.
 * Consumers: W05 (`design` station), W16 / W17 (asset pipelines, Python).
 *
 * Same shape as the other carriers in this directory: the contract lives here
 * as the *literal* JSON Schema and is evaluated by the shared subset evaluator,
 * so "field-by-field against the spec" is a structural property rather than a
 * review promise. Only keywords on that evaluator's allow-list may appear here
 * — it throws on anything else instead of silently ignoring it, so `oneOf` /
 * `anyOf` / `not` / `patternProperties` are unavailable by construction.
 */

import {
  evaluateCarrierSchema,
  type CarrierSchemaViolation,
} from "./carrier-json-schema";
import type { ImageEditorSnapshot } from "./image-document-contract";

export const FABRIC_CARRIER_SCHEMA_ID = "oceanleo.fabric-carrier.v1";

/**
 * Column names of the `wash_slots` table, transcribed from the live DDL
 * (`information_schema.columns`, 2026-09-03). Slot fields carry these names
 * verbatim — including snake_case and the redundant `bbox.width` / `bbox.height`
 * — because the asset pipelines read and write that table directly in Python.
 * Renaming any of them would buy a mapping layer on both sides.
 *
 * `history` is deliberately absent: it is a pipeline-side audit trail with no
 * front-end consumer (carrier spec §3.6).
 */
export const WASH_SLOTS_ALIGNED_COLUMNS = Object.freeze([
  "slot_key",
  "kind",
  "bbox",
  "page",
  "role_zh",
  "role_en",
  "style",
  "alpha_ratio",
  "locked",
]);

/** `wash_slots.kind` value domain (five values present in the live table). */
export const FABRIC_CARRIER_SLOT_KINDS = Object.freeze([
  "text",
  "pixel",
  "shape",
  "smartobject",
  "media",
]);

export type FabricCarrierSlotKind =
  (typeof FABRIC_CARRIER_SLOT_KINDS)[number];

/** `wash_slots.style` value domain (six values present in the live table). */
export const FABRIC_CARRIER_SLOT_STYLES = Object.freeze([
  "flat-multi",
  "flat-solid",
  "illust-detailed",
  "line",
  "photo",
  "texture",
]);

export type FabricCarrierSlotStyle =
  (typeof FABRIC_CARRIER_SLOT_STYLES)[number];

/**
 * The two orthogonality axes (R9, five-layer spec §2.2). Every slot and every
 * Fabric object belongs to exactly one, which is what makes "reskin without
 * touching structure / restructure without touching skin" checkable by
 * comparing two digests instead of looking at a picture.
 */
export const FABRIC_CARRIER_AXES = Object.freeze(["structure", "skin"]);

export type FabricCarrierAxis = (typeof FABRIC_CARRIER_AXES)[number];

/**
 * Custom Fabric object properties the carrier adds on top of the existing
 * `oceanleo*` convention in `editor-objects.ts`.
 *
 * These must be appended to `SNAPSHOT_PROPS`: Fabric 6 drops undeclared custom
 * properties from `toObject()` without warning, so an unlisted property only
 * ever exists in memory (carrier spec §6.2, measured).
 */
export const FABRIC_CARRIER_SNAPSHOT_PROPS = Object.freeze([
  "oceanleoSlotKey",
  "oceanleoAxis",
  "oceanleoFontRef",
]);

/** Font licences allowed in a composite; mirrors `design-document-schema.ts`. */
export const FABRIC_CARRIER_FONT_LICENSES = Object.freeze([
  "OFL",
  "Apache-2.0",
  "CC0",
  "PDM",
]);

/** Share-alike copyleft stays out of composites (`DESIGN_FORBIDDEN_LICENSE_CODES`). */
export const FABRIC_CARRIER_FORBIDDEN_LICENSES = Object.freeze(["CC-BY-SA"]);

export const FABRIC_CARRIER_CONSTANTS = Object.freeze({
  /**
   * Transparent-pixel share above which a pixel slot counts as a cutout.
   * Sole owner of this threshold on the front end; the carrier stores the
   * continuous `alpha_ratio` and never a derived `cutout` boolean, so moving
   * the threshold cannot leave stale data behind.
   * Source: `oceandino/scripts/data/wash/ecommerce/dump-slots.py` + ALPHA-SLOT.md.
   */
  cutoutAlphaRatioThreshold: 0.02,
  artboardEdge: Object.freeze({ minimum: 64, maximum: 8_000 }),
  dpi: Object.freeze({ minimum: 72, maximum: 600, fallback: 96 }),
  maximumArtboards: 64,
  maximumSlots: 2_000,
  maximumFontFamilies: 8,
  paletteColors: Object.freeze({ minimum: 3, maximum: 16 }),
  maximumSlotTextLength: 800,
  /** `wash_slots.page` is 1-based in the live data; artboards follow it. */
  firstPage: 1,
});

/** Artboard size presets, reused from `design-document-schema.ts` verbatim. */
export const FABRIC_CARRIER_ARTBOARD_TIERS = Object.freeze([
  "square",
  "story",
  "wide",
  "poster",
  "card",
  "banner",
]);

export type FabricCarrierArtboardTier =
  (typeof FABRIC_CARRIER_ARTBOARD_TIERS)[number];

export interface FabricCarrierBbox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface FabricCarrierSlot {
  slot_key: string;
  kind: FabricCarrierSlotKind;
  bbox: FabricCarrierBbox;
  page: number;
  role_en?: string;
  role_zh?: string;
  style?: FabricCarrierSlotStyle;
  alpha_ratio?: number;
  locked: boolean;
  object_id: string;
  axis: FabricCarrierAxis;
  editable?: boolean;
  replaceable?: boolean;
  text?: string;
  font_ref?: string;
  asset_ref?: {
    asset_id?: string;
    original_key?: string;
    current_key?: string;
    preview_key?: string;
  };
}

export interface FabricCarrierArtboard {
  id: string;
  page: number;
  name?: string;
  tier?: FabricCarrierArtboardTier;
  width: number;
  height: number;
  background: string;
  fabric: { version?: string; objects: Record<string, unknown>[] };
}

export interface FabricCarrierFont {
  ref: string;
  family: string;
  license: (typeof FABRIC_CARRIER_FONT_LICENSES)[number];
  weights?: number[];
  asset_key?: string;
  source_url?: string;
}

export interface FabricCarrierSkin {
  id: string;
  name?: string;
  palette: string[];
  font_refs?: string[];
  decoration_object_ids?: string[];
}

export interface FabricCarrierDocument {
  schema: typeof FABRIC_CARRIER_SCHEMA_ID;
  version: 1;
  revision?: number;
  title: string;
  generator?: {
    name: string;
    version?: string;
    created_at?: string;
    source?: string;
  };
  doc: { units: "px"; dpi?: number; color_space: "sRGB" };
  artboards: FabricCarrierArtboard[];
  slots: FabricCarrierSlot[];
  skin?: FabricCarrierSkin;
  fonts: FabricCarrierFont[];
}

/** `W04-carrier.md` §1–§6, transcribed literally. */
export const FABRIC_CARRIER_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oceanleo.com/schemas/oceanleo.fabric-carrier.v1.json",
  title: FABRIC_CARRIER_SCHEMA_ID,
  type: "object",
  additionalProperties: false,
  required: ["schema", "version", "title", "doc", "artboards", "slots", "fonts"],
  properties: {
    schema: { const: FABRIC_CARRIER_SCHEMA_ID },
    version: { type: "integer", const: 1 },
    revision: { type: "integer", minimum: 0 },
    title: { type: "string", minLength: 1, maxLength: 300 },

    generator: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        version: { type: "string", maxLength: 40 },
        created_at: { type: "string", maxLength: 40 },
        source: { type: "string", maxLength: 120 },
      },
    },

    doc: {
      type: "object",
      additionalProperties: false,
      required: ["units", "color_space"],
      properties: {
        units: { const: "px" },
        dpi: { type: "integer", minimum: 72, maximum: 600, default: 96 },
        color_space: { const: "sRGB" },
      },
    },

    artboards: {
      type: "array",
      minItems: 1,
      maxItems: 64,
      items: { $ref: "#/$defs/artboard" },
    },

    slots: {
      type: "array",
      maxItems: 2000,
      items: { $ref: "#/$defs/slot" },
    },

    skin: { $ref: "#/$defs/skin" },

    fonts: {
      type: "array",
      maxItems: 8,
      items: { $ref: "#/$defs/font" },
    },
  },

  $defs: {
    color: {
      type: "string",
      pattern:
        "^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|transparent)$",
    },

    opaqueColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },

    identifier: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },

    slotKey: { type: "string", pattern: "^[a-z0-9_]{1,64}$" },

    reference: { type: "string", pattern: "^[a-z0-9-]{1,64}$" },

    bbox: {
      type: "object",
      additionalProperties: false,
      required: ["left", "top", "right", "bottom", "width", "height"],
      properties: {
        left: { type: "integer" },
        top: { type: "integer" },
        right: { type: "integer" },
        bottom: { type: "integer" },
        width: { type: "integer", minimum: 0 },
        height: { type: "integer", minimum: 0 },
      },
    },

    artboard: {
      type: "object",
      additionalProperties: false,
      required: ["id", "page", "width", "height", "background", "fabric"],
      properties: {
        id: { $ref: "#/$defs/identifier" },
        page: { type: "integer", minimum: 1 },
        name: { type: "string", maxLength: 120 },
        tier: { enum: [...FABRIC_CARRIER_ARTBOARD_TIERS] },
        width: { type: "integer", minimum: 64, maximum: 8000 },
        height: { type: "integer", minimum: 64, maximum: 8000 },
        background: { $ref: "#/$defs/color" },
        fabric: {
          type: "object",
          additionalProperties: false,
          required: ["objects"],
          properties: {
            version: { type: "string", maxLength: 20 },
            objects: { type: "array", maxItems: 2000, items: { type: "object" } },
          },
        },
      },
    },

    slot: {
      type: "object",
      additionalProperties: false,
      required: ["slot_key", "kind", "bbox", "page", "locked", "object_id", "axis"],
      properties: {
        slot_key: { $ref: "#/$defs/slotKey" },
        kind: { enum: [...FABRIC_CARRIER_SLOT_KINDS] },
        bbox: { $ref: "#/$defs/bbox" },
        page: { type: "integer", minimum: 1 },
        // Open vocabulary on purpose: `role_en` / `role_zh` are two independent
        // index axes describing *what is depicted*, not a translation pair, and
        // the live table already holds free-form values. Layout role belongs in
        // `slot_key` (carrier spec §3.3).
        role_en: { type: "string", maxLength: 64 },
        role_zh: { type: "string", maxLength: 64 },
        style: { enum: [...FABRIC_CARRIER_SLOT_STYLES] },
        alpha_ratio: { type: "number", minimum: 0, maximum: 1 },
        locked: { type: "boolean" },
        object_id: { type: "string", minLength: 1, maxLength: 64 },
        axis: { enum: [...FABRIC_CARRIER_AXES] },
        editable: { type: "boolean" },
        replaceable: { type: "boolean" },
        text: { type: "string", maxLength: 800 },
        font_ref: { $ref: "#/$defs/reference" },
        asset_ref: {
          type: "object",
          additionalProperties: false,
          properties: {
            asset_id: { type: "string", maxLength: 64 },
            original_key: { type: "string", maxLength: 400 },
            current_key: { type: "string", maxLength: 400 },
            preview_key: { type: "string", maxLength: 400 },
          },
        },
      },
    },

    skin: {
      type: "object",
      additionalProperties: false,
      required: ["id", "palette"],
      properties: {
        id: { $ref: "#/$defs/reference" },
        name: { type: "string", maxLength: 120 },
        palette: {
          type: "array",
          minItems: 3,
          maxItems: 16,
          items: { $ref: "#/$defs/opaqueColor" },
        },
        font_refs: {
          type: "array",
          maxItems: 8,
          items: { $ref: "#/$defs/reference" },
        },
        decoration_object_ids: {
          type: "array",
          maxItems: 2000,
          items: { type: "string", minLength: 1, maxLength: 64 },
        },
      },
    },

    font: {
      type: "object",
      additionalProperties: false,
      required: ["ref", "family", "license"],
      properties: {
        ref: { $ref: "#/$defs/reference" },
        family: { type: "string", minLength: 1, maxLength: 120 },
        license: { enum: [...FABRIC_CARRIER_FONT_LICENSES] },
        weights: {
          type: "array",
          maxItems: 12,
          items: { type: "integer", minimum: 100, maximum: 900 },
        },
        asset_key: { type: "string", maxLength: 400 },
        source_url: { type: "string", format: "uri" },
      },
    },
  },
} as const;

export type FabricCarrierViolation = CarrierSchemaViolation;

export type FabricCarrierValidation =
  | { ok: true; carrier: FabricCarrierDocument }
  | { ok: false; errors: FabricCarrierViolation[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Cross-field obligations the subset evaluator cannot express: bbox
 * self-consistency, uniqueness, and every reference resolving. Reported in the
 * same shape as schema violations so callers have one error channel.
 */
function semanticViolations(
  carrier: FabricCarrierDocument,
): FabricCarrierViolation[] {
  const out: FabricCarrierViolation[] = [];

  const pages = new Set<number>();
  const artboardIds = new Set<string>();
  const objectIdsByPage = new Map<number, Set<string>>();

  for (const [index, artboard] of carrier.artboards.entries()) {
    const path = `artboards[${index}]`;
    if (artboardIds.has(artboard.id)) {
      out.push({
        path,
        keyword: "unique",
        message: `duplicate artboard id ${artboard.id}`,
      });
    }
    artboardIds.add(artboard.id);
    if (pages.has(artboard.page)) {
      out.push({
        path,
        keyword: "unique",
        message: `duplicate page ${artboard.page}`,
      });
    }
    pages.add(artboard.page);

    const ids = new Set<string>();
    for (const object of artboard.fabric.objects) {
      const id = isRecord(object) ? object.oceanleoId : undefined;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
    objectIdsByPage.set(artboard.page, ids);
  }

  const fontRefs = new Set<string>();
  for (const [index, font] of carrier.fonts.entries()) {
    if (fontRefs.has(font.ref)) {
      out.push({
        path: `fonts[${index}]`,
        keyword: "unique",
        message: `duplicate font ref ${font.ref}`,
      });
    }
    fontRefs.add(font.ref);
  }

  const slotKeys = new Set<string>();
  for (const [index, slot] of carrier.slots.entries()) {
    const path = `slots[${index}]`;
    if (slotKeys.has(slot.slot_key)) {
      out.push({
        path,
        keyword: "unique",
        message: `duplicate slot_key ${slot.slot_key}`,
      });
    }
    slotKeys.add(slot.slot_key);

    const { left, top, right, bottom, width, height } = slot.bbox;
    if (width !== right - left) {
      out.push({
        path: `${path}.bbox`,
        keyword: "bbox-consistency",
        message: `width ${width} does not match right-left ${right - left}`,
      });
    }
    if (height !== bottom - top) {
      out.push({
        path: `${path}.bbox`,
        keyword: "bbox-consistency",
        message: `height ${height} does not match bottom-top ${bottom - top}`,
      });
    }

    if (!pages.has(slot.page)) {
      out.push({
        path,
        keyword: "reference",
        message: `page ${slot.page} has no artboard`,
      });
    } else if (!objectIdsByPage.get(slot.page)?.has(slot.object_id)) {
      out.push({
        path,
        keyword: "reference",
        message: `object_id ${slot.object_id} is absent from page ${slot.page}`,
      });
    }

    if (slot.font_ref !== undefined && !fontRefs.has(slot.font_ref)) {
      out.push({
        path,
        keyword: "reference",
        message: `font_ref ${slot.font_ref} is not declared in fonts`,
      });
    }

    // `alpha_ratio` is computed for pixel layers only on the pipeline side, so
    // carrying it on any other kind means the two sides disagree about what the
    // layer is.
    if (slot.alpha_ratio !== undefined && slot.kind !== "pixel") {
      out.push({
        path,
        keyword: "alpha-ratio-kind",
        message: `alpha_ratio is only meaningful for kind "pixel", got ${slot.kind}`,
      });
    }
  }

  for (const ref of carrier.skin?.font_refs ?? []) {
    if (!fontRefs.has(ref)) {
      out.push({
        path: "skin.font_refs",
        keyword: "reference",
        message: `font_ref ${ref} is not declared in fonts`,
      });
    }
  }

  return out;
}

export function validateFabricCarrier(value: unknown): FabricCarrierValidation {
  const errors = evaluateCarrierSchema(
    FABRIC_CARRIER_JSON_SCHEMA as unknown as Record<string, unknown>,
    value,
  );
  if (errors.length > 0) return { ok: false, errors };
  const carrier = value as FabricCarrierDocument;
  const semantic = semanticViolations(carrier);
  if (semantic.length > 0) return { ok: false, errors: semantic };
  return { ok: true, carrier };
}

/** A pixel slot is a cutout slot above the threshold (carrier spec §3.5). */
export function fabricCarrierSlotIsCutout(slot: FabricCarrierSlot): boolean {
  return (
    slot.kind === "pixel" &&
    slot.alpha_ratio !== undefined &&
    slot.alpha_ratio > FABRIC_CARRIER_CONSTANTS.cutoutAlphaRatioThreshold
  );
}

/**
 * Text is editable when the slot carries real text and its object is a Fabric
 * text object rather than a flattened bitmap — the "text is 100% editable"
 * criterion for the asset pipelines.
 */
export function fabricCarrierEditableTextSlots(
  carrier: FabricCarrierDocument,
): FabricCarrierSlot[] {
  const textObjectIds = new Set<string>();
  for (const artboard of carrier.artboards) {
    for (const object of artboard.fabric.objects) {
      if (!isRecord(object)) continue;
      const type = typeof object.type === "string" ? object.type : "";
      const id = typeof object.oceanleoId === "string" ? object.oceanleoId : "";
      if (id && (type === "textbox" || type === "i-text" || type === "text")) {
        textObjectIds.add(id);
      }
    }
  }
  return carrier.slots.filter(
    (slot) =>
      slot.kind === "text" &&
      typeof slot.text === "string" &&
      slot.text.length > 0 &&
      textObjectIds.has(slot.object_id) &&
      slot.editable !== false,
  );
}

function objectAxis(object: Record<string, unknown>): FabricCarrierAxis {
  return object.oceanleoAxis === "skin" ? "skin" : "structure";
}

const CARRIER_COLOR = new RegExp(FABRIC_CARRIER_JSON_SCHEMA.$defs.color.pattern);

/**
 * Legacy snapshots accept any string as `canvasBackground` (it is only sliced
 * to 100 chars on the way in), while the carrier restricts colours to hex or
 * `transparent`. Anything else becomes the editor's own default so that
 * upgrading a stored document can never produce an invalid carrier.
 */
function normalizeCarrierColor(value: string): string {
  return CARRIER_COLOR.test(value) ? value : "#ffffff";
}

/**
 * Deterministic digest of everything on one axis. Comparing digests before and
 * after an edit is how "reskin without touching structure" is demonstrated
 * without rendering anything (five-layer spec §7 criterion 7); §2 forbids
 * browser screenshots as acceptance evidence.
 */
function axisDigest(
  carrier: FabricCarrierDocument,
  axis: FabricCarrierAxis,
): string {
  const artboards = carrier.artboards.map((artboard) => ({
    id: artboard.id,
    page: artboard.page,
    width: artboard.width,
    height: artboard.height,
    objects: artboard.fabric.objects
      .filter((object) => isRecord(object) && objectAxis(object) === axis)
      .map((object) => JSON.stringify(object)),
  }));
  const slots = carrier.slots
    .filter((slot) => slot.axis === axis)
    .map((slot) => JSON.stringify(slot));
  const skin = axis === "skin" ? (carrier.skin ?? null) : null;
  return JSON.stringify({ artboards, slots, skin });
}

export function fabricCarrierStructureDigest(
  carrier: FabricCarrierDocument,
): string {
  return axisDigest(carrier, "structure");
}

export function fabricCarrierSkinDigest(
  carrier: FabricCarrierDocument,
): string {
  return axisDigest(carrier, "skin");
}

/** Deterministic serialization: schema key order, no incidental whitespace. */
export function serializeFabricCarrier(carrier: FabricCarrierDocument): string {
  const keys = Object.keys(FABRIC_CARRIER_JSON_SCHEMA.properties);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = (carrier as unknown as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return JSON.stringify(out);
}

export function parseFabricCarrier(text: string): FabricCarrierValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: "",
          keyword: "json",
          message: error instanceof Error ? error.message : "unparseable",
        },
      ],
    };
  }
  return validateFabricCarrier(parsed);
}

/**
 * Reads a legacy single-artboard `ImageEditorSnapshot` as a carrier document.
 *
 * Existing documents are opened read-only and converted on request (R7): the
 * snapshot has no slots, no skin and no version, so everything it does carry
 * lands on the structure axis and nothing is dropped. Objects without an
 * `oceanleoId` get one from their index, since slots reference objects by id.
 */
export function fabricCarrierFromImageSnapshot(
  snapshot: ImageEditorSnapshot,
  options: { title: string; page?: number } = { title: "未命名图片" },
): FabricCarrierDocument {
  const rawObjects = Array.isArray(
    (snapshot.json as { objects?: unknown }).objects,
  )
    ? ((snapshot.json as { objects: unknown[] }).objects as unknown[])
    : [];
  const objects = rawObjects.filter(isRecord).map((object, index) => ({
    ...object,
    oceanleoId:
      typeof object.oceanleoId === "string" && object.oceanleoId.length > 0
        ? object.oceanleoId
        : `legacy-${index}`,
    oceanleoAxis: objectAxis(object),
  }));
  const page = options.page ?? FABRIC_CARRIER_CONSTANTS.firstPage;
  return {
    schema: FABRIC_CARRIER_SCHEMA_ID,
    version: 1,
    title: options.title,
    generator: { name: "W04.image-snapshot-upgrade", source: "image-editor-v1" },
    doc: { units: "px", color_space: "sRGB" },
    artboards: [
      {
        id: `ab-${page}`,
        page,
        width: Math.round(snapshot.doc.width),
        height: Math.round(snapshot.doc.height),
        background: normalizeCarrierColor(snapshot.canvasBackground),
        fabric: { objects },
      },
    ],
    slots: [],
    fonts: [],
  };
}
