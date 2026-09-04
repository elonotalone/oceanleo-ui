// W09 wiring gate — dual-core route, dynamic leaf, no Remotion, old core kept.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_EDITOR_CORE } from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  VIDEO_DESIGNCOMBO_DEFAULT_MODE,
  videoDesigncomboChrome,
} from "../src/shell/video-editor/designcombo/chrome.ts";
import {
  VIDEO_DESIGNCOMBO_INSTANCE_ID,
  applyVideoDesigncomboChromeDom,
  applyVideoDesigncomboMode as applyMode,
} from "../src/shell/video-editor/designcombo/stage-plan.ts";
import { videoToolsManifestChips } from "../src/shell/video-editor/designcombo/l4-chips.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/VideoTimelineRoute.tsx");
const leaf = read("src/shell/video-editor/VideoDesigncomboStage.tsx");
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const leafCode = leaf
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("video-timeline"\) === "next"\)/);
  assert.doesNotMatch(route, /from "@openvideo\//);
  assert.doesNotMatch(route, /from "@remotion\//);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/video-editor\/VideoDesigncomboStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<VideoDesigncomboStage \{\.\.\.props\} \/>/);
  assert.match(route, /function VideoTimelineLegacyRoute/);
  assert.match(route, /useVideoTimeline/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
});

test("professional mode uses buildSetModeMessage without postMessage", () => {
  assert.equal(VIDEO_DESIGNCOMBO_DEFAULT_MODE, "normal");
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(leaf, /applyVideoDesigncomboMode/);
  assert.match(leaf, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.match(leaf, /mode: \{\s*\n\s*current: mode,/);
  assert.doesNotMatch(routeCode, /postMessage/);
  assert.doesNotMatch(leafCode, /postMessage/);
  assert.doesNotMatch(routeCode, /buildSetModeMessage/);

  const normal = applyMode(VIDEO_DESIGNCOMBO_INSTANCE_ID, "normal");
  assert.equal(normal.mode, "normal");
  assert.equal(normal.chrome.header, false);
  assert.equal(normal.chrome.inspector, false);
  assert.equal(normal.message.type, "set-mode");
  assert.equal(normal.message.mode, "normal");

  const pro = applyMode(VIDEO_DESIGNCOMBO_INSTANCE_ID, "pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.chrome.header, true);
  assert.equal(pro.chrome.inspector, true);
  assert.equal(pro.chrome.timelineChrome, true);
});

test("create-time chrome stays mounted: hide by display, do not dispose the project", () => {
  const chrome = videoDesigncomboChrome("normal");
  const hidden = [];
  const root = {
    setAttribute() {},
    querySelectorAll(selector) {
      hidden.push(selector);
      return [{ style: { display: "" } }];
    },
  };
  applyVideoDesigncomboChromeDom(root, chrome);
  assert.ok(hidden.length >= 3);
  assert.doesNotMatch(leafCode, /engine\.dispose\(\);\s*engineRef/);
  assert.match(leaf, /engine\.dispose\(\)/);
  const disposeCount = leaf.split("engine.dispose(").length - 1;
  assert.equal(disposeCount, 1);
});

test("legacy timeline UI is still in the tree", () => {
  assert.match(route, /<VideoTimelineStage state=\{editor\}/);
  assert.match(route, /createVideoCommandSurface/);
});

test("the leaf does not import remotion or sonner", () => {
  assert.doesNotMatch(leaf, /@remotion/);
  assert.doesNotMatch(leaf, /from "sonner"/);
  assert.match(leaf, /renderTimeline/);
  assert.match(leaf, /OPENVIDEO_PROJECT_SCHEMA/);
});

test("tools-manifest v2 exposes eight chips", () => {
  const manifest = videoToolsManifestChips();
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.chips.length, 8);
});

test("agent command surface proposes review and never commits", () => {
  const runStart = leaf.indexOf("run: (id, params)");
  assert.ok(runStart >= 0);
  const chunk = leaf.slice(runStart, runStart + 1600);
  assert.match(chunk, /buildVideoReviewProposal/);
  assert.doesNotMatch(chunk, /\bcommit\(/);
  assert.match(chunk, /接受前不会写入时间线/);
});

test("the next-core leaf has no static openvideo or remotion imports", () => {
  assert.doesNotMatch(leafCode, /from ["']@openvideo\//);
  assert.doesNotMatch(leafCode, /from ["']@remotion\//);
  assert.doesNotMatch(routeCode, /from ["']@openvideo\//);
});
