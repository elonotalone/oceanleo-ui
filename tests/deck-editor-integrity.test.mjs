import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { strFromU8, unzipSync } from "fflate";
import PptxGenJS from "pptxgenjs";
import ts from "typescript";

import {
  applyDeckElementPatch,
  deckDocumentsEqual,
  deckElementMutationAllowed,
  deckElementPatchAllowed,
  deckToolbarControlAllowed,
} from "../src/shell/doc-editors/DeckMutationPolicy.ts";
import {
  deckPptxImageStyle,
  deckPptxRadiusRatio,
  deckPptxShapeStyle,
  deckPptxTableImageData,
  deckPptxTableRequiresImage,
  deckPptxTextStyle,
  deckPptxTransparency,
  deckPptxVisualObjectName,
  injectDeckPptxVisuals,
} from "../src/shell/doc-editors/DeckPptxVisuals.ts";
import {
  cloneDeckDocument,
  normalizeDeckDocument,
} from "../src/shell/doc-editors/deck-schema.ts";

const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      const unresolved = new URL(specifier, context.parentURL);
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(`${unresolved.href}${extension}`);
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) {
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

function fixtureDeck() {
  return normalizeDeckDocument({
    version: 2,
    title: "Integrity",
    aspect: "16:9",
    theme: "ocean",
    slides: [
      {
        id: "slide-integrity",
        title: "Integrity",
        body: "",
        bullets: [],
        notes: "same model",
        layout: "blank",
        background: "#ffffff",
        elements: [
          {
            id: "text-integrity",
            type: "text",
            x: 5,
            y: 5,
            width: 42,
            height: 18,
            rotation: 0,
            order: 1,
            text: "Editable text",
            color: "#123456",
            fill: "#ffffff",
            fontSize: 24,
            underline: true,
            lineHeight: 1.45,
            letterSpacing: 2.5,
            opacity: 0.63,
            shadow: true,
            locked: true,
          },
          {
            id: "shape-integrity",
            type: "shape",
            x: 5,
            y: 30,
            width: 30,
            height: 24,
            rotation: 8,
            order: 2,
            shape: "rectangle",
            fill: "#ff5500",
            borderColor: "#112233",
            borderWidth: 2,
            borderRadius: 24,
            opacity: 0.55,
            shadow: true,
            locked: true,
          },
          {
            id: "image-integrity",
            type: "image",
            x: 48,
            y: 8,
            width: 42,
            height: 42,
            rotation: 4,
            order: 3,
            src: pixel,
            alt: "Editable filtered image",
            imageFit: "cover",
            flipX: true,
            flipY: true,
            brightness: 1.2,
            contrast: 0.8,
            saturation: 1.4,
            blur: 3,
            borderRadius: 16,
            opacity: 0.42,
            shadow: true,
            locked: true,
          },
          {
            id: "table-integrity",
            type: "table",
            x: 40,
            y: 58,
            width: 45,
            height: 28,
            rotation: 0,
            order: 4,
            rows: [
              ["Metric", "Value"],
              ["Opacity", "50%"],
            ],
            fill: "#ffffff",
            color: "#111827",
            opacity: 0.5,
          },
        ],
      },
    ],
  });
}

test("Deck lock policy rejects style, geometry and destructive mutations without a model delta", () => {
  const locked = fixtureDeck().slides[0].elements[0];
  for (const patch of [
    { text: "mutated" },
    { opacity: 0.1 },
    { x: 90 },
    { shadow: false },
    { locked: false, x: 90 },
  ]) {
    assert.equal(deckElementPatchAllowed(locked, patch), false);
    assert.strictEqual(applyDeckElementPatch(locked, patch), locked);
  }
  for (const intent of ["patch", "replace", "layer", "duplicate", "delete"]) {
    assert.equal(deckElementMutationAllowed(locked, intent), false, intent);
  }

  const metadata = applyDeckElementPatch(locked, { label: "inspected" });
  assert.notStrictEqual(metadata, locked);
  assert.equal(metadata.label, "inspected");
  const unlocked = applyDeckElementPatch(locked, { locked: false });
  assert.equal(unlocked.locked, false);
  assert.equal(deckToolbarControlAllowed(locked, "lock"), true);
  assert.equal(deckToolbarControlAllowed(locked, "alt"), true);
  assert.equal(deckToolbarControlAllowed(locked, "future-mutation"), false);

  const before = fixtureDeck();
  const rejected = cloneDeckDocument(before);
  rejected.slides[0].elements[0] = applyDeckElementPatch(
    rejected.slides[0].elements[0],
    { opacity: 0.1 },
  );
  assert.equal(deckDocumentsEqual(before, rejected), true);
});

test("Deck model save/reopen round-trip preserves every advanced visual field", () => {
  const before = fixtureDeck();
  const reopened = normalizeDeckDocument(
    JSON.parse(JSON.stringify(before)),
    before.title,
  );
  assert.deepEqual(reopened, before);

  const image = reopened.slides[0].elements.find(
    (element) => element.id === "image-integrity",
  );
  assert.deepEqual(
    {
      opacity: image.opacity,
      shadow: image.shadow,
      borderRadius: image.borderRadius,
      fit: image.imageFit,
      flipX: image.flipX,
      flipY: image.flipY,
      brightness: image.brightness,
      contrast: image.contrast,
      saturation: image.saturation,
      blur: image.blur,
      locked: image.locked,
    },
    {
      opacity: 0.42,
      shadow: true,
      borderRadius: 16,
      fit: "cover",
      flipX: true,
      flipY: true,
      brightness: 1.2,
      contrast: 0.8,
      saturation: 1.4,
      blur: 3,
      locked: true,
    },
  );
});

test("real PPTX package carries native editable text, shape and image visual semantics", async () => {
  const deck = fixtureDeck();
  const source = deck.slides[0];
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();

  const text = source.elements[0];
  const textTransparency = deckPptxTransparency(text);
  slide.addText(text.text, {
    x: 0.5,
    y: 0.4,
    w: 4,
    h: 1.2,
    objectName: deckPptxVisualObjectName(text.id),
    color: "123456",
    fill: { color: "FFFFFF", transparency: textTransparency },
    ...deckPptxTextStyle(text),
  });

  const shape = source.elements[1];
  const shapeBox = { x: 0.5, y: 2.2, w: 3, h: 1.8 };
  const { transparency: shapeTransparency, ...shapeStyle } =
    deckPptxShapeStyle(shape, shapeBox, deck.aspect);
  slide.addShape(pptx.ShapeType.roundRect, {
    ...shapeBox,
    objectName: deckPptxVisualObjectName(shape.id),
    fill: { color: "FF5500", transparency: shapeTransparency },
    line: {
      color: "112233",
      width: 2,
      transparency: shapeTransparency,
    },
    ...shapeStyle,
  });

  const image = source.elements[2];
  const imageBox = { x: 6.2, y: 0.6, w: 4.2, h: 3.2 };
  slide.addImage({
    data: image.src,
    ...imageBox,
    objectName: deckPptxVisualObjectName(image.id),
    ...deckPptxImageStyle(image, imageBox),
  });

  const table = source.elements[3];
  slide.addTable(
    table.rows.map((row) => row.map((text) => ({ text }))),
    {
      x: 5,
      y: 4.6,
      w: 4.5,
      h: 1.8,
      objectName: deckPptxVisualObjectName(table.id),
      color: "111827",
      fill: {
        color: "FFFFFF",
        transparency: deckPptxTransparency(table),
      },
    },
  );

  const raw = await pptx.write({ outputType: "blob" });
  const exported = await injectDeckPptxVisuals(
    raw,
    deck.slides,
    deck.aspect,
  );
  const archive = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  const xml = strFromU8(archive["ppt/slides/slide1.xml"]);

  assert.match(xml, /\bu="sng"/);
  assert.match(xml, /<a:spcPct val="145000"\/>/);
  assert.match(xml, /\bspc="188"/);
  assert.match(xml, /<a:outerShdw\b/);
  assert.match(xml, /<a:alpha val="63000"\/>/);
  assert.match(xml, /<a:prstGeom prst="roundRect">/);
  assert.match(xml, /<a:gd name="adj" fmla="val \d+"\/>/);

  assert.match(xml, /\bflipH="1"/);
  assert.match(xml, /\bflipV="1"/);
  assert.match(xml, /<a:alphaModFix amt="42000"\/>/);
  assert.match(xml, /<a:srcRect\b[^>]*\/>/);
  assert.match(xml, /<a:lum bright="20000" contrast="-20000"\/>/);
  assert.match(xml, /<a:hsl hue="0" sat="40000" lum="0"\/>/);
  assert.match(xml, /<a:blur rad="28575" grow="0"\/>/);
  assert.match(xml, /<a:picLocks\b[^>]*noMove="1"[^>]*noCrop="1"/);
  assert.match(xml, /<a:spLocks\b[^>]*noMove="1"[^>]*noTextEdit="1"/);
  assert.match(xml, /<a:alpha val="50000"\/>/);
});

test("production Deck exporter pins and delivers the same advanced model", async () => {
  const { buildDeckPptxBlob } = await import(
    "../src/shell/doc-editors/use-deck-editor.ts"
  );
  const deck = fixtureDeck();
  const exported = await buildDeckPptxBlob(deck);
  const archive = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  const xml = strFromU8(archive["ppt/slides/slide1.xml"]);

  assert.match(xml, /\bu="sng"/);
  assert.match(xml, /<a:spcPct val="145000"\/>/);
  assert.match(xml, /\bspc="188"/);
  assert.match(xml, /<a:alphaModFix amt="42000"\/>/);
  assert.match(xml, /<a:lum bright="20000" contrast="-20000"\/>/);
  assert.match(xml, /<a:hsl hue="0" sat="40000" lum="0"\/>/);
  assert.match(xml, /<a:blur rad="28575" grow="0"\/>/);
  assert.match(xml, /\bflipH="1"/);
  assert.match(xml, /\bflipV="1"/);
  assert.match(xml, /<a:prstGeom prst="roundRect">/);
  assert.match(xml, /<a:gd name="adj" fmla="val 18519"\/>/);
  assert.match(xml, /<a:outerShdw\b/);
  assert.match(xml, /<a:picLocks\b[^>]*noMove="1"[^>]*noCrop="1"/);
  assert.equal(
    Object.keys(archive).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .length,
    deck.slides.length,
  );
});

test("PPTX radius math and deterministic table fallback preserve unsupported effects", async () => {
  const deck = fixtureDeck();
  const shape = deck.slides[0].elements.find(
    (element) => element.id === "shape-integrity",
  );
  assert.equal(
    Math.round(deckPptxRadiusRatio(shape, deck.aspect) * 100_000),
    18_519,
  );

  const table = deck.slides[0].elements.find(
    (element) => element.id === "table-integrity",
  );
  table.shadow = true;
  table.rotation = 7;
  table.flipX = true;
  table.locked = true;
  assert.equal(deckPptxTableRequiresImage(table), true);
  const firstEncoding = deckPptxTableImageData(table);
  const secondEncoding = deckPptxTableImageData(table);
  assert.equal(firstEncoding, secondEncoding);
  assert.match(firstEncoding, /^data:image\/svg\+xml;base64,/);

  const { buildDeckPptxBlob } = await import(
    "../src/shell/doc-editors/use-deck-editor.ts"
  );
  const exported = await buildDeckPptxBlob(deck);
  const archive = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  const xml = strFromU8(archive["ppt/slides/slide1.xml"]);
  const objectName = deckPptxVisualObjectName(table.id);
  const marker = xml.indexOf(`name="${objectName}"`);
  assert.ok(marker > 0);
  const pictureStart = xml.lastIndexOf("<p:pic", marker);
  const graphicFrameStart = xml.lastIndexOf("<p:graphicFrame", marker);
  assert.ok(
    pictureStart > graphicFrameStart,
    "shadowed/rotated table must be exported as a deterministic picture",
  );
  const pictureEnd = xml.indexOf("</p:pic>", marker);
  const picture = xml.slice(pictureStart, pictureEnd + "</p:pic>".length);
  assert.match(picture, /<a:outerShdw\b/);
  assert.match(picture, /<a:alphaModFix amt="50000"\/>/);
  assert.match(picture, /\bflipH="1"/);
  assert.match(picture, /<a:picLocks\b[^>]*noMove="1"[^>]*noCrop="1"/);
});

test("Deck continuous editor controls use one gesture base and transient updates", () => {
  const editor = readFileSync(
    new URL(
      "../src/shell/doc-editors/use-deck-editor.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const controls = readFileSync(
    new URL("../src/shell/doc-editors/DeckControls.tsx", import.meta.url),
    "utf8",
  );
  const stage =
    readFileSync(
      new URL("../src/shell/doc-editors/DeckStage.tsx", import.meta.url),
      "utf8",
    ) +
    readFileSync(
      new URL(
        "../src/shell/doc-editors/deck-text-gesture.ts",
        import.meta.url,
      ),
      "utf8",
    );
  const shortcuts = readFileSync(
    new URL(
      "../src/shell/doc-editors/use-deck-stage-shortcuts.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(editor, /beginGesture[\s\S]*gestureRef\.current = snapshot\(\)/);
  assert.match(editor, /endGesture[\s\S]*undoRef\.current\.push\(base\)/);
  assert.match(controls, /onPointerDown=\{editor\.beginGesture\}/);
  assert.match(controls, /editor\.patchElementTransient/);
  assert.match(controls, /onPointerUp=\{editor\.endGesture\}/);
  assert.match(stage, /onFocus: \(\) => editor\.beginGesture\(\)/);
  assert.match(stage, /editor\.patchSlideTransient/);
  assert.match(shortcuts, /heldArrowKeys\.current\.add/);
  assert.match(shortcuts, /heldArrowKeys\.current\.size === 0/);
});
