/**
 * `oceanleo.deck.v1` — the deck carrier JSON IR (spec §3.1), its generation
 * state machine (§3.6), and the byte floors / completeness predicates that
 * govern the 233 B hollow deck recorded in the supply contract §2.2
 * (spec §8.1 / §8.2).
 *
 * This is the `project_schema` side of the two byte shapes in §1.2. The other
 * side — the OOXML zip — is emitted by `deck-ooxml-package.ts`.
 */

import {
  DECK_CONSTANTS,
  DECK_DENSE_LAYOUTS,
  DECK_IR_LAYOUTS,
  deckLayoutDefinition,
  type DeckIrLayout,
} from "./deck-layout-grid";

export const DECK_IR_SCHEMA = "oceanleo.deck.v1";
export const DECK_IR_VERSION = 1;

/** §8.1 — IR byte floor (C43) and the A4 ceiling. */
export const DECK_IR_MIN_BYTES = DECK_CONSTANTS.C43;
export const DECK_IR_MAX_BYTES = 2_097_152;
/** §8.1 — pptx source floor (C41) and ceiling (C42). */
export const DECK_PPTX_MIN_BYTES = DECK_CONSTANTS.C41;
export const DECK_PPTX_MAX_BYTES = DECK_CONSTANTS.C42;

export type DeckIrChartType = "bar" | "line" | "pie" | "area" | "scatter";
export type DeckIrImageFit = "cover" | "contain";
export type DeckIrMediaType = "image/png" | "image/jpeg" | "image/webp";

export interface DeckIrTheme {
  accent: string;
  accent2?: string;
  accent3?: string;
  accent4?: string;
  accent5?: string;
  accent6?: string;
  fontMajor?: string;
  fontMinor?: string;
}

export interface DeckIrMaster {
  footerText?: string;
  showPageNumber?: boolean;
  logoAssetId?: string;
}

export interface DeckIrTable {
  header: string[];
  rows: string[][];
}

export interface DeckIrImage {
  assetId: string;
  alt: string;
  fit?: DeckIrImageFit;
  caption?: string;
}

export interface DeckIrSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface DeckIrChart {
  chartType: DeckIrChartType;
  categories: string[];
  series: DeckIrSeries[];
  axisLabel?: string;
  showDataLabels?: boolean;
}

export interface DeckIrKpi {
  value: string;
  label: string;
  unit?: string;
  delta?: string;
}

export interface DeckIrMilestone {
  at: string;
  label: string;
  detail?: string;
}

export interface DeckIrQuote {
  text: string;
  attribution: string;
}

export interface DeckIrSlide {
  layout: DeckIrLayout;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  left?: string[];
  right?: string[];
  body?: string;
  note?: string;
  table?: DeckIrTable;
  images?: DeckIrImage[];
  chart?: DeckIrChart;
  kpis?: DeckIrKpi[];
  milestones?: DeckIrMilestone[];
  quote?: DeckIrQuote;
}

export interface DeckIrAsset {
  id: string;
  sha256: string;
  mediaType: DeckIrMediaType;
  byteSize: number;
  width?: number;
  height?: number;
  licenseCode?: string;
}

export interface DeckIrAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
  assetId?: string;
}

export interface DeckIrAttribution {
  entries: DeckIrAttributionEntry[];
}

export interface DeckIrDocument {
  schema: typeof DECK_IR_SCHEMA;
  version: 1;
  title: string;
  theme: DeckIrTheme;
  master?: DeckIrMaster;
  slides: DeckIrSlide[];
  assets?: DeckIrAsset[];
  attribution: DeckIrAttribution;
}

export interface DeckIrValidationError {
  path: string;
  code: string;
  message: string;
}

export type DeckIrValidation =
  | { ok: true; project: DeckIrDocument; errors: [] }
  | { ok: false; project: null; errors: DeckIrValidationError[] };

/** §3.1 — the Draft 2020-12 document, kept verbatim for downstream tooling. */
export const DECK_IR_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oceanleo.com/schemas/oceanleo.deck.v1.json",
  title: DECK_IR_SCHEMA,
  type: "object",
  additionalProperties: false,
  required: ["schema", "version", "title", "theme", "slides", "attribution"],
  properties: {
    schema: { const: DECK_IR_SCHEMA },
    version: { type: "integer", const: 1 },
    title: { type: "string", minLength: 8, maxLength: 300 },
    theme: {
      type: "object",
      additionalProperties: false,
      required: ["accent"],
      properties: {
        accent: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
        accent2: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
        accent3: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
        accent4: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
        accent5: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
        accent6: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
        fontMajor: { type: "string", maxLength: 64 },
        fontMinor: { type: "string", maxLength: 64 },
      },
    },
    master: {
      type: "object",
      additionalProperties: false,
      properties: {
        footerText: { type: "string", maxLength: 120 },
        showPageNumber: { type: "boolean", default: true },
        logoAssetId: { type: "string", maxLength: 64 },
      },
    },
    slides: {
      type: "array",
      minItems: DECK_CONSTANTS.C17,
      maxItems: DECK_CONSTANTS.C18,
      items: { type: "object", required: ["layout"] },
    },
    assets: { type: "array", maxItems: DECK_CONSTANTS.C29 },
    attribution: {
      type: "object",
      additionalProperties: false,
      required: ["entries"],
      properties: {
        entries: { type: "array", minItems: 1, maxItems: 12 },
      },
    },
  },
} as const;

const SLIDE_KEYS = new Set([
  "layout",
  "title",
  "subtitle",
  "bullets",
  "left",
  "right",
  "body",
  "note",
  "table",
  "images",
  "chart",
  "kpis",
  "milestones",
  "quote",
]);
const THEME_KEYS = new Set([
  "accent",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "fontMajor",
  "fontMinor",
]);
const MASTER_KEYS = new Set(["footerText", "showPageNumber", "logoAssetId"]);
const ASSET_KEYS = new Set([
  "id",
  "sha256",
  "mediaType",
  "byteSize",
  "width",
  "height",
  "licenseCode",
]);
const ENTRY_KEYS = new Set(["text", "licenseCode", "licenseUrl", "assetId"]);
const MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const CHART_TYPES = new Set(["bar", "line", "pie", "area", "scatter"]);
const HEX6 = /^[0-9A-Fa-f]{6}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LAYOUT_SET = new Set<string>(DECK_IR_LAYOUTS);

class Collector {
  readonly errors: DeckIrValidationError[] = [];

  add(path: string, code: string, message: string): void {
    this.errors.push({ path, code, message });
  }

  object(path: string, value: unknown, allowed: Set<string>): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      this.add(path, "type", `${path} must be an object`);
      return null;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) {
        this.add(`${path}.${key}`, "additionalProperties", `${path} does not allow "${key}"`);
      }
    }
    return record;
  }

  string(
    path: string,
    value: unknown,
    { min = 0, max = Number.MAX_SAFE_INTEGER, pattern }: { min?: number; max?: number; pattern?: RegExp } = {},
  ): string | null {
    if (typeof value !== "string") {
      this.add(path, "type", `${path} must be a string`);
      return null;
    }
    if (value.length < min) {
      this.add(path, "minLength", `${path} must be at least ${min} characters`);
    }
    if (value.length > max) {
      this.add(path, "maxLength", `${path} must be at most ${max} characters`);
    }
    if (pattern && !pattern.test(value)) {
      this.add(path, "pattern", `${path} does not match ${pattern.source}`);
    }
    return value;
  }

  array(
    path: string,
    value: unknown,
    { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
  ): unknown[] | null {
    if (!Array.isArray(value)) {
      this.add(path, "type", `${path} must be an array`);
      return null;
    }
    if (value.length < min) {
      this.add(path, "minItems", `${path} must hold at least ${min} items`);
    }
    if (value.length > max) {
      this.add(path, "maxItems", `${path} must hold at most ${max} items`);
    }
    return value;
  }

  integer(path: string, value: unknown, min: number, max: number): void {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      this.add(path, "type", `${path} must be an integer`);
      return;
    }
    if (value < min || value > max) {
      this.add(path, "range", `${path} must be within [${min}, ${max}]`);
    }
  }
}

function validateStringArray(
  collector: Collector,
  path: string,
  value: unknown,
  bounds: { min?: number; max?: number; itemMax: number },
): void {
  const items = collector.array(path, value, { min: bounds.min, max: bounds.max });
  if (!items) return;
  items.forEach((item, index) => {
    collector.string(`${path}[${index}]`, item, { min: 1, max: bounds.itemMax });
  });
}

function validateTable(collector: Collector, path: string, value: unknown): void {
  const table = collector.object(path, value, new Set(["header", "rows"]));
  if (!table) return;
  validateStringArray(collector, `${path}.header`, table.header, {
    min: DECK_CONSTANTS.C20[0],
    max: DECK_CONSTANTS.C20[1],
    itemMax: 60,
  });
  const rows = collector.array(`${path}.rows`, table.rows, {
    min: DECK_CONSTANTS.C21[0],
    max: DECK_CONSTANTS.C21[1],
  });
  rows?.forEach((row, index) => {
    validateStringArray(collector, `${path}.rows[${index}]`, row, {
      min: DECK_CONSTANTS.C20[0],
      max: DECK_CONSTANTS.C20[1],
      itemMax: 80,
    });
  });
}

function validateImages(collector: Collector, path: string, value: unknown): void {
  const images = collector.array(path, value, { max: 6 });
  if (!images) return;
  images.forEach((entry, index) => {
    const item = collector.object(
      `${path}[${index}]`,
      entry,
      new Set(["assetId", "alt", "fit", "caption"]),
    );
    if (!item) return;
    collector.string(`${path}[${index}].assetId`, item.assetId, { min: 1, max: 64 });
    // §2.4 SC 1.1.1 / C40: alt text is the `p:cNvPr/@descr` source and must
    // never be blank, so the floor is 4 characters, not 1.
    collector.string(`${path}[${index}].alt`, item.alt, {
      min: DECK_CONSTANTS.C40,
      max: 300,
    });
    if (item.fit !== undefined && item.fit !== "cover" && item.fit !== "contain") {
      collector.add(`${path}[${index}].fit`, "enum", "fit must be cover or contain");
    }
    if (item.caption !== undefined) {
      collector.string(`${path}[${index}].caption`, item.caption, { max: 200 });
    }
  });
}

function validateChart(collector: Collector, path: string, value: unknown): void {
  const chart = collector.object(
    path,
    value,
    new Set(["chartType", "categories", "series", "axisLabel", "showDataLabels"]),
  );
  if (!chart) return;
  if (typeof chart.chartType !== "string" || !CHART_TYPES.has(chart.chartType)) {
    collector.add(`${path}.chartType`, "enum", "chartType is outside the §3.1 enum");
  }
  validateStringArray(collector, `${path}.categories`, chart.categories, {
    min: DECK_CONSTANTS.C23[0],
    max: DECK_CONSTANTS.C23[1],
    itemMax: 40,
  });
  const categoryCount = Array.isArray(chart.categories) ? chart.categories.length : 0;
  const series = collector.array(`${path}.series`, chart.series, {
    min: DECK_CONSTANTS.C22[0],
    max: DECK_CONSTANTS.C22[1],
  });
  series?.forEach((entry, index) => {
    const item = collector.object(
      `${path}.series[${index}]`,
      entry,
      new Set(["name", "values", "color"]),
    );
    if (!item) return;
    collector.string(`${path}.series[${index}].name`, item.name, { min: 1, max: 60 });
    const values = collector.array(`${path}.series[${index}].values`, item.values, {
      min: DECK_CONSTANTS.C23[0],
      max: DECK_CONSTANTS.C23[1],
    });
    values?.forEach((point, pointIndex) => {
      if (typeof point !== "number" || !Number.isFinite(point)) {
        collector.add(
          `${path}.series[${index}].values[${pointIndex}]`,
          "type",
          "chart values must be finite numbers",
        );
      }
    });
    // §3.4: the OOXML cache is written point-for-point against the categories,
    // so a ragged series would emit a cache that disagrees with `c:cat`.
    if (values && categoryCount > 0 && values.length !== categoryCount) {
      collector.add(
        `${path}.series[${index}].values`,
        "cache-arity",
        "series values must match the category count so c:numCache stays complete",
      );
    }
    if (item.color !== undefined) {
      collector.string(`${path}.series[${index}].color`, item.color, { pattern: HEX6 });
    }
  });
  if (chart.axisLabel !== undefined) {
    collector.string(`${path}.axisLabel`, chart.axisLabel, { max: 60 });
  }
  if (chart.showDataLabels !== undefined && typeof chart.showDataLabels !== "boolean") {
    collector.add(`${path}.showDataLabels`, "type", "showDataLabels must be a boolean");
  }
  // §2.4 last bullet: ≥ 3 series may not be told apart by colour alone.
  if (Array.isArray(chart.series) && chart.series.length >= 3 && chart.showDataLabels !== true) {
    collector.add(
      `${path}.showDataLabels`,
      "wcag-1.4.1",
      "charts with 3 or more series must carry data labels, not colour alone",
    );
  }
}

function validateKpis(collector: Collector, path: string, value: unknown): void {
  const kpis = collector.array(path, value, {
    min: DECK_CONSTANTS.C24[0],
    max: DECK_CONSTANTS.C24[1],
  });
  kpis?.forEach((entry, index) => {
    const item = collector.object(
      `${path}[${index}]`,
      entry,
      new Set(["value", "label", "unit", "delta"]),
    );
    if (!item) return;
    collector.string(`${path}[${index}].value`, item.value, { min: 1, max: 16 });
    collector.string(`${path}[${index}].label`, item.label, { min: 1, max: 60 });
    if (item.unit !== undefined) collector.string(`${path}[${index}].unit`, item.unit, { max: 12 });
    if (item.delta !== undefined) collector.string(`${path}[${index}].delta`, item.delta, { max: 16 });
  });
}

function validateMilestones(collector: Collector, path: string, value: unknown): void {
  const milestones = collector.array(path, value, {
    min: DECK_CONSTANTS.C25[0],
    max: DECK_CONSTANTS.C25[1],
  });
  milestones?.forEach((entry, index) => {
    const item = collector.object(
      `${path}[${index}]`,
      entry,
      new Set(["at", "label", "detail"]),
    );
    if (!item) return;
    collector.string(`${path}[${index}].at`, item.at, { min: 1, max: 24 });
    collector.string(`${path}[${index}].label`, item.label, { min: 1, max: 80 });
    if (item.detail !== undefined) {
      collector.string(`${path}[${index}].detail`, item.detail, { max: 160 });
    }
  });
}

function validateQuote(collector: Collector, path: string, value: unknown): void {
  const quote = collector.object(path, value, new Set(["text", "attribution"]));
  if (!quote) return;
  collector.string(`${path}.text`, quote.text, { min: 8, max: 400 });
  collector.string(`${path}.attribution`, quote.attribution, { min: 2, max: 120 });
}

function validateSlide(collector: Collector, path: string, value: unknown): void {
  const slide = collector.object(path, value, SLIDE_KEYS);
  if (!slide) return;
  const layout = slide.layout;
  if (typeof layout !== "string" || !LAYOUT_SET.has(layout)) {
    collector.add(`${path}.layout`, "enum", `layout must be one of the ${DECK_IR_LAYOUTS.length} §4 grammars`);
    return;
  }
  if (slide.title !== undefined) collector.string(`${path}.title`, slide.title, { max: 200 });
  if (slide.subtitle !== undefined) collector.string(`${path}.subtitle`, slide.subtitle, { max: 300 });
  if (slide.body !== undefined) collector.string(`${path}.body`, slide.body, { max: 900 });
  if (slide.note !== undefined) collector.string(`${path}.note`, slide.note, { max: 300 });
  if (slide.bullets !== undefined) {
    validateStringArray(collector, `${path}.bullets`, slide.bullets, {
      max: DECK_CONSTANTS.C19,
      itemMax: 220,
    });
  }
  if (slide.left !== undefined) {
    validateStringArray(collector, `${path}.left`, slide.left, { max: 7, itemMax: 200 });
  }
  if (slide.right !== undefined) {
    validateStringArray(collector, `${path}.right`, slide.right, { max: 7, itemMax: 200 });
  }
  if (slide.table !== undefined) validateTable(collector, `${path}.table`, slide.table);
  if (slide.images !== undefined) validateImages(collector, `${path}.images`, slide.images);
  if (slide.chart !== undefined) validateChart(collector, `${path}.chart`, slide.chart);
  if (slide.kpis !== undefined) validateKpis(collector, `${path}.kpis`, slide.kpis);
  if (slide.milestones !== undefined) {
    validateMilestones(collector, `${path}.milestones`, slide.milestones);
  }
  if (slide.quote !== undefined) validateQuote(collector, `${path}.quote`, slide.quote);

  // §3.1 `allOf` — the layout-conditional required fields, plus the §4 arity
  // notes that the JSON Schema cannot express.
  const definition = deckLayoutDefinition(layout as DeckIrLayout);
  for (const field of definition.required) {
    if (slide[field] === undefined) {
      collector.add(`${path}.${field}`, "required", `layout "${layout}" requires "${field}"`);
    }
  }
  const images = Array.isArray(slide.images) ? slide.images : [];
  if (
    (layout === "image-full" ||
      layout === "image-left" ||
      layout === "image-right" ||
      layout === "mixed-triptych") &&
    images.length !== 1
  ) {
    collector.add(`${path}.images`, "arity", `layout "${layout}" takes exactly 1 image`);
  }
  if (
    layout === "image-grid" &&
    (images.length < DECK_CONSTANTS.C26[0] || images.length > DECK_CONSTANTS.C26[1])
  ) {
    collector.add(`${path}.images`, "arity", "image-grid takes 3 to 6 images");
  }
  if (layout === "quote" && images.length > 1) {
    collector.add(`${path}.images`, "arity", "quote takes at most 1 background image");
  }
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  if (
    (layout === "image-left" || layout === "image-right" || layout === "chart-with-notes") &&
    bullets.length > 5
  ) {
    collector.add(`${path}.bullets`, "arity", `layout "${layout}" takes at most 5 bullets`);
  }
  if (layout === "mixed-triptych" && bullets.length > 4) {
    collector.add(`${path}.bullets`, "arity", "mixed-triptych takes at most 4 bullets");
  }
  if (layout === "comparison") {
    for (const side of ["left", "right"] as const) {
      const column = Array.isArray(slide[side]) ? (slide[side] as unknown[]) : [];
      if (column.length > 6) {
        collector.add(`${path}.${side}`, "arity", "comparison takes at most 6 items per side");
      }
    }
  }
}

function validateAssets(collector: Collector, value: unknown): void {
  const assets = collector.array("assets", value, { max: DECK_CONSTANTS.C29 });
  assets?.forEach((entry, index) => {
    const item = collector.object(`assets[${index}]`, entry, ASSET_KEYS);
    if (!item) return;
    collector.string(`assets[${index}].id`, item.id, { min: 1, max: 64 });
    collector.string(`assets[${index}].sha256`, item.sha256, { pattern: SHA256 });
    if (typeof item.mediaType !== "string" || !MEDIA_TYPES.has(item.mediaType)) {
      collector.add(`assets[${index}].mediaType`, "enum", "mediaType is outside the §3.1 enum");
    }
    collector.integer(
      `assets[${index}].byteSize`,
      item.byteSize,
      DECK_CONSTANTS.C27[0],
      DECK_CONSTANTS.C27[1],
    );
    for (const side of ["width", "height"] as const) {
      if (item[side] !== undefined) {
        collector.integer(
          `assets[${index}].${side}`,
          item[side],
          DECK_CONSTANTS.C28[0],
          DECK_CONSTANTS.C28[1],
        );
      }
    }
    if (item.licenseCode !== undefined) {
      collector.string(`assets[${index}].licenseCode`, item.licenseCode, { min: 2, max: 60 });
    }
  });
}

function validateAttribution(collector: Collector, value: unknown): void {
  const attribution = collector.object("attribution", value, new Set(["entries"]));
  if (!attribution) return;
  const entries = collector.array("attribution.entries", attribution.entries, {
    min: 1,
    max: 12,
  });
  entries?.forEach((entry, index) => {
    const item = collector.object(`attribution.entries[${index}]`, entry, ENTRY_KEYS);
    if (!item) return;
    collector.string(`attribution.entries[${index}].text`, item.text, { min: 2, max: 200 });
    collector.string(`attribution.entries[${index}].licenseCode`, item.licenseCode, {
      min: 2,
      max: 60,
    });
    collector.string(`attribution.entries[${index}].licenseUrl`, item.licenseUrl, {
      pattern: /^https:\/\/\S+$/,
    });
    if (item.assetId !== undefined) {
      collector.string(`attribution.entries[${index}].assetId`, item.assetId, { max: 64 });
    }
  });
}

/** §3.1 — full Draft 2020-12 validation of an `oceanleo.deck.v1` document. */
export function validateDeckIr(value: unknown): DeckIrValidation {
  const collector = new Collector();
  const root = collector.object(
    "$",
    value,
    new Set(["schema", "version", "title", "theme", "master", "slides", "assets", "attribution"]),
  );
  if (!root) {
    return { ok: false, project: null, errors: collector.errors };
  }
  if (root.schema !== DECK_IR_SCHEMA) {
    collector.add("schema", "const", `schema must be "${DECK_IR_SCHEMA}"`);
  }
  if (root.version !== DECK_IR_VERSION) {
    collector.add("version", "const", "version must be 1");
  }
  collector.string("title", root.title, { min: 8, max: 300 });

  const theme = collector.object("theme", root.theme, THEME_KEYS);
  if (theme) {
    collector.string("theme.accent", theme.accent, { pattern: HEX6 });
    for (const slot of ["accent2", "accent3", "accent4", "accent5", "accent6"] as const) {
      if (theme[slot] !== undefined) {
        collector.string(`theme.${slot}`, theme[slot], { pattern: HEX6 });
      }
    }
    for (const slot of ["fontMajor", "fontMinor"] as const) {
      if (theme[slot] !== undefined) {
        collector.string(`theme.${slot}`, theme[slot], { max: 64 });
      }
    }
  }

  if (root.master !== undefined) {
    const master = collector.object("master", root.master, MASTER_KEYS);
    if (master) {
      if (master.footerText !== undefined) {
        collector.string("master.footerText", master.footerText, { max: 120 });
      }
      if (master.logoAssetId !== undefined) {
        collector.string("master.logoAssetId", master.logoAssetId, { max: 64 });
      }
      if (master.showPageNumber !== undefined && typeof master.showPageNumber !== "boolean") {
        collector.add("master.showPageNumber", "type", "showPageNumber must be a boolean");
      }
    }
  }

  const slides = collector.array("slides", root.slides, {
    min: DECK_CONSTANTS.C17,
    max: DECK_CONSTANTS.C18,
  });
  slides?.forEach((slide, index) => validateSlide(collector, `slides[${index}]`, slide));

  if (root.assets !== undefined) validateAssets(collector, root.assets);
  validateAttribution(collector, root.attribution);

  // Referential integrity: every `slides[].images[].assetId` must resolve.
  const declared = new Set(
    (Array.isArray(root.assets) ? root.assets : [])
      .map((asset) => (asset && typeof asset === "object" ? (asset as DeckIrAsset).id : ""))
      .filter(Boolean),
  );
  (Array.isArray(root.slides) ? root.slides : []).forEach((slide, slideIndex) => {
    const images = (slide as DeckIrSlide | undefined)?.images;
    if (!Array.isArray(images)) return;
    images.forEach((image, imageIndex) => {
      if (image?.assetId && !declared.has(image.assetId)) {
        collector.add(
          `slides[${slideIndex}].images[${imageIndex}].assetId`,
          "unresolved-asset",
          `assetId "${image.assetId}" is not declared in assets[]`,
        );
      }
    });
  });

  if (collector.errors.length > 0) {
    return { ok: false, project: null, errors: collector.errors };
  }
  return { ok: true, project: value as DeckIrDocument, errors: [] };
}

const TOP_LEVEL_ORDER: readonly (keyof DeckIrDocument)[] = [
  "schema",
  "version",
  "title",
  "theme",
  "master",
  "slides",
  "assets",
  "attribution",
];

/** Deterministic serialization: fixed key order, two-space indent, trailing LF. */
export function serializeDeckIr(project: DeckIrDocument): string {
  const ordered: Record<string, unknown> = {};
  for (const key of TOP_LEVEL_ORDER) {
    if (project[key] !== undefined) ordered[key] = project[key];
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export class DeckIrParseError extends Error {
  readonly code: string;
  readonly errors: DeckIrValidationError[];

  constructor(code: string, message: string, errors: DeckIrValidationError[] = []) {
    super(message);
    this.name = "DeckIrParseError";
    this.code = code;
    this.errors = errors;
  }
}

/** §1.2 / §7 F1 — parse the JSON IR byte shape with controlled failures. */
export function parseDeckIr(input: string | Uint8Array): DeckIrDocument {
  const text =
    typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new DeckIrParseError(
      "deck-ir-unparsable",
      `oceanleo.deck.v1 bytes are not JSON: ${(error as Error).message}`,
    );
  }
  const validation = validateDeckIr(parsed);
  if (!validation.ok) {
    throw new DeckIrParseError(
      "deck-ir-invalid",
      `oceanleo.deck.v1 failed §3.1 validation with ${validation.errors.length} error(s)`,
      validation.errors,
    );
  }
  return validation.project;
}

/** §8.2 — the whole-document text budget, used by the ≥ 100 character floor. */
export function deckIrTextCharacters(project: DeckIrDocument): number {
  let total = project.title.length;
  for (const slide of project.slides) {
    total += (slide.title || "").length;
    total += (slide.subtitle || "").length;
    total += (slide.body || "").length;
    total += (slide.note || "").length;
    for (const list of [slide.bullets, slide.left, slide.right]) {
      for (const item of list || []) total += item.length;
    }
    for (const cell of slide.table?.header || []) total += cell.length;
    for (const row of slide.table?.rows || []) {
      for (const cell of row) total += cell.length;
    }
    for (const image of slide.images || []) total += (image.caption || "").length;
    for (const kpi of slide.kpis || []) total += kpi.value.length + kpi.label.length;
    for (const milestone of slide.milestones || []) {
      total += milestone.at.length + milestone.label.length + (milestone.detail || "").length;
    }
    if (slide.quote) total += slide.quote.text.length + slide.quote.attribution.length;
  }
  return total;
}

export interface DeckIrCompleteness {
  ok: boolean;
  code: "deck-hollow" | null;
  failures: string[];
  slideCount: number;
  textCharacters: number;
  distinctLayouts: number;
  denseSlides: number;
  imageCount: number;
  chartCount: number;
  irBytes: number;
}

/**
 * §8.2 — the completeness predicates that must all hold. The IR-side subset is
 * judged here; the package-side counts (`slideMaster` = 1, `slideLayout` = 16,
 * `theme1.xml` = 1, shapes per page) are judged in `deck-ooxml-package.ts`.
 */
export function deckIrCompleteness(project: DeckIrDocument): DeckIrCompleteness {
  const failures: string[] = [];
  const slideCount = project.slides.length;
  const textCharacters = deckIrTextCharacters(project);
  const layouts = new Set(project.slides.map((slide) => slide.layout));
  const denseSlides = project.slides.filter((slide) =>
    DECK_DENSE_LAYOUTS.includes(slide.layout),
  ).length;
  const imageCount = project.slides.reduce(
    (total, slide) => total + (slide.images?.length || 0),
    0,
  );
  const chartCount = project.slides.filter((slide) => slide.chart).length;
  const irBytes = new TextEncoder().encode(serializeDeckIr(project)).length;

  if (slideCount < DECK_CONSTANTS.C17) failures.push(`slides ${slideCount} < 6`);
  if (textCharacters < DECK_CONSTANTS.C44) {
    failures.push(`textCharacters ${textCharacters} < ${DECK_CONSTANTS.C44}`);
  }
  if (layouts.size < 5) failures.push(`distinct layouts ${layouts.size} < 5`);
  if (denseSlides < 1) {
    failures.push("no mixed-triptych or chart-with-notes slide");
  }
  if (imageCount < 3) failures.push(`p:pic sources ${imageCount} < 3`);
  if (chartCount < 1) failures.push(`chart parts ${chartCount} < 1`);
  if (project.title.length < 8) failures.push(`title ${project.title.length} < 8 characters`);
  if (irBytes < DECK_IR_MIN_BYTES) failures.push(`IR bytes ${irBytes} < ${DECK_IR_MIN_BYTES}`);
  if (irBytes > DECK_IR_MAX_BYTES) failures.push(`IR bytes ${irBytes} > ${DECK_IR_MAX_BYTES}`);

  return {
    ok: failures.length === 0,
    code: failures.length === 0 ? null : "deck-hollow",
    failures,
    slideCount,
    textCharacters,
    distinctLayouts: layouts.size,
    denseSlides,
    imageCount,
    chartCount,
    irBytes,
  };
}

export type DeckGenerationState =
  | "empty"
  | "ir-validated"
  | "assets-resolved"
  | "parts-emitted"
  | "zipped"
  | "ready"
  | "invalid"
  | "degraded";

export type DeckGenerationEvent =
  | "validate-ir"
  | "reject-ir"
  | "resolve-assets"
  | "miss-assets"
  | "emit-parts"
  | "zip"
  | "accept-bytes"
  | "reject-bytes"
  | "downgrade-layout";

/** §3.6 — the only legal transitions. Anything else is a MUST NOT. */
const DECK_TRANSITIONS: Readonly<
  Record<DeckGenerationState, Partial<Record<DeckGenerationEvent, DeckGenerationState>>>
> = {
  empty: { "validate-ir": "ir-validated", "reject-ir": "invalid" },
  "ir-validated": { "resolve-assets": "assets-resolved", "miss-assets": "degraded" },
  // §3.6 MUST NOT `degraded → ready`: a missing picture is repaired or the page
  // is downgraded to a picture-free grammar before it can go on.
  degraded: { "downgrade-layout": "ir-validated" },
  "assets-resolved": { "emit-parts": "parts-emitted" },
  "parts-emitted": { zip: "zipped" },
  zipped: { "accept-bytes": "ready", "reject-bytes": "invalid" },
  ready: {},
  invalid: {},
};

export class DeckGenerationTransitionError extends Error {
  readonly code = "deck-illegal-transition";
  readonly from: DeckGenerationState;
  readonly event: DeckGenerationEvent;

  constructor(from: DeckGenerationState, event: DeckGenerationEvent) {
    super(`deck generation cannot take "${event}" from "${from}" (§3.6)`);
    this.name = "DeckGenerationTransitionError";
    this.from = from;
    this.event = event;
  }
}

export function advanceDeckGeneration(
  state: DeckGenerationState,
  event: DeckGenerationEvent,
): DeckGenerationState {
  const next = DECK_TRANSITIONS[state][event];
  if (!next) throw new DeckGenerationTransitionError(state, event);
  return next;
}

export function deckGenerationTransitionAllowed(
  from: DeckGenerationState,
  to: DeckGenerationState,
): boolean {
  return Object.values(DECK_TRANSITIONS[from]).includes(to);
}
