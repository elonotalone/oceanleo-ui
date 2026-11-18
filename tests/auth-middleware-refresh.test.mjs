import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBrowserClient,
  createChunks,
  DEFAULT_COOKIE_OPTIONS,
  stringToBase64URL,
} from "@supabase/ssr";
import { NextRequest } from "next/server.js";
import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies/index.js";

// Synthetic identity only. Every request below is intercepted before transport.
process.env.NEXT_PUBLIC_OCEANLEO_SUPABASE_URL = "https://identity.invalid";
process.env.NEXT_PUBLIC_OCEANLEO_ANON_KEY = "synthetic-anon-key";
delete process.env.NEXT_PUBLIC_OCEANLEO_COOKIE_DOMAIN;
delete process.env.NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY;
const { authFetch } = await import("../src/lib/auth/auth-fetch.ts");
const { cookieOptions } = await import("../src/lib/auth/config.ts");
const { updateSession } = await import("../src/lib/auth/middleware.ts");
const HOST = "oceanbizs.com";
const BASE = cookieOptions(HOST).name;

function session(padding, expired, generation = "old") {
  const expires_at = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "synthetic-user", exp: expires_at, generation })).toString("base64url");
  return {
    access_token: `${header}.${payload}.c3ludGhldGlj`,
    refresh_token: `synthetic-refresh-${generation}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at,
    user: { id: "synthetic-user", user_metadata: { padding: "x".repeat(padding) } },
  };
}

function sessionJar(value) {
  return new Map(createChunks(BASE, `base64-${stringToBase64URL(JSON.stringify(value))}`)
    .map(({ name, value }) => [name, value]));
}

function requestFor(jar, host = HOST) {
  return new NextRequest(`https://${host}/`, {
    headers: {
      host,
      cookie: [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; "),
    },
  });
}

function browserFor(jar) {
  return createBrowserClient("https://identity.invalid", "synthetic-anon-key", {
    isSingleton: false,
    cookieOptions: cookieOptions(HOST),
    global: { fetch: authFetch },
    auth: { autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => {
        if (value) jar.set(name, value);
        else jar.delete(name);
      }),
    },
  });
}

function stubAuth(t, status, renewed) {
  let calls = 0;
  const logError = console.error;
  t.mock.method(console, "error", (...args) => {
    if (!args[0]?.__isAuthError) logError(...args);
  });
  // Advance the SDK's 30-second retry budget inside the fake response so
  // production retry logic runs unchanged, without sleeping in the tests.
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? input.href);
    assert.equal(url.origin, "https://identity.invalid");
    if (url.pathname === "/auth/v1/user" && renewed) return Response.json(renewed.user);
    assert.equal(url.pathname, "/auth/v1/token");
    assert.equal(url.searchParams.get("grant_type"), "refresh_token");
    calls++;
    if (status === 200) return Response.json(renewed);
    now += 31_000;
    return Response.json({ error: status === 400 ? "invalid_grant" : "server_error" }, { status });
  });
  return () => calls;
}

for (const [oldPadding, newPadding, label] of [
  [2500, 2500, "two chunks"],
  [0, 0, "small session"],
  [2500, 0, "chunks shrink to base cookie"],
  [0, 2500, "base cookie grows into chunks"],
]) {
// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Session chunk identity across refresh is token-lifecycle behavior; this case does not assert the cookie-domain boundary.
  test(`middleware refresh preserves cookie identity: ${label}`, async (t) => {
    const old = session(oldPadding, true);
    const renewed = session(newPadding, false, "new");
    const jar = sessionJar(old);
    const expected = sessionJar(renewed);
    assert.equal(jar.size, oldPadding ? 2 : 1);
    assert.equal(expected.size, newPadding ? 2 : 1);
    const calls = stubAuth(t, 200, renewed);
    const request = requestFor(jar);
    const response = await updateSession(request);
    assert.equal(calls(), 1);

    const writes = new ResponseCookies(response.headers).getAll();
    assert.deepEqual(writes.filter(({ value }) => value).map(({ name }) => name).sort(), [...expected.keys()].sort());
    if (oldPadding && newPadding) {
      t.diagnostic(response.headers.getSetCookie()
        .map((line) => line.replace(/^([^=]+=)[^;]*/, "$1<redacted>"))
        .join("\n"));
    }
    for (const cookie of writes) {
      assert.equal(cookie.domain, ".oceanbizs.com");
      assert.equal(cookie.path, "/");
      assert.equal(cookie.sameSite, "lax");
      assert.equal(cookie.secure, true);
      assert.ok(!cookie.httpOnly);
      if (cookie.value) {
        assert.equal(cookie.maxAge, DEFAULT_COOKIE_OPTIONS.maxAge);
        assert.ok(expected.get(cookie.name) === cookie.value, "each named cookie contains its complete expected chunk");
        jar.set(cookie.name, cookie.value);
      } else {
        // Next's parser drops falsy maxAge: 0. Assert the wire tombstone.
        const line = response.headers.getSetCookie().find((line) => line.startsWith(`${cookie.name}=`));
        assert.match(line, /; Max-Age=0(?:;|$)/);
        assert.ok(!expected.has(cookie.name), "a deletion must never erase a live refreshed cookie");
        jar.delete(cookie.name);
      }
    }
    assert.deepEqual([...jar.keys()].sort(), [...expected.keys()].sort());
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    assert.equal(response.headers.get("cdn-cache-control"), "private, no-store");
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "private, no-store");

    // Parse both response and forwarded request with the actual browser SDK's
    // cookie reader. Server components must receive the new session this turn.
    const forwarded = response.headers.get("x-middleware-request-cookie");
    assert.ok(forwarded, "Next forwards the refreshed request cookie header");
    const forwardedJar = new Map(new NextRequest(`https://${HOST}/`, { headers: { cookie: forwarded } })
      .cookies.getAll().map(({ name, value }) => [name, value]));
    assert.deepEqual([...forwardedJar.keys()].sort(), [...expected.keys()].sort());
    for (const target of [jar, forwardedJar]) {
      const browser = browserFor(target);
      const { data, error } = await browser.auth.getSession();
      assert.equal(error, null);
      assert.ok(data.session?.access_token === renewed.access_token, "browser reads refreshed access token");
      assert.ok(data.session?.refresh_token === renewed.refresh_token, "browser reads rotated refresh token");
      await browser.auth.stopAutoRefresh();
    }
    assert.equal(calls(), 1, "no reader needs a second refresh");
  });
}

for (const padding of [0, 2500]) {
  for (const status of [500, 504, 520, 524, 599]) {
    test(`${padding ? "chunked" : "small"} session survives refresh ${status}`, async (t) => {
      const jar = sessionJar(session(padding, true));
      const before = new Map(jar);
      const calls = stubAuth(t, status);
      const response = await updateSession(requestFor(jar));
      assert.equal(response.headers.getSetCookie().length, 0);
      const browser = browserFor(jar);
      const { error } = await browser.auth.getSession();
      assert.equal(error?.name, "AuthRetryableFetchError");
      assert.equal(error?.status, 503);
      assert.ok([...before].every(([name, value]) => jar.get(name) === value) && before.size === jar.size,
        "the stored session stays untouched");
      assert.equal(calls(), 2, "one middleware and one browser attempt, with budget exhausted");
      await browser.auth.stopAutoRefresh();
    });
  }

// UC-NONE: docs/architecture/oceanleo-untrusted-content-isolation.md.
// Invalid-grant session removal tests token lifecycle using fake auth responses, not cookie-domain expansion.
  test(`${padding ? "chunked" : "small"} invalid_grant still signs the browser out`, async (t) => {
    const jar = sessionJar(session(padding, true));
    stubAuth(t, 400);
    const browser = browserFor(jar);
    const { data, error } = await browser.auth.getSession();
    assert.equal(error?.name, "AuthApiError");
    assert.equal(error?.status, 400);
    assert.equal(data.session, null);
    assert.equal(jar.size, 0, "terminal revocation removes all session chunks");
    await browser.auth.stopAutoRefresh();
  });
}

test("preview middleware never refreshes or rewrites the inherited family session", async (t) => {
  const jar = sessionJar(session(2500, true));
  const calls = stubAuth(t, 500);
  const response = await updateSession(requestFor(jar, `p-${"a".repeat(32)}.dev.oceanleo.com`));
  assert.equal(calls(), 0);
  assert.equal(response.headers.getSetCookie().length, 0);
});

// UC-NONE: cookie identity and token lifetime, not a change to cookie-domain
// boundaries (docs/architecture/oceanleo-untrusted-content-isolation.md §8.7).
test("cookie options cannot override explicit write identity", async () => {
  const source = await readFile(new URL("../src/lib/auth/middleware.ts", import.meta.url), "utf8");
  assert.match(source, /response\.cookies\.set\(\{\s*\.\.\.options,\s*\.\.\.opts,\s*name,\s*value\s*\}\)/);
});
