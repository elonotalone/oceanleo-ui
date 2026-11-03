import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { insertPreviewReference, previewReferenceText, previewReferenceUrl } from "../src/shell/website-platform/website-preview-reference.ts";

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Supporting owner-capability privacy: mocked tickets stay in preview documents and never enter the model/composer.
// This suite does not validate signatures or execute untrusted iframe code. Random assertion markers are never printed.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { WebsitePreviewWorkbench } = await import(await compileModule("src/shell/website-platform/WebsitePreviewWorkbench.tsx", {
  "./website-preview-i18n": dataModule("export function useWebsiteUI(){return s=>s;}"),
  "../../api/website-runtime": dataModule("export const websiteRuntimeApi={};"),
  "../../api/website-panels": dataModule("export const websitePanelsApi={};"),
  "../../api/website-connectors": dataModule("export const websiteConnectorsApi={};"),
  "./WebsiteDashboard": dataModule("export function WebsiteDashboard(){return null;}"),
  "./WebsiteConfiguration": dataModule("export function WebsiteConfiguration(){return null;}"),
  "./WebsitePreviewPicker": dataModule("export function WebsitePreviewPicker({url}){globalThis.__w8LifetimePickerUrl=url;return null;}"),
  "../../lib/history-events": dataModule("export function notifyHistoryChanged(){}"),
}));
const { createRoot } = await import("react-dom/client");
const marker = () => randomUUID();

function running(ticket, overrides = {}) {
  const { origin = "https://p-lifetime.ws.oceanleo.app", ...values } = overrides;
  const url = new URL(origin);
  url.searchParams.set("__oceanleo_owner", ticket);
  return { state: "running", node_id: "node-1", started_at: "2026-11-04T00:00:00Z", commit: "commit-1", ...values, preview_url: url.href };
}
const ownerMatches = (frame, ticket) => new URL(frame.getAttribute("src")).searchParams.get("__oceanleo_owner") === ticket;
const tab = (host, id) => host.querySelector(`[data-testid="website-view-${id}"]`);
async function tick(t) { await act(async () => t.mock.timers.tick(3001)); }
async function mount(runtimeApi, extra = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const props = { projectId: "project-a", runtimeApi, panelsApi: { list: async () => [] }, ...extra };
  await act(async () => root.render(React.createElement(WebsitePreviewWorkbench, props)));
  return { host, root, props, async destroy() { await act(async () => root.unmount()); host.remove(); delete globalThis.__w8LifetimePickerUrl; } };
}
async function navigate(host, path) {
  const input = host.querySelector('input[aria-label="预览路径"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, path);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => input.form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
}

// UC-NONE: rendered document lifetime and geometry.
// This case checks iframe identity and viewport attributes; signature validation remains in the gateway.
test("ticket-only polls and live source commits preserve the iframe document, phone geometry and safe picker URL", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = marker(), second = marker(), third = marker();
  let current = running(first), reads = 0;
  const m = await mount({ get: async () => { reads++; return current; } });
  const changes = [];
  try {
    const frame = m.host.querySelector("iframe");
    assert.ok(ownerMatches(frame, first));
    const source = frame.getAttribute("src");
    frame.setAttribute("data-live-state", "kept");
    const observer = new window.MutationObserver(records => changes.push(...records));
    observer.observe(frame, { attributes: true, attributeFilter: ["src"] });
    try {
      current = running(second, { commit: "commit-2" });
      await tick(t);
      assert.ok(m.host.querySelector("iframe") === frame);
      assert.ok(frame.getAttribute("src") === source);
      assert.equal(frame.getAttribute("data-live-state"), "kept");
      await act(async () => [...m.host.querySelectorAll("button")].find(button => button.textContent === "电脑").click());
      assert.ok(m.host.querySelector("iframe") === frame); assert.equal(frame.width, "390"); assert.equal(frame.height, "844");
      await act(async () => [...m.host.querySelectorAll("button")].find(button => button.textContent === "点选元素").click());
      const pickerUrl = globalThis.__w8LifetimePickerUrl;
      assert.ok(!pickerUrl.includes(first) && !pickerUrl.includes(second));
      current = running(third, { commit: "commit-3" }); await tick(t);
      assert.ok(m.host.querySelector("iframe") === frame);
      assert.ok(frame.getAttribute("src") === source);
      assert.ok(globalThis.__w8LifetimePickerUrl === pickerUrl);
      assert.equal(changes.length, 0); assert.equal(reads, 3);
    } finally { observer.disconnect(); }
  } finally { await m.destroy(); t.mock.timers.reset(); }
});

// UC-NONE: local navigation lifetime.
// This case checks document replacement and the latest URL; it does not grant or validate owner access.
test("path navigation and resubmitting the same path consume the latest assertion", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = marker(), second = marker(), third = marker();
  let current = running(first);
  const m = await mount({ get: async () => current });
  try {
    const original = m.host.querySelector("iframe");
    current = running(second); await tick(t);
    await navigate(m.host, "/admin?tab=users#members");
    let frame = m.host.querySelector("iframe");
    assert.ok(frame !== original); assert.ok(ownerMatches(frame, second));
    let url = new URL(frame.getAttribute("src"));
    assert.equal(url.pathname, "/admin"); assert.equal(url.searchParams.get("tab"), "users"); assert.equal(url.hash, "#members");
    const previous = frame;
    current = running(third); await tick(t);
    assert.ok(m.host.querySelector("iframe") === previous);
    await navigate(m.host, "/admin?tab=users#members");
    frame = m.host.querySelector("iframe"); url = new URL(frame.getAttribute("src"));
    assert.ok(frame !== previous); assert.ok(ownerMatches(frame, third));
    assert.equal(url.pathname, "/admin"); assert.equal(url.hash, "#members");
  } finally { await m.destroy(); t.mock.timers.reset(); }
});

// UC-NONE: local view switching and checkpoint scheduling.
// This case checks document remounts and leave scheduling without changing any authorization boundary.
test("returning to Preview after another view creates a fresh document without a leave checkpoint", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = marker(), second = marker();
  let current = running(first);
  const checkpoints = [];
  const m = await mount({ get: async () => current, checkpoint: async (...args) => { checkpoints.push(args); } });
  try {
    const initial = m.host.querySelector("iframe");
    await act(async () => tab(m.host, "dashboard").click());
    assert.equal(m.host.querySelector("iframe"), null);
    current = running(second); await tick(t);
    await act(async () => tab(m.host, "preview").click());
    const frame = m.host.querySelector("iframe");
    assert.ok(frame !== initial); assert.ok(ownerMatches(frame, second));
    assert.equal(checkpoints.length, 0);
  } finally { await m.destroy(); t.mock.timers.reset(); }
  assert.deepEqual(checkpoints, [["project-a", "leave"]]);
});

// UC-NONE: local runtime identity and document lifetime.
// This case checks remounts for host or start changes; it does not accept an origin or validate a capability.
test("runtime host and session-start changes create a fresh document while source edits do not", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let current = running(marker());
  const m = await mount({ get: async () => current });
  try {
    let previous = m.host.querySelector("iframe");
    for (const values of [
      { started_at: "2026-11-04T00:01:00Z" },
      { started_at: "2026-11-04T00:01:00Z", node_id: "node-2" },
      { started_at: "2026-11-04T00:01:00Z", node_id: "node-2", origin: "https://p-next.ws.oceanleo.app" },
    ]) {
      const fresh = marker(); current = running(fresh, values); await tick(t);
      const frame = m.host.querySelector("iframe");
      assert.ok(frame !== previous); assert.ok(ownerMatches(frame, fresh)); previous = frame;
    }
    current = { ...current, commit: "new-live-source", preview_url: running(marker(), { origin: "https://p-next.ws.oceanleo.app" }).preview_url };
    await tick(t);
    assert.ok(m.host.querySelector("iframe") === previous);
  } finally { await m.destroy(); t.mock.timers.reset(); }
});

// UC-NONE: local stopped and error presentation.
// This case checks when a document is rendered after a runtime reply without exercising live authorization.
test("stopped and error recovery never remount a prior assertion before the current runtime arrives", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = marker(), second = marker(), third = marker();
  let current = running(first), rejectRead = false, deferRead = false, finishRecovery;
  const m = await mount({ get: async () => {
    if (rejectRead) throw new Error("status temporarily unavailable");
    if (deferRead) return new Promise(resolve => { finishRecovery = resolve; });
    return current;
  } });
  try {
    current = { ...current, state: "stopped" }; await tick(t);
    assert.equal(m.host.querySelector("iframe"), null);
    current = running(second); await tick(t);
    assert.ok(ownerMatches(m.host.querySelector("iframe"), second));
    rejectRead = true; await tick(t);
    assert.equal(m.host.querySelector("iframe"), null);
    rejectRead = false; deferRead = true;
    await act(async () => [...m.host.querySelectorAll("button")].find(button => button.textContent === "重试").click());
    assert.equal(m.host.querySelector("iframe"), null);
    await act(async () => finishRecovery(running(third)));
    assert.ok(ownerMatches(m.host.querySelector("iframe"), third));
  } finally { await m.destroy(); t.mock.timers.reset(); }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md. A project switch cannot reuse another project's owner URL.
test("project switching renders no previous project document while the new runtime is pending", async () => {
  const first = marker(), second = marker();
  let finishNewProject;
  const checkpoints = [];
  const runtimeApi = { get: async project => project === "project-a" ? running(first)
    : new Promise(resolve => { finishNewProject = resolve; }), checkpoint: async (...args) => { checkpoints.push(args); } };
  const m = await mount(runtimeApi);
  const additions = [];
  const observer = new window.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType === 1) additions.push(...(node.matches("iframe") ? [node] : node.querySelectorAll("iframe")));
    }
  });
  try {
    observer.observe(m.host, { childList: true, subtree: true });
    await act(async () => m.root.render(React.createElement(WebsitePreviewWorkbench, { ...m.props, projectId: "project-b" })));
    assert.equal(m.host.querySelector("iframe"), null); assert.equal(additions.length, 0);
    await act(async () => finishNewProject(running(second, { origin: "https://p-other.ws.oceanleo.app" })));
    assert.ok(ownerMatches(m.host.querySelector("iframe"), second));
    assert.equal(new URL(m.host.querySelector("iframe").getAttribute("src")).hostname, "p-other.ws.oceanleo.app");
    assert.deepEqual(checkpoints, [["project-a", "leave"]]);
  } finally { observer.disconnect(); await m.destroy(); }
});

// UC-NONE: local component remount lifetime.
// This case checks that a fresh component captures the current URL without checking any ticket signature.
test("remounting the same project uses the current assertion", async () => {
  const first = marker(), second = marker();
  let current = running(first);
  const runtimeApi = { get: async () => current };
  const initial = await mount(runtimeApi);
  assert.ok(ownerMatches(initial.host.querySelector("iframe"), first));
  await initial.destroy();
  current = running(second);
  const remounted = await mount(runtimeApi);
  try { assert.ok(ownerMatches(remounted.host.querySelector("iframe"), second)); }
  finally { await remounted.destroy(); }
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md. References remove all capability duplicates/encoded keys and URL userinfo.
test("reference URLs strip owner assertions and userinfo while preserving site path, query and fragment", () => {
  const first = marker(), second = marker(), password = marker();
  const original = `https://viewer:${password}@p-ref.ws.oceanleo.app/admin?keep=yes&__oceanleo_owner=${first}&%5F%5Foceanleo%5Fowner=${second}&__oceanleo_owner=${first}&q=two%20words#members`;
  const safe = previewReferenceUrl(original), parsed = new URL(safe);
  assert.ok(!safe.includes(first) && !safe.includes(second) && !safe.includes(password));
  assert.ok(parsed.username === "" && parsed.password === "");
  assert.equal(parsed.searchParams.getAll("__oceanleo_owner").length, 0);
  assert.equal(parsed.pathname, "/admin"); assert.equal(parsed.searchParams.get("keep"), "yes");
  assert.equal(parsed.searchParams.get("q"), "two words"); assert.equal(parsed.hash, "#members");
  const malformed = previewReferenceText({ projectId: "p", url: "not a URL?__oceanleo_owner=" + first, x: 1, y: 2, width: 3, height: 4 });
  assert.ok(!malformed.includes(first));
});

// UC-5: docs/architecture/oceanleo-untrusted-content-isolation.md. The real reference/composer transaction never serializes the iframe assertion.
test("a signed iframe reference reaches the composer without its assertion and preserves draft, coordinates and screenshot", async () => {
  const ticket = marker();
  const m = await mount({ get: async () => running(ticket) });
  const oldTransfer = globalThis.DataTransfer, oldClipboard = globalThis.ClipboardEvent;
  class Transfer { items = { add: file => { this.file = file; } }; }
  class Paste extends window.Event { constructor(type, init) { super(type, init); this.clipboardData = init.clipboardData; } }
  globalThis.DataTransfer = Transfer; globalThis.ClipboardEvent = Paste;
  const workspace = document.createElement("div");
  const composer = document.createElement("div"); composer.setAttribute("data-oceanleo-leo-entry-root", ""); composer.getClientRects = () => [{}];
  const input = document.createElement("div"); input.setAttribute("data-oc-slot-editor", ""); composer.append(input); workspace.append(composer); document.body.append(workspace);
  let draft = "Keep my draft", pasted;
  input.__ocGetText = () => draft; input.__ocSetText = text => { draft = text; };
  composer.addEventListener("paste", event => { pasted = event.clipboardData.file; });
  const screenshot = new File(["pixels"], "preview.png", { type: "image/png" });
  try {
    const frame = m.host.querySelector("iframe");
    assert.ok(ownerMatches(frame, ticket));
    assert.equal(insertPreviewReference({ projectId: "project-a", url: frame.getAttribute("src"), x: 20.3, y: 41.8, width: 1440, height: 900, screenshot }, workspace), true);
    assert.ok(!draft.includes(ticket));
    assert.ok(draft.startsWith("Keep my draft\n[Website preview reference]\n"));
    const payload = JSON.parse(draft.split("[Website preview reference]\n")[1]);
    assert.equal(new URL(payload.url).searchParams.getAll("__oceanleo_owner").length, 0);
    assert.deepEqual(payload.point, { x: 20, y: 42 }); assert.deepEqual(payload.viewport, { width: 1440, height: 900 });
    assert.equal(payload.dom, "unavailable_cross_origin"); assert.ok(pasted === screenshot);
  } finally { workspace.remove(); globalThis.DataTransfer = oldTransfer; globalThis.ClipboardEvent = oldClipboard; await m.destroy(); }
});
