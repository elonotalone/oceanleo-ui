import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSelectionCommand,
  normalizeSelectionContext,
} from "../src/shell/selection-context.ts";

test("selection context accepts bounded typed controls", () => {
  const context = normalizeSelectionContext({
    version: 1,
    kind: "text",
    id: "text:hero-title",
    label: "标题",
    text: "Hello",
    anchor: { x: 10, y: 20, width: 240, height: 80 },
    controls: [
      { id: "font-size", kind: "number", label: "字号", value: 48, min: 8, max: 240 },
      { id: "color", kind: "color", label: "颜色", value: "#ffffff" },
      {
        id: "align",
        kind: "select",
        label: "对齐",
        value: "center",
        options: [
          { value: "left", label: "左" },
          { value: "center", label: "中" },
        ],
      },
    ],
  });
  assert.equal(context?.kind, "text");
  assert.equal(context?.controls.length, 3);
});

test("selection context rejects oversized, duplicate and malformed controls", () => {
  const base = {
    version: 1,
    kind: "text",
    id: "text:1",
  };
  assert.equal(
    normalizeSelectionContext({
      ...base,
      controls: Array.from({ length: 33 }, (_, index) => ({
        id: `c${index}`,
        kind: "action",
        label: "x",
      })),
    }),
    null,
  );
  assert.equal(
    normalizeSelectionContext({
      ...base,
      controls: [
        { id: "same", kind: "action", label: "A" },
        { id: "same", kind: "action", label: "B" },
      ],
    }),
    null,
  );
  assert.equal(
    normalizeSelectionContext({
      ...base,
      controls: [{ id: "x", kind: "select", label: "X", options: [] }],
    }),
    null,
  );
});

test("selection commands require correlated bounded ids and primitive values", () => {
  assert.deepEqual(
    normalizeSelectionCommand({
      requestId: "req-1",
      selectionId: "shape:hero",
      controlId: "fill",
      value: "#2563eb",
    }),
    {
      requestId: "req-1",
      selectionId: "shape:hero",
      controlId: "fill",
      value: "#2563eb",
    },
  );
  assert.equal(
    normalizeSelectionCommand({
      requestId: "req-1",
      selectionId: "../escape",
      controlId: "fill",
      value: "#fff",
    }),
    null,
  );
  assert.equal(
    normalizeSelectionCommand({
      requestId: "req-1",
      selectionId: "shape:hero",
      controlId: "fill",
      value: { unsafe: true },
    }),
    null,
  );
});
