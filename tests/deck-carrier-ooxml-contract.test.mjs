/**
 * deck-extension v1 carrier contract.
 *
 * Spec: docs/specs/oceanleo-material-and-game-v1/L1-carriers/deck-extension.md
 * Every assertion below names the clause it enforces.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";
import PptxGenJS from "pptxgenjs";

import {
  DECK_CONSTANTS,
  DECK_FONT_SIZES,
  DECK_GRID,
  DECK_IR_LAYOUTS,
  DECK_LAYOUT_DEFINITIONS,
  DECK_THEME_PALETTE,
  DECK_THEME_SLOT_ORDER,
  deckContrastRatio,
  deckKpiCards,
  deckLayoutDefinition,
  deckSpan,
} from "../src/shell/doc-editors/deck-layout-grid.ts";
import {
  DECK_IR_MIN_BYTES,
  DECK_PPTX_MAX_BYTES,
  DECK_PPTX_MIN_BYTES,
  advanceDeckGeneration,
  deckIrCompleteness,
  deckIrTextCharacters,
  parseDeckIr,
  serializeDeckIr,
  validateDeckIr,
} from "../src/shell/doc-editors/deck-ir.ts";
import {
  DECK_CONTENT_TYPES,
  DECK_CUSTOM_PROPERTY_FMTID,
  DECK_RELATIONSHIP_TYPES,
  assertDeckPackageConformance,
  buildDeckOoxmlParts,
  buildDeckPptx,
  deckCreditsText,
} from "../src/shell/doc-editors/deck-ooxml-package.ts";
import {
  deckPptxObjectName,
  injectDeckPptxOoxml,
  repairDeckPptxPackageParts,
} from "../src/shell/doc-editors/deck-pptx-ooxml.ts";
import {
  DECK_EDITOR_LAYOUTS,
  deckDocumentFromIr,
  deckLayoutIsCarrierGrammar,
} from "../src/shell/doc-editors/deck-schema.ts";

const SHA = (seed) => seed.repeat(64).slice(0, 64);

/** Incompressible filler so the package clears the §8.1 48 KiB floor. */
function imageBytes(seed, length = 24_000) {
  const bytes = new Uint8Array(length);
  let state = seed * 2_654_435_761;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1_103_515_245 + 12_345) >>> 0;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

const ASSETS = [
  { id: "photo-a", sha256: SHA("a1b2c3d4"), mediaType: "image/png", byteSize: 24_000, width: 1600, height: 900 },
  { id: "photo-b", sha256: SHA("b2c3d4e5"), mediaType: "image/jpeg", byteSize: 24_000, width: 1200, height: 1200 },
  { id: "photo-c", sha256: SHA("c3d4e5f6"), mediaType: "image/png", byteSize: 24_000, width: 900, height: 1600 },
];

const ASSET_BYTES = ASSETS.map((asset, index) => ({
  id: asset.id,
  bytes: imageBytes(index + 1),
  width: asset.width,
  height: asset.height,
}));

const CHART = {
  chartType: "bar",
  categories: ["一月", "二月", "三月", "四月"],
  series: [
    { name: "近岸观测", values: [12, 18, 24, 31] },
    { name: "离岸观测", values: [9, 14, 19, 27] },
  ],
  axisLabel: "观测站点数",
  showDataLabels: true,
};

function image(assetId, alt, caption) {
  return caption ? { assetId, alt, caption } : { assetId, alt };
}

/** One slide per §4 grammar, in L1…L16 order. */
function allLayoutSlides() {
  return [
    { layout: "title", title: "海洋观测年度总结", subtitle: "2026 年度近岸与离岸观测站点报告" },
    { layout: "section", title: "第一部分 观测网概况", subtitle: "站点分布与覆盖率" },
    {
      layout: "bullets",
      title: "本年度要点",
      bullets: ["新增近岸站点 12 个", "离岸浮标覆盖率提升到 78%", "数据回传时延下降 41%"],
      note: "数据截至 2026 年 6 月 30 日",
    },
    {
      layout: "two-column",
      title: "近岸与离岸对照",
      left: ["近岸站点 42 个", "平均水深 18 米", "维护周期 30 天"],
      right: ["离岸浮标 27 个", "平均水深 240 米", "维护周期 90 天"],
    },
    {
      layout: "data-table",
      title: "分季度观测量",
      table: {
        header: ["季度", "近岸", "离岸"],
        rows: [
          ["Q1", "1,204", "820"],
          ["Q2", "1,411", "905"],
          ["Q3", "1,688", "1,102"],
        ],
      },
    },
    { layout: "image-full", title: "东南近岸观测断面", images: [image("photo-a", "东南近岸观测断面的航拍照片")] },
    {
      layout: "image-left",
      title: "浮标部署",
      images: [image("photo-b", "工作船上正在吊装的观测浮标")],
      bullets: ["单次部署耗时 6 小时", "锚系寿命提升至 24 个月"],
    },
    {
      layout: "image-right",
      title: "岸基站房",
      images: [image("photo-c", "岸基观测站房与太阳能供电阵列")],
      bullets: ["离网供电占比 62%", "远程运维覆盖 100%"],
    },
    {
      layout: "image-grid",
      title: "典型观测场景",
      images: [
        image("photo-a", "近岸观测断面照片", "近岸断面"),
        image("photo-b", "浮标吊装作业照片", "浮标吊装"),
        image("photo-c", "岸基站房照片", "岸基站房"),
      ],
    },
    { layout: "chart-focus", title: "月度观测量", chart: CHART, note: "第一季度回升明显" },
    {
      layout: "chart-with-notes",
      title: "观测量与结论",
      chart: CHART,
      bullets: ["三月起近岸观测量稳定增长", "离岸观测受台风季影响明显"],
    },
    {
      layout: "kpi-row",
      title: "核心指标",
      kpis: [
        { value: "69", label: "在运观测站点", unit: " 个" },
        { value: "78", label: "离岸覆盖率", unit: "%", delta: "+12%" },
        { value: "41", label: "时延下降", unit: "%" },
      ],
    },
    {
      layout: "comparison",
      title: "两种锚系方案",
      subtitle: "重力锚",
      note: "桩基锚",
      left: ["部署快", "成本低", "深水受限"],
      right: ["深水可用", "寿命长", "部署周期长"],
    },
    {
      layout: "timeline",
      title: "部署里程碑",
      milestones: [
        { at: "2026-01", label: "首批近岸站点开工", detail: "覆盖东南沿海" },
        { at: "2026-04", label: "离岸浮标入水", detail: "共 9 套" },
        { at: "2026-06", label: "数据链路全量切换", detail: "时延下降 41%" },
      ],
    },
    {
      layout: "quote",
      quote: { text: "观测网的价值不在站点数量，而在数据是否连续可用。", attribution: "观测运维组" },
    },
    {
      layout: "mixed-triptych",
      title: "一页看全年",
      images: [image("photo-a", "全年观测断面合成图")],
      chart: CHART,
      bullets: ["站点 69 个", "覆盖率 78%", "时延 -41%"],
      note: "全年观测量同比增长 34%",
    },
  ];
}

function baseProject(overrides = {}) {
  return {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "海洋观测网 2026 年度总结",
    theme: { accent: "1F6FEB", fontMajor: "Aptos" },
    master: { footerText: "OceanLeo 海洋观测", showPageNumber: true },
    slides: allLayoutSlides(),
    assets: ASSETS,
    attribution: {
      entries: [
        { text: "Natural Earth", licenseCode: "PDM", licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/" },
        { text: "Poly Haven", licenseCode: "CC0", licenseUrl: "https://polyhaven.com/license" },
        { text: "OceanLeo", licenseCode: "OCEANLEO-AIGEN", licenseUrl: "https://oceanleo.com/license" },
      ],
    },
    ...overrides,
  };
}

function build(project = baseProject()) {
  return buildDeckOoxmlParts(project, { assets: ASSET_BYTES });
}

// ---------------------------------------------------------------- §2 visual target

test("§2.1 the 12 a:clrScheme slots hold the specified values and clear WCAG 2.2", () => {
  assert.equal(DECK_THEME_SLOT_ORDER.length, DECK_CONSTANTS.C31);
  assert.deepEqual(
    { ...DECK_THEME_PALETTE },
    {
      dk1: "1F2328",
      lt1: "FFFFFF",
      dk2: "3A4149",
      lt2: "F2F5F9",
      accent1: "1F6FEB",
      // §2.1 correction: D9822B measured 2.93:1 on white, below SC 1.4.11.
      accent2: "C47323",
      accent3: "2E8B6F",
      accent4: "8E5BA6",
      accent5: "CF222E",
      accent6: "57606A",
      hlink: "0969DA",
      folHlink: "8250DF",
    },
  );

  for (const slot of ["dk1", "dk2", "hlink", "folHlink"]) {
    for (const background of ["lt1", "lt2"]) {
      const ratio = deckContrastRatio(DECK_THEME_PALETTE[slot], DECK_THEME_PALETTE[background]);
      assert.ok(
        ratio >= DECK_CONSTANTS.C38,
        `${slot} on ${background} is ${ratio.toFixed(2)}:1, below ${DECK_CONSTANTS.C38}`,
      );
    }
  }
  for (const slot of ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]) {
    for (const background of ["lt1", "lt2"]) {
      const ratio = deckContrastRatio(DECK_THEME_PALETTE[slot], DECK_THEME_PALETTE[background]);
      assert.ok(
        ratio >= DECK_CONSTANTS.C39,
        `${slot} on ${background} is ${ratio.toFixed(2)}:1, below ${DECK_CONSTANTS.C39}`,
      );
    }
  }
  // §2.1 last bullet: neither white nor dk1 clears 4.5:1 on accent2, which is
  // why accent2 must never sit under body copy.
  assert.ok(deckContrastRatio("FFFFFF", DECK_THEME_PALETTE.accent2) < DECK_CONSTANTS.C38);
  assert.ok(
    deckContrastRatio(DECK_THEME_PALETTE.dk1, DECK_THEME_PALETTE.accent2) < DECK_CONSTANTS.C38,
  );
});

test("§2.2 the EMU grid and span(n) follow the stated formula", () => {
  assert.equal(DECK_GRID.pageWidth, DECK_CONSTANTS.C1);
  assert.equal(DECK_GRID.pageHeight, DECK_CONSTANTS.C2);
  assert.equal(DECK_GRID.margin, DECK_CONSTANTS.C3);
  assert.equal(
    DECK_GRID.contentWidth,
    DECK_GRID.pageWidth - 2 * DECK_GRID.margin,
  );
  assert.equal(
    DECK_GRID.contentWidth,
    DECK_GRID.columns * DECK_GRID.columnWidth +
      (DECK_GRID.columns - 1) * DECK_GRID.gutter,
  );
  assert.equal(DECK_GRID.bodyHeight, DECK_GRID.bodyBottomY - DECK_GRID.bodyStartY);
  assert.equal(deckSpan(1), 762_000);
  assert.equal(deckSpan(4), 3_505_200);
  assert.equal(deckSpan(12), DECK_GRID.contentWidth);
  // 1 pt = 12,700 EMU and 1 in = 914,400 EMU.
  assert.equal(DECK_GRID.footerBaselineY, 7 * 914_400);
  assert.equal(DECK_GRID.margin, Math.round(0.75 * 914_400));
});

test("§2.3 the sz ladder is exact and never dips below the note step", () => {
  assert.deepEqual(
    { ...DECK_FONT_SIZES },
    {
      kpi: 5400,
      display: 4400,
      section: 4000,
      heading: 2800,
      subheading: 2000,
      body: 1800,
      "body-sm": 1600,
      caption: 1400,
      table: 1300,
      note: 1200,
    },
  );
  assert.equal(DECK_FONT_SIZES.note, DECK_CONSTANTS.C35);
  assert.equal(DECK_FONT_SIZES.display, DECK_CONSTANTS.C36);
  assert.equal(DECK_FONT_SIZES.kpi, DECK_CONSTANTS.C37);
  for (const size of Object.values(DECK_FONT_SIZES)) {
    assert.ok(size >= DECK_CONSTANTS.C35);
  }
});

/**
 * §2.2 / §2.3 — a line pitch written in the wrong unit passes every structural
 * predicate: the runs are in the package, `textCharCount` is intact and
 * `assertDeckPackageConformance` reports no failure, while `<a:normAutofit/>`
 * silently shrinks the copy to 1–2 px so it fits the over-tall line boxes.
 * The bounds below are therefore read off the rendered result, not off the
 * conversion constant: a line box may not be shorter than its own glyphs, may
 * not be taller than a third of the slide, and a paragraph stack must fit its
 * own shape with no autofit shrink at all.
 */
test("§2.2 every declared line pitch renders at a legible height inside its own box", () => {
  const { parts } = build();
  const emuToPoints = (emu) => emu / 12_700;
  const slideHeightPoints = emuToPoints(DECK_GRID.pageHeight);
  let spacedParagraphs = 0;

  for (let index = 1; index <= DECK_IR_LAYOUTS.length; index += 1) {
    const xml = parts[`ppt/slides/slide${index}.xml`];
    const shapes = xml.split("<p:sp>").slice(1).map((chunk) => chunk.split("</p:sp>")[0]);
    for (const shape of shapes) {
      const extent = shape.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
      const paragraphs = shape.split("<a:p>").slice(1);
      let stackPoints = 0;
      for (const paragraph of paragraphs) {
        const pitch = paragraph.match(/<a:spcPts val="(\d+)"\/>/);
        if (!pitch) continue;
        const fontMatch = paragraph.match(/ sz="(\d+)"/);
        assert.ok(fontMatch, `slide ${index}: a spaced paragraph carries no sz`);
        const pitchPoints = Number(pitch[1]) / 100;
        const fontPoints = Number(fontMatch[1]) / 100;
        assert.ok(
          pitchPoints >= fontPoints,
          `slide ${index}: line box ${pitchPoints}pt is shorter than its ${fontPoints}pt glyphs`,
        );
        assert.ok(
          pitchPoints <= fontPoints * 3,
          `slide ${index}: line box ${pitchPoints}pt is ${(pitchPoints / fontPoints).toFixed(1)}× its ${fontPoints}pt glyphs`,
        );
        assert.ok(
          pitchPoints <= slideHeightPoints / 3,
          `slide ${index}: one line claims ${pitchPoints}pt of a ${slideHeightPoints}pt slide`,
        );
        stackPoints += pitchPoints;
        spacedParagraphs += 1;
      }
      if (stackPoints === 0) continue;
      assert.ok(extent, `slide ${index}: a spaced shape carries no a:ext`);
      const boxPoints = emuToPoints(Number(extent[2]));
      assert.ok(
        stackPoints <= boxPoints,
        `slide ${index}: ${paragraphs.length} lines need ${stackPoints.toFixed(1)}pt in a ${boxPoints.toFixed(1)}pt box, so normAutofit will shrink them`,
      );
    }
  }

  assert.ok(spacedParagraphs >= 20, `only ${spacedParagraphs} spaced paragraphs were inspected`);
});

// ---------------------------------------------------------------- §3.1 IR schema

test("§3.1 a conformant oceanleo.deck.v1 project validates and round-trips", () => {
  const project = baseProject();
  const validation = validateDeckIr(project);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);

  const text = serializeDeckIr(project);
  const reparsed = parseDeckIr(text);
  assert.equal(serializeDeckIr(reparsed), text, "serialization is deterministic");
  assert.equal(reparsed.schema, "oceanleo.deck.v1");
  assert.equal(reparsed.version, 1);
});

test("§3.1 additionalProperties, byte-shape and enum violations are all rejected", () => {
  const cases = [
    [{ ...baseProject(), extra: 1 }, "additionalProperties"],
    [{ ...baseProject(), schema: "oceanleo.deck.v2" }, "const"],
    [{ ...baseProject(), title: "短" }, "minLength"],
    [{ ...baseProject(), theme: { accent: "#1F6FEB" } }, "pattern"],
    [{ ...baseProject(), slides: allLayoutSlides().slice(0, 5) }, "minItems"],
  ];
  for (const [candidate, code] of cases) {
    const result = validateDeckIr(candidate);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((error) => error.code === code),
      `expected a "${code}" error, got ${JSON.stringify(result.errors.slice(0, 3))}`,
    );
  }
});

test("§3.1 allOf — every layout-conditional required field is enforced", () => {
  const conditional = {
    "image-full": "images",
    "image-left": "images",
    "image-right": "images",
    "image-grid": "images",
    "chart-focus": "chart",
    "chart-with-notes": "chart",
    "kpi-row": "kpis",
    timeline: "milestones",
    quote: "quote",
    "data-table": "table",
    comparison: "left",
    "mixed-triptych": "chart",
  };
  for (const [layout, field] of Object.entries(conditional)) {
    const slides = allLayoutSlides();
    const index = slides.findIndex((slide) => slide.layout === layout);
    assert.ok(index >= 0, `${layout} is missing from the fixture`);
    const stripped = { ...slides[index] };
    delete stripped[field];
    slides[index] = stripped;
    const result = validateDeckIr(baseProject({ slides }));
    assert.equal(result.ok, false, `${layout} without ${field} must be rejected`);
    assert.ok(
      result.errors.some(
        (error) => error.code === "required" && error.path.endsWith(`.${field}`),
      ),
      `${layout} must report a missing "${field}"`,
    );
  }
});

test("§2.4 SC 1.1.1 — a picture without usable alt text is rejected", () => {
  const slides = allLayoutSlides();
  const index = slides.findIndex((slide) => slide.layout === "image-full");
  slides[index] = { ...slides[index], images: [{ assetId: "photo-a", alt: "图" }] };
  const result = validateDeckIr(baseProject({ slides }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "minLength"));
  assert.equal(DECK_CONSTANTS.C40, 4);
});

test("§3.1 unresolved assetId references are rejected", () => {
  const slides = allLayoutSlides();
  const index = slides.findIndex((slide) => slide.layout === "image-full");
  slides[index] = { ...slides[index], images: [{ assetId: "ghost", alt: "不存在的图片" }] };
  const result = validateDeckIr(baseProject({ slides }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "unresolved-asset"));
});

// ---------------------------------------------------------------- §4 the 16 grammars

test("§4 all 16 layout grammars are defined, L1–L5 keep their identifiers", () => {
  assert.equal(DECK_IR_LAYOUTS.length, DECK_CONSTANTS.C15);
  assert.equal(DECK_LAYOUT_DEFINITIONS.length, DECK_CONSTANTS.C15);
  assert.deepEqual(
    [...DECK_IR_LAYOUTS],
    [
      "title",
      "section",
      "bullets",
      "two-column",
      "data-table",
      "image-full",
      "image-left",
      "image-right",
      "image-grid",
      "chart-focus",
      "chart-with-notes",
      "kpi-row",
      "comparison",
      "timeline",
      "quote",
      "mixed-triptych",
    ],
  );
  const existing = DECK_LAYOUT_DEFINITIONS.filter((entry) => entry.status === "existing");
  assert.equal(existing.length, 5, "§4 marks L1–L5 as pre-existing");
  assert.equal(
    DECK_LAYOUT_DEFINITIONS.filter((entry) => entry.status === "new").length,
    DECK_CONSTANTS.C16,
  );
  DECK_LAYOUT_DEFINITIONS.forEach((definition, index) => {
    assert.equal(definition.ordinal, index + 1);
    assert.ok(Object.keys(definition.boxes).length > 0, `${definition.id} has no boxes`);
  });
});

test("§4 the stated per-layout EMU placements are reproduced verbatim", () => {
  const boxes = (id) => deckLayoutDefinition(id).boxes;
  assert.deepEqual(boxes("title").title, { x: 685_800, y: 1_500_000, cx: 10_820_400, cy: 900_000 });
  assert.deepEqual(boxes("title").accentBar, { x: 685_800, y: 2_400_000, cx: 10_820_400, cy: 90_000 });
  assert.deepEqual(boxes("section").accentBar, { x: 0, y: 0, cx: 460_000, cy: 6_858_000 });
  assert.deepEqual(boxes("bullets").accentDot, { x: 685_800, y: 620_000, cx: 200_000, cy: 70_000 });
  assert.equal(boxes("two-column").left.cx, 4_724_400);
  assert.equal(boxes("two-column").right.x, 5_810_200);
  assert.deepEqual(boxes("image-full").image, { x: 0, y: 0, cx: 12_192_000, cy: 6_858_000 });
  assert.deepEqual(boxes("image-left").image, { x: 685_800, y: 1_700_000, cx: 3_962_400, cy: 3_600_000 });
  assert.equal(boxes("image-right").image.x, 7_543_800);
  assert.equal(boxes("image-grid").cell.cx, 3_505_200);
  assert.equal(boxes("chart-focus").chart.cy, 3_800_000);
  assert.equal(boxes("chart-focus").conclusion.y, 5_600_000);
  assert.equal(boxes("chart-with-notes").bullets.x, 6_934_200);
  assert.equal(boxes("kpi-row").card.y, 2_000_000);
  assert.equal(boxes("timeline").axis.y, 3_400_000);
  assert.equal(boxes("timeline").axis.cy, 40_000);
  assert.equal(boxes("quote").quote.x, 2_209_800);
  assert.equal(boxes("quote").quote.cx, 7_163_400);
  assert.deepEqual(boxes("mixed-triptych").image, { x: 685_800, y: 1_700_000, cx: 3_505_200, cy: 2_400_000 });
  assert.equal(boxes("mixed-triptych").chart.x, 4_343_400);
  assert.equal(boxes("mixed-triptych").bullets.x, 8_001_000);
  assert.equal(boxes("mixed-triptych").conclusion.y, 4_400_000);
  // §4 L12 — the per-card widths, evenly dividing the content area.
  assert.deepEqual(deckKpiCards(2).map((card) => card.cx), [4_724_400, 4_724_400]);
  assert.deepEqual(deckKpiCards(3).map((card) => card.cx), [3_505_200, 3_505_200, 3_505_200]);
  assert.deepEqual(deckKpiCards(4).map((card) => card.cx), [2_438_400, 2_438_400, 2_438_400, 2_438_400]);
  // The 3-card case lands exactly on the 12-column grid.
  assert.equal(deckKpiCards(3)[1].x - (deckKpiCards(3)[0].x + 3_505_200), DECK_GRID.gutter);
});

test("§4 all 16 grammars survive the IR → OOXML export, one slideLayout each", () => {
  const result = build();
  for (let index = 0; index < DECK_IR_LAYOUTS.length; index += 1) {
    const xml = result.parts[`ppt/slides/slide${index + 1}.xml`];
    assert.ok(xml, `slide ${index + 1} is missing`);
    const ordinal = deckLayoutDefinition(DECK_IR_LAYOUTS[index]).ordinal;
    const rels = result.parts[`ppt/slides/_rels/slide${index + 1}.xml.rels`];
    assert.ok(
      rels.includes(`../slideLayouts/slideLayout${ordinal}.xml`),
      `slide ${index + 1} must point at exactly one layout`,
    );
    assert.equal(
      (rels.match(new RegExp(DECK_RELATIONSHIP_TYPES.slideLayout, "g")) || []).length,
      1,
    );
  }
  assert.equal(result.slideLayoutCount, DECK_CONSTANTS.C33);
  for (const definition of DECK_LAYOUT_DEFINITIONS) {
    const layout = result.parts[`ppt/slideLayouts/slideLayout${definition.ordinal}.xml`];
    assert.ok(layout, `slideLayout${definition.ordinal}.xml is missing`);
    assert.match(layout, new RegExp(`type="${definition.ooxmlType}"`));
    assert.ok(layout.includes(`<p:cSld name="${definition.id}">`));
  }
  // §3.5 — `title` uses title, `section` uses secHead, `bullets` uses obj.
  assert.equal(deckLayoutDefinition("title").ooxmlType, "title");
  assert.equal(deckLayoutDefinition("section").ooxmlType, "secHead");
  assert.equal(deckLayoutDefinition("bullets").ooxmlType, "obj");
});

test("§4 the editor grammar list carries the 16 carrier grammars", () => {
  for (const layout of DECK_IR_LAYOUTS) {
    assert.ok(DECK_EDITOR_LAYOUTS.includes(layout), `editor is missing ${layout}`);
    assert.ok(deckLayoutIsCarrierGrammar(layout));
  }
  assert.ok(!deckLayoutIsCarrierGrammar("blank"));
  const editorDeck = deckDocumentFromIr(baseProject(), () => "https://cdn.example.com/a.png");
  assert.equal(editorDeck.slides.length, DECK_IR_LAYOUTS.length);
  assert.deepEqual(
    editorDeck.slides.map((slide) => slide.layout),
    [...DECK_IR_LAYOUTS],
  );
  for (const slide of editorDeck.slides) {
    assert.ok(slide.elements.length > 0, `${slide.layout} produced no elements`);
  }
});

// ---------------------------------------------------------------- §3.2 package structure

test("§3.2 P1–P9 all exist with the stated content types and relationship types", () => {
  const { parts } = build();
  assert.ok(parts["ppt/slideMasters/slideMaster1.xml"]);
  assert.ok(parts["ppt/slideMasters/_rels/slideMaster1.xml.rels"]);
  assert.ok(parts["ppt/theme/theme1.xml"]);
  for (let n = 1; n <= 16; n += 1) {
    assert.ok(parts[`ppt/slideLayouts/slideLayout${n}.xml`], `P3 slideLayout${n}`);
    assert.ok(parts[`ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`], `P4 slideLayout${n} rels`);
  }
  assert.ok(parts["ppt/charts/chart1.xml"], "P8 chart part");
  assert.ok(parts["ppt/charts/_rels/chart1.xml.rels"], "P9 chart rels part");

  const contentTypes = parts["[Content_Types].xml"];
  assert.ok(contentTypes.includes(`ContentType="${DECK_CONTENT_TYPES.slideMaster}"`));
  assert.ok(contentTypes.includes(`ContentType="${DECK_CONTENT_TYPES.slideLayout}"`));
  assert.ok(contentTypes.includes(`ContentType="${DECK_CONTENT_TYPES.theme}"`));
  assert.ok(contentTypes.includes(`ContentType="${DECK_CONTENT_TYPES.chart}"`));
  assert.ok(contentTypes.includes('<Default Extension="png" ContentType="image/png"/>'));
  assert.ok(contentTypes.includes('<Default Extension="jpeg" ContentType="image/jpeg"/>'));

  const presentationRels = parts["ppt/_rels/presentation.xml.rels"];
  assert.ok(presentationRels.includes(DECK_RELATIONSHIP_TYPES.slideMaster));
  assert.ok(presentationRels.includes(DECK_RELATIONSHIP_TYPES.theme));
  const masterRels = parts["ppt/slideMasters/_rels/slideMaster1.xml.rels"];
  assert.equal(
    (masterRels.match(new RegExp(DECK_RELATIONSHIP_TYPES.slideLayout, "g")) || []).length,
    16,
  );
  assert.ok(masterRels.includes(DECK_RELATIONSHIP_TYPES.theme));
  assert.ok(
    parts["ppt/slideLayouts/_rels/slideLayout1.xml.rels"].includes(
      DECK_RELATIONSHIP_TYPES.slideMaster,
    ),
  );
});

test("§3.2 p:presentation children run sldMasterIdLst → sldIdLst → sldSz → notesSz", () => {
  const xml = build().parts["ppt/presentation.xml"];
  const order = ["<p:sldMasterIdLst>", "<p:sldIdLst>", "<p:sldSz", "<p:notesSz"];
  const positions = order.map((token) => xml.indexOf(token));
  for (const position of positions) assert.ok(position > 0, `${xml.slice(0, 200)}`);
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(
      positions[index - 1] < positions[index],
      `${order[index - 1]} must precede ${order[index]}`,
    );
  }
  assert.ok(xml.includes(`<p:sldSz cx="${DECK_CONSTANTS.C1}" cy="${DECK_CONSTANTS.C2}"/>`));
});

test("§3.2a.3 gap 1 — docProps/core.xml is no longer an orphan part", () => {
  const { parts } = build();
  assert.ok(parts["docProps/core.xml"]);
  assert.ok(
    parts["[Content_Types].xml"].includes(
      `<Override PartName="/docProps/core.xml" ContentType="${DECK_CONTENT_TYPES.coreProperties}"/>`,
    ),
    "core.xml needs the package core-properties Override",
  );
  assert.equal(
    DECK_CONTENT_TYPES.coreProperties,
    "application/vnd.openxmlformats-package.core-properties+xml",
  );
  assert.ok(
    parts["_rels/.rels"].includes(DECK_RELATIONSHIP_TYPES.coreProperties),
    "core.xml needs the metadata/core-properties relationship",
  );
  assert.equal(
    DECK_RELATIONSHIP_TYPES.coreProperties,
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  );
  assert.ok(parts["docProps/core.xml"].includes("<dc:title>"));
});

test("§3.2a.1 core.xml stays inside the closed 15-element set — no dc:rights", () => {
  const xml = build().parts["docProps/core.xml"];
  assert.ok(!xml.includes("rights"), "dc:rights does not exist in OPC core properties");
  const elements = [...xml.matchAll(/<((?:dc|dcterms|cp):[A-Za-z]+)[\s>]/g)]
    .map((match) => match[1].split(":")[1])
    // `cp:coreProperties` is the container, not one of the 15 core properties.
    .filter((element) => element !== "coreProperties");
  const allowed = new Set([
    "creator", "description", "identifier", "language", "subject", "title",
    "created", "modified",
    "category", "contentStatus", "keywords", "lastModifiedBy", "lastPrinted",
    "revision", "version",
  ]);
  assert.equal(allowed.size, 15);
  for (const element of elements) {
    assert.ok(allowed.has(element), `core.xml wrote a non-schema element "${element}"`);
  }
  assert.ok(xml.includes('xsi:type="dcterms:W3CDTF"'));
});

test("§3.2a.2 attribution rides docProps/custom.xml with all three pieces landed", () => {
  const project = baseProject();
  const { parts } = build(project);
  const custom = parts["docProps/custom.xml"];
  assert.ok(custom.includes(`fmtid="${DECK_CUSTOM_PROPERTY_FMTID}"`));
  assert.equal(DECK_CUSTOM_PROPERTY_FMTID, "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}");
  assert.ok(custom.includes(`pid="${DECK_CONSTANTS.C50}"`), "pid starts at 2");
  assert.ok(custom.includes('name="OceanLeoCredits"'));
  assert.ok(custom.includes("<vt:lpwstr>"));
  assert.ok(
    parts["[Content_Types].xml"].includes(
      `<Override PartName="/docProps/custom.xml" ContentType="${DECK_CONTENT_TYPES.customProperties}"/>`,
    ),
    "the precedent pptx omits this Override; §3.2a.2 requires it",
  );
  assert.ok(parts["_rels/.rels"].includes(DECK_RELATIONSHIP_TYPES.customProperties));
  assert.equal(
    DECK_RELATIONSHIP_TYPES.customProperties,
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties",
  );
  for (const entry of project.attribution.entries) {
    assert.ok(custom.includes(entry.text), `${entry.text} missing from the credits`);
    assert.ok(custom.includes(entry.licenseCode));
  }
});

test("§3.2a.4 credits are visible on the last page, not only in metadata", () => {
  const project = baseProject();
  const result = build(project);
  const lastSlide = result.parts[`ppt/slides/slide${project.slides.length}.xml`];
  assert.ok(lastSlide.includes('name="oceanleo-credits"'));
  // §5 C51 — the visible bar uses the smallest §2.3 step.
  assert.ok(lastSlide.includes(`sz="${DECK_CONSTANTS.C51}"`));
  const credits = deckCreditsText(project);
  assert.ok(credits.length >= DECK_CONSTANTS.C49);
  assert.ok(credits.length <= DECK_CONSTANTS.C48);
  for (const entry of project.attribution.entries) {
    assert.ok(lastSlide.includes(entry.text), `${entry.text} missing from the visible bar`);
  }
});

test("§5 C48 — an over-long credits string is cut at an entry boundary", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    text: `供稿方 ${index} ${"素材来源说明".repeat(60)}`,
    licenseCode: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  }));
  const credits = deckCreditsText(baseProject({ attribution: { entries } }));
  assert.ok(credits.length <= DECK_CONSTANTS.C48);
  assert.ok(!credits.endsWith(";"), "the cut lands after a complete entry");
  assert.ok(credits.endsWith(")"), "each kept entry keeps its licence code");
});

// ---------------------------------------------------------------- §3.3 / §3.4

test("§3.3 p:pic carries descr, a bound r prefix and a cover crop", () => {
  const { parts } = build();
  const slideXml = parts["ppt/slides/slide6.xml"];
  assert.ok(slideXml.includes("<p:pic>"));
  assert.ok(
    slideXml.includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'),
    "§7 F2: r:embed without xmlns:r corrupts the package",
  );
  const descr = /descr="([^"]*)"/.exec(slideXml)?.[1] || "";
  assert.ok(descr.length >= DECK_CONSTANTS.C40, `descr "${descr}" is shorter than 4 characters`);
  assert.ok(slideXml.includes("<a:picLocks noChangeAspect=\"1\"/>"));
  assert.ok(slideXml.includes("<a:stretch><a:fillRect/></a:stretch>"));
  // photo-b is 1200×1200 in a 3,962,400 × 3,600,000 frame → horizontal crop.
  const imageLeft = parts["ppt/slides/slide7.xml"];
  const crop = /<a:srcRect ([^/]*)\/>/.exec(imageLeft)?.[1] || "";
  assert.match(crop, /[lrtb]="\d+"/);
  for (const value of [...crop.matchAll(/="(\d+)"/g)].map((match) => Number(match[1]))) {
    assert.ok(value >= DECK_CONSTANTS.C34[0] && value <= DECK_CONSTANTS.C34[1]);
  }
});

test("§3.4 the chart part writes complete c:strCache and c:numCache values", () => {
  const { parts } = build();
  const chart = parts["ppt/charts/chart1.xml"];
  assert.ok(chart.includes("<c:chartSpace"));
  assert.ok(chart.includes("<c:barChart>"));
  assert.equal((chart.match(/<c:ser>/g) || []).length, CHART.series.length);

  // §7 F5: no cache means LibreOffice paints an empty plot on first render.
  assert.ok(chart.includes("<c:strCache>"));
  assert.ok(chart.includes("<c:numCache>"));
  for (const category of CHART.categories) {
    assert.ok(chart.includes(`<c:v>${category}</c:v>`), `category ${category} not cached`);
  }
  for (const series of CHART.series) {
    assert.ok(chart.includes(`<c:v>${series.name}</c:v>`), `series ${series.name} not cached`);
    for (const value of series.values) {
      assert.ok(chart.includes(`<c:v>${value}</c:v>`), `value ${value} not cached`);
    }
  }
  const numCache = /<c:numCache>[\s\S]*?<\/c:numCache>/.exec(chart)[0];
  assert.ok(numCache.includes(`<c:ptCount val="${CHART.categories.length}"/>`));
  assert.equal(
    (numCache.match(/<c:pt idx="\d+">/g) || []).length,
    CHART.categories.length,
    "every point must be cached, not just the first",
  );
  const strCache = /<c:cat><c:strRef>[\s\S]*?<\/c:strCache>/.exec(chart)[0];
  assert.equal(
    (strCache.match(/<c:pt idx="\d+">/g) || []).length,
    CHART.categories.length,
  );
});

test("§3.4 p:graphicFrame uses the p: prefixed xfrm", () => {
  const slideXml = build().parts["ppt/slides/slide10.xml"];
  assert.ok(slideXml.includes("<p:graphicFrame>"));
  const frame = /<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/.exec(slideXml)[0];
  assert.ok(frame.includes("<p:xfrm>"), "PresentationML uses p:xfrm here, not a:xfrm");
  assert.ok(!frame.includes("<a:xfrm>"));
  assert.ok(
    frame.includes('uri="http://schemas.openxmlformats.org/drawingml/2006/chart"'),
  );
  assert.ok(/<c:chart[^>]*r:id="rId\d+"/.test(frame));
});

test("§2.4 a chart with 3+ series may not rely on colour alone", () => {
  const slides = allLayoutSlides();
  const index = slides.findIndex((slide) => slide.layout === "chart-focus");
  slides[index] = {
    ...slides[index],
    chart: {
      ...CHART,
      showDataLabels: false,
      series: [
        { name: "A", values: [1, 2, 3, 4] },
        { name: "B", values: [2, 3, 4, 5] },
        { name: "C", values: [3, 4, 5, 6] },
      ],
    },
  };
  const result = validateDeckIr(baseProject({ slides }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "wcag-1.4.1"));
});

// ---------------------------------------------------------------- §3.5 master / theme

test("§3.5 theme1.xml holds 12 colour slots, both scripts and 3 items per format list", () => {
  const xml = build().parts["ppt/theme/theme1.xml"];
  for (const slot of DECK_THEME_SLOT_ORDER) {
    assert.ok(
      xml.includes(`<a:${slot}><a:srgbClr val="${DECK_THEME_PALETTE[slot]}"/></a:${slot}>`),
      `a:clrScheme is missing ${slot}=${DECK_THEME_PALETTE[slot]}`,
    );
  }
  const scheme = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(xml)[0];
  assert.equal((scheme.match(/<a:srgbClr /g) || []).length, DECK_CONSTANTS.C31);

  assert.ok(xml.includes("<a:majorFont>"));
  assert.ok(xml.includes("<a:minorFont>"));
  // §3.5 / §7 F4 — a missing a:ea makes CJK fallback machine-dependent.
  assert.equal((xml.match(/<a:ea typeface="[^"]+"\/>/g) || []).length, 2);

  for (const list of ["fillStyleLst", "lnStyleLst", "effectStyleLst", "bgFillStyleLst"]) {
    const block = new RegExp(`<a:${list}>[\\s\\S]*?</a:${list}>`).exec(xml)[0];
    const items = list === "lnStyleLst"
      ? (block.match(/<a:ln /g) || []).length
      : list === "effectStyleLst"
        ? (block.match(/<a:effectStyle>/g) || []).length
        : (block.match(/<a:solidFill>/g) || []).length;
    assert.equal(items, DECK_CONSTANTS.C32, `a:${list} must hold exactly 3 items`);
  }
});

test("§3.5 slideMaster1.xml has a complete clrMap and lists all 16 layouts", () => {
  const xml = build().parts["ppt/slideMasters/slideMaster1.xml"];
  const clrMap = /<p:clrMap [^/]*\/>/.exec(xml)[0];
  for (const attribute of [
    "bg1", "tx1", "bg2", "tx2",
    "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
    "hlink", "folHlink",
  ]) {
    assert.ok(clrMap.includes(`${attribute}="`), `p:clrMap is missing ${attribute}`);
  }
  assert.equal((clrMap.match(/\w+="/g) || []).length, DECK_CONSTANTS.C31);
  const list = /<p:sldLayoutIdLst>[\s\S]*?<\/p:sldLayoutIdLst>/.exec(xml)[0];
  assert.equal((list.match(/<p:sldLayoutId /g) || []).length, DECK_CONSTANTS.C33);
  assert.ok(xml.includes("<p:spTree>"));
});

// ---------------------------------------------------------------- §3.6 state machine

test("§3.6 the legal transitions run empty → ready and the illegal ones throw", () => {
  let state = "empty";
  for (const event of ["validate-ir", "resolve-assets", "emit-parts", "zip", "accept-bytes"]) {
    state = advanceDeckGeneration(state, event);
  }
  assert.equal(state, "ready");

  assert.equal(advanceDeckGeneration("empty", "reject-ir"), "invalid");
  assert.equal(advanceDeckGeneration("ir-validated", "miss-assets"), "degraded");
  assert.equal(advanceDeckGeneration("zipped", "reject-bytes"), "invalid");

  // The MUST NOT list of §3.6.
  assert.throws(() => advanceDeckGeneration("ir-validated", "emit-parts"), /§3.6/);
  assert.throws(() => advanceDeckGeneration("degraded", "accept-bytes"), /§3.6/);
  assert.throws(() => advanceDeckGeneration("parts-emitted", "accept-bytes"), /§3.6/);
  assert.throws(() => advanceDeckGeneration("invalid", "zip"), /§3.6/);
  assert.throws(() => advanceDeckGeneration("empty", "accept-bytes"), /§3.6/);
});

test("§3.6 a deck whose pictures cannot be resolved never reaches ready", () => {
  assert.throws(
    () => buildDeckPptx(baseProject(), { assets: ASSET_BYTES.slice(0, 1) }),
    (error) => error.code === "deck-assets-missing",
  );
});

// ---------------------------------------------------------------- §8 acceptance

test("§8.1 the pptx clears 48 KiB and the IR clears 4 KiB", () => {
  const project = baseProject();
  const { bytes, conformance } = buildDeckPptx(project, { assets: ASSET_BYTES });
  assert.ok(
    bytes.length >= DECK_PPTX_MIN_BYTES,
    `pptx is ${bytes.length} B, below the ${DECK_PPTX_MIN_BYTES} B floor`,
  );
  assert.ok(bytes.length <= DECK_PPTX_MAX_BYTES);
  assert.equal(DECK_PPTX_MIN_BYTES, 49_152);
  assert.equal(DECK_IR_MIN_BYTES, 4_096);
  assert.deepEqual(conformance.failures, []);

  const completeness = deckIrCompleteness(project);
  assert.equal(completeness.ok, true, completeness.failures.join("; "));
  assert.ok(completeness.irBytes >= DECK_IR_MIN_BYTES);
  // §8.3 A4 — the IR also has an upper bound.
  assert.ok(completeness.irBytes <= 2_097_152);

  // Emitted so the acceptance owner can read the measured margins over the
  // §8.1 floors without rebuilding the fixture.
  console.log(
    `§8.1 measured: pptx=${bytes.length} B (floor ${DECK_PPTX_MIN_BYTES}), ` +
      `IR=${completeness.irBytes} B (floor ${DECK_IR_MIN_BYTES}), ` +
      `slides=${completeness.slideCount}, layouts=${completeness.distinctLayouts}, ` +
      `p:pic=${conformance.pictureCount}, charts=${conformance.chartPartCount}, ` +
      `avgShapes=${conformance.averageShapesPerSlide.toFixed(2)}, ` +
      `maxShapes=${conformance.maxShapesPerSlide}`,
  );
});

test("§7 F1 / §8.2 the 233 B hollow deck is rejected on every predicate", () => {
  const hollow = {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "空壳演示文稿",
    theme: { accent: "1F6FEB" },
    slides: Array.from({ length: 6 }, () => ({ layout: "bullets", title: "", bullets: [] })),
    attribution: {
      entries: [{ text: "OceanLeo", licenseCode: "OCEANLEO-AIGEN", licenseUrl: "https://oceanleo.com/license" }],
    },
  };
  assert.ok(new TextEncoder().encode(serializeDeckIr(hollow)).length < DECK_IR_MIN_BYTES);
  const completeness = deckIrCompleteness(hollow);
  assert.equal(completeness.ok, false);
  assert.equal(completeness.code, "deck-hollow");
  for (const expected of [
    /textCharacters \d+ < 100/,
    /distinct layouts 1 < 5/,
    /no mixed-triptych or chart-with-notes slide/,
    /p:pic sources 0 < 3/,
    /chart parts 0 < 1/,
    /IR bytes \d+ < 4096/,
  ]) {
    assert.ok(
      completeness.failures.some((failure) => expected.test(failure)),
      `expected a failure matching ${expected}, got ${completeness.failures.join("; ")}`,
    );
  }
});

test("§8.2 every completeness predicate holds for a conformant deck", () => {
  const project = baseProject();
  const result = build(project);
  const report = assertDeckPackageConformance(project, result);
  assert.deepEqual(report.failures, []);
  assert.ok(report.slideCount >= DECK_CONSTANTS.C17);
  assert.ok(deckIrTextCharacters(project) >= DECK_CONSTANTS.C44);
  assert.ok(report.distinctLayouts >= 5);
  assert.ok(report.denseSlides >= 1);
  assert.ok(report.pictureCount >= 3);
  assert.ok(report.chartPartCount >= 1);
  assert.equal(report.slideMasterCount, 1);
  assert.equal(report.slideLayoutCount, 16);
  assert.equal(report.themeCount, 1);
  assert.ok(report.averageShapesPerSlide >= 4);
  // §6.2 — LibreOffice slows down badly past 60 shapes on one page.
  assert.ok(report.maxShapesPerSlide <= 60, `a slide holds ${report.maxShapesPerSlide} shapes`);
  assert.ok(project.title.length >= 8);
});

test("§7 F6 / §8.2 a deck reusing only the five old grammars is rejected", () => {
  const slides = allLayoutSlides()
    .filter((slide) => ["title", "section", "bullets", "two-column", "data-table"].includes(slide.layout))
    .flatMap((slide) => [slide, slide]);
  const project = baseProject({ slides });
  const report = assertDeckPackageConformance(project, build(project));
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((failure) => /mixed-triptych or chart-with-notes/.test(failure)));
  assert.ok(report.failures.some((failure) => /p:pic count 0 < 3/.test(failure)));
  assert.ok(report.failures.some((failure) => /no chart part/.test(failure)));
});

test("§8.3 A12 — a package missing the custom.xml Override fails the attribution check", () => {
  const project = baseProject();
  const result = build(project);
  result.parts["[Content_Types].xml"] = result.parts["[Content_Types].xml"].replace(
    `<Override PartName="/docProps/custom.xml" ContentType="${DECK_CONTENT_TYPES.customProperties}"/>`,
    "",
  );
  const report = assertDeckPackageConformance(project, result);
  assert.equal(report.ok, false);
  assert.equal(report.hasCustomPropertiesOverride, false);
  assert.ok(report.failures.some((failure) => /custom.xml Override/.test(failure)));
});

test("§8.3 A13 — credits only in metadata do not satisfy the attribution obligation", () => {
  const project = baseProject();
  const result = build(project);
  const lastPath = `ppt/slides/slide${project.slides.length}.xml`;
  result.parts[lastPath] = result.parts[lastPath].replace(
    'name="oceanleo-credits"',
    'name="removed"',
  );
  const report = assertDeckPackageConformance(project, result);
  assert.equal(report.ok, false);
  assert.equal(report.hasVisibleCreditsBar, false);
  assert.ok(report.failures.some((failure) => /visible credits bar/.test(failure)));
});

test("§8.3 A10 — changing theme.accent relays through the whole deck", () => {
  const before = build(baseProject());
  const after = build(baseProject({ theme: { accent: "CF222E", fontMajor: "Aptos" } }));
  assert.ok(before.parts["ppt/theme/theme1.xml"].includes('<a:accent1><a:srgbClr val="1F6FEB"/>'));
  assert.ok(after.parts["ppt/theme/theme1.xml"].includes('<a:accent1><a:srgbClr val="CF222E"/>'));
  // §6.1 — only theme1.xml carries the accent decision; page XML follows.
  assert.ok(after.parts["ppt/slides/slide1.xml"].includes('val="CF222E"'));
  assert.ok(!after.parts["ppt/slides/slide1.xml"].includes('val="1F6FEB"'));
  assert.notEqual(
    before.parts["ppt/theme/theme1.xml"],
    after.parts["ppt/theme/theme1.xml"],
  );
});

test("the same IR always zips to the same bytes", () => {
  const first = buildDeckPptx(baseProject(), { assets: ASSET_BYTES });
  const second = buildDeckPptx(baseProject(), { assets: ASSET_BYTES });
  assert.deepEqual(Array.from(first.bytes), Array.from(second.bytes));
});

// ------------------------------------------------- editor export path (D5 mirror)

test("the editor export path repairs the core.xml and custom.xml OPC gaps", async () => {
  const slide = {
    id: "slide-1",
    title: "Slide 1",
    body: "",
    bullets: [],
    notes: "",
    layout: "blank",
    background: "",
    masterId: "master-default",
    elements: [
      {
        id: "element-1",
        type: "text",
        x: 10,
        y: 10,
        width: 30,
        height: 15,
        rotation: 0,
        order: 0,
        text: "Deck",
      },
    ],
  };
  const pptx = new PptxGenJS();
  pptx.addSlide().addText("Deck", {
    x: 1,
    y: 1,
    w: 3,
    h: 1,
    objectName: deckPptxObjectName("element-1"),
  });
  const raw = await pptx.write({ outputType: "blob" });
  const exported = await injectDeckPptxOoxml(raw, [slide], {
    attribution: [
      { text: "Natural Earth", licenseCode: "PDM" },
      { text: "OceanLeo", licenseCode: "OCEANLEO-AIGEN" },
    ],
  });
  const archive = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  const contentTypes = strFromU8(archive["[Content_Types].xml"]);
  const packageRels = strFromU8(archive["_rels/.rels"]);

  assert.ok(archive["docProps/custom.xml"], "custom.xml part must be written");
  const custom = strFromU8(archive["docProps/custom.xml"]);
  assert.ok(custom.includes('name="OceanLeoCredits"'));
  assert.ok(custom.includes("Natural Earth (PDM); OceanLeo (OCEANLEO-AIGEN)"));
  assert.ok(
    contentTypes.includes(
      `<Override PartName="/docProps/custom.xml" ContentType="${DECK_CONTENT_TYPES.customProperties}"/>`,
    ),
  );
  assert.ok(packageRels.includes(DECK_RELATIONSHIP_TYPES.customProperties));
  if (archive["docProps/core.xml"]) {
    assert.ok(contentTypes.includes('PartName="/docProps/core.xml"'));
    assert.ok(packageRels.includes(DECK_RELATIONSHIP_TYPES.coreProperties));
  }
  assert.ok(!custom.includes("dc:rights"));
});

test("the package repair is idempotent and never duplicates parts", () => {
  const encode = (value) => new TextEncoder().encode(value);
  const archive = {
    "[Content_Types].xml": encode(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="xml" ContentType="application/xml"/></Types>',
    ),
    "_rels/.rels": encode(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${DECK_RELATIONSHIP_TYPES.officeDocument}" Target="ppt/presentation.xml"/>` +
        "</Relationships>",
    ),
    "docProps/core.xml": encode("<cp:coreProperties/>"),
  };
  const attribution = [{ text: "Natural Earth", licenseCode: "PDM" }];
  const first = repairDeckPptxPackageParts(archive, { attribution });
  assert.equal(first.coreOverrideAdded, true);
  assert.equal(first.coreRelationshipAdded, true);
  assert.equal(first.customPartAdded, true);
  assert.equal(first.customOverrideAdded, true);
  assert.equal(first.customRelationshipAdded, true);

  const second = repairDeckPptxPackageParts(archive, { attribution });
  assert.equal(second.coreOverrideAdded, false);
  assert.equal(second.customOverrideAdded, false);
  assert.equal(second.customRelationshipAdded, false);

  const contentTypes = strFromU8(archive["[Content_Types].xml"]);
  assert.equal((contentTypes.match(/PartName="\/docProps\/core\.xml"/g) || []).length, 1);
  assert.equal((contentTypes.match(/PartName="\/docProps\/custom\.xml"/g) || []).length, 1);
  const rels = strFromU8(archive["_rels/.rels"]);
  assert.equal(
    (rels.match(new RegExp(DECK_RELATIONSHIP_TYPES.coreProperties, "g")) || []).length,
    1,
  );
  const ids = [...rels.matchAll(/Id="(rId\d+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "relationship ids must stay unique");
});
