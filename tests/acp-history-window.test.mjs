import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const calls = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url) => {
  calls.push(String(url));
  return json({ rows: [], turns: [], oldest_id: null, newest_id: 20, next_before: 1, has_more: true, tail_id: 20, capped: false, max_rows: 2000, next_after: 30, has_more_after: true });
};
const api = await import(await compileModule("src/lib/acp-frames-api.ts", {
  "./auth/client": dataModule("export async function accessToken(){ return 'test-token'; }"),
  "./auth/config": dataModule("export function gatewayBase(){ return 'https://gw.test'; }"),
}));

test("first window requests newest eight turns", async () => {
  calls.length = 0;
  const page = await api.getHistoryWindow("task 1", { turns: 8 });
  assert.match(calls[0], /\/v1\/tasks\/task%201\/history\?turns=8$/);
  assert.equal(page.tail_id, 20);
  assert.equal(page.max_rows, 2000);
});

test("older window sends before cursor", async () => {
  calls.length = 0;
  await api.getHistoryWindow("t1", { before: 20, turns: 8 });
  assert.match(calls[0], /before=20/);
});

test("anchor reopen sends anchor cursor", async () => {
  calls.length = 0;
  await api.getHistoryWindow("t1", { anchor: 120, turns: 8 });
  assert.match(calls[0], /anchor=120/);
});

test("C9b forward fill sends after cursor and exposes next_after", async () => {
  calls.length = 0;
  const page = await api.getHistoryWindow("t1", { after: 20, turns: 8 });
  assert.match(calls[0], /after=20/);
  assert.equal(page.next_after, 30);
  assert.equal(page.has_more_after, true);
});

test("history response carries capped metadata for the loading notice", async () => {
  const page = await api.getHistoryWindow("t1");
  assert.equal(page.capped, false);
  assert.equal(page.has_more, true);
});

test("a history 404 is preserved for the hook's full-stream fallback", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => json({ detail: "Not Found" }, 404);
  await assert.rejects(() => api.getHistoryWindow("legacy"), (error) => error?.status === 404);
  globalThis.fetch = previous;
});
