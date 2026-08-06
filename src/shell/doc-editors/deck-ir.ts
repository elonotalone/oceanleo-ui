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
  /**
   * The `a:ea` face. Until 2026-08-06 this was hard-coded to Microsoft YaHei
   * with no way for the caller to say otherwise, which made every CJK deck
   * look the same regardless of what the author asked for.
   */
  fontEastAsian?: string;
  /**
   * Multiplies the whole §2.3 size ladder. 1 keeps the shipped ladder, which
   * is what every existing document gets.
   */
  fontScale?: number;
}

export interface DeckIrMaster {
  footerText?: string;
  showPageNumber?: boolean;
  logoAssetId?: string;
  /** Draw the visible credit line on the last slide. Defaults to true. */
  creditsBar?: boolean;
}

/**
 * The three supply keys. They travel into `docProps/custom.xml` so a consumer
 * that keeps only the file still knows what it is allowed to do with it.
 */
export interface DeckIrLicense {
  usage_scope?: string;
  license_family?: string;
  supply_tier?: string;
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
  /**
   * `image-grid` column count. Absent keeps the shipped 3-across grid; the
   * writer used to offer no way to ask for anything else.
   */
  gridColumns?: number;
  /**
   * `image-full` / `quote` scrim opacity in percent. Absent keeps the shipped
   * 60 %, which is what SC 1.4.3 needs over an arbitrary photograph — but a
   * caller who has a dark photo already may legitimately want less.
   */
  scrimAlpha?: number;
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
  license?: DeckIrLicense;
}

export interface DeckIrValidationError {
  path: string;
  code: string;
  message: string;
}

/**
 * A finding that does not stop the bytes. It says what was measured and what
 * the caller can do about it; deciding whether it matters is the caller's job,
 * not this module's.
 */
export interface DeckIrAdvisory extends DeckIrValidationError {
  /** Plain-language sentence naming the reading and the repair. */
  advice: string;
}

export type DeckIrValidation =
  | { ok: true; project: DeckIrDocument; errors: []; advisories: DeckIrAdvisory[] }
  | { ok: false; project: null; errors: DeckIrValidationError[]; advisories: DeckIrAdvisory[] };

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
        fontEastAsian: { type: "string", maxLength: 64 },
        fontScale: { type: "number", minimum: 0.5, maximum: 2, default: 1 },
      },
    },
    master: {
      type: "object",
      additionalProperties: false,
      properties: {
        footerText: { type: "string", maxLength: 120 },
        showPageNumber: { type: "boolean", default: true },
        creditsBar: { type: "boolean", default: true },
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
    license: {
      type: "object",
      additionalProperties: false,
      properties: {
        usage_scope: { type: "string", minLength: 1, maxLength: 120 },
        license_family: { type: "string", minLength: 1, maxLength: 120 },
        supply_tier: { type: "string", minLength: 1, maxLength: 120 },
      },
    },
  },
} as const;

const SLIDE_KEYS = new Set([
  "layout",
  "gridColumns",
  "scrimAlpha",
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
  "fontEastAsian",
  "fontScale",
]);
const MASTER_KEYS = new Set(["footerText", "showPageNumber", "creditsBar", "logoAssetId"]);
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

/**
 * Two buckets, and the line between them is not strictness — it is who decides.
 *
 * `add()` is for input the writer cannot turn into a file that opens: a wrong
 * type, an unknown layout, a chart cache that would disagree with its own
 * categories. Refusing is the only honest answer, so it refuses, by name.
 *
 * `soft()` is for everything an author could reasonably have meant: six bullets
 * instead of five, a short title, a page with no picture. Those are taste, and
 * taste belongs to whoever wrote the deck. They come back as a measurement plus
 * a sentence saying what to do, and the bytes are produced either way.
 */
class Collector {
  readonly errors: DeckIrValidationError[] = [];
  readonly advisories: DeckIrAdvisory[] = [];

  add(path: string, code: string, message: string): void {
    this.errors.push({ path, code, message });
  }

  soft(path: string, code: string, message: string, advice: string): void {
    this.advisories.push({ path, code, message, advice });
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
    {
      min = 0,
      max = Number.MAX_SAFE_INTEGER,
      pattern,
      soft = false,
      advice,
    }: {
      min?: number;
      max?: number;
      pattern?: RegExp;
      soft?: boolean;
      advice?: string;
    } = {},
  ): string | null {
    if (typeof value !== "string") {
      this.add(path, "type", `${path} must be a string`);
      return null;
    }
    const report = (code: string, message: string) => {
      if (soft) this.soft(path, code, message, advice || message);
      else this.add(path, code, message);
    };
    if (value.length < min) {
      report("minLength", `${path} is ${value.length} characters, below the ${min} the grammar expects`);
    }
    if (value.length > max) {
      report("maxLength", `${path} is ${value.length} characters, over the ${max} the box was drawn for`);
    }
    if (pattern && !pattern.test(value)) {
      report("pattern", `${path} does not match ${pattern.source}`);
    }
    return value;
  }

  array(
    path: string,
    value: unknown,
    {
      min = 0,
      max = Number.MAX_SAFE_INTEGER,
      soft = false,
      advice,
    }: { min?: number; max?: number; soft?: boolean; advice?: string } = {},
  ): unknown[] | null {
    if (!Array.isArray(value)) {
      this.add(path, "type", `${path} must be an array`);
      return null;
    }
    const report = (code: string, message: string) => {
      if (soft) this.soft(path, code, message, advice || message);
      else this.add(path, code, message);
    };
    if (value.length < min) {
      report("minItems", `${path} holds ${value.length} items, below the ${min} the grammar expects`);
    }
    if (value.length > max) {
      report("maxItems", `${path} holds ${value.length} items, over the ${max} the box was drawn for`);
    }
    return value;
  }

  integer(
    path: string,
    value: unknown,
    min: number,
    max: number,
    options: { soft?: boolean; advice?: string } = {},
  ): void {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      this.add(path, "type", `${path} must be an integer`);
      return;
    }
    if (value < min || value > max) {
      const message = `${path} is ${value}, outside [${min}, ${max}]`;
      if (options.soft) this.soft(path, "range", message, options.advice || message);
      else this.add(path, "range", message);
    }
  }
}

/** Every string/array length in the §4 grammars is a drawn box, not a rule. */
const FITS_THE_BOX = {
  soft: true,
  advice: "the text still ships; it may overflow the box the grammar drew, so shorten it or move to a roomier layout",
} as const;

function validateStringArray(
  collector: Collector,
  path: string,
  value: unknown,
  bounds: { min?: number; max?: number; itemMax: number },
): void {
  const items = collector.array(path, value, {
    min: bounds.min,
    max: bounds.max,
    ...FITS_THE_BOX,
  });
  if (!items) return;
  items.forEach((item, index) => {
    collector.string(`${path}[${index}]`, item, {
      min: 1,
      max: bounds.itemMax,
      ...FITS_THE_BOX,
    });
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
    soft: true,
    advice:
      "the table still ships; past 12 rows the rows run off the bottom of the body box, so split the table across two pages",
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
  const images = collector.array(path, value, {
    max: 6,
    soft: true,
    advice: "images past the sixth have nowhere to land in any grammar and will not appear in the file",
  });
  if (!images) return;
  images.forEach((entry, index) => {
    const item = collector.object(
      `${path}[${index}]`,
      entry,
      new Set(["assetId", "alt", "fit", "caption"]),
    );
    if (!item) return;
    collector.string(`${path}[${index}].assetId`, item.assetId, { min: 1, max: 64 });
    // §2.4 SC 1.1.1 / C40: alt text is the `p:cNvPr/@descr` source. A blank one
    // is a real accessibility loss but it still produces a file that opens, so
    // it is reported rather than refused.
    collector.string(`${path}[${index}].alt`, item.alt, {
      min: DECK_CONSTANTS.C40,
      max: 300,
      soft: true,
      advice:
        "alt text becomes p:cNvPr/@descr, which is the only thing a screen reader can say about this picture; a blank one leaves the picture unannounced",
    });
    if (item.fit !== undefined && item.fit !== "cover" && item.fit !== "contain") {
      collector.soft(
        `${path}[${index}].fit`,
        "enum",
        `fit is ${JSON.stringify(item.fit)}, which is neither "cover" nor "contain"`,
        'the picture is placed as "cover"; say "contain" if the whole frame must stay visible',
      );
    }
    if (item.caption !== undefined) {
      collector.string(`${path}[${index}].caption`, item.caption, {
        max: 200,
        ...FITS_THE_BOX,
      });
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
    soft: true,
    advice: "the chart still ships; past six series the palette starts repeating colours",
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
      collector.string(`${path}.series[${index}].color`, item.color, {
        pattern: HEX6,
        soft: true,
        advice: "the series falls back to its palette colour; give six hex digits to pick your own",
      });
    }
  });
  if (chart.axisLabel !== undefined) {
    collector.string(`${path}.axisLabel`, chart.axisLabel, { max: 60, ...FITS_THE_BOX });
  }
  if (chart.showDataLabels !== undefined && typeof chart.showDataLabels !== "boolean") {
    collector.add(`${path}.showDataLabels`, "type", "showDataLabels must be a boolean");
  }
  // §2.4 last bullet. This used to refuse the whole document. It is a real
  // accessibility finding — three series told apart by colour alone are
  // unreadable to a colour-blind viewer — but it is not a broken file, and the
  // author may already be distinguishing the series some other way. So it is
  // measured and said out loud, and `showDataLabels: false` is now obeyed.
  if (Array.isArray(chart.series) && chart.series.length >= 3 && chart.showDataLabels !== true) {
    collector.soft(
      `${path}.showDataLabels`,
      "wcag-1.4.1",
      `${chart.series.length} series and showDataLabels is ${JSON.stringify(chart.showDataLabels ?? null)}`,
      "with three or more series, colour alone does not separate them for a colour-blind reader; set showDataLabels to true, or keep it off deliberately if the categories already carry the distinction",
    );
  }
}

function validateKpis(collector: Collector, path: string, value: unknown): void {
  const kpis = collector.array(path, value, {
    min: DECK_CONSTANTS.C24[0],
    max: DECK_CONSTANTS.C24[1],
    soft: true,
    advice: "kpi-row draws cards for two to four figures; extras have no card and will not appear",
  });
  kpis?.forEach((entry, index) => {
    const item = collector.object(
      `${path}[${index}]`,
      entry,
      new Set(["value", "label", "unit", "delta"]),
    );
    if (!item) return;
    collector.string(`${path}[${index}].value`, item.value, { min: 1, max: 16, ...FITS_THE_BOX });
    collector.string(`${path}[${index}].label`, item.label, { min: 1, max: 60, ...FITS_THE_BOX });
    if (item.unit !== undefined) {
      collector.string(`${path}[${index}].unit`, item.unit, { max: 12, ...FITS_THE_BOX });
    }
    if (item.delta !== undefined) {
      collector.string(`${path}[${index}].delta`, item.delta, { max: 16, ...FITS_THE_BOX });
    }
  });
}

function validateMilestones(collector: Collector, path: string, value: unknown): void {
  const milestones = collector.array(path, value, {
    min: DECK_CONSTANTS.C25[0],
    max: DECK_CONSTANTS.C25[1],
    soft: true,
    advice: "the timeline axis spreads three to six dots; extras have no dot and will not appear",
  });
  milestones?.forEach((entry, index) => {
    const item = collector.object(
      `${path}[${index}]`,
      entry,
      new Set(["at", "label", "detail"]),
    );
    if (!item) return;
    collector.string(`${path}[${index}].at`, item.at, { min: 1, max: 24, ...FITS_THE_BOX });
    collector.string(`${path}[${index}].label`, item.label, { min: 1, max: 80, ...FITS_THE_BOX });
    if (item.detail !== undefined) {
      collector.string(`${path}[${index}].detail`, item.detail, { max: 160, ...FITS_THE_BOX });
    }
  });
}

function validateQuote(collector: Collector, path: string, value: unknown): void {
  const quote = collector.object(path, value, new Set(["text", "attribution"]));
  if (!quote) return;
  collector.string(`${path}.text`, quote.text, { min: 8, max: 400, ...FITS_THE_BOX });
  collector.string(`${path}.attribution`, quote.attribution, { min: 2, max: 120, ...FITS_THE_BOX });
}

function validateSlide(collector: Collector, path: string, value: unknown): void {
  const slide = collector.object(path, value, SLIDE_KEYS);
  if (!slide) return;
  const layout = slide.layout;
  if (typeof layout !== "string" || !LAYOUT_SET.has(layout)) {
    collector.add(`${path}.layout`, "enum", `layout must be one of the ${DECK_IR_LAYOUTS.length} §4 grammars`);
    return;
  }
  if (slide.title !== undefined) {
    collector.string(`${path}.title`, slide.title, { max: 200, ...FITS_THE_BOX });
  }
  if (slide.subtitle !== undefined) {
    collector.string(`${path}.subtitle`, slide.subtitle, { max: 300, ...FITS_THE_BOX });
  }
  if (slide.body !== undefined) {
    collector.string(`${path}.body`, slide.body, { max: 900, ...FITS_THE_BOX });
  }
  if (slide.note !== undefined) {
    collector.string(`${path}.note`, slide.note, { max: 300, ...FITS_THE_BOX });
  }
  if (slide.gridColumns !== undefined) {
    collector.integer(`${path}.gridColumns`, slide.gridColumns, 1, 6, {
      soft: true,
      advice: "the image grid falls back to 3 across when the column count is outside 1–6",
    });
  }
  if (slide.scrimAlpha !== undefined) {
    collector.integer(`${path}.scrimAlpha`, slide.scrimAlpha, 0, 100, {
      soft: true,
      advice: "the scrim falls back to 60 % when the opacity is outside 0–100",
    });
  }
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
  // The §4 grammar names the regions each layout draws. A region with nothing
  // in it is an empty box on an otherwise valid page — worth saying, not worth
  // refusing, because only the author knows whether the page is finished.
  const definition = deckLayoutDefinition(layout as DeckIrLayout);
  for (const field of definition.required) {
    if (slide[field] === undefined) {
      collector.soft(
        `${path}.${field}`,
        "required",
        `layout "${layout}" draws a "${field}" region and nothing was given for it`,
        `the page ships with that region empty; fill "${field}" in, or move the page to a grammar that does not draw it`,
      );
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
    collector.soft(
      `${path}.images`,
      "arity",
      `layout "${layout}" has one picture frame and was given ${images.length}`,
      images.length === 0
        ? "the page ships with no picture in it; add one, or use bullets / two-column, which draw no frame"
        : "only the first picture lands in the frame; the rest do not appear — use image-grid to show several",
    );
  }
  if (
    layout === "image-grid" &&
    (images.length < DECK_CONSTANTS.C26[0] || images.length > DECK_CONSTANTS.C26[1])
  ) {
    collector.soft(
      `${path}.images`,
      "arity",
      `image-grid was given ${images.length} pictures; the grid holds 3 to 6`,
      "the count is clamped into that range, so pictures beyond the sixth do not appear",
    );
  }
  if (layout === "quote" && images.length > 1) {
    collector.soft(
      `${path}.images`,
      "arity",
      `quote takes one background picture and was given ${images.length}`,
      "the first one becomes the background; the rest do not appear",
    );
  }
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  if (
    (layout === "image-left" || layout === "image-right" || layout === "chart-with-notes") &&
    bullets.length > 5
  ) {
    collector.soft(
      `${path}.bullets`,
      "arity",
      `layout "${layout}" has ${bullets.length} bullets against a box drawn for 5`,
      "all of them ship; the last ones may run past the bottom of the box",
    );
  }
  if (layout === "mixed-triptych" && bullets.length > 4) {
    collector.soft(
      `${path}.bullets`,
      "arity",
      `mixed-triptych has ${bullets.length} bullets against a box drawn for 4`,
      "all of them ship; the triptych column is the narrowest box in the grammar, so they may run over",
    );
  }
  if (layout === "comparison") {
    for (const side of ["left", "right"] as const) {
      const column = Array.isArray(slide[side]) ? (slide[side] as unknown[]) : [];
      if (column.length > 6) {
        collector.soft(
          `${path}.${side}`,
          "arity",
          `the ${side} column has ${column.length} items against a box drawn for 6`,
          "all of them ship; they may run past the bottom of the column",
        );
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
    collector.string(`assets[${index}].sha256`, item.sha256, {
      pattern: SHA256,
      soft: true,
      advice:
        "the digest is what lets anyone check later that the picture in the file is the picture that was licensed; a malformed one is not checkable",
    });
    if (typeof item.mediaType !== "string" || !MEDIA_TYPES.has(item.mediaType)) {
      collector.soft(
        `assets[${index}].mediaType`,
        "enum",
        `mediaType is ${JSON.stringify(item.mediaType ?? null)}, outside png / jpeg / webp`,
        "the picture is stored with a .png extension, which may not match its real bytes",
      );
    }
    collector.integer(
      `assets[${index}].byteSize`,
      item.byteSize,
      DECK_CONSTANTS.C27[0],
      DECK_CONSTANTS.C27[1],
      { soft: true, advice: "the picture still goes in; a very small one will look blocky at frame size" },
    );
    for (const side of ["width", "height"] as const) {
      if (item[side] !== undefined) {
        collector.integer(
          `assets[${index}].${side}`,
          item[side],
          DECK_CONSTANTS.C28[0],
          DECK_CONSTANTS.C28[1],
          { soft: true, advice: "the picture still goes in; cover-cropping uses this to pick the crop" },
        );
      }
    }
    if (item.licenseCode !== undefined) {
      collector.string(`assets[${index}].licenseCode`, item.licenseCode, { min: 2, max: 60 });
    }
  });
}

/**
 * Attribution is the one place where refusing is still the right answer.
 *
 * Everything else in this file is taste, and taste is the author's. A credit
 * line is an obligation to somebody who is not in the room: the person whose
 * picture or font is inside this file. A half-written credit is worse than a
 * loud failure, because the file goes out looking properly credited and the
 * trail back to the owner is gone. So a malformed licence code or licence URL
 * still stops the run — with the reason spelled out and the repair named.
 */
function validateAttribution(collector: Collector, value: unknown): void {
  const attribution = collector.object("attribution", value, new Set(["entries"]));
  if (!attribution) return;
  const entries = collector.array("attribution.entries", attribution.entries, {
    min: 1,
    max: 12,
    soft: true,
    advice:
      "with no entries the deck ships without a credit line; if any picture, font or text in it came from somewhere else, that is an unmet licence obligation",
  });
  entries?.forEach((entry, index) => {
    const item = collector.object(`attribution.entries[${index}]`, entry, ENTRY_KEYS);
    if (!item) return;
    collector.string(`attribution.entries[${index}].text`, item.text, {
      min: 2,
      max: 200,
      ...FITS_THE_BOX,
    });
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
    new Set([
      "schema",
      "version",
      "title",
      "theme",
      "master",
      "slides",
      "assets",
      "attribution",
      "license",
    ]),
  );
  if (!root) {
    return { ok: false, project: null, errors: collector.errors, advisories: collector.advisories };
  }
  if (root.schema !== DECK_IR_SCHEMA) {
    collector.add("schema", "const", `schema must be "${DECK_IR_SCHEMA}"`);
  }
  if (root.version !== DECK_IR_VERSION) {
    collector.add("version", "const", "version must be 1");
  }
  collector.string("title", root.title, {
    min: 8,
    max: 300,
    soft: true,
    advice:
      "the title becomes dc:title and the first thing a reader sees in a file listing; a very short one is hard to tell apart from other decks",
  });

  const theme = collector.object("theme", root.theme, THEME_KEYS);
  if (theme) {
    const colourAdvice = {
      soft: true,
      advice: "the slot falls back to the shipped palette colour; give six hex digits to pick your own",
    } as const;
    collector.string("theme.accent", theme.accent, { pattern: HEX6, ...colourAdvice });
    for (const slot of ["accent2", "accent3", "accent4", "accent5", "accent6"] as const) {
      if (theme[slot] !== undefined) {
        collector.string(`theme.${slot}`, theme[slot], { pattern: HEX6, ...colourAdvice });
      }
    }
    for (const slot of ["fontMajor", "fontMinor", "fontEastAsian"] as const) {
      if (theme[slot] !== undefined) {
        collector.string(`theme.${slot}`, theme[slot], { max: 64, ...FITS_THE_BOX });
      }
    }
    if (theme.fontScale !== undefined) {
      const scale = theme.fontScale;
      if (typeof scale !== "number" || !Number.isFinite(scale)) {
        collector.add("theme.fontScale", "type", "fontScale must be a finite number");
      } else if (scale < 0.5 || scale > 2) {
        collector.soft(
          "theme.fontScale",
          "range",
          `fontScale is ${scale}, outside [0.5, 2]`,
          "the size ladder falls back to 1; outside that range text either disappears or stops fitting any box",
        );
      }
    }
  }

  if (root.license !== undefined) {
    const license = collector.object(
      "license",
      root.license,
      new Set(["usage_scope", "license_family", "supply_tier"]),
    );
    if (license) {
      for (const key of ["usage_scope", "license_family", "supply_tier"] as const) {
        if (license[key] !== undefined) {
          collector.string(`license.${key}`, license[key], { min: 1, max: 120 });
        }
      }
    }
  }

  if (root.master !== undefined) {
    const master = collector.object("master", root.master, MASTER_KEYS);
    if (master) {
      if (master.footerText !== undefined) {
        collector.string("master.footerText", master.footerText, { max: 120, ...FITS_THE_BOX });
      }
      if (master.logoAssetId !== undefined) {
        collector.string("master.logoAssetId", master.logoAssetId, { max: 64, ...FITS_THE_BOX });
      }
      for (const flag of ["showPageNumber", "creditsBar"] as const) {
        if (master[flag] !== undefined && typeof master[flag] !== "boolean") {
          collector.add(`master.${flag}`, "type", `${flag} must be a boolean`);
        }
      }
    }
  }

  const slides = collector.array("slides", root.slides, {
    min: DECK_CONSTANTS.C17,
    max: DECK_CONSTANTS.C18,
    soft: true,
    advice:
      "page count is a judgement about the presentation, not about the file; a short deck is a fine deck if it says everything it needs to",
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
        collector.soft(
          `slides[${slideIndex}].images[${imageIndex}].assetId`,
          "unresolved-asset",
          `assetId "${image.assetId}" is not declared in assets[]`,
          "the page ships without that picture, which makes it a page with no picture on it; declare the asset, or move the page to a grammar that draws no frame",
        );
      }
    });
  });

  if (collector.errors.length > 0) {
    return { ok: false, project: null, errors: collector.errors, advisories: collector.advisories };
  }
  return {
    ok: true,
    project: value as DeckIrDocument,
    errors: [],
    advisories: collector.advisories,
  };
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
  "license",
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
  /**
   * Whether the document can be turned into a file at all. Nothing measured
   * below can make this false — it is kept so that callers written against the
   * old shape keep compiling, and so there is one obvious place to put a real
   * blocker if one is ever found on the IR side.
   */
  ok: boolean;
  code: "deck-hollow" | null;
  /** Reserved for input the writer genuinely cannot render. Empty in practice. */
  failures: string[];
  /**
   * What was measured, and what each measurement means for the presentation.
   * These used to be nine refusals; they are now nine sentences.
   */
  notes: string[];
  slideCount: number;
  textCharacters: number;
  charactersPerSlide: number;
  distinctLayouts: number;
  denseSlides: number;
  imageCount: number;
  slidesWithoutImages: number;
  chartCount: number;
  irBytes: number;
}

/**
 * §8.2 — what a deck measures on the IR side. The package-side counts
 * (`slideMaster`, `slideLayout`, `theme1.xml`, shapes per page) are measured in
 * `deck-ooxml-package.ts`.
 *
 * Until 2026-08-06 each of these nine numbers was a condition, and failing any
 * one of them threw `deck-hollow` — a single error code covering "your deck is
 * five pages" and "your deck has no chart", which told the caller nothing about
 * which of the two it was or what to do next. None of them describe a file that
 * cannot be opened; they all describe a presentation someone might not like.
 * So they report, and whoever is holding the deck decides.
 */
export function deckIrCompleteness(project: DeckIrDocument): DeckIrCompleteness {
  const notes: string[] = [];
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
  const slidesWithoutImages = project.slides.filter(
    (slide) => !slide.images || slide.images.length === 0,
  ).length;
  const chartCount = project.slides.filter((slide) => slide.chart).length;
  const irBytes = new TextEncoder().encode(serializeDeckIr(project)).length;
  const charactersPerSlide = slideCount ? Math.round(textCharacters / slideCount) : 0;

  if (slideCount < DECK_CONSTANTS.C17) {
    notes.push(
      `${slideCount} pages. For a deck meant to stand on its own that is on the short side; ` +
        "six is where a title, a section break, some substance and a close start to fit.",
    );
  }
  if (textCharacters < DECK_CONSTANTS.C44) {
    notes.push(
      `${textCharacters} characters of text in the whole deck. That is close to empty — ` +
        "check the content actually made it into the slides rather than only into the titles.",
    );
  }
  if (charactersPerSlide > 420) {
    notes.push(
      `${charactersPerSlide} characters per page on average. That is dense for a presentation; ` +
        "a slide people read is a slide they stop listening to. Consider splitting the busiest pages.",
    );
  }
  if (layouts.size < 5) {
    notes.push(
      `${layouts.size} distinct layouts across ${slideCount} pages. Pages will look alike; ` +
        "there are 16 grammars available.",
    );
  }
  if (denseSlides < 1) {
    notes.push(
      "No mixed-triptych or chart-with-notes page. Those are the two grammars that put a picture, " +
        "prose and numbers on one page — a deck without either tends to read as a list of lists.",
    );
  }
  // `slidesWithoutImages` is returned but not narrated here: the package-side
  // reading counts `<p:pic>` in the bytes that were actually written, which is
  // the truthful number when a declared picture had no bytes to go with it.
  if (chartCount < 1) {
    notes.push(
      "No chart. Numbers shown as a real chart object stay readable and stay editable; " +
        "numbers typed into bullets do neither.",
    );
  }
  if (project.title.length < 8) {
    notes.push(
      `The deck title is ${project.title.length} characters. It becomes dc:title, which is what ` +
        "shows in a file listing and in search results.",
    );
  }
  if (irBytes < DECK_IR_MIN_BYTES) {
    notes.push(
      `The document itself serialises to ${irBytes} bytes, under the ${DECK_IR_MIN_BYTES} floor. ` +
        "A document this small has historically meant the content never arrived.",
    );
  }
  if (irBytes > DECK_IR_MAX_BYTES) {
    notes.push(
      `The document serialises to ${irBytes} bytes, over the ${DECK_IR_MAX_BYTES} ceiling. ` +
        "It will still build; very large documents are slow to hand around.",
    );
  }

  return {
    ok: true,
    code: null,
    failures: [],
    notes,
    slideCount,
    textCharacters,
    charactersPerSlide,
    distinctLayouts: layouts.size,
    denseSlides,
    imageCount,
    slidesWithoutImages,
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
