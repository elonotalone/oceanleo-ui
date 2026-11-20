// Wave 2026-11-20 ST: a message sent while the agent works is steered into the running turn (`_session/steering`).
// Operator ruling: as in native Claude Code it is read at the next step; running sub-agents and commands continue.
// The page shows it as the user's message in order, gives it the output that follows, says it will be read at the
// next step (no "queued until this turn ends"), and closes it with the turn it joined. A refused steer is replaced by
// the prompt the gateway sends with the same words: one bubble, never two.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";
import { viewBlocks, turnBlocks } from "../src/acp/messages.ts";
import { reduceRows } from "../src/acp/reduce.ts";
import { acpShareItems } from "../src/acp/share.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/acp-turn-2026-11-20-steer.json", import.meta.url), "utf8"));
const LABELS = { gap: () => "", oversize: () => "", exit: () => "", stopReason: () => "", cancelled: "", permissionPrompt: "" };
const LINE = "已送达：它会在下一步读到，不会打断正在做的事";

function rowsOf(entries, start = 1) {
  return entries.map(([direction, message], index) => ({
    id: start + index,
    direction,
    node_seq: direction === "agent" ? start + index : null,
    raw: JSON.stringify(message),
    received_at: "2026-11-20T11:00:00Z",
  }));
}

const textOf = (items) => items.filter((item) => item.type === "message" && item.role === "agent").map((item) => item.text).join("|");
const userBubbles = (view) => viewBlocks(view, LABELS).filter((block) => block.type === "bubble" && block.message.role === "user");

test("a steered message is its own user message; the output after it is its; nothing is queued", () => {
  const all = rowsOf(fixture.steered);
  const view = reduceRows(all.slice(0, -1));
  assert.deepEqual(view.turns.map((turn) => [turn.text, turn.open, Boolean(turn.steered)]), [
    ["Build the landing page", true, false],
    ["Also add a footer with the address", true, true],
  ]);
  const [host, steered] = view.turns;
  assert.equal(steered.steerOf, host.key);
  assert.equal(steered.queued, false);
  assert.equal(textOf(host.items), "Starting. I will ask a sub-agent to draft the copy.");
  assert.equal(textOf(steered.items), "Noted, I will add the footer too.|Done: landing page with footer.");
  // The sub-agent the first part started keeps one card; its later update lands on it, wherever it is shown.
  const agentTool = host.items.find((item) => item.type === "tool" && item.tool.id === "agent-1");
  assert.equal(agentTool.tool.status, "completed");
  assert.equal(steered.items.some((item) => item.type === "tool" && item.tool.id === "agent-1"), false);
  assert.deepEqual(userBubbles(view).map((block) => block.message.content), ["Build the landing page", "Also add a footer with the address"]);
  assert.equal(view.open, true);
});

test("the original prompt's answer ends the turn and the message steered into it", () => {
  const view = reduceRows(rowsOf(fixture.steered));
  assert.deepEqual(view.turns.map((turn) => [turn.open, turn.stopReason]), [[false, "end_turn"], [false, "end_turn"]]);
  assert.equal(view.open, false);
});

test("under the steered message: 'read at its next step' until the agent answers it, never the queued line", () => {
  const all = rowsOf(fixture.steered);
  const justSent = reduceRows(all.slice(0, 5));
  const bubble = turnBlocks(justSent.turns[1], true, LABELS)[0];
  assert.equal(bubble.steered, justSent.turns[1]);
  assert.equal(bubble.queued, undefined);
  const answering = reduceRows(all.slice(0, 6));
  assert.equal(turnBlocks(answering.turns[1], true, LABELS)[0].steered, undefined);
  // The part before the steered message is no longer streaming; the steered part is.
  const blocks = viewBlocks(answering, LABELS);
  const hostText = blocks.find((block) => block.type === "bubble" && block.message.content === "Starting. I will ask a sub-agent to draft the copy.");
  const steeredText = blocks.find((block) => block.type === "bubble" && block.message.content === "Noted, I will add the footer too.");
  assert.notEqual(hostText.streaming, true);
  assert.equal(steeredText.streaming, true);
});

test("a refused steer shows nothing; the prompt with the same words is the one message", () => {
  const view = reduceRows(rowsOf(fixture.refused));
  assert.deepEqual(view.turns.map((turn) => [turn.text, Boolean(turn.steered), turn.open]), [
    ["Check the links", false, false],
    ["And the images?", false, false],
  ]);
  assert.deepEqual(userBubbles(view).map((block) => block.message.content), ["Check the links", "And the images?"]);
  assert.equal(textOf(view.turns[1].items), "The images load.");
});

test("an error answer to the steer also leaves it to the following prompt; output meanwhile stays in the turn", () => {
  const rows = rowsOf([
    ["client", { jsonrpc: "2.0", id: 1, method: "session/prompt", params: { sessionId: "s", prompt: [{ type: "text", text: "go" }] } }],
    ["client", { jsonrpc: "2.0", id: 2, method: "_session/steering", params: { sessionId: "s", prompt: [{ type: "text", text: "faster" }] } }],
    ["agent", { jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "working" } } } }],
    ["agent", { jsonrpc: "2.0", id: 2, error: { code: -32602, message: "unsupported steering idleBehavior" } }],
    ["client", { jsonrpc: "2.0", id: 3, method: "session/prompt", params: { sessionId: "s", prompt: [{ type: "text", text: "faster" }] } }],
  ]);
  const view = reduceRows(rows);
  assert.deepEqual(view.turns.map((turn) => [turn.text, Boolean(turn.steered)]), [["go", false], ["faster", false]]);
  assert.equal(textOf(view.turns[0].items), "working");
});

test("Stop ends the turn and its steered message together; an exit ends them too", () => {
  const head = fixture.steered.slice(0, 6);
  const stopped = reduceRows(rowsOf([...head, ["client", { jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "native-1" } }],
    ["agent", { jsonrpc: "2.0", id: 7, result: { stopReason: "cancelled" } }]]));
  assert.deepEqual(stopped.turns.map((turn) => [turn.open, turn.cancelRequested, turn.stopReason]), [[false, true, "cancelled"], [false, true, "cancelled"]]);
  const exited = reduceRows(rowsOf([...head, ["agent", { oceanleo_acp: 1, seq: 99, exit: { code: 1 } }]]));
  assert.deepEqual(exited.turns.map((turn) => [turn.open, turn.exited]), [[false, true], [false, true]]);
});

test("a prompt error after a steer is shown once, after the steered part", () => {
  const view = reduceRows(rowsOf([...fixture.steered.slice(0, 6), ["agent", { jsonrpc: "2.0", id: 7, error: { code: -32603, message: "boom" } }]]));
  assert.deepEqual(view.turns.map((turn) => [turn.open, turn.error?.message ?? null]), [[false, null], [false, "boom"]]);
});

test("a steered message is not offered for a share link (the snapshot reads prompt rows only)", () => {
  const view = reduceRows(rowsOf(fixture.steered));
  const share = acpShareItems(view);
  assert.equal(share.rowIds.has(view.turns[0].rowId), true);
  assert.equal(share.rowIds.has(view.turns[1].rowId), false);
  assert.equal(share.messages.some((message) => message.content === "Also add a footer with the address"), false);
});

test("the steered line is translated in every locale, static and loaded", async () => {
  assert.equal(LOCALES.length, 17);
  for (const locale of LOCALES) {
    const value = UI_MESSAGES[locale]?.[LINE];
    assert.ok(value?.trim(), locale);
    if (locale === "zh") assert.equal(value, LINE);
    else assert.notEqual(value, LINE, locale);
    if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) assert.doesNotMatch(value, /[一-鿿]/u, locale);
    // zh is the source text itself: its runtime dictionary is empty.
    if (locale !== "zh") assert.equal((await loadUiMessages(locale))[LINE], value, locale);
  }
});
