import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// Real form, auth client, Supabase SDK and preview storage. Only the HTTP
// identity response is a fixture; no real account, password or token is used.
test("LeoDev 邮箱密码登录经过真实 SDK 保存会话，新页面可恢复，退出后不恢复", async () => {
  const require = createRequire(import.meta.url);
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
    url: "https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/settings/account",
    pretendToBeVisual: true,
  });
  const savedGlobals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, Node: dom.window.Node,
    BroadcastChannel: undefined,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const savedFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_OCEANLEO_SUPABASE_URL = "https://identity-fixture.supabase.co";
  process.env.NEXT_PUBLIC_OCEANLEO_ANON_KEY = "fixture-public-anon-key";
  const email = "dev-fixture@example.invalid";
  const userId = "00000000-0000-4000-8000-000000000026";
  const now = Math.floor(Date.now() / 1000);
  const part = (data) => Buffer.from(JSON.stringify(data)).toString("base64url");
  const token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: userId, exp: now + 3600, iat: now, aal: "aal1", amr: [] })}.fixture`;
  const user = { id: userId, email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, factors: [], created_at: new Date().toISOString() };
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, method: init?.method || "GET" });
    if (url.pathname.endsWith("/token") && init?.method === "POST") {
      const body = JSON.parse(init.body);
      assert.equal(body.email, email);
      assert.equal(body.password, "fixture-password-26");
      assert.equal(body.gotrue_meta_security?.captcha_token, undefined);
      return Response.json({ access_token: token, refresh_token: "fixture-refresh", expires_in: 3600, expires_at: now + 3600, token_type: "bearer", user });
    }
    if (url.pathname.endsWith("/user")) return Response.json(user);
    if (url.pathname.endsWith("/logout")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected identity request: ${url.pathname}`);
  };
  document.cookie = "sb-family-auth-token=family-account; Path=/";
  document.cookie = "oceanleo-dev-guest=1; Path=/";
  const inheritedCookies = document.cookie;
  const clientUrl = await compileModule("src/lib/auth/client.ts");
  const auth = await import(clientUrl);
  const captcha = await import(await compileModule("src/lib/auth/captcha.ts"));
  const config = await import(await compileModule("src/lib/auth/config.ts"));
  const preview = await import(await compileModule("src/lib/auth/preview-cookies.ts"));
  const { AuthPanel } = await import(await compileModule("src/pages/AuthDialog.tsx", {
    "../i18n/ui/useUI": dataModule("export function useUI() { return (text) => text; }"),
    "../ui": dataModule(`import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)}; export function ButtonSpinner({label}) { return React.createElement("span", null, label); }`),
  }));
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.querySelector("main"));
  let restored;
  let completed = 0;
  const input = async (selector, value) => {
    const element = document.querySelector(selector);
    assert.ok(element);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value);
      element.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const submit = () => act(async () => {
    document.querySelector("[data-auth-form=email]").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
  try {
    assert.equal(await auth.getUserId(), null, "不能把继承的家族 cookie 当成开发版登录");
    assert.equal(captcha.isCaptchaConfigured(), false);
    await act(async () => { root.render(React.createElement(AuthPanel, { onSuccess: () => { completed += 1; } })); });
    assert.equal(document.querySelector("[data-auth-captcha]"), null);
    await input("#oceanleo-auth-email", email);
    assert.equal(document.querySelector("[data-auth-submit]").disabled, false);
    await submit();
    assert.ok(document.querySelector("#oceanleo-auth-password"));
    await input("#oceanleo-auth-password", "fixture-password-26");
    await submit();
    for (let step = 0; step < 6; step += 1) await act(async () => {});
    assert.equal(completed, 1);
    assert.equal(await auth.getUserEmail(), email);
    assert.equal(await auth.getUserId(), userId);
    assert.equal(calls.filter((call) => call.path.endsWith("/token")).length, 1);
    assert.ok(localStorage.getItem(preview.PREVIEW_OVERLAY_STORAGE_KEY));
    assert.equal(document.cookie, inheritedCookies, "登录不能改写正式站会话 cookie");

    const { createBrowserClient } = require("@supabase/ssr");
    const jar = preview.createLeoDevPreviewCookieJar(() => document.cookie);
    restored = createBrowserClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      isSingleton: false, cookieOptions: config.cookieOptions(window.location.host),
      global: { fetch: globalThis.fetch },
      auth: { autoRefreshToken: false, detectSessionInUrl: false },
      cookies: { getAll: () => jar.getAll(), setAll: (cookies) => jar.setAll(cookies) },
    });
    assert.equal((await restored.auth.getSession()).data.session?.user.id, userId);
    await restored.auth.dispose();
    restored = undefined;
    await auth.signOutEverywhere();
    assert.equal(await auth.getUserId(), null);
    const signedOutJar = preview.createLeoDevPreviewCookieJar(() => document.cookie);
    assert.equal(signedOutJar.getAll().some((cookie) => preview.isFamilyAuthCookieName(cookie.name)), false);
    assert.equal(document.cookie.includes("sb-family-auth-token=family-account"), true);
  } finally {
    await act(async () => root.unmount());
    await restored?.auth.dispose();
    await auth.browserClient()?.auth.dispose();
    globalThis.fetch = savedFetch;
    dom.window.close();
    for (const [key, descriptor] of savedGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
