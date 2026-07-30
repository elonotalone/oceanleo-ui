// W14 —— website-source 载体(`website` / `website-source@1`)的平台侧契约回归防线。
//
// 规格: docs/specs/oceanleo-material-and-game-v1/L1-carriers/website-source.md
//   §1.2 硬禁令 `html` 不得落库(ADR-04) · §1.3 不可信内容边界 · §1.4 生成器锁
//   §2 设计 token/栅格/字号 · §3 Schema · §3.2 物化与载入状态机
//   §3.3 452 份未物化模板的处置 · §4 常量 C1–C43 · §5.4 安全性 · §6 · §8
//
// 本文件同时是 §1.3 的「一行未动」凭据:断言两个载体目录与 EmbeddedRoute
// 都不触碰 sandbox 属性、postMessage target origin、CORS 正则与 cookie 域。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HTML_FORBIDDEN_SOURCE_FORMATS,
  VIEW_ONLY_TOLERATED_SOURCE_FORMATS,
  WEBSITE_CONTRAST_CONFLICTS,
  WEBSITE_CONTRAST_OBLIGATIONS,
  WEBSITE_SECTION_KINDS,
  WEBSITE_SOURCE_CARRIER_CONTRACT,
  WEBSITE_SOURCE_CONSTANTS,
  WEBSITE_SOURCE_FORMAT,
  WEBSITE_SOURCE_GRID,
  WEBSITE_SOURCE_JSON_SCHEMA,
  WEBSITE_SOURCE_REQUIREMENT_PATHS,
  WEBSITE_SOURCE_TOKENS,
  WEBSITE_SOURCE_TYPE_SCALE,
} from "../src/shell/website-source-carrier/website-source-schema.ts";
import {
  WebsiteSourceCarrierError,
  assessWebsiteSourceCompleteness,
  isSafeWebsiteHref,
  parseWebsiteSource,
  retintWebsiteTheme,
  serializeWebsiteSource,
  validateWebsiteSource,
  websiteSourceFormatAdmission,
} from "../src/shell/website-source-carrier/website-source-validate.ts";
import {
  WEBSITE_MATERIALIZE_CAP_REQUEST,
  WEBSITE_SOURCE_ILLEGAL_TRANSITIONS,
  WEBSITE_SOURCE_ISOLATION_INVARIANTS,
  WEBSITE_SOURCE_TRANSITIONS,
  isLegalWebsiteSourceTransition,
  judgeMaterializedBatch,
  websiteStructureJaccard,
} from "../src/shell/website-source-carrier/website-source-materialize-contract.ts";
import { contrastRatio } from "../src/shell/workflow-carrier/video-canvas-schema.ts";

function source(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const sha = (seed) => seed.repeat(64).slice(0, 64);

const PROSE =
  "海洋数据平台把潮汐、洋流与卫星遥感三路观测拉到同一张时间轴上，" +
  "并按站点、深度与季节三个维度做交叉切片，让研究者不用再手工对齐时间戳。" +
  "每一份切片都保留原始采样率与质控标记，导出时随产物带上署名与许可信息。";

function section(id, kind, extra = {}) {
  return {
    id,
    kind,
    heading: `${kind} 区块标题`,
    subheading: `${kind} 的副标题，说明这一段要回答什么问题。`,
    body: PROSE,
    ...extra,
  };
}

function websiteSource(overrides = {}) {
  const base = {
    schema: WEBSITE_SOURCE_FORMAT,
    version: 1,
    title: "海洋观测数据平台官网模板",
    theme: {
      accent: "#1F6FEB",
      background: "#FFFFFF",
      surface: "#F5F7FA",
      text: "#1F2328",
      muted: "#57606A",
      border: "#D0D7DE",
      radiusPx: 12,
      fontFamily: "Inter, system-ui, sans-serif",
      maxWidthPx: 1_200,
    },
    pages: [
      {
        id: "home",
        path: "/",
        title: "首页 · 海洋观测数据平台",
        description: "潮汐、洋流与卫星遥感三路观测的统一入口。",
        sectionIds: ["hero-main", "features", "stats-band", "pricing-plans", "faq-list", "footer-main"],
      },
      {
        id: "docs",
        path: "/docs",
        title: "接口文档 · 海洋观测数据平台",
        sectionIds: ["hero-main", "content-guide", "faq-list", "footer-main"],
      },
    ],
    sections: [
      section("hero-main", "hero", {
        actions: [
          { label: "开始使用", href: "/signup", variant: "primary" },
          { label: "查看文档", href: "https://docs.oceanleo.com/", variant: "secondary" },
        ],
        items: [
          {
            title: "统一时间轴",
            text: PROSE,
            assetId: "asset-hero",
            alt: "三路观测数据在同一张时间轴上的示意图",
          },
        ],
      }),
      section("features", "feature-grid", {
        items: [
          { title: "自动对齐", text: PROSE, icon: "clock" },
          { title: "质控标记", text: PROSE, icon: "shield" },
          {
            title: "批量导出",
            text: PROSE,
            assetId: "asset-export",
            alt: "批量导出面板的界面截图",
          },
        ],
      }),
      section("stats-band", "stats", {
        items: [
          { title: "观测站", value: "1,204" },
          { title: "累计样本", value: "9.8 亿" },
          { title: "覆盖年份", value: "1979–2026" },
        ],
      }),
      section("pricing-plans", "pricing", {
        background: "surface",
        items: [
          { title: "研究版", text: PROSE, value: "免费" },
          { title: "机构版", text: PROSE, value: "按席位" },
        ],
        actions: [{ label: "联系我们", href: "/contact" }],
      }),
      section("faq-list", "faq", {
        items: [
          { title: "数据更新频率？", text: PROSE },
          { title: "如何引用？", text: PROSE },
        ],
      }),
      section("content-guide", "content", { background: "surface" }),
      { id: "divider-band", kind: "content", decorative: true },
      section("footer-main", "footer", {
        items: [{ title: "许可", text: PROSE }],
      }),
    ],
    navigation: {
      brand: "OceanLeo Data",
      links: [
        { label: "首页", href: "/" },
        { label: "文档", href: "https://docs.oceanleo.com/" },
        { label: "定价", href: "/pricing" },
      ],
    },
    assets: [
      {
        id: "asset-hero",
        sha256: sha("a"),
        mediaType: "image/webp",
        byteSize: 184_320,
        licenseCode: "CC0-1.0",
      },
      {
        id: "asset-export",
        sha256: sha("b"),
        mediaType: "image/png",
        byteSize: 96_256,
        licenseCode: "CC0-1.0",
      },
    ],
    seo: {
      description:
        "潮汐、洋流与卫星遥感三路观测的统一检索、切片与导出平台，面向海洋研究者与机构用户。",
      keywords: ["海洋观测", "潮汐", "洋流", "卫星遥感"],
      ogImageAssetId: "asset-hero",
    },
    attribution: {
      entries: [
        {
          text: "首屏插图 by OceanLeo Studio",
          licenseCode: "CC0-1.0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          assetId: "asset-hero",
        },
      ],
    },
    dependencies: [
      {
        path: "assets/hero.webp",
        sha256: sha("a"),
        mediaType: "image/webp",
        byteSize: 184_320,
      },
      {
        path: "assets/inter-latin.woff2",
        sha256: sha("c"),
        mediaType: "font/woff2",
        byteSize: 28_672,
      },
    ],
  };
  return { ...base, ...overrides };
}

const HEALTHY_METRICS = {
  byteSize: 8_192,
  dependencyClosureBytes: 212_992,
  captureColorCount: 22,
};

// ---------------------------------------------------------------------------
// §1.2 硬禁令:`html` 不得落库
// ---------------------------------------------------------------------------

test("W14/ws §1.2 + §7 A12:source_format=html 被显式拒绝,天花板是 view_only", () => {
  assert.deepEqual([...HTML_FORBIDDEN_SOURCE_FORMATS], ["html", "text/html"]);

  for (const format of ["html", "text/html", "HTML", " Text/HTML "]) {
    const verdict = websiteSourceFormatAdmission(format);
    assert.equal(verdict.ok, false, format);
    assert.equal(verdict.code, "website-source-html-forbidden", format);
    assert.equal(verdict.editabilityCeiling, "view_only", format);
    assert.match(verdict.message, /§1\.2|ADR-04/);
  }

  // 唯一可编辑格式。
  const good = websiteSourceFormatAdmission(WEBSITE_SOURCE_FORMAT);
  assert.equal(good.ok, true);
  assert.equal(good.editabilityCeiling, "native");

  // 其余容忍格式落库同样只能是 view_only。
  for (const format of ["zip", "oceanleo.website-project.v1"]) {
    const verdict = websiteSourceFormatAdmission(format);
    assert.equal(verdict.ok, false, format);
    assert.equal(verdict.code, "website-source-view-only-format", format);
    assert.equal(verdict.editabilityCeiling, "view_only", format);
  }
  assert.deepEqual([...VIEW_ONLY_TOLERATED_SOURCE_FORMATS], [
    "html",
    "text/html",
    "zip",
    "oceanleo.website-project.v1",
  ]);

  for (const unknown of ["", null, undefined, "website-source@2"]) {
    const verdict = websiteSourceFormatAdmission(unknown);
    assert.equal(verdict.ok, false, String(unknown));
    assert.equal(verdict.editabilityCeiling, "none", String(unknown));
  }
});

test("W14/ws §1.2:html 在解析之前就被拒,没有任何参数组合能拿到 native", () => {
  const bytes = JSON.stringify(websiteSource());
  // 即便字节本身是完全合法的 website-source@1,声明 html 也一律拒。
  for (const format of ["html", "text/html"]) {
    assert.throws(
      () => parseWebsiteSource(bytes, { sourceFormat: format }),
      (error) =>
        error instanceof WebsiteSourceCarrierError &&
        error.code === "website-source-html-forbidden",
      format,
    );
  }
  // 正确格式照常解析。
  const parsed = parseWebsiteSource(bytes, {
    sourceFormat: WEBSITE_SOURCE_FORMAT,
  });
  assert.equal(parsed.schema, WEBSITE_SOURCE_FORMAT);

  // 无论 editability 怎么传都不改变判定 —— 判定只看格式。
  assert.equal(websiteSourceFormatAdmission("html").ok, false);
});

test("W14/ws §9 C-3:IR 里不得有 HTML 字符串注入点", () => {
  for (const injected of [
    "<script>fetch('/steal')</script>",
    "点这里 <iframe src=https://evil.test></iframe>",
    "<img src=x onerror=alert(1)>",
    "看这里 javascript:alert(1)",
    "<style>body{display:none}</style>",
  ]) {
    const withInjection = websiteSource();
    withInjection.sections[1].body = injected;
    const result = validateWebsiteSource(withInjection);
    assert.equal(result.ok, false, injected);
    assert.ok(
      result.semantic.some((entry) => entry.code === "html-injection"),
      injected,
    );
  }
  // 纯文本与受限 Markdown 子集照常通过。
  const markdown = websiteSource();
  markdown.sections[1].body = `${PROSE}\n\n- 第一条\n- 第二条\n\n**强调**与 [文档](/docs)。`;
  assert.equal(validateWebsiteSource(markdown).ok, true);
});

test("W14/ws §5.4 / §6 F6:危险 href 方案逐条拒绝", () => {
  for (const href of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "//evil.test/phish",
    "http://insecure.test/",
    "",
  ]) {
    assert.equal(isSafeWebsiteHref(href), false, href);
  }
  for (const href of ["/", "/docs", "/docs/api", "#anchor", "https://oceanleo.com/x"]) {
    assert.equal(isSafeWebsiteHref(href), true, href);
  }

  const unsafe = websiteSource();
  unsafe.sections[0].actions[0].href = "javascript:alert(1)";
  const result = validateWebsiteSource(unsafe);
  assert.equal(result.ok, false);
  assert.ok(result.semantic.some((entry) => entry.code === "unsafe-href"));
  assert.ok(
    assessWebsiteSourceCompleteness(unsafe, HEALTHY_METRICS).failed.includes(
      "hrefSchemes",
    ),
  );
});

// ---------------------------------------------------------------------------
// §1.3 不可信内容边界 —— 一行未动的凭据
// ---------------------------------------------------------------------------

test("W14/ws §1.3 + §9 C-9:两个载体目录不触碰任何隔离面", () => {
  assert.equal(WEBSITE_SOURCE_ISOLATION_INVARIANTS.length, 6);
  assert.ok(
    WEBSITE_SOURCE_ISOLATION_INVARIANTS.some((entry) =>
      entry.includes("oceanleo.app"),
    ),
  );

  const carrierFiles = [
    "../src/shell/website-source-carrier/website-source-schema.ts",
    "../src/shell/website-source-carrier/website-source-validate.ts",
    "../src/shell/website-source-carrier/website-source-materialize-contract.ts",
    "../src/shell/workflow-carrier/video-canvas-schema.ts",
    "../src/shell/workflow-carrier/video-canvas-source.ts",
    "../src/shell/workflow-carrier/video-canvas-port-types.ts",
    "../src/shell/workflow-carrier/video-canvas-determinism.ts",
  ];
  for (const file of carrierFiles) {
    const text = source(file);
    // 代码行(去掉注释)里不得出现任何隔离面的写入/构造。
    const code = text
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    for (const forbidden of [
      "sandbox=",
      "allow-same-origin",
      "allow-scripts",
      "postMessage(",
      "targetOrigin",
      "Access-Control-Allow",
      "cookieDomainFor",
      "document.cookie",
      "dangerouslySetInnerHTML",
      "<iframe",
    ]) {
      assert.equal(
        code.includes(forbidden),
        false,
        `${file}: 载体模块不得出现 ${forbidden}(§1.3)`,
      );
    }
  }

  // EmbeddedRoute 的宿主侧闸门也不许碰隔离面:既有 origin 校验保持原样,
  // 且本 owner 没有新增 iframe、sandbox 或 postMessage 投递。
  const route = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  assert.equal(route.includes("<iframe"), false);
  assert.equal(/sandbox\s*=/.test(route), false);
  assert.equal(route.includes("postMessage("), false);
  assert.equal(route.includes("allow-same-origin"), false);
  // 既有的收信 origin 闸门必须仍在(exact-origin + source + instance)。
  assert.ok(route.includes("isTrustedEditorOrigin(editorOrigin)"));
  assert.ok(route.includes("if (event.origin !== editorOrigin) return;"));
  assert.ok(route.includes("event.source !== frame.contentWindow"));
});

test("W14/ws §1.2:EmbeddedRoute 在挂载 embed 之前就拒掉 html 站点素材", () => {
  const route = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  assert.ok(
    route.includes(
      'import { websiteSourceFormatAdmission } from "../website-source-carrier/website-source-validate";',
    ),
    "宿主侧闸门必须复用载体的唯一判定入口",
  );
  assert.match(
    route,
    /carrierOpenRejection[\s\S]{0,600}website-source-html-forbidden/,
    "html 拒绝路径必须落在 open 闸门上",
  );
  // 拒绝态 MUST 不渲染 EmbedEditorPane,而是给出可读的 alert 面板。
  assert.match(
    route,
    /stage: carrierOpenRejection \? \([\s\S]{0,400}data-carrier-admission="rejected"/,
  );
  // 拒绝态同时封住导出与 flush(保存)两条出口。
  assert.match(route, /disabled:[\s\S]{0,120}Boolean\(carrierOpenRejection\)/);
  assert.match(
    route,
    /flush:\s*\n?\s*carrierOpenRejection \|\| carrierSaveRejection/,
  );
  // workflow 侧:legacy 格式封的是保存(新产出),不是打开(存量迁移不归本 owner)。
  assert.ok(route.includes("workflow-legacy-source-format"));
});

// ---------------------------------------------------------------------------
// §1.1 / §3 结构
// ---------------------------------------------------------------------------

test("W14/ws §1.1 四元组与 §3 Schema 字段逐条对规格", () => {
  const contract = WEBSITE_SOURCE_CARRIER_CONTRACT;
  assert.equal(contract.featureId, "website_finetuning");
  assert.equal(contract.artifactType, "website");
  assert.equal(contract.sourceFormat, "website-source@1");
  assert.equal(contract.editorCapability, "website-editor");
  assert.equal(contract.editability, "native");
  assert.equal(contract.sourceIntegrity, "complete_dependency_closure");
  // §1.1 末条:routeType embed + native 视口,MUST NOT 改为本地 route。
  assert.equal(contract.routeType, "embed");
  assert.equal(contract.viewportOwnership, "native");
  assert.equal(contract.toolbarOwnership, "native");
  assert.deepEqual([...WEBSITE_SOURCE_REQUIREMENT_PATHS], ["pages", "sections"]);

  const schema = WEBSITE_SOURCE_JSON_SCHEMA;
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "schema",
    "version",
    "title",
    "theme",
    "pages",
    "sections",
    "attribution",
    "dependencies",
  ]);
  assert.equal(schema.properties.schema.const, "website-source@1");
  assert.equal(schema.properties.version.const, 1);
  assert.equal(schema.properties.title.minLength, 8);
  assert.equal(schema.properties.title.maxLength, 300);

  assert.deepEqual(schema.properties.theme.required, [
    "accent",
    "background",
    "text",
  ]);
  assert.equal(schema.properties.theme.properties.radiusPx.maximum, 32);
  assert.equal(schema.properties.theme.properties.maxWidthPx.minimum, 640);
  assert.equal(schema.properties.theme.properties.maxWidthPx.maximum, 1_600);
  assert.equal(schema.$defs.color.pattern, "^#[0-9A-Fa-f]{6}$");

  const pages = schema.properties.pages;
  assert.equal(pages.minItems, 1);
  assert.equal(pages.maxItems, 24);
  assert.deepEqual(pages.items.required, ["id", "path", "title", "sectionIds"]);
  assert.equal(pages.items.properties.path.pattern, "^/[a-z0-9/_-]*$");
  assert.equal(pages.items.properties.title.minLength, 4);
  assert.equal(pages.items.properties.sectionIds.minItems, 4);
  assert.equal(pages.items.properties.sectionIds.maxItems, 40);

  const sections = schema.properties.sections;
  assert.equal(sections.minItems, 4);
  assert.equal(sections.maxItems, 200);
  assert.deepEqual(sections.items.required, ["id", "kind"]);
  assert.deepEqual(sections.items.properties.kind.enum, [...WEBSITE_SECTION_KINDS]);
  assert.equal(sections.items.properties.kind.enum.length, 13);
  assert.equal(sections.items.properties.body.maxLength, 4_000);
  assert.equal(sections.items.properties.items.maxItems, 24);
  assert.equal(sections.items.properties.actions.maxItems, 3);
  assert.deepEqual(sections.items.properties.actions.items.required, [
    "label",
    "href",
  ]);
  // §3.1 的 allOf/if-then:非装饰 section 必须有 heading。
  assert.deepEqual(sections.items.allOf, [
    {
      if: { properties: { decorative: { const: false } } },
      then: { required: ["heading"] },
    },
  ]);

  assert.equal(schema.properties.navigation.properties.links.maxItems, 12);
  assert.equal(schema.properties.assets.maxItems, 200);
  assert.equal(schema.properties.assets.items.properties.byteSize.minimum, 512);
  assert.equal(
    schema.properties.assets.items.properties.byteSize.maximum,
    8_388_608,
  );
  assert.equal(schema.properties.seo.properties.description.minLength, 40);
  assert.equal(schema.properties.seo.properties.description.maxLength, 320);
  assert.equal(schema.properties.attribution.properties.entries.minItems, 1);
  assert.equal(
    schema.properties.attribution.properties.entries.items.properties.licenseUrl
      .pattern,
    "^https://",
  );
  assert.equal(schema.properties.dependencies.minItems, 1);
  assert.equal(schema.properties.dependencies.maxItems, 512);
  assert.deepEqual(schema.properties.dependencies.items.required, [
    "path",
    "sha256",
    "mediaType",
  ]);
});

test("W14/ws §3.1 校验:参照工程通过,越界与多余字段被受控拒绝", () => {
  const ok = validateWebsiteSource(websiteSource());
  assert.equal(
    ok.ok,
    true,
    JSON.stringify({ errors: ok.errors, semantic: ok.semantic }, null, 2),
  );

  const cases = [
    [{ schema: "website-source@2" }, "const"],
    [{ version: 2 }, "const"],
    [{ title: "太短" }, "minLength"],
    [{ sections: websiteSource().sections.slice(0, 3) }, "minItems"],
    [{ dependencies: [] }, "minItems"],
    [{ pages: [] }, "minItems"],
  ];
  for (const [override, keyword] of cases) {
    const result = validateWebsiteSource(websiteSource(override));
    assert.equal(result.ok, false, JSON.stringify(override));
    assert.ok(
      result.errors.some((error) => error.keyword === keyword),
      `${JSON.stringify(override)} 期望 ${keyword}`,
    );
  }

  // 顶层夹带 html 字段(ADR-04 想堵的形状)直接被 additionalProperties 拒。
  const smuggled = validateWebsiteSource({ ...websiteSource(), html: "<div/>" });
  assert.equal(smuggled.ok, false);
  assert.ok(
    smuggled.errors.some((error) => error.keyword === "additionalProperties"),
  );

  // requirement_paths 逐条非空。
  const noPages = validateWebsiteSource(websiteSource({ pages: [] }));
  assert.ok(noPages.errors.some((error) => error.keyword === "requirement_paths"));

  // §6 F7 / SC 2.4.6:非装饰 section 缺 heading 是校验错误;标了 decorative 就放行。
  const noHeading = websiteSource();
  delete noHeading.sections[2].heading;
  const headingResult = validateWebsiteSource(noHeading);
  assert.equal(headingResult.ok, false);
  assert.ok(headingResult.semantic.some((entry) => entry.code === "missing-heading"));
  assert.ok(headingResult.errors.some((error) => error.keyword === "required"));

  // SC 1.1.1:带图 item 缺 alt。
  const noAlt = websiteSource();
  noAlt.sections[0].items[0].alt = "图";
  assert.ok(
    validateWebsiteSource(noAlt).semantic.some(
      (entry) => entry.code === "missing-alt",
    ),
  );
});

test("W14/ws §5.1 / §6 F4:悬空区块引用逐条列出并使产物 invalid", () => {
  const dangling = websiteSource();
  dangling.pages[0].sectionIds = [
    "hero-main",
    "features",
    "ghost-band",
    "another-ghost",
  ];
  const result = validateWebsiteSource(dangling);
  assert.equal(result.ok, false);
  const codes = result.semantic.filter(
    (entry) => entry.code === "dangling-section-id",
  );
  assert.equal(codes.length, 2, "两个悬空 id 都要逐条列出");
  assert.ok(codes[0].detail.includes("ghost-band"));

  // §5.1:改 theme.accent 全站联动 —— 不需逐 section 改色。
  const retinted = retintWebsiteTheme(websiteSource(), "#B31D28");
  assert.equal(retinted.theme.accent, "#B31D28");
  assert.deepEqual(retinted.sections, websiteSource().sections);
  assert.equal(validateWebsiteSource(retinted).ok, true);
});

// ---------------------------------------------------------------------------
// §3.2 状态机 · §3.3 452 份处置
// ---------------------------------------------------------------------------

test("W14/ws §3.2 状态机:五条非法迁移一条都不许,尤其 route-only → registered", () => {
  assert.equal(isLegalWebsiteSourceTransition("route-only", "ir-generated"), true);
  assert.equal(
    isLegalWebsiteSourceTransition("ir-generated", "closure-resolved"),
    true,
  );
  assert.equal(isLegalWebsiteSourceTransition("closure-resolved", "registered"), true);
  assert.equal(isLegalWebsiteSourceTransition("registered", "ready"), true);
  assert.equal(isLegalWebsiteSourceTransition("saving", "dirty"), true);

  assert.equal(WEBSITE_SOURCE_ILLEGAL_TRANSITIONS.length, 5);
  // 「把现算 HTML 直接当字节入库」这条一次都不许发生(§9 C-5)。
  assert.equal(isLegalWebsiteSourceTransition("route-only", "registered"), false);
  for (const illegal of WEBSITE_SOURCE_ILLEGAL_TRANSITIONS) {
    assert.equal(
      isLegalWebsiteSourceTransition(illegal.from, illegal.to),
      false,
      `${illegal.from} → ${illegal.to}`,
    );
  }
  assert.equal(isLegalWebsiteSourceTransition("invalid", "ready"), false);
  assert.equal(isLegalWebsiteSourceTransition("route-only", "ready"), false);
  assert.ok(WEBSITE_SOURCE_TRANSITIONS.length >= 10);
});

test("W14/ws §3.3 + §1.4:452 份物化是需求描述而非第二套物化器", () => {
  const request = WEBSITE_MATERIALIZE_CAP_REQUEST;
  assert.equal(request.templateTotal, 500);
  assert.equal(request.materialized, 48);
  assert.equal(request.pending, 452);
  assert.equal(request.subclasses, 105);

  // 现状是自洽的:12 个 app × 每 app 4 份 = 48 份已物化,余 452。
  assert.equal(request.currentPerAppCap, 4);
  assert.equal(request.websiteAppCount * request.currentPerAppCap, request.materialized);
  assert.equal(request.materialized + request.pending, request.templateTotal);

  // 交给 5号 的下界必须是算得出来的,不是拍的。
  assert.equal(
    request.singleSitePerAppMin,
    Math.ceil(request.templateTotal / request.websiteAppCount),
  );
  assert.equal(
    request.twoSitePerAppMin,
    Math.ceil(request.templateTotal / (request.websiteAppCount * 2)),
  );
  assert.equal(
    request.variantPerSubclassMin,
    Math.ceil(request.templateTotal / request.subclasses),
  );
  // DB CHECK 的硬上界现在低于单站方案的下界 —— 这一条要一起提,否则第 25 份就撞 23514。
  assert.ok(request.currentPositionUpperBound < request.singleSitePerAppMin);

  // 上一轮记的卡点已由 5号 解开,交接里要留对照而不是继续报一个假卡点。
  assert.equal(request.resolvedBlocker.symbol, "PER_APP = MATERIAL_MAX_COUNT");
  assert.ok(request.resolvedBlocker.nowReadsFrom.includes("material-count-policy.json"));
  assert.ok(request.capSites.every((entry) => entry.includes("material-count-policy.json")));

  assert.deepEqual([...request.generatorLock], [
    "lib/template-website-source.ts",
    "scripts/oceanleo-asset-website-templates-materialize.mjs",
  ]);
  assert.ok(request.mustNot.some((entry) => entry.includes("MATERIAL_MAX_COUNT")));
  assert.ok(request.mustNot.some((entry) => entry.includes("第二套物化器")));
  assert.ok(request.mustNot.some((entry) => entry.includes("positionUpperBound")));
  assert.equal(request.acceptance.length, 5);

  // §1.4 生成器锁的落地凭据:本 owner 的三个文件里没有任何生成或写盘代码。
  for (const file of [
    "../src/shell/website-source-carrier/website-source-schema.ts",
    "../src/shell/website-source-carrier/website-source-validate.ts",
    "../src/shell/website-source-carrier/website-source-materialize-contract.ts",
  ]) {
    const code = source(file)
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    for (const forbidden of [
      "writeFile",
      "node:fs",
      "mkdir",
      "MATERIAL_MAX_COUNT =",
      "function materialize",
      "function generateWebsiteSource",
    ]) {
      assert.equal(code.includes(forbidden), false, `${file}: ${forbidden}`);
    }
  }
  // 反过来:F3 点名的种子核对必须**作为需求**留在交接条目里,
  // 由上限持有者去核,不由本 owner 自己动 lib/template-dna.ts。
  assert.ok(
    request.acceptance.some((entry) => entry.includes("template-dna.ts")),
    "种子是否真的改变结构必须写成交接判据",
  );
});

test("W14/ws §3.3 / §6 F3:只换色的变体判孪生,结构有差异才收", () => {
  const base = websiteSource();
  const recolored = websiteSource();
  recolored.title = "另一份海洋观测数据平台官网模板";
  recolored.theme.accent = "#8250DF";
  // 只改色值、只改标题 → 结构 token 集完全相同。
  assert.equal(websiteStructureJaccard(base, recolored), 1);

  const twinVerdict = judgeMaterializedBatch([
    { subclass: "ocean-data", variant: "v1", source: base, metrics: HEALTHY_METRICS },
    {
      subclass: "ocean-data",
      variant: "v2",
      source: recolored,
      metrics: HEALTHY_METRICS,
    },
  ]);
  assert.equal(twinVerdict.ok, false);
  assert.ok(twinVerdict.rejections.some((entry) => entry.code === "twin"));

  // 结构真的不同(换区块语法与区块序)才算一个新变体。
  const restructured = websiteSource();
  restructured.title = "海洋观测数据平台 · 画廊版官网模板";
  restructured.sections = [
    section("hero-main", "hero", {
      actions: [{ label: "开始使用", href: "/signup" }],
    }),
    section("gallery-band", "gallery", {
      items: [
        {
          title: "观测影像",
          text: PROSE,
          assetId: "asset-hero",
          alt: "卫星遥感影像拼图",
        },
      ],
    }),
    section("team-band", "team", { items: [{ title: "团队", text: PROSE }] }),
    section("timeline-band", "timeline", {
      items: [{ title: "1979", text: PROSE }],
    }),
    section("testimonial-band", "testimonial", {
      items: [{ title: "用户评价", text: PROSE }],
    }),
    section("contact-band", "contact", { actions: [{ label: "联系", href: "/contact" }] }),
    section("footer-main", "footer"),
  ];
  restructured.pages = [
    {
      id: "home",
      path: "/",
      title: "首页 · 画廊版",
      sectionIds: [
        "hero-main",
        "gallery-band",
        "timeline-band",
        "footer-main",
      ],
    },
  ];
  assert.ok(
    websiteStructureJaccard(base, restructured) <
      WEBSITE_SOURCE_CONSTANTS.C42_FAMILY_JACCARD_MAX,
    "换掉区块语法构成后必须低于 0.85",
  );
  const accepted = judgeMaterializedBatch([
    { subclass: "ocean-data", variant: "v1", source: base, metrics: HEALTHY_METRICS },
    {
      subclass: "ocean-gallery",
      variant: "v1",
      source: restructured,
      metrics: HEALTHY_METRICS,
    },
  ]);
  assert.equal(accepted.ok, true, JSON.stringify(accepted.rejections, null, 2));
  assert.equal(accepted.accepted, 2);

  // 不合格的一份 MUST NOT 因为「要凑 500 份」而放行。
  const hollow = judgeMaterializedBatch([
    {
      subclass: "ocean-data",
      variant: "hollow",
      source: base,
      metrics: { ...HEALTHY_METRICS, byteSize: 350 },
    },
  ]);
  assert.equal(hollow.ok, false);
  assert.equal(hollow.accepted, 0);
  assert.equal(hollow.rejections[0].code, "incomplete");
  assert.deepEqual(hollow.rejections[0].failed, ["sourceByteFloor"]);
});

// ---------------------------------------------------------------------------
// §8 字节下限与完备判据 · §2 视觉靶 · §4 常量
// ---------------------------------------------------------------------------

test("W14/ws §8.1 / §8.2:参照工程全条达标,350 B 空壳必须不合格", () => {
  const serialized = serializeWebsiteSource(websiteSource());
  const byteSize = Buffer.byteLength(serialized, "utf8");
  assert.ok(
    byteSize >= WEBSITE_SOURCE_CONSTANTS.C27_SOURCE_BYTE_MIN,
    `参照工程应过 6,144 B 下限,实得 ${byteSize}`,
  );

  const verdict = assessWebsiteSourceCompleteness(websiteSource(), {
    ...HEALTHY_METRICS,
    byteSize,
  });
  assert.equal(
    verdict.ok,
    true,
    `未达标项:${JSON.stringify(verdict.criteria.filter((entry) => !entry.ok), null, 2)}`,
  );
  for (const id of [
    "sourceByteFloor",
    "pageCount",
    "sectionCount",
    "dependencyCount",
    "pageSectionIds",
    "sectionKindVariety",
    "bodyCharacters",
    "headingCoverage",
    "altCoverage",
    "seoDescription",
    "attributionEntries",
    "titleLength",
    "hrefSchemes",
    "captureColorCount",
    "dependencyClosureBytes",
  ]) {
    assert.ok(verdict.criteria.some((entry) => entry.id === id), `缺判据 ${id}`);
  }
  for (const criterion of verdict.criteria) {
    assert.match(criterion.basis, /§|:\d+/);
  }

  // §6 F1:350 B 空壳 —— schema + title + 一两个空 section。
  const hollow = JSON.stringify({
    schema: WEBSITE_SOURCE_FORMAT,
    version: 1,
    title: "空壳网站素材",
    theme: { accent: "#1F6FEB", background: "#FFFFFF", text: "#1F2328" },
    pages: [{ id: "home", path: "/", title: "首页", sectionIds: [] }],
    sections: [{ id: "hero", kind: "hero" }],
    attribution: { entries: [] },
    dependencies: [],
  });
  assert.ok(hollow.length < 500, `空壳应在 350 B 量级,实得 ${hollow.length}`);
  assert.throws(
    () => parseWebsiteSource(hollow),
    (error) =>
      error instanceof WebsiteSourceCarrierError &&
      error.code === "website-source-schema-invalid",
  );

  // 「四个 hero 拼一页」:计数、正文量都够,只有区块语法种类不够 ——
  // 这一条必须是**唯一**不达标项,否则判据就不是在治 C8 那件事。
  const monoKind = websiteSource();
  monoKind.sections = ["a", "b", "c", "d", "e", "f"].map((id) =>
    section(`hero-${id}`, "hero", {
      items: [{ title: "要点", text: PROSE }],
    }),
  );
  monoKind.pages = [
    {
      id: "home",
      path: "/",
      title: "首页 · 四个 hero",
      sectionIds: ["hero-a", "hero-b", "hero-c", "hero-d"],
    },
  ];
  const monoVerdict = assessWebsiteSourceCompleteness(monoKind, {
    ...HEALTHY_METRICS,
    byteSize,
  });
  assert.equal(monoVerdict.ok, false);
  assert.deepEqual(monoVerdict.failed, ["sectionKindVariety"]);

  // 文本空洞:计数与语法都够,正文字符数不够。
  const thinText = websiteSource();
  thinText.sections = thinText.sections.map((entry) => ({
    ...entry,
    body: "短",
    items: (entry.items || []).map((item) => ({ ...item, text: "短" })),
  }));
  assert.ok(
    assessWebsiteSourceCompleteness(thinText, {
      ...HEALTHY_METRICS,
      byteSize,
    }).failed.includes("bodyCharacters"),
  );

  // 逐条打破字节与抓帧。
  assert.deepEqual(
    assessWebsiteSourceCompleteness(websiteSource(), {
      ...HEALTHY_METRICS,
      byteSize: 350,
    }).failed,
    ["sourceByteFloor"],
  );
  assert.deepEqual(
    assessWebsiteSourceCompleteness(websiteSource(), {
      ...HEALTHY_METRICS,
      byteSize,
      captureColorCount: 15,
    }).failed,
    ["captureColorCount"],
  );
});

test("W14/ws §2 视觉靶:设计 token 逐值、对比度实算与已登记冲突", () => {
  assert.equal(WEBSITE_SOURCE_TOKENS["site.bg"], "#FFFFFF");
  assert.equal(WEBSITE_SOURCE_TOKENS["site.surface"], "#F5F7FA");
  assert.equal(WEBSITE_SOURCE_TOKENS["site.text"], "#1F2328");
  assert.equal(WEBSITE_SOURCE_TOKENS["site.muted"], "#57606A");
  assert.equal(WEBSITE_SOURCE_TOKENS["site.accent"], "#1F6FEB");
  assert.equal(WEBSITE_SOURCE_TOKENS["site.border"], "#D0D7DE");
  assert.equal(WEBSITE_SOURCE_TOKENS["site.control.border"], "#7D8590");

  for (const obligation of WEBSITE_CONTRAST_OBLIGATIONS) {
    const ratios = obligation.bases.map((basis) =>
      contrastRatio(
        WEBSITE_SOURCE_TOKENS[obligation.token],
        WEBSITE_SOURCE_TOKENS[basis],
      ),
    );
    const worst = Math.min(...ratios);
    assert.ok(
      worst >= obligation.minimumRatio,
      `${obligation.token} 最小实算 ${worst.toFixed(2)} < ${obligation.minimumRatio}`,
    );
    assert.ok(
      Math.abs(worst - obligation.measuredMinimumRatio) < 0.01,
      `${obligation.token} 实算 ${worst.toFixed(4)} 与登记值 ${obligation.measuredMinimumRatio} 不符`,
    );
  }

  // §2.1 订正后的射程划分:装饰线不套 SC 1.4.11,控件边界两底都要 ≥ 3.0:1。
  const decorative = WEBSITE_CONTRAST_OBLIGATIONS.find(
    (entry) => entry.token === "site.border",
  );
  assert.equal(decorative.criterion, "self-defined-layering");
  assert.ok(contrastRatio("#D0D7DE", "#FFFFFF") < 3);
  const control = WEBSITE_CONTRAST_OBLIGATIONS.find(
    (entry) => entry.token === "site.control.border",
  );
  assert.equal(control.criterion, "SC 1.4.11");
  assert.deepEqual([...control.bases], ["site.bg", "site.surface"]);
  assert.ok(contrastRatio("#7D8590", "#F5F7FA") >= 3);

  // 规格与实测的冲突必须被登记(而不是被悄悄改掉规格取值)。
  assert.equal(WEBSITE_CONTRAST_CONFLICTS.length, 1);
  const conflict = WEBSITE_CONTRAST_CONFLICTS[0];
  assert.equal(conflict.token, "site.accent");
  assert.equal(conflict.base, "site.surface");
  const measured = contrastRatio("#1F6FEB", "#F5F7FA");
  assert.ok(measured < conflict.declaredMinimumRatio);
  assert.ok(Math.abs(measured - conflict.measuredRatio) < 0.01);

  assert.equal(WEBSITE_SOURCE_GRID.contentMaxWidthPx, 1_200);
  assert.equal(WEBSITE_SOURCE_GRID.columns, 12);
  assert.equal(WEBSITE_SOURCE_GRID.columnGapPx, 24);
  assert.equal(WEBSITE_SOURCE_GRID.pageGutterDesktopPx, 48);
  assert.equal(WEBSITE_SOURCE_GRID.pageGutterMobilePx, 20);
  assert.equal(WEBSITE_SOURCE_GRID.sectionGapPx, 96);
  assert.equal(WEBSITE_SOURCE_GRID.cardRadiusPx, 12);
  assert.deepEqual([...WEBSITE_SOURCE_GRID.breakpointsPx], [640, 1_024, 1_280]);

  assert.deepEqual({ ...WEBSITE_SOURCE_TYPE_SCALE.hero }, { desktop: 56, mobile: 34 });
  assert.deepEqual({ ...WEBSITE_SOURCE_TYPE_SCALE.h2 }, { desktop: 36, mobile: 26 });
  assert.deepEqual({ ...WEBSITE_SOURCE_TYPE_SCALE.h3 }, { desktop: 22, mobile: 19 });
  assert.deepEqual({ ...WEBSITE_SOURCE_TYPE_SCALE.body }, { desktop: 16, mobile: 16 });
  assert.deepEqual({ ...WEBSITE_SOURCE_TYPE_SCALE.caption }, { desktop: 12, mobile: 12 });
});

test("W14/ws §4 常量表 C1–C43 逐值对规格", () => {
  const c = WEBSITE_SOURCE_CONSTANTS;
  assert.equal(c.C1_PAGE_COUNT_MIN, 1);
  assert.equal(c.C2_PAGE_COUNT_MAX, 24);
  assert.equal(c.C3_SECTION_COUNT_MIN, 4);
  assert.equal(c.C4_SECTION_COUNT_MAX, 200);
  assert.equal(c.C5_PAGE_SECTION_IDS_MIN, 4);
  assert.equal(c.C6_PAGE_SECTION_IDS_MAX, 40);
  assert.equal(c.C7_SECTION_KIND_COUNT, 13);
  assert.equal(WEBSITE_SECTION_KINDS.length, c.C7_SECTION_KIND_COUNT);
  assert.equal(c.C8_SECTION_KINDS_USED_MIN, 4);
  assert.equal(c.C9_DEPENDENCY_COUNT_MIN, 1);
  assert.equal(c.C10_DEPENDENCY_COUNT_MAX, 512);
  assert.equal(c.C11_ASSET_BYTE_MIN, 512);
  assert.equal(c.C11_ASSET_BYTE_MAX, 8_388_608);
  assert.equal(c.C12_ASSET_COUNT_MAX, 200);
  assert.equal(c.C13_CONTENT_MAX_WIDTH_PX, 1_200);
  assert.equal(c.C14_GRID_COLUMNS, 12);
  assert.equal(c.C15_COLUMN_GAP_PX, 24);
  assert.equal(c.C16_SECTION_GAP_PX, 96);
  assert.deepEqual([...c.C17_BREAKPOINTS_PX], [640, 1_024, 1_280]);
  assert.equal(c.C18_CARD_RADIUS_PX, 12);
  assert.deepEqual({ ...c.C19_HERO_FONT_PX }, { desktop: 56, mobile: 34 });
  assert.equal(c.C20_BODY_FONT_PX, 16);
  assert.equal(c.C21_SECTION_ACTIONS_MAX, 3);
  assert.equal(c.C22_NAVIGATION_LINKS_MAX, 12);
  assert.equal(c.C23_SEO_DESCRIPTION_MIN, 40);
  assert.equal(c.C23_SEO_DESCRIPTION_MAX, 320);
  assert.equal(c.C24_ALT_MIN_LENGTH, 4);
  assert.equal(c.C25_PAGE_TITLE_MIN_LENGTH, 4);
  assert.equal(c.C26_BODY_CHARACTERS_MIN, 800);
  assert.equal(c.C27_SOURCE_BYTE_MIN, 6_144);
  assert.equal(c.C28_SOURCE_BYTE_MAX, 4_194_304);
  assert.equal(c.C29_DEPENDENCY_CLOSURE_BYTE_MAX, 67_108_864);
  assert.equal(c.C30_LCP_MS, 2_500);
  assert.equal(c.C31_CLS, 0.1);
  assert.equal(c.C32_INP_MS, 200);
  assert.equal(c.C33_COVER_MIN_EDGE_PX, 128);
  assert.deepEqual({ ...c.C34_CAPTURE_CANVAS_PX }, { width: 1_280, height: 800 });
  assert.equal(c.C35_CAPTURE_COLOR_COUNT_MIN, 16);
  assert.equal(c.C36_NATIVE_INVENTORY, 301);
  assert.equal(c.C37_HTML_VIEW_ONLY_INVENTORY, 9);
  assert.equal(c.C38_ASSET_TEMPLATE_TOTAL, 500);
  assert.equal(c.C39_MATERIALIZED_COUNT, 48);
  assert.equal(c.C40_PENDING_COUNT, 452);
  assert.equal(c.C41_TEMPLATE_SUBCLASS_COUNT, 105);
  assert.equal(c.C42_FAMILY_JACCARD_MAX, 0.85);
  assert.equal(c.C43_TWIN_THRESHOLD, 0.99);
  assert.equal(c.DEPENDENCY_CLOSURE_BYTE_MIN, 8_192);
  assert.equal(c.TITLE_MIN_LENGTH, 8);
  // C30–C32 由发布站点承担,MUST NOT 进本载体的完备判据。
  const ids = assessWebsiteSourceCompleteness(websiteSource(), HEALTHY_METRICS)
    .criteria.map((entry) => entry.id)
    .join(",");
  for (const forbidden of ["lcp", "cls", "inp"]) {
    assert.equal(ids.toLowerCase().includes(forbidden), false, forbidden);
  }
});
