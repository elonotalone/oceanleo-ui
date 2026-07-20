import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createCloudBrowserLifecycleClient,
  createCloudBrowserOperationId,
  validateCloudBrowserSessionFence,
} from "../src/lib/browser.ts";

function activeSession(overrides = {}) {
  return {
    id: "session-1",
    session_version: 21,
    runtime_id: "runtime-1",
    incarnation: 4,
    protocol_version: 3,
    runtime_version: "chrome-window-r42",
    stream_id: "stream-1",
    stream_generation: 8,
    window_id: "window-1",
    snapshot_generation: 6,
    binary_frames: true,
    status: "active",
    created_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function lifecycleHarness(freshSession, mutationData = {}) {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    if (!init) {
      return { ok: true, data: { session: freshSession } };
    }
    return { ok: true, data: mutationData };
  };
  return {
    calls,
    client: createCloudBrowserLifecycleClient(request),
  };
}

function parsedBody(call) {
  assert.equal(typeof call.init?.body, "string");
  return JSON.parse(call.init.body);
}

test("live ticket fetches a fresh active fence and posts exact v3 JSON", async () => {
  const { client, calls } = lifecycleHarness(
    activeSession({ protocol_version: 2 }),
  );
  const result = await client.createTicket("session-1");

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    path: "/v1/browser/sessions/session-1",
    init: undefined,
  });
  assert.equal(
    calls[1].path,
    "/v1/browser/sessions/session-1/live-ticket",
  );
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(parsedBody(calls[1]), {
    protocol_version: 3,
    expected_session_version: 21,
    runtime_id: "runtime-1",
    incarnation: 4,
  });
});

test("resume and hibernate use exact fenced lifecycle bodies", async () => {
  const resumeHarness = lifecycleHarness(activeSession());
  await resumeHarness.client.resume("session-1", {
    operationId: "resume-operation-1",
  });
  assert.equal(resumeHarness.calls.length, 2);
  assert.equal(
    resumeHarness.calls[1].path,
    "/v1/browser/sessions/session-1/resume",
  );
  assert.equal(resumeHarness.calls[1].init.method, "POST");
  assert.deepEqual(parsedBody(resumeHarness.calls[1]), {
    expected_session_version: 21,
    runtime_id: "runtime-1",
    incarnation: 4,
    operation_id: "resume-operation-1",
    initial_url: "",
  });

  const hibernateHarness = lifecycleHarness(activeSession());
  await hibernateHarness.client.hibernate(
    "session-1",
    "hibernate-operation-1",
  );
  assert.equal(hibernateHarness.calls.length, 2);
  assert.equal(
    hibernateHarness.calls[1].path,
    "/v1/browser/sessions/session-1/hibernate",
  );
  assert.equal(hibernateHarness.calls[1].init.method, "POST");
  assert.deepEqual(parsedBody(hibernateHarness.calls[1]), {
    expected_session_version: 21,
    runtime_id: "runtime-1",
    incarnation: 4,
    operation_id: "hibernate-operation-1",
  });
});

test("checkpoint restore resumes with fresh current CAS and snapshot generation", async () => {
  const current = activeSession({
    session_version: 22,
    runtime_id: "",
    incarnation: 4,
    status: "hibernated",
  });
  const { client, calls } = lifecycleHarness(current);
  await client.restoreCheckpoint(
    "session-1",
    {
      generation: 9,
      session_version: 3,
      runtime_version: "obsolete-runtime",
    },
    "restore-operation-1",
  );

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1].path,
    "/v1/browser/sessions/session-1/resume",
  );
  assert.deepEqual(parsedBody(calls[1]), {
    expected_session_version: 22,
    runtime_id: "",
    incarnation: 4,
    operation_id: "restore-operation-1",
    snapshot_generation: 9,
    initial_url: "",
  });
});

test("delete fetches a fresh fence and uses exact query parameters", async () => {
  const { client, calls } = lifecycleHarness(
    activeSession({
      session_version: 23,
      runtime_id: "",
      incarnation: 5,
      status: "hibernated",
    }),
  );
  await client.remove("session-1");

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1].path,
    "/v1/browser/sessions/session-1?expected_session_version=23&runtime_id=&incarnation=5",
  );
  assert.deepEqual(calls[1].init, { method: "DELETE" });
  assert.equal(calls[1].init.body, undefined);
});

test("missing, stale, or incoherent fences fail before mutation", async () => {
  const invalidIdHarness = lifecycleHarness(activeSession());
  const invalidId = await invalidIdHarness.client.createTicket("");
  assert.equal(invalidId.ok, false);
  assert.equal(invalidIdHarness.calls.length, 0);

  for (const invalid of [
    activeSession({ session_version: undefined }),
    activeSession({ session_version: 0 }),
    activeSession({ runtime_id: "", incarnation: 4 }),
    activeSession({ runtime_id: "runtime-1", incarnation: 0 }),
    activeSession({ protocol_version: 1 }),
    activeSession({ binary_frames: false }),
    activeSession({ id: "other-session" }),
  ]) {
    const { client, calls } = lifecycleHarness(invalid);
    const result = await client.createTicket("session-1");
    assert.equal(result.ok, false);
    assert.equal(calls.length, 1);
  }

  const absent = activeSession({
    runtime_id: "",
    incarnation: 0,
    status: "hibernated",
  });
  const hibernateHarness = lifecycleHarness(absent);
  const hibernate = await hibernateHarness.client.hibernate("session-1");
  assert.equal(hibernate.ok, false);
  assert.equal(hibernateHarness.calls.length, 1);

  const invalidSnapshotHarness = lifecycleHarness(absent);
  const invalidSnapshot =
    await invalidSnapshotHarness.client.restoreCheckpoint(
      "session-1",
      { generation: 0 },
    );
  assert.equal(invalidSnapshot.ok, false);
  assert.equal(invalidSnapshotHarness.calls.length, 0);

  const invalidOperationHarness = lifecycleHarness(absent);
  const invalidOperation = await invalidOperationHarness.client.resume(
    "session-1",
    { operationId: "contains whitespace" },
  );
  assert.equal(invalidOperation.ok, false);
  assert.equal(invalidOperationHarness.calls.length, 0);
});

test("fresh-session errors retain AgentApiResult status and no mutation follows", async () => {
  const calls = [];
  const client = createCloudBrowserLifecycleClient(
    async (path, init) => {
      calls.push({ path, init });
      return { ok: false, error: "stale session", status: 409 };
    },
  );
  const result = await client.resume("session-1", {
    operationId: "resume-operation-2",
  });
  assert.deepEqual(result, {
    ok: false,
    error: "stale session",
    status: 409,
  });
  assert.equal(calls.length, 1);
});

test("session projection accepts upgrade-safe v2 state but rejects v1", () => {
  assert.ok(
    validateCloudBrowserSessionFence(
      activeSession(),
      "session-1",
      "active",
    ),
  );
  assert.ok(
    validateCloudBrowserSessionFence(
      activeSession({ protocol_version: 2 }),
      "session-1",
      "active",
    ),
  );
  assert.equal(
    validateCloudBrowserSessionFence(
      activeSession({ protocol_version: 1 }),
      "session-1",
      "active",
    ),
    null,
  );
  assert.equal(
    validateCloudBrowserSessionFence(
      activeSession({ stream_generation: -1 }),
      "session-1",
    ),
    null,
  );
  const operationId = createCloudBrowserOperationId();
  assert.match(operationId, /^[A-Za-z0-9._:-]+$/);
  assert.ok(operationId.length <= 160);

  const source = readFileSync(
    new URL("../src/lib/browser.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /checkpoints\/.*\/restore/);
  assert.doesNotMatch(
    source,
    /live-ticket`,\s*\{\s*method:\s*"POST"\s*\}/,
  );
});
