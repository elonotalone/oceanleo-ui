import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const auth = dataModule(`export async function accessToken() { return globalThis.__browserFlowsSignedOut ? null : "owner-token"; }`);
const config = dataModule(`export const GATEWAY_BASE = "https://gateway.test";`);
const apiUrl = await compileModule("src/pages/settings/cloud-browser-flows-api.ts", {
  "../../lib/auth/client": auth, "../../lib/auth/config": config,
});
const api = await import(apiUrl);
const componentUrl = await compileModule("src/pages/settings/CloudBrowserFlowsSection.tsx", {
  "./cloud-browser-flows-api": apiUrl,
  "../../i18n/ui/useUI": dataModule(`export function useUI() { return (s, vars) => s.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? key)); }`),
  "../../shell/CloudBrowserPanel": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function CloudBrowserPanel(props) { return React.createElement("div", {"data-watch-initial":props.initialSessionId,"data-watch-task":props.taskId}, "Browser test view"); }`),
});
const { CloudBrowserFlowsSection } = await import(componentUrl);

const flow = () => ({
  id: "flow-1", name: "Weekly report", notes: "Use completed orders", site_origin: "https://shop.example", schema_version: 1, version: 4,
  created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z",
  steps: [
    { action: "navigate", url: "https://shop.example/reports" },
    { action: "credential", anchor: { label: "Password" }, vault_ref: "vault-ref-1", page_origin: "https://shop.example" },
    { action: "click", anchor: { role: "button", name: "Download" }, page_origin: "https://shop.example" },
  ],
});
const session = () => ({ id: "session-1", title: "Report task", task_id: "task-1", status: "active", runtime_state: "active", runtime_id: "runtime-1", incarnation: 3, session_version: 7, can_watch: true });
const capacity = () => ({
  capacity: { scope: "global", state: "unknown", browser_slots: { max: 4, in_use: 1, free: 3 }, available_slots: null, per_browser_memory_mib: null, reported_at: null },
  cost_basis: { status: "partial", model: "node_memory_time", markup: 0, billing_applied: null, rates: [{ currency: "CNY", node_hourly_price: 0.6233, node_memory_mib: 8192, per_gib_hour: 0.0779125, source: "fixture" }], unknown_components: ["browser_billing", "traffic"] },
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function withFetch(handler, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : undefined, init };
    calls.push(call);
    return handler(call);
  };
  try { return await run(calls); }
  finally { globalThis.fetch = previous; delete globalThis.__browserFlowsSignedOut; }
}

test("safe structured steps preserve vault refs and reject executable or sensitive plaintext", () => {
  const safe = api.parseBrowserFlow(flow());
  assert.equal(safe.steps[1].vault_ref, "vault-ref-1");
  assert.equal(Object.hasOwn(safe.steps[1], "value"), false);
  for (const step of [
    { action: "credential", anchor: { label: "Password" }, vault_ref: "vault-1", value: "do-not-render" },
    { action: "fill", anchor: { label: "API token" }, value: "do-not-render" },
    { action: "fill", anchor: { label: "Search" }, value: "sk_live_12345678901234567890" },
    { action: "click", selector: "body", anchor: { label: "Download" } },
    { action: "evaluate", script: "alert(1)" },
    { action: "navigate", url: "https://user:secret@shop.example/" },
    { action: "navigate", url: "https://shop.example/?token=do-not-render" },
    { action: "navigate", url: "javascript:alert(1)" },
  ]) assert.equal(api.parseBrowserFlowStep({ ...(step.action === "navigate" ? {} : { page_origin: "https://shop.example" }), ...step }), null, step.action);
  assert.deepEqual(api.parseBrowserFlowStep({ action: "navigate", url: "https://shop.example/?page=2#receipt" }), { action: "navigate", url: "https://shop.example/?page=2", page_origin: "https://shop.example" });
  assert.deepEqual(api.parseBrowserFlowStep({ action: "fill", anchor: { label: "Search" }, value: "weekly reports", page_origin: "https://shop.example" }), { action: "fill", anchor: { label: "Search" }, value: "weekly reports", page_origin: "https://shop.example" });
  assert.throws(() => api.browserFlowInput({ name: "", notes: "", steps: [] }), error => error.code === "INVALID_FLOW");
  assert.equal(api.browserFlowInput({ name: "Draft", notes: "", site_origin: "", steps: [] }).site_origin, "");
});

test("flow writes use bearer auth, encoded paths and optimistic version; malformed receipts never count as saved", async () => {
  await withFetch(call => {
    if (call.method === "DELETE") return json({ ok: true });
    return json({ ...flow(), id: "flow/id", ...call.body, schema_version: 1, version: 5 });
  }, async calls => {
    const value = flow();
    const input = { name: value.name, notes: value.notes, site_origin: value.site_origin, steps: value.steps };
    await api.cloudBrowserFlowsApi.create(input);
    await api.cloudBrowserFlowsApi.update({ ...value, id: "flow/id" }, input);
    await api.cloudBrowserFlowsApi.remove("flow/id");
    assert.deepEqual(calls.map(call => [call.method, call.url]), [
      ["POST", "https://gateway.test/v1/browser/flows"],
      ["PATCH", "https://gateway.test/v1/browser/flows/flow%2Fid"],
      ["DELETE", "https://gateway.test/v1/browser/flows/flow%2Fid"],
    ]);
    assert.equal(calls[1].body.expected_version, 4);
    assert.equal(calls[1].body.steps[1].vault_ref, "vault-ref-1");
    assert.equal(Object.hasOwn(calls[1].body.steps[1], "value"), false);
    for (const call of calls) {
      assert.equal(call.init.headers.Authorization, "Bearer owner-token");
      assert.equal(call.init.credentials, "include");
      assert.equal(call.init.cache, "no-store");
      assert.equal(call.init.signal instanceof AbortSignal, true);
    }
  });
  await withFetch(() => json({ status: "queued" }), async () => {
    await assert.rejects(api.cloudBrowserFlowsApi.create({ name: "Draft", notes: "", steps: [] }), error => error.code === "INVALID_RESPONSE");
    await assert.rejects(api.cloudBrowserFlowsApi.stopTeaching("session-1", "Draft", true), error => error.code === "INVALID_RESPONSE");
    await assert.rejects(api.cloudBrowserFlowsApi.remove("flow-1"), error => error.code === "INVALID_RESPONSE");
  });
});

test("signed out sends no request; backend failures expose only a safe code; fallback remains explicit", async () => {
  await withFetch(call => call.url.endsWith("/parallel/sessions")
    ? json({ detail: { code: "PARALLEL_UNAVAILABLE", message: "do-not-render-secret" } }, 503)
    : json({ items: [session()] }), async calls => {
    globalThis.__browserFlowsSignedOut = true;
    await assert.rejects(api.cloudBrowserFlowsApi.flows(), error => error.status === 401);
    assert.equal(calls.length, 0);
    delete globalThis.__browserFlowsSignedOut;
    const result = await api.cloudBrowserFlowsApi.sessions();
    assert.equal(result.source, "sessions");
    assert.equal(result.items[0].id, "session-1");
    assert.equal(result.warning.code, "PARALLEL_UNAVAILABLE");
    assert.equal(result.warning.message.includes("do-not-render-secret"), false);
    assert.equal(calls[1].url.endsWith("/sessions?limit=50"), true);
  });
  await withFetch(() => json({ detail: { code: "NOT_OWNER" } }, 403), async calls => {
    await assert.rejects(api.cloudBrowserFlowsApi.sessions(), error => error.code === "NOT_OWNER");
    assert.equal(calls.length, 1);
  });
});

test("teach and replay requests preserve session fencing; only fully completed replay is complete", async () => {
  let outcome = "blocked";
  await withFetch(call => {
    if (call.url.endsWith("/teach/start")) return json({ status: "recording", session_id: "session-1", recording_id: "recording-1" });
    if (call.url.endsWith("/teach/stop")) return json(call.body.save ? { status: "saved", flow: flow() } : { status: "discarded" });
    return json({ run_id: "run-1", status: outcome, session_id: "session-1", flow_id: "flow-1", completed_steps: outcome === "completed" ? 3 : 1, total_steps: 3, approval: outcome === "blocked" ? { status: "pending", kind: "sensitive_action", reason: "do-not-render" } : undefined });
  }, async calls => {
    await api.cloudBrowserFlowsApi.startTeaching("session-1", " Weekly report ");
    const saved = await api.cloudBrowserFlowsApi.stopTeaching("session-1", "Weekly report", true);
    assert.equal(saved.id, "flow-1");
    assert.equal(await api.cloudBrowserFlowsApi.stopTeaching("session-1", "", false), null);
    assert.deepEqual(calls[0].body, { name: "Weekly report" });
    assert.deepEqual(calls[1].body, { name: "Weekly report", save: true });
    for (const status of ["queued", "paused", "failed", "blocked", "completed"]) {
      outcome = status;
      const result = await api.cloudBrowserFlowsApi.run("flow-1", session());
      assert.equal(api.browserFlowRunCompleted(result), status === "completed");
      assert.equal(JSON.stringify(result).includes("do-not-render"), false);
    }
    assert.deepEqual(calls.at(-1).body, { session_id: "session-1", expected_version: 7, incarnation: 3 });
    assert.equal(api.browserFlowRunCompleted({ status: "completed", completed_steps: 1, total_steps: 3 }), false);
    assert.equal(api.browserFlowRunCompleted({ status: "completed", completed_steps: 0, total_steps: 0 }), false);
  });
});

const runReceipt = (status = "awaiting_approval", next = 1) => ({ id: "run-1", flow_id: "flow-1", session_id: "session-1", status, next_step: next, total_steps: 3, flow_version: 4, session_version: 7, runtime_id: "runtime-1", incarnation: 3, code: "APPROVAL_REQUIRED" });

test("continuation reads an owned server receipt and sends its run id without a client step offset", async () => {
  await withFetch(call => call.method === "GET" ? json(runReceipt("ready", 2)) : json({ run_id: "run-1", status: "completed", session_id: "session-1", flow_id: "flow-1", completed_steps: 3, total_steps: 3 }), async calls => {
    const receipt = await api.cloudBrowserFlowsApi.runReceipt("flow-1", "session-1", "run-1");
    assert.equal(receipt.status, "ready");
    await api.cloudBrowserFlowsApi.run("flow-1", { id: receipt.session_id, session_version: receipt.session_version, incarnation: receipt.incarnation }, undefined, receipt.id);
    assert.equal(calls[0].url.endsWith("/flows/flow-1/runs/run-1"), true);
    assert.deepEqual(calls[1].body, { session_id: "session-1", expected_version: 7, incarnation: 3, run_id: "run-1" });
  });
  await withFetch(() => json({ ...runReceipt("ready", 2), session_id: "somebody-else" }), async () => {
    await assert.rejects(api.cloudBrowserFlowsApi.runReceipt("flow-1", "session-1", "run-1"), error => error.code === "INVALID_RESPONSE");
  });
  await withFetch(() => json(runReceipt("completed", 1)), async () => {
    await assert.rejects(api.cloudBrowserFlowsApi.runReceipt("flow-1", "session-1", "run-1"), error => error.code === "INVALID_RESPONSE");
  });
});

const downloadListing = (id = "session-1") => ({
  session_id: id, runtime_id: `runtime-${id}`, incarnation: 3,
  items: [{ id: `file-${id}`, filename: `${id.replaceAll("/", "-")}.csv`, size_bytes: 7, status: "ready", created_at: "2026-11-04T00:00:00Z", url: "https://untrusted.example/file", path: "/untrusted/page/path" }, { id: `pending-${id}`, filename: "pending.csv", size_bytes: null, status: "pending", created_at: "2026-11-04T00:00:00Z" }],
  limits: { max_file_bytes: 1024, max_total_bytes: 4096, max_count: 4 },
});
const libraryReceipt = (name = "session-1.csv") => ({ ok: true, file: { artifact_id: "artifact-1", revision_id: "revision-1", name, media_type: "text/csv", size_bytes: 7 } });

test("downloads use only owner-bound session/file routes, reject wrong sessions and never follow page URLs", async () => {
  await withFetch(call => call.url.endsWith("/downloads") ? json(downloadListing("session/id")) : new Response("a,b\n1,2"), async calls => {
    const listing = await api.cloudBrowserFlowsApi.downloads("session/id");
    assert.equal(Object.hasOwn(listing.items[0], "path"), false);
    assert.equal(Object.hasOwn(listing.items[0], "url"), false);
    await assert.rejects(api.cloudBrowserFlowsApi.download(listing.session_id, listing.items[1], listing.limits.max_file_bytes), error => error.code === "DOWNLOAD_NOT_READY");
    assert.equal(calls.length, 1);
    const blob = await api.cloudBrowserFlowsApi.download(listing.session_id, { ...listing.items[0], id: "file/id" }, listing.limits.max_file_bytes);
    assert.equal(await blob.text(), "a,b\n1,2");
    assert.equal(calls[1].url, "https://gateway.test/v1/browser/parallel/sessions/session%2Fid/downloads/file%2Fid");
    assert.equal(calls[1].init.redirect, "error");
    assert.equal(calls[1].init.headers.Authorization, "Bearer owner-token");
    assert.equal(calls[1].init.credentials, "include");
  });
  await withFetch(() => json(downloadListing("another-session")), async () => {
    await assert.rejects(api.cloudBrowserFlowsApi.downloads("session-1"), error => error.code === "INVALID_RESPONSE");
  });
  await withFetch(() => json({ ...downloadListing(), items: [{ ...downloadListing().items[0], filename: "../private.csv" }] }), async () => {
    await assert.rejects(api.cloudBrowserFlowsApi.downloads("session-1"), error => error.code === "INVALID_RESPONSE");
  });
  await withFetch(() => json({ ...downloadListing(), limits: { max_file_bytes: 64 * 1024 * 1024, max_total_bytes: 64 * 1024 * 1024, max_count: 4 } }), async () => {
    await assert.rejects(api.cloudBrowserFlowsApi.downloads("session-1"), error => error.code === "INVALID_RESPONSE");
  });
});

test("Library handoff confirms artifact and revision metadata without accepting URLs or incomplete writes", async () => {
  const ready = downloadListing().items[0];
  await withFetch(() => json({ ...libraryReceipt(), url: "https://untrusted.example/private", token: "do-not-render", file: { ...libraryReceipt().file, signed_url: "https://untrusted.example/private" } }), async calls => {
    await assert.rejects(api.cloudBrowserFlowsApi.saveToLibrary("session-1", downloadListing().items[1]), error => error.code === "DOWNLOAD_NOT_READY");
    assert.equal(calls.length, 0);
    const saved = await api.cloudBrowserFlowsApi.saveToLibrary("session/id", { ...ready, id: "file/id" });
    assert.deepEqual(saved, libraryReceipt().file);
    assert.equal(calls[0].url, "https://gateway.test/v1/browser/parallel/sessions/session%2Fid/downloads/file%2Fid/library");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body, undefined);
    assert.equal(calls[0].init.headers.Authorization, "Bearer owner-token");
    assert.equal(calls[0].init.credentials, "include");
    assert.equal(JSON.stringify(saved).includes("https://"), false);
  });
  for (const response of [
    { ...libraryReceipt(), ok: false },
    { ok: true, file: { ...libraryReceipt().file, revision_id: "" } },
    { ok: true, file: { ...libraryReceipt().file, artifact_id: "https://untrusted.example/file" } },
    { ok: true, file: { ...libraryReceipt().file, size_bytes: 3 } },
  ]) await withFetch(() => json(response), async () => {
    await assert.rejects(api.cloudBrowserFlowsApi.saveToLibrary("session-1", ready), error => error.code === "INVALID_RESPONSE");
  });
  const svg = { ...ready, filename: "icon.svg", size_bytes: 64 };
  await withFetch(() => json({ ok: true, file: { ...libraryReceipt().file, name: "icon.svg", media_type: "image/svg+xml", size_bytes: 80 } }), async () => {
    const saved = await api.cloudBrowserFlowsApi.saveToLibrary("session-1", svg);
    assert.equal(saved.size_bytes, 80);
  });
  for (const size of [0, 20 * 1024 * 1024 + 1]) await withFetch(() => json({ ok: true, file: { ...libraryReceipt().file, name: "icon.svg", media_type: "image/svg+xml", size_bytes: size } }), async () => {
    await assert.rejects(api.cloudBrowserFlowsApi.saveToLibrary("session-1", svg), error => error.code === "INVALID_RESPONSE");
  });
});

function fixture() {
  const state = { flows: [flow()], sessions: [session()], calls: [], deleteFails: false, libraryFails: false, stopStatus: "saved", runStatus: "blocked", receiptStatus: "awaiting_approval", receiptNext: 1, capacityFails: false, parallelFails: false };
  state.fetch = async call => {
    state.calls.push(call);
    if (call.url.endsWith("/parallel/capacity")) return state.capacityFails ? json({}, 503) : json(capacity());
    if (call.url.endsWith("/parallel/sessions")) return state.parallelFails ? json({}, 503) : json({ items: state.sessions });
    if (call.url.endsWith("/sessions?limit=50")) return json({ items: state.sessions });
    const libraryMatch = call.url.match(/\/parallel\/sessions\/([^/]+)\/downloads\/([^/]+)\/library$/);
    if (libraryMatch) return state.libraryFails ? json({ detail: { code: "LIBRARY_QUOTA_EXCEEDED" } }, 413) : json(libraryReceipt(`${decodeURIComponent(libraryMatch[1])}.csv`));
    const downloadMatch = call.url.match(/\/parallel\/sessions\/([^/]+)\/downloads(?:\/([^/]+))?$/);
    if (downloadMatch) return downloadMatch[2] ? new Response("a,b\n1,2") : json(downloadListing(decodeURIComponent(downloadMatch[1])));
    if (call.url.endsWith("/flows") && call.method === "GET") return json({ items: state.flows });
    if (call.url.endsWith("/runs/run-1")) return json(runReceipt(state.receiptStatus, state.receiptNext));
    if (call.url.endsWith("/teach/start")) return json({ status: "recording", session_id: "session-1", recording_id: "recording-1" });
    if (call.url.endsWith("/teach/stop")) {
      const taught = { ...flow(), id: "flow-taught", name: call.body.name || "Recorded flow" };
      if (state.stopStatus === "saved" && call.body.save) { state.flows.push(taught); return json({ status: "saved", flow: taught }); }
      return json({ status: call.body.save ? state.stopStatus : "discarded" });
    }
    if (call.url.endsWith("/run")) {
      if (state.runStatus === "http-failed") return json({ detail: { code: "REPLAY_FAILED", message: "do-not-render-secret" } }, 503);
      return json({ run_id: "run-1", status: state.runStatus, session_id: "session-1", flow_id: "flow-1", completed_steps: state.runStatus === "completed" ? 3 : 1, total_steps: 3, code: "WAITING", ...(state.runStatus === "blocked" ? { approval: { status: "pending", kind: "sensitive_action" } } : {}) });
    }
    if (call.method === "PATCH") {
      const current = state.flows.find(item => call.url.endsWith(`/${item.id}`));
      if (call.body.expected_version !== current.version) return json({ detail: { code: "VERSION_CONFLICT" } }, 409);
      const updated = { ...current, ...call.body, version: current.version + 1 };
      state.flows = state.flows.map(item => item.id === updated.id ? updated : item);
      return json(updated);
    }
    if (call.method === "DELETE") {
      if (state.deleteFails) return json({ detail: { code: "FLOW_DELETE_FAILED", message: "do-not-render-secret" } }, 503);
      state.flows = state.flows.filter(item => !call.url.endsWith(`/${item.id}`));
      return json({ ok: true });
    }
    if (call.method === "POST" && call.url.endsWith("/flows")) {
      const created = { ...flow(), id: "flow-new", ...call.body, version: 1 };
      state.flows.push(created);
      return json(created);
    }
    throw new Error(`Unexpected fixture request ${call.method} ${call.url}`);
  };
  return state;
}

async function settle() { await act(async () => { await new Promise(resolve => setImmediate(resolve)); }); }
async function click(container, selector) {
  const element = container.querySelector(selector);
  assert.ok(element, `Missing ${selector}`);
  await act(async () => { element.click(); });
  await settle();
}
async function change(container, selector, value) {
  const element = container.querySelector(selector);
  assert.ok(element, `Missing ${selector}`);
  const prototype = element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function mounted(state, run) {
  const container = document.createElement("main"); document.body.append(container);
  const root = createRoot(container);
  await withFetch(state.fetch, async () => {
    try {
      await act(async () => { root.render(React.createElement(CloudBrowserFlowsSection)); });
      await settle();
      await run(container);
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
}

test("rendered flow edits preserve credential refs, notes can be cleared, failed delete stays visible", async () => {
  const state = fixture();
  await mounted(state, async container => {
    assert.equal(container.querySelectorAll("[data-browser-flow]").length, 1);
    await click(container, "[data-browser-flow-edit]");
    const ref = container.querySelector("[data-browser-flow-vault-ref]");
    assert.equal(ref.readOnly, true);
    assert.equal(ref.value, "vault-ref-1");
    assert.equal(container.querySelectorAll("[data-browser-flow-editor] textarea").length, 1);
    await change(container, "[data-browser-flow-name]", "Weekly ledger");
    await change(container, "[data-browser-flow-notes-editor]", "Pick this week's completed orders");
    await click(container, "[data-browser-flow-save]");
    assert.equal(container.querySelector("[data-browser-flow-editor]"), null);
    const patch = state.calls.find(call => call.method === "PATCH");
    assert.equal(patch.body.name, "Weekly ledger");
    assert.equal(patch.body.steps[1].vault_ref, "vault-ref-1");
    assert.equal(Object.hasOwn(patch.body.steps[1], "value"), false);
    assert.equal(container.textContent.includes("Pick this week's completed orders"), true);
    await click(container, "[data-browser-flow-clear-notes]");
    assert.equal(container.querySelector("[data-browser-flow-notes]").textContent.includes("暂无网站笔记"), true);
    state.deleteFails = true;
    await click(container, "[data-browser-flow-delete]");
    await click(container, "[data-browser-flow-delete]");
    assert.equal(container.querySelectorAll("[data-browser-flow]").length, 1);
    assert.equal(container.querySelector("[data-browser-flow-error]").dataset.browserFlowErrorCode, "FLOW_DELETE_FAILED");
    assert.equal(container.textContent.includes("do-not-render-secret"), false);
    state.deleteFails = false;
    await click(container, "[data-browser-flow-delete]");
    assert.equal(container.querySelectorAll("[data-browser-flow]").length, 0);
  });
});

test("rendered teaching needs a chosen live browser, watches exact session, and saves only a confirmed flow", async () => {
  const state = fixture();
  state.stopStatus = "queued";
  await mounted(state, async container => {
    assert.equal(container.querySelector("[data-browser-teach-start]").disabled, true);
    await change(container, "[data-browser-teach-session]", "session-1");
    await change(container, "[data-browser-teach-name]", "Monthly export");
    assert.equal(container.querySelector("[data-browser-teach-start]").disabled, false);
    await click(container, "[data-browser-teach-watch]");
    assert.equal(container.querySelector("[data-watch-initial]").dataset.watchInitial, "session-1");
    assert.equal(container.querySelector("[data-watch-task]").dataset.watchTask, "task-1");
    await click(container, "[data-browser-teach-start]");
    assert.equal(Boolean(container.querySelector("[data-browser-teaching-status]")), true);
    await click(container, "[data-browser-teach-save]");
    assert.equal(container.querySelector("[data-browser-flow-error]").dataset.browserFlowErrorCode, "INVALID_RESPONSE");
    assert.equal(Boolean(container.querySelector("[data-browser-teaching-status]")), true);
    assert.equal(container.textContent.includes("教学已停止，流程已保存。"), false);
    state.stopStatus = "saved";
    await click(container, "[data-browser-teach-save]");
    assert.equal(container.querySelector("[data-browser-teaching-status]"), null);
    assert.equal(Boolean(container.querySelector('[data-browser-flow="flow-taught"]')), true);
  });
});

test("rendered replay preserves queued, paused, approval and failed outcomes; failed retry clears old completion", async () => {
  const state = fixture();
  await mounted(state, async container => {
    await change(container, "[data-browser-teach-session]", "session-1");
    for (const status of ["queued", "paused", "blocked", "failed"]) {
      state.runStatus = status;
      await click(container, '[data-browser-flow="flow-1"] [data-browser-flow-run]');
      assert.equal(container.querySelector("[data-browser-flow-run-status]").dataset.browserFlowRunStatus, status);
      assert.equal(container.textContent.includes("流程已完成"), false);
    }
    state.runStatus = "completed";
    await click(container, "[data-browser-flow-run]");
    assert.equal(container.textContent.includes("流程已完成"), true);
    state.runStatus = "http-failed";
    await click(container, "[data-browser-flow-run]");
    assert.equal(container.querySelector("[data-browser-flow-run-status]"), null);
    assert.equal(container.textContent.includes("流程已完成"), false);
    assert.equal(container.querySelector("[data-browser-flow-error]").dataset.browserFlowErrorCode, "REPLAY_FAILED");
  });
});

test("rendered continuation is unavailable until the server receipt is ready and keeps the original browser", async () => {
  const state = fixture();
  state.sessions.push({ ...session(), id: "session-2", task_id: "task-2", session_version: 22 });
  await mounted(state, async container => {
    await change(container, "[data-browser-teach-session]", "session-1");
    await click(container, "[data-browser-flow-run]");
    assert.equal(container.querySelector("[data-browser-flow-continue]"), null);
    assert.equal(container.querySelector("[data-browser-flow-receipt-status]").dataset.browserFlowReceiptStatus, "awaiting_approval");
    state.receiptStatus = "ready"; state.receiptNext = 2;
    await click(container, "[data-browser-flow-receipt-refresh]");
    assert.equal(container.querySelector("[data-browser-flow-continue]").disabled, false);
    await change(container, "[data-browser-teach-session]", "session-2");
    state.runStatus = "completed";
    await click(container, "[data-browser-flow-continue]");
    const continued = state.calls.filter(call => call.url.endsWith("/run")).at(-1);
    assert.deepEqual(continued.body, { session_id: "session-1", expected_version: 7, incarnation: 3, run_id: "run-1" });
    assert.equal(container.textContent.includes("流程已完成"), true);
  });
});

test("another browser stays watchable while a replay request is pending without changing its binding", async () => {
  const state = fixture();
  state.runStatus = "completed";
  state.sessions.push({ ...session(), id: "session-2", title: "Other browser", task_id: "task-2" });
  const original = state.fetch;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  state.fetch = async call => {
    if (call.url.endsWith("/run")) await pending;
    return original(call);
  };
  await mounted(state, async container => {
    try {
      await change(container, "[data-browser-teach-session]", "session-1");
      await click(container, "[data-browser-flow-run]");
      assert.equal(container.querySelector('[data-browser-session-watch="session-2"]').disabled, false);
      await click(container, '[data-browser-session-watch="session-2"]');
      assert.equal(container.querySelector("[data-watch-initial]").dataset.watchInitial, "session-2");
      await act(async () => finish());
      await settle();
      const replay = state.calls.find(call => call.url.endsWith("/run"));
      assert.equal(replay.body.session_id, "session-1");
      assert.equal(container.querySelector("[data-browser-flow-run-status]").textContent.includes("执行浏览器：Report task"), true);
    } finally { finish(); }
  });
});

test("rendered capacity keeps admission and total cost unknown; fallback failures remain visible", async () => {
  const state = fixture();
  state.parallelFails = true;
  await mounted(state, async container => {
    const text = container.querySelector("[data-browser-parallel-capacity]").textContent;
    assert.equal(text.includes("容量未知"), true);
    assert.equal(text.includes("已占用或预留的浏览器名额：1"), true);
    assert.equal(text.includes("可新增浏览器数：未知"), true);
    assert.equal(text.includes("可新增浏览器数：3"), false);
    assert.equal(text.includes("CNY 0.6233"), true);
    assert.equal(text.includes("完整费用尚未确认"), true);
    assert.equal(text.includes("实际扣费状态尚未确认"), true);
    assert.equal(container.textContent.includes("并行概览暂不可用"), true);
    assert.equal(container.querySelectorAll("[data-browser-parallel-session]").length, 1);
    state.capacityFails = true;
    await click(container, "[data-browser-flows-refresh]");
    assert.equal(container.querySelector("[data-browser-parallel-cost]").textContent.includes("费用：未知"), true);
    assert.equal(container.querySelector("[data-browser-parallel-capacity]").textContent.includes("CNY 0.6233"), false);
  });
});

test("rendered downloads stay with their chosen session and private bytes become a browser download", async () => {
  const state = fixture();
  state.sessions.push({ ...session(), id: "session-2", title: "Another report", task_id: "task-2" });
  const previousCreate = URL.createObjectURL;
  const previousRevoke = URL.revokeObjectURL;
  const previousClick = window.HTMLAnchorElement.prototype.click;
  const blobs = [];
  const saves = [];
  URL.createObjectURL = blob => { blobs.push(blob); return "blob:private-download-test"; };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { saves.push({ href: this.href, filename: this.download }); };
  try {
    await mounted(state, async container => {
      await click(container, '[data-browser-downloads-open="session-1"]');
      assert.equal(container.querySelector("[data-browser-session-downloads]").dataset.browserSessionDownloads, "session-1");
      assert.equal(Boolean(container.querySelector('[data-browser-download="file-session-1"]')), true);
      assert.equal(container.querySelector('[data-browser-download-file="pending-session-1"]').disabled, true);
      assert.equal(container.querySelector('[data-browser-download-library="pending-session-1"]').disabled, true);
      await click(container, '[data-browser-download-file="file-session-1"]');
      assert.equal(blobs.length, 1);
      assert.equal(await blobs[0].text(), "a,b\n1,2");
      assert.deepEqual(saves, [{ href: "blob:private-download-test", filename: "session-1.csv" }]);
      assert.equal(container.textContent.includes("下载请求已交给浏览器。"), true);
      state.libraryFails = true;
      await click(container, '[data-browser-download-library="file-session-1"]');
      assert.equal(container.querySelector("[data-browser-flow-error]").dataset.browserFlowErrorCode, "LIBRARY_QUOTA_EXCEEDED");
      assert.equal(container.querySelector("[data-browser-download-library-saved]"), null);
      assert.equal(container.querySelector('[data-browser-download-library="file-session-1"]').disabled, false);
      state.libraryFails = false;
      await click(container, '[data-browser-download-library="file-session-1"]');
      assert.equal(container.querySelector('[data-browser-download-library="file-session-1"]').disabled, true);
      assert.equal(container.querySelector("[data-browser-download-library-saved]").textContent.includes("session-1.csv"), true);
      assert.equal(container.textContent.includes("已保存到我的库。"), true);
      assert.equal(blobs.length, 1);
      await click(container, '[data-browser-downloads-open="session-2"]');
      assert.equal(container.querySelector("[data-browser-session-downloads]").dataset.browserSessionDownloads, "session-2");
      assert.equal(container.querySelector('[data-browser-download="file-session-1"]'), null);
      assert.equal(Boolean(container.querySelector('[data-browser-download="file-session-2"]')), true);
      assert.equal(container.querySelector("[data-browser-download-library-saved]"), null);
      assert.equal(container.querySelector('[data-browser-download-library="file-session-2"]').disabled, false);
      assert.equal(container.querySelector("[data-browser-teach-session]").value, "session-2");
    });
  } finally {
    URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke; window.HTMLAnchorElement.prototype.click = previousClick;
  }
});
