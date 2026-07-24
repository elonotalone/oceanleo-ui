import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import {
  DECK_PREVIEW_FIT_ZOOM_PERCENT,
  deckPreviewFitGeometry,
  deckPreviewLogicalSize,
  deckPreviewStagePadding,
} from "../src/shell/doc-editors/deck-preview-geometry.ts";

function approximately(actual, expected, epsilon = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test("50 percent is absolute half-scale, capped only when the stage is smaller", () => {
  const logicalSize = deckPreviewLogicalSize(16 / 9);
  const desktop = deckPreviewFitGeometry({
    viewportWidth: 1_000,
    viewportHeight: 700,
    logicalSize,
    zoomPercent: DECK_PREVIEW_FIT_ZOOM_PERCENT,
  });
  assert.equal(desktop.padding, 32);
  approximately(desktop.scale, 0.5);
  approximately(desktop.width, logicalSize.width * 0.5);
  approximately(desktop.height, logicalSize.height * 0.5);
  assert.ok(desktop.width <= desktop.availableWidth);
  assert.ok(desktop.height <= desktop.availableHeight);
  assert.ok(desktop.scale <= desktop.fitScale + 0.0001);

  // Acceptance desktop stage (~942x547) must land in 0.46..0.54.
  const acceptanceDesktop = deckPreviewFitGeometry({
    viewportWidth: 942,
    viewportHeight: 547,
    logicalSize,
    zoomPercent: 50,
  });
  assert.ok(acceptanceDesktop.scale >= 0.46);
  assert.ok(acceptanceDesktop.scale <= 0.54);
  approximately(acceptanceDesktop.scale, 0.5);

  const tiny = deckPreviewFitGeometry({
    viewportWidth: 320,
    viewportHeight: 200,
    logicalSize,
    zoomPercent: 50,
  });
  assert.ok(tiny.fitScale < 0.5);
  approximately(tiny.scale, tiny.fitScale);
  assert.ok(tiny.width <= tiny.availableWidth + 0.0001);
  assert.ok(tiny.height <= tiny.availableHeight + 0.0001);
});

test("fit supports 4:3 sources and zoom above 50 intentionally scrolls", () => {
  const logicalSize = deckPreviewLogicalSize(4 / 3);
  const fitted = deckPreviewFitGeometry({
    viewportWidth: 800,
    viewportHeight: 600,
    logicalSize,
    zoomPercent: 50,
  });
  assert.equal(deckPreviewStagePadding(800, 600), 20);
  approximately(fitted.scale, 0.5);
  assert.ok(fitted.width <= fitted.availableWidth);
  assert.ok(fitted.height <= fitted.availableHeight);

  const doubled = deckPreviewFitGeometry({
    viewportWidth: 800,
    viewportHeight: 600,
    logicalSize,
    zoomPercent: 100,
  });
  approximately(doubled.scale, 1);
  approximately(doubled.width, fitted.width * 2);
  approximately(doubled.height, fitted.height * 2);
  assert.ok(doubled.height > doubled.availableHeight);
});

test("responsive fit matrix never clips either supported slide aspect at 50 percent", () => {
  for (const aspectRatio of [16 / 9, 4 / 3]) {
    const logicalSize = deckPreviewLogicalSize(aspectRatio);
    for (const [viewportWidth, viewportHeight] of [
      [320, 240],
      [390, 540],
      [768, 500],
      [1_024, 640],
      [1_440, 900],
      [1_680, 1_050],
    ]) {
      const fitted = deckPreviewFitGeometry({
        viewportWidth,
        viewportHeight,
        logicalSize,
        zoomPercent: 50,
      });
      assert.ok(fitted.width <= fitted.availableWidth + 0.0001);
      assert.ok(fitted.height <= fitted.availableHeight + 0.0001);
      approximately(
        fitted.scale,
        Math.min(0.5, fitted.fitScale),
      );
      approximately(fitted.width / fitted.height, aspectRatio);
    }
  }
});

test("shared layout contract owns rail, fitted stage and keyboard selection", () => {
  const component = readFileSync(
    new URL(
      "../src/shell/doc-editors/DeckPreviewLayout.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(component, /export interface DeckPreviewLayoutSlide/);
  assert.match(component, /export interface DeckPreviewLayoutProps/);
  assert.doesNotMatch(component, /DeckEditorState/);
  assert.match(component, /data-deck-thumbnail-rail/);
  assert.match(component, /overflow-y-auto/);
  assert.match(component, /h-full min-h-0/);
  assert.match(component, /data-deck-preview-stage/);
  assert.match(component, /new ResizeObserver\(measure\)/);
  assert.match(component, /aria-current=\{active \? "page"/);
  assert.match(component, /event\.key === "ArrowDown"/);
  assert.match(component, /useCenteredWheelZoom/);
});

test("Deck edit route consumes shared layout and resets fit to 50 percent", () => {
  const stage = readFileSync(
    new URL("../src/shell/doc-editors/DeckStage.tsx", import.meta.url),
    "utf8",
  );
  const mini = readFileSync(
    new URL("../src/shell/doc-editors/DeckMiniSlide.tsx", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../src/shell/advanced-routes/DeckRoute.tsx", import.meta.url),
    "utf8",
  );
  assert.match(stage, /<DeckPreviewLayout/);
  assert.match(stage, /slides=\{previewSlides\}/);
  assert.match(stage, /onActiveSlideChange=\{editor\.selectSlide\}/);
  assert.match(stage, /<SlideCanvas/);
  assert.doesNotMatch(stage, /<DeckSlideRail/);
  assert.match(mini, /data-deck-thumbnail-surface/);
  assert.doesNotMatch(mini, /from "\.\/DeckElementContent"/);
  assert.doesNotMatch(mini, /<MiniDeckElementLayer/);
  assert.match(
    route,
    /useState\(DECK_PREVIEW_FIT_ZOOM_PERCENT\)/,
  );
  assert.match(
    route,
    /fit: \(\) => setZoom\(DECK_PREVIEW_FIT_ZOOM_PERCENT\)/,
  );
});

test("shared layout and edit integration transpile without diagnostics", () => {
  for (const path of [
    "../src/shell/doc-editors/DeckPreviewLayout.tsx",
    "../src/shell/doc-editors/DeckStage.tsx",
    "../src/shell/doc-editors/DeckMiniSlide.tsx",
    "../src/shell/advanced-routes/DeckRoute.tsx",
  ]) {
    const result = ts.transpileModule(
      readFileSync(new URL(path, import.meta.url), "utf8"),
      {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    );
    assert.deepEqual(
      result.diagnostics?.map((diagnostic) => diagnostic.messageText) || [],
      [],
      path,
    );
  }
});
