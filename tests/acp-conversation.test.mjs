import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const api = dataModule("export async function request() { throw new Error('no network in test'); } export const acpErrorText = String;");
const path = "src/shell/acp-task/acp-conversation.ts";
const { nextHeldMessage, sessionCanFork, matchingCommands, contextPercent } = await import(await compileModule(path, {
  "../../lib/acp-frames-api": api,
}));
const { AcpSessionControls } = await import(await compileModule("src/shell/acp-task/AcpSessionControls.tsx", {
  "./acp-conversation": await compileModule(path, { "../../lib/acp-frames-api": api }),
  "../../i18n/ui/useUI": dataModule('export function useUI() { return (s,v) => s.replace(/\\{(\\w+)\\}/g, (_,k) => v?.[k] ?? k); }'),
}));
const held = (id) => ({ id, status: "held", text: id, attachments: [{ name: "file.txt" }], choice: { model: "chosen" } });
const view = (open = false, exited = null) => ({ open, exited });
const absent = () => false;

test("held prompts wait through the active turn and cancel acknowledgement; receipts cannot release the next prompt", () => {
  const first = held("one"), second = held("two");
  assert.equal(nextHeldMessage([first, second], view(true), true, absent), null);
  // The HTTP cancel acknowledgement does not close the prompt: only its response does.
  assert.equal(nextHeldMessage([first, second], view(true), true, absent), null);
  assert.equal(nextHeldMessage([first, second], view(), false, absent), null);
  assert.equal(nextHeldMessage([first, second], view(), true, absent), first);
  const sending = { ...first, status: "sending" };
  assert.equal(nextHeldMessage([sending, second], view(), true, absent), null);
  const accepted = { ...first, status: "accepted", rowId: 99 };
  assert.equal(nextHeldMessage([accepted, second], view(), true, absent), null);
  // Once the receipt is visible its turn must finish too.
  const receipt = (entry) => entry.id === first.id;
  assert.equal(nextHeldMessage([accepted, second], view(true), true, receipt), null);
  assert.equal(nextHeldMessage([accepted, second], view(), true, receipt), second);
  assert.deepEqual(second.attachments, [{ name: "file.txt" }]);
  assert.deepEqual(second.choice, { model: "chosen" });
});

test("disconnect, exited process, failed delivery and an unknown server-side queue hold the outbox", () => {
  const message = held("one");
  assert.equal(nextHeldMessage([message], view(), false, absent), null);
  assert.equal(nextHeldMessage([message], view(false, { code: 1 }), true, absent), null);
  for (const status of ["failed", "queued", "retrying"]) {
    assert.equal(nextHeldMessage([{ ...message, status }, held("two")], view(), true, absent), null);
  }
});

test("fork is enabled solely by an advertised session capability", () => {
  for (const caps of [{}, { fork: false }, { fork: null }]) assert.equal(sessionCanFork(caps), false);
  assert.equal(sessionCanFork({ fork: {} }), true);
  assert.equal(sessionCanFork({ fork: true }), true);
});

test("slash suggestions use only advertised commands, prefix-match and stop once arguments start", () => {
  const commands = [{ name: "compact", description: "Summarize" }, { name: "help", description: "Help" }];
  assert.deepEqual(matchingCommands(commands, "/"), commands);
  assert.deepEqual(matchingCommands(commands, "/COM"), [commands[0]]);
  assert.deepEqual(matchingCommands(commands, "/compact argument"), []);
  assert.deepEqual(matchingCommands([], "/"), []);
  assert.deepEqual(matchingCommands(commands, "hello /"), []);
});

test("command menu and context meter render advertised values; missing or invalid usage stays absent", () => {
  const render = (props) => renderToStaticMarkup(React.createElement(AcpSessionControls, {
    commands: [{ name: "compact", description: "Summarize this session" }], input: "/co", onChange() {}, usage: { used: 25, size: 100 }, ...props,
  }));
  assert.match(render(), /role="menuitem"/);
  assert.match(render(), /\/compact/);
  assert.match(render(), /Summarize this session/);
  assert.match(render(), /25%/);
  assert.match(render(), /<meter/);
  assert.doesNotMatch(render({ commands: [], usage: null }), /menuitem|<meter/);
  assert.doesNotMatch(render({ usage: { used: 1, size: 0 }, disabled: true }), /menuitem|<meter/);
  assert.equal(contextPercent(500, 100), 100);
  assert.equal(contextPercent(-1, 100), null);
  assert.equal(contextPercent(Infinity, 100), null);
});

const { applyControlRows } = await import(await compileModule("src/shell/acp-task/useAcpSessionControls.ts", {
  "../../lib/acp-frames-api": api,
}));

test("reopened session controls survive history paging and only newer announcements replace each field", () => {
  const baseline = { capabilities: { fork: {} }, commands: [{ name: "help", description: "Help" }],
    usage: { used: 20, size: 100 }, after: 100, positions: { capabilities: 1, commands: 50, usage: 100 } };
  const row = (id, update) => ({ id, direction: "agent", raw: JSON.stringify({ method: "session/update", params: { sessionId: "main", update } }) });
  const state = applyControlRows(baseline, [
    row(49, { sessionUpdate: "available_commands_update", availableCommands: [{ name: "stale" }] }),
    row(99, { sessionUpdate: "usage_update", used: 90, size: 100 }),
    row(51, { sessionUpdate: "available_commands_update", availableCommands: [] }),
    row(101, { sessionUpdate: "usage_update", used: 25, size: 100 }),
  ]);
  assert.deepEqual(state.capabilities, { fork: {} });
  assert.deepEqual(state.commands, [], "an explicit empty commands update clears the old menu");
  assert.deepEqual(state.usage, { used: 25, size: 100 });
});
