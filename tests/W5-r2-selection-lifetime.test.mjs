/**
 * W5-r2: lastContext must not authorize commands after a genuine clear.
 * These assertions fail against the first-round gate (c1914a55), which kept
 * lastContext through reconcile(null), cancelAll, and accept(null).
 */
import assert from "node:assert/strict";
import test from "node:test";

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

function command(controlId, extra = {}) {
  return normalizeSelectionCommand({
    requestId: extra.requestId || selectionRequestId(),
    selectionId: extra.selectionId || selection.id,
    controlId,
    value: extra.value ?? true,
    selectionRevision: extra.selectionRevision ?? selection.revision,
    selectionEpoch: extra.selectionEpoch ?? selection.epoch,
  });
}

test("W5-r2-gate rejects a matching command after accept(null) without a hold", () => {
  const gate = new SelectionCommandGate();
  assert.equal(gate.accept(command("bold"), selection), true);
  assert.equal(
    gate.accept(command("italic", { requestId: "after-live" }), null),
    false,
    "r1 lastContext would accept this stale retarget",
  );
});

test("W5-r2-gate reconcile(null) is a genuine clear, not a blur hold", () => {
  const gate = new SelectionCommandGate();
  assert.equal(gate.accept(command("bold"), selection), true);
  gate.reconcile(null);
  assert.equal(
    gate.accept(command("italic", { requestId: "after-clear" }), null),
    false,
    "r1 kept lastContext through reconcile(null)",
  );
});

test("W5-r2-gate cancelAll invalidates the last selection", () => {
  const gate = new SelectionCommandGate();
  assert.equal(gate.accept(command("bold"), selection), true);
  gate.cancelAll();
  assert.equal(
    gate.accept(command("italic", { requestId: "after-cancel" }), null),
    false,
  );
});

test("W5-r2-gate document switch rejects the previous selection ids", () => {
  const gate = new SelectionCommandGate();
  assert.equal(gate.accept(command("bold"), selection), true);
  const nextDoc = {
    ...selection,
    id: "text:other-doc",
    revision: 1,
    epoch: 9,
  };
  assert.equal(gate.reconcile(nextDoc).length, 0);
  assert.equal(
    gate.accept(command("italic", { requestId: "old-ids" }), nextDoc),
    false,
  );
  assert.equal(
    gate.accept(command("italic", { requestId: "old-ids-null" }), null),
    false,
  );
});

test("W5-r2-gate hold covers one toolbar press; release then delayed command fails", () => {
  const gate = new SelectionCommandGate();
  assert.equal(gate.accept(command("bold"), selection), true);
  gate.holdInteraction();
  gate.reconcile(null);
  assert.equal(
    gate.accept(command("italic", { requestId: "during-hold" }), null),
    true,
  );
  gate.releaseInteraction();
  assert.equal(
    gate.accept(command("font-size", { requestId: "after-release", value: 18 }), null),
    false,
    "delayed command after toolbar release must not reuse the old target",
  );
});
