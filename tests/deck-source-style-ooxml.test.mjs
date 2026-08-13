import assert from "node:assert/strict";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";

import {
  DECK_IR_JSON_SCHEMA,
  parseDeckIr,
  serializeDeckIr,
  validateDeckIr,
} from "../src/shell/doc-editors/deck-ir.ts";
import { DECK_GRID } from "../src/shell/doc-editors/deck-layout-grid.ts";
import { buildDeckPptx } from "../src/shell/doc-editors/deck-ooxml-package.ts";

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function project({
  packId,
  surface,
  fontMajor,
  fontMinor,
  assets = [],
} = {}) {
  return {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "F8 source style OOXML regression fixture",
    ...(packId ? { packId } : {}),
    theme: {
      accent: "E11D48",
      ...(fontMajor ? { fontMajor } : {}),
      ...(fontMinor ? { fontMinor } : {}),
      ...(surface ? { surface } : {}),
    },
    master: { creditsBar: false },
    slides: [
      { layout: "title", title: "Source style", subtitle: "must reach final OOXML" },
      { layout: "section", title: "Section" },
      { layout: "bullets", title: "Bullets", bullets: ["One", "Two"] },
      { layout: "two-column", title: "Columns", left: ["Left"], right: ["Right"] },
      { layout: "kpi-row", title: "KPI", kpis: [{ value: "37", label: "styles" }] },
      {
        layout: "timeline",
        title: "Timeline",
        milestones: [{ at: "2026-08", label: "F8" }],
      },
    ],
    ...(assets.length ? { assets } : {}),
    attribution: {
      entries: [
        {
          text: "OceanLeo F8 test fixture",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
  };
}

function finalParts(source, assets = []) {
  const { bytes } = buildDeckPptx(source, {
    timestamp: "2026-08-13T00:00:00Z",
    assets,
  });
  const zip = unzipSync(bytes);
  return {
    bytes,
    zip,
    slide: strFromU8(zip["ppt/slides/slide1.xml"]),
    slideRels: strFromU8(zip["ppt/slides/_rels/slide1.xml.rels"]),
    theme: strFromU8(zip["ppt/theme/theme1.xml"]),
  };
}

test("theme.surface is strict source schema and survives deterministic persistence", () => {
  const source = project({
    packId: "riso-crimson",
    fontMajor: "Source Major",
    fontMinor: "Source Minor",
    surface: {
      color: "213547",
      image: {
        assetId: "surface-texture",
        alt: "Blue paper texture",
        fit: "contain",
      },
    },
    assets: [
      {
        id: "surface-texture",
        sha256: "a".repeat(64),
        mediaType: "image/png",
        byteSize: PNG.byteLength,
        width: 200,
        height: 400,
      },
    ],
  });

  const validation = validateDeckIr(source);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.deepEqual(
    DECK_IR_JSON_SCHEMA.properties.theme.properties.surface,
    {
      type: "object",
      additionalProperties: false,
      properties: {
        color: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
        image: {
          type: "object",
          additionalProperties: false,
          required: ["assetId", "alt"],
          properties: {
            assetId: { type: "string", minLength: 1, maxLength: 64 },
            alt: { type: "string", maxLength: 300 },
            fit: { type: "string", enum: ["cover", "contain"] },
          },
        },
      },
    },
  );

  const reopened = parseDeckIr(serializeDeckIr(validation.project));
  assert.equal(reopened.packId, "riso-crimson");
  assert.deepEqual(reopened.theme.surface, source.theme.surface);
});

test("theme.surface rejects unknown fields and executable image addresses", () => {
  const unsafe = project({
    surface: {
      color: "213547",
      image: {
        assetId: "surface-texture",
        alt: "Unsafe address must not enter the source",
        fit: "cover",
        url: "javascript:alert(document.cookie)",
      },
      wallpaper: "https://untrusted.test/background.png",
    },
  });
  const validation = validateDeckIr(unsafe);

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) =>
        error.path === "theme.surface.image.url" &&
        error.code === "additionalProperties",
    ),
    JSON.stringify(validation.errors),
  );
  assert.ok(
    validation.errors.some(
      (error) =>
        error.path === "theme.surface.wallpaper" &&
        error.code === "additionalProperties",
    ),
    JSON.stringify(validation.errors),
  );
});

test("one pack can emit distinct source surfaces and source fonts in final PPTX bytes", () => {
  const cool = finalParts(
    project({
      packId: "riso-crimson",
      surface: { color: "213547" },
      fontMajor: "IBM Plex Mono",
      fontMinor: "IBM Plex Sans",
    }),
  );
  const warm = finalParts(
    project({
      packId: "riso-crimson",
      surface: { color: "F2D6B3" },
      fontMajor: "Georgia",
      fontMinor: "Arial",
    }),
  );

  assert.match(cool.slide, /<a:srgbClr val="213547">/);
  assert.match(warm.slide, /<a:srgbClr val="F2D6B3">/);
  assert.doesNotMatch(cool.slide, /<a:srgbClr val="F2D6B3">/);
  assert.notDeepEqual(cool.bytes, warm.bytes);

  assert.match(cool.theme, /<a:majorFont><a:latin typeface="IBM Plex Mono"\/>/);
  assert.match(cool.theme, /<a:minorFont><a:latin typeface="IBM Plex Sans"\/>/);
  assert.match(warm.theme, /<a:majorFont><a:latin typeface="Georgia"\/>/);
});

test("a style without a pack still writes its non-white source surface", () => {
  const output = finalParts(
    project({
      surface: { color: "4C2A35" },
      fontMajor: "Noto Serif",
      fontMinor: "Noto Sans",
    }),
  );

  assert.match(
    output.slide,
    /<p:bg><p:bgPr><a:solidFill><a:srgbClr val="4C2A35">/,
  );
});

test("surface image uses only a declared asset id and honors contain fit full-page", () => {
  const asset = {
    id: "surface-texture",
    sha256: "b".repeat(64),
    mediaType: "image/png",
    byteSize: PNG.byteLength,
    width: 200,
    height: 400,
  };
  const output = finalParts(
    project({
      surface: {
        color: "213547",
        image: {
          assetId: asset.id,
          alt: "Portrait paper texture",
          fit: "contain",
        },
      },
      assets: [asset],
    }),
    [{ id: asset.id, bytes: PNG, width: asset.width, height: asset.height }],
  );
  const picture = output.slide.match(/<p:pic>.*?<\/p:pic>/)?.[0] || "";
  const containedWidth = Math.round(
    DECK_GRID.pageHeight * (asset.width / asset.height),
  );
  const containedX = Math.round((DECK_GRID.pageWidth - containedWidth) / 2);

  assert.ok(picture, "the source surface image must be a real OOXML picture");
  assert.match(picture, /descr="Portrait paper texture"/);
  assert.match(picture, /<a:srcRect\/>/);
  assert.match(
    picture,
    new RegExp(
      `<a:off x="${containedX}" y="0"/><a:ext cx="${containedWidth}" cy="${DECK_GRID.pageHeight}"/>`,
    ),
  );
  assert.match(output.slideRels, /Target="\.\.\/media\/image1\.png"/);
  assert.deepEqual(output.zip["ppt/media/image1.png"], PNG);
  assert.ok(
    output.slide.indexOf("<p:pic>") < output.slide.indexOf('name="title-1"'),
    "the full-page surface picture must sit behind slide content",
  );
});
