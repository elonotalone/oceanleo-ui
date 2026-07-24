import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  IMAGE_EDGE_SNAP_ACQUIRE_PX,
  IMAGE_EDGE_SNAP_RELEASE_PX,
  emptyImageEdgeSnapState,
  imageEdgeScaleAnchorCorrection,
  imageEdgeScaleMultipliers,
  imageScaleControlLocksAspectRatio,
  imageSnapEdgesForControl,
  resolveImageEdgeSnap,
  viewportAxisScales,
} from "../src/shell/image-editor/editor-runtime.ts";

const doc = { width: 1_000, height: 800 };
const viewport = [1, 0, 0, 1, 120, -40];

function snap(bounds, options = {}) {
  return resolveImageEdgeSnap({
    bounds,
    doc,
    viewport,
    ...options,
  });
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, message);
}

test("all four corresponding image and canvas edge pairs snap", () => {
  assert.deepEqual(
    snap({ left: 6, top: 200, width: 100, height: 100 }),
    { dx: -6, dy: 0, state: { x: "left", y: null } },
  );
  assert.deepEqual(
    snap({ left: 893, top: 200, width: 100, height: 100 }),
    { dx: 7, dy: 0, state: { x: "right", y: null } },
  );
  assert.deepEqual(
    snap({ left: 200, top: 5, width: 100, height: 100 }),
    { dx: 0, dy: -5, state: { x: null, y: "top" } },
  );
  assert.deepEqual(
    snap({ left: 200, top: 694, width: 100, height: 100 }),
    { dx: 0, dy: 6, state: { x: null, y: "bottom" } },
  );
  assert.deepEqual(
    snap({ left: 4, top: 696, width: 100, height: 100 }),
    { dx: -4, dy: 4, state: { x: "left", y: "bottom" } },
  );
});

test("screen-space acquisition distance is invariant across zoom and pan", () => {
  assert.equal(IMAGE_EDGE_SNAP_ACQUIRE_PX, 8);
  assert.deepEqual(viewportAxisScales([0, 2, -3, 0, 900, -500]), {
    x: 2,
    y: 3,
  });
  for (const zoom of [0.5, 1, 2, 4]) {
    const insideSceneDistance = 7.75 / zoom;
    const outsideSceneDistance = 8.25 / zoom;
    const inside = resolveImageEdgeSnap({
      bounds: {
        left: insideSceneDistance,
        top: 200,
        width: 100,
        height: 100,
      },
      doc,
      viewport: [zoom, 0, 0, zoom, 1_200, -700],
    });
    const outside = resolveImageEdgeSnap({
      bounds: {
        left: outsideSceneDistance,
        top: 200,
        width: 100,
        height: 100,
      },
      doc,
      viewport: [zoom, 0, 0, zoom, -300, 950],
    });
    assert.equal(inside.dx, -insideSceneDistance, `${zoom}x inside`);
    assert.equal(inside.state.x, "left", `${zoom}x inside state`);
    assert.equal(outside.dx, 0, `${zoom}x outside`);
    assert.equal(outside.state.x, null, `${zoom}x outside state`);
  }
});

test("hysteresis holds a snapped edge without threshold jitter and releases cleanly", () => {
  assert.ok(IMAGE_EDGE_SNAP_RELEASE_PX > IMAGE_EDGE_SNAP_ACQUIRE_PX);
  const acquired = snap({ left: 7.9, top: 200, width: 100, height: 100 });
  assert.equal(acquired.state.x, "left");

  for (const left of [8.1, 7.95, 10, 13.9, 8.2]) {
    const held = snap(
      { left, top: 200, width: 100, height: 100 },
      { previous: acquired.state },
    );
    assert.equal(held.dx, -left, `held at ${left}px`);
    assert.equal(held.state.x, "left", `latched at ${left}px`);
  }

  const released = snap(
    { left: 14.01, top: 200, width: 100, height: 100 },
    { previous: acquired.state },
  );
  assert.deepEqual(released, {
    dx: 0,
    dy: 0,
    state: emptyImageEdgeSnapState(),
  });
  const freeAfterRelease = snap(
    { left: 10, top: 200, width: 100, height: 100 },
    { previous: released.state },
  );
  assert.equal(freeAfterRelease.dx, 0);
  assert.equal(freeAfterRelease.state.x, null);
});

test("Alt-style deliberate bypass clears the latch and movement stays free away from edges", () => {
  const acquired = snap({ left: 4, top: 200, width: 100, height: 100 });
  const bypassed = snap(
    { left: 2, top: 200, width: 100, height: 100 },
    { previous: acquired.state, bypass: true },
  );
  assert.deepEqual(bypassed, {
    dx: 0,
    dy: 0,
    state: emptyImageEdgeSnapState(),
  });
  assert.deepEqual(
    snap({ left: 140, top: 170, width: 200, height: 160 }),
    { dx: 0, dy: 0, state: emptyImageEdgeSnapState() },
  );
});

test("scale and crop controls snap only the manipulated edge or corner", () => {
  assert.deepEqual(imageSnapEdgesForControl("tl"), ["left", "top"]);
  assert.deepEqual(imageSnapEdgesForControl("tr"), ["right", "top"]);
  assert.deepEqual(imageSnapEdgesForControl("bl"), ["left", "bottom"]);
  assert.deepEqual(imageSnapEdgesForControl("br"), ["right", "bottom"]);
  assert.deepEqual(imageSnapEdgesForControl("ml"), ["left"]);
  assert.deepEqual(imageSnapEdgesForControl("mr"), ["right"]);
  assert.deepEqual(imageSnapEdgesForControl("mt"), ["top"]);
  assert.deepEqual(imageSnapEdgesForControl("mb"), ["bottom"]);
  assert.equal(imageScaleControlLocksAspectRatio("tr", false), true);
  assert.equal(imageScaleControlLocksAspectRatio("tr", true), false);
  assert.equal(imageScaleControlLocksAspectRatio("mr", false), false);

  const nearTopAndRight = {
    left: 895,
    top: 5,
    width: 100,
    height: 100,
  };
  assert.deepEqual(
    snap(nearTopAndRight, { edges: imageSnapEdgesForControl("mr") }),
    { dx: 5, dy: 0, state: { x: "right", y: null } },
  );
  assert.deepEqual(
    snap(nearTopAndRight, { edges: imageSnapEdgesForControl("tr") }),
    { dx: 5, dy: -5, state: { x: "right", y: "top" } },
  );

  const left = snap({ left: 4, top: 200, width: 100, height: 100 });
  const leftScale = imageEdgeScaleMultipliers(
    { width: 100, height: 100 },
    left,
  );
  const fixedRight = 104;
  const resizedLeft = fixedRight - 100 * leftScale.x;
  assertClose(resizedLeft, 0, "left reaches zero");
  assertClose(
    resizedLeft + 100 * leftScale.x,
    fixedRight,
    "right remains fixed",
  );

  const right = snap({ left: 895, top: 200, width: 100, height: 100 });
  const rightScale = imageEdgeScaleMultipliers(
    { width: 100, height: 100 },
    right,
  );
  assertClose(895 + 100 * rightScale.x, 1_000, "right reaches document");

  const top = snap({ left: 200, top: 5, width: 100, height: 100 });
  const topScale = imageEdgeScaleMultipliers(
    { width: 100, height: 100 },
    top,
  );
  assertClose(105 - 100 * topScale.y, 0, "top reaches zero");

  const bottom = snap({ left: 200, top: 694, width: 100, height: 100 });
  const bottomScale = imageEdgeScaleMultipliers(
    { width: 100, height: 100 },
    bottom,
  );
  assertClose(
    694 + 100 * bottomScale.y,
    800,
    "bottom reaches document",
  );
  const lockedRatioScale = imageEdgeScaleMultipliers(
    { width: 100, height: 60 },
    right,
    true,
  );
  assertClose(
    lockedRatioScale.x,
    lockedRatioScale.y,
    "fixed-ratio crop scales uniformly",
  );
  assert.deepEqual(
    imageEdgeScaleAnchorCorrection(
      { left: 4, top: 5, width: 100, height: 100 },
      { left: -1, top: 3, width: 106, height: 103 },
      { x: "left", y: "top" },
    ),
    { dx: -1, dy: -1 },
    "left/top resize drift is translated back to the fixed right/bottom edges",
  );
  assert.deepEqual(
    imageEdgeScaleAnchorCorrection(
      { left: 895, top: 694, width: 100, height: 100 },
      { left: 894, top: 693, width: 106, height: 107 },
      { x: "right", y: "bottom" },
    ),
    { dx: 1, dy: 1 },
    "right/bottom resize drift is translated back to the fixed left/top edges",
  );
  assert.ok(leftScale.x > 0 && rightScale.x > 0);
  assert.ok(topScale.y > 0 && bottomScale.y > 0);
});

test("Fabric drag and crop/scale hooks share snapping state and preserve Alt object drag", () => {
  const core = readFileSync(
    new URL(
      "../src/shell/image-editor/fabric-controller-core.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    core,
    /before:transform[\s\S]*?resetImageEdgeSnap\(transform\.target\)/,
  );
  assert.match(
    core,
    /object:moving[\s\S]*?constrainCropToDoc[\s\S]*?snapImageMoveEdges\(target, e\)/,
  );
  assert.match(
    core,
    /object:scaling[\s\S]*?snapImageScaleEdges\(target, e, transform\)/,
  );
  assert.match(
    core,
    /snapImageScaleEdges[\s\S]*?imageEdgeScaleMultipliers[\s\S]*?getPointByOrigin[\s\S]*?setPositionByOrigin[\s\S]*?fixedDx[\s\S]*?fixedDy/,
  );
  assert.match(
    core,
    /target instanceof this\.fabric\.FabricImage[\s\S]*?canMutateObject\(target, "geometry"\)/,
  );
  assert.match(
    core,
    /bypass: "altKey" in event && event\.altKey === true/,
  );
  assert.match(
    core,
    /mouse:down[\s\S]*?target && this\.canSnapImageEdges\(target\)[\s\S]*?altPan = e\.altKey && !snapBypassTarget/,
  );
  assert.match(core, /object:modified[\s\S]*?resetImageEdgeSnap\(\)/);
});
