import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDialog, initialDialogState, dialogToAgentMessages, mergeNativeDialogPages,
} from "../src/native-agent-core/index.ts";

// V1's exact stored notice positions/times/codes; bodies are synthetic.
const notices = [
  { t: "error", seq: 105236, created_at: "2026-11-03T19:00:40.217652+00:00", code: "dialog_detached", text: "recorded detach" },
  { t: "error", seq: 105882, created_at: "2026-11-03T19:48:37.946384+00:00", code: "acp_start_failed", text: "recorded open error" },
  { t: "error", seq: 106001, created_at: "2026-11-03T19:57:44.805152+00:00", text: "recorded filtered placeholder" },
];
const pair = (seq, id) => [
  { t: "user_message", seq, message_id: id, turn_id: `turn-${id}`, text: `user-${id}` },
  { t: "delta", seq: seq + 1, turn_id: `turn-${id}`, text: `reply-${id}` },
  { t: "done", seq: seq + 2, turn_id: `turn-${id}`, stop_reason: "end_turn" },
];
const frames = [
  ...pair(105200, "one"), ...pair(105220, "two"), notices[0],
  ...pair(105878, "three"), notices[1], ...pair(105990, "four"), notices[2],
];
const replay = (rows) => rows.reduce((state, frame) => applyDialog(state, { type: "frame", frame: {
  program: "codex", acp_session: "recorded-session", replay: true, ...frame,
} }), { ...initialDialogState(), program: "codex", activeSession: "recorded-session" }).messages;
const map = (messages) => dialogToAgentMessages(messages, { live: true });
const signature = (messages) => map(messages).map(row => [row.id, row.role, row.kind, row.meta.native_seq, row.content]);
const notice = (id, seq, extra = {}) => ({ kind: "notice", id, seq, code: "node_error", program: "codex", text: "same repeated error", ...extra });
const turn = (id, seq, items, extra = {}) => ({ kind: "turn", id, seq, acpSession: "s", items, stop: "end_turn", ...extra });

test("the three recorded notices reconcile on stored seq: 11 rows remain 11 after reconnect", () => {
  const saved = replay(frames);
  const live = replay(frames);
  assert.equal(map(saved).length, 11);
  for (const { seq } of notices) {
    assert.notEqual(saved.find(row => row.seq === seq).id, live.find(row => row.seq === seq).id);
  }
  const merged = mergeNativeDialogPages(saved, live);
  assert.equal(map(merged).length, 11);
  assert.deepEqual(signature(merged), signature(saved));
  for (const { seq } of notices) assert.equal(merged.filter(row => row.seq === seq).length, 1);
});

test("repeated notice replays keep saved keys, timestamps and stored order despite new arrival sources", () => {
  const saved = replay(frames);
  let merged = saved;
  for (let pass = 0; pass < 4; pass += 1) {
    const incoming = replay(frames).map(row => ({ ...row, at: 0, arrival: 100 - pass, arrivalSource: `reconnect-${pass}` }));
    merged = mergeNativeDialogPages(merged, incoming);
    assert.deepEqual(signature(merged), signature(saved));
    assert.deepEqual(merged.filter(row => row.kind === "notice").map(row => row.at),
      saved.filter(row => row.kind === "notice").map(row => row.at));
  }
});

test("identical notice text at different stored seq stays distinct and seq overrides clocks", () => {
  const first = notice("saved-first", 10, { at: 3000 });
  const second = notice("saved-second", 20, { at: 1000 });
  const incoming = [notice("replay-second", 20), notice("replay-first", 10), notice("new-third", 30)];
  const rows = mergeNativeDialogPages([second, first], incoming);
  assert.deepEqual(rows.map(row => [row.id, row.seq]), [["saved-first", 10], ["saved-second", 20], ["new-third", 30]]);
});

test("stored notice seq is authoritative over reused local ids and restated text", () => {
  const saved = notice("same-local-id", 10, { text: "saved error" });
  const rows = mergeNativeDialogPages([saved], [notice("same-local-id", 20), notice("different-id", 10, { text: "restated error" })]);
  assert.deepEqual(rows.map(row => [row.seq, row.text]), [[10, "saved error"], [20, "same repeated error"]]);
});

test("notice identity preserves separate same-frame parts, programs, providers and models", () => {
  const saved = notice("saved", 10, { provider: "a", model: "one" });
  const variants = [
    notice("program", 10, { program: "claude", provider: "a", model: "one" }),
    notice("code", 10, { code: "another_error", provider: "a", model: "one" }),
    notice("provider", 10, { provider: "b", model: "one" }),
    notice("model", 10, { provider: "a", model: "two" }),
    { kind: "user", id: "user", seq: 10, messageId: "u", text: "same repeated error" },
  ];
  assert.equal(mergeNativeDialogPages([saved], variants).length, 6);
});

test("unsequenced independent notices never deduplicate by raw text", () => {
  const saved = notice("saved", undefined);
  const live = notice("live", undefined);
  assert.equal(mergeNativeDialogPages([saved], [live]).length, 2);
  assert.deepEqual(mergeNativeDialogPages([saved], [{ ...saved }]), [saved]);
});

test("a stored legacy turn without a wire turn id reconciles by seq and session", () => {
  const saved = turn("saved-container", 10, [
    { kind: "tool", id: "saved-tool", seq: 11, tool: { id: "tool-id", kind: "execute", title: "command", status: "in_progress", content: [], locations: [] } },
    { kind: "permission", id: "saved-permission", seq: 12, permId: "perm-id", title: "permission", permKind: "execute", options: [], toolTitle: "command", chosen: "", auto: false },
  ]);
  const incoming = { ...saved, id: "live-container", items: saved.items.map(item => ({ ...item, id: `live-${item.kind}` })) };
  const rows = mergeNativeDialogPages([saved], [incoming]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, saved.id);
  assert.deepEqual(signature(rows), signature([saved]));
});

test("turn seq fallback never merges different sessions or conflicting durable turn ids", () => {
  const saved = turn("saved", 10, [], { turnId: "turn-one" });
  const variants = [turn("other-id", 10, [], { turnId: "turn-two" }), turn("other-session", 10, [], { acpSession: "other" })];
  assert.equal(mergeNativeDialogPages([saved], variants).length, 3);
});

test("tool, permission, question, plan and usage replay retains saved positions and real updates", () => {
  const items = [
    { kind: "tool", id: "tool-row", seq: 11, tool: { id: "tool-id", kind: "execute", title: "command", status: "in_progress", content: [], locations: [] } },
    { kind: "permission", id: "permission-row", seq: 12, permId: "perm-id", title: "permission", permKind: "execute", options: [], toolTitle: "command", chosen: "", auto: false },
    { kind: "question", id: "question-row", seq: 13, questionId: "question-id", title: "question", detail: "detail", questions: [], submitted: false },
    { kind: "plan", id: "plan-row", seq: 14, entries: [{ content: "step", status: "pending", priority: "high" }] },
    { kind: "usage", id: "usage-row", seq: 15, used: 20, size: 100 },
  ];
  const saved = turn("saved", 10, items, { turnId: "durable-turn" });
  const live = turn("replayed", 10, items.map(item => ({ ...item, id: `replayed-${item.kind}`,
    ...(item.kind === "tool" ? { tool: { ...item.tool, status: "completed" } } : {}),
    ...(item.kind === "permission" ? { chosen: "allow" } : {}),
    ...(item.kind === "question" ? { submitted: true } : {}),
  })), { turnId: "durable-turn" });
  const [row] = mergeNativeDialogPages([saved], [live]);
  assert.deepEqual(row.items.map(item => [item.kind, item.seq]), items.map(item => [item.kind, item.seq]));
  assert.equal(row.items[0].tool.status, "completed");
  assert.equal(row.items[1].chosen, "allow");
  assert.equal(row.items[2].submitted, true);
  assert.equal(map([row]).length, map([saved]).length);
});

test("different tool/permission identities and different kinds from one seq remain separate", () => {
  const saved = turn("saved", 10, [
    { kind: "tool", id: "tool-one", seq: 11, tool: { id: "tool-one", kind: "execute", title: "same", status: "completed", content: [], locations: [] } },
    { kind: "permission", id: "perm-one", seq: 11, permId: "perm-one", title: "same", permKind: "execute", options: [], toolTitle: "same", chosen: "", auto: false },
  ], { turnId: "turn" });
  const live = { ...saved, id: "live", items: [
    { ...saved.items[0], id: "tool-two", tool: { ...saved.items[0].tool, id: "tool-two" } },
    { ...saved.items[1], id: "perm-two", permId: "perm-two" },
    { kind: "thought", id: "thought", seq: 11, text: "same" },
    { kind: "assistant", id: "assistant", seq: 11, text: "same" },
  ] };
  const [row] = mergeNativeDialogPages([saved], [live]);
  assert.equal(row.items.length, 6);
});
