import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(
  new URL("../src/shell/workbench-routes.ts", import.meta.url),
  "utf8",
);
const registrySource = readFileSync(
  new URL(
    "../src/shell/workbench-capability-registry.ts",
    import.meta.url,
  ),
  "utf8",
);
const workbench = readFileSync(
  new URL("../src/shell/AdvancedContentWorkbench.tsx", import.meta.url),
  "utf8",
);
const {
  TRUSTED_EDITOR_REGISTRY,
  editorCapabilityFor,
} = await import(
  "../src/shell/workbench-routes.ts"
);

test("advanced editor routing covers every durable material family", () => {
  assert.deepEqual(
    Object.keys(TRUSTED_EDITOR_REGISTRY).sort(),
    [
      "audio",
      "chart-editor@1",
      "deck",
      "design-canvas",
      "grid",
      "image",
      "office",
      "pdf",
      "richdoc",
      "threed",
      "video-canvas",
      "video-timeline",
      "website",
    ],
  );
  for (const entry of Object.values(TRUSTED_EDITOR_REGISTRY)) {
    assert.deepEqual(entry.roundTrip, ["load", "mutate", "save", "reopen"]);
  }
  assert.match(routes, /WORD_EXT/);
  assert.match(routes, /CELL_EXT/);
  assert.match(routes, /SLIDE_EXT/);
  assert.match(routes, /NATIVE_DECK_EXT/);
  assert.match(
    routes,
    /if \(NATIVE_DECK_EXT\.has\(officeExt\)\) \{\s*return available\("deck"/,
  );
  assert.match(routes, /mime\.startsWith\("video\/"\)/);
  assert.match(routes, /mime\.startsWith\("audio\/"\)/);
  assert.match(routes, /mime\.startsWith\("image\/"\)/);
  assert.match(registrySource, /TRUSTED_EDITOR_REGISTRY/);
  assert.match(workbench, /editorRouteFor\(props\.item\)/);
});

test("opaque URLs and blob uploads still identify every PPTX as a native deck", () => {
  const byMime = editorCapabilityFor({
    id: "opaque-pptx",
    title: "季度复盘",
    kind: "file",
    url: "https://api.oceanleo.com/v1/media/object/opaque-id",
    meta: {
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
  });
  assert.deepEqual(byMime.route, { type: "deck" });

  const byFilename = editorCapabilityFor({
    id: "blob-pptx",
    title: "路演方案.pptx",
    kind: "file",
    url: "blob:https://ppt.oceanleo.com/opaque-id",
    meta: {},
  });
  assert.deepEqual(byFilename.route, { type: "deck" });
});

test("video canvas uses the typed node-canvas embed", () => {
  assert.match(routes, /base: "https:\/\/video\.oceanleo\.com\/canvas-board"/);
  assert.match(routes, /mediaType: "video_canvas"/);
});
