import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { setCacheUser, clearUserScopedCaches } from "../src/lib/user-scoped-cache.ts";
import { putPending, readPending, forgetPending, settlePending, pendingForMessage, markPendingRetry } from "../src/shell/acp-task/pending-send.ts";
import { reliableRequest, ACP_SEND_DEADLINE_MS, ACP_CREATE_DEADLINE_MS } from "../src/shell/acp-task/reliable-request.ts";

class Storage {
  data = new Map();
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
}
const storage = new Storage();
const win = new EventTarget();
win.localStorage = storage;
globalThis.window = win;
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
const input = (overrides = {}) => ({ clientMessageId: crypto.randomUUID(), computerId: "cc_test", program: "claude", text: "Please keep this message", attachments: [], choice: { model: "opus" }, taskId: "task-1", ...overrides });
const keys = () => [...storage.data.keys()].filter((key) => key.includes("acp-outbox:"));
const pending = (overrides = {}) => { const value = input(overrides); return { value, id: putPending(value) }; };
const run = (value, fn, options = {}) => reliableRequest("send:test", value.clientMessageId, fn, { timeoutMs: ACP_SEND_DEADLINE_MS, ...options });
test.beforeEach(async () => { clearUserScopedCaches(); storage.data.clear(); setCacheUser("user-1"); await flush(); });
test.afterEach(() => clearUserScopedCaches());

test("POST silence has a deadline, retries twice with one identity, then keeps the failed message", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { value, id } = pending();
  let calls = 0;
  const signals = [];
  const request = run(value, (signal) => { calls++; signals.push(signal); assert.equal(keys().length, 1); return new Promise(() => {}); });
  const failure = assert.rejects(request, /超时/);
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(calls, attempt + 1);
    t.mock.timers.tick(ACP_SEND_DEADLINE_MS);
    await flush();
    if (attempt < 2) assert.equal(readPending(id).status, "retrying");
  }
  await failure;
  assert.equal(calls, 3);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.equal(readPending(id).status, "failed");
  assert.equal(readPending(id).text, value.text);
  assert.equal(keys().length, 1);
});

test("a network failure retries immediately; explicit 4xx refusals do not", async () => {
  const { value } = pending();
  let calls = 0;
  const result = await run(value, async () => { if (++calls === 1) throw Object.assign(new Error("network"), { status: 0 }); return { duplicate: true }; });
  assert.equal(calls, 2);
  assert.equal(result.duplicate, true);
  const other = pending();
  let refusals = 0;
  await assert.rejects(run(other.value, async () => { refusals++; throw Object.assign(new Error("refused"), { status: 409 }); }), /refused/);
  assert.equal(refusals, 1);
});

test("a stream row during a retry ends the request and no late failure recreates its bubble", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { value, id } = pending();
  let calls = 0;
  let rejectLate;
  const request = run(value, async () => { calls++; return new Promise((_, reject) => { rejectLate = reject; }); }, { receipt: (rowId) => ({ row_id: rowId, duplicate: true }) });
  t.mock.timers.tick(ACP_SEND_DEADLINE_MS);
  await flush();
  assert.equal(calls, 2);
  forgetPending(id);
  assert.equal((await request).duplicate, true);
  rejectLate(new Error("late network failure"));
  await flush();
  settlePending(id, { error: new Error("late") });
  assert.equal(readPending(id), null);
  assert.equal(keys().length, 0);
  t.mock.timers.tick(ACP_SEND_DEADLINE_MS * 5);
  assert.equal(calls, 2);
});

test("duplicate or row-id receipt removes disk outbox; repeated caller settlement cannot resurrect it", async () => {
  const api = await import(await compileModule("src/lib/acp-frames-api.ts", {
    "./auth/client": dataModule("export async function accessToken(){return 'test-token';}"),
    "./auth/config": dataModule("export function gatewayBase(){return 'https://gateway.test';}"),
  }));
  const { value, id } = pending();
  const bodies = [];
  globalThis.fetch = async (_, init) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ duplicate: true }), { status: 200 }); };
  const result = await api.send("task-1", { client_message_id: value.clientMessageId, text: value.text });
  assert.equal(result.duplicate, true);
  assert.equal(bodies[0].client_message_id, value.clientMessageId);
  assert.equal(keys().length, 0);
  settlePending(id, { taskId: "task-1", rowId: null, queued: false });
  assert.equal(keys().length, 0);
  assert.equal(readPending(id).status, "accepted");
  const next = pending();
  settlePending(next.id, { taskId: "task-1", rowId: 12 });
  assert.equal(keys().length, 0);
});

test("reload restores task sends, choices and attachment references, but never URLs or error payloads", async () => {
  const { value, id } = pending({ projectId: "project-1", attachments: [{ artifact_id: "artifact-1", revision_id: "revision-1", name: "photo.jpg", mime: "image/jpeg", url: "https://private.invalid/?token=secret" }] });
  markPendingRetry(value.clientMessageId);
  const disk = storage.data.get(keys()[0]);
  assert.equal(disk.includes("secret"), false);
  // A fresh module has empty memory and the same confirmed user + local storage.
  const fresh = await import(new URL("../src/shell/acp-task/pending-send.ts?reload=" + crypto.randomUUID(), import.meta.url));
  const restored = fresh.readPending(id);
  assert.ok(restored);
  assert.equal(restored.restored, true);
  assert.equal(restored.status, "sending");
  assert.equal(restored.taskId, value.taskId);
  assert.equal(restored.clientMessageId, value.clientMessageId);
  assert.deepEqual(restored.choice, value.choice);
  assert.equal(restored.projectId, "project-1");
  assert.equal(restored.attachments[0].artifact_id, "artifact-1");
  assert.equal(restored.attachments[0].url, "");
});

test("a home message whose task never existed restores as failed with its text", async () => {
  const { value, id } = pending({ taskId: null });
  const fresh = await import(new URL("../src/shell/acp-task/pending-send.ts?reload=" + crypto.randomUUID(), import.meta.url));
  assert.equal(fresh.readPending(id).status, "failed");
  assert.equal(fresh.readPending(id).text, value.text);
});

test("sign-out cancels a hung send, clears disk and memory and prevents retry under another user", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { value, id } = pending();
  let calls = 0;
  const request = run(value, () => { calls++; return new Promise(() => {}); });
  const failure = assert.rejects(request, /Aborted/);
  setCacheUser(null);
  await failure;
  assert.equal(keys().length, 0);
  assert.equal(readPending(id), null);
  setCacheUser("user-2");
  assert.equal(pendingForMessage(value.clientMessageId), null);
  t.mock.timers.tick(ACP_SEND_DEADLINE_MS * 5);
  assert.equal(calls, 1);
});

test("two callers in a tab share one request; two tabs keep one gateway message through its id", async () => {
  const { value } = pending();
  let finish;
  let calls = 0;
  const fn = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const first = run(value, fn);
  const second = run(value, fn);
  assert.equal(first, second);
  assert.equal(calls, 1);
  finish({ duplicate: true });
  await first;
  const fresh = await import(new URL("../src/shell/acp-task/reliable-request.ts?tab=" + crypto.randomUUID(), import.meta.url));
  const rows = new Set();
  const gateway = async () => { const duplicate = rows.has(value.clientMessageId); rows.add(value.clientMessageId); return { duplicate }; };
  const results = await Promise.all([run(value, gateway), fresh.reliableRequest("send:test", value.clientMessageId, gateway, { timeoutMs: ACP_SEND_DEADLINE_MS })]);
  assert.equal(rows.size, 1);
  assert.ok(results.some((result) => result.duplicate));
});

test("task creation has its own deadline and retries the same request_id", async (t) => {
  const api = await import(await compileModule("src/lib/computer-task-api.ts", {
    "./cloud-computer-api": dataModule(`export async function cloudComputerRequest(path, init) { return globalThis.__createTest(path, init); }`),
  }));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { value, id } = pending({ taskId: null });
  const ids = [];
  globalThis.__createTest = async (_, init) => {
    ids.push(JSON.parse(init.body).request_id);
    if (ids.length === 1) return new Promise(() => {});
    return { task_id: "created-task", session: { id: "session-1", task_id: "created-task" } };
  };
  const create = api.createComputerTaskSession(value.computerId, { kind: "acp", program: "claude", request_id: value.clientMessageId });
  t.mock.timers.tick(ACP_CREATE_DEADLINE_MS);
  await flush();
  assert.equal((await create).task_id, "created-task");
  assert.deepEqual(ids, [value.clientMessageId, value.clientMessageId]);
  assert.equal(readPending(id).taskId, "created-task");
});

test("storage refusal leaves the text and makes no request", async () => {
  const { value, id } = pending();
  const original = storage.setItem;
  storage.removeItem(keys()[0]);
  storage.setItem = () => { throw new Error("quota"); };
  try {
    let calls = 0;
    await assert.rejects(run(value, async () => { calls++; }), /无法保留/);
    assert.equal(calls, 0);
    assert.equal(readPending(id).status, "failed");
    assert.equal(readPending(id).text, value.text);
  } finally { storage.setItem = original; }
});


test("locally held messages restore as held, retaining order, attachments and choices", async () => {
  const one = pending({ held: true, text: "first", attachments: [{ name: "a.txt", artifact_id: "a", url: "signed" }] });
  const two = pending({ held: true, text: "second" });
  assert.equal(readPending(one.id).status, "held");
  assert.equal(readPending(two.id).status, "held");
  const fresh = await import(new URL("../src/shell/acp-task/pending-send.ts?held=" + crypto.randomUUID(), import.meta.url));
  assert.equal(fresh.readPending(one.id).status, "held");
  assert.equal(fresh.readPending(two.id).status, "held");
  assert.equal(fresh.readPending(one.id).attachments[0].artifact_id, "a");
  assert.equal(fresh.readPending(one.id).attachments[0].url, "");
  assert.deepEqual(fresh.readPending(one.id).choice, { model: "opus" });
});
