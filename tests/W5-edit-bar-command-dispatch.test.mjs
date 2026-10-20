import assert from "node:assert/strict";
import test from "node:test";

import {
  editBarHistoryShortcut,
  isEditBarSurface,
  preserveEditBarSelection,
} from "../src/shell/edit-bar-selection-preserve.ts";
import {
  normalizeSelectionCommand,
  selectionRequestId,
} from "../src/shell/selection-context.ts";
import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";

const selection = {
  version: 1,
  kind: "text",
  id: "text:hero",
  revision: 4,
  epoch: 2,
  controls: [],
};

function command(controlId, value, extra = {}) {
  return normalizeSelectionCommand({
    requestId: extra.requestId || selectionRequestId(),
    selectionId: extra.selectionId || selection.id,
    controlId,
    value,
    selectionRevision: extra.selectionRevision ?? selection.revision,
    selectionEpoch: extra.selectionEpoch ?? selection.epoch,
  });
}

test("W5-gate holdInteraction keeps last selection only while the toolbar press is held", () => {
  const gate = new SelectionCommandGate();
  const start = command("bold", true);
  assert.equal(gate.accept(start, selection), true);
  gate.holdInteraction();
  assert.equal(gate.accept(command("italic", true), null), true);
  assert.equal(
    gate.accept(
      command("font-size", 30, { selectionRevision: 3, requestId: "stale-rev" }),
      null,
    ),
    false,
  );
  assert.equal(
    gate.accept(
      command("font-size", 30, { selectionId: "text:other", requestId: "other" }),
      null,
    ),
    false,
  );
  gate.releaseInteraction();
  assert.equal(
    gate.accept(command("underline", true, { requestId: "after-hold" }), null),
    false,
  );
});

test("W5-gate still rejects a different live selection after the blur hold", () => {
  const gate = new SelectionCommandGate();
  assert.equal(gate.accept(command("bold", true), selection), true);
  const next = { ...selection, id: "text:card", revision: 5 };
  assert.equal(
    gate.accept(command("italic", true, { requestId: "after-replace" }), next),
    false,
  );
  assert.equal(
    gate.accept(
      command("italic", true, {
        requestId: "card",
        selectionId: "text:card",
        selectionRevision: 5,
      }),
      next,
    ),
    true,
  );
});

test("W5-preserve helper blocks focus steal on ordinary toolbar presses", () => {
  const blocked = {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    target: {},
  };
  preserveEditBarSelection(blocked);
  assert.equal(blocked.prevented, true);
});

test("W5-history shortcut only fires from the edit bar surface", () => {
  assert.equal(
    editBarHistoryShortcut({ key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
    "undo",
  );
  assert.equal(
    editBarHistoryShortcut({ key: "z", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }),
    "redo",
  );
  assert.equal(
    editBarHistoryShortcut({ key: "y", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }),
    "redo",
  );
  assert.equal(
    editBarHistoryShortcut({ key: "z", ctrlKey: true, metaKey: false, altKey: true, shiftKey: false }),
    null,
  );
  assert.equal(isEditBarSurface(null), false);
});
