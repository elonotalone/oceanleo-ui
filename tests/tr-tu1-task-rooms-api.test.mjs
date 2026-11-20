// TU1 (task rooms wave 2026-11-20): the typed client for the task-room routes. Every route goes to the
// path and method of contract §2.2; "not there yet" (503 task_rooms_unavailable, or an older gateway's
// bare 404) is one typed answer the UI shows as "not available yet", never an exception.
import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const api = await import(await compileModule("src/lib/task-rooms-api.ts", {
  "./auth/config": dataModule("export const GATEWAY_BASE='https://gateway.test';"),
  "./auth/client": dataModule("export async function accessToken(){return 't';}"),
}));

function recording(answer = { status: 200, body: { ok: 1 } }) {
  const calls = [];
  const client = api.createTaskRoomsApi(async (path, init) => {
    calls.push({ path, ...init });
    return typeof answer === "function" ? answer(path, init) : answer;
  });
  return { client, calls };
}

test("every route uses the contract's method and path", async () => {
  const { client, calls } = recording();
  await client.createRoom({ member_ids: ["u2"], client_id: "c1" });
  await client.listMyRooms();
  await client.getRoom("r 1");
  await client.getTaskChain("t1");
  await client.wrapTask("t1", { client_id: "c2" });
  await client.spinOff("r1", { message_ids: ["m1"], member_ids: [], client_id: "c3" });
  await client.setChildMode("r1", "agent_task", "t1", "collaborate");
  await client.detachChild("r1", "room", "r2");
  await client.summonPreview("r1", { target: "new", message_ids: null, prior_task_ids: [], imported: [] });
  await client.summon("r1", { target: "t9", message_ids: ["m1"], prior_task_ids: [], imported: [], text: "go", client_id: "c4" });
  await client.listHandoffs("r1");
  await client.startTaskFromConversation("conv1", { message_ids: ["m1"], client_id: "c5" });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    "POST /v1/task-rooms",
    "GET /v1/task-rooms?scope=mine",
    "GET /v1/task-rooms/r%201",
    "GET /v1/tasks/t1/room",
    "POST /v1/tasks/t1/wrap",
    "POST /v1/task-rooms/r1/spin-off",
    "PATCH /v1/task-rooms/r1/children/agent_task/t1",
    "DELETE /v1/task-rooms/r1/children/room/r2",
    "POST /v1/task-rooms/r1/summon/preview",
    "POST /v1/task-rooms/r1/summon",
    "GET /v1/task-rooms/r1/handoffs",
    "POST /v1/im/conversations/conv1/start-task",
  ]);
  assert.deepEqual(calls[6].json, { mode: "collaborate" });
  assert.equal(calls[1].json, undefined, "a read sends no body");
  assert.deepEqual(calls[8].json.message_ids, null, "null = the server's default selection");
});

test("success hands back the body as it came", async () => {
  const room = { id: "r1", title: "Launch", children: [] };
  const { client } = recording({ status: 200, body: { room } });
  assert.deepEqual(await client.getRoom("r1"), { ok: true, data: { room } });
});

test("503 task_rooms_unavailable and an older gateway's bare 404 are both 'not available yet'", async () => {
  for (const [status, body] of [
    [503, { code: "task_rooms_unavailable", message: "x" }],
    [503, { detail: { code: "task_rooms_unavailable", message: "x" } }],
    [404, { detail: "Not Found" }],
    [405, { detail: "Method Not Allowed" }],
  ]) {
    const { client } = recording({ status, body });
    const result = await client.listMyRooms();
    assert.equal(result.ok, false);
    assert.equal(result.unavailable, true, `${status} ${JSON.stringify(body)}`);
    assert.equal(result.code, "task_rooms_unavailable");
  }
});

test("other refusals keep the server's code and words, top level or under detail", async () => {
  const cases = [
    [404, { detail: { code: "not_member", message: "Not a member" } }, "not_member", "Not a member"],
    [403, { code: "cannot_summon", message: "Viewers cannot" }, "cannot_summon", "Viewers cannot"],
    [409, { detail: { code: "over_limit", message: "" } }, "over_limit", ""],
    [500, null, "http_500", ""],
  ];
  for (const [status, body, code, message] of cases) {
    const { client } = recording({ status, body });
    const result = await client.summon("r1", { target: "new", message_ids: [], prior_task_ids: [], imported: [], text: "x", client_id: "c" });
    assert.deepEqual(result, { ok: false, unavailable: false, status, code, message });
  }
});

test("a transport that throws is a network failure, not an exception", async () => {
  const client = api.createTaskRoomsApi(async () => { throw new Error("offline"); });
  const result = await client.getRoom("r1");
  assert.equal(result.ok, false);
  assert.equal(result.unavailable, false);
  assert.equal(result.code, "network");
});

test("the default transport sends the bearer token and JSON to the gateway", async () => {
  const previous = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, method: init.method, auth: init.headers.get("Authorization"), type: init.headers.get("Content-Type"), body: init.body });
    return new Response(JSON.stringify({ room_id: "r2", created: true }), { status: 200 });
  };
  try {
    const result = await api.taskRoomsApi.wrapTask("t1", { client_id: "c1" });
    assert.deepEqual(result, { ok: true, data: { room_id: "r2", created: true } });
    assert.deepEqual(seen, [{ url: "https://gateway.test/v1/tasks/t1/wrap", method: "POST", auth: "Bearer t", type: "application/json", body: '{"client_id":"c1"}' }]);
  } finally { globalThis.fetch = previous; }
});
