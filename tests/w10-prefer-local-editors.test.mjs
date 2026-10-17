import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { preferLocalRemoteEditor } from "../src/shell/client-local-editors.ts";

const embedded = readFileSync("src/shell/advanced-routes/EmbeddedRoute.tsx", "utf8");

test("web default keeps the remote iframe; local cores are opt-in", () => {
  assert.equal(preferLocalRemoteEditor("design-canvas"), false);
  assert.equal(preferLocalRemoteEditor("website"), false);
  assert.equal(preferLocalRemoteEditor("video-canvas"), false);
  assert.equal(
    preferLocalRemoteEditor("design-canvas", { coreChoice: "legacy" }),
    false,
  );
});

test("next flag, non-web platform, or local-editor-cores capability turn local on", () => {
  assert.equal(
    preferLocalRemoteEditor("design-canvas", { coreChoice: "next" }),
    true,
  );
  assert.equal(
    preferLocalRemoteEditor("video-canvas", { platform: "desktop" }),
    true,
  );
  assert.equal(
    preferLocalRemoteEditor("website", {
      platform: "web",
      capabilities: ["local-editor-cores"],
    }),
    true,
  );
});

test("EmbeddedRoute still has the live iframe path and only branches locally when asked", () => {
  assert.match(embedded, /<EmbedEditorPane/);
  assert.match(embedded, /preferLocalDesignCanvas/);
  assert.match(embedded, /DesignCanvasLocalRoute/);
  assert.match(embedded, /preferLocalWebsite/);
  assert.match(embedded, /WebsiteLocalRoute/);
  assert.match(embedded, /DESIGN_CANVAS_WORKING_SCHEMA = "oceanleo\.design\.canvas\.v1"/);
});
