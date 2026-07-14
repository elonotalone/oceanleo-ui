import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(
  new URL("../src/shell/workbench-routes.ts", import.meta.url),
  "utf8",
);
const workbench = readFileSync(
  new URL("../src/shell/AdvancedContentWorkbench.tsx", import.meta.url),
  "utf8",
);

test("advanced editor routing covers every durable material family", () => {
  for (const type of [
    "office",
    "video-timeline",
    "audio",
    "image",
    "pdf",
    "richdoc",
    "grid",
    "deck",
    "threed",
    "embed",
    "none",
  ]) {
    assert.match(routes, new RegExp(`type: "${type}"`));
  }
  assert.match(routes, /WORD_EXT/);
  assert.match(routes, /CELL_EXT/);
  assert.match(routes, /SLIDE_EXT/);
  assert.match(routes, /mime\.startsWith\("video\/"\)/);
  assert.match(routes, /mime\.startsWith\("audio\/"\)/);
  assert.match(routes, /mime\.startsWith\("image\/"\)/);
  assert.match(workbench, /editorRouteFor\(props\.item\)/);
});

test("video canvas uses the typed node-canvas embed", () => {
  assert.match(routes, /base: "https:\/\/video\.oceanleo\.com\/canvas-board"/);
  assert.match(routes, /mediaType: "video_canvas"/);
});
