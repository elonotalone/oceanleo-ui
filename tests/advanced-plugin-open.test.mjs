import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADVANCED_PLUGIN_FEATURE_IDS,
  blankAdvancedFeatureItem,
} from "../src/shell/advanced-drafts.ts";

const pages = readFileSync(
  new URL("../src/shell/AdvancedFeaturePages.tsx", import.meta.url),
  "utf8",
);
const workbench = readFileSync(
  new URL("../src/shell/AdvancedContentWorkbench.tsx", import.meta.url),
  "utf8",
);
const catalog = readFileSync(
  "/root/projects/oceandino/front/lib/editor-board-catalog.ts",
  "utf8",
);

const EDITOR_BOARD_FEATURE_IDS = [
  "image_editing",
  "design_canvas",
  "video_editing",
  "website_finetuning",
  "presentation_editing",
  "document_editing",
  "spreadsheet_editing",
  "pdf_editing",
  "audio_editing",
  "model_3d",
  "chart_editing",
  "video_canvas",
  "game_editing",
];

test("all 13 operator plugins have a local draft that can open without the gateway", () => {
  assert.equal(ADVANCED_PLUGIN_FEATURE_IDS.length, 13);
  assert.deepEqual([...ADVANCED_PLUGIN_FEATURE_IDS].sort(), [...EDITOR_BOARD_FEATURE_IDS].sort());
  for (const id of ADVANCED_PLUGIN_FEATURE_IDS) {
    const item = blankAdvancedFeatureItem({ id, title: id }, "oceanleo");
    assert.equal(item.meta.draft, true);
    assert.equal(item.meta.blank, true);
    assert.equal(item.meta.feature_id, id);
    assert.notEqual(item.kind, "");
  }
});

test("direct /advanced workbench fills the viewport so embed iframes get height", () => {
  assert.match(pages, /flex h-dvh min-h-0 flex-col/);
  assert.match(pages, /<div className="min-h-0 flex-1">\s*<AdvancedContentWorkbench/);
});

test(" /advanced mounts the workbench and does not bounce home", () => {
  assert.match(pages, /blankAdvancedFeatureItem/);
  assert.match(pages, /<AdvancedContentWorkbench/);
  assert.match(pages, /ADVANCED_FEATURES\.map/);
  assert.doesNotMatch(pages, /router\.replace\("\/"\)/);
  assert.doesNotMatch(pages, /function RetiredAdvancedSurface/);
});

test("session loading no longer replaces a material canvas with a spinner", () => {
  assert.doesNotMatch(
    workbench,
    /availability === "loading"\) \{\s*return <WorkbenchRouteLoading/,
  );
  assert.match(workbench, /Session hydration must not hide a canvas/);
});

test("oceandino editor board still names the same 13 feature ids", () => {
  for (const id of EDITOR_BOARD_FEATURE_IDS) {
    assert.match(catalog, new RegExp(`featureId: "${id}"`));
  }
});

test("local blank drafts do not look like a missing office source", () => {
  const rendition = readFileSync(
    new URL("../src/shell/ArtifactRendition.tsx", import.meta.url),
    "utf8",
  );
  assert.match(rendition, /item\.meta\.draft === true \|\| item\.meta\.blank === true/);
  assert.match(rendition, /error: legacy\.url \|\| localDraft \? "" : "这个条目没有可用 URL。"/);
});
