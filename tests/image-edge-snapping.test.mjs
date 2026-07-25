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

test("near-full-bleed drag prefers the approached edge over opposite-edge corridors", () => {
  // Object nearly fills the document: free travel is only 121 logical px while
  // fit-zoom acquire (~8 CSS) spans ~43 logical — opposite corridors collide.
  const docBleed = { width: 1_280, height: 1_280 };
  const zoom = 239 / 1_280;
  const viewport = [zoom, 0, 0, zoom, 100, 50];
  const width = 1_159;
  const height = 1_280;

  // Moving left through the right corridor must not yank to the right edge.
  const towardLeft = resolveImageEdgeSnap({
    bounds: { left: 100, top: 0, width, height },
    doc: docBleed,
    viewport,
    motion: { dx: -12, dy: 0 },
  });
  assert.equal(towardLeft.state.x, null, "leftward motion ignores right corridor");
  assert.equal(towardLeft.dx, 0);

  // Inside left acquire while still moving left → snap left to 0.
  const nearLeft = resolveImageEdgeSnap({
    bounds: { left: 23.5, top: 0, width, height },
    doc: docBleed,
    viewport,
    motion: { dx: -8, dy: 0 },
  });
  assert.equal(nearLeft.state.x, "left");
  assertClose(nearLeft.dx, -23.5, "near left acquires");

  // Latched right, but motion leaves toward left → drop latch and allow left.
  const heldRight = resolveImageEdgeSnap({
    bounds: { left: 100, top: 0, width, height },
    doc: docBleed,
    viewport,
    previous: { x: "right", y: null },
    motion: { dx: 0, dy: 0 },
  });
  assert.equal(heldRight.state.x, "right", "hysteresis still holds without motion");

  const leaveRight = resolveImageEdgeSnap({
    bounds: { left: 40, top: 0, width, height },
    doc: docBleed,
    viewport,
    previous: { x: "right", y: null },
    motion: { dx: -20, dy: 0 },
  });
  assert.equal(leaveRight.state.x, "left", "leftward motion releases opposite latch");
  assertClose(leaveRight.dx, -40, "then acquires the approached left edge");

  // Symmetric: approaching right must not stick to left.
  const nearRight = resolveImageEdgeSnap({
    bounds: { left: 100, top: 0, width, height },
    doc: docBleed,
    viewport,
    motion: { dx: 10, dy: 0 },
  });
  assert.equal(nearRight.state.x, "right");
  assertClose(nearRight.dx, 21, "near right acquires to doc flush");
});

test("≤8 CSS near release latches even when last motion settles away", () => {
  // Production V3 miss (v0.192.28): visualScale≈0.185, gap≈21.5 logical ≈4 CSS.
  const docWide = { width: 6_313.586, height: 1_280 };
  const zoom = 0.18516;
  const viewport = [zoom, 0, 0, zoom, 100, 50];
  const width = 1_159;
  const height = 1_280;
  const nearLeftLogical = 21.5;
  assert.ok(
    nearLeftLogical * zoom <= IMAGE_EDGE_SNAP_ACQUIRE_PX,
    "fixture is inside acquire CSS",
  );

  // Away-settle with an existing left latch must keep / flush left — not unlatch.
  const settleAwayLatched = resolveImageEdgeSnap({
    bounds: { left: nearLeftLogical, top: 0, width, height },
    doc: docWide,
    viewport,
    previous: { x: "left", y: null },
    motion: { dx: 4, dy: 0 },
  });
  assert.equal(settleAwayLatched.state.x, "left");
  assertClose(settleAwayLatched.dx, -nearLeftLogical, "latched left flushes");

  // In-drag away motion without a latch still ignores the edge behind the pointer
  // (corridor travel). Pointer-up passes motion 0 and must latch.
  const settleAwayFreshDrag = resolveImageEdgeSnap({
    bounds: { left: nearLeftLogical, top: 0, width, height },
    doc: docWide,
    viewport,
    motion: { dx: 3, dy: 0 },
  });
  assert.equal(
    settleAwayFreshDrag.state.x,
    null,
    "in-drag away motion does not acquire behind-pointer edge",
  );

  const releaseLeft = resolveImageEdgeSnap({
    bounds: { left: nearLeftLogical, top: 0, width, height },
    doc: docWide,
    viewport,
    motion: { dx: 0, dy: 0 },
  });
  assert.equal(releaseLeft.state.x, "left");
  assertClose(releaseLeft.dx, -nearLeftLogical, "release sample latches left");

  const rightGap = 22.086;
  const rightZoom = 0.18705;
  const rightViewport = [rightZoom, 0, 0, rightZoom, 100, 50];
  const rightLeft = docWide.width - width - rightGap;
  const releaseRight = resolveImageEdgeSnap({
    bounds: { left: rightLeft, top: 0, width, height },
    doc: docWide,
    viewport: rightViewport,
    motion: { dx: 0, dy: 0 },
  });
  assert.equal(releaseRight.state.x, "right");
  assertClose(releaseRight.dx, rightGap, "release sample latches right");

  // Top / bottom parity at the same CSS threshold (release / zero motion).
  const nearTop = resolveImageEdgeSnap({
    bounds: { left: 400, top: 18, width: 400, height: 400 },
    doc: docWide,
    viewport,
    motion: { dx: 0, dy: 0 },
  });
  assert.equal(nearTop.state.y, "top");
  assertClose(nearTop.dy, -18, "near top latches");

  const nearBottomGap = 20;
  const nearBottom = resolveImageEdgeSnap({
    bounds: {
      left: 400,
      top: docWide.height - 400 - nearBottomGap,
      width: 400,
      height: 400,
    },
    doc: docWide,
    viewport,
    motion: { dx: 0, dy: 0 },
  });
  assert.equal(nearBottom.state.y, "bottom");
  assertClose(nearBottom.dy, nearBottomGap, "near bottom latches");
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
  assert.match(core, /eventRequestsSnapBypass\(event\)/);
  assert.match(core, /oceanleoKind === "image"/);
  assert.match(core, /motion:\s*prev/);
  assert.match(
    core,
    /mouse:down[\s\S]*?target && this\.canSnapImageEdges\(target\)[\s\S]*?altPan = e\.altKey && !snapBypassTarget/,
  );
  assert.match(
    core,
    /object:modified[\s\S]*?imageEdgeSnapPrevBounds = null[\s\S]*?snapImageMoveEdges[\s\S]*?resetImageEdgeSnap\(\)/,
  );
  assert.match(
    core,
    /object:moving[\s\S]*?snapImageMoveEdges[\s\S]*?this\.emit\(\)/,
  );
  assert.match(
    core,
    /roleOf\(active\) === "crop"[\s\S]*?buildSelectedSnapshot/,
  );
});
