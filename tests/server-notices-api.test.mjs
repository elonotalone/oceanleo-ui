import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const api = await import(await compileModule("src/api/notifications.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){ if(globalThis.__noticeAuthFails) throw new Error("auth unavailable"); return "test-only"; }'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://gateway.invalid";'),
}));

test("notice source clients GET, PATCH and DELETE use owner API, encoded paths and JSON; DELETE accepts 204", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return init.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ items: [] });
  });
  assert.deepEqual(await api.listComputerNoticeSources(), { ok: true, data: { items: [] } });
  assert.equal((await api.updateComputerNoticeSource("pc/一", "备份 / nightly?", { enabled: false, min_level: "urgent" })).ok, true);
  assert.deepEqual(await api.forgetComputerNoticeSource("pc/一", "备份 / nightly?"), { ok: true });
  const path = `https://gateway.invalid/v1/computers/${encodeURIComponent("pc/一")}/notice-sources/${encodeURIComponent("备份 / nightly?")}`;
  assert.equal(calls[0].url, "https://gateway.invalid/v1/computers/notice-sources");
  assert.equal(calls[1].url, path);
  assert.equal(calls[2].url, path);
  assert.equal(calls[1].init.method, "PATCH");
  assert.equal(calls[2].init.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[1].init.body), { enabled: false, min_level: "urgent" });
  assert.equal(calls[1].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-only");
});

test("notice source client failures resolve ok:false on HTTP, transport and auth errors", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  assert.deepEqual(await api.listComputerNoticeSources(), { ok: false });
  fetch.mock.mockImplementation(async () => { throw new Error("offline"); });
  assert.deepEqual(await api.updateComputerNoticeSource("pc", "backup", { enabled: false }), { ok: false });
  globalThis.__noticeAuthFails = true;
  try { assert.deepEqual(await api.forgetComputerNoticeSource("pc", "backup"), { ok: false }); }
  finally { delete globalThis.__noticeAuthFails; }
});
