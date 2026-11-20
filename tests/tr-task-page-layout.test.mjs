// `/tasks/{id}` layout and "Discuss with people" (task rooms wave, TU2): the real
// `workspace-panels/task-chain.ts` against a scripted task-rooms client. Pins:
//   - a sub task with a parent task → the parent is the page, this sub task opens beside it;
//   - a task (room) id → that task is the page;
//   - 503 `task_rooms_unavailable` / an old gateway's bare 404 → today's page, and no further reads this session;
//   - wrap → the page reads its place again (no reload).
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

// globalThis.__rooms: { rooms: {id: true}, chains: {id: [...]}, unavailable: bool, oldGateway: bool, calls: [] }
const apiStub = dataModule(`
  const failure = () => {
    const s = globalThis.__rooms;
    if (s.unavailable) return { ok: false, unavailable: true };
    if (s.oldGateway) return { ok: false, unavailable: false, status: 404, code: "", message: "" };
    return null;
  };
  export const taskRoomsApi = {
    async getRoom(id) {
      globalThis.__rooms.calls.push("room:" + id);
      return failure() || (globalThis.__rooms.rooms[id] ? { ok: true, data: { room: { id } } }
        : { ok: false, unavailable: false, status: 404, code: "not_member", message: "" });
    },
    async getTaskChain(id) {
      globalThis.__rooms.calls.push("chain:" + id);
      return failure() || (globalThis.__rooms.chains[id] ? { ok: true, data: { chain: globalThis.__rooms.chains[id] } }
        : { ok: false, unavailable: false, status: 404, code: "task_not_found", message: "" });
    },
    async wrapTask(id, input) {
      globalThis.__rooms.calls.push("wrap:" + id + ":" + (input.client_id ? "client" : "none"));
      const fail = failure();
      if (fail) return fail;
      globalThis.__rooms.chains[id] = [{ kind: "room", id: "room-new", title: "Plan" }, { kind: "agent_task", id, title: "Plan" }];
      return { ok: true, data: { room_id: "room-new", created: true } };
    },
  };
`);
const chain = await import(await compileModule("src/shell/workspace-panels/task-chain.ts", { "../../lib/task-rooms-api": apiStub }));

async function withDom(run) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/tasks/t1" });
  const previous = new Map();
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, CustomEvent: dom.window.CustomEvent })) {
    previous.set(name, globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  try {
    await run(root);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

async function layoutOf(id) {
  let seen = [];
  await withDom(async (root) => {
    function Probe() { seen.push(chain.useTaskPageLayout(id)); return null; }
    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  });
  return seen;
}

function reset(state = {}) {
  chain.resetTaskChainForTests();
  globalThis.__rooms = { rooms: {}, chains: {}, unavailable: false, oldGateway: false, calls: [], ...state };
}

test("a sub task with a parent task: the parent is the page, the sub task opens beside it", async () => {
  reset({ chains: { t1: [{ kind: "room", id: "r1", title: "Launch" }, { kind: "agent_task", id: "t1", title: "Draft" }] } });
  const seen = await layoutOf("t1");
  assert.deepEqual(seen[0], { kind: "resolving" });
  assert.deepEqual(seen.at(-1), { kind: "child", parentRoomId: "r1", entry: { kind: "agent_task", id: "t1", title: "Draft" } });
});

test("a task id is that task's page; a sub task without a parent is today's page", async () => {
  reset({ rooms: { r1: true } });
  assert.deepEqual((await layoutOf("r1")).at(-1), { kind: "room", roomId: "r1" });
  reset({ chains: { t2: [{ kind: "agent_task", id: "t2", title: "Solo" }] } });
  assert.deepEqual((await layoutOf("t2")).at(-1), { kind: "plain" });
  assert.deepEqual(chain.parentRoomOf([{ kind: "agent_task", id: "a", title: "" }, { kind: "agent_task", id: "b", title: "" }]), null);
});

test("task rooms unavailable (503, or an old gateway's 404): today's page and no more reads this session", async () => {
  for (const state of [{ unavailable: true }, { oldGateway: true }]) {
    reset(state);
    assert.deepEqual((await layoutOf("t1")).at(-1), { kind: "plain" });
    const before = globalThis.__rooms.calls.length;
    assert.deepEqual((await layoutOf("t9")).at(-1), { kind: "plain" });
    assert.equal(globalThis.__rooms.calls.length, before, "no further reads once the server said the feature is not there");
    assert.deepEqual(await chain.startTaskDiscussion("t1"), { ok: false });
    assert.equal(await chain.resolveTaskLinkKind("t1"), "agent_task");
  }
});

test("Discuss with people: wrap, then the page reads its place again and shows the parent task", async () => {
  reset({ chains: { t1: [{ kind: "agent_task", id: "t1", title: "Plan" }] } });
  await withDom(async (root) => {
    let latest = null;
    function Probe() { latest = chain.useTaskPageLayout("t1"); return null; }
    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    assert.deepEqual(latest, { kind: "plain" });
    let result;
    await act(async () => { result = await chain.startTaskDiscussion("t1"); });
    assert.deepEqual(result, { ok: true, roomId: "room-new" });
    assert.ok(globalThis.__rooms.calls.includes("wrap:t1:client"), "every wrap carries a client id");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    assert.deepEqual(latest, { kind: "child", parentRoomId: "room-new", entry: { kind: "agent_task", id: "t1", title: "Plan" } });
  });
});

test("a /tasks link names a task or a sub task; one read tells which", async () => {
  reset({ rooms: { r1: true } });
  assert.equal(await chain.resolveTaskLinkKind("r1"), "room");
  assert.equal(await chain.resolveTaskLinkKind("t1"), "agent_task");
});
