import assert from "node:assert/strict";
import test from "node:test";

import {
  centeredDeckPlacement,
  clientPointToDeckPercent,
  moveDeckElement,
  resizeDeckElement,
  rotateDeckElement,
} from "../src/shell/doc-editors/deck-geometry.ts";

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
