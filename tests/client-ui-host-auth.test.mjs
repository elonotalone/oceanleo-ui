import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGoTrueSession, SESSION_STORAGE_KEY } from "../../oceanleo-app/desktop/src/gotrue-session.js";
import { createClientHostConfig } from "../../oceanleo-app/desktop/src/boot.js";

import { authFetch } from "../src/lib/auth/auth-fetch.ts";
import { browserClient, getUserEmail, startOauthSignIn, startDesktopBrowserSignIn, signOutEverywhere } from "../src/lib/auth/client.ts";
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

const gate = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function nativeAccount(label, userId = "synthetic-owner") {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const body = { sub: userId, exp, session_id: label };
  return { accessToken: `e30.${Buffer.from(JSON.stringify(body)).toString("base64url")}.c2ln`,
    refreshToken: `synthetic-${label}`, userId, email: `${userId}@example.invalid`, expiresAt: exp * 1000 };
}
function sdkIssued(session) {
  return { access_token: session.accessToken, refresh_token: session.refreshToken, expires_at: session.expiresAt / 1000, expires_in: 3600,
    token_type: "bearer", user: { id: session.userId, email: session.email } };
}
async function nativeFixture(t, fetch) {
  const initial = nativeAccount("initial");
  const keys = new Map([[SESSION_STORAGE_KEY, JSON.stringify(initial)], [CN_AUTH_COOKIE_KEY, "{stale-mirror"]]);
  const f = { initial, keys, current: initial, pending: null, failClear: false, loseClearReply: false, invalidations: 0, presences: [], clock: Date.now() };
  const host = createGoTrueSession({ anonKey: "synthetic-anon", identityOrigin: "https://id-cn.dev.oceanleo.com", clock: () => f.clock,
    port: { secureGet: async (key) => keys.get(key) || null,
      secureSet: async (key, value) => { keys.set(key, value); if (key === SESSION_STORAGE_KEY) f.current = JSON.parse(value); },
      secureClear: async (key) => { keys.delete(key); if (key === SESSION_STORAGE_KEY) f.current = null; } },
    fetch: async () => { throw new Error("Unexpected host HTTP"); },
    invoke: async (command, args) => {
      if (command === "device_set_auth_presence") { f.presences.push(args); return; }
      if (command === "device_refresh_auth_session") return { status: 409, body: { error: "native_session_changed" } };
      assert.equal(command, "device_invalidate_auth_session", "SDK must not own native refresh");
      f.invalidations += 1;
      const matches = f.current?.accessToken === args.accessToken || (!f.current && f.pending === args.accessToken);
      if (!matches) {
        const reply = { cleared: false, durable: true, session: f.current ? sdkIssued(f.current) : null };
        await f.beforeReply?.();
        return reply;
      }
      f.current = null; f.pending = f.failClear ? args.accessToken : null;
      if (!f.failClear) keys.clear();
      if (f.loseClearReply) throw new Error("Synthetic lost native acknowledgement");
      return { cleared: true, durable: !f.failClear };
    } });
  await host.ready;
  configureClientHost(createClientHostConfig({ session: host, identityAnonKey: "synthetic-anon", family: "cn",
    identityOrigin: "https://id-cn.dev.oceanleo.com", apiEndpoint: "https://api-cn.dev.oceanleo.com", fetch }));
  const client = browserClient(); await client.auth.initialize();
  t.after(async () => { await client.auth.stopAutoRefresh(); host.dispose(); });
  return { ...f, host, client, state: f, async adopt(session) { assert.equal((await host.auth.importSession(sdkIssued(session))).ok, true); } };
}
const rejectedSession = () => Response.json({ code: "session_not_found" }, { status: 401,
  headers: { "X-Supabase-Api-Version": "2024-01-01" } });

test("native SDK late rejection cannot remove a newer login or account replacement", async (t) => {
  for (const user of ["synthetic-owner", "replacement-owner"]) {
    await t.test(user, async (t) => {
      const seen = gate(), release = gate();
      const f = await nativeFixture(t, async () => { seen.resolve(); await release.promise; return rejectedSession(); });
      const request = f.client.auth.getUser(); await seen.promise;
      const next = nativeAccount("new", user); await f.adopt(next);
      release.resolve(); assert.equal((await request).error.name, "AuthSessionMissingError");
      assert.equal(JSON.parse(f.keys.get(SESSION_STORAGE_KEY)).accessToken, next.accessToken);
      assert.equal((await f.host.getIdentity()).accessToken, next.accessToken);
      assert.equal(f.state.invalidations, 0, "JS queue rejects an old snapshot before native IPC");
    });
  }
});

test("native SDK stale JS snapshot cannot remove native background or unsaved rotation", async (t) => {
  for (const durable of [true, false]) {
    await t.test(`durable=${durable}`, async (t) => {
      const f = await nativeFixture(t, async () => rejectedSession());
      const next = nativeAccount("native-rotation"); f.state.current = next;
      if (durable) f.keys.set(SESSION_STORAGE_KEY, JSON.stringify(next));
      assert.equal((await f.host.getIdentity()).accessToken, f.initial.accessToken);
      await f.client.auth.getUser();
      assert.equal(f.state.current.accessToken, next.accessToken);
      assert.equal(JSON.parse(f.keys.get(SESSION_STORAGE_KEY)).accessToken, durable ? next.accessToken : f.initial.accessToken);
      assert.equal(f.state.invalidations, 1);
    });
  }
});

test("native SDK current revocation clears once without an unconditional null publication", async (t) => {
  const f = await nativeFixture(t, async () => rejectedSession());
  const before = f.state.presences.length;
  await Promise.all([f.client.auth.getUser(), f.client.auth.getUser()]);
  assert.equal(await f.host.getIdentity(), null);
  assert.equal(f.keys.has(SESSION_STORAGE_KEY), false);
  assert.equal(f.state.invalidations, 1);
  assert.equal(f.state.presences.length, before, "native conditional IPC already fenced; no later unconditional null");
});

test("native current revocation retries a failed durable clear conditionally and preserves later login", async (t) => {
  const f = await nativeFixture(t, async () => rejectedSession()); f.state.failClear = true;
  await f.client.auth.getUser();
  assert.equal(await f.host.getIdentity(), null);
  assert.deepEqual(f.host.auth.persistence(), { durable: false, pending: "remove" });
  const next = nativeAccount("external-login"); f.state.current = next;
  f.keys.set(SESSION_STORAGE_KEY, JSON.stringify(next)); f.state.clock += 5001;
  const restored = await f.host.getIdentity();
  assert.equal(restored.accessToken, next.accessToken);
  assert.equal(JSON.parse(f.keys.get(SESSION_STORAGE_KEY)).accessToken, next.accessToken);
  assert.equal(f.state.invalidations, 2);
});

test("native unrelated JWT, generic rejection and transient error preserve canonical", async (t) => {
  for (const category of ["unrelated", "generic", "transient"]) {
    await t.test(category, async (t) => {
      const f = await nativeFixture(t, async () => category === "unrelated" ? rejectedSession()
        : Response.json({ code: category === "generic" ? "bad_jwt" : "temporarily_unavailable" }, { status: category === "generic" ? 401 : 503 }));
      await f.client.auth.getUser(category === "unrelated" ? nativeAccount("unrelated", "other").accessToken : undefined);
      assert.equal((await f.host.getIdentity()).accessToken, f.initial.accessToken);
      assert.equal(f.state.invalidations, 0);
    });
  }
});

test("native SDK password login persists normally through setItem", async (t) => {
  const next = nativeAccount("sdk-login", "sdk-owner");
  const f = await nativeFixture(t, async () => Response.json(sdkIssued(next)));
  assert.equal((await f.client.auth.signInWithPassword({ email: next.email, password: "synthetic" })).error, null);
  assert.equal((await f.host.getIdentity()).accessToken, next.accessToken);
  assert.equal(JSON.parse(f.keys.get(SESSION_STORAGE_KEY)).accessToken, next.accessToken);
});

test("native SDK explicit logout delegates unconditional local host removal", async (t) => {
  const f = await nativeFixture(t, async () => { throw new Error("SDK must not own logout HTTP"); });
  assert.equal((await f.client.auth.signOut()).error, null);
  assert.equal(await f.host.getIdentity(), null);
  assert.equal(f.keys.has(SESSION_STORAGE_KEY), false);
  assert.deepEqual(f.state.presences.at(-1), { userId: null, accessToken: null });
  assert.equal(f.state.invalidations, 0, "explicit logout does not use conditional revocation");
});

test("native SDK rejection after explicit logout and login C leaves C intact", async (t) => {
  const seen = gate(), release = gate();
  const f = await nativeFixture(t, async () => { seen.resolve(); await release.promise; return rejectedSession(); });
  const request = f.client.auth.getUser(); await seen.promise;
  await f.host.signOut();
  const next = nativeAccount("after-logout", "owner-c"); await f.adopt(next);
  release.resolve(); await request;
  assert.equal((await f.host.getIdentity()).accessToken, next.accessToken);
  assert.equal(JSON.parse(f.keys.get(SESSION_STORAGE_KEY)).accessToken, next.accessToken);
});

test("native current revocation retries a refused clear without reviving the rejected snapshot", async (t) => {
  const f = await nativeFixture(t, async () => rejectedSession()); f.state.failClear = true;
  await f.client.auth.getUser();
  assert.equal(await f.host.getIdentity(), null);
  f.state.failClear = false; f.state.clock += 5001;
  assert.equal(await f.host.getIdentity(), null);
  assert.equal(f.keys.has(SESSION_STORAGE_KEY), false);
  assert.deepEqual(f.host.auth.persistence(), { durable: true, pending: null });
});

test("native lost clear acknowledgement ends only the rejected JS snapshot and keeps retry conditional", async (t) => {
  const f = await nativeFixture(t, async () => rejectedSession()); f.state.loseClearReply = true;
  await f.client.auth.getUser();
  assert.equal(await f.host.getIdentity(), null);
  const next = nativeAccount("after-lost-clear"); f.state.current = next;
  f.keys.set(SESSION_STORAGE_KEY, JSON.stringify(next)); f.state.clock += 5001;
  assert.equal((await f.host.getIdentity()).accessToken, next.accessToken);
});

test("native mismatch reply B stays a reader snapshot after external logout or account C", async (t) => {
  for (const action of ["logout", "account-c"]) {
    await t.test(action, async (t) => {
      const seen = gate(), release = gate();
      const f = await nativeFixture(t, async () => rejectedSession());
      const b = nativeAccount("native-b"); f.state.current = b;
      f.keys.set(SESSION_STORAGE_KEY, JSON.stringify(b));
      f.state.beforeReply = () => { seen.resolve(); return release.promise; };
      const pending = f.client.auth.getUser(); await seen.promise;
      const before = f.state.presences.length;
      const c = action === "account-c" ? nativeAccount("native-c", "owner-c") : null;
      f.state.current = c; f.keys.clear();
      if (c) f.keys.set(SESSION_STORAGE_KEY, JSON.stringify(c));
      release.resolve(); await pending;
      assert.equal((await f.host.getIdentity()).accessToken, b.accessToken, "receipt only updates this reader");
      assert.equal(f.keys.get(SESSION_STORAGE_KEY) || null, c ? JSON.stringify(c) : null);
      assert.equal(f.state.presences.length, before, "late getIdentity cannot authorize the reader's B snapshot");
      f.state.clock = b.expiresAt + 1;
      await f.host.getIdentity();
      assert.equal(f.state.presences.length, before, "expiry observations cannot republish the native reader snapshot either");
    });
  }
});

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

test("hosted native login waits for host durable completion and every provider uses the same browser entry", async () => {
  const storage = createMemoryAuthStorage();
  let browserLogins = 0;
  const requests = [];
  configureClientHost(hostConfig({ authStorage: storage, oauth: {
    async login(_signal, progress) {
      browserLogins += 1;
      progress?.("saving");
      await storage.setItem(COM_AUTH_COOKIE_KEY, JSON.stringify({ access_token: "native-independent-access",
        refresh_token: "native-independent-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: "hosted-user" } }));
      progress?.("completing");
    },
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
    assert.equal(requests.length, 0, "shared SDK does not exchange or rotate the host's native session");
    assert.equal(JSON.parse(await storage.getItem(COM_AUTH_COOKIE_KEY)).refresh_token, "native-independent-refresh");
  } finally { await browserClient()?.auth.stopAutoRefresh(); }
});

test("native session remains authoritative across SDK expiry margin and transient recovery", async () => {
  const storage = createMemoryAuthStorage();
  await storage.setItem(COM_AUTH_COOKIE_KEY, "saved-host-credential");
  let expiresAt = Date.now() + 75_000;
  const token = [ { alg: "HS256" }, { sub: "remembered", exp: Math.floor(expiresAt / 1000), aal: "aal1" } ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".") + ".synthetic-signature";
  const requests = [];
  configureClientHost(hostConfig({ authStorage: storage, nativeSession: {
    async getSession() { return { accessToken: token, refreshToken: "native-refresh", userId: "remembered",
      email: "remembered@example.invalid", expiresAt }; },
    subscribe() { return () => {}; },
  }, fetch: async (url) => { requests.push(String(url)); throw new Error("SDK must not refresh"); } }));
  const client = browserClient();
  assert.equal((await client.auth.getSession()).data.session.access_token, token);
  // Internal SDK session consumers use __loadSession's90s margin. They must
  // neither rotate nor remove the host's independent refresh credential.
  await client.auth.mfa.getAuthenticatorAssuranceLevel();
  expiresAt = Date.now() - 1000;
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.equal(await getUserEmail(), "remembered@example.invalid");
  assert.equal(await storage.getItem(COM_AUTH_COOKIE_KEY), "saved-host-credential");
  assert.deepEqual(requests, []);
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
