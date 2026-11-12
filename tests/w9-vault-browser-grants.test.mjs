import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import ts from "typescript";

// Offline DOM + actual vault API serialization; no browser, auth session or live data.
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://vault.invalid/settings/vault", pretendToBeVisual: true });
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const sources = {
  api: readFileSync(new URL("../src/lib/vault-api.ts", import.meta.url), "utf8"),
  settings: readFileSync(new URL("../src/pages/settings/VaultSettingsSection.tsx", import.meta.url), "utf8"),
};
const compiled = Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText]));
function load(key, dependencies) {
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled[key])((name) => {
    if (name in dependencies) return dependencies[name];
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    throw new Error(`unexpected test import: ${name}`);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const acceptedOrigins = new Map([
  ["https://EXAMPLE.test:443/", "https://example.test"], ["HTTPS://example.test", "https://example.test"],
  ["https://example.test:8443/", "https://example.test:8443"], ["https://example.test:00443", "https://example.test"],
  ["https://[::1]:8443", "https://[::1]:8443"], ["https://bücher.example", "https://xn--bcher-kva.example"],
]);
function secret(id, name, kind = "password") {
  return { id, name, kind, username: "owner@example.test", description: "Saved login", fingerprint: "••••", version: 1, value_len: 32, created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z", last_used_at: null, needs_reentry: false, machines: [] };
}
function reference(input, id = "browser-ref-1") {
  return { id, ...input, secret_name: input.secret_id === firstId ? "First login" : "Second login", kind: "password", fingerprint: "••••••", version: 1, scope: "browser", project_id: null, env_name: "", environment: "preview", binding: {}, created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z" };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const state = {
    uid: "owner-1", locale: "en", requests: [], references: [], fences: [], privateValue: randomUUID(),
    vault: { enabled: true, limits: { max_secrets: 200, max_value_bytes: 12000 }, secrets: [secret(firstId, "First login"), secret(secondId, "Second login")], pending: [] },
    createGate: null, deleteGate: null, createError: null, committedError: false, failUsageAfterCommit: false, usageError: false,
  };
  const api = load("api", { "./cloud-computer-api": { cloudComputerRequest: async (path, init) => {
    state.requests.push({ path, ...init });
    if (path === "/v1/vault" && init.method === "GET") return structuredClone(state.vault);
    if (path === "/v1/vault/references" && init.method === "GET") {
      if (state.usageError) throw { status: 503, code: "vault_unavailable", message: state.privateValue };
      return { references: structuredClone(state.references) };
    }
    if (path === "/v1/vault/fence-status") return { fences: structuredClone(state.fences) };
    if (path === "/v1/vault/recover" && init.method === "POST") {
      state.fences = [];
      return { recovery: { recovered: 1, runtime_restart_required: [], pending: [] } };
    }
    if (path === "/v1/vault/browser-bindings" && init.method === "POST") {
      if (state.createGate) await state.createGate.promise;
      if (state.createError) throw state.createError;
      const input = JSON.parse(init.body);
      let ref = state.references.find((row) => row.secret_id === input.secret_id && row.origin === input.origin && row.purpose === input.purpose);
      if (!ref) { ref = reference(input, `browser-ref-${state.references.length + 1}`); state.references.push(ref); }
      if (state.failUsageAfterCommit) state.usageError = true;
      if (state.committedError) throw { status: 503, code: "vault_mutation_committed_runtime_unavailable", message: state.privateValue };
      return { reference: structuredClone(ref) };
    }
    if (path.startsWith("/v1/vault/browser-bindings/") && init.method === "DELETE") {
      if (state.deleteGate) await state.deleteGate.promise;
      const id = decodeURIComponent(path.split("/").at(-1));
      const ref = state.references.find((row) => row.id === id);
      state.references = state.references.filter((row) => row.id !== id);
      return { reference: structuredClone(ref) };
    }
    throw new Error(`unexpected metadata request: ${init.method} ${path}`);
  } } });
  const settings = load("settings", {
    "../../lib/vault-api": api,
    "../AuthDialog": { AuthPanel: ({ onClose }) => React.createElement("button", { onClick: onClose }, "Cancel sign-in") },
    "../../lib/auth/client": { AUTH_STATE_EVENT: "oceanleo:auth-state", getUserId: async () => state.uid },
    "../../i18n/useT.client": { useLocale: () => state.locale },
    "../../lib/vault-seal": { sealVaultValue: async () => { throw new Error("browser grants must not seal or read values"); } },
  });
  return { state, api, ...settings };
}
const writes = (h) => h.state.requests.filter((request) => request.method !== "GET");
const grants = (h) => writes(h).filter((request) => request.path === "/v1/vault/browser-bindings");
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
async function mount(h) {
  const host = document.createElement("main"); document.body.appendChild(host);
  const root = createRoot(host);
  const render = async () => { await act(async () => root.render(React.createElement(h.VaultSettingsSection))); await flush(); };
  await render();
  return { host, render, async close() { await act(async () => root.unmount()); host.remove(); } };
}
function button(host, label) { const node = [...host.querySelectorAll("button")].find((node) => node.textContent === label); assert.ok(node, label); return node; }
async function click(node) { assert.ok(node, "click target exists"); await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await flush(); }
async function change(node, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit(form) { await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await flush(); }
async function open(view, id = secondId) { await click(view.host.querySelector(`[data-vault-browser-authorize="${id}"]`)); return view.host.querySelector(`[data-vault-browser-grant="${id}"]`); }

// UC-NONE
// Exact-origin metadata cannot create a plaintext route or extend cookie/CORS trust; vault K1 forbids value release (docs/architecture/oceanleo-security-regression-matrix.md).
test("browser origin validation rejects URLs outside the exact HTTPS contract before a request", async () => {
  const h = harness();
  for (const [input, expected] of acceptedOrigins) assert.equal(h.api.normalizeVaultBrowserOrigin(input), expected, input);
  for (const origin of [null, 12, "", "example.test", "http://example.test", "https://", "https:///example.test", "https://example.test/path", "https://example.test/.", "https://example.test/..", "https://example.test//", "https://example.test?", "https://example.test#", "https://example.test/?q=1", "https://example.test/#fragment", "https://user:password@example.test", "https://@example.test", "https://*.example.test", "https://example.test\\", " https://example.test", "https://example.test ", "https://exam\nple.test", "https://%65xample.test", "https://example.test.", "https://example..test", "https://-example.test", "https://example-.test", "https://example.test:", "https://example.test:0", "https://example.test:65536", "https://example.test:abc"]) {
    assert.equal(h.api.normalizeVaultBrowserOrigin(origin), null, String(origin));
    await assert.rejects(h.api.createVaultBrowserBinding({ secret_id: secondId, purpose: "browser_login", origin }), { code: "invalid" });
  }
  assert.equal(h.state.requests.length, 0);
});

// UC-NONE
// Pure normalization checks compare exact origins with the vault authority; no value release or untrusted-content boundary changes (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("browser origin normalization agrees with the actual pure Python authority", (context) => {
  const h = harness();
  // Compare the actual pure Python authority without loading config, credentials or app code.
  const corePath = fileURLToPath(new URL("../../oceanleo/backend/app/vault/service.py", import.meta.url));
  if (!existsSync(corePath)) { context.skip("sibling backend source is unavailable in this standalone UI checkout"); return; }
  const program = `import ast,json,re,sys\nfrom urllib.parse import urlsplit\ntree=ast.parse(open(sys.argv[1],encoding="utf-8").read())\ncls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=="VaultService")\nfn=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=="_origin")\nfn.decorator_list=[]\nns={"re":re,"urlsplit":urlsplit,"VaultInvalid":ValueError}\nexec(compile(ast.Module(body=[fn],type_ignores=[]),"origin-policy","exec"),ns)\nprint(json.dumps([ns["_origin"](x) for x in json.load(sys.stdin)]))`;
  const python = JSON.parse(execFileSync("python3", ["-I", "-c", program, corePath], { input: JSON.stringify([...acceptedOrigins.keys()]), encoding: "utf8" }));
  assert.deepEqual([...acceptedOrigins.keys()].map((origin) => h.api.normalizeVaultBrowserOrigin(origin)), python);
});

// UC-NONE
// Closed browser-login metadata serialization lets no value leave the vault and changes no untrusted-content boundary (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("create helper whitelists the three browser-login fields and uses the current shared gateway signal", async () => {
  const h = harness(); const signal = new AbortController().signal;
  await h.api.createVaultBrowserBinding({ secret_id: secondId, purpose: "browser_login", origin: "https://EXAMPLE.test:443/", project_id: "unwanted-project", value: h.state.privateValue, ciphertext: h.state.privateValue, sealed: { ct: h.state.privateValue }, token: h.state.privateValue }, signal);
  const request = grants(h)[0];
  assert.deepEqual(JSON.parse(request.body), { secret_id: secondId, purpose: "browser_login", origin: "https://example.test" });
  assert.equal(request.signal, signal);
  assert.equal(request.body.includes(h.state.privateValue), false);
  await assert.rejects(h.api.createVaultBrowserBinding({ secret_id: secondId, purpose: "supabase_provision_password", origin: "https://example.test" }), { code: "invalid" });
  assert.equal(grants(h).length, 1);
});

// UC-NONE
// Owner-vault metadata-reference lifecycle tests K1/no value release; it changes no untrusted-content boundary (docs/architecture/oceanleo-security-regression-matrix.md).
test("an owner explicitly grants the selected saved item, sees its origin under Used by and revokes only that reference", async () => {
  const h = harness(); const view = await mount(h);
  try {
    assert.equal(writes(h).length, 0);
    let form = await open(view);
    assert.match(form.textContent, /Second login/);
    assert.equal(Boolean(form.querySelector("input[type='password'],select")), false);
    await change(form.querySelector("input"), "https://EXAMPLE.test:443/");
    assert.equal(writes(h).length, 0, "opening and typing cannot authorize");
    assert.equal(form.querySelector("[data-vault-browser-target] code").textContent, "https://example.test");
    await click(button(form, "Cancel"));
    assert.equal(writes(h).length, 0, "cancel is read-only");
    form = await open(view);
    assert.equal(form.querySelector("input").value, "");
    await change(form.querySelector("input"), "https://EXAMPLE.test:8443/");
    await submit(form);
    assert.deepEqual(JSON.parse(grants(h)[0].body), { secret_id: secondId, purpose: "browser_login", origin: "https://example.test:8443" });
    assert.equal(Boolean(view.host.querySelector("form")), false);
    const usage = view.host.querySelector(`[data-vault-item="${secondId}"] [data-vault-used-by]`);
    assert.ok(usage); assert.match(usage.textContent, /Browser sign-in.*https:\/\/example.test:8443/);
    assert.doesNotMatch(usage.textContent, /browser_login/, "current login grants show their readable purpose without the backend enum");
    assert.equal(Boolean(view.host.querySelector(`[data-vault-item="${firstId}"] [data-vault-used-by]`)), false);
    assert.match(view.host.textContent, /Second login is authorized for browser sign-in on https:\/\/example.test:8443/);
    assert.equal(view.host.innerHTML.includes(h.state.privateValue), false);
    assert.equal(JSON.stringify(h.state.requests).includes(h.state.privateValue), false);
    assert.equal(h.state.requests.some((request) => /seal-key|fill-credential|\/secrets\//.test(request.path)), false);
    await click(usage.querySelector("[data-vault-browser-remove]"));
    assert.equal(writes(h).length, 1, "revocation also requires confirmation");
    const confirmation = usage.querySelector("[data-vault-browser-remove-confirm]");
    assert.match(confirmation.textContent, /https:\/\/example.test:8443/);
    await click(button(confirmation, "Remove reference"));
    assert.equal(writes(h).at(-1).path, "/v1/vault/browser-bindings/browser-ref-1");
    assert.equal(writes(h).at(-1).method, "DELETE");
    assert.equal(Boolean(view.host.querySelector("[data-vault-used-by]")), false);
    assert.match(view.host.textContent, /has been revoked/);
  } finally { await view.close(); }
});

// UC-NONE
// Form origin validation adds no network authority and releases no value; it changes no untrusted-content boundary (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("invalid form origins show a correction without sending any grant", async () => {
  const h = harness(); const view = await mount(h);
  try {
    const form = await open(view);
    for (const origin of ["http://example.test", "https://user:password@example.test", "https://example.test/path", "https://example.test?", "https://example.test#", "https://*.example.test", "https://example.test:0"]) {
      await change(form.querySelector("input"), origin); await submit(form);
      assert.equal(form.querySelector("input").getAttribute("aria-invalid"), "true");
      assert.match(form.querySelector("[role='alert']").textContent, /exact HTTPS origin/);
      assert.equal(writes(h).length, 0);
    }
  } finally { await view.close(); }
});

// UC-NONE
// Duplicate owner metadata references do not create another grant or release values; no untrusted-content boundary changes (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("an existing same-item browser-login origin is shown honestly without a duplicate POST", async () => {
  const h = harness(); h.state.references = [reference({ secret_id: secondId, purpose: "browser_login", origin: "https://example.test" })];
  const view = await mount(h);
  try {
    const form = await open(view);
    await change(form.querySelector("input"), "https://EXAMPLE.test:443/");
    assert.match(form.textContent, /already authorized/);
    assert.equal(button(form, "Authorize login").disabled, true);
    await submit(form);
    assert.equal(writes(h).length, 0);
    await change(form.querySelector("input"), "https://example.test:8443");
    assert.equal(button(form, "Authorize login").disabled, false);
  } finally { await view.close(); }
});

// UC-NONE
// Pending owner consent cannot change its item or origin; this metadata lifecycle releases no value and changes no untrusted-content boundary (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("a language rerender preserves a pending create's item, origin, controller and completion", async () => {
  const h = harness(); h.state.createGate = deferred(); const view = await mount(h);
  try {
    const form = await open(view);
    await change(form.querySelector("input"), "https://login.example.test:8443");
    await submit(form);
    const request = grants(h)[0];
    assert.equal(form.querySelector("input").matches(":disabled"), true);
    assert.equal(button(form, "Cancel").disabled, true);
    assert.equal(view.host.querySelector(`[data-vault-browser-authorize="${firstId}"]`).disabled, true);
    await submit(form); assert.equal(grants(h).length, 1);
    h.state.locale = "zh-CN"; await view.render();
    assert.equal(request.signal.aborted, false);
    assert.equal(view.host.querySelector("form input").value, "https://login.example.test:8443");
    assert.match(view.host.querySelector("form").textContent, /授权中/);
    await act(async () => h.state.createGate.resolve()); await flush();
    assert.equal(request.signal.aborted, false);
    assert.equal(grants(h).length, 1);
    assert.equal(JSON.parse(request.body).secret_id, secondId);
    assert.equal(view.host.querySelector("[data-settings-pane='vault']").getAttribute("aria-busy"), "false");
    assert.equal(Boolean(view.host.querySelector("form")), false);
    assert.match(view.host.textContent, /已授权 Second login 用于 https:\/\/login.example.test:8443/);
    assert.equal(view.host.querySelector(`[data-vault-browser-authorize="${firstId}"]`).disabled, false);
  } finally { await view.close(); }
});

// UC-NONE
// Only the explicitly selected owner reference is revoked; no value is released and no untrusted-content boundary changes (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("a language rerender during browser revocation preserves its controller and revokes only its selected origin", async () => {
  const h = harness();
  h.state.references = [reference({ secret_id: secondId, purpose: "browser_login", origin: "https://example.test" }), reference({ secret_id: secondId, purpose: "browser_login", origin: "https://example.test:8443" }, "browser-ref-2")];
  h.state.deleteGate = deferred(); const view = await mount(h);
  try {
    let usage = view.host.querySelector('[data-vault-used-by="browser-ref-1"]');
    await click(usage.querySelector("[data-vault-browser-remove]"));
    await click(button(usage, "Cancel"));
    assert.equal(writes(h).length, 0, "cancelled revocation does not write");
    await click(usage.querySelector("[data-vault-browser-remove]"));
    await click(button(usage, "Remove reference"));
    const request = writes(h)[0];
    h.state.locale = "zh-CN"; await view.render();
    assert.equal(request.signal.aborted, false);
    usage = view.host.querySelector('[data-vault-used-by="browser-ref-1"]');
    assert.equal(button(usage, "确认移除").disabled, true);
    await act(async () => h.state.deleteGate.resolve()); await flush();
    assert.equal(request.signal.aborted, false);
    assert.equal(Boolean(view.host.querySelector('[data-vault-used-by="browser-ref-1"]')), false);
    assert.match(view.host.querySelector('[data-vault-used-by="browser-ref-2"]').textContent, /https:\/\/example.test:8443/);
    assert.match(view.host.textContent, /已撤销 https:\/\/example.test 的浏览器使用权限/);
    assert.equal(view.host.querySelector("[data-settings-pane='vault']").getAttribute("aria-busy"), "false");
  } finally { await view.close(); }
});

// UC-NONE
// Safe metadata-mutation errors retain no submitted secret and change no untrusted-content boundary (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("network, recent-auth, quota and fence refusals release controls and can be retried through existing recovery", async () => {
  for (const [raw, expected] of [
    [{ status: 0 }, /Cannot reach the vault/], [{ status: 403, code: "reauth_required" }, /Sign in again to confirm/],
    [{ status: 409, code: "vault_quota" }, /item limit/], [{ status: 429 }, /Too many requests/],
    [{ status: 403, code: "forbidden" }, /permission/], [{ status: 503 }, /could not be completed/],
    [{ status: 409, code: "vault_runtime_fence_busy" }, /Another vault change/],
    [{ status: 503, code: "vault_runtime_fence_uncertain", retry_after: 0 }, /last vault change/],
  ]) {
    const h = harness(); h.state.createError = { ...raw, message: h.state.privateValue };
    const view = await mount(h);
    try {
      const form = await open(view);
      await change(form.querySelector("input"), "https://example.test"); await submit(form);
      if (raw.code === "reauth_required") {
        assert.ok(view.host.querySelector("[data-vault-reauth]"));
        await click(button(view.host, "Cancel sign-in"));
      } else assert.match(view.host.textContent, expected);
      assert.equal(form.querySelector("input").matches(":disabled"), false);
      assert.equal(button(form, "Authorize login").disabled, false);
      assert.equal(view.host.innerHTML.includes(h.state.privateValue), false);
      assert.equal(h.state.references.length, 0);
      h.state.createError = null;
      if (raw.code === "vault_runtime_fence_uncertain") await click(button(view.host, "Recover"));
      await submit(form);
      assert.equal(h.state.references.length, 1);
      assert.equal(Boolean(view.host.querySelector("form")), false);
      assert.equal(view.host.querySelector("[data-settings-pane='vault']").getAttribute("aria-busy"), "false");
    } finally { await view.close(); }
  }
});

// UC-NONE
// A read failure never rolls back a confirmed metadata reference; no value release or untrusted-content boundary changes (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("a successful create stays visible and removable when the normal usage refresh fails", async () => {
  const h = harness(); h.state.failUsageAfterCommit = true; const view = await mount(h);
  try {
    const form = await open(view); await change(form.querySelector("input"), "https://example.test"); await submit(form);
    assert.equal(grants(h).length, 1);
    assert.equal(Boolean(view.host.querySelector("form")), false);
    assert.match(view.host.textContent, /is authorized for browser sign-in/);
    assert.match(view.host.querySelector("[role='alert']").textContent, /change was saved.*usage locations could not be refreshed/);
    const usage = view.host.querySelector("[data-vault-used-by]");
    assert.ok(usage); assert.match(usage.textContent, /https:\/\/example.test/);
    await click(usage.querySelector("[data-vault-browser-remove]"));
    await click(button(usage, "Remove reference"));
    assert.equal(Boolean(view.host.querySelector("[data-vault-used-by]")), false, "the revoked grant cannot reappear after a failed refresh");
    h.state.usageError = false; await click(button(view.host.querySelector("[role='alert']"), "Refresh"));
    assert.equal(grants(h).length, 1, "refresh never repeats a confirmed grant");
  } finally { await view.close(); }
});

// UC-NONE
// Already committed owner metadata changes must not be repeated; no value release or untrusted-content boundary changes (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("a committed-error response closes the grant form, reloads normal usage and keeps the existing saved-change notice", async () => {
  const h = harness(); h.state.committedError = true; const view = await mount(h);
  try {
    const form = await open(view); await change(form.querySelector("input"), "https://example.test"); await submit(form);
    assert.equal(Boolean(view.host.querySelector("form")), false);
    assert.match(view.host.querySelector("[data-vault-committed]").textContent, /change was saved/);
    assert.match(view.host.querySelector("[data-vault-used-by]").textContent, /https:\/\/example.test/);
    await click(button(view.host.querySelector("[data-vault-committed]"), "Refresh"));
    assert.equal(grants(h).length, 1);
    assert.equal(view.host.innerHTML.includes(h.state.privateValue), false);
    assert.equal(view.host.querySelector("[data-settings-pane='vault']").getAttribute("aria-busy"), "false");
  } finally { await view.close(); }
});

// UC-NONE
// Owner account lifetime remains the metadata-consent boundary; no value release or untrusted-content boundary changes (K1, docs/architecture/oceanleo-security-regression-matrix.md).
test("signing out during a pending grant aborts its UI lifetime and never restores the old account form", async () => {
  const h = harness(); h.state.createGate = deferred(); const view = await mount(h);
  try {
    const form = await open(view); await change(form.querySelector("input"), "https://example.test"); await submit(form);
    const request = grants(h)[0]; h.state.uid = null;
    await act(async () => window.dispatchEvent(new Event("oceanleo:auth-state"))); await flush();
    assert.equal(request.signal.aborted, true);
    await act(async () => h.state.createGate.resolve()); await flush();
    assert.match(view.host.textContent, /Sign in to manage/);
    assert.equal(Boolean(view.host.querySelector("form,[data-vault-used-by]")), false);
  } finally { await view.close(); }
});
