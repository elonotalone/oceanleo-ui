import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";
import { TaskAccessMock, ownerAccess } from "./helpers/task-access-mock.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = window.CustomEvent;
const clientUrl = await compileModule("src/shell/access/task-access-client.ts", {
  "../../lib/auth/client": dataModule("export async function accessToken(){return 't';}"),
  "../../lib/auth/config": dataModule("export const GATEWAY_BASE='https://gateway.test';"),
});
const { useTaskAccess } = await import(await compileModule("src/shell/access/useTaskAccess.ts", { "./task-access-client": clientUrl }));

async function mount(client) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let latest;
  function Harness() { latest = useTaskAccess("t1", client); return React.createElement("span", null, latest.access?.state ?? (latest.error ? "error" : "loading")); }
  await act(async () => root.render(React.createElement(Harness)));
  return { host, get state() { return latest; }, async close() { await act(async () => root.unmount()); host.remove(); } };
}
test("a room revocation wins over an in-flight stale owner read, and failed revalidation locks access", async () => {
  const client = new TaskAccessMock(); let release;
  client.getAccess = async () => new Promise(resolve => { release = resolve; });
  const view = await mount(client);
  const removed = { ...ownerAccess(), state: "removed", role: "view", can_send: false, can_manage: false, visible_until: { message_id: 3, frame_id: 5 } };
  try {
    await act(async () => window.dispatchEvent(new CustomEvent("oceanleo:task-access-changed", { detail: { taskId: "t1", access: removed } })));
    assert.equal(view.state.access.state, "removed");
    client.getAccess = async () => removed;
    await act(async () => { release(ownerAccess()); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(view.state.access.state, "removed", "the old owner response cannot restore write rights");
    client.fail = "getAccess"; client.getAccess = TaskAccessMock.prototype.getAccess;
    await act(async () => view.state.refresh());
    assert.equal(view.state.access, null); assert.equal(view.state.error, true);
  } finally { await view.close(); }
});
test("identity changes lock the current page before a new access response arrives", async () => {
  const client = new TaskAccessMock(); const view = await mount(client);
  try {
    assert.equal(view.state.access.state, "owner");
    client.getAccess = async () => new Promise(() => {});
    await act(async () => window.dispatchEvent(new CustomEvent("oceanleo:auth-state")));
    assert.equal(view.state.access, null); assert.equal(view.state.signedIn, false);
  } finally { await view.close(); }
});
