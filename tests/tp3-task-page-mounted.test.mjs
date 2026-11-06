import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";

// The existing harness mounts the real AgentChat and stubs only network/native I/O.
// Importing it also exposes the same mount seam used by the task-page behavior tests.
await import("./agent-chat-conversations.test.mjs");
const { mount, settle, computerTask, session } = globalThis.__agentChatHarness;

const fixturePath = "/root/.cache/tpp-fixtures/frames-all.json";
const fixtureRows = JSON.parse(readFileSync(fixturePath, "utf8"));
const entriesFromFixture = fixtureRows.map((row) => ({
  cursor: `fixture:${row.seq}`,
  source: "native",
  program: row.frame?.program || "claude",
  session_id: row.frame?.acp_session || "fixture-session",
  created_at: row.created_at,
  frame: { ...row.frame, seq: row.seq },
  no_from: row.no_from,
  no_to: row.no_to,
}));

const state = {
  status: "idle",
  program: "claude",
  session_id: "fixture-session",
  since: null,
  last_output_at: null,
  request: null,
  queued: [],
  reason: null,
  pending_stop: false,
  computer: { id: "cc_elon", online: true },
};

function ownBubbles(view) {
  return [...view.host.querySelectorAll('[data-testid="task-user-bubble"]')]
    .map((node) => node.textContent?.trim() || "");
}

function composer(view) {
  return view.host.querySelector('[data-leo-composer="cloud"]');
}

test("mounted task page keeps both sent bubbles in order", async () => {
  globalThis.__timelinePage = {
    task_id: "t-send-order",
    entries: [],
    has_older: false,
    next_before: null,
    state,
    sessions: [],
  };
  const task = computerTask();
  task.task.id = "t-send-order";
  const view = await mount({ taskId: "t-send-order" }, {
    task,
    sessions: [session("cts_codex", "acp", "codex", "2026-11-06T11:00:00Z")],
    url: "/tasks/t-send-order",
  });
  try {
    const input = composer(view);
    await actSubmit(input, "hi");
    await actSubmit(input, "你是谁");
    const bubbles = ownBubbles(view);
    assert.deepEqual(bubbles.slice(-2), ["hi", "你是谁"]);
    const posts = globalThis.__taskTimelineCalls
      .filter((call) => call.method === "POST" && call.path.endsWith("/messages"));
    assert.deepEqual(posts.map((call) => call.body.text), ["hi", "你是谁"]);
  } finally {
    await view.unmount();
  }
});

async function actSubmit(input, text) {
  const { act } = await import("react");
  await act(async () => { input.__props.onChange(text); });
  await act(async () => { input.__props.onSubmit(text); });
  await settle();
}

test("mounted long task renders the complete 1,892-frame timeline without replacing its first user rows", async () => {
  assert.equal(fixtureRows.length, 1892, "the frozen task fixture must contain 1,892 frames");
  globalThis.__timelinePage = {
    task_id: "t-long-fixture",
    entries: entriesFromFixture,
    has_older: false,
    next_before: null,
    state,
    sessions: [],
  };
  const task = computerTask();
  task.task.id = "t-long-fixture";
  const started = performance.now();
  const view = await mount({ taskId: "t-long-fixture" }, {
    task,
    sessions: [session("fixture-session", "acp", "claude", "2026-11-06T11:00:00Z")],
    url: "/tasks/t-long-fixture",
  });
  const elapsed = performance.now() - started;
  try {
    assert.ok(view.host.querySelector('[data-agent-stream="cloud"]'));
    const bubbles = ownBubbles(view);
    assert.deepEqual(bubbles.slice(0, 2), ["hi", "你是谁"]);
    assert.ok(bubbles.length >= 4, `expected the fixture's user turns to mount, got ${bubbles.length}`);
    assert.ok(view.host.querySelectorAll('[data-testid="task-user-bubble"]').length > 0);
    // A mounted render must stay bounded; this catches accidental per-frame DOM duplication.
    assert.ok(view.host.querySelectorAll('[data-testid="task-user-bubble"]').length < fixtureRows.length);
    assert.ok(elapsed < 5000, `mounting the frozen timeline took ${elapsed.toFixed(1)} ms`);
  } finally {
    await view.unmount();
  }
});
