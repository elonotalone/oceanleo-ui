// LeoBay 第二波 W3：客户端函数请求了哪个地址、什么方法、什么请求体。
import test from "node:test";
import assert from "node:assert/strict";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const HTTP_STUB = dataModule(`
export class BayApiError extends Error {
  constructor(message, status, code = null) { super(message); this.name = "BayApiError"; this.status = status; this.code = code; }
}
function record(method, path, body, opts) {
  (globalThis.__bay2LibCalls ||= []).push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
  const handler = globalThis.__bay2LibReply;
  if (typeof handler === "function") return handler(method, path, body, opts);
  if (handler instanceof Error) throw handler;
  return handler || {};
}
export async function bayGet(path, opts) { return record("GET", path, undefined, opts); }
export async function bayPost(path, body) { return record("POST", path, body); }
export async function bayPatch(path, body) { return record("PATCH", path, body); }
export async function bayDelete(path) { return record("DELETE", path); }
`);

const AGENT_STUB = dataModule(`
export async function authed(path, init) {
  (globalThis.__bay2LibCalls ||= []).push({ method: init && init.method, path, body: init && init.body ? JSON.parse(init.body) : undefined });
  const handler = globalThis.__bay2LibAuthed;
  if (typeof handler === "function") return handler(path, init);
  if (handler && handler.ok === false) return handler;
  return { ok: true, data: handler || {} };
}
`);

const seller = await import(
  await compileModule("src/lib/bay/seller.ts", { "./http": HTTP_STUB, "../agent": AGENT_STUB })
);
const services = await import(
  await compileModule("src/lib/bay/services.ts", { "./http": HTTP_STUB, "./seller": await compileModule("src/lib/bay/seller.ts", { "./http": HTTP_STUB, "../agent": AGENT_STUB }) })
);

function reset(reply, authedReply) {
  globalThis.__bay2LibCalls = [];
  globalThis.__bay2LibReply = reply || null;
  globalThis.__bay2LibAuthed = authedReply || null;
}

async function loadOfficial() {
  return import(await compileModule("src/lib/bay/official.ts", { "./http": HTTP_STUB }));
}

test("saveSellerPage：PUT /v1/talent/me/profile/page，请求体是 page_doc", async () => {
  reset(null, () => ({ ok: true, data: { profile: { handle: "leo", page_doc: { version: 1, theme: {}, blocks: [] } } } }));
  const doc = { version: 1, theme: { tone: "light" }, blocks: [] };
  const out = await seller.saveSellerPage(doc);
  assert.equal(out.profile.handle, "leo");
  const call = globalThis.__bay2LibCalls[0];
  assert.equal(call.method, "PUT");
  assert.equal(call.path, "/v1/talent/me/profile/page");
  assert.deepEqual(call.body, { page_doc: doc });

  reset(null, () => ({ ok: true, data: { profile: { handle: "leo", page_doc: null } } }));
  await seller.saveSellerPage(null);
  assert.deepEqual(globalThis.__bay2LibCalls[0].body, { page_doc: null });
});

test("saveServiceQuickPrice：PUT /me/services/{id}/tiers 简写价与交期", async () => {
  reset(null, () => ({ ok: true, data: { items: [{ tier: "basic", price_fen: 1200, delivery_days: 3, enabled: true }] } }));
  const out = await seller.saveServiceQuickPrice("s/1", { price_fen: 1200, delivery_days: 3 });
  assert.equal(out.items[0].price_fen, 1200);
  const call = globalThis.__bay2LibCalls[0];
  assert.equal(call.method, "PUT");
  assert.equal(call.path, "/v1/talent/me/services/s%2F1/tiers");
  assert.deepEqual(call.body, { price_fen: 1200, delivery_days: 3 });

  reset(null, () => ({ ok: true, data: { items: [] } }));
  await seller.saveServiceQuickPrice("s1", { price_fen: 0, delivery_days: null });
  assert.deepEqual(globalThis.__bay2LibCalls[0].body, { price_fen: 0, delivery_days: null });
});

test("claimBayService：POST /v1/talent/services/{id}/claim", async () => {
  reset(() => ({ work: { kind: "task", id: "t1" }, media: [{ id: "m1", kind: "file", url: "https://cdn.example/a.zip" }] }));
  const out = await services.claimBayService("svc/1");
  assert.equal(out.work.id, "t1");
  const call = globalThis.__bay2LibCalls[0];
  assert.equal(call.method, "POST");
  assert.equal(call.path, "/v1/talent/services/svc%2F1/claim");
  assert.equal(call.body, undefined);
});

test("getBayOfficialPublisher：失败回退、成功后缓存，请求 GET /v1/talent/bay/official", async () => {
  const official = await loadOfficial();
  reset(() => {
    throw new Error("network down");
  });
  const fallback = await official.getBayOfficialPublisher();
  assert.equal(fallback.user_id, null);
  assert.equal(fallback.handle, "oceanleo");
  assert.equal(fallback.display_name, "OceanLeo");
  assert.equal(fallback.avatar_url, null);
  assert.equal(fallback.headline, "OceanLeo 官方素材");
  assert.equal(fallback.official, true);
  assert.equal(globalThis.__bay2LibCalls[0].method, "GET");
  assert.equal(globalThis.__bay2LibCalls[0].path, "/v1/talent/bay/official");
  assert.equal(globalThis.__bay2LibCalls[0].anonymous, true);

  reset(() => ({ publisher: { user_id: "u1", handle: "oceanleo", display_name: "OceanLeo", avatar_url: null, official: true } }));
  const first = await official.getBayOfficialPublisher();
  assert.equal(first.user_id, "u1");
  assert.equal(first.official, true);
  assert.equal(globalThis.__bay2LibCalls.length, 1);
  const second = await official.getBayOfficialPublisher();
  assert.equal(second.user_id, "u1");
  assert.equal(globalThis.__bay2LibCalls.length, 1, "成功后不再请求");
});
