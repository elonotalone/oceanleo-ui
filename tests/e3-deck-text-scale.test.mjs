const EMU_PER_POINT = 12700;
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PptxGenJS from "pptxgenjs";
import { strFromU8, unzipSync } from "fflate";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { deckPptxTableImageData } from "../src/shell/doc-editors/DeckPptxVisuals.ts";
import { renderDeckPreviewPng } from "../src/shell/doc-editors/editor-preview-raster.ts";
import { deckPageWidthPt, deckFontSizeCqi, deckFontSizePx, deckFontSizePt } from "../src/shell/doc-editors/deck-text-scale.ts";

const { DeckElementContent } = await import(await compileModule("src/shell/doc-editors/DeckElementContent.tsx"));
const { DeckSlideThumbnail } = await import(await compileModule("src/shell/doc-editors/DeckSlideThumbnail.tsx"));
const { DeckPresenterView } = await import(await compileModule("src/shell/doc-editors/DeckPresenterView.tsx"));
const { DeckStage } = await import(await compileModule("src/shell/doc-editors/DeckStage.tsx", {
  "../../i18n/ui/useUI": dataModule("export function useUI() { return (text) => text; }"),
}));

function element(overrides = {}) {
  return { id: "text", type: "text", x: 10, y: 10, width: 50, height: 10, rotation: 0, order: 0, text: "字号对齐", fontSize: 18, ...overrides };
}
function deck(aspect = "16:9", elements = [element()]) {
  return { version: 2, title: "字号", aspect, theme: "ocean", masters: [], slides: [{ id: "slide", title: "字号", body: "", bullets: [], notes: "", layout: "blank", background: "#ffffff", elements }] };
}
function close(actual, expected, message, tolerance = 1e-6) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance, `${message}: ${actual} vs ${expected}`);
}
function cqi(props) {
  const html = renderToStaticMarkup(createElement(DeckElementContent, { element: element(), ...props }));
  return Number(html.match(/font-size:([\d.]+)cqi/)?.[1]);
}
test("16:9 18pt uses 18/9.6 cqi in the actual text renderer", () => {
  close(cqi({ aspect: "16:9" }), 18 / 9.6, "wide text");
});

for (const [aspect, widthPt, layout] of [["16:9", 960, "LAYOUT_WIDE"], ["4:3", 720, "LAYOUT_4x3"]]) {
  test(`${aspect} page width agrees with the PPTX exporter layout`, async () => {
    const pptx = new PptxGenJS();
    pptx.layout = layout;
    pptx.addSlide();
    const archive = unzipSync(new Uint8Array(await pptx.write({ outputType: "arraybuffer" })));
    const widthEmu = Number(strFromU8(archive["ppt/presentation.xml"]).match(/<p:sldSz[^>]*cx="(\d+)"/)?.[1]);
    close(widthEmu / EMU_PER_POINT, widthPt, "PPTX width");
    close(deckPageWidthPt(aspect), widthPt, "shared page width");
    close(deckFontSizeCqi(18, aspect), 18 / (widthPt / 100), "shared cqi");
    close(deckFontSizePt(deckFontSizePx(23.37, aspect, 1000), aspect, 1000), 23.37, "shared inverse");
    close(cqi({ aspect }), 18 / (widthPt / 100), "canvas width");
  });

  test(`${aspect} stage and presenter pass the document's aspect to their text`, () => {
    const source = deck(aspect);
    const surfaces = [
      createElement(DeckStage, { editor: { deck: source, activeSlide: source.slides[0], activeIndex: 0 } }),
      createElement(DeckPresenterView, { source: { deck: source, startIndex: 0 }, channelName: "e3-text-scale", linkFactory: null, autoStartTimer: false }),
    ];
    for (const surface of surfaces) {
      const html = renderToStaticMarkup(surface);
      const sizes = [...html.matchAll(/font-size:([\d.]+)cqi/g)].map((match) => Number(match[1]));
      assert.ok(sizes.length > 0, "surface must render slide text");
      sizes.forEach((size) => close(size, 18 / (widthPt / 100), "surface size"));
    }
  });

  test(`${aspect} text, inline editing, table cells and miniature share the pt scale`, () => {
    for (const fontSize of [4, 18, 28.35, 72]) {
      for (const type of ["text", "table"]) {
        for (const state of [{}, { editing: true }, { miniature: true }]) {
          close(cqi({ element: element({ type, fontSize, rows: [["表格"]] }), aspect, ...state }), fontSize / (widthPt / 100), `${type}/${fontSize}/${JSON.stringify(state)}`);
        }
      }
    }
  });

  test(`${aspect} rail thumbnail keeps the document scale`, () => {
    const source = deck(aspect);
    const html = renderToStaticMarkup(createElement(DeckSlideThumbnail, { slide: source.slides[0], pageWidth: 960, pageHeight: aspect === "4:3" ? 720 : 540, thumbWidth: 160 }));
    close(Number(html.match(/font-size:([\d.]+)cqi/)?.[1]), 18 / (widthPt / 100), "thumbnail");
  });

  test(`${aspect} flattened table font accounts for the table's width on the page`, () => {
    for (const width of [25, 50, 80]) {
      const table = element({ type: "table", width, fontSize: 18.25, rows: [["单元格"]], bold: true });
      const svg = Buffer.from(deckPptxTableImageData(table, aspect).split(",")[1], "base64").toString();
      const fontPx = Number(svg.match(/font-size="([\d.]+)"/)?.[1]);
      close(fontPx / 1200 * width / 100, table.fontSize / widthPt, "table ratio");
    }
  });

  test(`${aspect} saved cover measures and draws deck text using the same px`, async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    const drawn = [];
    const measured = [];
    const context = { fillRect() {}, measureText(value) { measured.push(this.font); return { width: value.length }; }, fillText() { drawn.push(this.font); } };
    const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (callback) => callback(new Blob(["png"], { type: "image/png" })) };
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
    try {
      assert.ok(await renderDeckPreviewPng(deck(aspect, [element({ fontSize: 4 }), element({ fontSize: 18.25 })])));
      for (const [index, fontSize] of [4, 18.25].entries()) close(Number(drawn[index]?.match(/([\d.]+)px/)?.[1]), fontSize * 1280 / widthPt, "cover font");
      assert.ok(measured.every((font) => drawn.includes(font)), "measurement and painting must share a font");
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
      else delete globalThis.document;
    }
  });
}
