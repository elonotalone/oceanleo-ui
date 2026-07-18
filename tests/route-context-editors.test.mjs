import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
} from "pdf-lib";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import {
  addPdfTextAnnotation,
  createBlankPdf,
} from "../src/shell/media-editors/pdf-operations.ts";
import {
  normalizeModel3DAnnotations,
  normalizeModel3DEnvironmentUrl,
  normalizeModel3DMaterialOverrides,
  normalizeSavedModelView,
} from "../src/shell/media-editors/model3d-view.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function controlBlock(contents, id) {
  const token = `id: "${id}"`;
  const start = contents.indexOf(token);
  assert.notEqual(start, -1, `missing control ${id}`);
  const next = contents.indexOf("id: ", start + token.length);
  return contents.slice(start, next < 0 ? contents.length : next);
}

function assertInspectorControls(path, ids) {
  const contents = source(path);
  for (const id of ids) {
    const block = controlBlock(contents, id);
    const inheritedGroup =
      (/\.\.\.group/.test(block) &&
        /const group = \{[\s\S]*?slot: "inspector"[\s\S]*?inspectorGroup:[\s\S]*?inspectorLabel:/.test(
          contents,
        )) ||
      (/\.\.\.[a-zA-Z]+Group/.test(block) &&
        /const [a-zA-Z]+Group = inspector\(/.test(contents));
    assert.ok(
      inheritedGroup || /slot: "inspector"/.test(block),
      `${id} must be inspector-only`,
    );
    assert.ok(
      inheritedGroup || /inspectorGroup:/.test(block),
      `${id} needs a semantic group`,
    );
    assert.ok(
      inheritedGroup || /inspectorLabel:/.test(block),
      `${id} needs a visible group label`,
    );
  }
}

test("route toolbars put continuous and long-form controls in semantic inspectors", () => {
  assertInspectorControls(
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
    [
      "crop-ratio",
      "text",
      "font-size",
      "line-height",
      "char-spacing",
      "table-rows",
      "table-columns",
      "table-border-width",
      "opacity",
      "stroke-width",
      "radius",
      "angle",
      "position-x",
      "position-y",
      "object-width",
      "object-height",
    ],
  );
  assertInspectorControls(
    "../src/shell/image-editor/fabric-image-filter-controls.ts",
    ["brightness", "contrast", "saturation", "grayscale", "filter-reset"],
  );
  assertInspectorControls(
    "../src/shell/chart-editor/ChartContextToolbar.tsx",
    [
      "title",
      "legend-color",
      "legend-font-size",
      "x-name",
      "y-name",
      "x-show",
      "y-show",
      "x-type",
      "y-type",
    ],
  );
  assertInspectorControls(
    "../src/shell/doc-editors/GridContextToolbar.tsx",
    [
      "decimals",
      "row-before",
      "row-after",
      "row-delete",
      "column-before",
      "column-after",
      "column-delete",
      "sort-asc",
      "sort-desc",
      "header-row",
      "filter-query",
    ],
  );
  assertInspectorControls(
    "../src/shell/doc-editors/deck-slide-selection-context.ts",
    ["transition-duration", "title", "body", "notes"],
  );
  assertInspectorControls(
    "../src/shell/doc-editors/DeckContextToolbar.tsx",
    [
      "opacity",
      "text",
      "font-size",
      "line-height",
      "letter-spacing",
      "border-width",
      "line-dash",
      "line-start",
      "line-end",
      "alt",
      "x",
      "y",
      "width",
      "height",
      "rotation",
    ],
  );
  assertInspectorControls(
    "../src/shell/doc-editors/RichDocContextToolbar.tsx",
    [
      "highlight",
      "link",
      "unlink",
      "row-add",
      "row-delete",
      "column-add",
      "column-delete",
      "table-delete",
    ],
  );
  assertInspectorControls(
    "../src/shell/video-editor/VideoTimelineContextToolbar.tsx",
    [
      "start-time",
      "duration",
      "source-in",
      "text",
      "font-size",
      "volume",
      "scale",
      "opacity",
      "rotation",
      "x",
      "y",
      "brightness",
      "contrast",
      "saturation",
      "transition",
      "transition-duration",
    ],
  );
  assertInspectorControls(
    "../src/shell/media-editors/AudioContextToolbar.tsx",
    [
      "fade-duration",
      "fade-in",
      "fade-out",
      "gain",
      "apply-gain",
      "effect-speed",
      "eq-low",
      "eq-mid",
      "eq-high",
      "apply-effects",
    ],
  );
  assertInspectorControls(
    "../src/shell/media-editors/PdfContextToolbar.tsx",
    [
      "annotation-select",
      "annotation-text",
      "annotation-update",
      "annotation-delete",
    ],
  );
  assertInspectorControls(
    "../src/shell/media-editors/Model3DContextToolbar.tsx",
    [
      "azimuth",
      "elevation",
      "zoom",
      "exposure",
      "shadow-intensity",
      "shadow-softness",
      "background",
      "environment-url",
      "environment-intensity",
      "shadow-enabled",
      "material-select",
      "material-color",
      "material-metallic",
      "material-roughness",
      "annotation-new",
      "annotation-add",
      "annotation-select",
      "annotation-label",
      "annotation-delete",
      "animation",
      "animation-playing",
      "animation-time",
      "animation-speed",
    ],
  );
});

test("route toolbar controls are backed by concrete persistent editor commands", () => {
  const imageCommands = source(
    "../src/shell/image-editor/fabric-image-commands.ts",
  );
  assert.match(imageCommands, /case "filter-reset":[\s\S]*?resetFilters\(\)/);
  assert.match(imageCommands, /case "crop-apply":[\s\S]*?confirmCrop\(\)/);
  assert.match(
    imageCommands,
    /case "layer-up":[\s\S]*?moveLayer\(selected\.id, "up"\)/,
  );
  const imageToolbar = source(
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
  );
  assert.match(imageToolbar, /editor\.beginGesture\(\)/);
  assert.match(imageToolbar, /editor\.endGesture\(\)/);
  assert.match(imageToolbar, /editor\.cancelGesture\(\)/);

  const chart = source("../src/shell/chart-editor/ChartContextToolbar.tsx");
  assert.match(chart, /editor\.setAxis/);
  assert.match(chart, /editor\.setLegend/);
  assert.match(chart, /editor\.patchSeries/);
  assert.match(chart, /legend-font-size/);
  assert.match(chart, /textStyle:/);
  assert.match(
    source("../src/shell/chart-editor/ChartControls.tsx"),
    /editor\.importCsv\(csv\)/,
  );

  const grid = source("../src/shell/doc-editors/GridContextToolbar.tsx");
  for (const command of [
    "applyFormat",
    "insertRow",
    "deleteRows",
    "insertColumn",
    "deleteColumns",
    "sort",
    "setFilterQuery",
    "mergeSelection",
    "splitSelection",
    "addConditionalFormat",
    "clearConditionalFormats",
  ]) {
    assert.match(grid, new RegExp(`editor\\.${command}\\(`));
  }
  const gridState = source("../src/shell/doc-editors/use-grid-editor.ts");
  assert.match(gridState, /filterQuery,[\s\S]*?filterColumn,/);
  assert.match(gridState, /setHeaderRow: updateHeaderRow/);

  const deck = source("../src/shell/doc-editors/deck-toolbar-command.ts");
  assert.match(deck, /case "transition"/);
  assert.match(deck, /editor\.patchSlide/);
  assert.match(deck, /editor\.patchSlideTransient/);
  assert.match(deck, /editor\.patchElementTransient/);
  assert.match(
    source("../src/shell/doc-editors/DeckStage.tsx"),
    /oleo-deck-slide-fade/,
  );

  const richdoc = source(
    "../src/shell/doc-editors/RichDocContextToolbar.tsx",
  );
  assert.match(richdoc, /toggleCodeBlock\(\)/);
  assert.match(richdoc, /setLinkHref/);
  assert.match(richdoc, /addRowAfter\(\)/);
  assert.match(richdoc, /deleteColumn\(\)/);

  const video = source(
    "../src/shell/video-editor/VideoTimelineContextToolbar.tsx",
  );
  assert.match(video, /state\.setClipTiming/);
  assert.match(
    video,
    /message\.phase === "cancel"[\s\S]*?state\.cancelGesture\(\)/,
  );
  assert.match(video, /transition_in:/);
  assert.match(video, /patchGesture\(\{ volume:/);
  assert.match(
    source("../src/shell/video-editor/preview-engine.ts"),
    /clip\.transition_in/,
  );

  const audio = [
    source("../src/shell/media-editors/AudioWorkbench.tsx"),
    source("../src/shell/media-editors/audio-workbench-utils.ts"),
    source("../src/shell/media-editors/audio-operations.ts"),
  ].join("\n");
  assert.match(audio, /copyAudioRange/);
  assert.match(audio, /deleteAudioRange/);
  assert.match(audio, /operation\.type === "fade"/);
  assert.match(audio, /operation\.type === "gain"/);
  assert.match(audio, /operation\.type === "effects"/);
  assert.doesNotMatch(
    source("../src/shell/media-editors/AudioContextToolbar.tsx"),
    /denois|noise-reduction|降噪/i,
  );

  const model = [
    source("../src/shell/media-editors/use-model3d-workbench.ts"),
    source("../src/shell/media-editors/model3d-runtime.mjs"),
  ].join("\n");
  assert.match(model, /patchSelectedMaterial/);
  assert.match(model, /material\.metalness = clamp\(value\.metalness/);
  assert.match(model, /material\.roughness = clamp\(value\.roughness/);
  assert.match(model, /onAnnotationPoint/);
  assert.match(model, /patchSelectedTransform/);
  assert.match(
    source("../src/shell/media-editors/model3d-project.ts"),
    /saveFileToLibrary[\s\S]*?annotations:/,
  );
});

test("deck transition normalization is bounded and persistent", () => {
  const deck = normalizeDeckDocument({
    title: "Transition test",
    slides: [
      {
        id: "slide-1",
        title: "Intro",
        transition: { type: "fade", durationMs: 9_999 },
      },
    ],
  });
  assert.deepEqual(deck.slides[0].transition, {
    type: "fade",
    durationMs: 3_000,
  });
  assert.deepEqual(
    normalizeDeckDocument({
      slides: [{ title: "Wipe transition", transition: { type: "wipe" } }],
    }).slides[0].transition,
    { type: "wipe", durationMs: 500 },
  );
});

test("PDF text annotations are embedded in the saved page dictionary", async () => {
  const blank = await createBlankPdf();
  const annotated = await addPdfTextAnnotation(blank, 0, "审核通过");
  const document = await PDFDocument.load(annotated);
  const annotations = document.getPage(0).node.Annots();
  assert.equal(annotations?.size(), 1);
  const dictionary = document.context.lookup(
    annotations.get(0),
    PDFDict,
  );
  assert.equal(
    dictionary.lookup(PDFName.of("Subtype"), PDFName).toString(),
    "/Text",
  );
  assert.equal(
    dictionary.lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
    "审核通过",
  );
});

test("3D environment, material and annotation metadata is bounded on reopen", () => {
  assert.equal(
    normalizeModel3DEnvironmentUrl("javascript:alert(1)"),
    "",
  );
  assert.equal(
    normalizeModel3DEnvironmentUrl("https://asset.oceanleo.com/studio.hdr"),
    "https://asset.oceanleo.com/studio.hdr",
  );
  assert.deepEqual(
    normalizeModel3DMaterialOverrides([
      {
        index: 0,
        name: "Body",
        color: "#123456",
        metallic: 2,
        roughness: -1,
      },
      { index: 0, name: "duplicate", color: "#ffffff" },
    ]),
    [
      {
        index: 0,
        name: "Body",
        color: "#123456",
        metallic: 1,
        roughness: 0,
      },
    ],
  );
  const annotations = normalizeModel3DAnnotations([
    { id: "pin", label: "Front", x: 100_001, y: "bad", z: -100_001 },
    { id: "pin", label: "Back", x: 1, y: 2, z: 3 },
  ]);
  assert.deepEqual(annotations[0], {
    id: "pin",
    label: "Front",
    x: 100_000,
    y: 0,
    z: -100_000,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    nodePath: "",
  });
  assert.notEqual(annotations[0].id, annotations[1].id);

  const view = normalizeSavedModelView({
    camera_orbit: "20deg 60deg 140%",
    environment_url: "https://asset.oceanleo.com/studio.hdr",
    material_overrides: [
      {
        index: 0,
        name: "Body",
        color: "#123456",
        metallic: 0.4,
        roughness: 0.6,
      },
    ],
    annotations: [{ id: "pin", label: "Front", x: 1, y: 2, z: 3 }],
  });
  assert.equal(view.environmentUrl, "https://asset.oceanleo.com/studio.hdr");
  assert.equal(view.materialOverrides[0].metallic, 0.4);
  assert.equal(view.annotations[0].label, "Front");
});
