/**
 * W2-r2: outer snapshot retry must not adopt another session, and concurrent
 * same-session fields must survive merge. These fail against the first-round
 * helper (d97ef932), which retried stale onto first.session.id and ignored
 * latest on the dedicated merge.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVANCED_SESSION_KIND,
  INLINE_EDITOR_HISTORY_KEY,
  mergeAdvancedSessionSnapshot,
  saveOwnedWorkspaceSnapshot,
  withInlineEditorHistoryHead,
} from "../src/shell/advanced-session.ts";

function documentItem() {
  return {
    key: "creation:doc-1",
    source: "creation",
    id: "doc-1",
    title: "清单.docx",
    kind: "document",
    siteId: "word",
    url: "https://files.test/list.docx",
    favorite: false,
    meta: { format: "docx" },
  };
}

function countingSave(handler) {
  const calls = [];
  return {
    calls,
    saveSnapshot: async (snapshot, schemaVersion, options) => {
      calls.push({ snapshot, schemaVersion, options });
      return handler({ snapshot, schemaVersion, options, calls });
    },
  };
}

test("W2-r2: a stale old-session response never writes into the new session", async () => {
  const save = countingSave(async () => ({
    ok: false,
    stale: true,
    session: {
      id: "session-new",
      snapshot: { hijack: true },
      schema_version: 2,
    },
    error: "保存属于已经离开的工作会话。",
  }));
  const result = await saveOwnedWorkspaceSnapshot({
    saveSnapshot: save.saveSnapshot,
    snapshot: { kind: ADVANCED_SESSION_KIND, note: "old-doc" },
    schemaVersion: 2,
    expectedSessionId: "session-old",
    title: "清单",
    mergeFromLatest: (latest) => ({
      ...(latest && typeof latest === "object" ? latest : {}),
      note: "must-not-land",
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
  assert.equal(save.calls.length, 1, "r1 retried stale onto first.session.id");
  assert.equal(save.calls[0].options.expectedSessionId, "session-old");
  assert.equal(
    save.calls.some((call) => call.options.expectedSessionId === "session-new"),
    false,
  );
});

test("W2-r2: conflict.latest from another session is never adopted", async () => {
  const other = {
    id: "session-other",
    snapshot: { kind: ADVANCED_SESSION_KIND, note: "newer-head" },
    schema_version: 2,
  };
  const save = countingSave(async () => ({
    ok: false,
    session: other,
    conflict: { latest: other },
    error: "revision conflict requires explicit resolution",
  }));
  const result = await saveOwnedWorkspaceSnapshot({
    saveSnapshot: save.saveSnapshot,
    snapshot: { kind: ADVANCED_SESSION_KIND, note: "committed" },
    schemaVersion: 2,
    expectedSessionId: "session-1",
    title: "清单",
    mergeFromLatest: (latest) => ({
      ...(latest && typeof latest === "object" ? latest : {}),
      note: "merged-commit",
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(save.calls.length, 1, "r1 adopted session-other as expectedSessionId");
  assert.equal(save.calls[0].options.expectedSessionId, "session-1");
  assert.equal(
    save.calls.some((call) => call.options.expectedSessionId === "session-other"),
    false,
  );
});

test("W2-r2: a read-only snapshot refusal is not retried", async () => {
  const save = countingSave(async () => ({
    ok: false,
    readOnly: true,
    session: { id: "session-1" },
    error: "当前路由不能编辑这份已保存任务。",
  }));
  const result = await saveOwnedWorkspaceSnapshot({
    saveSnapshot: save.saveSnapshot,
    snapshot: { kind: ADVANCED_SESSION_KIND },
    schemaVersion: 2,
    expectedSessionId: "session-1",
    mergeFromLatest: (latest) => ({
      ...(latest && typeof latest === "object" ? latest : {}),
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.readOnly, true);
  assert.equal(save.calls.length, 1);
});

test("W2-r2: same-session conflict is not given a second outer write", async () => {
  const latest = {
    id: "session-1",
    snapshot: { note: "server" },
    schema_version: 2,
  };
  const save = countingSave(async () => ({
    ok: false,
    session: latest,
    conflict: { latest },
    error: "revision conflict",
  }));
  const result = await saveOwnedWorkspaceSnapshot({
    saveSnapshot: save.saveSnapshot,
    snapshot: { kind: ADVANCED_SESSION_KIND, note: "local" },
    schemaVersion: 2,
    expectedSessionId: "session-1",
    mergeFromLatest: (current) => ({
      ...(current && typeof current === "object" ? current : {}),
      note: "merged",
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(save.calls.length, 1, "WorkspaceSession already retried same-session 409");
  assert.equal(typeof save.calls[0].options.mergeFromLatest, "function");
});

test("W2-r2: concurrent same-session snapshot fields survive dedicated merge", () => {
  const latest = {
    agent_notes: "keep-me",
    other_head: { id: "unrelated" },
    kind: "something_else",
  };
  const merged = mergeAdvancedSessionSnapshot(
    latest,
    documentItem(),
    "richdoc",
    "task-1",
  );
  assert.equal(merged.agent_notes, "keep-me");
  assert.deepEqual(merged.other_head, { id: "unrelated" });
  assert.equal(merged.kind, ADVANCED_SESSION_KIND);
  assert.equal(merged.editor_route, "richdoc");
  assert.equal(merged.item.id, "doc-1");
});

test("W2-r2: concurrent same-session snapshot fields survive embedded history merge", () => {
  const latest = {
    agent_notes: "keep-me",
    other_head: { id: "unrelated" },
  };
  const merged = withInlineEditorHistoryHead(
    latest,
    documentItem(),
    "richdoc",
    "task-1",
  );
  assert.equal(merged.agent_notes, "keep-me");
  assert.deepEqual(merged.other_head, { id: "unrelated" });
  assert.equal(typeof merged[INLINE_EDITOR_HISTORY_KEY], "object");
  assert.equal(merged[INLINE_EDITOR_HISTORY_KEY].latestRootId, "doc-1");
});
