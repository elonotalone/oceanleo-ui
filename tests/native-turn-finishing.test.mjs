import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../src/native-agent-core/index.ts";

const start = () => ({ ...core.initialDialogState(), program: "codex", activeSession: "native" });
const frame = (state, fields) => core.applyDialog(state, { type: "frame", frame: { program: "codex", acp_session: "native", ...fields } });
const rows = (state) => core.dialogToAgentMessages(state.messages, { live: true });
const positions = (state) => state.messages.map(({ id, seq, at, updatedSeq, updatedAt, arrival, updatedArrival, items }) =>
  ({ id, seq, at, updatedSeq, updatedAt, arrival, updatedArrival, items }));

test("finishing changes the current turn's affordance without adding content, activity or releasing control", () => {
  let state = frame(start(), { t: "turn_start", turn_id: "one", seq: 10, created_at: "2026-11-04T00:00:00Z" });
  state = frame(state, { t: "delta", turn_id: "one", text: "Answer", seq: 11, created_at: "2026-11-04T00:00:01Z" });
  const before = positions(state);
  const control = { busy: state.busy, liveTurns: state.liveTurns, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy };
  state = frame(state, { t: "turn_state", turn_id: "one", state: "finishing", autonomous: true, seq: 12, created_at: "2026-11-04T00:00:30Z" });
  assert.equal(rows(state)[0].meta.native_turn_finishing, true);
  assert.equal(rows(state)[0].meta.native_turn_live, true);
  assert.equal(rows(state)[0].meta.native_streaming, undefined);
  assert.equal(rows(state)[0].meta.native_turn_autonomous, undefined, "status does not reclassify a prompt-owned turn");
  assert.equal(core.nativeTurnFinishing(state.messages, "native"), true);
  assert.equal(core.nativeActiveTurn(state.messages, "native").turnId, "one");
  assert.deepEqual(positions(state), before);
  assert.deepEqual({ busy: state.busy, liveTurns: state.liveTurns, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy }, control);
  state = frame(state, { t: "turn_state", turn_id: "one", state: "working", seq: 13, created_at: "2026-11-04T00:00:35Z" });
  assert.equal(rows(state)[0].meta.native_turn_finishing, false);
  assert.equal(rows(state)[0].meta.native_streaming, true);
  assert.deepEqual(positions(state), before);
});

test("old, foreign and unknown turn states cannot hide newer work or create a turn", () => {
  let state = frame(start(), { t: "turn_start", turn_id: "old", seq: 1 });
  state = frame(state, { t: "delta", turn_id: "old", seq: 2, text: "Old" });
  state = frame(state, { t: "turn_state", turn_id: "old", state: "finishing", seq: 3 });
  state = frame(state, { t: "turn_start", turn_id: "new", seq: 4 });
  state = frame(state, { t: "delta", turn_id: "new", text: "New", seq: 5 });
  state = frame(state, { t: "turn_state", turn_id: "old", state: "finishing", seq: 6 });
  assert.equal(core.nativeTurnFinishing(state.messages, "native", true), false);
  assert.equal(rows(state).find(row => row.content === "New").meta.native_turn_finishing, false);
  const before = state.messages;
  for (const fields of [
    { turn_id: "missing", state: "finishing" },
    { turn_id: "new", state: "finishing", acp_session: "foreign" },
    { turn_id: "new", state: "finishing", program: "claude" },
    { turn_id: "new", state: "idle" },
  ]) state = frame(state, { t: "turn_state", ...fields });
  assert.deepEqual(state.messages, before);
  state = frame(state, { t: "done", turn_id: "new", stop_reason: "end_turn", seq: 7 });
  state = frame(state, { t: "turn_state", turn_id: "new", state: "finishing", seq: 8 });
  assert.equal(core.nativeTurnFinishing(state.messages, "native", true), false);
  assert.equal(core.nativeActiveTurn(state.messages, "native"), undefined);
});

test("ordered working overrides stale saved finishing across archive/live union", () => {
  let saved = frame(start(), { t: "turn_start", turn_id: "one", seq: 1, replay: true });
  saved = frame(saved, { t: "delta", turn_id: "one", seq: 2, text: "Answer", replay: true });
  saved = frame(saved, { t: "turn_state", turn_id: "one", state: "finishing", seq: 3, replay: true });
  let live = frame(start(), { t: "turn_start", turn_id: "one", seq: 1 });
  live = frame(live, { t: "turn_state", turn_id: "one", state: "working", seq: 4 });
  live = frame(live, { t: "turn_state", turn_id: "one", state: "finishing", seq: 3, replay: true });
  assert.equal(core.nativeTurnFinishing(live.messages, "native", true), false);
  for (const union of [core.mergeNativeDialogPages(saved.messages, live.messages), core.mergeNativeDialogPages(live.messages, saved.messages)]) {
    assert.equal(core.nativeTurnFinishing(union, "native", true), false);
    assert.equal(union[0].turnStateSeq, 4);
    assert.equal(union[0].updatedSeq, 2, "status sequence does not become transcript activity");
  }
  assert.equal(core.nativeTurnFinishing(saved.messages, "native"), true, "ordered archive state hydrates before live replay");
  assert.equal(core.nativeTurnFinishing([], "native", true), true, "public state bridges an archive still loading");
});

test("a quiet inferred done closes control at the real answer time", () => {
  let state = frame(start(), { t: "turn_start", turn_id: "quiet", seq: 1, created_at: "2026-11-04T00:00:00Z" });
  state = frame(state, { t: "delta", turn_id: "quiet", seq: 2, text: "Final answer", created_at: "2026-11-04T00:00:01Z" });
  state = frame(state, { t: "turn_state", turn_id: "quiet", state: "finishing", seq: 3, created_at: "2026-11-04T00:00:02Z" });
  const before = positions(state);
  const content = rows(state).map(({ id, content, created_at, meta }) => ({ id, content, created_at, updated: meta.native_updated_at }));
  state = frame(state, { t: "done", turn_id: "quiet", stop_reason: "end_turn", reason: "native_quiet", seq: 4, created_at: "2026-11-04T00:00:31Z" });
  assert.deepEqual(positions(state), before);
  assert.deepEqual(rows(state).map(({ id, content, created_at, meta }) => ({ id, content, created_at, updated: meta.native_updated_at })), content);
  assert.equal(core.nativeTurnFinishing(state.messages, "native", true), false);
  assert.equal(core.nativeActiveTurn(state.messages, "native"), undefined);
  assert.equal(state.busy, false);
});

test("a status preceding live replay attaches only to its existing archived identity", () => {
  let pending = frame(start(), { t: "turn_state", turn_id: "one", state: "working", seq: 20 });
  assert.deepEqual(pending.messages, []);
  let saved = frame(start(), { t: "turn_start", turn_id: "one", seq: 10, replay: true });
  saved = frame(saved, { t: "delta", turn_id: "one", seq: 11, text: "Saved", replay: true });
  saved = frame(saved, { t: "turn_state", turn_id: "one", state: "finishing", seq: 15, replay: true });
  const before = positions(saved);
  const messages = core.applyNativeTurnStates(saved.messages, pending.turnStates, "codex");
  assert.equal(core.nativeTurnFinishing(messages, "native", true), false);
  assert.deepEqual(positions({ messages }), before);
  assert.equal(core.applyNativeTurnStates(saved.messages, pending.turnStates, "claude"), saved.messages);
  pending = frame(pending, { t: "turn_state", turn_id: "one", state: "finishing", seq: 15 });
  assert.equal(core.nativeTurnFinishing(core.applyNativeTurnStates(saved.messages, pending.turnStates, "codex"), "native", true), false);
  pending = core.applyDialog(pending, { type: "session-loading", id: "other-native" });
  assert.equal(Object.keys(pending.turnStates).length, 0, "a new native binding drops unmatched status");
  assert.deepEqual(core.applyDialog(pending, { type: "reset" }).turnStates, {});
});

test("new native progress supersedes earlier finishing without moving activity to the status receipt", () => {
  let state = frame(start(), { t: "turn_start", turn_id: "one", seq: 1 });
  state = frame(state, { t: "delta", turn_id: "one", seq: 2, text: "First", created_at: "2026-11-04T00:00:01Z" });
  state = frame(state, { t: "turn_state", turn_id: "one", state: "finishing", seq: 3, created_at: "2026-11-04T00:00:30Z" });
  state = frame(state, { t: "delta", turn_id: "one", seq: 4, text: " continues", created_at: "2026-11-04T00:00:31Z" });
  assert.equal(core.nativeTurnFinishing(state.messages, "native", true), false);
  assert.equal(rows(state)[0].meta.native_streaming, true);
  assert.equal(state.messages[0].turnStateSeq, 3, "status position stays separate from content progress");
  assert.equal(rows(state)[0].meta.native_updated_at, "2026-11-04T00:00:31.000Z");
  state = frame(state, { t: "turn_state", turn_id: "one", state: "finishing", seq: 3 });
  assert.equal(core.nativeTurnFinishing(state.messages, "native", true), false);
});

test("stored status order survives an older replay arriving later and stays within its managed binding", () => {
  let state = frame(start(), { t: "turn_state", turn_id: "one", state: "finishing", seq: 20, _native_binding: "managed-one" });
  state = frame(state, { t: "turn_start", turn_id: "one", seq: 10, replay: true, _native_binding: "managed-one" });
  state = frame(state, { t: "delta", turn_id: "one", seq: 11, text: "Saved", replay: true, _native_binding: "managed-one" });
  assert.equal(core.nativeTurnFinishing(state.messages, "native"), true, "later arrival does not outrank stored sequence");
  const other = core.applyNativeTurnStates(state.messages, state.turnStates, "codex", "managed-other");
  assert.equal(core.nativeTurnFinishing(other, "native"), false, "a managed-task switch cannot inherit pending status");
  assert.equal(other[0].items[0].text, "Saved");
  assert.deepEqual(positions({ messages: other }), positions(state));
  for (let index = 0; index < 200; index += 1) state = frame(state, { t: "turn_state", turn_id: `unreplayed-${index}`, state: "finishing", seq: 21 + index, _native_binding: "managed-one" });
  assert.ok(Object.keys(state.turnStates).length <= 128, "unreplayed identities cannot grow without a bound");
  assert.equal(state.messages.length, 1, "unmatched status never creates transcript rows");
});
