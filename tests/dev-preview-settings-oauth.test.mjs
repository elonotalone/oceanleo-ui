import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// Render the real account boundary and login panel with the real auth SDK.
// Unrelated settings panes and billing data are fixtures; identity HTTP uses
// only a synthetic account. No browser automation or operator session is used.
test("Google 回跳在真实设置窗口从 Processing 转成已登录账户，退出后恢复登录表单", async () => {
  const require = createRequire(import.meta.url);
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const oldCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (oldCanvas) require.cache[canvasEntry] = oldCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><main></main>", {
    url: "https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/settings/account?code=fixture-settings-code",
    pretendToBeVisual: true,
  });
  const globals = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
    Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, BroadcastChannel: undefined,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  process.env.NEXT_PUBLIC_OCEANLEO_SUPABASE_URL = "https://identity-fixture.supabase.co";
  process.env.NEXT_PUBLIC_OCEANLEO_ANON_KEY = "fixture-public-anon-key";
  const now = Math.floor(Date.now() / 1000);
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const user = { id: "00000000-0000-4000-8000-000000000027", email: "settings-fixture@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: `${part({alg:"HS256",typ:"JWT"})}.${part({sub:user.id,exp:now+3600,iat:now,aal:"aal1",amr:[]})}.fixture`, refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user };
  const { cookieOptions } = await import("../src/lib/auth/config.ts");
  const { createLeoDevPreviewCookieJar } = await import("../src/lib/auth/preview-cookies.ts");
  const cookieName = cookieOptions(window.location.host).name;
  createLeoDevPreviewCookieJar(() => "").setAll([
    { name: cookieName + "-code-verifier", value: "base64-" + part("fixture-proof") },
    { name: cookieName, value: "base64-" + part({...session, expires_at: now - 3600}) },
  ]);
  document.cookie = "sb-family-auth-token=untouched-family; Path=/";
  const originalCookies = document.cookie;
  let releaseExchange;
  const exchangeResponse = new Promise((resolve) => { releaseExchange = resolve; });
  const oldFetch = globalThis.fetch;
  let exchanges = 0;
  let refreshes = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname.endsWith("/token") && url.searchParams.get("grant_type") === "pkce") {
      exchanges += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.auth_code, "fixture-settings-code");
      assert.equal(body.code_verifier, "fixture-proof");
      return exchangeResponse;
    }
    if (url.pathname.endsWith("/token") && url.searchParams.get("grant_type") === "refresh_token") {
      refreshes += 1;
      throw new Error("Old session refresh must not precede Google callback");
    }
    if (url.pathname.endsWith("/user")) return Response.json(user);
    if (url.pathname.endsWith("/logout")) return new Response(null, {status:204});
    throw new Error("Unexpected identity fixture request: " + url.pathname);
  };
  const reactUrl = pathToFileURL(require.resolve("react")).href;
  const pane = (name) => dataModule(`export function ${name}(){ return null; }`);
  const auth = await import("../src/lib/auth/client.ts");
  const clientUrl = new URL("../src/lib/auth/client.ts", import.meta.url).href;
  const configUrl = new URL("../src/lib/auth/config.ts", import.meta.url).href;
  const profileUrl = new URL("../src/lib/auth/account-identity.ts", import.meta.url).href;
  const stubs = {
    "../../lib/auth": dataModule(`export * from ${JSON.stringify(clientUrl)}; export {loginUnavailableNotice} from ${JSON.stringify(configUrl)}; export {getAccountProfile} from ${JSON.stringify(profileUrl)}; export async function getCredits(){return {ok:false};} export async function getCreditHistory(){return {ok:false};} export async function getUsageBySite(){return {ok:false};}`),
    "../../i18n/ui/useUI": dataModule("export function useUI(){return text=>text;}"),
    "../../ui": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ButtonSpinner({label}){return React.createElement('span',null,label);}`),
    "./sections/AccountSection": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function AccountSection({email}){return React.createElement('div',{'data-account-confirmed':''},email);}`),
    "../../shell/LocalWorkspace": dataModule("export function LocalComputerSettings(){return null;} export function useLocalWorkspace(){return null;}"),
    "../../shell/bay/shell/bay-state": dataModule("export function bayEnabledHere(){return false;}"),
    "../../shell/bay/settings": pane("BaySettingsSection"),
  };
  for (const [path, name] of [
    ["../ApiPage", "ApiPage"], ["../PasswordResetPage", "PasswordResetPage"],
    ["./personalization/PersonalizationSection", "PersonalizationSection"], ["./mail/MailSection", "MailSection"],
    ["./sections/GeneralSection", "GeneralSection"], ["./sections/BillingSection", "BillingSection"],
    ["./sections/MessagesSection", "MessagesSection"], ["./sections/AutomationSettingsSection", "AutomationSettingsSection"],
    ["./sections/OrgSection", "OrgSection"], ["./SkillsSettingsPane", "SkillsSettingsPane"], ["./ConnectorsSettingsPane", "ConnectorsSettingsPane"],
  ]) stubs[path] = pane(name);
  let root;
  try {
    const { SettingsHub } = await import(await compileModule("src/pages/settings/SettingsHub.tsx", stubs));
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.querySelector("main"));
    await act(async () => { root.render(React.createElement(SettingsHub, {variant:"modal",initialTab:"account"})); });
    assert.ok(document.querySelector("[data-auth-oauth-pending]"));
    assert.equal(exchanges, 1);
    assert.equal(refreshes, 0);
    await act(async () => {
      releaseExchange(Response.json(session));
      assert.equal(await auth.getUserId(), user.id);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(document.querySelector("[data-auth-oauth-pending]"), null);
    assert.equal(document.querySelector("[data-auth-panel]"), null);
    assert.equal(document.querySelector("[data-account-confirmed]")?.textContent, user.email);
    assert.equal(new URL(window.location.href).searchParams.has("code"), false);
    assert.equal(document.cookie, originalCookies);
    await act(async () => { await auth.signOutEverywhere(); });
    assert.ok(document.querySelector("[data-auth-panel]"));
    assert.equal(document.querySelector("[data-account-confirmed]"), null);
  } finally {
    releaseExchange(Response.json(session));
    if (root) await act(async () => root.unmount());
    await auth.browserClient()?.auth.dispose();
    globalThis.fetch = oldFetch;
    dom.window.close();
    for (const [name, previous] of globals) {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    }
  }
});
