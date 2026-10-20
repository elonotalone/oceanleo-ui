/**
 * W4: deck primary edit bar does not show X/Y (or W/H) number fields.
 * Geometry stays inspector-only, same defect class as the image XY screenshot.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { deckObjectGeometryControls } from "../src/shell/doc-editors/deck-object-geometry-controls.ts";
import {
  isCompactSelectionControl,
  partitionSelectionInspectorControls,
} from "../src/shell/selection-inspector-groups.ts";

const tt = (value) => String(value);

function sampleElement() {
  return {
    id: "el-w4",
    type: "text",
    x: 12,
    y: 34,
    width: 40,
    height: 20,
    rotation: 0,
    order: 0,
    text: "hi",
  };
}

test("deck geometry X/Y/W/H are inspector-only, not compact primary", () => {
  const controls = deckObjectGeometryControls(sampleElement(), tt);
  const xy = controls.filter(
    (control) => control.id === "x" || control.id === "y",
  );
  assert.equal(xy.length, 2);
  for (const control of xy) {
    assert.equal(control.kind, "number");
    assert.equal(control.slot, "inspector");
    assert.notEqual(control.placement, "primary");
    assert.equal(isCompactSelectionControl(control), false);
  }
  const size = controls.filter(
    (control) => control.id === "width" || control.id === "height",
  );
  assert.equal(size.length, 2);
  for (const control of size) {
    assert.equal(control.slot, "inspector");
    assert.equal(isCompactSelectionControl(control), false);
  }

  const { compact, groups } = partitionSelectionInspectorControls(controls);
  assert.equal(
    compact.some(
      (control) =>
        control.id === "x" ||
        control.id === "y" ||
        control.label === "X" ||
        control.label === "Y",
    ),
    false,
    "X/Y leaked onto the compact/primary edit bar",
  );
  assert.equal(
    compact.some(
      (control) => control.id === "width" || control.id === "height",
    ),
    false,
    "W/H leaked onto the compact/primary edit bar",
  );
  const inspectorIds = groups.flatMap((group) =>
    group.controls.map((control) => control.id),
  );
  assert.ok(inspectorIds.includes("x"));
  assert.ok(inspectorIds.includes("y"));
});
