// UC-5: an explicitly denied browser must never select another owned session.
// docs/architecture/oceanleo-untrusted-content-isolation.md
import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const api = dataModule(`
export async function listCloudBrowsers(...args) { return globalThis.__w11SelectionApi.list(...args); }
export async function getCloudBrowserSession(...args) { return globalThis.__w11SelectionApi.detail(...args); }
export async function listCloudBrowserCheckpoints() { return {ok:true,data:{items:[]}}; }
`);
const moduleUrl = await compileModule("src/shell/cloud-browser-session-data.ts", { "../lib/browser": api });
const { useCloudBrowserSessionData } = await import(moduleUrl);
const translate = text => text;
let latest;

function Harness({ initialSessionId, taskId = "task" }) {
  const [error, setError] = useState("");
  latest = useCloudBrowserSessionData({ effectiveTaskId: taskId, initialSessionId,
    liveRequested: false, tt: translate, setError });
  return React.createElement("div", { "data-selected": latest.selectedId }, error);
}

async function render(root, props) {
  await act(async () => { root.render(React.createElement(Harness, props)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

async function withRoot(api, run) {
  globalThis.__w11SelectionApi = api;
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  try { await run(root, element); }
  finally {
    await act(async () => root.unmount());
    element.remove();
    delete globalThis.__w11SelectionApi;
  }
}

test("denied exact Watch target remains unselected through reload", async () => {
  // UC-5: owner-checked detail denial cannot fall back to the task's browser.
  const calls = [];
  await withRoot({
    list: () => ({ ok: true, data: { items: [{ id: "owned", task_id: "task" }] } }),
    detail: id => { calls.push(id); return { ok: false, status: 403, error: "Denied" }; },
  }, async (root, element) => {
    await render(root, { initialSessionId: "foreign" });
    assert.equal(latest.selectedId, "");
    assert.match(element.textContent, /浏览记录加载失败/);
    await act(async () => { await latest.reload(); });
    assert.equal(latest.selectedId, "");
    assert.deepEqual(calls, ["foreign", "foreign"]);
  });
});

test("old owned Watch target loads by detail and user selection survives polling", async () => {
  // UC-5: only a successful owned detail lookup may select an older runtime.
  const calls = [];
  await withRoot({
    list: () => ({ ok: true, data: { items: [{ id: "recent", task_id: "task" }] } }),
    detail: id => {
      calls.push(id);
      return id === "old" ? { ok: true, data: { session: { id: "old", task_id: null } } }
        : { ok: false, status: 404, error: "Gone" };
    },
  }, async root => {
    await render(root, { initialSessionId: "old" });
    assert.equal(latest.selectedId, "old");
    await act(async () => latest.chooseSession("recent"));
    await act(async () => { await latest.reload(); });
    assert.equal(latest.selectedId, "recent");
    assert.deepEqual(calls, ["old"]);
    await render(root, { initialSessionId: "missing" });
    assert.equal(latest.selectedId, "");
  });
});
