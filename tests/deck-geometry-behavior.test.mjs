import assert from "node:assert/strict";
import test from "node:test";

import {
  centeredDeckPlacement,
  clientPointToDeckPercent,
  deckPageViewport,
  moveDeckElement,
  resizeDeckElement,
  rotateDeckElement,
} from "../src/shell/doc-editors/deck-geometry.ts";
import { buildDeckInkAsset } from "../src/shell/doc-editors/deck-ink.ts";

const rect = { left: 100, top: 80, width: 1_000, height: 600 };
const element = {
  id: "shape-1",
  type: "shape",
  x: 20,
  y: 25,
  width: 30,
  height: 20,
  rotation: 0,
  order: 1,
};

test("deck drop coordinates map to the pointer and stay on-canvas", () => {
  const point = clientPointToDeckPercent({ x: 860, y: 512 }, rect);
  assert.deepEqual(point, { x: 76, y: 72 });
  assert.deepEqual(centeredDeckPlacement(42, 30, point), {
    x: 55,
    y: 57,
    width: 42,
    height: 30,
  });
  assert.deepEqual(centeredDeckPlacement(42, 30, { x: 2, y: 99 }), {
    x: 0,
    y: 70,
    width: 42,
    height: 30,
  });
});

test("deck move, eight-way resize and rotation preserve geometric invariants", () => {
  assert.deepEqual(
    moveDeckElement(element, { x: 0, y: 0 }, { x: 900, y: 600 }, rect),
    { x: 70, y: 80 },
  );
  const resized = resizeDeckElement(
    element,
    "se",
    { x: 0, y: 0 },
    { x: 100, y: 60 },
    rect,
  );
  assert.equal(resized.x, 20);
  assert.equal(resized.y, 25);
  assert.equal(resized.width, 40);
  assert.equal(resized.height, 30);
  assert.deepEqual(
    rotateDeckElement(
      element,
      { x: 600, y: 290 },
      { x: 450, y: 440 },
      rect,
      true,
    ),
    { rotation: 90 },
  );
});

test("zoom changes the complete page frame instead of responsive child controls", () => {
  assert.deepEqual(deckPageViewport("16:9", 10), {
    logicalWidth: 960,
    logicalHeight: 540,
    scale: 0.1,
    width: 96,
    height: 54,
  });
  assert.deepEqual(deckPageViewport("16:9", 180), {
    logicalWidth: 960,
    logicalHeight: 540,
    scale: 1.8,
    width: 1728,
    height: 972,
  });
  assert.equal(
    deckPageViewport("16:9", 180).width /
      deckPageViewport("16:9", 50).width,
    3.6,
  );
});

test("freehand strokes become movable transparent slide assets", () => {
  const asset = buildDeckInkAsset(
    [
      [
        { x: 20, y: 30 },
        { x: 35, y: 45 },
        { x: 50, y: 32 },
      ],
    ],
    { color: "#ef4444", width: 4, opacity: 1 },
  );
  assert.ok(asset);
  assert.match(asset.src, /^data:image\/svg\+xml/);
  assert.ok(asset.x < 20);
  assert.ok(asset.width > 30);
  assert.ok(asset.height > 13);
});
