// Game / video-canvas：没有关闭键、离开不拦、专业页不是第二套引擎。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/eas-w20-game-video-canvas.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GAME_DUAL_ENGINE_HANDOFF,
  gameLeavePolicy,
} from "../src/shell/game-editor/game-pages.ts";
import {
  VIDEO_CANVAS_DUAL_ENGINE_HANDOFF,
  flushVideoCanvasGraph,
  videoCanvasLeavePolicy,
} from "../src/shell/workflow-carrier/video-canvas-leave.ts";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const gameRoute = read("src/shell/advanced-routes/GameRoute.tsx");
const videoRoute = read("src/shell/advanced-routes/VideoCanvasRoute.tsx");
const videoStage = read("src/shell/workflow-carrier/VideoCanvasStage.tsx");

test("GameRoute has no close button, no leave block, and no dual-engine handoff", () => {
  assert.equal(GAME_DUAL_ENGINE_HANDOFF, false);
  assert.deepEqual(gameLeavePolicy(), {
    wait: false,
    confirm: false,
    beforeunload: false,
  });
  assert.doesNotMatch(gameRoute, /beforeunload/);
  assert.doesNotMatch(gameRoute, /confirm\(/);
  assert.doesNotMatch(gameRoute, /data-global-row-slot="close"/);
  assert.match(gameRoute, /gameModeUnavailable\(\)/);
  assert.match(gameRoute, /GAME_DUAL_ENGINE_HANDOFF/);
  assert.doesNotMatch(gameRoute, /beforeEnterPro/);
});

test("VideoCanvasRoute keeps the same canvas on pro and flushes the graph on leave", () => {
  assert.equal(VIDEO_CANVAS_DUAL_ENGINE_HANDOFF, false);
  assert.deepEqual(videoCanvasLeavePolicy(), {
    wait: false,
    confirm: false,
    beforeunload: false,
  });
  assert.doesNotMatch(videoRoute, /beforeunload/);
  assert.doesNotMatch(videoStage, /beforeunload/);
  assert.doesNotMatch(videoStage, /confirm\(/);
  assert.doesNotMatch(videoStage, /data-global-row-slot="close"/);
  assert.match(videoStage, /autoSave:\s*true/);
  assert.match(videoStage, /flushVideoCanvasGraph/);

  const item = {
    id: "wf-1",
    title: "流程",
    kind: "video_canvas",
    url: "https://example.test/a.json",
    meta: { graph: { nodes: [], edges: [] } },
  };
  const graph = {
    nodes: [{ id: "n1", kind: "image", label: "新节点" }],
    edges: [],
  };
  const flushed = flushVideoCanvasGraph(item, graph);
  assert.equal(flushed.ok, true);
  assert.equal(flushed.item.meta.graph.nodes[0].label, "新节点");
  assert.equal(item.meta.graph.nodes.length, 0);
});
