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

test("retired subscription client exports are unavailable", () => {
  for (const name of ["getModelConnections", "authorizeModelConnection", "getModelConnectionAuthorization", "deleteModelConnection", "activateModelConnection"]) assert.equal(name in api, false);
});

test("personal model catalog uses owner auth and no shared-cache fallback", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.__connectionTestToken = "owner-a";
  globalThis.fetch = async (url, init) => {
    calls.push(init);
    if (init.headers?.Authorization === "Bearer owner-a") return Response.json({ groups: [{ id: "text", providers: [{ id: "openai", models: [{ id: "connection-opaque", key: "openai:connection-opaque", label: "Work connection", display_name: "Work connection", connection_id: "opaque", auth_type: "api_key" }] }] }] });
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
