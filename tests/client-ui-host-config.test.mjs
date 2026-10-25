import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CLIENT_HOST_CONFIG_GLOBAL_KEY,
  configureClientHost,
  createMemoryAuthStorage,
  getClientHostConfig,
  getHostNavItems,
  nativeShellFromHostConfig,
  resetClientHostConfigForTests,
} from "../src/client-ui/host-config.ts";
import {
  currentDomainFamily,
  currentDomainProfile,
  portalHref,
  runtimePageHost,
  runtimePageOrigin,
} from "../src/contracts/domain-family.ts";
import { browserClient } from "../src/lib/auth/client.ts";
import {
  GATEWAY_BASE,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  cookieDomainFor,
  configured,
  currentIdentityAnonKey,
  currentIdentityUrl,
} from "../src/lib/auth/config.ts";
import { helpCenterUrl } from "../src/lib/help-url.ts";

function hostConfig(overrides = {}) {
  return {
    family: "cn",
    portalOrigin: "https://portal.test.example",
    gatewayOrigin: "https://gw.test.example",
    identityOrigin: "https://id.test.example",
    identityAnonKey: "host-anon-key",
    authStorage: createMemoryAuthStorage(),
    locale: "zh",
    platform: "desktop",
    capabilities: [],
    ...overrides,
  };
}

test.beforeEach(() => {
  resetClientHostConfigForTests();
});

test.afterEach(() => {
  resetClientHostConfigForTests();
});

test("local workspace survives desktop boot reconfiguration and is absent on mobile/web", () => {
  const localWorkspace = { listTasks: async () => [], cancelTask: async () => {}, mountSettings: () => () => {} };
  configureClientHost(hostConfig({ localWorkspace }));
  assert.equal(getClientHostConfig().localWorkspace, localWorkspace);
  configureClientHost(hostConfig());
  assert.equal(getClientHostConfig().localWorkspace, localWorkspace);
  configureClientHost(hostConfig({ platform: "android", localWorkspace }));
  assert.equal(getClientHostConfig().localWorkspace, undefined);
  configureClientHost(hostConfig({ platform: "web", localWorkspace }));
  assert.equal(getClientHostConfig().localWorkspace, undefined);
});

test("unconfigured family/gateway/identity/help/cookies equal live web", () => {
  resetClientHostConfigForTests();
  assert.equal(getClientHostConfig(), null);
  const family = currentDomainFamily();
  const profile = currentDomainProfile();
  assert.equal(profile.family, family);
  assert.equal(GATEWAY_BASE, profile.gatewayOrigin);
  assert.equal(currentIdentityUrl(), SUPABASE_URL);
  assert.equal(currentIdentityAnonKey(), SUPABASE_ANON_KEY);
  assert.equal(configured(), Boolean(SUPABASE_URL && SUPABASE_ANON_KEY));
  assert.equal(
    helpCenterUrl({ host: "website.oceanleo.com" }),
    "https://help.oceanleo.com/",
  );
  assert.equal(
    helpCenterUrl({ host: "website.oceanleo.cn" }),
    "https://help.oceanleo.cn/",
  );
  assert.equal(helpCenterUrl({ host: "localhost:3000" }), "https://help.oceanleo.com/");
  assert.equal(cookieDomainFor("ppt.oceanleo.com"), ".oceanleo.com");
  assert.equal(cookieDomainFor("localhost"), undefined);
  assert.equal(cookieDomainFor("oceanleo.app"), undefined);
  assert.equal(nativeShellFromHostConfig(), null);
  assert.equal(runtimePageOrigin(), "");
  assert.equal(runtimePageHost(), "");
  assert.deepEqual(getHostNavItems(), []);
});

test("host mode family/gateway/identity/storage come from injection", () => {
  const storage = createMemoryAuthStorage([["k", "v"]]);
  configureClientHost(hostConfig({ authStorage: storage, family: "cn" }));
  assert.equal(currentDomainFamily(), "cn");
  assert.equal(currentDomainProfile().gatewayOrigin, "https://gw.test.example");
  assert.equal(currentDomainProfile().portalOrigin, "https://portal.test.example");
  assert.equal(currentIdentityUrl(), "https://id.test.example");
  assert.equal(currentIdentityAnonKey(), "host-anon-key");
  assert.equal(configured(), true);
  assert.equal(helpCenterUrl({ host: "localhost" }), "https://help.oceanleo.cn/");
  assert.equal(runtimePageOrigin(), "https://portal.test.example");
  assert.equal(runtimePageHost(), "portal.test.example");
  assert.equal(portalHref("/library"), "/library");
  assert.equal(portalHref("/devices"), "/devices");
  assert.equal(getClientHostConfig()?.authStorage, storage);
  assert.equal(storage.getItem("k"), "v");
  assert.equal(nativeShellFromHostConfig(), false);
});

test("host injection does not widen cookie Domain (D5)", () => {
  const comCookie = cookieDomainFor("ppt.oceanleo.com");
  const localCookie = cookieDomainFor("localhost");
  const appCookie = cookieDomainFor("oceanleo.app");
  configureClientHost(hostConfig({ family: "cn" }));
  assert.equal(cookieDomainFor("ppt.oceanleo.com"), comCookie);
  assert.equal(cookieDomainFor("localhost"), localCookie);
  assert.equal(cookieDomainFor("oceanleo.app"), appCookie);
  assert.equal(localCookie, undefined);
  assert.equal(appCookie, undefined);
});

test("native-shell flag follows injected platform, not Capacitor", () => {
  configureClientHost(hostConfig({ platform: "ios" }));
  assert.equal(nativeShellFromHostConfig(), true);
  configureClientHost(hostConfig({ platform: "web", capabilities: ["native-shell"] }));
  assert.equal(nativeShellFromHostConfig(), true);
  configureClientHost(hostConfig({ platform: "desktop", capabilities: [] }));
  assert.equal(nativeShellFromHostConfig(), false);
});

test("global slot written before start is the same config", () => {
  resetClientHostConfigForTests();
  globalThis[CLIENT_HOST_CONFIG_GLOBAL_KEY] = hostConfig({ family: "ws" });
  assert.equal(currentDomainFamily(), "ws");
  assert.equal(currentDomainProfile().gatewayOrigin, "https://gw.test.example");
});

test("host browser client uses injected URL and storage, not cookies", () => {
  const storage = createMemoryAuthStorage();
  configureClientHost(hostConfig({ authStorage: storage }));
  const client = browserClient();
  assert.ok(client);
  assert.equal(client.supabaseUrl, "https://id.test.example");
  assert.equal(typeof document, "undefined");
});

test("configureClientHost rejects user-content identity/gateway origins", () => {
  assert.throws(
    () => configureClientHost(hostConfig({ identityOrigin: "https://evil.oceanleo.app" })),
    /user-content/,
  );
  assert.throws(
    () => configureClientHost(hostConfig({ gatewayOrigin: "https://x.leoapp.cn" })),
    /user-content/,
  );
});

test("reset restores unconfigured web equality", () => {
  const liveFamily = currentDomainFamily();
  const liveGateway = currentDomainProfile().gatewayOrigin;
  configureClientHost(hostConfig({ family: "ws" }));
  assert.equal(currentDomainFamily(), "ws");
  resetClientHostConfigForTests();
  assert.equal(currentDomainFamily(), liveFamily);
  assert.equal(currentDomainProfile().gatewayOrigin, liveGateway);
  assert.equal(nativeShellFromHostConfig(), null);
});

test("client.ts host path is createClient + authStorage; web path keeps cookies", () => {
  const source = readFileSync(new URL("../src/lib/auth/client.ts", import.meta.url), "utf8");
  assert.match(source, /getClientHostConfig\(\)/);
  assert.match(source, /createClient\(/);
  assert.match(source, /authStorage/);
  assert.match(source, /createBrowserClient/);
  assert.match(source, /cookieOptions\(host\)/);
});
