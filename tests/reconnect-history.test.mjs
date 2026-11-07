// Reconnect history contracts on the kept merge and reducer; no browser.
import assert from "node:assert/strict";
import test from "node:test";

const { mergeSavedAndLive, mergeTranscriptPages } = await import("../src/shell/native-thread/merge.ts");
const { applyDialog, initialDialogState } = await import("../src/shell/cloud-computer/agent-dialog/reduce.ts");
const promptRow = (text, id = text, at) => ({ kind: "user", id, text, ...(at !== undefined ? { at } : {}) });
const turn = (text, extra = {}) => ({ kind: "turn", id: `turn-${text}`, acpSession: "s", stop: "end_turn",
  items: [{ kind: "assistant", id: `text-${text}`, text }], ...extra });
const texts = (rows) => rows.flatMap((row) => row.kind === "user" ? row.text : row.kind === "turn" ? row.items.filter((i) => i.kind === "assistant").map((i) => i.text) : []);

test("adoption with only an autonomous turn preserves all saved history and the new output", () => {
  const saved = [promptRow("one"), turn("first"), promptRow("two"), turn("second")];
  const live = [turn("autonomous update", { live: true, stop: "" })];
  assert.deepEqual(texts(mergeSavedAndLive(saved, live, { replay: false }).messages), ["one", "first", "two", "second", "autonomous update"]);
  assert.deepEqual(texts(mergeSavedAndLive(saved, live).messages), ["one", "first", "two", "second", "autonomous update"]);
});

test("overlapping saved and live prompts / replies appear once, growing text and tool ids update in place", () => {
  const savedTool = { kind: "tool", id: "saved-tool", tool: { id: "tool-id", status: "in_progress" } };
  const liveTool = { kind: "tool", id: "live-tool", tool: { id: "tool-id", status: "completed" } };
  const saved = [promptRow("old"), turn("done"), promptRow("current"), turn("working", { items: [savedTool, { kind: "assistant", id: "a", text: "working" }] })];
  const live = [promptRow("current", "echo"), turn("working longer", { live: true, stop: "", items: [liveTool, { kind: "assistant", id: "b", text: "working longer" }] })];
  const merged = mergeSavedAndLive(saved, live).messages;
  assert.deepEqual(texts(merged), ["old", "done", "current", "working longer"]);
  assert.equal(merged.at(-1).items.filter((item) => item.kind === "tool").length, 1);
  assert.equal(merged.at(-1).items[0].tool.status, "completed");
  assert.equal(merged.at(-1).items[0].id, "saved-tool");
  assert.equal(merged.at(-2).id, "current");
});

test("replayed autonomous turns under the same prompt are not doubled", () => {
  const saved = [promptRow("one"), turn("reply one"), turn("reply two")];
  const live = [promptRow("one", "new-id"), turn("reply one", { id: "replay-a" }), turn("reply two", { id: "replay-b" })];
  assert.deepEqual(texts(mergeSavedAndLive(saved, live).messages), ["one", "reply one", "reply two"]);
});

test("replay may replace saved history only when it covers the replies as well as every prompt", () => {
  const saved = [promptRow("one"), turn("answer one"), promptRow("two"), turn("answer two")];
  assert.equal(mergeSavedAndLive(saved, [promptRow("two"), turn("answer two")], { replay: true }).source, "merged");
  assert.equal(mergeSavedAndLive(saved, [promptRow("one"), promptRow("two")], { replay: true }).source, "merged");
  const partialReply = [promptRow("one"), turn("ans"), promptRow("two"), turn("answer two")];
  const partialMerge = mergeSavedAndLive(saved, partialReply, { replay: true });
  assert.equal(partialMerge.source, "merged", "a reply prefix cannot hide the saved ending");
  assert.ok(texts(partialMerge.messages).includes("answer one"));
  assert.equal(mergeSavedAndLive(saved, saved, { replay: true }).source, "live");
});

test("distinct long prompts, stable message ids and distant repeated prompts never collapse", () => {
  const prefix = "a".repeat(450);
  for (const [a, b] of [
    [promptRow(prefix + "one"), promptRow(prefix + "two")],
    [promptRow("again", "frame:codex:s:1"), promptRow("again", "frame:codex:s:2")],
    [promptRow("again", "a", 1), promptRow("again", "b", 100_000)],
  ]) assert.equal(mergeSavedAndLive([a, turn("old")], [b, turn("new")]).messages.filter((row) => row.kind === "user").length, 2);
});

test("reread tail merges without duplicate prompts or losing older pages", () => {
  const pages = [promptRow("one"), turn("first"), promptRow("two"), turn("second")];
  const tail = [promptRow("two"), turn("second"), promptRow("three"), turn("third")];
  assert.deepEqual(texts(mergeTranscriptPages(pages, tail)), ["one", "first", "two", "second", "three", "third"]);
});

for (const t of ["status", "delta", "turn_start", "occupancy", "session_opened"]) test(`${t} clears reconnect offline state`, () => {
  let state = { ...initialDialogState(), program: "codex", activeSession: "s" };
  state = applyDialog(state, { type: "frame", frame: { t: "error", code: "computer_reconnecting", program: "codex" } });
  assert.equal(state.offline, true);
  state = applyDialog(state, { type: "frame", frame: { t, program: "codex", acp_session: "s", text: "back", programs: [], busy: [], link: "attached" } });
  assert.equal(state.offline, false);
});
