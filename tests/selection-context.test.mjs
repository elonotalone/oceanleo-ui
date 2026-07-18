import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSelectionCommand,
  normalizeSelectionContext,
} from "../src/shell/selection-context.ts";
import {
  SelectionCommandGate,
  SelectionGestureTransaction,
} from "../src/shell/selection-transactions.ts";
import {
  isCompactSelectionControl,
  partitionSelectionInspectorControls,
} from "../src/shell/selection-inspector-groups.ts";

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
      controls: Array.from({ length: 97 }, (_, index) => ({
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

test("continuous and text controls are forced into grouped child inspectors", () => {
  const result = partitionSelectionInspectorControls([
    { id: "font-size", kind: "number", label: "字号", value: 24 },
    {
      id: "letter-spacing",
      kind: "range",
      label: "字距",
      value: 0,
      inspectorGroup: "text-spacing",
      inspectorLabel: "间距",
      inspectorIcon: "spacing",
    },
    { id: "text", kind: "text", label: "正文", value: "Hello" },
  ]);
  assert.deepEqual(
    result.compact.map((control) => control.id),
    [
      "font-size",
      "selection-inspector-text-spacing",
      "selection-inspector-adjustments",
    ],
  );
  assert.equal(result.compact.some((control) => control.kind === "range"), false);
  assert.equal(result.compact.some((control) => control.kind === "text"), false);
  assert.equal(
    result.compact.every((control) => isCompactSelectionControl(control)),
    true,
  );
});

test("selection commands preserve gesture phase and stale-selection revision", () => {
  assert.deepEqual(
    normalizeSelectionCommand({
      requestId: "req-gesture",
      selectionId: "text:hero",
      controlId: "letter-spacing",
      value: 12,
      selectionRevision: 9,
      phase: "commit",
      transactionId: "spacing-1",
    }),
    {
      requestId: "req-gesture",
      selectionId: "text:hero",
      controlId: "letter-spacing",
      value: 12,
      selectionRevision: 9,
      phase: "commit",
      transactionId: "spacing-1",
    },
  );
});

test("selection context preserves grouped inspector metadata and revision", () => {
  const context = normalizeSelectionContext({
    version: 1,
    kind: "website-h1",
    id: "field:hero:title",
    revision: "bridge-a:4",
    controls: [
      {
        id: "font-size",
        kind: "number",
        label: "字号",
        value: 48,
        slot: "inspector",
        inspectorGroup: "website-typography",
        inspectorLabel: "文字",
        inspectorIcon: "font",
      },
    ],
  });
  assert.equal(context?.revision, "bridge-a:4");
  assert.deepEqual(context?.controls[0], {
    id: "font-size",
    kind: "number",
    label: "字号",
    value: 48,
    slot: "inspector",
    inspectorGroup: "website-typography",
    inspectorLabel: "文字",
    inspectorIcon: "font",
  });
});

test("gesture transactions settle once and preserve their starting revision", () => {
  const gesture = new SelectionGestureTransaction("letter-spacing");
  const start = gesture.start({ id: "text:hero", revision: 7 }, 0);
  assert.equal(start?.phase, "start");
  for (let value = 1; value <= 120; value += 1) {
    const update = gesture.update(value / 10);
    assert.equal(update?.phase, "update");
    assert.equal(update?.selectionRevision, 7);
  }
  const commit = gesture.commit(12);
  assert.equal(commit?.phase, "commit");
  assert.equal(commit?.selectionRevision, 7);
  assert.equal(gesture.commit(13), null);
  assert.equal(gesture.cancel(), null);

  const untouched = new SelectionGestureTransaction("opacity");
  untouched.start({ id: "shape:hero", revision: 2 }, 1);
  assert.equal(untouched.commit(1)?.phase, "cancel");
});

test("selection command gate rejects stale and replayed durable commands", () => {
  const context = {
    version: 1,
    id: "text:hero",
    kind: "text",
    revision: 7,
    controls: [],
  };
  const gesture = new SelectionGestureTransaction("letter-spacing");
  const gate = new SelectionCommandGate();
  const start = gesture.start(context, 0);
  assert.equal(gate.accept(start, context), true);
  const update = gesture.update(4);
  assert.equal(
    gate.accept(
      {
        ...update,
        requestId: "wrong-transaction-revision",
        selectionRevision: 6,
      },
      context,
    ),
    false,
  );
  assert.equal(
    gate.accept(
      {
        ...update,
        requestId: "wrong-transaction-control",
        controlId: "opacity",
      },
      context,
    ),
    false,
  );
  const advanced = { ...context, revision: 8 };
  const reconciled = gate.reconcile(advanced);
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].phase, "cancel");
  assert.equal(reconciled[0].selectionRevision, 7);
  assert.equal(gate.accept(update, advanced), false);
  const cancel = gesture.cancel();
  assert.equal(gate.accept(cancel, advanced), true);
  assert.equal(gate.accept(cancel, advanced), false);
  assert.equal(
    gate.accept(
      {
        requestId: "stale-direct",
        selectionId: context.id,
        controlId: "font-size",
        value: 30,
        selectionRevision: 7,
      },
      advanced,
    ),
    false,
  );
  assert.equal(
    gate.accept(
      {
        requestId: "fresh-direct",
        selectionId: context.id,
        controlId: "font-size",
        value: 30,
        selectionRevision: 8,
      },
      advanced,
    ),
    true,
  );
});

test("selection replacement rolls back 100 previews before one new commit", () => {
  const original = {
    version: 1,
    id: "text:hero",
    kind: "text",
    revision: "frame-a:1",
    controls: [],
  };
  const replacement = {
    ...original,
    id: "text:card",
    revision: "frame-a:2",
  };
  const gate = new SelectionCommandGate();
  const gesture = new SelectionGestureTransaction("font-size");
  const state = { dirty: false, revision: 0, undo: 0 };
  const apply = (command, context) => {
    const accepted = gate.accept(command, context);
    if (accepted && command.phase === "commit") {
      state.dirty = true;
      state.revision += 1;
      state.undo += 1;
    }
    return accepted;
  };

  assert.equal(apply(gesture.start(original, 16), original), true);
  for (let value = 17; value <= 116; value += 1) {
    assert.equal(apply(gesture.update(value), original), true);
  }
  const automaticCancel = gate.reconcile(replacement);
  assert.equal(automaticCancel.length, 1);
  assert.equal(automaticCancel[0].phase, "cancel");
  assert.deepEqual(state, { dirty: false, revision: 0, undo: 0 });

  const oldCancel = gesture.cancel();
  assert.equal(apply(oldCancel, replacement), true);
  assert.deepEqual(state, { dirty: false, revision: 0, undo: 0 });

  const next = new SelectionGestureTransaction("font-size");
  assert.equal(apply(next.start(replacement, 16), replacement), true);
  assert.equal(apply(next.update(24), replacement), true);
  assert.equal(apply(next.commit(24), replacement), true);
  assert.deepEqual(state, { dirty: true, revision: 1, undo: 1 });
});

test("normalizers reject malformed revisions and incomplete gesture phases", () => {
  assert.equal(
    normalizeSelectionContext({
      version: 1,
      kind: "text",
      id: "text:hero",
      revision: -1,
      controls: [],
    }),
    null,
  );
  assert.equal(
    normalizeSelectionCommand({
      requestId: "missing-transaction",
      selectionId: "text:hero",
      controlId: "opacity",
      phase: "update",
      value: 0.5,
    }),
    null,
  );
});

test("inspector triggers never collide with controls and stage-only controls stay out", () => {
  const result = partitionSelectionInspectorControls([
    {
      id: "selection-inspector-adjustments",
      kind: "action",
      label: "Existing",
    },
    { id: "opacity", kind: "range", label: "Opacity", value: 1 },
    { id: "stage-zoom", kind: "number", label: "Zoom", slot: "stage" },
  ]);
  assert.deepEqual(
    result.compact.map((control) => control.id),
    ["selection-inspector-adjustments", "selection-inspector-adjustments-2"],
  );
  assert.equal(
    result.compact.some((control) => control.id === "stage-zoom"),
    false,
  );
});
