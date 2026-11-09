import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined });
  return { ok: true, async json() { return { ok: true, auth: "key" }; } };
};
const mod = await import(await compileModule("src/shell/cloud-computer/agent-dialog/program-key-api.ts", {
  "../../../lib/auth/client": dataModule("export async function accessToken() { return 'test-auth'; }"),
  "../../../lib/auth/config": dataModule("export const GATEWAY_BASE = 'https://api.test';"),
}));

test("secret method kind and replacement confirmation are sent only when confirmed", async () => {
  calls.length = 0;
  await mod.saveProgramKey("cc_test", "codex", "access-value", "", "access_token", false);
  assert.deepEqual(calls[0].body, { key: "access-value", provider: "", kind: "access_token" });
  await mod.saveProgramKey("cc_test", "codex", "api-value", "", "api_key", true);
  assert.deepEqual(calls[1].body, { key: "api-value", provider: "", kind: "api_key", confirm_replace_login: true });
});
