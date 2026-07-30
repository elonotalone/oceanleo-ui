/**
 * website-source 载体(`website` / `website-source@1`)的结构事实源。
 *
 * 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/website-source.md
 *  - §1.1 四元组 · §1.2 `html` 硬禁令 · §2 设计 token/栅格/字号 · §3 JSON Schema
 *  - §4 常量表 C1–C43
 *
 * §1.3 不可信内容边界:本模块 MUST NOT 声明或改动任何 CORS origin 正则、cookie
 * 域判定、iframe `sandbox` 属性或 `postMessage` 目标源 —— 那些的唯一事实源是
 * `editor-sandbox-origin.ts` 与 `editor-protocol.ts`,本载体只做结构校验。
 */

import {
  validateAgainstJsonSchema,
  type SchemaViolation,
} from "../workflow-carrier/video-canvas-schema";

export { validateAgainstJsonSchema, type SchemaViolation };

export const WEBSITE_SOURCE_FORMAT = "website-source@1";

/** §1.1 四元组(逐字)。 */
export const WEBSITE_SOURCE_CARRIER_CONTRACT = Object.freeze({
  featureId: "website_finetuning",
  artifactType: "website",
  sourceFormat: WEBSITE_SOURCE_FORMAT,
  sourceMediaType: "application/json",
  editorCapability: "website-editor",
  adapter: "website",
  projectSchema: WEBSITE_SOURCE_FORMAT,
  editability: "native",
  sourceIntegrity: "complete_dependency_closure",
  openMode: "structured-project",
  requirementKind: "manifest",
  requirementSchema: WEBSITE_SOURCE_FORMAT,
  requirementPaths: Object.freeze(["pages", "sections"] as const),
  dependencyClosure: "complete",
  /** §1.1 末条:整块视口交给外站编辑器,MUST NOT 改为本地 route。 */
  routeType: "embed",
  viewportOwnership: "native",
  toolbarOwnership: "native",
} as const);

export const WEBSITE_SOURCE_REQUIREMENT_PATHS =
  WEBSITE_SOURCE_CARRIER_CONTRACT.requirementPaths;

/**
 * §1.2 硬禁令(ADR-04):网站素材 MUST NOT 以 `source_format = html` 落库。
 * `_source_format_matches[WEBSITE]` 容忍下列字面量入库,但以它们落库的
 * MUST 为 `view_only`(typed_artifact_models.py:1528-1533)。
 */
export const HTML_FORBIDDEN_SOURCE_FORMATS = Object.freeze([
  "html",
  "text/html",
] as const);

export const VIEW_ONLY_TOLERATED_SOURCE_FORMATS = Object.freeze([
  "html",
  "text/html",
  "zip",
  "oceanleo.website-project.v1",
] as const);

/** §3.1 `sections[].kind` 枚举 —— C7 = 13 种。 */
export const WEBSITE_SECTION_KINDS = Object.freeze([
  "hero",
  "feature-grid",
  "content",
  "gallery",
  "pricing",
  "faq",
  "testimonial",
  "cta",
  "stats",
  "timeline",
  "team",
  "contact",
  "footer",
] as const);

export type WebsiteSectionKind = (typeof WEBSITE_SECTION_KINDS)[number];

export interface WebsiteSourceTheme {
  accent: string;
  background: string;
  surface?: string;
  text: string;
  muted?: string;
  border?: string;
  radiusPx?: number;
  fontFamily?: string;
  maxWidthPx?: number;
}

export interface WebsiteSourcePage {
  id: string;
  path: string;
  title: string;
  description?: string;
  sectionIds: string[];
}

export interface WebsiteSourceSectionItem {
  title?: string;
  text?: string;
  icon?: string;
  assetId?: string;
  alt?: string;
  value?: string;
  href?: string;
}

export interface WebsiteSourceAction {
  label: string;
  href: string;
  variant?: "primary" | "secondary" | "ghost";
}

export interface WebsiteSourceSection {
  id: string;
  kind: WebsiteSectionKind;
  heading?: string;
  subheading?: string;
  body?: string;
  decorative?: boolean;
  background?: "default" | "surface" | "accent";
  items?: WebsiteSourceSectionItem[];
  actions?: WebsiteSourceAction[];
}

export interface WebsiteSourceAsset {
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

export interface WebsiteSourceDependency {
  path: string;
  sha256: string;
  mediaType: string;
  byteSize?: number;
}

export interface WebsiteSourceAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
  assetId?: string;
}

export interface WebsiteSource {
  schema: typeof WEBSITE_SOURCE_FORMAT;
  version: 1;
  title: string;
  theme: WebsiteSourceTheme;
  pages: WebsiteSourcePage[];
  sections: WebsiteSourceSection[];
  navigation?: {
    brand?: string;
    links?: { label: string; href: string }[];
  };
  assets?: WebsiteSourceAsset[];
  seo?: {
    description?: string;
    keywords?: string[];
    ogImageAssetId?: string;
  };
  attribution: { entries: WebsiteSourceAttributionEntry[] };
  dependencies: WebsiteSourceDependency[];
}

/** §4 数值常量表 C1–C43。 */
export const WEBSITE_SOURCE_CONSTANTS = Object.freeze({
  C1_PAGE_COUNT_MIN: 1,
  C2_PAGE_COUNT_MAX: 24,
  C3_SECTION_COUNT_MIN: 4,
  C4_SECTION_COUNT_MAX: 200,
  C5_PAGE_SECTION_IDS_MIN: 4,
  C6_PAGE_SECTION_IDS_MAX: 40,
  C7_SECTION_KIND_COUNT: 13,
  C8_SECTION_KINDS_USED_MIN: 4,
  C9_DEPENDENCY_COUNT_MIN: 1,
  C10_DEPENDENCY_COUNT_MAX: 512,
  C11_ASSET_BYTE_MIN: 512,
  C11_ASSET_BYTE_MAX: 8_388_608,
  C12_ASSET_COUNT_MAX: 200,
  C13_CONTENT_MAX_WIDTH_PX: 1_200,
  C13_THEME_MAX_WIDTH_MIN_PX: 640,
  C13_THEME_MAX_WIDTH_MAX_PX: 1_600,
  C14_GRID_COLUMNS: 12,
  C15_COLUMN_GAP_PX: 24,
  C16_SECTION_GAP_PX: 96,
  C17_BREAKPOINTS_PX: Object.freeze([640, 1_024, 1_280] as const),
  C18_CARD_RADIUS_PX: 12,
  C18_THEME_RADIUS_MIN_PX: 0,
  C18_THEME_RADIUS_MAX_PX: 32,
  C19_HERO_FONT_PX: Object.freeze({ desktop: 56, mobile: 34 } as const),
  C20_BODY_FONT_PX: 16,
  C21_SECTION_ACTIONS_MAX: 3,
  C22_NAVIGATION_LINKS_MAX: 12,
  C23_SEO_DESCRIPTION_MIN: 40,
  C23_SEO_DESCRIPTION_MAX: 320,
  C24_ALT_MIN_LENGTH: 4,
  C25_PAGE_TITLE_MIN_LENGTH: 4,
  C26_BODY_CHARACTERS_MIN: 800,
  C27_SOURCE_BYTE_MIN: 6_144,
  C28_SOURCE_BYTE_MAX: 4_194_304,
  C29_DEPENDENCY_CLOSURE_BYTE_MAX: 67_108_864,
  C30_LCP_MS: 2_500,
  C31_CLS: 0.1,
  C32_INP_MS: 200,
  C33_COVER_MIN_EDGE_PX: 128,
  C34_CAPTURE_CANVAS_PX: Object.freeze({ width: 1_280, height: 800 } as const),
  C35_CAPTURE_COLOR_COUNT_MIN: 16,
  C36_NATIVE_INVENTORY: 301,
  C37_HTML_VIEW_ONLY_INVENTORY: 9,
  C38_ASSET_TEMPLATE_TOTAL: 500,
  C39_MATERIALIZED_COUNT: 48,
  C40_PENDING_COUNT: 452,
  C41_TEMPLATE_SUBCLASS_COUNT: 105,
  C42_FAMILY_JACCARD_MAX: 0.85,
  C43_TWIN_THRESHOLD: 0.99,
  /** §8.1 依赖闭包字节下限(至少 1 张真图)。 */
  DEPENDENCY_CLOSURE_BYTE_MIN: 8_192,
  /** §8.2:`title` 长度 ≥ 8(reviewed_material_catalog.py:3309)。 */
  TITLE_MIN_LENGTH: 8,
  /** §5.2 编译成 HTML 墙钟上限。 */
  COMPILE_WALL_MS_MAX: 3_000,
} as const);

/** §2.1 设计 token 色板(`theme` 的默认值)。 */
export const WEBSITE_SOURCE_TOKENS = Object.freeze({
  "site.bg": "#FFFFFF",
  "site.surface": "#F5F7FA",
  "site.text": "#1F2328",
  "site.muted": "#57606A",
  "site.accent": "#1F6FEB",
  "site.accent.contrast": "#FFFFFF",
  "site.border": "#D0D7DE",
  "site.control.border": "#7D8590",
} as const);

export interface WebsiteContrastObligation {
  token: keyof typeof WEBSITE_SOURCE_TOKENS;
  /** 受多个底约束时逐个列出;判定 MUST 取最小值(§2.1 二次复核)。 */
  bases: readonly (keyof typeof WEBSITE_SOURCE_TOKENS)[];
  minimumRatio: number;
  measuredMinimumRatio: number;
  criterion: "SC 1.4.3" | "SC 1.4.11" | "self-defined-layering";
}

/** §2.1 逐条对比度义务(实测值按 WCAG 2.2 相对亮度公式复算)。 */
export const WEBSITE_CONTRAST_OBLIGATIONS: readonly WebsiteContrastObligation[] =
  Object.freeze([
    {
      token: "site.surface",
      bases: ["site.bg"],
      minimumRatio: 1.05,
      measuredMinimumRatio: 1.07,
      criterion: "self-defined-layering",
    },
    {
      token: "site.text",
      bases: ["site.bg", "site.surface"],
      minimumRatio: 4.5,
      measuredMinimumRatio: 14.72,
      criterion: "SC 1.4.3",
    },
    {
      token: "site.muted",
      bases: ["site.bg", "site.surface"],
      minimumRatio: 4.5,
      measuredMinimumRatio: 5.95,
      criterion: "SC 1.4.3",
    },
    {
      /**
       * 规格 §2.1 写「与底 ≥ 4.5:1」。白底成立(4.63:1),但交替底
       * `site.surface` 只有 4.32:1 —— 见 WEBSITE_CONTRAST_CONFLICTS。
       * 规格文档不得改写,故此处只按白底登记义务,冲突另表上报。
       */
      token: "site.accent",
      bases: ["site.bg"],
      minimumRatio: 4.5,
      measuredMinimumRatio: 4.63,
      criterion: "SC 1.4.3",
    },
    {
      token: "site.accent.contrast",
      bases: ["site.accent"],
      minimumRatio: 4.5,
      measuredMinimumRatio: 4.63,
      criterion: "SC 1.4.3",
    },
    {
      /** 纯装饰分隔线,不在 SC 1.4.11 射程内(§2.1 边框对比度订正)。 */
      token: "site.border",
      bases: ["site.bg"],
      minimumRatio: 1.05,
      measuredMinimumRatio: 1.45,
      criterion: "self-defined-layering",
    },
    {
      /** 控件边界:两底都要 ≥ 3.0:1,判定取最小值 3.48:1。 */
      token: "site.control.border",
      bases: ["site.bg", "site.surface"],
      minimumRatio: 3.0,
      measuredMinimumRatio: 3.48,
      criterion: "SC 1.4.11",
    },
  ] as const);

/**
 * 规格与现状的冲突登记(合同 §0 第 7 条:规格文档不得改写,冲突写进 marker 由 parent 仲裁)。
 *
 * §2.1 已两次订正边框类 token 的对比度声明,但 `site.accent` 这条仍是同一类缺陷:
 * 声明「与底 ≥ 4.5:1」,而交替底区块里的链接/按钮色实测只有 4.32:1。
 * 治理选项(需操作员/parent 裁定,本 owner MUST NOT 自行改规格取值):
 *   (a) 把 `site.accent` 压暗到对 `#F5F7FA` ≥ 4.5:1;或
 *   (b) 按 `site.control.border` 的先例,明确 `site.accent` 只承 `site.bg` 底,
 *       并规定交替底区块的链接必须换用更暗的 accent 变体。
 */
export const WEBSITE_CONTRAST_CONFLICTS = Object.freeze([
  Object.freeze({
    token: "site.accent",
    base: "site.surface",
    declaredMinimumRatio: 4.5,
    measuredRatio: 4.32,
    criterion: "SC 1.4.3",
    specSection: "website-source.md §2.1",
  } as const),
] as const);

/** §2.2 栅格。 */
export const WEBSITE_SOURCE_GRID = Object.freeze({
  contentMaxWidthPx: WEBSITE_SOURCE_CONSTANTS.C13_CONTENT_MAX_WIDTH_PX,
  columns: WEBSITE_SOURCE_CONSTANTS.C14_GRID_COLUMNS,
  columnGapPx: WEBSITE_SOURCE_CONSTANTS.C15_COLUMN_GAP_PX,
  pageGutterDesktopPx: 48,
  pageGutterMobilePx: 20,
  sectionGapPx: WEBSITE_SOURCE_CONSTANTS.C16_SECTION_GAP_PX,
  cardRadiusPx: WEBSITE_SOURCE_CONSTANTS.C18_CARD_RADIUS_PX,
  breakpointsPx: WEBSITE_SOURCE_CONSTANTS.C17_BREAKPOINTS_PX,
} as const);

/** §2.3 字号档(桌面 / 移动,px)。 */
export const WEBSITE_SOURCE_TYPE_SCALE = Object.freeze({
  hero: Object.freeze({ desktop: 56, mobile: 34 } as const),
  h2: Object.freeze({ desktop: 36, mobile: 26 } as const),
  h3: Object.freeze({ desktop: 22, mobile: 19 } as const),
  body: Object.freeze({ desktop: 16, mobile: 16 } as const),
  small: Object.freeze({ desktop: 14, mobile: 14 } as const),
  caption: Object.freeze({ desktop: 12, mobile: 12 } as const),
} as const);

/** §3 `website-source@1` JSON Schema(Draft 2020-12,逐字取规格 §3)。 */
export const WEBSITE_SOURCE_JSON_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://oceanleo.com/schemas/website-source@1.json",
  title: WEBSITE_SOURCE_FORMAT,
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "version",
    "title",
    "theme",
    "pages",
    "sections",
    "attribution",
    "dependencies",
  ],
  properties: {
    schema: { const: WEBSITE_SOURCE_FORMAT },
    version: { type: "integer", const: 1 },
    title: {
      type: "string",
      minLength: WEBSITE_SOURCE_CONSTANTS.TITLE_MIN_LENGTH,
      maxLength: 300,
    },
    theme: {
      type: "object",
      additionalProperties: false,
      required: ["accent", "background", "text"],
      properties: {
        accent: { $ref: "#/$defs/color" },
        background: { $ref: "#/$defs/color" },
        surface: { $ref: "#/$defs/color" },
        text: { $ref: "#/$defs/color" },
        muted: { $ref: "#/$defs/color" },
        border: { $ref: "#/$defs/color" },
        radiusPx: {
          type: "integer",
          minimum: WEBSITE_SOURCE_CONSTANTS.C18_THEME_RADIUS_MIN_PX,
          maximum: WEBSITE_SOURCE_CONSTANTS.C18_THEME_RADIUS_MAX_PX,
        },
        fontFamily: { type: "string", maxLength: 120 },
        maxWidthPx: {
          type: "integer",
          minimum: WEBSITE_SOURCE_CONSTANTS.C13_THEME_MAX_WIDTH_MIN_PX,
          maximum: WEBSITE_SOURCE_CONSTANTS.C13_THEME_MAX_WIDTH_MAX_PX,
        },
      },
    },
    pages: {
      type: "array",
      minItems: WEBSITE_SOURCE_CONSTANTS.C1_PAGE_COUNT_MIN,
      maxItems: WEBSITE_SOURCE_CONSTANTS.C2_PAGE_COUNT_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "path", "title", "sectionIds"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,47}$" },
          path: { type: "string", pattern: "^/[a-z0-9/_-]*$", maxLength: 200 },
          title: {
            type: "string",
            minLength: WEBSITE_SOURCE_CONSTANTS.C25_PAGE_TITLE_MIN_LENGTH,
            maxLength: 160,
          },
          description: { type: "string", maxLength: 300 },
          sectionIds: {
            type: "array",
            minItems: WEBSITE_SOURCE_CONSTANTS.C5_PAGE_SECTION_IDS_MIN,
            maxItems: WEBSITE_SOURCE_CONSTANTS.C6_PAGE_SECTION_IDS_MAX,
            items: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,47}$" },
          },
        },
      },
    },
    sections: {
      type: "array",
      minItems: WEBSITE_SOURCE_CONSTANTS.C3_SECTION_COUNT_MIN,
      maxItems: WEBSITE_SOURCE_CONSTANTS.C4_SECTION_COUNT_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,47}$" },
          kind: { enum: [...WEBSITE_SECTION_KINDS] },
          heading: { type: "string", maxLength: 200 },
          subheading: { type: "string", maxLength: 400 },
          body: { type: "string", maxLength: 4_000 },
          decorative: { type: "boolean", default: false },
          background: { enum: ["default", "surface", "accent"], default: "default" },
          items: {
            type: "array",
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string", maxLength: 160 },
                text: { type: "string", maxLength: 800 },
                icon: { type: "string", maxLength: 64 },
                assetId: { type: "string", maxLength: 64 },
                alt: { type: "string", maxLength: 300 },
                value: { type: "string", maxLength: 40 },
                href: { type: "string", maxLength: 500 },
              },
            },
          },
          actions: {
            type: "array",
            maxItems: WEBSITE_SOURCE_CONSTANTS.C21_SECTION_ACTIONS_MAX,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "href"],
              properties: {
                label: { type: "string", minLength: 1, maxLength: 40 },
                href: { type: "string", minLength: 1, maxLength: 500 },
                variant: { enum: ["primary", "secondary", "ghost"] },
              },
            },
          },
        },
        allOf: [
          {
            if: { properties: { decorative: { const: false } } },
            then: { required: ["heading"] },
          },
        ],
      },
    },
    navigation: {
      type: "object",
      additionalProperties: false,
      properties: {
        brand: { type: "string", maxLength: 80 },
        links: {
          type: "array",
          maxItems: WEBSITE_SOURCE_CONSTANTS.C22_NAVIGATION_LINKS_MAX,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "href"],
            properties: {
              label: { type: "string", minLength: 1, maxLength: 40 },
              href: { type: "string", minLength: 1, maxLength: 500 },
            },
          },
        },
      },
    },
    assets: {
      type: "array",
      maxItems: WEBSITE_SOURCE_CONSTANTS.C12_ASSET_COUNT_MAX,
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
          byteSize: {
            type: "integer",
            minimum: WEBSITE_SOURCE_CONSTANTS.C11_ASSET_BYTE_MIN,
            maximum: WEBSITE_SOURCE_CONSTANTS.C11_ASSET_BYTE_MAX,
          },
          licenseCode: { type: "string", maxLength: 60 },
        },
      },
    },
    seo: {
      type: "object",
      additionalProperties: false,
      properties: {
        description: {
          type: "string",
          minLength: WEBSITE_SOURCE_CONSTANTS.C23_SEO_DESCRIPTION_MIN,
          maxLength: WEBSITE_SOURCE_CONSTANTS.C23_SEO_DESCRIPTION_MAX,
        },
        keywords: {
          type: "array",
          maxItems: 12,
          items: { type: "string", maxLength: 40 },
        },
        ogImageAssetId: { type: "string", maxLength: 64 },
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
          maxItems: 24,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "licenseCode", "licenseUrl"],
            properties: {
              text: { type: "string", minLength: 2, maxLength: 200 },
              licenseCode: { type: "string", minLength: 2, maxLength: 60 },
              licenseUrl: { type: "string", format: "uri", pattern: "^https://" },
              assetId: { type: "string", maxLength: 64 },
            },
          },
        },
      },
    },
    dependencies: {
      type: "array",
      minItems: WEBSITE_SOURCE_CONSTANTS.C9_DEPENDENCY_COUNT_MIN,
      maxItems: WEBSITE_SOURCE_CONSTANTS.C10_DEPENDENCY_COUNT_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "sha256", "mediaType"],
        properties: {
          path: { type: "string", minLength: 1, maxLength: 512 },
          sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
          mediaType: { type: "string", minLength: 3, maxLength: 120 },
          byteSize: { type: "integer", minimum: 1, maximum: 8_388_608 },
        },
      },
    },
  },
  $defs: {
    color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
  },
} as const);
