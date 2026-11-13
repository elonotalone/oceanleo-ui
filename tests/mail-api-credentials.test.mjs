import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const auth = dataModule(`
  let token = "test-owner";
  export function setToken(value) { token = value; }
  export async function accessToken() { return token; }
`);
const { setToken } = await import(auth);
const { getMail } = await import(await compileModule("src/lib/mail-api.ts", {
  "./auth/client": auth,
  "./auth/config": dataModule('export const GATEWAY_BASE = "https://gateway.test";'),
}));

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  setToken("test-owner");
  try { await run(); }
  finally { globalThis.fetch = original; setToken("test-owner"); }
}

const snapshot = {
  domain: "mail.example.test",
  address: { id: "main", kind: "main", name: "", instructions: "", local_part: "owner", email: "owner@mail.example.test" },
  workflows: [], senders: [], inbox: [],
};

test("getMail reads the private gateway with owner authorization and included credentials", async () => {
  const calls = [];
  await withFetch(async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(snapshot), { status: 200 });
  }, async () => {
    assert.deepEqual(await getMail(), { ok: true, data: snapshot });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gateway.test/v1/mail");
    assert.equal(calls[0].init.method ?? "GET", "GET");
    assert.equal(calls[0].init.body, undefined);
    assert.equal(calls[0].init.credentials, "include");
    assert.deepEqual(calls[0].init.headers, {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer test-owner",
    });
  });
});

test("getMail rejects a missing account token before making any request", async () => {
  let calls = 0;
  await withFetch(async () => { calls++; throw Error("unexpected unauthenticated request"); }, async () => {
    setToken(null);
    assert.deepEqual(await getMail(), { ok: false, error: "signed_out" });
    assert.equal(calls, 0);
  });
});

test("getMail preserves authenticated gateway refusals while forwarding credentials", async () => {
  const calls = [];
  await withFetch(async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ detail: { code: "signed_out" } }), { status: 401 });
  }, async () => {
    assert.deepEqual(await getMail(), { ok: false, error: "signed_out" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gateway.test/v1/mail");
    assert.equal(calls[0].init.credentials, "include");
    assert.equal(calls[0].init.headers.Authorization, "Bearer test-owner");
  });
});
