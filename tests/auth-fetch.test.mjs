import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  authFetch,
  isAuthJwksRequest,
  isAuthRefreshRequest,
  isAuthUserRequest,
  isTransientAuthStatus,
} from "../src/lib/auth/auth-fetch.ts";

test("known transient JWKS statuses keep their existing classification", () => {
  for (const status of [500, 502, 503, 504, 520, 522]) {
    assert.equal(isTransientAuthStatus(status), true, String(status));
  }
  assert.equal(isTransientAuthStatus(499), false);
  assert.equal(isTransientAuthStatus(599), false);
  assert.equal(isTransientAuthStatus(600), false);
  assert.equal(isTransientAuthStatus(401), false);
  assert.equal(isTransientAuthStatus(200), false);
});

test("isAuthRefreshRequest only matches the token grant", () => {
  assert.equal(isAuthRefreshRequest("https://auth.oceanleo.com/auth/v1/token?grant_type=refresh_token"), true);
  assert.equal(isAuthRefreshRequest("https://auth.oceanleo.com/auth/v1/token"), true);
  assert.equal(isAuthRefreshRequest("https://auth.oceanleo.com/auth/v1/.well-known/jwks.json"), false);
  assert.equal(isAuthRefreshRequest("https://auth.oceanleo.com/auth/v1/user"), false);
  assert.equal(isAuthJwksRequest("https://auth.oceanleo.com/auth/v1/.well-known/jwks.json"), true);
  assert.equal(isAuthUserRequest("https://auth.oceanleo.com/auth/v1/user"), true);
  assert.equal(isAuthUserRequest("https://auth.oceanleo.com/auth/v1/token"), false);
});

test("503 on JWKS becomes 401 so getClaims will not retry a full refresh tick", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("upstream connect error", { status: 503 });
  try {
    const res = await authFetch("https://example.invalid/auth/v1/.well-known/jwks.json");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "auth_unavailable");
  } finally {
    globalThis.fetch = original;
  }
});

test("503 on token refresh stays 503 so the session cookie is not wiped", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("upstream connect error", { status: 503 });
  try {
    const res = await authFetch("https://example.invalid/auth/v1/token?grant_type=refresh_token");
    assert.equal(res.status, 503);
  } finally {
    globalThis.fetch = original;
  }
});

test("every refresh 5xx becomes retryable 503, with JWKS and user handling preserved", async (t) => {
  let status = 500;
  t.mock.method(globalThis, "fetch", async () => new Response("upstream unavailable", { status }));
  for (; status <= 599; status++) {
    const refresh = await authFetch("https://example.invalid/auth/v1/token?grant_type=refresh_token");
    assert.equal(refresh.status, 503, String(status));
    assert.deepEqual(await refresh.json(), { error: "auth_unavailable", msg: "login service unavailable" });
  }
  for (status of [500, 504, 520, 524, 599]) {
    const jwks = await authFetch("https://example.invalid/auth/v1/.well-known/jwks.json");
    assert.equal(jwks.status, status === 599 ? 599 : 401);
    for (const path of ["/auth/v1/user", "/other"]) {
      const response = await authFetch(`https://example.invalid${path}`);
      assert.equal(response.status, status);
      assert.equal(await response.text(), "upstream unavailable");
    }
  }
});

test("a real 400 invalid_grant passes through unchanged", async (t) => {
  const denied = Response.json({ error: "invalid_grant" }, { status: 400 });
  t.mock.method(globalThis, "fetch", async () => denied);
  const response = await authFetch("https://example.invalid/auth/v1/token?grant_type=refresh_token");
  assert.equal(response, denied);
  assert.deepEqual(await response.json(), { error: "invalid_grant" });
});

test("401 on a refresh is softened so a cross-subdomain rotation race cannot wipe SSO", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("refresh raced", { status: 401 });
  try {
    const res = await authFetch("https://example.invalid/auth/v1/token?grant_type=refresh_token");
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      error: "auth_unavailable",
      msg: "login service unavailable",
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("200 passes through unchanged", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ keys: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    const res = await authFetch("https://example.invalid/jwks");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { keys: [] });
  } finally {
    globalThis.fetch = original;
  }
});

test("a hung auth fetch is not aborted by a 2500ms wrapper", async () => {
  const original = globalThis.fetch;
  let sawTimeout = false;
  globalThis.fetch = (_input, init) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        sawTimeout = true;
        resolve(new Response("late", { status: 200 }));
      }, 3200);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve(new Response("aborted", { status: 499 }));
      }, { once: true });
    });
  try {
    const res = await authFetch("https://example.invalid/hang");
    assert.equal(res.status, 200);
    assert.equal(sawTimeout, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("refresh network failure is 503, not a fake signed-out 401", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  try {
    const refresh = await authFetch("https://example.invalid/auth/v1/token?grant_type=refresh_token");
    assert.equal(refresh.status, 503);
    const jwks = await authFetch("https://example.invalid/auth/v1/.well-known/jwks.json");
    assert.equal(jwks.status, 401);
    const user = await authFetch("https://auth.oceanleo.com/auth/v1/user");
    assert.equal(user.status, 503);
  } finally {
    globalThis.fetch = original;
  }
});

test("503 on getUser stays 503 so supabase-js does not SIGNED_OUT", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("upstream connect error", { status: 503 });
  try {
    const res = await authFetch("https://auth.oceanleo.com/auth/v1/user");
    assert.equal(res.status, 503);
  } finally {
    globalThis.fetch = original;
  }
});

test("middleware and browser client both send traffic through authFetch", async () => {
  const middleware = await readFile(
    new URL("../src/lib/auth/middleware.ts", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("../src/lib/auth/client.ts", import.meta.url),
    "utf8",
  );
  assert.match(middleware, /from "\.\/auth-fetch"/);
  assert.match(middleware, /fetch:\s*authFetch/);
  assert.match(middleware, /wiping && !replacing/);
  assert.match(client, /from "\.\/auth-fetch"/);
  assert.match(client, /fetch:\s*authFetch/);
});
