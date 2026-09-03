import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AUTH_FETCH_TIMEOUT_MS,
  authFetch,
  isTransientAuthStatus,
} from "../src/lib/auth/auth-fetch.ts";

test("5xx and Cloudflare 52x are the statuses supabase-js would retry for 30s", () => {
  for (const status of [500, 502, 503, 504, 520, 522]) {
    assert.equal(isTransientAuthStatus(status), true, String(status));
  }
  assert.equal(isTransientAuthStatus(401), false);
  assert.equal(isTransientAuthStatus(200), false);
});

test("503 becomes 401 so auth-js will not retry a full refresh tick", async () => {
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

test("a hung auth fetch becomes 401 instead of throwing", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        { once: true },
      );
    });
  try {
    const started = Date.now();
    const res = await authFetch("https://example.invalid/hang");
    assert.equal(res.status, 401);
    assert.ok(
      Date.now() - started < AUTH_FETCH_TIMEOUT_MS + 1500,
      "timeout wrapper did not bound the hang",
    );
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
  assert.match(client, /from "\.\/auth-fetch"/);
  assert.match(client, /fetch:\s*authFetch/);
});
