import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import ts from "typescript";

// Offline DOM checks, with only browser auth and the gateway replaced.
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
function harness() {
  const state = { uid: "owner-1", locale: "en", vault: { enabled: true, limits: { max_secrets: 200, max_value_bytes: 12000 }, secrets: [item()], pending: [] }, references: [], writes: [], sealed: [], failWrite: null, sealKey: async () => ({ kid: "test" }), loadReferences: null };
  const api = load("api", { "./cloud-computer-api": { cloudComputerRequest: async () => { throw new Error("not used"); } } });
  Object.assign(api, {
    getVault: async () => structuredClone(state.vault),
    getVaultReferences: async () => ({ references: structuredClone(state.references) }),
    getProjectVaultReferences: async (projectId, signal) => state.loadReferences ? state.loadReferences(projectId, signal) : ({ references: structuredClone(state.references.filter((ref) => ref.project_id === projectId)) }),
    getVaultSealKey: (...args) => state.sealKey(...args),
    createVaultSecret: async (input) => {
      state.writes.push({ op: "create", input });
      if (state.failWrite) throw state.failWrite;
      const secret = item({ id: "created-secret", name: input.name, kind: input.kind, username: input.username, description: input.description });
      state.vault.secrets.push(secret);
      return { secret };
    },
    updateVaultSecret: async (id, input) => {
      state.writes.push({ op: "rotate", id, input });
      if (state.failWrite) throw state.failWrite;
      state.vault.secrets = state.vault.secrets.map((secret) => secret.id === id ? { ...secret, version: secret.version + 1 } : secret);
      return { secret: state.vault.secrets.find((secret) => secret.id === id) };
    },
    deleteVaultSecret: async (id) => { state.writes.push({ op: "delete", id }); state.vault.secrets = state.vault.secrets.filter((secret) => secret.id !== id); return { deleted: true, removing: 0 }; },
    createProjectVaultReference: async (projectId, input) => {
      state.writes.push({ op: "bind", projectId, input });
      if (state.failWrite) throw state.failWrite;
      const result = reference({ id: `reference-${state.references.length + 1}`, project_id: projectId, ...input });
      state.references.push(result);
      return { reference: result };
    },
    deleteProjectVaultReference: async (projectId, id) => {
      state.writes.push({ op: "unbind", projectId, id });
      const removed = state.references.find((ref) => ref.id === id);
      state.references = state.references.filter((ref) => ref.id !== id);
      return { reference: removed };
    },
  });
  const common = {
    "../../lib/auth/client": { AUTH_STATE_EVENT: "oceanleo:auth-state", getUserId: async () => state.uid },
    "../../lib/vault-api": api,
  };
  const settings = load("settings", { ...common,
    "../../i18n/useT.client": { useLocale: () => state.locale },
    "../../lib/vault-seal": { sealVaultValue: async (_key, context, value) => { state.sealed.push({ context, value }); return { v: 1, ct: "sealed-test-envelope" }; } },
  });
  const site = load("site", { ...common, "../../pages/settings/VaultSettingsSection": settings });
  return { state, api, ...settings, ...site };
}

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
async function mount(Component, props = {}) {
  const host = document.createElement("main"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Component, props)); });
  await flush();
  return { host, async render(next) { await act(async () => { root.render(React.createElement(Component, next)); }); await flush(); }, async close() { await act(async () => root.unmount()); host.remove(); } };
}
function button(host, label) { const node = [...host.querySelectorAll("button")].find((node) => node.textContent === label); assert.equal(Boolean(node), true, label); return node; }
async function click(node) { await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); }
async function change(node, value) {
  const prototype = node.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value); node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function submit(form) { await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await flush(); }

test("main add masks and clears a value before the seal key request completes; only its envelope is saved", async () => {
  const h = harness();
  const key = deferred(); h.state.sealKey = () => key.promise;
  const view = await mount(h.VaultSettingsSection);
  try {
    await click(button(view.host, "Add item"));
    const form = view.host.querySelector("form");
    await change(form.querySelector("input[id$='-name']"), "New service");
    const input = form.querySelector("input[type='password']");
    const value = randomUUID();
    await change(input, value);
    assert.equal(input.type, "password");
    await submit(form);
    assert.equal(input.value, "");
    assert.equal(h.state.writes.length, 0);
    assert.equal(button(view.host, "Add item").disabled, true);
    await act(async () => { key.resolve({ kid: "test" }); }); await flush();
    assert.equal(h.state.sealed[0].value === value, true);
    assert.deepEqual(h.state.sealed[0].context, { uid: "owner-1", op: "create", name: "New service", sid: undefined });
    assert.deepEqual(h.state.writes[0].input.sealed, { v: 1, ct: "sealed-test-envelope" });
    assert.equal(JSON.stringify(h.state.writes).includes(value), false);
    assert.equal(view.host.querySelector("form"), null);
    assert.equal(view.host.textContent.includes(value), false);
  } finally { await view.close(); }
});

test("cancel, rejected submission and account changes never retain or restore a secret input", async () => {
  const h = harness();
  const view = await mount(h.VaultSettingsSection);
  try {
    await click(button(view.host, "Add item"));
    await change(view.host.querySelector("input[type='password']"), randomUUID());
    await click(button(view.host, "Cancel"));
    await click(button(view.host, "Add item"));
    assert.equal(view.host.querySelector("input[type='password']").value, "");
    await change(view.host.querySelector("input[id$='-name']"), "Rejected");
    const value = randomUUID();
    await change(view.host.querySelector("input[type='password']"), value);
    h.state.failWrite = new Error(value);
    await submit(view.host.querySelector("form"));
    assert.equal(view.host.querySelector("input[type='password']").value, "");
    assert.equal(view.host.querySelector("[role='alert']").textContent.includes(value), false);
    await change(view.host.querySelector("input[type='password']"), value);
    h.state.uid = null;
    await act(async () => { window.dispatchEvent(new Event("oceanleo:auth-state")); }); await flush();
    assert.equal(view.host.querySelector("input[type='password']"), null);
    assert.match(view.host.textContent, /Sign in to manage/);
  } finally { await view.close(); }
});

test("rotation keeps item identity, shows used-by references and asks before deleting the main item", async () => {
  const h = harness(); h.state.references = [reference()];
  const view = await mount(h.VaultSettingsSection);
  try {
    assert.match(view.host.textContent, /project-1/);
    assert.match(view.host.textContent, /MAIL_KEY/);
    await click(button(view.host, "Rotate"));
    await change(view.host.querySelector("input[type='password']"), randomUUID());
    await submit(view.host.querySelector("form"));
    assert.equal(h.state.writes[0].op, "rotate"); assert.equal(h.state.writes[0].id, "secret-1");
    assert.equal(h.state.sealed[0].context.op, "update"); assert.equal(h.state.sealed[0].context.sid, "secret-1");
    assert.match(view.host.textContent, /Version 2/);
    await click(button(view.host, "Delete"));
    assert.equal(h.state.writes.length, 1);
    assert.match(view.host.querySelector("[role='alert']").textContent, /invalidates every reference/);
    await click(button(view.host, "Delete item"));
    assert.equal(h.state.writes.at(-1).op, "delete");
    assert.equal(view.host.querySelector("[data-vault-item]"), null);
  } finally { await view.close(); }
});

test("project picker sends only an existing secret reference, isolates environments, and revokes on remove", async () => {
  const h = harness(); let changed = 0;
  const view = await mount(h.SiteVaultPanel, { projectId: "project-1", onChanged: () => { changed++; } });
  try {
    assert.equal(view.host.querySelector("input[type='password']"), null);
    await change(view.host.querySelector("select[id$='-secret']"), "secret-1");
    await change(view.host.querySelector("input[id$='-env']"), "MAIL_KEY");
    await change(view.host.querySelector("select[id$='-environment']"), "production");
    await submit(view.host.querySelector("form"));
    assert.deepEqual(h.state.writes[0], { op: "bind", projectId: "project-1", input: { secret_id: "secret-1", purpose: "runtime_env", env_name: "MAIL_KEY", environment: "production" } });
    assert.equal(changed, 1);
    assert.match(view.host.querySelector("[data-vault-reference]").textContent, /Production/);
    await click(button(view.host, "Remove"));
    assert.equal(h.state.writes.length, 1);
    await click(button(view.host, "Remove reference"));
    assert.deepEqual(h.state.writes[1], { op: "unbind", projectId: "project-1", id: "reference-1" });
    assert.equal(view.host.querySelector("[data-vault-reference]"), null);
    assert.equal(h.state.vault.secrets.length, 1, "revoking a small-vault ref must keep the main item");
    assert.equal(changed, 2);
  } finally { await view.close(); }
});

test("public/system env names, duplicate names and stale main items cannot be bound", async () => {
  const h = harness(); h.state.references = [reference()];
  const view = await mount(h.SiteVaultPanel, { projectId: "project-1" });
  try {
    await change(view.host.querySelector("select[id$='-secret']"), "secret-1");
    for (const name of ["NEXT_PUBLIC_KEY", "VITE_KEY", "PATH", "lowercase", "MAIL_KEY"]) {
      await change(view.host.querySelector("input[id$='-env']"), name);
      assert.equal(button(view.host, "Add reference").disabled, true, name);
    }
    await change(view.host.querySelector("input[id$='-env']"), "OTHER_KEY");
    assert.equal(button(view.host, "Add reference").disabled, false);
    h.state.vault.secrets[0].needs_reentry = true;
    await act(async () => { window.dispatchEvent(new Event("oceanleo:auth-state")); }); await flush();
    assert.equal(view.host.querySelector("option[value='secret-1']").disabled, true);
    assert.equal(button(view.host, "Add reference").disabled, true);
  } finally { await view.close(); }
});

test("switching projects aborts old loads so a late response cannot expose the previous project's refs", async () => {
  const h = harness(); const old = deferred(); let oldSignal;
  h.state.loadReferences = (projectId, signal) => {
    if (projectId === "old-project") { oldSignal = signal; return old.promise; }
    return { references: [reference({ id: "new-reference", project_id: "new-project", secret_name: "New project secret" })] };
  };
  const view = await mount(h.SiteVaultPanel, { projectId: "old-project" });
  try {
    await view.render({ projectId: "new-project" });
    assert.equal(oldSignal.aborted, true);
    await act(async () => { old.resolve({ references: [reference({ secret_name: "Old project secret" })] }); }); await flush();
    assert.match(view.host.textContent, /New project secret/);
    assert.equal(view.host.textContent.includes("Old project secret"), false);
  } finally { await view.close(); }
});

test("disabled vaults show their actual state with no add forms", async () => {
  const h = harness(); h.state.vault.enabled = false;
  const main = await mount(h.VaultSettingsSection);
  const site = await mount(h.SiteVaultPanel, { projectId: "project-1" });
  try {
    for (const view of [main, site]) { assert.match(view.host.textContent, /not enabled/); assert.equal(view.host.querySelector("form"), null); }
    assert.equal(h.state.writes.length, 0);
  } finally { await main.close(); await site.close(); }
});

test("secret surfaces contain no reveal/persistence/telemetry or raw-card form paths", () => {
  assert.doesNotMatch(sources.settings + sources.site, /localStorage|sessionStorage|console\.|captureException|sendBeacon|type=\{[^}]+\}/);
  assert.match(sources.settings, /type="password"/);
  assert.doesNotMatch(sources.site, /type="password"|sealVaultValue|createVaultSecret/);
  assert.doesNotMatch(sources.settings, /name="(?:card_number|cvv|cvc)"/);
});
