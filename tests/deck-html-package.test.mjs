import assert from "node:assert/strict";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";

import {
  buildDeckHtml,
  buildDeckHtmlZip,
} from "../src/shell/doc-editors/deck-html-package.ts";
import { DECK_IR_LAYOUTS } from "../src/shell/doc-editors/deck-layout-grid.ts";

const PIXEL = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

const ASSETS = ["photo-a", "photo-b", "photo-c"].map((id, index) => ({
  id,
  sha256: String(index + 1).repeat(64),
  mediaType: "image/png",
  byteSize: PIXEL.length,
  width: index === 1 ? 900 : 1600,
  height: index === 1 ? 1600 : 900,
}));

const HTML_ASSETS = ASSETS.map((asset, index) => ({
  id: asset.id,
  path: `assets/photo-${index + 1}.png`,
  bytes: PIXEL,
  width: asset.width,
  height: asset.height,
}));

const CHART = {
  chartType: "bar",
  categories: ["一月", "二月", "三月"],
  series: [
    { name: "近岸", values: [12, 18, 24] },
    { name: "离岸", values: [9, 14, 21] },
  ],
  axisLabel: "观测量",
};

function slideFor(layout) {
  switch (layout) {
    case "title":
      return { layout, title: "海洋观测年度总结", subtitle: "同一份素材的网页孪生件" };
    case "section":
      return { layout, title: "第一部分", subtitle: "观测网概况" };
    case "bullets":
      return { layout, title: "年度要点", bullets: ["新增站点 12 个", "回传时延下降 41%"] };
    case "two-column":
      return { layout, title: "近岸与离岸", left: ["近岸 42 个"], right: ["离岸 27 个"] };
    case "data-table":
      return {
        layout,
        title: "季度观测量",
        table: { header: ["季度", "近岸"], rows: [["Q1", "1204"], ["Q2", "1411"]] },
      };
    case "image-full":
      return { layout, title: "东南近岸断面", images: [{ assetId: "photo-a", alt: "近岸航拍" }] };
    case "image-left":
      return {
        layout,
        title: "浮标部署",
        images: [{ assetId: "photo-b", alt: "浮标吊装" }],
        bullets: ["部署耗时 6 小时", "寿命 24 个月"],
      };
    case "image-right":
      return {
        layout,
        title: "岸基站房",
        images: [{ assetId: "photo-c", alt: "岸基站房" }],
        bullets: ["离网供电 62%", "远程运维 100%"],
      };
    case "image-grid":
      return {
        layout,
        title: "典型场景",
        images: ASSETS.map((asset, index) => ({
          assetId: asset.id,
          alt: `场景 ${index + 1}`,
          caption: `场景 ${index + 1}`,
        })),
      };
    case "chart-focus":
      return { layout, title: "月度观测量", chart: CHART, note: "第一季度回升明显" };
    case "chart-with-notes":
      return { layout, title: "观测量与结论", chart: CHART, bullets: ["近岸稳定增长", "离岸季节波动"] };
    case "kpi-row":
      return {
        layout,
        title: "核心指标",
        kpis: [
          { value: "69", label: "站点", unit: " 个" },
          { value: "78", label: "覆盖率", unit: "%" },
          { value: "41", label: "时延下降", unit: "%" },
        ],
      };
    case "comparison":
      return {
        layout,
        title: "锚系方案",
        subtitle: "重力锚",
        note: "桩基锚",
        left: ["部署快", "成本低"],
        right: ["寿命长", "适合深水"],
      };
    case "timeline":
      return {
        layout,
        title: "部署里程碑",
        milestones: [
          { at: "一月", label: "近岸开工" },
          { at: "四月", label: "浮标入水" },
          { at: "六月", label: "链路切换" },
        ],
      };
    case "quote":
      return {
        layout,
        quote: { text: "价值在数据连续可用。", attribution: "观测运维组" },
        images: [{ assetId: "photo-a", alt: "海面背景" }],
      };
    case "mixed-triptych":
      return {
        layout,
        title: "一页看全年",
        images: [{ assetId: "photo-b", alt: "观测断面" }],
        chart: CHART,
        bullets: ["站点 69 个", "覆盖率 78%"],
        note: "同比增长 34%",
      };
    default:
      throw new Error(`test fixture is missing the real registry layout ${layout}`);
  }
}

function project() {
  return {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "海洋观测网网页版孪生件",
    theme: {
      accent: "1F6FEB",
      fontMajor: "Aptos",
      fontEastAsian: "Microsoft YaHei",
    },
    master: { footerText: "OceanLeo 海洋观测", showPageNumber: true },
    slides: DECK_IR_LAYOUTS.map(slideFor),
    assets: ASSETS,
    attribution: {
      entries: [
        {
          text: "OceanLeo",
          licenseCode: "OCEANLEO-AIGEN",
          licenseUrl: "https://oceanleo.com/license",
        },
      ],
    },
  };
}

test("the real 16-layout registry produces one non-empty HTML page per grammar", async () => {
  const build = await buildDeckHtml(project(), { assets: HTML_ASSETS });
  const pages = [...build.html.matchAll(/<section\b[^>]*data-layout="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];

  assert.equal(pages.length, DECK_IR_LAYOUTS.length);
  assert.deepEqual(pages.map((page) => page[1]), [...DECK_IR_LAYOUTS]);
  for (const [index, page] of pages.entries()) {
    assert.ok(page[2].trim(), `${DECK_IR_LAYOUTS[index]} should emit a non-empty page`);
  }
});

test("static output stays inside the PPTX-expressible visual subset", async () => {
  const { html } = await buildDeckHtml(project(), { assets: HTML_ASSETS });
  for (const forbidden of [
    "linear-gradient",
    "backdrop-filter",
    "@keyframes",
    ":hover",
    "@font-face",
  ]) {
    assert.equal(html.includes(forbidden), false, `forbidden visual token: ${forbidden}`);
  }
  assert.doesNotMatch(html, /<link\b/i);
  assert.match(html, /rgba\([^)]*,0\.6\)/);
  assert.match(html, /requestFullscreen/);
  assert.match(html, /ArrowLeft/);
  assert.match(html, /ArrowRight/);
});

test("the same IR and bytes produce byte-identical HTML and zip closures", async () => {
  const first = await buildDeckHtmlZip(project(), { assets: HTML_ASSETS });
  const second = await buildDeckHtmlZip(project(), { assets: HTML_ASSETS });

  assert.equal(first.build.html, second.build.html);
  assert.deepEqual(first.bytes, second.bytes);

  const archive = unzipSync(first.bytes);
  assert.equal(strFromU8(archive["index.html"]), first.build.html);
  assert.deepEqual(Object.keys(archive).sort(), [
    "assets/photo-1.png",
    "assets/photo-2.png",
    "assets/photo-3.png",
    "index.html",
  ]);
});

test("4:3 is a fixed canvas option and an unavailable pack uses the IR theme", async () => {
  const build = await buildDeckHtml(project(), {
    aspect: "4:3",
    packId: "fixture-pack-that-does-not-exist",
    assets: HTML_ASSETS,
  });

  assert.equal(build.aspect, "4:3");
  assert.ok(Math.abs(build.pageWidth / build.pageHeight - 4 / 3) < 1e-12);
  assert.equal(build.packApplied, false);
  assert.match(build.html, /data-aspect="4:3"/);
  assert.match(build.html, /background:#1F6FEB/);
  assert.ok(build.notes.some((note) => note.includes("IR theme fallback")));
});

test("a W1 pack id applies that registry's surface, fonts, palette, and solid scrim bands", async () => {
  const build = await buildDeckHtml(project(), {
    packId: "paper-cut-amber",
    assets: HTML_ASSETS,
  });

  assert.equal(build.packApplied, true);
  assert.match(build.html, /background:#F7EFE2/);
  assert.match(build.html, /font-family:&quot;ZCOOL KuaiLe&quot;,sans-serif/);
  assert.match(build.html, /background:#EA580C/);
  for (const alpha of ["0.82", "0.68", "0.56"]) {
    assert.match(build.html, new RegExp(`rgba\\(74,59,42,${alpha}\\)`));
  }
  assert.equal((build.html.match(/class="deck-object deck-shape deck-scrim"/g) || []).length, 3);
});
