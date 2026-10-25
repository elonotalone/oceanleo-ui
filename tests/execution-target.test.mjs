import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const target = await import(await compileModule("src/lib/execution-target.ts"));
const transport = await import(await compileModule("src/lib/agent.ts", {
  "./auth/client": dataModule(`
    export async function getUserId() { return globalThis.__executionOwner; }
    export async function accessToken() { return "test-access"; }
    export function cachedAccessToken() { return "test-access"; }
  `),
  "./auth/config": dataModule('export const GATEWAY_BASE = "https://api.dev.oceanleo.com";'),
  "./history-events": dataModule("export function notifyHistoryChanged() {}"),
}));

function environment() {
  const saved = { window: globalThis.window, fetch: globalThis.fetch };
  const values = new Map();
  const scope = new EventTarget();
  scope.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  globalThis.window = scope;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ task_id: "test-task", status: "running" }), { status: 200 });
  };
  globalThis.__executionOwner = "alice";
  return { calls, values, cleanup() { Object.assign(globalThis, saved); delete globalThis.__executionOwner; } };
}

test("execution target is validated and stored separately for each signed-in account", () => {
  const env = environment();
  try {
    const choice = { kind: "device", id: "my-mac", name: "My Mac" };
    target.writeExecutionTarget("alice", choice);
    assert.deepEqual(target.readExecutionTarget("alice"), choice);
    assert.deepEqual(target.readExecutionTarget("bob"), { kind: "cloud" });
    assert.deepEqual(target.readExecutionTarget(null), { kind: "cloud" });
    assert.equal(target.normalizeExecutionTarget({ kind: "device", id: "../escape", name: "bad" }), null);
    env.values.set("oceanleo.execution-target.v1:alice", "invalid json");
    assert.deepEqual(target.readExecutionTarget("alice"), { kind: "cloud" });
  } finally { env.cleanup(); }
});

test("actual task HTTP body uses local selection and does not inherit another account or stale cloud mount", async () => {
  const env = environment();
  try {
    env.values.set("oceanleo.cc.mounted", "stale-cloud");
    target.writeExecutionTarget("alice", { kind: "device", id: "my-mac", name: "My Mac" });
    await transport.createTask({ prompt: "list my files" });
    assert.deepEqual(env.calls[0].execution_target, { kind: "device", id: "my-mac" });
    assert.equal(env.calls[0].computer_id, "");
    globalThis.__executionOwner = "bob";
    await transport.createTask({ prompt: "new task" });
    assert.deepEqual(env.calls[1].execution_target, { kind: "cloud" });
    assert.equal(env.calls[1].computer_id, "");
  } finally { env.cleanup(); }
});

test("explicit submit snapshot wins over later persisted selection; cloud computer carries its id", async () => {
  const env = environment();
  try {
    const snapshot = { kind: "device", id: "my-mac", name: "My Mac" };
    target.writeExecutionTarget("alice", { kind: "cloud" });
    await transport.createTask({ prompt: "local", executionTarget: snapshot });
    assert.deepEqual(env.calls[0].execution_target, { kind: "device", id: "my-mac" });
    await transport.createTask({ prompt: "cloud", executionTarget: { kind: "computer", id: "cc_123", name: "Cloud box" } });
    assert.deepEqual(env.calls[1].execution_target, { kind: "computer", id: "cc_123" });
    assert.equal(env.calls[1].computer_id, "cc_123");
  } finally { env.cleanup(); }
});

test("follow-up HTTP body leaves existing task binding alone despite changed global preference", async () => {
  const env = environment();
  try {
    env.values.set("oceanleo.cc.mounted", "unrelated-cloud");
    target.writeExecutionTarget("alice", { kind: "device", id: "another-mac", name: "Other Mac" });
    await transport.followUp("existing-task", "continue");
    assert.equal(Object.hasOwn(env.calls[0], "computer_id"), false);
    assert.equal(Object.hasOwn(env.calls[0], "execution_target"), false);
  } finally { env.cleanup(); }
});
