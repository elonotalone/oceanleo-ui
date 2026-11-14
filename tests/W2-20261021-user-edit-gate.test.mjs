import assert from "node:assert/strict";
import test from "node:test";

import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";
import {
  activeUserEditItemKey,
  recordUserMutation,
  resetUserEditSession,
  resetUserMutation,
  syncOpenUserEditItem,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

test("recordUserMutation / reset / item switch own the generation", () => {
  resetUserEditSession();
  syncOpenUserEditItem("doc-a");
  assert.equal(userMutationGeneration("doc-a"), 0);
  assert.equal(recordUserMutation("doc-a"), 1);
  assert.equal(recordUserMutation("doc-a"), 2);
  assert.equal(userMutationGeneration("doc-a"), 2);
  assert.equal(userMutationGeneration("doc-b"), 0);
  resetUserMutation("doc-a");
  assert.equal(userMutationGeneration("doc-a"), 0);
  recordUserMutation("doc-a");
  syncOpenUserEditItem("doc-b");
  assert.equal(userMutationGeneration("doc-a"), 0);
  assert.equal(userMutationGeneration("doc-b"), 0);
  assert.equal(activeUserEditItemKey(), "doc-b");
  recordUserMutation("doc-b");
  assert.equal(userMutationGeneration("doc-b"), 1);
  syncOpenUserEditItem("doc-a");
  assert.equal(userMutationGeneration("doc-b"), 0);
  assert.equal(userMutationGeneration("doc-a"), 0);
  resetUserEditSession();
});

test("SelectionCommandGate records successful user commands and ignores remote origin", () => {
  resetUserEditSession();
  syncOpenUserEditItem("canvas-1");
  const context = {
    version: 1,
    id: "shape:hero",
    kind: "shape",
    revision: 3,
    controls: [],
  };
  const gate = new SelectionCommandGate();
  assert.equal(
    gate.accept(
      {
        requestId: "req-fill",
        selectionId: context.id,
        controlId: "fill",
        value: "#2563eb",
        selectionRevision: 3,
      },
      context,
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 1);

  assert.equal(
    gate.accept(
      {
        requestId: "req-remote",
        selectionId: context.id,
        controlId: "opacity",
        value: 0.4,
        selectionRevision: 3,
      },
      context,
      "remote",
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 1);

  assert.equal(
    gate.accept(
      {
        requestId: "req-collab",
        selectionId: context.id,
        controlId: "rotate",
        value: 15,
        selectionRevision: 3,
        origin: "collab",
      },
      context,
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 1);

  const start = gate.accept(
    {
      requestId: "req-start",
      selectionId: context.id,
      controlId: "letter-spacing",
      value: 0,
      selectionRevision: 3,
      phase: "start",
      transactionId: "txn-1",
    },
    context,
  );
  assert.equal(start, true);
  assert.equal(userMutationGeneration("canvas-1"), 1);

  assert.equal(
    gate.accept(
      {
        requestId: "req-update",
        selectionId: context.id,
        controlId: "letter-spacing",
        value: 4,
        selectionRevision: 3,
        phase: "update",
        transactionId: "txn-1",
      },
      context,
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 2);

  assert.equal(
    gate.accept(
      {
        requestId: "req-commit",
        selectionId: context.id,
        controlId: "letter-spacing",
        value: 4,
        selectionRevision: 3,
        phase: "commit",
        transactionId: "txn-1",
      },
      context,
    ),
    true,
  );
  assert.equal(userMutationGeneration("canvas-1"), 3);
  resetUserEditSession();
});
