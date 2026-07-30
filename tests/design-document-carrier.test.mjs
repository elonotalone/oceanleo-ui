import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_ARTBOARD_TIERS,
  DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS,
  DESIGN_DOCUMENT_CONSTANTS,
  DESIGN_FONT_SIZE_TIERS,
  DESIGN_FORBIDDEN_LICENSE_CODES,
  DESIGN_GRID,
  DesignDocumentCarrierError,
  designArtboardTier,
  designFontSizePx,
  designSafeMarginPx,
  parseDesignDocumentProject,
  serializeDesignDocumentProject,
  snapToDesignGrid,
  validateDesignDocumentProject,
} from "../src/shell/image-editor/design-document-schema.ts";
import {
  DESIGN_DOCUMENT_ILLEGAL_TRANSITIONS,
  assertDesignDocumentCarrierConformance,
  designDocumentCoverageRatio,
  designDocumentEvidence,
  designDocumentLicenseManifest,
  designDocumentRenderDigest,
  designDocumentSourceCompleteness,
  designDocumentTransitionAllowed,
  evaluateDesignDocumentCompleteness,
  loadDesignDocumentCarrier,
  recolorDesignDocumentPalette,
  setDesignDocumentElementText,
  verifyDesignDocumentLayerOrder,
} from "../src/shell/image-editor/design-document-carrier.ts";
import {
  assertDesignDocumentCarrierSource,
  isDesignDocumentCarrierSource,
} from "../src/shell/design-composite-commit.ts";

const encoder = new TextEncoder();
const byteSize = (text) => encoder.encode(text).byteLength;

/**
 * 一份「像真产物」的设计稿:1080×1080 方图,五种元素类型、七个文本元素、
 * 一张署名齐全的配图。padPath 撑的是路径数据本身,不是空白字节 —— §8.1 的
 * 16 KiB 下限就是要求这种内容密度(库内真产物均值 45,179 B)。
 */
function designFixture({ elementCount = 24, padPath = 3600 } = {}) {
  const elements = [];
  let z = 0;
  const push = (element) => elements.push({ ...element, z: z++ });

  push({ id: "bg-panel", type: "rect", x: 0, y: 0, width: 1080, height: 1080, fill: "#0B1F3A" });
  push({
    id: "title-main",
    type: "text",
    x: 80,
    y: 120,
    width: 900,
    height: 140,
    text: "海洋科普系列 · 深海生物图谱",
    fontSizePx: 100,
    fill: "#FFFFFF",
  });
  push({
    id: "subtitle-1",
    type: "text",
    x: 80,
    y: 280,
    width: 900,
    height: 80,
    text: "从透光层到深渊带的十二种代表物种",
    fontSizePx: 44,
    fill: "#C9D6E5",
  });
  push({
    id: "hero-photo",
    type: "image",
    x: 80,
    y: 400,
    width: 500,
    height: 400,
    assetId: "asset-hero",
    alt: "深海水母主视觉照片",
  });

  for (let index = 0; index < elementCount - 4; index += 1) {
    const x = 80 + (index % 5) * 190;
    const y = 400 + Math.floor(index / 5) * 130;
    const kind = index % 4;
    if (kind === 0) {
      push({ id: `card-${index}`, type: "rect", x, y, width: 170, height: 110, fill: "#12305B", radius: 12 });
    } else if (kind === 1) {
      const segments = Array.from(
        { length: Math.max(1, Math.round(padPath / 12)) },
        (_unused, step) => `L ${x + (step % 40)} ${y + (step % 30)}`,
      ).join(" ");
      push({ id: `mark-${index}`, type: "path", x, y, width: 160, height: 100, pathData: `M ${x} ${y} ${segments} Z`, stroke: "#4FA3E3" });
    } else if (kind === 2) {
      push({ id: `dot-${index}`, type: "ellipse", x, y, width: 60, height: 60, fill: "#4FA3E3" });
    } else {
      push({
        id: `label-${index}`,
        type: "text",
        x,
        y,
        width: 160,
        height: 40,
        text: `物种 ${index} · 栖息深度 ${index * 120} 米`,
        fontSizePx: 28,
        fill: "#C9D6E5",
      });
    }
  }

  return {
    schema: "oceanleo.design-document.v1",
    version: 1,
    title: "深海生物图谱社媒方图 v1",
    document: { width: 1080, height: 1080, dpi: 96, background: "#0B1F3A", elements },
    palette: ["#0B1F3A", "#12305B", "#4FA3E3", "#C9D6E5", "#FFFFFF"],
    fonts: [
      { family: "Noto Sans SC", weights: [400, 700], licenseCode: "OFL", assetId: "asset-font-notosans" },
    ],
    assets: [
      { id: "asset-hero", sha256: "a".repeat(64), mediaType: "image/webp", byteSize: 240_000, licenseCode: "CC0" },
      { id: "asset-font-notosans", sha256: "b".repeat(64), mediaType: "font/woff2", byteSize: 180_000, licenseCode: "OFL" },
    ],
    attribution: {
      entries: [
        { text: "Noto Sans SC OFL", licenseCode: "OFL", licenseUrl: "https://openfontlicense.org/" },
        {
          text: "深海水母照片 CC0",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          assetId: "asset-hero",
        },
      ],
    },
  };
}

const CLOSURE = { assetIds: ["asset-hero", "asset-font-notosans"] };

function fullyLoaded(project = designFixture()) {
  const serialized = serializeDesignDocumentProject(project);
  return {
    project,
    serialized,
    bytes: byteSize(serialized),
    result: loadDesignDocumentCarrier({
      bytes: serialized,
      closure: CLOSURE,
      evidence: designDocumentEvidence(project),
      raster: { ok: true, frameColorCount: 40 },
    }),
  };
}

// ---------------------------------------------------------------------------
// §3.1 Schema
// ---------------------------------------------------------------------------

test("§3.1 合规样例通过校验,序列化确定且可回读", () => {
  const project = designFixture();
  const validation = validateDesignDocumentProject(project);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(project.schema, "oceanleo.design-document.v1");

  const serialized = serializeDesignDocumentProject(project);
  assert.equal(
    serialized,
    serializeDesignDocumentProject(designFixture()),
    "同一输入必须序列化成同一字节串",
  );
  const roundTripped = parseDesignDocumentProject(serialized);
  assert.equal(
    serializeDesignDocumentProject(roundTripped),
    serialized,
    "解析后重新序列化必须回到原字节串",
  );
});

test("§3.1 elements 的 minItems=20 挡住空壳,这是本载体字节量健康的根因", () => {
  assert.equal(DESIGN_DOCUMENT_CONSTANTS.C1_minimumElements, 20);
  const project = designFixture();
  const thin = {
    ...project,
    document: { ...project.document, elements: project.document.elements.slice(0, 8) },
  };
  const validation = validateDesignDocumentProject(thin);
  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) => error.keyword === "minItems" && error.path.includes("elements"),
    ),
    JSON.stringify(validation.errors),
  );
});

test("§3.1 缺必填字段、未知字段、越界取值逐条被挡", () => {
  const base = designFixture();

  const noTitle = { ...base };
  delete noTitle.title;
  assert.equal(validateDesignDocumentProject(noTitle).ok, false);

  const unknownKey = { ...base, unexpectedField: "x" };
  const unknown = validateDesignDocumentProject(unknownKey);
  assert.equal(unknown.ok, false);
  assert.ok(
    unknown.errors.some((error) => error.keyword === "additionalProperties"),
    JSON.stringify(unknown.errors),
  );

  const badType = {
    ...base,
    document: {
      ...base.document,
      elements: base.document.elements.map((element, index) =>
        index === 0 ? { ...element, type: "hologram" } : element,
      ),
    },
  };
  const typed = validateDesignDocumentProject(badType);
  assert.equal(typed.ok, false);
  assert.ok(typed.errors.some((error) => error.keyword === "enum"));

  const shortPalette = { ...base, palette: ["#0B1F3A"] };
  const palette = validateDesignDocumentProject(shortPalette);
  assert.equal(palette.ok, false);
  assert.ok(
    palette.errors.some((error) => error.keyword === "minItems"),
    JSON.stringify(palette.errors),
  );
  assert.equal(DESIGN_DOCUMENT_CONSTANTS.C24_paletteColors.minimum, 3);
});

test("§3.1 解析器对坏字节抛载体错误而不是裸错误", () => {
  assert.throws(
    () => parseDesignDocumentProject("{ not json"),
    DesignDocumentCarrierError,
  );
});

// ---------------------------------------------------------------------------
// §2.2 画板尺寸档 / §2.3 栅格吸附 / §2.4 字号档
// ---------------------------------------------------------------------------

test("§2.2 六档画板尺寸按表登记,非档位尺寸查不到档", () => {
  assert.deepEqual(
    DESIGN_ARTBOARD_TIERS.map((tier) => `${tier.id}:${tier.width}x${tier.height}`),
    [
      "square:1080x1080",
      "story:1080x1920",
      "wide:1920x1080",
      "poster:2480x3508",
      "card:1200x630",
      "banner:1456x180",
    ],
  );
  assert.equal(designArtboardTier(1080, 1080), "square");
  assert.equal(designArtboardTier(1080, 1920), "story");
  assert.equal(designArtboardTier(2480, 3508), "poster");
  assert.equal(designArtboardTier(1234, 99), null);
  for (const tier of DESIGN_ARTBOARD_TIERS) {
    assert.ok(tier.width >= DESIGN_DOCUMENT_CONSTANTS.C5_artboardWidth.minimum);
    assert.ok(tier.width <= DESIGN_DOCUMENT_CONSTANTS.C5_artboardWidth.maximum);
    assert.ok(tier.height >= DESIGN_DOCUMENT_CONSTANTS.C6_artboardHeight.minimum);
    assert.ok(tier.height <= DESIGN_DOCUMENT_CONSTANTS.C6_artboardHeight.maximum);
  }
});

test("§2.3 栅格吸附按 8 px 步长、4 px 阈值就近落点", () => {
  assert.equal(DESIGN_GRID.stepPx, DESIGN_DOCUMENT_CONSTANTS.C14_gridStepPx);
  assert.equal(
    DESIGN_GRID.snapThresholdPx,
    DESIGN_DOCUMENT_CONSTANTS.C15_snapThresholdPx,
  );
  assert.equal(snapToDesignGrid(0), 0);
  assert.equal(snapToDesignGrid(8), 8);
  assert.equal(snapToDesignGrid(102), 104);
  assert.equal(snapToDesignGrid(97), 96);
  for (const value of [0, 3, 17, 99, 512, 1079]) {
    const snapped = snapToDesignGrid(value);
    assert.equal(snapped % DESIGN_GRID.stepPx, 0, `${value} 未落在栅格上`);
    assert.ok(
      Math.abs(snapped - value) <= DESIGN_GRID.snapThresholdPx,
      `${value} → ${snapped} 超出吸附阈值`,
    );
  }
  assert.equal(
    designSafeMarginPx(1080, 1080),
    Math.round(1080 * DESIGN_GRID.safeMarginRatio),
  );
});

test("§2.4 字号档在 1080 短边上等于表里的值,并随画板等比缩放", () => {
  for (const tier of DESIGN_FONT_SIZE_TIERS) {
    assert.equal(designFontSizePx(tier.id, 1080), tier.at1080);
    const scaled = designFontSizePx(tier.id, 2160);
    assert.ok(scaled > tier.at1080, `${tier.id} 未随短边放大`);
    assert.ok(scaled >= DESIGN_DOCUMENT_CONSTANTS.C20_fontSizePx.minimum);
    assert.ok(scaled <= DESIGN_DOCUMENT_CONSTANTS.C20_fontSizePx.maximum);
  }
});

// ---------------------------------------------------------------------------
// §3.2 状态机
// ---------------------------------------------------------------------------

test("§3.2 五条非法迁移一条都不放行", () => {
  assert.equal(DESIGN_DOCUMENT_ILLEGAL_TRANSITIONS.length, 5);
  assert.deepEqual(
    DESIGN_DOCUMENT_ILLEGAL_TRANSITIONS.map((edge) => `${edge.from}→${edge.to}`),
    [
      "parsing→rasterized",
      "degraded→ready",
      "assets-resolved→ready",
      "invalid→rasterized",
      "empty→ready",
    ],
  );
  for (const edge of DESIGN_DOCUMENT_ILLEGAL_TRANSITIONS) {
    assert.equal(
      designDocumentTransitionAllowed(edge.from, edge.to),
      false,
      `${edge.from} → ${edge.to} 不应被允许`,
    );
  }
  assert.equal(designDocumentTransitionAllowed("layout-verified", "rasterized"), true);
  assert.equal(designDocumentTransitionAllowed("rasterized", "ready"), true);
});

test("§3.2 合规样例走满 empty → parsing → assets-resolved → layout-verified → rasterized → ready", () => {
  const { result } = fullyLoaded();
  assert.deepEqual(result.trace, [
    "empty",
    "parsing",
    "assets-resolved",
    "layout-verified",
    "rasterized",
    "ready",
  ]);
  assert.equal(result.state, "ready");
  assert.equal(result.code, null);
  for (let index = 1; index < result.trace.length; index += 1) {
    assert.equal(
      designDocumentTransitionAllowed(result.trace[index - 1], result.trace[index]),
      true,
      `轨迹里出现非法边 ${result.trace[index - 1]} → ${result.trace[index]}`,
    );
  }
});

test("§3.2 没有 source 字节就停在 empty,永不出现 empty → ready", () => {
  const result = loadDesignDocumentCarrier({ bytes: null, closure: CLOSURE, raster: { ok: true } });
  assert.equal(result.state, "empty");
  assert.deepEqual(result.trace, ["empty"]);
  assert.equal(result.trace.includes("ready"), false);
});

test("§3.2 字体缺件判 invalid(不可降级),图片缺件判 degraded(不可直接交付)", () => {
  const project = designFixture();
  const serialized = serializeDesignDocumentProject(project);
  const evidence = designDocumentEvidence(project);

  const fontMissing = loadDesignDocumentCarrier({
    bytes: serialized,
    closure: { assetIds: ["asset-hero"] },
    evidence,
    raster: { ok: true },
  });
  assert.equal(fontMissing.state, "invalid");
  assert.equal(fontMissing.code, "design-document-font-missing");
  assert.deepEqual(fontMissing.missingFontAssetIds, ["asset-font-notosans"]);

  const imageMissing = loadDesignDocumentCarrier({
    bytes: serialized,
    closure: { assetIds: ["asset-font-notosans"] },
    evidence,
    raster: { ok: true },
  });
  assert.equal(imageMissing.state, "degraded");
  assert.equal(imageMissing.code, "design-document-degraded-assets");
  assert.deepEqual(imageMissing.missingAssetIds, ["asset-hero"]);
  // degraded → ready 是非法边:缺件态 MUST NOT 直接交付。
  assert.equal(imageMissing.trace.includes("ready"), false);
  assert.equal(designDocumentTransitionAllowed("degraded", "ready"), false);
});

test("§3.2 rasterized → ready 就地校验四项 evidence,任一不等即 invalid", () => {
  const project = designFixture();
  const serialized = serializeDesignDocumentProject(project);
  const truth = designDocumentEvidence(project);
  assert.equal(truth.elementCount, project.document.elements.length);
  assert.deepEqual(truth.elementTypes, ["ellipse", "image", "path", "rect", "text"]);

  for (const tampered of [
    { ...truth, elementCount: truth.elementCount - 1 },
    { ...truth, width: 999 },
    { ...truth, height: 999 },
    { ...truth, elementTypes: truth.elementTypes.filter((type) => type !== "image") },
  ]) {
    const result = loadDesignDocumentCarrier({
      bytes: serialized,
      closure: CLOSURE,
      evidence: tampered,
      raster: { ok: true },
    });
    assert.equal(result.state, "invalid");
    assert.equal(result.code, "design-document-evidence-mismatch");
    assert.equal(result.trace.includes("ready"), false);
  }
});

test("§3.2 尚未渲图时停在 layout-verified,不跳过 rasterized", () => {
  const project = designFixture();
  const result = loadDesignDocumentCarrier({
    bytes: serializeDesignDocumentProject(project),
    closure: CLOSURE,
    evidence: designDocumentEvidence(project),
    raster: { ok: false },
  });
  assert.equal(result.state, "layout-verified");
  assert.equal(result.trace.includes("rasterized"), false);
});

// ---------------------------------------------------------------------------
// §3.3 图层序
// ---------------------------------------------------------------------------

test("§3.3 合规样例图层序干净", () => {
  const report = verifyDesignDocumentLayerOrder(designFixture());
  assert.equal(report.ok, true);
  assert.deepEqual(report.duplicateZ, []);
  assert.deepEqual(report.danglingChildIds, []);
  assert.deepEqual(report.offBoardElementIds, []);
});

test("§3.3 z 重复被判出,载入落 invalid", () => {
  const project = designFixture();
  const elements = project.document.elements.map((element, index) =>
    index === 5 ? { ...element, z: project.document.elements[4].z } : element,
  );
  const broken = { ...project, document: { ...project.document, elements } };
  const report = verifyDesignDocumentLayerOrder(broken);
  assert.equal(report.ok, false);
  assert.ok(report.duplicateZ.length > 0);

  const result = loadDesignDocumentCarrier({
    bytes: serializeDesignDocumentProject(broken),
    closure: CLOSURE,
    evidence: designDocumentEvidence(broken),
    raster: { ok: true },
  });
  assert.equal(result.state, "invalid");
  assert.equal(result.code, "design-document-layer-ambiguous");
});

test("§3.3 group.childIds 悬空被判出", () => {
  const project = designFixture();
  const elements = [
    ...project.document.elements,
    {
      id: "group-broken",
      type: "group",
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      z: 900,
      childIds: ["does-not-exist"],
    },
  ];
  const broken = { ...project, document: { ...project.document, elements } };
  const report = verifyDesignDocumentLayerOrder(broken);
  assert.equal(report.ok, false);
  assert.deepEqual(report.danglingChildIds, ["does-not-exist"]);
});

test("§3.3 完全出画板的元素被判出", () => {
  const project = designFixture();
  const elements = project.document.elements.map((element, index) =>
    index === 2 ? { ...element, x: 5_000, y: 5_000 } : element,
  );
  const broken = { ...project, document: { ...project.document, elements } };
  const report = verifyDesignDocumentLayerOrder(broken);
  assert.equal(report.ok, false);
  assert.deepEqual(report.offBoardElementIds, ["subtitle-1"]);
});

// ---------------------------------------------------------------------------
// §8 字节下限与完备判据
// ---------------------------------------------------------------------------

test("§8.1 字节下限 16 KiB,合规样例达标", () => {
  assert.equal(DESIGN_DOCUMENT_CONSTANTS.C34_minimumSourceBytes, 16_384);
  const { bytes } = fullyLoaded();
  assert.ok(
    bytes >= DESIGN_DOCUMENT_CONSTANTS.C34_minimumSourceBytes,
    `样例只有 ${bytes} B`,
  );
  assert.ok(bytes <= DESIGN_DOCUMENT_CONSTANTS.C35_maximumSourceBytes);
  // 库内真产物均值 45,179 B(C36):样例应落在「达标但不虚胖」的区间。
  assert.ok(bytes < DESIGN_DOCUMENT_CONSTANTS.C36_libraryMeanSourceBytes);
});

test("§8.2 完备判据全部成立,失败清单为空", () => {
  const { project, bytes } = fullyLoaded();
  const report = evaluateDesignDocumentCompleteness(project, {
    sourceByteSize: bytes,
    frameColorCount: 40,
  });
  assert.deepEqual(report.failed, []);
  assert.equal(report.ok, true);

  const byId = new Map(report.criteria.map((criterion) => [criterion.id, criterion]));
  for (const id of [
    "source-bytes",
    "element-count",
    "element-types-used",
    "text-elements",
    "coverage",
    "off-board",
    "duplicate-z",
    "palette",
    "image-alt",
    "attribution",
    "title",
    "frame-colors",
  ]) {
    assert.equal(byId.get(id)?.ok, true, `${id} 缺失或未通过`);
  }
  assert.ok(
    designDocumentCoverageRatio(project) >=
      DESIGN_DOCUMENT_COMPLETENESS_THRESHOLDS.minimumCoverageRatio,
  );
});

test("§8 233 B 级空壳:字节数与内容密度双双不合格", () => {
  const hollow = {
    schema: "oceanleo.design-document.v1",
    version: 1,
    title: "空壳设计稿 v1",
    document: {
      width: 1080,
      height: 1080,
      background: "#FFFFFF",
      elements: Array.from({ length: 20 }, (_unused, index) => ({
        id: `e${index}`,
        type: "rect",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        z: index,
        fill: "#FFFFFF",
      })),
    },
    palette: ["#FFFFFF", "#000000", "#CCCCCC"],
    attribution: { entries: [{ text: "自制", licenseCode: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" }] },
  };
  // 空壳凑够了 20 个元素,schema 拦不住它 —— 这正是 §8 存在的理由。
  assert.equal(validateDesignDocumentProject(hollow).ok, true);

  const serialized = serializeDesignDocumentProject(hollow);
  const bytes = byteSize(serialized);
  assert.ok(bytes < DESIGN_DOCUMENT_CONSTANTS.C34_minimumSourceBytes);

  const report = designDocumentSourceCompleteness(hollow, bytes);
  assert.equal(report.ok, false);
  assert.ok(report.failed.includes("source-bytes"));
  // 只有一种元素类型、没有文本、覆盖率近零:内容密度也不合格。
  assert.ok(report.failed.includes("element-types-used"));
  assert.ok(report.failed.includes("text-elements"));
  assert.ok(report.failed.includes("coverage"));
});

test("§8.2 帧色彩数属于 raster 阶段判据,source 阶段不冒充它成立", () => {
  const { project, bytes } = fullyLoaded();
  assert.equal(DESIGN_DOCUMENT_CONSTANTS.C41_minimumFrameColors, 24);
  const tooFlat = evaluateDesignDocumentCompleteness(project, {
    sourceByteSize: bytes,
    frameColorCount: 3,
  });
  assert.equal(tooFlat.ok, false);
  assert.ok(tooFlat.failed.includes("frame-colors"));
  assert.equal(
    designDocumentSourceCompleteness(project, bytes).ok,
    true,
    "source 阶段判据不含帧色彩数",
  );
});

// ---------------------------------------------------------------------------
// §5.4 许可 / §7 断言 / §9 对账
// ---------------------------------------------------------------------------

test("§5.4 字体许可在允许枚举内、署名齐全,CC-BY-SA 一律禁入", () => {
  const project = designFixture();
  const manifest = designDocumentLicenseManifest(project);
  assert.equal(manifest.ok, true);
  assert.deepEqual(manifest.fontsWithoutAttribution, []);
  assert.deepEqual(manifest.forbiddenLicenseCodes, []);
  assert.ok(manifest.entries.length >= 1);

  assert.deepEqual(DESIGN_FORBIDDEN_LICENSE_CODES, ["CC-BY-SA"]);
  const tainted = {
    ...project,
    attribution: {
      entries: [
        ...project.attribution.entries,
        {
          text: "openmoji 表情",
          licenseCode: "CC-BY-SA",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        },
      ],
    },
  };
  const taintedManifest = designDocumentLicenseManifest(tainted);
  assert.equal(taintedManifest.ok, false);
  assert.ok(taintedManifest.forbiddenLicenseCodes.includes("CC-BY-SA"));
});

test("§5.4 字体没有对应署名条目时判不合规", () => {
  const project = designFixture();
  const unattributed = {
    ...project,
    attribution: {
      entries: project.attribution.entries.filter(
        (entry) => entry.licenseCode !== "OFL",
      ),
    },
  };
  const manifest = designDocumentLicenseManifest(unattributed);
  assert.equal(manifest.ok, false);
  assert.ok(manifest.fontsWithoutAttribution.includes("Noto Sans SC"));
});

test("§7 A6 改调色板必须联动元素,改文案必须改变渲染摘要", () => {
  const project = designFixture();
  const before = designDocumentRenderDigest(project);

  const recolored = recolorDesignDocumentPalette(project, 2, "#E5484D");
  assert.ok(recolored.changedElementIds.length > 0, "改 palette 没有元素联动");
  assert.notEqual(designDocumentRenderDigest(recolored.project), before);
  assert.equal(recolored.project.palette[2], "#E5484D");
  assert.equal(project.palette[2], "#4FA3E3", "原件不得被就地改写");

  const retitled = setDesignDocumentElementText(project, "title-main", "换一版主标题文案");
  assert.notEqual(designDocumentRenderDigest(retitled), before);
  assert.equal(designDocumentRenderDigest(project), before);
});

test("§9 合规样例的载体对账整体为真", () => {
  const { project, bytes } = fullyLoaded();
  const conformance = assertDesignDocumentCarrierConformance(project, {
    sourceByteSize: bytes,
    evidence: designDocumentEvidence(project),
    frameColorCount: 40,
  });
  assert.equal(
    conformance.ok,
    true,
    JSON.stringify(conformance.checks.filter((check) => !check.ok)),
  );
});

// ---------------------------------------------------------------------------
// 提交口:载体形态与编辑器信封不混淆,空壳拿不到 native
// ---------------------------------------------------------------------------

test("提交口能把载体形态与编辑器信封分开", () => {
  assert.equal(isDesignDocumentCarrierSource(designFixture()), true);
  assert.equal(
    isDesignDocumentCarrierSource({
      schema: "oceanleo.design-document.v1",
      sceneGraph: { nodes: [] },
      dependencyManifest: { assets: [] },
      history: [],
    }),
    false,
  );
  assert.equal(isDesignDocumentCarrierSource(null), false);
  assert.equal(isDesignDocumentCarrierSource({ schema: "other" }), false);
});

test("提交口:合规样例过闸并交出 evidence,空壳与欠字节样例被拒", () => {
  const { project, bytes } = fullyLoaded();
  const gate = assertDesignDocumentCarrierSource(project, bytes);
  assert.equal(gate.evidence.elementCount, project.document.elements.length);
  assert.deepEqual(gate.assetIds.sort(), ["asset-font-notosans", "asset-hero"]);
  assert.deepEqual(gate.licenseCodes.sort(), ["CC0", "OFL"]);

  assert.throws(
    () => assertDesignDocumentCarrierSource(project, 233),
    /16384|字节下限/,
    "233 B 的字节数必须被 §8.1 拒掉",
  );

  const thin = {
    ...project,
    document: { ...project.document, elements: project.document.elements.slice(0, 8) },
  };
  assert.throws(
    () => assertDesignDocumentCarrierSource(thin, 20_000),
    /§3\.1/,
    "元素不足 20 的源必须被 schema 拒掉",
  );
});
