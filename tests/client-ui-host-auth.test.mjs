import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { authFetch } from "../src/lib/auth/auth-fetch.ts";
import { browserClient } from "../src/lib/auth/client.ts";
import { COM_AUTH_COOKIE_KEY, CN_AUTH_COOKIE_KEY } from "../src/lib/auth/config.ts";
import {
  CLIENT_WEB_BOOT_GLOBAL_KEY,
  configureClientHost,
  createMemoryAuthStorage,
  HOST_LIBRARY_TIMEOUT_MS,
  hostAwareLibraryTimeoutMs,
  hostInjectedFetch,
  resetClientHostConfigForTests,
  WEB_LIBRARY_TIMEOUT_MS,
} from "../src/client-ui/host-config.ts";

const portalShell = readFileSync(
  "/root/projects/oceanleo/app/_components/clone-shell.tsx",
  "utf8",
);
const authDialog = readFileSync(
  new URL("../src/pages/AuthDialog.tsx", import.meta.url),
  "utf8",
);
const artifactClient = readFileSync(
  new URL("../src/shell/artifact-client.ts", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../src/lib/auth/client.ts", import.meta.url),
  "utf8",
);
const authFetchSource = readFileSync(
  new URL("../src/lib/auth/auth-fetch.ts", import.meta.url),
  "utf8",
);

function hostConfig(overrides = {}) {
  return {
    family: "com",
    portalOrigin: "https://oceanleo.com",
    gatewayOrigin: "https://api.dev.oceanleo.com",
    identityOrigin: "https://auth.oceanleo.com",
    identityAnonKey: "host-anon-key",
    authStorage: createMemoryAuthStorage(),
    locale: "zh",
    platform: "desktop",
    capabilities: ["native-shell"],
    ...overrides,
  };
}

test.beforeEach(() => {
  resetClientHostConfigForTests();
  delete globalThis[CLIENT_WEB_BOOT_GLOBAL_KEY];
});

test.afterEach(() => {
  resetClientHostConfigForTests();
  delete globalThis[CLIENT_WEB_BOOT_GLOBAL_KEY];
});

test("unconfigured library timeout stays 20s", () => {
  resetClientHostConfigForTests();
  assert.equal(hostAwareLibraryTimeoutMs(), WEB_LIBRARY_TIMEOUT_MS);
  assert.equal(WEB_LIBRARY_TIMEOUT_MS, 20_000);
});

test("host-mode library timeout is 45s", () => {
  configureClientHost(hostConfig());
  assert.equal(hostAwareLibraryTimeoutMs(), HOST_LIBRARY_TIMEOUT_MS);
  assert.equal(HOST_LIBRARY_TIMEOUT_MS, 45_000);
});

test("artifact-client default timeout follows the host-aware helper", () => {
  assert.match(artifactClient, /hostAwareLibraryTimeoutMs\(\)/);
  assert.match(artifactClient, /timedOut/);
  assert.match(artifactClient, /素材请求超时/);
});

test("hostBrowserClient pins storageKey to the website cookie name", () => {
  assert.match(clientSource, /storageKey/);
  assert.match(clientSource, /COM_AUTH_COOKIE_KEY/);
  assert.match(clientSource, /CN_AUTH_COOKIE_KEY/);
  configureClientHost(hostConfig({ family: "com" }));
  const client = browserClient();
  assert.ok(client);
  assert.equal(COM_AUTH_COOKIE_KEY, "sb-kvrtcumcmhyqhmawpzyc-auth-token");
  assert.equal(CN_AUTH_COOKIE_KEY, "sb-id-cn-auth-token");
});

test("host-mode authFetch uses injected fetch and skips the 2500ms rewrite", async () => {
  let calls = 0;
  const injected = async () => {
    calls += 1;
    return new Response(JSON.stringify({ keys: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  configureClientHost(hostConfig({ fetch: injected }));
  assert.equal(hostInjectedFetch(), injected);
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("global fetch must not run in host mode when injected");
  };
  try {
    const res = await authFetch("https://auth.oceanleo.com/auth/v1/jwks");
    assert.equal(res.status, 200);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
  assert.match(authFetchSource, /hostInjectedFetch/);
  assert.match(authFetchSource, /getClientHostConfig\(\)/);
});

test("host-mode authFetch falls back to __OCEANLEO_CLIENT_WEB__.fetch", async () => {
  let calls = 0;
  globalThis[CLIENT_WEB_BOOT_GLOBAL_KEY] = {
    fetch: async () => {
      calls += 1;
      return new Response("ok", { status: 200 });
    },
  };
  configureClientHost(hostConfig());
  const res = await authFetch("https://auth.oceanleo.com/auth/v1/user");
  assert.equal(res.status, 200);
  assert.equal(calls, 1);
});

test("clone-shell names host nav from ariaLabel or label on real links/buttons", () => {
  assert.match(portalShell, /ariaLabel \|\| item\.label/);
  assert.match(portalShell, /accessibleName = item\.ariaLabel \|\| item\.label/);
  assert.match(portalShell, /<Link[\s\S]*aria-label=\{accessibleName\}/);
  assert.match(portalShell, /<button[\s\S]*aria-label=\{accessibleName\}/);
  assert.doesNotMatch(portalShell, /__OCEANLEO_ACCEPT_DRIVE__/);
});

test("login dialog email, password, and continue have accessible names", () => {
  assert.match(authDialog, /id="oceanleo-auth-email"/);
  assert.match(authDialog, /aria-label=\{tt\("输入你的邮箱地址"\)\}/);
  assert.match(authDialog, /id="oceanleo-auth-password"/);
  assert.match(authDialog, /aria-label=\{tt\("密码"\)\}/);
  assert.match(authDialog, /aria-label=\{tt\("继续"\)\}/);
});
