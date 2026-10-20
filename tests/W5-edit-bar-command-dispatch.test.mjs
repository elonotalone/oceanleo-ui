import assert from "node:assert/strict";
import test from "node:test";

import { EditBarCommandDispatcher } from "../src/shell/edit-bar-command-dispatch.ts";
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
import { dispatchFabricImageCommand } from "../src/shell/image-editor/fabric-image-commands.ts";

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

function makeImageEditor(initial = { value: "Hello", bold: false, fontSize: 24 }) {
  const text = { ...initial };
  const stack = [{ ...text }];
  return {
    selected: { locked: false, kind: "text", id: selection.id },
    text,
    stack,
    setSelectedText(patch) {
      Object.assign(text, patch);
      stack.push({ ...text });
    },
    undo() {
      if (stack.length < 2) return;
      stack.pop();
      Object.assign(text, stack[stack.length - 1]);
    },
  };
}

test("W5-gate keeps last selection after hosted blur so a matching command still applies", () => {
  const gate = new SelectionCommandGate();
  const start = command("bold", true);
  assert.equal(gate.accept(start, selection), true);
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

test("W5-dispatcher queues until a handler registers, then applies a real Fabric text command", () => {
  const dispatcher = new EditBarCommandDispatcher();
  const editor = makeImageEditor();
  const sent = command("bold", true);
  const queued = dispatcher.dispatch(sent, selection);
  assert.equal(queued.ok, true);
  assert.equal(queued.queued, true);
  assert.equal(editor.text.bold, false);

  const unregister = dispatcher.register((message, info) => {
    assert.equal(info.isCurrent(), true);
    dispatchFabricImageCommand(editor, message);
  });
  assert.equal(editor.text.bold, true);
  assert.deepEqual(editor.stack.at(-1), { value: "Hello", bold: true, fontSize: 24 });
  unregister();
});

test("W5-dispatcher forgets in-flight async work when the handler unmounts", async () => {
  const dispatcher = new EditBarCommandDispatcher();
  const editor = makeImageEditor();
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const unregister = dispatcher.register(async (message, info) => {
    await pending;
    if (!info.isCurrent()) return;
    dispatchFabricImageCommand(editor, message);
  });
  assert.equal(dispatcher.dispatch(command("bold", true), selection).ok, true);
  assert.equal(dispatcher.pendingRequestIds.length, 1);
  unregister();
  assert.equal(dispatcher.pendingRequestIds.length, 0);
  finish();
  await pending;
  await Promise.resolve();
  assert.equal(editor.text.bold, false);
});

test("W5-dispatcher late handler still mutates after an earlier generation unmounted", () => {
  const dispatcher = new EditBarCommandDispatcher();
  const editor = makeImageEditor();
  const first = dispatcher.register(() => {
    throw new Error("stale handler must not run");
  });
  first();
  dispatcher.dispatch(command("bold", true), selection);
  assert.equal(editor.text.bold, false);
  dispatcher.register((message) => dispatchFabricImageCommand(editor, message));
  assert.equal(editor.text.bold, true);
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
