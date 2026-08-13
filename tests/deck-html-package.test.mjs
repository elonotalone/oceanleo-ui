import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { buildDeckHtml } from "../src/shell/doc-editors/deck-html-package.ts";
import { DECK_IR_LAYOUTS } from "../src/shell/doc-editors/deck-layout-grid.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

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

test("the single HTML file has no external refs and restores every image byte", async () => {
  const { html } = await buildDeckHtml(project(), { assets: HTML_ASSETS });
  const directory = await mkdtemp(join(tmpdir(), "oceanleo-deck-html-"));
  const filename = join(directory, "index.html");
  try {
    await writeFile(filename, html);
    assert.deepEqual(await readdir(directory), ["index.html"]);

    const standalone = await readFile(filename, "utf8");
    const document = new JSDOM(standalone).window.document;
    const references = [...document.querySelectorAll("[src], [href]")].flatMap(
      (element) =>
        ["src", "href"]
          .filter((attribute) => element.hasAttribute(attribute))
          .map((attribute) => ({
            attribute,
            value: element.getAttribute(attribute) || "",
          })),
    );
    assert.ok(references.length > 0, "fixture must exercise URL-bearing elements");
    for (const reference of references) {
      assert.match(
        reference.value,
        /^data:image\/(?:png|jpeg|webp);base64,/,
        `${reference.attribute} must be an embedded image, got ${reference.value.slice(0, 80)}`,
      );
      assert.doesNotMatch(reference.value, /^https?:/i);
    }

    for (const asset of ASSETS) {
      const images = [
        ...document.querySelectorAll(`img[data-asset-id="${asset.id}"]`),
      ];
      assert.ok(images.length > 0, `${asset.id} must be present in the standalone file`);
      for (const image of images) {
        const match = image
          .getAttribute("src")
          ?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/);
        assert.ok(match, `${asset.id} must have a parseable data URI`);
        assert.equal(match[1], asset.mediaType);
        const restored = Buffer.from(match[2], "base64");
        assert.equal(
          createHash("sha256").update(restored).digest("hex"),
          createHash("sha256").update(PIXEL).digest("hex"),
          `${asset.id} bytes must round-trip from HTML alone`,
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("a missing image byte fails explicitly and produces no HTML", async () => {
  let output;
  let failure;
  try {
    output = await buildDeckHtml(project(), {
      assets: HTML_ASSETS.filter((asset) => asset.id !== "photo-c"),
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(output, undefined, "failure must not return a partial build");
  assert.ok(failure instanceof Error);
  assert.equal(
    failure.message,
    "网页版缺少图片字节，不能生成自包含文件：photo-c。",
  );
});

test("the same IR and image bytes produce byte-identical single-file HTML", async () => {
  const first = await buildDeckHtml(project(), { assets: HTML_ASSETS });
  const second = await buildDeckHtml(project(), { assets: HTML_ASSETS });

  assert.equal(first.html, second.html);
  assert.deepEqual(
    new TextEncoder().encode(first.html),
    new TextEncoder().encode(second.html),
  );
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

test("source surface and project fonts win over a selected pack in final HTML", async () => {
  const source = project();
  source.packId = "paper-cut-amber";
  source.theme = {
    ...source.theme,
    fontMajor: "Source Display",
    fontMinor: "Source Text",
    fontEastAsian: "Source CJK",
    surface: {
      color: "213547",
      image: {
        assetId: "photo-b",
        alt: "Portrait paper texture",
        fit: "contain",
      },
    },
  };

  const { html } = await buildDeckHtml(source, { assets: HTML_ASSETS });
  const firstPage = html.match(/<section\b[^>]*data-deck-slide="1"[\s\S]*?<\/section>/)?.[0] || "";

  assert.match(html, /data-theme-font-major="Source Display"/);
  assert.match(html, /data-theme-font-minor="Source Text"/);
  assert.match(html, /data-theme-font-east-asian="Source CJK"/);
  assert.match(firstPage, /style="background:#213547;"/);
  assert.match(
    firstPage,
    /class="deck-object deck-image deck-surface-image"[^>]*data-asset-id="photo-b"[^>]*object-fit:contain/,
  );
  assert.ok(
    firstPage.indexOf("deck-surface-image") < firstPage.indexOf("data-deck-text"),
    "the source surface image must be emitted behind page content",
  );
  assert.match(html, /font-family:&quot;Source Display&quot;,&quot;Source CJK&quot;,sans-serif/);
  assert.match(html, /font-family:&quot;Source Text&quot;,&quot;Source CJK&quot;,sans-serif/);
});

test("legacy sources without surface or font fields keep their established fallback", async () => {
  const source = project();
  delete source.theme.fontMajor;
  delete source.theme.fontMinor;
  delete source.theme.fontEastAsian;
  delete source.theme.surface;

  const first = await buildDeckHtml(source, { assets: HTML_ASSETS });
  const second = await buildDeckHtml(source, { assets: HTML_ASSETS });

  assert.equal(first.html, second.html);
  assert.match(first.html, /style="background:#FFFFFF;"/);
  assert.match(first.html, /font-family:&quot;Aptos&quot;,&quot;Microsoft YaHei&quot;,sans-serif/);
});

test("surface images reject executable addresses, uncontrolled fit, undeclared ids, and missing bytes", async () => {
  const withSurface = (image) => {
    const source = project();
    source.theme = {
      ...source.theme,
      surface: { color: "213547", image },
    };
    return source;
  };

  await assert.rejects(
    buildDeckHtml(
      withSurface({
        assetId: "photo-a",
        alt: "Unsafe",
        fit: "cover",
        url: "javascript:alert(document.cookie)",
      }),
      { assets: HTML_ASSETS },
    ),
    /theme\.surface\.image\.url/,
  );
  await assert.rejects(
    buildDeckHtml(
      withSurface({ assetId: "photo-a", alt: "Unsafe fit", fit: "stretch" }),
      { assets: HTML_ASSETS },
    ),
    /theme\.surface\.image\.fit/,
  );
  await assert.rejects(
    buildDeckHtml(
      withSurface({ assetId: "not-declared", alt: "Unknown asset", fit: "cover" }),
      { assets: HTML_ASSETS },
    ),
    /theme\.surface\.image\.assetId|not-declared/,
  );
  await assert.rejects(
    buildDeckHtml(
      withSurface({ assetId: "photo-a", alt: "Missing bytes", fit: "cover" }),
      { assets: HTML_ASSETS.filter((asset) => asset.id !== "photo-a") },
    ),
    /photo-a/,
  );
});

test("final controls expose matching page semantics and keyboard, click, and touch paths", async () => {
  const { html } = await buildDeckHtml(project(), { assets: HTML_ASSETS });
  const pageCount = DECK_IR_LAYOUTS.length;

  assert.match(html, new RegExp(`<span id="deck-counter"[^>]*>1 / ${pageCount}</span>`));
  assert.match(
    html,
    new RegExp(`<progress id="deck-progress"[^>]*max="${pageCount}"[^>]*value="1"`),
  );
  assert.equal((html.match(/role="group" aria-roledescription="slide"/g) || []).length, pageCount);
  assert.match(html, new RegExp(`aria-label="${pageCount} / ${pageCount}"`));
  assert.match(html, /addEventListener\("keydown"/);
  assert.match(html, /ArrowLeft/);
  assert.match(html, /ArrowRight/);
  assert.match(html, /addEventListener\("click"/);
  assert.match(html, /addEventListener\("pointerdown"/);
  assert.match(html, /addEventListener\("pointerup"/);
  assert.match(html, /pointerType==="touch"/);

  for (const forbidden of [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\b(?:localStorage|sessionStorage|indexedDB)\b/,
    /document\.cookie/,
    /\.innerHTML\b/,
  ]) {
    assert.doesNotMatch(html, forbidden);
  }
});
