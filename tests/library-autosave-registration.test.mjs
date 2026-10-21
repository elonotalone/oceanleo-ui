import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { workspaceSnapshotFailureRetryable } from "../src/shell/workspace-session-model.ts";
import { AdvancedPersistenceController } from "../src/shell/advanced-persistence-controller.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
let workspace;
let stored;
let status;
const writes = [];
globalThis.__librarySessionRequest = async (_id, patch) => {
  writes.push(structuredClone(patch));
  const nextStatus = Array.isArray(status) ? status.shift() : status;
  if (nextStatus !== 200) return { ok: false, status: nextStatus, error: "temporary gateway failure" };
  assert.equal(patch.revision, stored.revision);
  stored = { ...stored, snapshot: patch.snapshot, revision: stored.revision + 1 };
  return { ok: true, data: structuredClone(stored) };
};
const providerUrl = await compileModule("src/shell/WorkspaceSession.tsx", {
  "../lib/app-session": dataModule(`
    export async function updateAppSession(...args) { return globalThis.__librarySessionRequest(...args); }
    export async function getAppSession() {
      return globalThis.__libraryReadFailure || {ok:true, data:globalThis.__libraryStored()};
    }
    export async function listAppSessions() { return {ok:true, data:{items:[]}}; }
    export async function ensureAppSession() { throw new Error("must reuse the task session"); }
    export async function archiveAppSession() {}
    export async function deleteAppSession() {}
  `),
  "../lib/console-draft": dataModule(`
    export async function loadConsoleDraft() { return null; }
    export async function saveConsoleDraft() { throw new Error("must not defer a committed output"); }
    export async function clearConsoleDraft() {}
  `),
  "./workspace-session-task": dataModule("export async function findLinkedAgentTaskId() {}"),
});
const { WorkspaceSessionProvider, useOptionalWorkspaceSession } = await import(providerUrl);
function Probe() { workspace = useOptionalWorkspaceSession(); return null; }
async function mount() {
  globalThis.__libraryReadFailure = null;
  writes.length = 0;
  stored = { id: "library-session", site_id: "library", app_id: "library", surface: "app",
    title: "Task", status: "active", revision: 7, schema_version: 1,
    snapshot: { taskContext: "preserve" }, created_at: "2026-10-21", last_activity_at: "2026-10-21" };
  globalThis.__libraryStored = () => structuredClone(stored);
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(React.createElement(WorkspaceSessionProvider,
    { siteId: "library", appId: "library", initialSession: stored, resumeLatest: false },
    React.createElement(Probe))));
  return async () => { await act(async () => root.unmount()); node.remove(); };
}

test("transport outages retain status and retry only session registration of the same committed revision", async () => {
  const unmount = await mount();
  let uploads = 0;
  let registrations = 0;
  const committed = { artifactId: "artifact-a", revisionId: "revision-2" };
  status = 0;
  const controller = new AdvancedPersistenceController({
    itemKey: "artifact-a", debounceMs: 0, retryDelays: [1], maxRetries: 1,
    flushRevision: async () => { uploads++; return { ok: true, item: committed }; },
    recordSavedItem: async item => {
      registrations++;
      assert.equal(item, committed);
      const merge = latest => ({ ...latest, editor: item });
      const result = await workspace.saveSnapshot(merge(workspace.session.snapshot), 1,
        { expectedSessionId: "library-session", mergeFromLatest: merge });
      if (!result.ok) {
        assert.equal(result.status, 0);
        assert.equal(workspaceSnapshotFailureRetryable(result), true);
        status = 200;
        return false;
      }
      return true;
    },
  });
  try {
    let result;
    await act(async () => { controller.observe({ revision: 2, dirty: true }); result = await controller.flushLatest(); });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, true);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    assert.equal(controller.hasUnconfirmedWork(), false);
    assert.equal(uploads, 1);
    assert.equal(registrations, 2);
    assert.equal(writes.length, 2);
    assert.equal(stored.snapshot.taskContext, "preserve");
    assert.equal(stored.snapshot.editor.revisionId, "revision-2");
    assert.equal(stored.revision, 8);
  } finally { controller.dispose(); await unmount(); }
});

test("session HTTP failures remain visible and keep their retry classification", async () => {
  const unmount = await mount();
  try {
    for (const code of [0, 408, 429, 500, 502, 503, 400, 401, 403, 404, 501]) {
      status = code;
      let result;
      await act(async () => { result = await workspace.saveSnapshot({ edit: code }, 1,
        { expectedSessionId: stored.id }); });
      assert.equal(result.ok, false);
      assert.equal(result.status, code);
      assert.equal(result.error, "temporary gateway failure");
      assert.equal(workspaceSnapshotFailureRetryable(result), [0, 408, 429, 500, 502, 503].includes(code));
    }
    for (const refusal of [{ stale: true }, { readOnly: true }, { conflict: { latest: stored } }]) {
      assert.equal(workspaceSnapshotFailureRetryable({ ok: false, status: 503, ...refusal }), false);
    }
    assert.equal(stored.revision, 7, "refused writes must not acknowledge a revision");
  } finally { await unmount(); }
});

test("a temporary failure during CAS merge remains retryable without latching a conflict", async () => {
  const unmount = await mount();
  try {
    status = [409, 503, 200];
    const merge = latest => ({ ...latest, editor: { revisionId: "revision-3" } });
    const options = { expectedSessionId: stored.id, mergeFromLatest: merge };
    let result;
    await act(async () => { result = await workspace.saveSnapshot(merge(stored.snapshot), 1, options); });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(workspaceSnapshotFailureRetryable(result), true);
    assert.equal(workspace.conflict, null);
    await act(async () => { result = await workspace.saveSnapshot(merge(stored.snapshot), 1, options); });
    assert.equal(result.ok, true);
    assert.equal(stored.snapshot.taskContext, "preserve");
    assert.equal(stored.snapshot.editor.revisionId, "revision-3");
    assert.equal(writes.length, 3);
  } finally { await unmount(); }
});

test("a failed conflict refresh keeps the transport failure instead of reporting permanent CAS rejection", async () => {
  const unmount = await mount();
  try {
    status = 409;
    globalThis.__libraryReadFailure = { ok: false, status: 0, error: "network offline" };
    let result;
    await act(async () => { result = await workspace.saveSnapshot({ editor: "changed" }, 1,
      { expectedSessionId: stored.id, mergeFromLatest: latest => ({ ...latest, editor: "changed" }) }); });
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.equal(result.error, "network offline");
    assert.equal(workspaceSnapshotFailureRetryable(result), true);
    assert.equal(workspace.conflict, null);
  } finally { await unmount(); }
});
