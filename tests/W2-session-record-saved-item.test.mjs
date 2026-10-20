import assert from "node:assert/strict";
import test from "node:test";

import { saveOwnedWorkspaceSnapshot } from "../src/shell/advanced-session.ts";

test("W2: record-saved-item does not retry a CAS conflict into another session", async () => {
  const calls = [];
  const latest = {
    id: "session-2",
    snapshot: { kind: "advanced_content", note: "newer-head" },
    schema_version: 2,
  };
  const result = await saveOwnedWorkspaceSnapshot({
    saveSnapshot: async (snapshot, schemaVersion, options) => {
      calls.push({ snapshot, schemaVersion, options });
      return {
        ok: false,
        session: latest,
        conflict: { latest },
        error: "revision conflict requires explicit resolution",
      };
    },
    snapshot: { kind: "advanced_content", note: "committed" },
    schemaVersion: 2,
    expectedSessionId: "session-1",
    title: "清单",
    mergeFromLatest: (current) => ({
      ...(current && typeof current === "object" ? current : {}),
      note: "merged-commit",
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.expectedSessionId, "session-1");
  assert.equal(typeof calls[0].options.mergeFromLatest, "function");
});

test("W2: a non-conflict snapshot refusal is not turned into success", async () => {
  const result = await saveOwnedWorkspaceSnapshot({
    saveSnapshot: async () => ({
      ok: false,
      error: "workspace snapshot rejected",
    }),
    snapshot: { kind: "advanced_content" },
    schemaVersion: 2,
    expectedSessionId: "session-1",
    mergeFromLatest: (current) =>
      current && typeof current === "object" && !Array.isArray(current)
        ? { ...current }
        : {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "workspace snapshot rejected");
});
