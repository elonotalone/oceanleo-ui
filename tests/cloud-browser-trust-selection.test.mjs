import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const browserStub = dataModule(`
  const api = () => globalThis.__cloudBrowserTrustSelection;
  export function listCloudBrowsers(limit, taskId) { return api().list(limit, taskId); }
  export function getCloudBrowserSession(id) { return api().detail(id); }
  export async function listCloudBrowserCheckpoints() { return { ok: true, data: { items: [] } }; }
`);
const { useCloudBrowserSessionData } = await import(await compileModule("src/shell/cloud-browser-session-data.ts", { "../lib/browser": browserStub }));
const roots = [];
const tt = text => text;
const session = (id, task_id = null) => ({
  id, task_id, status: "active", session_version: 1, runtime_id: "runtime-" + id,
  incarnation: 1, protocol_version: 3, created_at: "2026-11-04T00:00:00.000Z",
});

function setup({ recent, task = [], details = {} }) {
  const calls = [];
  const api = {
    calls, current: null,
    list: async (_limit, taskId) => ({ ok: true, data: { items: taskId ? task : recent } }),
    detail: async id => { calls.push(id); return details[id] || { ok: false, status: 404, error: "SESSION_NOT_FOUND" }; },
  };
  globalThis.__cloudBrowserTrustSelection = api;
  return api;
}

function Probe({ initialSessionId, effectiveTaskId = "task-current" }) {
  const [error, setError] = useState("");
  const current = useCloudBrowserSessionData({ initialSessionId, effectiveTaskId, liveRequested: false, tt, setError });
  globalThis.__cloudBrowserTrustSelection.current = current;
  return React.createElement("div", null,
    React.createElement("output", { "data-selected-session": true }, current.selectedId),
    error ? React.createElement("p", { role: "alert" }, error) : null,
  );
}

async function mount(props) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push({ root, host });
  await act(async () => { root.render(React.createElement(Probe, props)); });
  return host;
}

afterEach(async () => {
  for (const { root, host } of roots.splice(0)) { await act(async () => root.unmount()); host.remove(); }
  delete globalThis.__cloudBrowserTrustSelection;
});

test("watching an older unbound browser resolves its owner-checked detail and outranks task history", async () => {
  const target = session("older-unbound");
  const taskBrowser = session("task-browser", "task-current");
  const api = setup({ recent: [session("newest")], task: [taskBrowser], details: { "older-unbound": { ok: true, data: { session: target } } } });
  const host = await mount({ initialSessionId: target.id });
  assert.equal(host.querySelector("[data-selected-session]")?.textContent, "older-unbound");
  assert.deepEqual(api.calls, ["older-unbound"]);
  assert.equal(api.current.selected?.task_id, null);
});

test("an explicit user selection remains selected after the watch target's initial load", async () => {
  const first = session("watch-target");
  const second = session("user-choice");
  const api = setup({ recent: [first, second] });
  const host = await mount({ initialSessionId: first.id });
  await act(async () => { api.current.chooseSession(second.id); });
  await act(async () => { await api.current.reload(); });
  assert.equal(host.querySelector("[data-selected-session]")?.textContent, second.id);
});

test("an inaccessible requested browser stays unselected instead of showing another browser", async () => {
  const api = setup({ recent: [session("different-browser")], task: [session("task-browser", "task-current")], details: { inaccessible: { ok: false, status: 403, error: "SESSION_FORBIDDEN" } } });
  const host = await mount({ initialSessionId: "inaccessible" });
  assert.deepEqual(api.calls, ["inaccessible"]);
  assert.equal(host.querySelector("[data-selected-session]")?.textContent, "");
  assert.ok(Boolean(host.querySelector('[role="alert"]')));
});
