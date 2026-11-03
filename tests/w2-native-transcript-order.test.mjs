import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyDialog, initialDialogState, restoreNativeMessages, dialogToAgentMessages,
  mergeNativeDialogPages, mergeNativeThreadMessages,
} from "../src/native-agent-core/index.ts";

// A small recorded slice; payloads are replaced, stored sequence/identity/times are unchanged.
const recorded = JSON.parse(readFileSync(new URL("./fixtures/w2-recorded-frame-order.json", import.meta.url), "utf8"));
const start = () => ({ ...initialDialogState(), program: "claude", activeSession: "s" });
const frame = (state, fields) => applyDialog(state, { type: "frame", frame: { program: "claude", acp_session: "s", ...fields } });
const replay = (rows) => rows.reduce((s, row) => frame(s, { ...row.frame, seq: row.seq, created_at: row.created_at, replay: true }), start());
const mapped = (s) => dialogToAgentMessages(s.messages, { live: true });

test("recorded archive slice restores a missing older user into stored order, never below newer answers", () => {
  const users = recorded.filter((r) => r.frame.t === "user_message");
  const snapshots = users.slice().reverse().map((r) => ({ message_id: r.frame.message_id,
    turn_id: r.frame.turn_id, state: "started_new_turn", created_at: r.frame.ts, payload: { text: r.frame.text } }));
  const archive = replay(recorded.filter((r) => r !== users[0]));
  const restored = restoreNativeMessages(archive, snapshots);
  const rows = mapped(restored);
  assert.deepEqual(rows.filter((m) => m.role === "user").map((m) => m.content), users.map((r) => r.frame.text));
  assert.ok(rows.findIndex((m) => m.content === users[0].frame.text) < rows.findIndex((m) => m.content === "delta-99380"));
});

test("every recorded output row retains its first stored seq and actual time", () => {
  const rows = mapped(replay(recorded));
  assert.ok(rows.length > 3);
  assert.ok(rows.every((m) => Number.isFinite(m.meta?.native_seq) && Number.isFinite(Date.parse(m.created_at))));
  assert.deepEqual(rows.map((m) => m.meta.native_seq), rows.map((m) => m.meta.native_seq).sort((a, b) => a - b));
});

test("a queued input between chunks does not pull later text above that input", () => {
  let s = frame(start(), { t: "user_message", seq: 1, message_id: "one", turn_id: "t1", text: "first" });
  s = frame(s, { t: "delta", seq: 2, turn_id: "t1", text: "before" });
  s = frame(s, { t: "user_message", seq: 3, message_id: "two", turn_id: "t2", text: "waiting" });
  s = frame(s, { t: "delta", seq: 4, turn_id: "t1", text: "after" });
  assert.deepEqual(mapped(s).map((m) => m.content), ["first", "before", "waiting", "after"]);
  assert.equal(mapped(s).at(-1).meta.native_turn_id, "t1");
});

test("live arrival order keeps an input between chunks before any stored seq or server time exists", () => {
  let s = frame(start(), { t: "user_message", message_id: "one", turn_id: "t1", text: "first" });
  s = frame(s, { t: "delta", turn_id: "t1", text: "before" });
  s = frame(s, { t: "user_message", message_id: "two", turn_id: "t2", text: "waiting" });
  s = frame(s, { t: "delta", turn_id: "t1", text: "after" });
  s = frame(s, { t: "delta", turn_id: "t1", text: " more" });
  assert.deepEqual(mapped(s).map((m) => m.content), ["first", "before", "waiting", "after more"]);
  assert.equal(s.busy, true);
});

test("live continuation does not inherit the stored turn start seq above an intervening stored input", () => {
  let s = frame(start(), { t: "user_message", seq: 1, message_id: "one", turn_id: "t1", text: "first" });
  s = frame(s, { t: "delta", seq: 2, turn_id: "t1", text: "before" });
  s = frame(s, { t: "user_message", seq: 3, message_id: "two", turn_id: "t2", text: "waiting" });
  s = frame(s, { t: "delta", turn_id: "t1", text: "after" });
  assert.deepEqual(mapped(s).map((m) => m.content), ["first", "before", "waiting", "after"]);
  assert.equal(mapped(s).at(-1).meta.native_seq, undefined);
});

test("a no-seq live window anchors new output after the same echoed user in saved history", () => {
  let saved = frame(start(), { t: "user_message", message_id: "one", turn_id: "t1", text: "first" });
  saved = frame(saved, { t: "delta", turn_id: "t1", text: "before" });
  saved = frame(saved, { t: "user_message", message_id: "two", turn_id: "t2", text: "waiting" });
  let live = frame(start(), { t: "user_message", message_id: "two", turn_id: "t2", text: "waiting" });
  live = frame(live, { t: "delta", turn_id: "t1", text: "after" });
  const union = mergeNativeDialogPages(saved.messages, live.messages);
  assert.deepEqual(dialogToAgentMessages(union, { live: true }).map((m) => m.content), ["first", "before", "waiting", "after"]);
});

test("independent replays keep stored row keys stable", () => {
  assert.deepEqual(mapped(replay(recorded)).map((m) => m.id), mapped(replay(recorded)).map((m) => m.id));
});

test("paging coalesces a split thought but keeps chunks separated by user input in place", () => {
  const turn = (items) => ({ kind: "turn", id: "t", turnId: "t", acpSession: "s", stop: "end_turn", items });
  const first = { kind: "thought", id: "a", seq: 10, updatedSeq: 11, text: "ab" };
  const second = { kind: "thought", id: "b", seq: 13, updatedSeq: 14, text: "cd" };
  const joined = mergeNativeDialogPages([turn([first])], [turn([second])]);
  assert.deepEqual(dialogToAgentMessages(joined, { live: false }).map((m) => m.content), ["abcd"]);
  const separated = mergeNativeDialogPages([turn([first]), { kind: "user", id: "u", messageId: "u", seq: 12, text: "waiting" }], [turn([second])]);
  assert.deepEqual(dialogToAgentMessages(separated, { live: false }).map((m) => m.content), ["ab", "waiting", "cd"]);
});

test("overlapping archive/live pages order disjoint users by stored seq and reconcile the optimistic identity", () => {
  const a = { kind: "user", id: "local", messageId: "m1", text: "first", at: 1000, delivery: { state: "sending" }, attachments: [{ name: "a.png", mime: "image/png", preview: "blob:local" }] };
  const b = { kind: "user", id: "stored-two", messageId: "m2", text: "second", seq: 20, at: 2000 };
  const stored = { kind: "user", id: "stored-one", messageId: "m1", text: "first", seq: 10, at: 1000, attachments: [{ name: "a.png", mime: "image/png", archive: { id: "a" } }] };
  const rows = mergeNativeDialogPages([b, stored], [a]);
  assert.deepEqual(rows.map((m) => m.messageId), ["m1", "m2"]);
  assert.equal(rows[0].seq, 10);
  assert.equal(rows[0].attachments[0].preview, "blob:local");
  assert.equal(rows[0].attachments[0].archive.id, "a");
});

test("stored seq wins over clocks, and each source remains ordered across engine merges", () => {
  const msg = (id, seq, created_at) => ({ id, role: "assistant", kind: "text", content: id, meta: { native_seq: seq }, created_at });
  const rows = mergeNativeThreadMessages([
    { session: { id: "a", created_at: "" }, messages: [msg(1, 10, "2026-01-02"), msg(3, 30, "2026-01-01")] },
    { session: { id: "b", created_at: "" }, messages: [msg(2, 20, "2026-01-03")] },
  ]);
  assert.deepEqual(rows.map((m) => m.id), [1, 2, 3]);
});

test("waiting input and send handshake alone never assert a working turn", () => {
  let s = applyDialog(start(), { type: "send-began" });
  assert.equal(s.busy, false);
  s = frame(s, { t: "user_message", message_id: "waiting", text: "next" });
  s = frame(s, { t: "prompt_ack", message_id: "waiting", turn_id: "t2", state: "queued" });
  s = frame(s, { t: "turn_start", turn_id: "t1", origin: "autonomous" });
  s = frame(s, { t: "thought", turn_id: "t1", text: "background" });
  assert.equal(s.busy, true);
  s = frame(s, { t: "done", turn_id: "t1", stop_reason: "end_turn" });
  assert.equal(s.busy, false);
  assert.equal(s.messages.find((m) => m.kind === "user").delivery.state, "queued");
  s = frame(s, { t: "prompt_state", message_id: "waiting", turn_id: "t2", state: "delivered" });
  assert.equal(s.messages.find((m) => m.kind === "user").delivery.state, "delivered");
  assert.equal(s.busy, false);
  const restored = restoreNativeMessages(start(), [{ message_id: "waiting", state: "delivered", payload: { text: "next" } }]);
  assert.equal(restored.messages[0].delivery.state, "delivered");
});

test("a transcript snapshot racing a receipt never drops an accepted or unsent local bubble", () => {
  let s = frame(start(), { t: "user_message", message_id: "local", text: "keep me", local: true });
  s = frame(s, { t: "prompt_ack", message_id: "local", state: "queued" });
  const id = s.messages[0].id;
  s = frame(s, { t: "transcript", frames: [], live: false });
  assert.equal(s.messages.find((m) => m.messageId === "local")?.text, "keep me");
  s = frame(s, { t: "user_message", message_id: "local", seq: 5, text: "keep me" });
  assert.equal(s.messages.filter((m) => m.messageId === "local").length, 1);
  assert.equal(s.messages[0].id, id);
  s = frame(s, { t: "prompt_state", message_id: "local", state: "unsent", uncertain: true });
  s = frame(s, { t: "transcript", frames: [], live: false });
  assert.equal(s.messages[0].delivery.state, "unsent");
});

test("autonomous boundaries keep their own identity and do not close a newer turn on an old done", () => {
  let s = frame(start(), { t: "turn_start", seq: 1, turn_id: "a", autonomous: true });
  s = frame(s, { t: "thought", seq: 2, turn_id: "a", text: "background a" });
  s = frame(s, { t: "done", seq: 3, turn_id: "a", autonomous: true, stop_reason: "end_turn" });
  s = frame(s, { t: "turn_start", seq: 4, turn_id: "b", autonomous: true });
  s = frame(s, { t: "thought", seq: 5, turn_id: "b", text: "background b" });
  s = frame(s, { t: "done", seq: 6, turn_id: "a", autonomous: true, stop_reason: "end_turn" });
  assert.equal(s.busy, true);
  assert.deepEqual(mapped(s).map((m) => [m.meta.native_turn_id, m.meta.native_turn_autonomous, m.meta.native_turn_live]),
    [["a", true, false], ["b", true, true]]);
  s = frame(s, { t: "done", seq: 7, turn_id: "b", autonomous: true, stop_reason: "end_turn" });
  assert.equal(s.busy, false);
});

test("confirmed injection keeps the latest receipt turn when the provisional user frame replays later", () => {
  let s = frame(start(), { t: "user_message", seq: 1, message_id: "injected", turn_id: "provisional", text: "follow up" });
  s = frame(s, { t: "prompt_state", message_id: "injected", turn_id: "parent-turn", state: "injected" });
  s = frame(s, { t: "user_message", seq: 1, message_id: "injected", turn_id: "provisional", text: "follow up", replay: true });
  assert.equal(s.messages[0].turnId, "parent-turn");
  assert.equal(mapped(s)[0].meta.native_seq, 1);
  s = frame(s, { t: "transcript", frames: [{ t: "user_message", program: "claude", acp_session: "s", seq: 1,
    message_id: "injected", turn_id: "provisional", text: "follow up", replay: true }], live: false });
  assert.equal(s.messages[0].turnId, "parent-turn");
});

test("archive requests stay read-only until explicit gateway confirmation, including replayed pending requests", () => {
  let s = frame(start(), { t: "permission", turn_id: "pending", id: "p", title: "Read", replay: true, actionable: false, request_state: "waiting", options: [{ id: "yes", name: "Yes", kind: "allow_once" }] });
  s = frame(s, { t: "question", turn_id: "pending", id: "q", title: "Ask", replay: true, actionable: false, request_state: "waiting" });
  assert.ok(mapped(s).every((m) => m.meta.native_actionable === false));
  s = frame(s, { t: "permission", turn_id: "pending", id: "p", title: "Read", replay: true, actionable: true, request_state: "waiting", options: [{ id: "yes", name: "Yes", kind: "allow_once" }] });
  s = frame(s, { t: "question", turn_id: "pending", id: "q", title: "Ask", replay: true, actionable: true, request_state: "waiting" });
  assert.ok(mapped(s).every((m) => m.meta.native_actionable === true));
  s = frame(s, { t: "done", turn_id: "pending", stop: "end_turn" });
  assert.ok(mapped(s).every((m) => m.meta.native_actionable === false));
  s = frame(s, { t: "permission", turn_id: "pending", id: "p", title: "Read", replay: true, actionable: true, request_state: "expired" });
  assert.ok(mapped(s).every((m) => m.meta.native_actionable === false));
});

test("a saved snapshot continued by live turns keeps the saved answer above everything that arrives live (V1 03:32 U1)", () => {
  // Recorded identities/times of V1's Codex task (seq 104999..105041); texts replaced.
  // Saved page: U1 (104999) and its answer A1 (105004). Live (no stored seq, server
  // arrival order): U2's turn, a browser-sent U3 injected into it, then the answers.
  const codex = () => ({ ...initialDialogState(), program: "codex", activeSession: "s" });
  const at = (s, row) => applyDialog(s, { type: "frame", frame: { program: "codex", acp_session: "s", ...row } });
  const savedRows = [
    { t: "user_message", seq: 104999, created_at: "2026-11-03T18:53:45.012Z", ts: "2026-11-03T18:53:44.900Z", message_id: "v1-f8e80", turn_id: "bd82526f", text: "U1" },
    { t: "turn_start", seq: 105001, created_at: "2026-11-03T18:53:47.802Z", message_id: "v1-f8e80", turn_id: "bd82526f" },
    { t: "prompt_state", seq: 105003, created_at: "2026-11-03T18:53:51.761Z", message_id: "v1-f8e80", turn_id: "bd82526f", state: "started_new_turn", reason: "idle" },
    { t: "delta", seq: 105004, created_at: "2026-11-03T18:53:51.761Z", message_id: "v1-f8e80", turn_id: "bd82526f", text: "A1" },
    { t: "done", seq: 105005, created_at: "2026-11-03T18:53:52.233Z", message_id: "v1-f8e80", turn_id: "bd82526f", stop_reason: "end_turn" },
  ];
  const saved = savedRows.reduce((s, row) => at(s, { ...row, replay: true }), codex());
  const liveRows = [
    { t: "prompt_ack", message_id: "v1-9e68b", turn_id: "b147999f", state: "queued", reason: "accepting" },
    { t: "user_message", ts: "2026-11-03T18:54:24.000Z", message_id: "v1-9e68b", turn_id: "b147999f", text: "U2" },
    { t: "turn_start", message_id: "v1-9e68b", turn_id: "b147999f" },
    { t: "delta", message_id: "v1-9e68b", turn_id: "b147999f", text: "A2 first" },
    { t: "user_message", ts: "2026-11-03T18:54:34.700Z", message_id: "ff8e3f49", turn_id: "3811f052", text: "U3" },
    { t: "prompt_state", message_id: "ff8e3f49", turn_id: "b147999f", state: "injected", reason: "steer" },
    { t: "delta", message_id: "v1-9e68b", turn_id: "b147999f", text: "A2 second" },
    { t: "done", message_id: "v1-9e68b", turn_id: "b147999f", stop_reason: "end_turn" },
  ];
  // On attach the gateway first sends the copy it holds (`transcript`, mode replace):
  // the same frames with their OceanLeo identity, but no stored seq or time.
  let live = at(codex(), { t: "transcript", mode: "replace", live: false,
    frames: savedRows.map(({ seq: _seq, created_at: _at, ...row }) => ({ program: "codex", acp_session: "s", ...row })) });
  const contents = [];
  for (const row of liveRows) {
    live = at(live, row);
    const union = mergeNativeDialogPages(saved.messages, live.messages);
    contents.push(dialogToAgentMessages(union, { live: true }).map((m) => m.content));
  }
  for (const rows of contents) {
    assert.deepEqual(rows.slice(0, 2), ["U1", "A1"], `saved U1/A1 stay first and together: ${JSON.stringify(rows)}`);
  }
  assert.deepEqual(contents.at(-1), ["U1", "A1", "U2", "A2 first", "U3", "A2 second"]);
});

test("a text-only native replay on attach restates the saved turn once, and live turns still follow its answer", () => {
  // Recorded identities/times of V1's Codex task (seq 104999..105041); texts replaced.
  // Saved page: U1 (104999) and its answer A1 (105004). Live (no stored seq, server
  // arrival order): U2's turn, a browser-sent U3 injected into it, then the answers.
  const codex = () => ({ ...initialDialogState(), program: "codex", activeSession: "s" });
  const at = (s, row) => applyDialog(s, { type: "frame", frame: { program: "codex", acp_session: "s", ...row } });
  const savedRows = [
    { t: "user_message", seq: 104999, created_at: "2026-11-03T18:53:45.012Z", ts: "2026-11-03T18:53:44.900Z", message_id: "v1-f8e80", turn_id: "bd82526f", text: "U1" },
    { t: "turn_start", seq: 105001, created_at: "2026-11-03T18:53:47.802Z", message_id: "v1-f8e80", turn_id: "bd82526f" },
    { t: "prompt_state", seq: 105003, created_at: "2026-11-03T18:53:51.761Z", message_id: "v1-f8e80", turn_id: "bd82526f", state: "started_new_turn", reason: "idle" },
    { t: "delta", seq: 105004, created_at: "2026-11-03T18:53:51.761Z", message_id: "v1-f8e80", turn_id: "bd82526f", text: "A1" },
    { t: "done", seq: 105005, created_at: "2026-11-03T18:53:52.233Z", message_id: "v1-f8e80", turn_id: "bd82526f", stop_reason: "end_turn" },
  ];
  const saved = savedRows.reduce((s, row) => at(s, { ...row, replay: true }), codex());
  const liveRows = [
    { t: "prompt_ack", message_id: "v1-9e68b", turn_id: "b147999f", state: "queued", reason: "accepting" },
    { t: "user_message", ts: "2026-11-03T18:54:24.000Z", message_id: "v1-9e68b", turn_id: "b147999f", text: "U2" },
    { t: "turn_start", message_id: "v1-9e68b", turn_id: "b147999f" },
    { t: "delta", message_id: "v1-9e68b", turn_id: "b147999f", text: "A2 first" },
    { t: "user_message", ts: "2026-11-03T18:54:34.700Z", message_id: "ff8e3f49", turn_id: "3811f052", text: "U3" },
    { t: "prompt_state", message_id: "ff8e3f49", turn_id: "b147999f", state: "injected", reason: "steer" },
    { t: "delta", message_id: "v1-9e68b", turn_id: "b147999f", text: "A2 second" },
    { t: "done", message_id: "v1-9e68b", turn_id: "b147999f", stop_reason: "end_turn" },
  ];
  // After a gateway restart the copy is the native session/load replay: text only,
  // no OceanLeo message/turn identity, no stored seq or time.
  let live = at(codex(), { t: "transcript", mode: "replace", live: false, frames: [
    { t: "user_message", program: "codex", acp_session: "s", text: "U1", replay: true },
    { t: "delta", program: "codex", acp_session: "s", text: "A1", replay: true },
  ] });
  const contents = [];
  for (const row of liveRows) {
    live = at(live, row);
    const union = mergeNativeDialogPages(saved.messages, live.messages);
    contents.push(dialogToAgentMessages(union, { live: true }).map((m) => m.content));
  }
  for (const rows of contents) {
    assert.deepEqual(rows.slice(0, 2), ["U1", "A1"], `saved U1/A1 stay first and together: ${JSON.stringify(rows)}`);
  }
  assert.deepEqual(contents.at(-1), ["U1", "A1", "U2", "A2 first", "U3", "A2 second"]);
});
