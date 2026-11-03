import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { fitPreviewViewport } from "../src/shell/website-platform/website-preview-model.ts";

// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Geometry, view selection and panel state tests use jsdom and mocked APIs; no browser or untrusted code executes.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const i18n = dataModule('const tt=(s,v)=>v?s.replace(/\\{(\\w+)\\}/g,(_,k)=>v[k]):s; export function useWebsiteUI(){return tt;}');
const { WebsitePreviewWorkbench } = await import(await compileModule("src/shell/website-platform/WebsitePreviewWorkbench.tsx", {
  "./website-preview-i18n": i18n,
  "../../api/website-runtime": dataModule("export const websiteRuntimeApi={};"),
  "../../api/website-panels": dataModule("export const websitePanelsApi={};"),
  "../../api/website-connectors": dataModule("export const websiteConnectorsApi={};"),
  "./WebsiteConfiguration": dataModule("export function WebsiteConfiguration({projectId}){globalThis.__w8ConfigurationProject=projectId;return null;}"),
  "./WebsitePreviewPicker": dataModule("export function WebsitePreviewPicker(){return null;}"),
  "../../lib/history-events": dataModule("export function notifyHistoryChanged(){}"),
}));
const { createRoot } = await import("react-dom/client");

async function mount(props = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(WebsitePreviewWorkbench, {
    projectId: "website-8", runtimeApi: { get: async () => ({ state: "running", preview_url: "https://p-8.ws.oceanleo.app/" }) },
    panelsApi: { list: async () => [] }, ...props,
  })));
  return { host, root, async destroy() { await act(async () => root.unmount()); host.remove(); } };
}

test("desktop and phone viewport fit width and height, never upscale or produce invalid geometry", () => {
  assert.deepEqual(fitPreviewViewport(360, 600), { width: 1440, height: 900, scale: .25, displayWidth: 360, displayHeight: 225 });
  const phone = fitPreviewViewport(360, 600, true);
  assert.equal(phone.width, 390); assert.equal(phone.height, 844); assert.equal(phone.displayHeight, 600);
  assert.ok(phone.displayWidth <= 360);
  assert.equal(fitPreviewViewport(3000, 2000).scale, 1);
  for (const [width, height] of [[0, 0], [-2, 300], [NaN, Infinity]]) {
    const fit = fitPreviewViewport(width, height);
    assert.equal(fit.scale, 0); assert.equal(fit.displayWidth, 0); assert.equal(fit.displayHeight, 0);
  }
});

test("ResizeObserver fits a desktop layout into the sidebar and cleans up when changing views", async () => {
  const original = globalThis.ResizeObserver;
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; this.callback([{ target, contentRect: { width: 360, height: 600 } }]); }
    disconnect() { this.disconnected = true; }
  };
  const m = await mount();
  try {
    const iframe = m.host.querySelector("iframe");
    assert.equal(iframe.width, "1440"); assert.equal(iframe.height, "900");
    assert.equal(iframe.style.transform, "scale(0.25)");
    assert.equal(iframe.style.pointerEvents, "none"); assert.equal(iframe.tabIndex, -1);
    assert.equal(m.host.querySelector('[data-testid="website-preview-viewport"]').style.width, "360px");
    await act(async () => observers[0].callback([{ target: observers[0].target, contentRect: { width: 540, height: 600 } }]));
    assert.equal(iframe.style.transform, "scale(0.375)");
    await act(async () => [...m.host.querySelectorAll("button")].find(button => button.textContent === "电脑").click());
    assert.equal(iframe.width, "390"); assert.equal(iframe.height, "844");
    assert.ok(Math.abs(parseFloat(m.host.querySelector('[data-testid="website-preview-viewport"]').style.height) - 600) < .001);
    assert.equal(m.host.querySelectorAll('[role="tab"]').length, 3);
    assert.doesNotMatch(m.host.querySelector('[role="toolbar"]').textContent, /日志|看板/);
    await act(async () => m.host.querySelector('[data-testid="website-view-dashboard"]').click());
    assert.equal(m.host.querySelector("iframe"), null); assert.equal(observers[0].disconnected, true);
    assert.ok(m.host.querySelector('[data-testid="website-dashboard"]'));
    await act(async () => m.host.querySelector('[data-testid="website-view-configuration"]').click());
    assert.equal(globalThis.__w8ConfigurationProject, "website-8");
  } finally { await m.destroy(); globalThis.ResizeObserver = original; delete globalThis.__w8ConfigurationProject; }
});

test("Dashboard loads wired platform and site panels, preserves error states and only lets agents wire site panels", async () => {
  const dataCalls = [], wireCalls = [];
  const panelsApi = {
    list: async () => [
      { id: "visits", title: "Visits", kind: "metric", source: "platform", state: "wired" },
      { id: "users", title: "Users", kind: "metric", source: "platform", state: "not_wired" },
      { id: "domain", title: "Domain", kind: "metric", source: "platform", state: "error", error: "TLS pending" },
      { id: "runtime_cost", title: "Cost", kind: "metric", source: "platform", state: "wired" },
      { id: "errors", title: "Errors", kind: "table", source: "platform", state: "wired" },
      { id: "orders", title: "Orders", kind: "table", source: "app", state: "not_wired" },
    ],
    data: async (_id, panel) => { dataCalls.push(panel); if (panel === "runtime_cost") throw new Error("Cost source unavailable"); return { kind: "metric", items: [{ label: "Collected", value: 37 }] }; },
    wire: async (id, panel) => { wireCalls.push([id, panel]); return { task_id: "orders-task" }; },
  };
  const m = await mount({ panelsApi });
  try {
    assert.deepEqual(dataCalls, []);
    await act(async () => m.host.querySelector('[data-testid="website-view-dashboard"]').click());
    for (const id of ["visits", "users", "runtime_cost", "domain", "errors", "orders"]) assert.ok(m.host.querySelector(`[data-testid="website-dashboard-${id}"]`));
    assert.deepEqual(dataCalls.sort(), ["errors", "runtime_cost", "visits"]);
    assert.match(m.host.querySelector('[data-testid="website-dashboard-visits"]').textContent, /37/);
    assert.match(m.host.querySelector('[data-testid="website-dashboard-runtime_cost"]').textContent, /错误.*Cost source unavailable/s);
    assert.match(m.host.querySelector('[data-testid="website-dashboard-domain"]').textContent, /TLS pending/);
    for (const panel of m.host.querySelectorAll('[data-panel-source="platform"]')) assert.equal(panel.querySelector("button"), null);
    await act(async () => m.host.querySelector('[data-testid="website-dashboard-orders"] button').click());
    assert.deepEqual(wireCalls, [["website-8", "orders"]]);
    assert.equal(m.host.querySelector('[data-testid="website-agent-task"] a').getAttribute("href"), "/tasks/orders-task");
  } finally { await m.destroy(); }
});

// UC-NONE: local lifecycle scheduling is a presentation regression.
// This case checks exactly-once leave scheduling and tab visibility; the authenticated API boundary has separate coverage.
test("leave checkpoints dedupe pagehide and unmount while sidebar tabs and hidden visibility do not checkpoint", async () => {
  const calls = [];
  const runtimeApi = { get: async () => ({ state: "running", preview_url: "https://p-8.ws.oceanleo.app/" }),
    checkpoint: async (...args) => { calls.push(args); } };
  const m = await mount({ runtimeApi });
  try {
    await act(async () => m.host.querySelector('[data-testid="website-view-dashboard"]').click());
    await act(async () => m.host.querySelector('[data-testid="website-view-preview"]').click());
    await act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
    assert.deepEqual(calls, []);
    await act(async () => window.dispatchEvent(new window.Event("pagehide")));
    await act(async () => window.dispatchEvent(new window.Event("pagehide")));
    assert.deepEqual(calls, [["website-8", "leave"]]);
  } finally { await m.destroy(); }
  assert.deepEqual(calls, [["website-8", "leave"]]);
});

test("StrictMode effect replay keeps the project open; each actual project departure checkpoints once", async () => {
  const calls = [];
  const runtimeApi = { get: async () => ({ state: "stopped", preview_url: null }), checkpoint: async (...args) => { calls.push(args); throw new Error("best-effort failure"); } };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = projectId => root.render(React.createElement(React.StrictMode, null,
    React.createElement(WebsitePreviewWorkbench, { projectId, runtimeApi, panelsApi: { list: async () => [] } })));
  try {
    await act(async () => render("project-1"));
    assert.deepEqual(calls, []);
    await act(async () => render("project-2"));
    assert.deepEqual(calls, [["project-1", "leave"]]);
  } finally { await act(async () => root.unmount()); host.remove(); }
  assert.deepEqual(calls, [["project-1", "leave"], ["project-2", "leave"]]);
});
