/**
 * `website-source@1` 的校验面。
 *
 * 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/website-source.md
 *  - §1.2 硬禁令:`html` 不得落库(ADR-04)
 *  - §1.3 不可信内容边界(本模块 MUST NOT 触碰 sandbox / postMessage / CORS / cookie 域)
 *  - §3.1 Schema · §5.1 功能适合性 · §5.4 安全性 · §6 F1–F8 · §8.1 / §8.2
 */

import {
  HTML_FORBIDDEN_SOURCE_FORMATS,
  VIEW_ONLY_TOLERATED_SOURCE_FORMATS,
  WEBSITE_SECTION_KINDS,
  WEBSITE_SOURCE_CONSTANTS,
  WEBSITE_SOURCE_FORMAT,
  WEBSITE_SOURCE_JSON_SCHEMA,
  WEBSITE_SOURCE_REQUIREMENT_PATHS,
  validateAgainstJsonSchema,
  type SchemaViolation,
  type WebsiteSource,
} from "./website-source-schema";

export type WebsiteSourceErrorCode =
  | "website-source-not-json"
  | "website-source-not-object"
  | "website-source-schema-invalid"
  | "website-source-html-forbidden"
  | "website-hollow";

export class WebsiteSourceCarrierError extends Error {
  readonly code: WebsiteSourceErrorCode;
  readonly violations: readonly SchemaViolation[];

  constructor(
    message: string,
    code: WebsiteSourceErrorCode,
    violations: readonly SchemaViolation[] = [],
  ) {
    super(message);
    this.name = "WebsiteSourceCarrierError";
    this.code = code;
    this.violations = violations;
  }
}

export type WebsiteSourceFormatAdmission =
  | { ok: true; sourceFormat: string; editabilityCeiling: "native" }
  | {
      ok: false;
      code: "website-source-html-forbidden";
      sourceFormat: string;
      /** §1.2:以容忍格式落库的 MUST 为 view_only。 */
      editabilityCeiling: "view_only";
      message: string;
    }
  | {
      ok: false;
      code: "website-source-view-only-format";
      sourceFormat: string;
      editabilityCeiling: "view_only";
      message: string;
    }
  | {
      ok: false;
      code: "website-source-unknown-format";
      sourceFormat: string;
      editabilityCeiling: "none";
      message: string;
    };

/**
 * §1.2 硬禁令的唯一判定入口。
 *
 * `html` / `text/html` 一律**显式拒绝**为可编辑落库格式(ADR-04 铁律):交互素材
 * 必须是结构化 IR,HTML 只在运行时由受控编译器生成。`zip` 与
 * `oceanleo.website-project.v1` 是入库容忍格式,天花板同样是 `view_only`。
 *
 * 这条判定 MUST NOT 依赖调用方传 `editability` —— 只要格式是 html,
 * 就没有任何参数组合能让它拿到 `native`(§7 A12)。
 */
export function websiteSourceFormatAdmission(
  sourceFormat: unknown,
): WebsiteSourceFormatAdmission {
  const format = String(sourceFormat ?? "")
    .trim()
    .toLowerCase();
  if (format === WEBSITE_SOURCE_FORMAT) {
    return {
      ok: true,
      sourceFormat: WEBSITE_SOURCE_FORMAT,
      editabilityCeiling: "native",
    };
  }
  if ((HTML_FORBIDDEN_SOURCE_FORMATS as readonly string[]).includes(format)) {
    return {
      ok: false,
      code: "website-source-html-forbidden",
      sourceFormat: format,
      editabilityCeiling: "view_only",
      message:
        `source_format=${format} MUST NOT 落库为可编辑网站素材(website-source.md §1.2 / ADR-04);` +
        "物化 MUST 走 lib/template-website-source.ts 输出 website-source@1。",
    };
  }
  if ((VIEW_ONLY_TOLERATED_SOURCE_FORMATS as readonly string[]).includes(format)) {
    return {
      ok: false,
      code: "website-source-view-only-format",
      sourceFormat: format,
      editabilityCeiling: "view_only",
      message: `source_format=${format} 只是入库容忍格式,落库 MUST 为 view_only(§1.2)。`,
    };
  }
  return {
    ok: false,
    code: "website-source-unknown-format",
    sourceFormat: format,
    editabilityCeiling: "none",
    message: `source_format=${format || "(空)"} 不属于 website 载体(§1.1)。`,
  };
}

/**
 * §9 C-3 的第二半:IR 里不得有 HTML 字符串注入点。
 *
 * label 写成「xxx 标签」而非尖括号字面量 —— 隔离面守卫会扫本目录的代码行,
 * 检测器自己的字面量不该被误判成一处渲染面。
 */
const HTML_INJECTION_PATTERNS: readonly { pattern: RegExp; label: string }[] =
  Object.freeze([
    { pattern: /<\s*script\b/i, label: "script 标签" },
    { pattern: /<\s*iframe\b/i, label: "iframe 标签" },
    { pattern: /<\s*style\b/i, label: "style 标签" },
    { pattern: /<\s*object\b/i, label: "object 标签" },
    { pattern: /<\s*embed\b/i, label: "embed 标签" },
    { pattern: /\son[a-z]+\s*=/i, label: "内联事件属性" },
    { pattern: /javascript:/i, label: "javascript: 方案" },
    { pattern: /data:text\/html/i, label: "data:text/html" },
    { pattern: /srcdoc\s*=/i, label: "srcdoc" },
  ]);

/** §5.4:href MUST 为相对路径或 https:// 绝对 URL。 */
export function isSafeWebsiteHref(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const href = value.trim();
  if (!href) return false;
  if (/^https:\/\/[^\s]+$/i.test(href)) return true;
  if (/^(?:javascript|data|vbscript|file|blob):/i.test(href)) return false;
  // 协议相对地址(//host)会跟随宿主协议,不算相对路径。
  if (href.startsWith("//")) return false;
  return href.startsWith("/") || href.startsWith("#") || /^[a-z0-9._~-]/i.test(href)
    ? !/^[a-z][a-z0-9+.-]*:/i.test(href)
    : false;
}

export interface WebsiteSemanticViolation {
  code:
    | "dangling-section-id"
    | "unsafe-href"
    | "html-injection"
    | "missing-heading"
    | "missing-alt"
    | "duplicate-section-id"
    | "duplicate-page-id";
  path: string;
  detail: string;
}

export type WebsiteSourceValidation =
  | { ok: true; source: WebsiteSource; semantic: WebsiteSemanticViolation[] }
  | {
      ok: false;
      errors: SchemaViolation[];
      semantic: WebsiteSemanticViolation[];
    };

function textFieldsOf(source: WebsiteSource): { path: string; text: string }[] {
  const fields: { path: string; text: string }[] = [];
  fields.push({ path: "/title", text: source.title || "" });
  (source.sections || []).forEach((section, index) => {
    for (const key of ["heading", "subheading", "body"] as const) {
      const value = section[key];
      if (typeof value === "string") {
        fields.push({ path: `/sections/${index}/${key}`, text: value });
      }
    }
    (section.items || []).forEach((entry, itemIndex) => {
      for (const key of ["title", "text", "alt", "value"] as const) {
        const value = entry[key];
        if (typeof value === "string") {
          fields.push({
            path: `/sections/${index}/items/${itemIndex}/${key}`,
            text: value,
          });
        }
      }
    });
  });
  (source.pages || []).forEach((page, index) => {
    for (const key of ["title", "description"] as const) {
      const value = page[key];
      if (typeof value === "string") {
        fields.push({ path: `/pages/${index}/${key}`, text: value });
      }
    }
  });
  return fields;
}

/**
 * §3.1 结构校验 + §5.1 / §5.4 / §6 的语义校验。
 *
 * `sections[].body` 与 `items[].text` MUST 是纯文本或受限 Markdown 子集,
 * 因此这里对全部文本字段扫 HTML 注入点(§3.1 末段 + §9 C-3)。
 */
export function validateWebsiteSource(value: unknown): WebsiteSourceValidation {
  const errors = validateAgainstJsonSchema(
    value,
    WEBSITE_SOURCE_JSON_SCHEMA as unknown as Record<string, unknown>,
  );
  const semantic: WebsiteSemanticViolation[] = [];

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const path of WEBSITE_SOURCE_REQUIREMENT_PATHS) {
      const entry = record[path];
      if (!Array.isArray(entry) || entry.length === 0) {
        errors.push({
          path: `/${path}`,
          keyword: "requirement_paths",
          message: `requirement_path ${path} MUST 在顶层且非空(§1.1 / §3)`,
        });
      }
    }
  }

  const source = value as WebsiteSource;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const sectionIds = new Set<string>();
    (source.sections || []).forEach((section, index) => {
      if (!section || typeof section !== "object") return;
      if (sectionIds.has(section.id)) {
        semantic.push({
          code: "duplicate-section-id",
          path: `/sections/${index}/id`,
          detail: `section id ${section.id} 重复`,
        });
      }
      sectionIds.add(section.id);
      // §2.4 SC 2.4.6:非装饰 section MUST 有非空 heading。
      if (!section.decorative && !String(section.heading || "").trim()) {
        semantic.push({
          code: "missing-heading",
          path: `/sections/${index}/heading`,
          detail: "非装饰 section 缺少 heading(SC 2.4.6)",
        });
      }
      (section.items || []).forEach((entry, itemIndex) => {
        // §2.4 SC 1.1.1:带图的 item MUST 有 ≥ 4 字符的 alt。
        if (
          entry?.assetId &&
          String(entry.alt || "").trim().length <
            WEBSITE_SOURCE_CONSTANTS.C24_ALT_MIN_LENGTH
        ) {
          semantic.push({
            code: "missing-alt",
            path: `/sections/${index}/items/${itemIndex}/alt`,
            detail: `图片 item 的 alt 长度 MUST ≥ ${WEBSITE_SOURCE_CONSTANTS.C24_ALT_MIN_LENGTH}(SC 1.1.1)`,
          });
        }
        if (entry?.href !== undefined && !isSafeWebsiteHref(entry.href)) {
          semantic.push({
            code: "unsafe-href",
            path: `/sections/${index}/items/${itemIndex}/href`,
            detail: `href ${String(entry.href)} 只允许相对路径或 https://(§5.4)`,
          });
        }
      });
      (section.actions || []).forEach((action, actionIndex) => {
        if (!isSafeWebsiteHref(action?.href)) {
          semantic.push({
            code: "unsafe-href",
            path: `/sections/${index}/actions/${actionIndex}/href`,
            detail: `href ${String(action?.href)} 只允许相对路径或 https://(§5.4)`,
          });
        }
      });
    });

    const pageIds = new Set<string>();
    (source.pages || []).forEach((page, index) => {
      if (!page || typeof page !== "object") return;
      if (pageIds.has(page.id)) {
        semantic.push({
          code: "duplicate-page-id",
          path: `/pages/${index}/id`,
          detail: `page id ${page.id} 重复`,
        });
      }
      pageIds.add(page.id);
      // §5.1 + §6 F4:悬空区块引用 MUST 逐条列出并使产物 invalid。
      (page.sectionIds || []).forEach((sectionId, refIndex) => {
        if (!sectionIds.has(sectionId)) {
          semantic.push({
            code: "dangling-section-id",
            path: `/pages/${index}/sectionIds/${refIndex}`,
            detail: `sectionId ${sectionId} 在 sections[] 中不存在(§6 F4)`,
          });
        }
      });
    });

    (source.navigation?.links || []).forEach((link, index) => {
      if (!isSafeWebsiteHref(link?.href)) {
        semantic.push({
          code: "unsafe-href",
          path: `/navigation/links/${index}/href`,
          detail: `href ${String(link?.href)} 只允许相对路径或 https://(§5.4)`,
        });
      }
    });

    for (const field of textFieldsOf(source)) {
      for (const { pattern, label } of HTML_INJECTION_PATTERNS) {
        if (pattern.test(field.text)) {
          semantic.push({
            code: "html-injection",
            path: field.path,
            detail: `文本字段出现 HTML 注入点 ${label};MUST 是纯文本或受限 Markdown(§3.1 末段 / §9 C-3)`,
          });
        }
      }
    }
  }

  if (errors.length || semantic.length) {
    return { ok: false, errors, semantic };
  }
  return { ok: true, source, semantic };
}

function decode(input: string | Uint8Array): string {
  if (typeof input === "string") return input;
  return new TextDecoder("utf-8", { fatal: false }).decode(input);
}

/**
 * 解析 `website-source@1` 字节。
 * `sourceFormat` 给定时先过 §1.2 硬禁令 —— html 在**解析之前**就被拒。
 */
export function parseWebsiteSource(
  input: string | Uint8Array,
  options: { sourceFormat?: unknown } = {},
): WebsiteSource {
  if (options.sourceFormat !== undefined) {
    const admission = websiteSourceFormatAdmission(options.sourceFormat);
    if (!admission.ok) {
      throw new WebsiteSourceCarrierError(
        admission.message,
        admission.code === "website-source-html-forbidden"
          ? "website-source-html-forbidden"
          : "website-source-schema-invalid",
      );
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decode(input));
  } catch {
    throw new WebsiteSourceCarrierError(
      "website-source 不是合法 JSON。",
      "website-source-not-json",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WebsiteSourceCarrierError(
      "website-source 顶层必须是对象。",
      "website-source-not-object",
    );
  }
  const validation = validateWebsiteSource(parsed);
  if (!validation.ok) {
    throw new WebsiteSourceCarrierError(
      `website-source 未通过 §3.1 校验(schema ${validation.errors.length} 处 / 语义 ${validation.semantic.length} 处)。`,
      "website-source-schema-invalid",
      validation.errors,
    );
  }
  return validation.source;
}

/** 确定性序列化:字段序取 §3 Schema 声明序。 */
export function serializeWebsiteSource(source: WebsiteSource): string {
  return JSON.stringify({
    schema: source.schema,
    version: source.version,
    title: source.title,
    theme: source.theme,
    pages: source.pages,
    sections: source.sections,
    ...(source.navigation ? { navigation: source.navigation } : {}),
    ...(source.assets ? { assets: source.assets } : {}),
    ...(source.seo ? { seo: source.seo } : {}),
    attribution: source.attribution,
    dependencies: source.dependencies,
  });
}

export interface WebsiteCompletenessCriterion {
  id: string;
  basis: string;
  ok: boolean;
  actual: number | boolean | string;
  threshold: number | boolean | string;
}

export interface WebsiteSourceCompleteness {
  ok: boolean;
  criteria: WebsiteCompletenessCriterion[];
  failed: string[];
}

export interface WebsiteCompletenessInput {
  /** source blob 字节数(§8.1 下限 6,144 B)。 */
  byteSize?: number;
  /** 依赖闭包字节合计(§8.1 下限 8,192 B)。 */
  dependencyClosureBytes?: number;
  /** §8.2 抓帧颜色数(C35 ≥ 16),渲染侧提供。 */
  captureColorCount?: number;
}

function bodyCharacterCount(source: WebsiteSource): number {
  let total = 0;
  for (const section of source.sections || []) {
    total += String(section.heading || "").length;
    total += String(section.subheading || "").length;
    total += String(section.body || "").length;
    for (const item of section.items || []) {
      total += String(item.title || "").length;
      total += String(item.text || "").length;
    }
  }
  return total;
}

/**
 * §8.1 + §8.2 逐条判据。350 B 空壳 MUST 在这里被拒(§6 F1,错误码 `website-hollow`)。
 */
export function assessWebsiteSourceCompleteness(
  source: WebsiteSource,
  input: WebsiteCompletenessInput = {},
): WebsiteSourceCompleteness {
  const criteria: WebsiteCompletenessCriterion[] = [];
  const add = (
    id: string,
    basis: string,
    ok: boolean,
    actual: number | boolean | string,
    threshold: number | boolean | string,
  ) => criteria.push({ id, basis, ok, actual, threshold });

  const pages = source.pages || [];
  const sections = source.sections || [];
  const dependencies = source.dependencies || [];
  const kinds = new Set(sections.map((section) => section.kind));
  const byteSize = input.byteSize;

  add(
    "sourceByteFloor",
    "§8.1 / C27",
    byteSize === undefined
      ? false
      : byteSize >= WEBSITE_SOURCE_CONSTANTS.C27_SOURCE_BYTE_MIN &&
        byteSize <= WEBSITE_SOURCE_CONSTANTS.C28_SOURCE_BYTE_MAX,
    byteSize ?? "unknown",
    `${WEBSITE_SOURCE_CONSTANTS.C27_SOURCE_BYTE_MIN}–${WEBSITE_SOURCE_CONSTANTS.C28_SOURCE_BYTE_MAX}`,
  );
  add(
    "pageCount",
    "§8.2 / reviewed_material_catalog.py:2145",
    pages.length >= WEBSITE_SOURCE_CONSTANTS.C1_PAGE_COUNT_MIN &&
      pages.length <= WEBSITE_SOURCE_CONSTANTS.C2_PAGE_COUNT_MAX,
    pages.length,
    `≥ ${WEBSITE_SOURCE_CONSTANTS.C1_PAGE_COUNT_MIN}`,
  );
  add(
    "sectionCount",
    "§8.2 / :2147",
    sections.length >= WEBSITE_SOURCE_CONSTANTS.C3_SECTION_COUNT_MIN &&
      sections.length <= WEBSITE_SOURCE_CONSTANTS.C4_SECTION_COUNT_MAX,
    sections.length,
    `≥ ${WEBSITE_SOURCE_CONSTANTS.C3_SECTION_COUNT_MIN}`,
  );
  add(
    "dependencyCount",
    "§8.2 / :2149",
    dependencies.length >= WEBSITE_SOURCE_CONSTANTS.C9_DEPENDENCY_COUNT_MIN &&
      dependencies.length <= WEBSITE_SOURCE_CONSTANTS.C10_DEPENDENCY_COUNT_MAX,
    dependencies.length,
    `≥ ${WEBSITE_SOURCE_CONSTANTS.C9_DEPENDENCY_COUNT_MIN}`,
  );
  const minPageSectionIds = pages.length
    ? Math.min(...pages.map((page) => (page.sectionIds || []).length))
    : 0;
  add(
    "pageSectionIds",
    "§8.2 / C5",
    minPageSectionIds >= WEBSITE_SOURCE_CONSTANTS.C5_PAGE_SECTION_IDS_MIN,
    minPageSectionIds,
    `≥ ${WEBSITE_SOURCE_CONSTANTS.C5_PAGE_SECTION_IDS_MIN}`,
  );
  add(
    "sectionKindVariety",
    "§8.2 / C8(治「四个 hero 拼一页」)",
    kinds.size >= WEBSITE_SOURCE_CONSTANTS.C8_SECTION_KINDS_USED_MIN,
    kinds.size,
    `≥ ${WEBSITE_SOURCE_CONSTANTS.C8_SECTION_KINDS_USED_MIN}`,
  );
  const bodyCharacters = bodyCharacterCount(source);
  add(
    "bodyCharacters",
    "§8.2 / C26(治文本空洞)",
    bodyCharacters >= WEBSITE_SOURCE_CONSTANTS.C26_BODY_CHARACTERS_MIN,
    bodyCharacters,
    `≥ ${WEBSITE_SOURCE_CONSTANTS.C26_BODY_CHARACTERS_MIN}`,
  );
  const nonDecorative = sections.filter((section) => !section.decorative);
  const headed = nonDecorative.filter((section) =>
    String(section.heading || "").trim(),
  );
  add(
    "headingCoverage",
    "§8.2 / SC 2.4.6",
    headed.length === nonDecorative.length,
    `${headed.length}/${nonDecorative.length}`,
    "100%",
  );
  const imageItems = sections.flatMap((section) =>
    (section.items || []).filter((item) => Boolean(item.assetId)),
  );
  const alted = imageItems.filter(
    (item) =>
      String(item.alt || "").trim().length >=
      WEBSITE_SOURCE_CONSTANTS.C24_ALT_MIN_LENGTH,
  );
  add(
    "altCoverage",
    "§8.2 / SC 1.1.1",
    alted.length === imageItems.length,
    `${alted.length}/${imageItems.length}`,
    "100%",
  );
  const seoLength = String(source.seo?.description || "").length;
  add(
    "seoDescription",
    "§8.2 / C23",
    seoLength >= WEBSITE_SOURCE_CONSTANTS.C23_SEO_DESCRIPTION_MIN,
    seoLength,
    `≥ ${WEBSITE_SOURCE_CONSTANTS.C23_SEO_DESCRIPTION_MIN}`,
  );
  const entries = source.attribution?.entries || [];
  add(
    "attributionEntries",
    "§8.2",
    entries.length >= 1 &&
      entries.every(
        (entry) =>
          Boolean(entry.text) &&
          Boolean(entry.licenseCode) &&
          String(entry.licenseUrl || "").startsWith("https://"),
      ),
    entries.length,
    "≥ 1,三字段齐全",
  );
  add(
    "titleLength",
    "§8.2 / reviewed_material_catalog.py:3309",
    String(source.title || "").length >=
      WEBSITE_SOURCE_CONSTANTS.TITLE_MIN_LENGTH,
    String(source.title || "").length,
    `≥ ${WEBSITE_SOURCE_CONSTANTS.TITLE_MIN_LENGTH}`,
  );
  const unsafeHrefs = [
    ...sections.flatMap((section) => [
      ...(section.actions || []).map((action) => action.href),
      ...(section.items || [])
        .map((item) => item.href)
        .filter((href) => href !== undefined),
    ]),
    ...(source.navigation?.links || []).map((link) => link.href),
  ].filter((href) => !isSafeWebsiteHref(href));
  add(
    "hrefSchemes",
    "§8.2 / §5.4",
    unsafeHrefs.length === 0,
    unsafeHrefs.length,
    0,
  );
  add(
    "captureColorCount",
    "§8.2 / C35",
    (input.captureColorCount ?? -1) >=
      WEBSITE_SOURCE_CONSTANTS.C35_CAPTURE_COLOR_COUNT_MIN,
    input.captureColorCount ?? "unknown",
    `≥ ${WEBSITE_SOURCE_CONSTANTS.C35_CAPTURE_COLOR_COUNT_MIN}`,
  );
  add(
    "dependencyClosureBytes",
    "§8.1",
    (input.dependencyClosureBytes ?? -1) >=
      WEBSITE_SOURCE_CONSTANTS.DEPENDENCY_CLOSURE_BYTE_MIN &&
      (input.dependencyClosureBytes ?? Number.POSITIVE_INFINITY) <=
        WEBSITE_SOURCE_CONSTANTS.C29_DEPENDENCY_CLOSURE_BYTE_MAX,
    input.dependencyClosureBytes ?? "unknown",
    `${WEBSITE_SOURCE_CONSTANTS.DEPENDENCY_CLOSURE_BYTE_MIN}–${WEBSITE_SOURCE_CONSTANTS.C29_DEPENDENCY_CLOSURE_BYTE_MAX}`,
  );

  const failed = criteria.filter((entry) => !entry.ok).map((entry) => entry.id);
  return { ok: failed.length === 0, criteria, failed };
}

/** §5.1:改 `theme.accent` MUST 使全站强调色同步变化(不需逐 section 改色)。 */
export function retintWebsiteTheme(
  source: WebsiteSource,
  accent: string,
): WebsiteSource {
  return { ...source, theme: { ...source.theme, accent } };
}

/** 所有 `sections[].kind` 枚举成员在校验器里都可判(C7 = 13)。 */
export const WEBSITE_SECTION_KIND_COUNT = WEBSITE_SECTION_KINDS.length;
