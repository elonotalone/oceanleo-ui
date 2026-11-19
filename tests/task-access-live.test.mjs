import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";
import { setCacheUser } from "../src/lib/user-scoped-cache.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = window.CustomEvent;
const clientUrl = await compileModule("src/shell/access/task-access-client.ts", {
  "../../lib/auth/client": dataModule("export async function accessToken(){return 't';}"),
  "../../lib/auth/config": dataModule("export const GATEWAY_BASE='https://gateway.test';"),
});
const { TaskAccessError } = await import(clientUrl);
const { useTaskAccess } = await import(await compileModule("src/shell/access/useTaskAccess.ts", { "./task-access-client": clientUrl }));
const viewerAccess = () => ({ ...ownerAccess(), state: "member", role: "view", can_send: false, can_manage: false });
const removedAccess = () => ({ ...viewerAccess(), state: "removed", visible_until: { message_id: 3, frame_id: 5 } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function mount(client, initialAccess, taskId = "t1") {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let latest;
  function Harness({ id, seed }) { latest = useTaskAccess(id, client, seed); return React.createElement("span", null, latest.access?.state ?? (latest.error ? "error" : "loading")); }
  await act(async () => root.render(React.createElement(Harness, { id: taskId, seed: initialAccess })));
  return { host, get state() { return latest; }, async switchTo(id, seed) { await act(async () => root.render(React.createElement(Harness, { id, seed }))); }, async close() { await act(async () => root.unmount()); host.remove(); } };
}
const event = (type, detail) => act(async () => window.dispatchEvent(new CustomEvent(type, { detail })));

test("initial session and same-user refresh preserve the pending owner detail decision", async () => {
  setCacheUser(null);
  const client = new TaskAccessMock();
  client.getAccess = async () => { throw new TypeError("access endpoint unavailable"); };
  const view = await mount(client);
  try {
    const receive = view.state.captureDetail();
    await event("oceanleo:auth-state", { event: "INITIAL_SESSION", userId: "owner-a" });
    await act(async () => receive("t1", ownerAccess()));
    assert.equal(view.state.access?.role, "owner");
    await event("oceanleo:auth-state", { event: "TOKEN_REFRESHED", userId: "owner-a" });
    await event("oceanleo:auth-state", { event: "SIGNED_IN", userId: "owner-a" });
    assert.equal(view.state.access?.can_manage, true);
    assert.equal(view.state.error, false);
  } finally { await view.close(); setCacheUser(null); }
});

test("account switches and sign-out still invalidate captured detail and cached rights", async () => {
  setCacheUser("owner-a");
  const client = new TaskAccessMock();
  client.getAccess = async () => new Promise(() => {});
  const view = await mount(client, ownerAccess());
  try {
    const beforeSwitch = view.state.captureDetail();
    await event("oceanleo:auth-state", { event: "SIGNED_IN", userId: "owner-b" });
    await act(async () => beforeSwitch("t1", ownerAccess()));
    assert.equal(view.state.access, null);
    await act(async () => view.state.receiveDetail("t1", viewerAccess()));
    const beforeSignOut = view.state.captureDetail();
    client.authenticated = false;
    await event("oceanleo:auth-state", { event: "SIGNED_OUT", userId: null });
    await act(async () => beforeSignOut("t1", ownerAccess()));
    assert.equal(view.state.access, null);
    assert.equal(view.state.signedIn, false);
  } finally { await view.close(); setCacheUser(null); }
});

test("revocation wins over in-flight stale access; failed revalidation retains the explicit removed decision", async () => {
  const client = new TaskAccessMock(); const pending = deferred();
  client.getAccess = () => pending.promise;
  const view = await mount(client);
  try {
    await event("oceanleo:task-access-changed", { taskId: "t1", access: removedAccess() });
    assert.equal(view.state.access.state, "removed");
    await act(async () => pending.resolve(ownerAccess()));
    assert.equal(view.state.access.state, "removed");
    client.getAccess = async () => { throw new TypeError("network lost"); };
    await act(async () => view.state.refresh());
    assert.equal(view.state.access.state, "removed");
    assert.equal(view.state.error, true);
    assert.equal(view.state.unstable, false);
  } finally { await view.close(); }
});

test("owner detail opens immediately and does not poll on timers, focus or reconnect", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const client = new TaskAccessMock();
  const view = await mount(client, ownerAccess());
  try {
    assert.equal(view.state.access.can_send, true);
    assert.equal(view.state.loading, false);
    await act(async () => t.mock.timers.tick(60_000));
    await event("focus"); await event("online");
    assert.equal(client.calls.filter(row => row.action === "getAccess").length, 0);
  } finally { await view.close(); }
});

test("task detail releases a pending access gate immediately; late failures cannot erase it", async () => {
  const client = new TaskAccessMock(); const pending = deferred();
  client.getAccess = () => pending.promise;
  const view = await mount(client);
  try {
    assert.equal(view.state.loading, true);
    await act(async () => view.state.receiveDetail("t1", ownerAccess()));
    assert.equal(view.state.loading, false); assert.equal(view.state.access.can_manage, true);
    await act(async () => pending.reject(new Error("disconnected")));
    assert.equal(view.state.access.role, "owner"); assert.equal(view.state.error, false);
  } finally { await view.close(); }
});

test("transient failures preserve composer and header rights; two failures show an unstable note until recovery", async () => {
  const client = new TaskAccessMock(); const view = await mount(client);
  try {
    client.getAccess = async () => { throw new TaskAccessError(503); };
    await act(async () => view.state.refresh());
    assert.equal(view.state.access.can_send, true); assert.equal(view.state.unstable, false);
    await act(async () => view.state.refresh());
    assert.equal(view.state.access.can_manage, true); assert.equal(view.state.unstable, true);
    client.getAccess = async () => ownerAccess();
    await act(async () => view.state.refresh());
    assert.equal(view.state.error, false); assert.equal(view.state.unstable, false);
  } finally { await view.close(); }
});

test("identity probe failure does not reject a successful access decision", async () => {
  const client = new TaskAccessMock();
  client.signedIn = async () => { throw new Error("auth refresh offline"); };
  const view = await mount(client);
  try { assert.equal(view.state.access.role, "owner"); assert.equal(view.state.error, false); }
  finally { await view.close(); }
});

test("identity changes clear cached rights while the new decision loads", async () => {
  const client = new TaskAccessMock(); const view = await mount(client, ownerAccess());
  try {
    client.getAccess = async () => new Promise(() => {});
    client.authenticated = false;
    await event("oceanleo:auth-state");
    assert.equal(view.state.access, null); assert.equal(view.state.signedIn, false); assert.equal(view.state.loading, true);
  } finally { await view.close(); }
});

test("only explicit HTTP denial clears the last decision", async () => {
  for (const status of [401, 403, 404, 410]) {
    const client = new TaskAccessMock(); const view = await mount(client, ownerAccess());
    try {
      client.getAccess = async () => { throw new TaskAccessError(status); };
      await act(async () => view.state.refresh());
      assert.equal(view.state.access, null, `HTTP ${status}`); assert.equal(view.state.loading, false);
    } finally { await view.close(); }
  }
});

test("non-owners poll every 15 seconds and refresh on focus/online", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const client = new TaskAccessMock(); client.access = viewerAccess();
  const view = await mount(client);
  const reads = () => client.calls.filter(row => row.action === "getAccess").length;
  try {
    assert.equal(reads(), 1);
    await act(async () => t.mock.timers.tick(14_999)); assert.equal(reads(), 1);
    await act(async () => t.mock.timers.tick(1)); assert.equal(reads(), 2);
    await event("focus"); assert.equal(reads(), 3);
    client.access = removedAccess();
    await event("online"); assert.equal(reads(), 4); assert.equal(view.state.access.state, "removed");
  } finally { await view.close(); }
});

test("eight-second timeout aborts hung reads, retains history rights and permits retry", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const client = new TaskAccessMock(); const view = await mount(client);
  let signal;
  try {
    client.getAccess = async (_id, supplied) => { signal = supplied; return new Promise(() => {}); };
    let running;
    await act(async () => { running = view.state.refresh(); });
    await act(async () => t.mock.timers.tick(7_999)); assert.equal(signal.aborted, false);
    await act(async () => { t.mock.timers.tick(1); await running; });
    assert.equal(signal.aborted, true); assert.equal(view.state.access.role, "owner");
    client.getAccess = async () => viewerAccess();
    await act(async () => view.state.refresh());
    assert.equal(view.state.access.role, "view"); assert.equal(view.state.error, false);
  } finally { await view.close(); }
});

test("task switch and unmount abort old requests; old identity and access cannot leak to the next task", async () => {
  const client = new TaskAccessMock(); const oldRead = deferred(); const nextRead = deferred(); const oldIdentity = deferred();
  const signals = [];
  client.getAccess = (id, signal) => { signals.push(signal); return id === "t1" ? oldRead.promise : nextRead.promise; };
  client.signedIn = () => oldIdentity.promise;
  const view = await mount(client);
  try {
    client.signedIn = async () => false;
    await view.switchTo("t2", viewerAccess());
    assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
    await act(async () => { oldRead.resolve(ownerAccess()); oldIdentity.resolve(true); });
    assert.equal(view.state.access.role, "view"); assert.equal(view.state.signedIn, false);
    await act(async () => view.state.receiveDetail("t1", removedAccess()));
    assert.equal(view.state.access.role, "view", "another task's detail is ignored");
  } finally { await view.close(); }
  assert.equal(signals[1].aborted, true);
});

test("a hung first decision becomes a retryable error after eight seconds", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const client = new TaskAccessMock();
  client.getAccess = async () => new Promise(() => {});
  const view = await mount(client);
  try {
    assert.equal(view.state.loading, true);
    await act(async () => t.mock.timers.tick(8_000));
    assert.equal(view.state.loading, false); assert.equal(view.state.error, true); assert.equal(view.state.access, null);
  } finally { await view.close(); }
});

test("async task detail captured before sign-out or revocation cannot restore old rights", async () => {
  const client = new TaskAccessMock(); const view = await mount(client, ownerAccess());
  try {
    const beforeRemoval = view.state.captureDetail();
    await event("oceanleo:task-access-changed", { taskId: "t1", access: removedAccess() });
    await act(async () => beforeRemoval("t1", ownerAccess()));
    assert.equal(view.state.access.state, "removed");
    const beforeAuth = view.state.captureDetail();
    client.getAccess = async () => new Promise(() => {});
    await event("oceanleo:auth-state");
    await act(async () => beforeAuth("t1", ownerAccess()));
    assert.equal(view.state.access, null);
  } finally { await view.close(); }
});
