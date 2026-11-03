import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import ts from "typescript";

// Offline DOM checks for 「恢复」 after an unsettled vault change. Only browser
// auth, the gateway transport and the notice clock are replaced.
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://vault.invalid/settings/vault", pretendToBeVisual: true });
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLSelectElement: dom.window.HTMLSelectElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

// The notice uses window timers; React captured the Node timers at import.
const clock = { now: Date.UTC(2026, 10, 4, 3, 0, 0), next: 1, timers: new Map() };
Date.now = () => clock.now;
dom.window.setTimeout = (callback, delay = 0) => { const id = clock.next++; clock.timers.set(id, { callback, at: clock.now + delay }); return id; };
dom.window.clearTimeout = (id) => { clock.timers.delete(id); };
async function advance(ms) {
  const end = clock.now + ms;
  for (;;) {
    const due = [...clock.timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    clock.timers.delete(due[0]); clock.now = due[1].at;
    await act(async () => { due[1].callback(); });
  }
  clock.now = end;
  await flush();
}

const rootUrl = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, rootUrl), "utf8");
const sources = {
  api: read("src/lib/vault-api.ts"),
  settings: read("src/pages/settings/VaultSettingsSection.tsx"),
  site: read("src/shell/website-platform/SiteVaultPanel.tsx"),
};
const compiled = Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText]));
function load(key, dependencies) {
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled[key])((name) => {
    if (name in dependencies) return dependencies[name];
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    throw new Error(`unexpected test import: ${name}`);
  }, module, module.exports);
  return module.exports;
}

function item(overrides = {}) {
  return { id: "secret-1", name: "Mail service", kind: "api_key", username: "", description: "Transactional mail", fingerprint: "abcd…wxyz", version: 1, value_len: 32, created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z", last_used_at: null, needs_reentry: false, machines: [], ...overrides };
}
function reference(overrides = {}) {
  return { id: "reference-1", secret_id: "secret-1", secret_name: "Mail service", kind: "api_key", fingerprint: "abcd…wxyz", version: 1, scope: "project", project_id: "project-1", env_name: "MAIL_KEY", environment: "preview", purpose: "runtime_env", origin: "", created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z", binding: {}, ...overrides };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
// Transport errors shaped like CloudComputerError plus the fence detail fields.
function transport(status, code, extra = {}) { return Object.assign(new Error(extra.message || code), { status, code, ...extra }); }

function harness() {
  const state = {
    uid: "owner-1", locale: "en", requests: [], reads: 0, writes: [],
    vault: { enabled: true, limits: { max_secrets: 200, max_value_bytes: 12000 }, secrets: [item()], pending: [] },
    references: [reference()],
    // Gateway routes not replaced below go through the real vault-api request mapping.
    route: { "GET /v1/vault/fence-status": () => ({ fences: [] }), "POST /v1/vault/recover": () => ({ recovery: { recovered: 1, runtime_restart_required: [], pending: [] } }) },
    readError: null,
  };
  const api = load("api", { "./cloud-computer-api": { cloudComputerRequest: async (path, init) => {
    const key = `${init.method} ${path}`;
    state.requests.push({ key, body: init.body, signal: init.signal });
    const handler = state.route[key];
    if (!handler) throw transport(404, "not_found");
    return handler(init);
  } } });
  Object.assign(api, {
    getVault: async () => { state.reads += 1; if (state.readError) { const error = state.readError; state.readError = null; throw error; } return structuredClone(state.vault); },
    getVaultReferences: async () => ({ references: structuredClone(state.references) }),
    getProjectVaultReferences: async (projectId) => ({ references: structuredClone(state.references.filter((ref) => ref.project_id === projectId)) }),
    getVaultSealKey: async () => ({ kid: "test" }),
    deleteVaultSecret: async (id) => { state.writes.push({ op: "delete", id }); if (state.failWrite) throw state.failWrite; return { deleted: true, removing: 0 }; },
    deleteProjectVaultReference: async (projectId, id) => { state.writes.push({ op: "unbind", projectId, id }); if (state.failWrite) throw state.failWrite; return { reference: reference() }; },
  });
  const common = {
    "../../lib/auth/client": { AUTH_STATE_EVENT: "oceanleo:auth-state", getUserId: async () => state.uid },
    "../../lib/vault-api": api,
  };
  const settings = load("settings", { ...common,
    "./settings-tabs": { openSettingsModal: () => {} },
    "../../i18n/useT.client": { useLocale: () => state.locale },
    "../../lib/vault-seal": { sealVaultValue: async () => ({ v: 1, ct: "sealed-test-envelope" }) },
  });
  const site = load("site", { ...common, "../../pages/settings/VaultSettingsSection": settings });
  return { state, api, ...settings, ...site };
}

async function flush() { await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); }); }
async function mount(Component, props = {}) {
  const host = document.createElement("main"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Component, props)); });
  await flush();
  return { host, async render(next) { await act(async () => { root.render(React.createElement(Component, next)); }); await flush(); }, async close() { await act(async () => root.unmount()); host.remove(); } };
}
function button(host, label) { const node = [...host.querySelectorAll("button")].find((node) => node.textContent === label); assert.equal(Boolean(node), true, label); return node; }
async function click(node) { await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); }
const notice = (host) => host.querySelector("[data-vault-fence]");
const recoverButton = (host) => notice(host).querySelector("button");

// UC-NONE
// Fence error parsing changes no browser trust, origin or database permissions.
test("fence errors keep only their code and numeric wait; fence status and recovery use the shared gateway helper", async () => {
  const h = harness();
  const marker = randomUUID();
  for (const [error, code, wait] of [
    [transport(503, "vault_runtime_fence_settling", { retry_after: 90.2, message: marker }), "fence_settling", 91],
    [transport(503, "vault_runtime_fence_settling", { detail: { retry_after: 30, message: marker } }), "fence_settling", 30],
    [transport(503, "vault_runtime_fence_settling", { message: marker }), "fence_settling", null],
    [transport(503, "vault_runtime_fence_uncertain", { message: marker }), "fence_uncertain", null],
    [transport(503, "vault_runtime_fence_busy", { retry_after: -4 }), "fence_busy", null],
    [transport(503, "vault_runtime_fence_settling", { retry_after: 9e9 }), "fence_settling", 86400],
  ]) {
    h.state.route["POST /v1/vault/recover"] = () => { throw error; };
    await assert.rejects(h.api.recoverVault(), (cause) => {
      assert.equal(cause instanceof h.api.VaultApiError, true);
      assert.equal(cause.code, code); assert.equal(cause.retryAfter, wait); assert.equal(cause.status, 503);
      assert.equal(JSON.stringify(cause).includes(marker) || cause.message.includes(marker), false);
      return true;
    });
  }
  assert.equal(h.api.vaultFenceState(new h.api.VaultApiError("fence_busy", 503)), null);
  assert.equal(h.api.vaultFenceState(new Error("fence_settling")), null);

  const signal = new AbortController().signal;
  h.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "project", project_id: "project-1", state: "held", retry_after: 120, message: marker }, { scope: "bogus", state: "held" }, null, { scope: "owner", project_id: null, state: "uncertain" }] });
  h.state.route["POST /v1/vault/recover"] = () => ({ recovery: { recovered: 2, runtime_restart_required: ["project-1", 7], pending: [{ project_id: "project-2", retry_after: 15 }, { retry_after: 3 }], token: marker } });
  assert.deepEqual(await h.api.getVaultFenceStatus(signal), { fences: [{ scope: "project", project_id: "project-1", state: "held", retry_after: 120 }, { scope: "owner", project_id: null, state: "uncertain", retry_after: 0 }] });
  assert.deepEqual(await h.api.recoverVault(signal), { recovery: { recovered: 2, runtime_restart_required: ["project-1"], pending: [{ project_id: "project-2", retry_after: 15 }] } });
  assert.deepEqual(h.state.requests.slice(-2).map(({ key, body, signal: used }) => [key, body, used === signal]), [["GET /v1/vault/fence-status", undefined, true], ["POST /v1/vault/recover", undefined, true]]);
  for (const status of [404, 503]) {
    h.state.route["GET /v1/vault/fence-status"] = () => { throw transport(status, `client_http_${status}`); };
    assert.equal(await h.api.getVaultFenceStatus(), null, `old gateway ${status} is unknown`);
  }
  h.state.route["GET /v1/vault/fence-status"] = () => ({ status: "ok" });
  assert.equal(await h.api.getVaultFenceStatus(), null);
  h.state.route["GET /v1/vault/fence-status"] = () => { throw transport(403, "reauth_required"); };
  await assert.rejects(h.api.getVaultFenceStatus(), { code: "reauth_required" });
  h.state.route["POST /v1/vault/recover"] = () => { throw transport(403, "reauth_required"); };
  await assert.rejects(h.api.recoverVault(), { code: "reauth_required" });
  assert.doesNotMatch(sources.api, /console\.|\bfetch\(|setTimeout/);
});

// UC-NONE
// Recovery notice checks change no browser trust, origin or database permissions.
test("settling with a countdown disables 「恢复」 until it ends; recovery refreshes and clears the notice", async () => {
  const h = harness();
  const marker = randomUUID();
  h.state.failWrite = new h.api.VaultApiError("fence_settling", 503, 90);
  h.state.failWrite.message = marker;
  const view = await mount(h.VaultSettingsSection);
  try {
    await click(button(view.host, "Delete")); await click(button(view.host, "Delete item"));
    assert.match(notice(view.host).textContent, /not been confirmed yet/);
    assert.match(notice(view.host).textContent, /about 2 min/);
    assert.equal(recoverButton(view.host).disabled, true);
    assert.equal(view.host.querySelector("[role='alert']")?.textContent.includes("could not be completed") ?? false, false, "one calm notice, not an error banner");
    assert.match(view.host.textContent, /Mail service/, "existing items stay visible");
    assert.equal(button(view.host, "Rotate").disabled, false);
    assert.equal(clock.timers.size, 1);
    await advance(30_000);
    assert.match(notice(view.host).textContent, /about 1 min/);
    assert.equal(recoverButton(view.host).disabled, true);
    assert.equal(clock.timers.size, 1, "one timer at a time");
    await advance(60_000);
    assert.equal(recoverButton(view.host).disabled, false);
    assert.doesNotMatch(notice(view.host).textContent, /about/);
    assert.equal(clock.timers.size, 0);
    const reads = h.state.reads;
    await click(recoverButton(view.host));
    assert.equal(h.state.requests.filter(({ key }) => key === "POST /v1/vault/recover").length, 1);
    assert.equal(h.state.reads, reads + 1, "recovery refreshes vault metadata");
    assert.equal(notice(view.host), null);
    assert.match(view.host.textContent, /Recovered\./);
    assert.equal(h.state.writes.length, 1, "recovery never retries the interrupted write");
    assert.equal(view.host.textContent.includes(marker), false);
  } finally { await view.close(); }
});

test("uncertain without retry_after enables 「恢复」 at once, even when the first read fails", async () => {
  const h = harness();
  h.state.readError = new h.api.VaultApiError("fence_uncertain", 503);
  h.state.route["GET /v1/vault/fence-status"] = () => { throw transport(404, "not_found"); };
  const view = await mount(h.VaultSettingsSection);
  try {
    assert.equal(notice(view.host).getAttribute("data-vault-fence"), "uncertain");
    assert.equal(recoverButton(view.host).disabled, false);
    assert.equal(clock.timers.size, 0);
    assert.equal(view.host.querySelector("[role='alert']"), null);
    await click(recoverButton(view.host));
    assert.equal(notice(view.host), null);
    assert.match(view.host.textContent, /Mail service/);
  } finally { await view.close(); }
});

test("settling without a wait in the error reads fence status for the countdown; recovery may itself still be settling", async () => {
  const h = harness();
  h.state.failWrite = new h.api.VaultApiError("fence_settling", 503);
  const view = await mount(h.VaultSettingsSection);
  try {
    h.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "project", project_id: "project-1", state: "held", retry_after: 150 }] });
    await click(button(view.host, "Delete")); await click(button(view.host, "Delete item"));
    assert.match(notice(view.host).textContent, /about 3 min/);
    await advance(150_000);
    h.state.route["POST /v1/vault/recover"] = () => { throw transport(503, "vault_runtime_fence_settling", { retry_after: 45 }); };
    await click(recoverButton(view.host));
    assert.match(notice(view.host).textContent, /about 1 min/);
    assert.equal(recoverButton(view.host).disabled, true);
    await advance(45_000);
    h.state.route["POST /v1/vault/recover"] = () => ({ recovery: { recovered: 0, runtime_restart_required: [], pending: [{ project_id: "project-1", retry_after: 20 }] } });
    await click(recoverButton(view.host));
    assert.match(notice(view.host).textContent, /about 1 min/, "pending projects keep a countdown");
    assert.doesNotMatch(view.host.textContent, /Recovered\./);
  } finally { await view.close(); }
});

test("restart-required counts websites in the main vault and names only this site in the small vault", async () => {
  const main = harness();
  main.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "owner", project_id: null, state: "uncertain", retry_after: 0 }] });
  main.state.route["POST /v1/vault/recover"] = () => ({ recovery: { recovered: 3, runtime_restart_required: ["project-1", "project-2", "project-2"], pending: [] } });
  let view = await mount(main.VaultSettingsSection);
  try {
    await click(recoverButton(view.host));
    assert.match(view.host.textContent, /Recovered\. 2 websites need a restart to use the latest secret\./);
  } finally { await view.close(); }

  for (const [restart, expected] of [[["project-9", "project-1"], true], [["project-9"], false]]) {
    const h = harness(); let changed = 0;
    h.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "project", project_id: "project-1", state: "uncertain", retry_after: 0 }] });
    h.state.route["POST /v1/vault/recover"] = () => ({ recovery: { recovered: 1, runtime_restart_required: restart, pending: [{ project_id: "project-9", retry_after: 300 }] } });
    view = await mount(h.SiteVaultPanel, { projectId: "project-1", onChanged: () => { changed += 1; } });
    try {
      assert.match(notice(view.host).textContent, /this website is not using the new secret/);
      await click(recoverButton(view.host));
      assert.equal(notice(view.host), null, "another site's pending recovery is not shown here");
      assert.match(view.host.textContent, /Recovered\./);
      assert.equal(/Restart this website to use the latest secret\./.test(view.host.textContent), expected);
      assert.doesNotMatch(view.host.textContent, /websites need/);
      assert.equal(changed, 1);
      assert.equal(view.host.querySelector("[data-vault-reference]") !== null, true);
    } finally { await view.close(); }
  }
});

test("small vault shows only fences for this owner or this site", async () => {
  const h = harness();
  h.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "project", project_id: "project-2", state: "uncertain", retry_after: 0 }] });
  let view = await mount(h.SiteVaultPanel, { projectId: "project-1" });
  try { assert.equal(notice(view.host), null); } finally { await view.close(); }
  h.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "project", project_id: "project-2", state: "uncertain", retry_after: 0 }, { scope: "project", project_id: "project-1", state: "held", retry_after: 120 }] });
  view = await mount(h.SiteVaultPanel, { projectId: "project-1" });
  try {
    assert.match(notice(view.host).textContent, /about 2 min/);
    assert.equal(recoverButton(view.host).disabled, true);
    assert.match(view.host.textContent, /MAIL_KEY/, "references stay visible");
    // Switching projects drops the old notice and its timer.
    await view.render({ projectId: "project-3" });
    assert.equal(notice(view.host), null);
    assert.equal(clock.timers.size, 0);
  } finally { await view.close(); }
});

test("an old gateway without fence status shows nothing extra on either surface", async () => {
  for (const status of [404, 503]) {
    const h = harness();
    h.state.route["GET /v1/vault/fence-status"] = () => { throw transport(status, `client_http_${status}`); };
    for (const [Component, props] of [[h.VaultSettingsSection, {}], [h.SiteVaultPanel, { projectId: "project-1" }]]) {
      const view = await mount(Component, props);
      try {
        assert.equal(h.state.requests.some(({ key }) => key === "GET /v1/vault/fence-status"), true);
        assert.equal(notice(view.host), null);
        assert.equal(view.host.querySelector("[role='alert']"), null);
        assert.match(view.host.textContent, /Mail service/);
      } finally { await view.close(); }
    }
  }
});

test("another running change is an ordinary retry message without 「恢复」", async () => {
  const h = harness();
  h.state.failWrite = new h.api.VaultApiError("fence_busy", 503);
  const view = await mount(h.SiteVaultPanel, { projectId: "project-1" });
  try {
    await click(button(view.host, "Remove")); await click(button(view.host, "Remove reference"));
    assert.match(view.host.querySelector("[role='alert']").textContent, /Another vault change is in progress/);
    assert.equal(notice(view.host), null);
  } finally { await view.close(); }
});

test("no countdown timer survives unmount on either surface", async () => {
  for (const surface of ["main", "site"]) {
    const h = harness();
    h.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "owner", project_id: null, state: "held", retry_after: 600 }] });
    const view = surface === "main" ? await mount(h.VaultSettingsSection) : await mount(h.SiteVaultPanel, { projectId: "project-1" });
    assert.match(notice(view.host).textContent, /about 10 min/);
    assert.equal(clock.timers.size, 1);
    await view.close();
    assert.equal(clock.timers.size, 0, surface);
  }
});

test("a language switch during recovery neither aborts nor reassigns it", async () => {
  for (const surface of ["main", "site"]) {
    const h = harness(); const pending = deferred(); let requestSignal;
    h.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "owner", project_id: null, state: "uncertain", retry_after: 0 }] });
    h.state.route["POST /v1/vault/recover"] = async ({ signal }) => { requestSignal = signal; await pending.promise; return { recovery: { recovered: 1, runtime_restart_required: ["project-1"], pending: [] } }; };
    const props = surface === "main" ? {} : { projectId: "project-1" };
    const view = await mount(surface === "main" ? h.VaultSettingsSection : h.SiteVaultPanel, props);
    try {
      await click(button(view.host, "Recover"));
      assert.equal(recoverButton(view.host).disabled, true);
      h.state.locale = "zh"; await view.render(props);
      assert.equal(requestSignal.aborted, false, "changing labels must not abort recovery");
      assert.equal(button(view.host, "恢复").disabled, true);
      await act(async () => pending.resolve()); await flush();
      assert.equal(notice(view.host), null);
      assert.match(view.host.textContent, surface === "main" ? /已恢复。有 1 个网站需要重新启动后才会使用最新密钥。/ : /已恢复。此网站需要重新启动后才会使用最新密钥。/);
      assert.equal(h.state.requests.filter(({ key }) => key === "POST /v1/vault/recover").length, 1);
    } finally { await view.close(); }
  }
});

// UC-NONE
// First-party vault notice text; no origin, iframe, injection sink or cookie surface involved.
test("recovery surfaces never render transport text or secret values", async () => {
  const h = harness();
  const canary = randomUUID();
  h.state.vault.secrets = [item({ description: "" })];
  h.state.route["GET /v1/vault/fence-status"] = () => ({ fences: [{ scope: "owner", project_id: null, state: "uncertain", retry_after: 0, message: canary, value: canary }] });
  h.state.route["POST /v1/vault/recover"] = () => { throw transport(503, "vault_runtime_fence_uncertain", { message: canary, body: canary, value: canary }); };
  for (const [Component, props] of [[h.VaultSettingsSection, {}], [h.SiteVaultPanel, { projectId: "project-1" }]]) {
    const view = await mount(Component, props);
    try {
      await click(recoverButton(view.host));
      assert.equal(notice(view.host).getAttribute("data-vault-fence"), "uncertain");
      assert.equal(view.host.innerHTML.includes(canary), false);
    } finally { await view.close(); }
  }
  assert.doesNotMatch(sources.settings + sources.site, /localStorage|sessionStorage|console\.|captureException|sendBeacon/);
});
