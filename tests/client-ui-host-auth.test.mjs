import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { authFetch } from "../src/lib/auth/auth-fetch.ts";
import { browserClient, startOauthSignIn, startDesktopBrowserSignIn, signOutEverywhere } from "../src/lib/auth/client.ts";
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
const appShell = readFileSync(
  new URL("../src/shell/AppShell.tsx", import.meta.url),
  "utf8",
);
const promptArea = readFileSync(
  new URL("../src/shell/PromptHighlightArea.tsx", import.meta.url),
  "utf8",
);
const leoComposer = readFileSync(
  new URL("../src/shell/LeoComposer.tsx", import.meta.url),
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

test("desktop OAuth exchanges a PKCE code through host HTTP and persists the resulting session", async () => {
  const storage = createMemoryAuthStorage();
  const requests = [];
  const finished = [];
  configureClientHost(hostConfig({
    authStorage: storage,
    oauth: {
      async begin() { return { id: "fresh-attempt", redirectTo: "http://127.0.0.1:47835/auth/callback/fresh-attempt" }; },
      async openAndWait(id, url) {
        assert.equal(id, "fresh-attempt");
        const target = new URL(url);
        assert.equal(target.origin, "https://auth.oceanleo.com");
        assert.equal(target.searchParams.get("code_challenge_method"), "s256");
        assert.ok(target.searchParams.get("code_challenge"));
        assert.equal(target.searchParams.get("redirect_to"), "http://127.0.0.1:47835/auth/callback/fresh-attempt");
        return "one-use-code";
      },
      async cancel(id) { finished.push(id); },
    },
    fetch: async (url, init) => {
      requests.push([String(url), JSON.parse(init.body)]);
      return new Response(JSON.stringify({
        access_token: "test-access-token", refresh_token: "test-refresh-token",
        token_type: "bearer", expires_in: 3600,
        user: { id: "user-1", email: "test@example.invalid", aud: "authenticated" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  }));
  try {
    const result = await startOauthSignIn("google");
    assert.deepEqual(result, { signedIn: true });
    assert.equal(requests.length, 1);
    assert.match(requests[0][0], /grant_type=pkce/);
    assert.equal(requests[0][1].auth_code, "one-use-code");
    assert.ok(requests[0][1].code_verifier.length >= 43);
    assert.equal(JSON.parse(await storage.getItem(COM_AUTH_COOKIE_KEY)).user.id, "user-1");
    assert.equal(await storage.getItem(`${COM_AUTH_COOKIE_KEY}-code-verifier`), null);
    assert.deepEqual(finished, ["fresh-attempt"]);
  } finally { await browserClient()?.auth.stopAutoRefresh(); }
});

test("hosted native login verifies an independent one-use hash and every provider uses the same browser entry", async () => {
  const storage = createMemoryAuthStorage();
  let browserLogins = 0;
  const requests = [];
  configureClientHost(hostConfig({ authStorage: storage, oauth: {
    async login() { browserLogins += 1; return { tokenHash: "b".repeat(56), userId: "hosted-user" }; },
    async begin() { throw new Error("must not use provider-only PKCE"); },
    async openAndWait() { throw new Error("must not use provider-only PKCE"); },
    async cancel() {},
  }, fetch: async (url, init) => {
    requests.push([String(url), JSON.parse(init.body)]);
    return Response.json({ access_token: "native-independent-access", refresh_token: "native-independent-refresh",
      token_type: "bearer", expires_in: 3600,
      user: { id: "hosted-user", email: "test@example.invalid", aud: "authenticated" } });
  } }));
  try {
    assert.deepEqual(await startDesktopBrowserSignIn(), { signedIn: true });
    for (const provider of ["google", "microsoft", "apple"]) {
      assert.deepEqual(await startOauthSignIn(provider), { signedIn: true });
    }
    assert.equal(browserLogins, 4);
    assert.equal(requests.length, 4);
    for (const [url, body] of requests) {
      assert.ok(url.endsWith("/auth/v1/verify"));
      assert.equal(body.type, "magiclink");
      assert.equal(body.token_hash, "b".repeat(56));
    }
    assert.equal(JSON.parse(await storage.getItem(COM_AUTH_COOKIE_KEY)).refresh_token, "native-independent-refresh");
  } finally { await browserClient()?.auth.stopAutoRefresh(); }
});

test("desktop shared logout delegates host local removal and never requests global revocation", async () => {
  let hostLogouts = 0;
  const requests = [];
  configureClientHost(hostConfig({ signOut: async () => { hostLogouts += 1; }, fetch: async (url) => {
    requests.push(String(url));
    return Response.json({});
  } }));
  try {
    await signOutEverywhere();
    assert.equal(hostLogouts, 1);
    assert.ok(!requests.some((url) => url.includes("scope=global")));
  } finally { await browserClient()?.auth.stopAutoRefresh(); }
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
  const footerStart = portalShell.indexOf("const FOOTER_NAV");
  assert.ok(footerStart > 0);
  const footerChunk = portalShell.slice(footerStart, footerStart + 1400);
  assert.match(footerChunk, /\];\s*const host = useOptionalClientHost/);
  assert.match(footerChunk, /const \[userEmail/);
  assert.doesNotMatch(footerChunk, /\];\}/);
});

test("login dialog email, password, and continue have accessible names", () => {
  assert.match(authDialog, /id="oceanleo-auth-email"/);
  assert.match(authDialog, /aria-label=\{tt\("输入你的邮箱地址"\)\}/);
  assert.match(authDialog, /id="oceanleo-auth-password"/);
  assert.match(authDialog, /aria-label=\{tt\("密码"\)\}/);
  assert.match(authDialog, /aria-label=\{tt\("继续"\)\}/);
});

test("search, home task input, and send have accessible names", () => {
  assert.match(appShell, /<input[\s\S]*aria-label=\{tt\("搜索"\)\}/);
  assert.match(appShell, /aria-label=\{tt\("搜索"\)\}/);
  assert.match(promptArea, /"aria-label": placeholder/);
  assert.match(leoComposer, /aria-label=\{tt\("发送"\)\}/);
});
