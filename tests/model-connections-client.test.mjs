import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { MODEL_CONNECTION_COPY_MESSAGES } from "../src/i18n/ui/messages/model-connections-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

const api = await import(await compileModule("src/lib/auth/account.ts", {
  "./client": dataModule('export async function accessToken(){return globalThis.__connectionTestToken;} export function announcePhoneRequired(){}'),
  "./config": dataModule('export const GATEWAY_BASE="https://api.dev.oceanleo.com";'),
}));
const byokStatus = await import(await compileModule("src/shell/byok-status.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){return globalThis.__connectionTestToken;}'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://api.dev.oceanleo.com";'),
}));

test("connection client authenticates every route, includes sealed cookie and forbids caching", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.__connectionTestToken = "test-owner-session";
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ enabled: true, connections: [], status: "pending" });
  };
  try {
    await api.getModelConnections();
    await api.authorizeModelConnection({ display_name: "Writing", model: "wire-model", caps: ["tools"] });
    const controller = new AbortController();
    await api.getModelConnectionAuthorization("attempt/a", controller.signal);
    await api.deleteModelConnection("connection/a");
    await api.activateModelConnection("connection/a");
    assert.deepEqual(calls.map(({url}) => new URL(url).pathname), [
      "/v1/model-connections", "/v1/model-connections/authorizations",
      "/v1/model-connections/authorizations/attempt%2Fa", "/v1/model-connections/connection%2Fa",
      "/v1/model-connections/connection%2Fa/activate",
    ]);
    for (const { init } of calls) {
      assert.equal(init.headers.Authorization, "Bearer test-owner-session");
      assert.equal(init.credentials, "include");
      assert.equal(init.cache, "no-store");
    }
    assert.equal(calls[1].init.method, "POST");
    assert.deepEqual(JSON.parse(calls[1].init.body), { display_name: "Writing", model: "wire-model", caps: ["tools"] });
    assert.equal(calls[2].init.signal, controller.signal);
    assert.equal(calls[3].init.method, "DELETE");
    assert.equal(calls[4].init.method, "POST");
  } finally { globalThis.fetch = original; delete globalThis.__connectionTestToken; }
});

test("connection writes preserve recent-login error codes and require authentication", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ detail: { code: "reauth_required", message: "Sign in again" } }, { status: 403 });
  };
  try {
    globalThis.__connectionTestToken = "owner";
    const denied = await api.deleteModelConnection("own-id");
    assert.equal(denied.code, "reauth_required");
    assert.equal(denied.status, 403);
    globalThis.__connectionTestToken = null;
    const loggedOut = await api.getModelConnections();
    assert.equal(loggedOut.status, 401);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; delete globalThis.__connectionTestToken; }
});

test("personal model catalog uses owner auth and no shared-cache fallback", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.__connectionTestToken = "owner-a";
  globalThis.fetch = async (url, init) => {
    calls.push(init);
    if (init.headers?.Authorization === "Bearer owner-a") return Response.json({ groups: [{ id: "text", providers: [{ id: "openai", models: [{ id: "connection-opaque", key: "openai:connection-opaque", label: "Work connection", display_name: "Work connection", connection_id: "opaque", auth_type: "oauth" }] }] }] });
    return Response.json({ detail: "no longer authorized" }, { status: 401 });
  };
  try {
    const a = await api.getModelCatalog();
    assert.equal(a.data.groups[0].providers[0].models[0].label, "Work connection");
    assert.equal(a.data.groups[0].providers[0].models[0].connection_id, "opaque");
    assert.equal(calls[0].cache, "no-store");
    globalThis.__connectionTestToken = "owner-b";
    const b = await api.getModelCatalog();
    assert.equal(b.ok, false);
    assert.equal(b.data, undefined);
  } finally { globalThis.fetch = original; delete globalThis.__connectionTestToken; }
});

test("BYOK status cache uses aliases and never carries them across account changes", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    return Response.json({ enabled: true, providers: [{ provider: "openai", name: "OpenAI", display_name: init.headers.Authorization === "Bearer a" ? "Alice connection" : "Bob connection" }] });
  };
  try {
    byokStatus.invalidateByokStatus();
    globalThis.__connectionTestToken = "a";
    assert.deepEqual((await byokStatus.fetchByokStatusLite()).providers, ["Alice connection"]);
    await byokStatus.fetchByokStatusLite();
    assert.equal(calls, 1);
    globalThis.__connectionTestToken = "b";
    assert.deepEqual((await byokStatus.fetchByokStatusLite()).providers, ["Bob connection"]);
    assert.equal(calls, 2);
    globalThis.__connectionTestToken = null;
    assert.equal(await byokStatus.fetchByokStatusLite(), null);
  } finally {
    globalThis.fetch = original;
    delete globalThis.__connectionTestToken;
    byokStatus.invalidateByokStatus();
  }
});

test("connection copy is translated for every supported locale", () => {
  const zhKeys = Object.keys(MODEL_CONNECTION_COPY_MESSAGES.zh);
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(MODEL_CONNECTION_COPY_MESSAGES[locale]), zhKeys);
    for (const key of zhKeys) assert.ok(MODEL_CONNECTION_COPY_MESSAGES[locale][key].trim());
  }
});
