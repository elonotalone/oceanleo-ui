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

const clientSource = readFileSync(new URL("../src/lib/auth/client.ts", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("../src/shell/auth/StepUpDialog.tsx", import.meta.url), "utf8");
function compile(source, dependencies, extra = "") {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", js + extra)((name) => {
    if (name in dependencies) return dependencies[name];
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    return {};
  }, result, result.exports);
  return result.exports;
}
function harness(factors = []) {
  const state = { factors, calls: [], completed: 0, closed: 0, error: null };
  const user = { id: "owner", email: "owner@example.test" };
  state.user = user;
  state.session = { user, access_token: "initial" };
  const result = () => ({ error: state.error });
  const sdk = { auth: {
    getUser: async () => ({ data: { user: state.user }, error: null }),
    getSession: async () => ({ data: { session: state.session } }),
    signInWithOtp: async (input) => { state.calls.push(["email", input]); return result(); },
    verifyOtp: async (input) => { state.calls.push(["verify-email", input]); return { ...result(), data: { user: state.user, session: { ...state.session, access_token: "email-fresh" } } }; },
    mfa: {
      listFactors: async () => ({ data: { all: state.factors }, error: state.listError }),
      challengeAndVerify: async (input) => { state.calls.push(["totp", input]); return result(); },
      webauthn: {
        register: async (input) => { state.calls.push(["register", input]); return result(); },
        authenticate: async (input) => { state.calls.push(["passkey", input]); return result(); },
      },
    },
  } };
  const client = compile(clientSource, {
    "./config": { configured: () => true },
    "../../contracts/client-host-config": { clientHostConfigGeneration: () => 0, getClientHostConfig: () => null },
    "./oauth-return": { waitForBrowserOauthReturn: async () => true },
    "./captcha": { getCaptchaToken: async () => null },
  }, "\nexports.setClient = value => { _client = value; _hostClientGeneration = 0; };");
  client.setClient(sdk);
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  window.PublicKeyCredential = class {};
  const { StepUpDialog } = compile(dialogSource, { "../../lib/auth/client": client, "../../i18n/ui/useUI": { useUI: () => (key) => key } });
  return { state, client, StepUpDialog };
}
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); }
async function mount(h) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(h.StepUpDialog, { onSuccess: () => h.state.completed++, onClose: () => h.state.closed++ })));
  await flush();
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
async function click(host, label) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent.includes(label));
  assert.ok(button, label);
  await act(async () => button.click()); await flush();
}
async function submit(host, code) {
  const input = host.querySelector("input"); assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, code);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await act(async () => host.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await flush();
}

test("enrolled passkey and TOTP are equal choices; passkey uses MFA API", async () => {
  const h = harness([{ id: "pk", factor_type: "webauthn", status: "verified" }, { id: "totp", factor_type: "totp", status: "verified" }]);
  const view = await mount(h);
  try {
    assert.ok(view.host.querySelector("input"));
    assert.equal(view.host.textContent.includes("发送邮箱验证码"), false);
    await click(view.host, "使用通行密钥");
    assert.deepEqual(h.state.calls, [["passkey", { factorId: "pk", webauthn: {} }]]);
    assert.equal(h.state.completed, 1);
  } finally { await view.close(); }
});

test("TOTP submits six digits and only completes after verification", async () => {
  const h = harness([{ id: "totp", factor_type: "totp", status: "verified" }]);
  const view = await mount(h);
  try { await submit(view.host, "123456"); assert.equal(h.state.completed, 1); assert.deepEqual(h.state.calls, [["totp", { factorId: "totp", code: "123456" }]]); }
  finally { await view.close(); }
});

test("unenrolled account sends OTP only to its own address and caches the fresh session", async () => {
  const h = harness(); const view = await mount(h);
  try {
    assert.equal(view.host.querySelector("input"), null);
    await click(view.host, "发送邮箱验证码");
    assert.deepEqual(h.state.calls[0], ["email", { email: "owner@example.test", options: { shouldCreateUser: false } }]);
    await submit(view.host, "12345678");
    assert.equal(h.state.completed, 1);
    assert.deepEqual(h.state.calls[1], ["verify-email", { email: "owner@example.test", token: "12345678", type: "email" }]);
    assert.equal(h.client.cachedAccessToken(), "email-fresh");
  } finally { await view.close(); }
});

test("factor lookup error is visible and never falls through to email", async () => {
  const h = harness(); h.state.listError = { message: "offline" }; const view = await mount(h);
  try { assert.match(view.host.querySelector('[role="alert"]').textContent, /offline/); assert.equal(view.host.textContent.includes("发送邮箱验证码"), false); assert.equal(h.state.completed, 0); }
  finally { await view.close(); }
});

test("failed passkey verification never resumes the pending action", async () => {
  const h = harness([{ id: "pk", factor_type: "webauthn", status: "verified" }]); h.state.error = { message: "User cancelled" };
  const view = await mount(h);
  try { await click(view.host, "使用通行密钥"); assert.match(view.host.querySelector('[role="alert"]').textContent, /cancelled/); assert.equal(h.state.completed, 0); }
  finally { await view.close(); }
});

test("account switch cancels verification without sending a code", async () => {
  const h = harness(); const view = await mount(h);
  try { h.state.session = { ...h.state.session, user: { id: "other" } }; await click(view.host, "发送邮箱验证码"); assert.equal(h.state.closed, 1); assert.equal(h.state.calls.length, 0); assert.equal(h.state.completed, 0); }
  finally { await view.close(); }
});

test("passkey enrollment detects explicit disabled platform support", async () => {
  const h = harness(); h.state.error = { code: "mfa_webauthn_enroll_not_enabled", message: "MFA WebAuthn is disabled" };
  const result = await h.client.enrollMfaPasskey();
  assert.equal(result.unsupported, true); assert.ok(result.error);
  delete window.PublicKeyCredential;
  assert.equal(h.client.supportsMfaPasskeys(), false);
});

test("factor list preserves kinds, excludes unfinished and unsupported types at the UI", async () => {
  const h = harness([{ id: "sms", factor_type: "phone", status: "verified" }, { id: "pending", factor_type: "totp", status: "unverified" }, { id: "pk", factor_type: "webauthn", status: "verified" }]);
  const list = await h.client.listMfaFactors(); assert.deepEqual(list.factors.map((f) => [f.id, f.factorType]), [["pending", "totp"], ["pk", "webauthn"]]);
  const view = await mount(h);
  try { assert.equal(view.host.querySelector("input"), null); }
  finally { await view.close(); }
});
