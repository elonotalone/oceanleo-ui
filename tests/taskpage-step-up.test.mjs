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
function harness(factors = [], passkeys = []) {
  dom.reconfigure({ url: "https://www.oceanleo.com/settings/vault" });
  const state = { factors, passkeys, family: "com", calls: [], completed: 0, closed: 0, error: null, constructors: [], stopped: 0 };
  const user = { id: "owner", email: "owner@example.test" };
  state.user = user;
  state.session = { user, access_token: "initial", refresh_token: "initial-refresh" };
  const result = () => ({ error: state.error });
  const sdk = { auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    getUser: async () => ({ data: { user: state.user }, error: null }),
    getSession: async () => ({ data: { session: state.session } }),
    setSession: async (tokens) => { state.calls.push(["adopt", tokens]); state.session = { ...state.session, ...tokens }; return { data: { session: state.session }, error: null }; },
    signInWithOtp: async (input) => { state.calls.push(["email", input]); return result(); },
    verifyOtp: async (input) => { state.calls.push(["verify-email", input]); return { ...result(), data: { user: state.user, session: { ...state.session, access_token: "email-fresh" } } }; },
    registerPasskey: async () => { state.calls.push(["register"]); return { data: { id: "new-key" }, ...result() }; },
    passkey: {
      list: async () => ({ data: state.passkeys, error: state.keysError }),
      delete: async (input) => { state.calls.push(["remove", input]); return result(); },
    },
    mfa: {
      listFactors: async () => ({ data: { all: state.factors }, error: state.listError }),
      challengeAndVerify: async (input) => { state.calls.push(["totp", input]); return result(); },
    },
  } };
  const isolated = { auth: {
    signInWithPasskey: async (input) => {
      state.calls.push(["passkey", input]);
      const signedIn = state.passkeyUser || user;
      return { ...result(), data: { user: signedIn, session: { user: signedIn, access_token: "passkey-fresh", refresh_token: "passkey-refresh" } } };
    },
    stopAutoRefresh: async () => { state.stopped++; },
  } };
  const config = { configured: () => true, currentIdentityUrl: () => "https://auth.oceanleo.com", currentIdentityAnonKey: () => "public-test-key", SUPABASE_URL: "https://auth.oceanleo.com", SUPABASE_ANON_KEY: "public-test-key", cookieOptions: () => ({ name: "session" }), isLeoDevPreviewHost: () => false };
  const client = compile(clientSource, {
    "@supabase/supabase-js": { createClient: (_url, _key, options) => { state.constructors.push(options); return options.auth.persistSession === false ? isolated : sdk; } },
    "@supabase/ssr": { createBrowserClient: (_url, _key, options) => { state.constructors.push(options); return sdk; } },
    "./config": config,
    "../../contracts/client-host-config": { clientHostConfigGeneration: () => 0, getClientHostConfig: () => state.hostConfig || null, createMemoryAuthStorage: () => ({}) },
    "../../contracts/domain-family": { currentDomainFamily: () => state.family },
    "./oauth-return": { waitForBrowserOauthReturn: async () => true, previewOauthReturnCode: () => null },
    "./captcha": { getCaptchaToken: async () => null },
  }, "\nexports.setClient = value => { _client = value; _hostClientGeneration = 0; };");
  client.setClient(sdk);
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  window.PublicKeyCredential = class {};
  const { StepUpDialog } = compile(dialogSource, { "../../lib/auth/client": client, "../../i18n/ui/useUI": { useUI: () => (key) => key } });
  return { state, client, sdk, StepUpDialog };
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

test("enrolled passkey, TOTP and email are equal choices; passkey adopts a fresh same-user session", async () => {
  const h = harness([{ id: "totp", factor_type: "totp", status: "verified" }], [{ id: "pk", created_at: "2026-11-19" }]);
  const view = await mount(h);
  try {
    assert.ok(view.host.querySelector("input"));
    assert.ok(view.host.textContent.includes("发送邮箱验证码"));
    await click(view.host, "使用通行密钥");
    assert.deepEqual(h.state.calls, [["passkey", { options: {} }], ["adopt", { access_token: "passkey-fresh", refresh_token: "passkey-refresh" }]]);
    assert.equal(h.state.completed, 1);
    assert.equal(h.client.cachedAccessToken(), "passkey-fresh");
    assert.equal(h.state.constructors[0].auth.persistSession, false);
    assert.match(h.state.constructors[0].auth.storageKey, /^oceanleo-passkey-step-up-/);
    assert.equal(h.state.constructors[0].auth.experimental.passkey, true);
    assert.equal(h.state.stopped, 1);
  } finally { await view.close(); }
});

test("another user's passkey is rejected without publishing or replacing the current identity", async () => {
  const h = harness([], [{ id: "pk", created_at: "2026-11-19" }]);
  h.state.passkeyUser = { id: "other", email: "other@example.test" };
  const view = await mount(h);
  try {
    await click(view.host, "使用通行密钥");
    assert.match(view.host.querySelector('[role="alert"]').textContent, /不属于当前账号/);
    assert.equal(h.state.completed, 0);
    assert.equal(h.state.session.user.id, "owner");
    assert.equal(h.state.session.access_token, "initial");
    assert.equal(h.state.calls.some(([method]) => method === "adopt"), false);
  } finally { await view.close(); }
});

test("TOTP submits six digits and only completes after verification", async () => {
  const h = harness([{ id: "totp", factor_type: "totp", status: "verified" }]);
  const view = await mount(h);
  try { await submit(view.host, "123456"); assert.equal(h.state.completed, 1); assert.deepEqual(h.state.calls, [["totp", { factorId: "totp", code: "123456" }]]); }
  finally { await view.close(); }
});

test("email remains usable with an enrolled authenticator and only targets the current account", async () => {
  const h = harness([{ id: "totp", factor_type: "totp", status: "verified" }]); const view = await mount(h);
  try {
    await click(view.host, "发送邮箱验证码");
    assert.deepEqual(h.state.calls[0], ["email", { email: "owner@example.test", options: { shouldCreateUser: false } }]);
    await submit(view.host, "12345678");
    assert.equal(h.state.completed, 1);
    assert.deepEqual(h.state.calls[1], ["verify-email", { email: "owner@example.test", token: "12345678", type: "email" }]);
    assert.equal(h.client.cachedAccessToken(), "email-fresh");
  } finally { await view.close(); }
});

test("factor lookup error stays visible while email remains available", async () => {
  const h = harness(); h.state.listError = { message: "offline" }; const view = await mount(h);
  try { assert.match(view.host.querySelector('[role="alert"]').textContent, /offline/); await click(view.host, "发送邮箱验证码"); assert.equal(h.state.calls[0][0], "email"); assert.equal(h.state.completed, 0); }
  finally { await view.close(); }
});

test("failed passkey verification never resumes the pending action", async () => {
  const h = harness([], [{ id: "pk", created_at: "2026-11-19" }]); h.state.error = { message: "User cancelled" };
  const view = await mount(h);
  try { await click(view.host, "使用通行密钥"); assert.match(view.host.querySelector('[role="alert"]').textContent, /cancelled/); assert.equal(h.state.completed, 0); assert.equal(h.state.calls.some(([method]) => method === "adopt"), false); }
  finally { await view.close(); }
});

test("account switch cancels verification without sending a code", async () => {
  const h = harness(); const view = await mount(h);
  try { h.state.session = { ...h.state.session, user: { id: "other" } }; await click(view.host, "发送邮箱验证码"); assert.equal(h.state.closed, 1); assert.equal(h.state.calls.length, 0); assert.equal(h.state.completed, 0); }
  finally { await view.close(); }
});

test("passkey registration, list and removal use first-factor SDK APIs", async () => {
  const h = harness([], [{ id: "pk", friendly_name: "Laptop", created_at: "2026-11-19" }]);
  assert.deepEqual((await h.client.listPasskeys()).passkeys, [{ id: "pk", friendlyName: "Laptop", createdAt: "2026-11-19" }]);
  assert.equal((await h.client.registerPasskey()).error, undefined);
  assert.equal((await h.client.removePasskey("pk")).error, undefined);
  assert.deepEqual(h.state.calls, [["register"], ["remove", { passkeyId: "pk" }]]);
});

for (const origin of ["https://oceanbizs.com", "https://www.oceanleo.cn", "https://oceanleo.com.evil.test", "http://www.oceanleo.com"]) test(`passkeys unavailable at non-RP origin ${origin}`, async () => {
  const h = harness([{ id: "totp", factor_type: "totp", status: "verified" }], [{ id: "pk", created_at: "2026-11-19" }]); dom.reconfigure({ url: origin });
  assert.equal(h.client.supportsPasskeys(), false);
  assert.deepEqual((await h.client.listPasskeys()).passkeys, []);
  assert.ok((await h.client.registerPasskey()).error);
  assert.equal(h.state.calls.length, 0);
  const view = await mount(h);
  try {
    assert.ok(view.host.textContent.includes("验证器"));
    assert.ok(view.host.textContent.includes("发送邮箱验证码"));
    assert.equal(view.host.textContent.includes("使用通行密钥"), false);
  } finally { await view.close(); }
});

for (const origin of ["https://oceanleo.com", "https://work.dev.oceanleo.com"]) test(`passkeys available at RP origin ${origin}`, () => {
  const h = harness(); dom.reconfigure({ url: origin }); assert.equal(h.client.supportsPasskeys(), true);
});

test("China identity and browsers without WebAuthn never offer passkeys", () => {
  const h = harness(); h.state.family = "cn"; assert.equal(h.client.supportsPasskeys(), false);
  h.state.family = "com"; delete window.PublicKeyCredential; assert.equal(h.client.supportsPasskeys(), false);
});

test("both host and cookie browser clients enable the first-factor passkey SDK API", () => {
  for (const host of [null, { family: "com", platform: "web" }]) {
    const h = harness(); h.state.hostConfig = host; h.client.setClient(null);
    assert.equal(h.client.browserClient(), h.sdk);
    assert.equal(h.state.constructors[0].auth.experimental.passkey, true);
  }
});

test("MFA factor list only contains TOTP; first-factor passkeys are listed separately", async () => {
  const h = harness([{ id: "sms", factor_type: "phone", status: "verified" }, { id: "totp", factor_type: "totp", status: "verified" }, { id: "old", factor_type: "webauthn", status: "verified" }]);
  assert.deepEqual((await h.client.listMfaFactors()).factors.map((factor) => factor.id), ["totp"]);
});
