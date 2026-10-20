import assert from "node:assert/strict";
import test from "node:test";

import { applySelectionCommand } from "/root/projects/umo-hosted/src/umo-commands.ts";
import { handleSelectionCommand } from "/root/projects/umo-hosted/src/bridge/selection-command-route.ts";
import { editBarVisibleOnPage } from "../src/shell/plugin-chrome/plugin-pages.ts";
import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";
import {
  buildRichDocHostedCommandSurface,
  buildRichDocHostedSelectionCommand,
  coerceRichDocHostedSelectionCommand,
  hostedSelectionForToolbar,
  richDocHostedFallbackSelection,
  richDocHostedHostEditBarActive,
  sendRichDocHostedSelectionCommand,
} from "../src/shell/doc-editors/rich-doc-hosted-embed.ts";

function headingCommand(overrides = {}) {
  return {
    requestId: "req-heading-1",
    selectionId: "richdoc-caret",
    controlId: "heading",
    value: 2,
    ...overrides,
  };
}

function recordingUmo() {
  const calls = [];
  const chain = {
    focus() {
      calls.push("focus");
      return this;
    },
    toggleBold() {
      calls.push("toggleBold");
      return this;
    },
    toggleItalic() {
      calls.push("toggleItalic");
      return this;
    },
    setNode(name, attrs) {
      calls.push(["setNode", name, attrs]);
      return this;
    },
    setParagraph() {
      calls.push("setParagraph");
      return this;
    },
    toggleBulletList() {
      calls.push("toggleBulletList");
      return this;
    },
    toggleOrderedList() {
      calls.push("toggleOrderedList");
      return this;
    },
    toggleTaskList() {
      calls.push("toggleTaskList");
      return this;
    },
    liftListItem(name) {
      calls.push(["liftListItem", name]);
      return this;
    },
    unsetLink() {
      calls.push("unsetLink");
      return this;
    },
    setColor(color) {
      calls.push(["setColor", color]);
      return this;
    },
    unsetColor() {
      calls.push("unsetColor");
      return this;
    },
    run() {
      calls.push("run");
      return true;
    },
  };
  return {
    calls,
    useEditor() {
      return {
        state: {
          selection: {
            empty: false,
            $from: { parent: { type: { name: "paragraph" }, attrs: {} } },
          },
        },
        isActive() {
          return false;
        },
        chain() {
          return chain;
        },
      };
    },
    getSelectionText() {
      return "签字盖章";
    },
  };
}

test("W1-r2 normal page owns the host edit bar; pro uses Umo chrome", () => {
  assert.equal(editBarVisibleOnPage({ kind: "artifact" }), true);
  assert.equal(editBarVisibleOnPage({ kind: "pro" }), false);
  assert.equal(
    richDocHostedHostEditBarActive({
      mode: "normal",
      ready: true,
      hasSource: true,
      readOnly: false,
    }),
    true,
  );
  assert.equal(
    richDocHostedHostEditBarActive({
      mode: "pro",
      ready: true,
      hasSource: true,
      readOnly: false,
    }),
    false,
  );
});

test("W1-r2 heading command reaches Umo applySelectionCommand and mutates", () => {
  const selection = hostedSelectionForToolbar(null, 3);
  const gate = new SelectionCommandGate();
  const sent = [];
  const result = sendRichDocHostedSelectionCommand({
    command: headingCommand({ selectionRevision: 3 }),
    selection,
    ready: true,
    readOnly: false,
    origin: "user",
    gate,
    send(message) {
      sent.push(message);
      return true;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "selection-command");
  assert.equal(sent[0].origin, "user");
  assert.equal(sent[0].command.controlId, "heading");
  assert.equal(sent[0].command.value, 2);

  const umo = recordingUmo();
  assert.equal(applySelectionCommand(umo, sent[0].command), true);
  assert.deepEqual(
    umo.calls.find((entry) => Array.isArray(entry) && entry[0] === "setNode"),
    ["setNode", "heading", { level: 2 }],
  );
});

test("W1-r2 malformed, stale, and read-only commands fail closed", () => {
  const selection = richDocHostedFallbackSelection();
  const sent = [];
  const send = (message) => {
    sent.push(message);
    return true;
  };

  assert.equal(coerceRichDocHostedSelectionCommand({ foo: "bar" }), null);
  assert.equal(
    coerceRichDocHostedSelectionCommand('{"controlId":"bold"}'),
    null,
  );

  const malformed = sendRichDocHostedSelectionCommand({
    command: { raw: "{not-a-command}" },
    selection,
    ready: true,
    readOnly: false,
    origin: "user",
    gate: new SelectionCommandGate(),
    send,
  });
  assert.equal(malformed.ok, false);
  assert.match(malformed.message, /不合法/);

  const readOnly = sendRichDocHostedSelectionCommand({
    command: headingCommand(),
    selection,
    ready: true,
    readOnly: true,
    origin: "user",
    gate: new SelectionCommandGate(),
    send,
  });
  assert.equal(readOnly.ok, false);
  assert.match(readOnly.message, /只读/);

  const staleGate = new SelectionCommandGate();
  const stale = sendRichDocHostedSelectionCommand({
    command: headingCommand({ selectionId: "richdoc-other-1" }),
    selection,
    ready: true,
    readOnly: false,
    origin: "user",
    gate: staleGate,
    send,
  });
  assert.equal(stale.ok, false);
  assert.match(stale.message, /选择已变化/);
  assert.equal(sent.length, 0);

  const unknown = sendRichDocHostedSelectionCommand({
    command: headingCommand({ controlId: "explode" }),
    selection,
    ready: true,
    readOnly: false,
    origin: "user",
    gate: new SelectionCommandGate(),
    send,
  });
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /没有这条指令/);
});

test("W1-r2 agent surface reviews instead of claiming raw JSON success", () => {
  const selection = richDocHostedFallbackSelection();
  const sent = [];
  const surface = buildRichDocHostedCommandSurface({
    ready: true,
    readOnly: false,
    hasSource: true,
    selection,
    gate: new SelectionCommandGate(),
    send(message) {
      sent.push(message);
      return true;
    },
  });

  const raw = surface.run("richdoc.selection-command", {
    command: '{"please":"apply-anything"}',
  });
  assert.equal(raw.ok, false);
  assert.match(raw.message, /不合法/);
  assert.equal(sent.length, 0);

  const typed = surface.run("richdoc.selection-command", {
    command: headingCommand({ requestId: "req-agent-1" }),
  });
  assert.equal(typed.ok, true);
  assert.match(typed.message, /审阅/);
  assert.equal(sent[0].origin, undefined);
  assert.equal(sent[0].command.controlId, "heading");

  const envelope = buildRichDocHostedSelectionCommand(
    "rd-w1-r2",
    headingCommand({ requestId: "req-env-1" }),
    "user",
  );
  assert.equal(envelope.type, "selection-command");
  assert.equal(envelope.origin, "user");
  assert.equal(envelope.protocol, "oceanleo.editor.v1");
});

test("W1-r2 Umo adapter rejects unknown controls; human heading applies", () => {
  const umo = recordingUmo();
  const results = [];
  const outcome = handleSelectionCommand(
    headingCommand({ requestId: "req-human-1" }),
    { origin: "user" },
    {
      review: { revision: 1, propose() { throw new Error("should not review"); } },
      applyCommand: (command) => applySelectionCommand(umo, command),
      readSnapshot: () => null,
      sendReviewProposal() {},
      sendSelectionResult(_id, ok, message) {
        results.push({ ok, message });
      },
    },
  );
  assert.equal(outcome, "applied");
  assert.equal(results[0].ok, true);
  assert.ok(
    umo.calls.some((entry) => Array.isArray(entry) && entry[0] === "setNode"),
  );

  const rejected = handleSelectionCommand(
    headingCommand({ controlId: "not-a-control", requestId: "req-bad-1" }),
    { origin: "user" },
    {
      review: { revision: 1, propose() { throw new Error("unused"); } },
      applyCommand: () => true,
      readSnapshot: () => null,
      sendReviewProposal() {},
      sendSelectionResult(_id, ok) {
        results.push({ ok });
      },
    },
  );
  assert.equal(rejected, "rejected");
});
