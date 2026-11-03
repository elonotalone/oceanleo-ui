// Read-only operator-data replay. Prints counts/invariants, never transcript payloads.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  applyDialog, initialDialogState, restoreNativeMessages, dialogToAgentMessages, mergeNativeDialogPages,
} from "../src/native-agent-core/index.ts";

const path = process.argv[2];
if (!path) throw new Error("Pass the private recorded {seq,frame,created_at} fixture path");
const rows = JSON.parse(readFileSync(path, "utf8"));
const users = rows.filter((row) => row.frame.t === "user_message");
const snapshots = users.slice().reverse().map((row) => ({
  message_id: row.frame.message_id, turn_id: row.frame.turn_id,
  state: "queued", created_at: row.frame.ts, payload: { text: row.frame.text, attachments: row.frame.attachments },
}));
const reduce = (page) => page.reduce((state, row) => applyDialog(state, {
  type: "frame", frame: { ...row.frame, seq: row.seq, created_at: row.created_at, replay: true },
}), { ...initialDialogState(), program: "claude", activeSession: rows[0]?.frame.acp_session || "" });
const whole = reduce(rows);
let paged = [];
for (let before = rows.length; before > 0; before -= 200) {
  const state = reduce(rows.slice(Math.max(0, before - 200), before));
  const restored = restoreNativeMessages(state, snapshots);
  paged = mergeNativeDialogPages(restored.messages, paged);
}
let wholeText;
const check = (messages) => {
  const mapped = dialogToAgentMessages(messages, { live: false });
  const seqs = mapped.flatMap((row) => typeof row.meta?.native_seq === "number" ? [row.meta.native_seq] : []);
  assert.ok(seqs.every((seq, index) => !index || seq >= seqs[index - 1]), "stored order regressed");
  const actualUsers = mapped.filter((row) => row.role === "user").map((row) => row.meta.native_message_id);
  assert.ok(JSON.stringify(actualUsers) === JSON.stringify(users.map((row) => row.frame.message_id)), "recorded user order/count changed");
  assert.equal(new Set(actualUsers).size, actualUsers.length, "duplicate user identity");
  assert.ok(mapped.every((row) => row.created_at && Number.isFinite(Date.parse(row.created_at))), "missing actual row time");
  const text = new Map();
  for (const row of mapped) if (row.role === "assistant" && (row.kind === "text" || row.kind === "analysis")) {
    const key = `${row.meta?.native_turn_id}/${row.kind}`;
    text.set(key, (text.get(key) ?? "") + row.content);
  }
  const textDigests = new Map([...text].map(([key, value]) => [key, { chars: value.length, digest: createHash("sha256").update(value).digest("hex") }]));
  if (wholeText) {
    const mismatches = [...textDigests].filter(([key, value]) => wholeText.get(key)?.digest !== value.digest)
      .map(([key, value]) => ({ key, wholeChars: wholeText.get(key)?.chars, pagedChars: value.chars }));
    if (mismatches.length) console.log(JSON.stringify({ mismatches }));
    assert.equal(mismatches.length, 0, "paged replay duplicated or lost assistant/thought content");
  } else wholeText = textDigests;
  return { renderedRows: mapped.length, users: actualUsers.length, seqRows: seqs.length };
};
console.log(JSON.stringify({ inputFrames: rows.length, whole: check(whole.messages), paged: check(paged) }));
