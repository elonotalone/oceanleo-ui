import test from "node:test";
import assert from "node:assert/strict";
import { mergeNativeThreadMessages } from "../src/shell/native-thread/merge.ts";

const session = (id, program, created_at) => ({ id, program, created_at });
const message = (id, created_at) => ({ id, role: "assistant", kind: "text", content: id, ...(created_at ? { created_at } : {}) });

test("merges interleaved engine turns by timestamp", () => {
  const result = mergeNativeThreadMessages([
    { session: session("codex", "codex", "2026-01-01T00:00:00Z"), messages: [message(1, "2026-01-01T00:00:01Z"), message(3, "2026-01-01T00:00:03Z")] },
    { session: session("claude", "claude", "2026-01-01T00:00:00Z"), messages: [message(2, "2026-01-01T00:00:02Z")] },
  ]);
  assert.deepEqual(result.map((row) => row.id), [1, 2, 3]);
});

test("uses session creation order when timestamps are absent", () => {
  const result = mergeNativeThreadMessages([
    { session: session("later", "claude", "2026-01-02T00:00:00Z"), messages: [message(2)] },
    { session: session("first", "codex", "2026-01-01T00:00:00Z"), messages: [message(1)] },
  ]);
  assert.deepEqual(result.map((row) => row.id), [1, 2]);
});

const prompt = (id, created_at) => ({ id, role: "user", kind: "text", content: id, created_at });

test("an untimed reply stays right after its own prompt across engine switches", () => {
  // Codex → Claude → Codex: only prompts are timed, replies are not.
  const result = mergeNativeThreadMessages([
    { session: session("claude", "claude", "2026-01-01T00:00:05Z"), messages: [prompt("q2", "2026-01-01T00:00:06Z"), message("a2")] },
    { session: session("codex", "codex", "2026-01-01T00:00:00Z"), messages: [
      prompt("q1", "2026-01-01T00:00:01Z"), message("a1"), prompt("q3", "2026-01-01T00:00:09Z"), message("a3"),
    ] },
  ]);
  assert.deepEqual(result.map((row) => row.id), ["q1", "a1", "q2", "a2", "q3", "a3"]);
});
