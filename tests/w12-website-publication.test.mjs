import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const auth = dataModule('export async function accessToken(){return globalThis.__w12PubToken;}');
const config = dataModule('export const GATEWAY_BASE="https://unused.invalid"; export function gatewayBase(){return "https://gateway.invalid";}');
const runtime = await compileModule("src/api/website-runtime.ts", { "../lib/auth/client": auth, "../lib/auth/config": config });
const { websitePublicationApi, WebsitePublicationError } = await import(await compileModule("src/api/website-publication.ts", {
  "./website-runtime": runtime,
}));

function stubFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method || "GET", auth: init.headers.Authorization, body: init.body });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}

// UC-NONE: owner-only authenticated gateway calls; no preview origin, cookie or iframe is involved.
// Reason: stop/unpublish use fixed owner paths and a closed projection of the reply.
test("stop and unpublish call fixed owner paths with the bearer and project a closed result", async () => {
  globalThis.__w12PubToken = "pub-test-token";
  let calls = stubFetch(200, { state: "stopped", kind: "runtime", url: null, commit: "c".repeat(40),
    stopping_sessions: 0, stop_confirmed: true, operation: "stop", stopped_sessions: 1 });
  const stopped = await websitePublicationApi.stop("p/1");
  assert.deepEqual(calls, [{ url: "https://gateway.invalid/v1/website-projects/p%2F1/publication/stop", method: "POST",
    auth: "Bearer pub-test-token", body: undefined }]);
  assert.deepEqual(stopped, { state: "stopped", kind: "runtime", url: null, commit: "c".repeat(40), stoppingSessions: 0, stopConfirmed: true });
  calls = stubFetch(200, { state: "not_published", kind: null, url: null, commit: null, stopping_sessions: 2, stop_confirmed: false });
  const pending = await websitePublicationApi.unpublish("p1");
  assert.equal(calls[0].url, "https://gateway.invalid/v1/website-projects/p1/publication/unpublish");
  assert.equal(pending.stopConfirmed, false);
  assert.equal(pending.stoppingSessions, 2);
});

// UC-NONE: response validation only.
// Reason: a non-live or malformed URL never becomes a link, and unknown states fail closed.
test("status keeps a link only for a live https url and rejects unknown states", async () => {
  stubFetch(200, { state: "live", kind: "runtime", url: "https://law.oceanleo.app", commit: "abc1234", stopping_sessions: 0 });
  assert.equal((await websitePublicationApi.get("p1")).url, "https://law.oceanleo.app");
  stubFetch(200, { state: "stopped", kind: "runtime", url: "https://law.oceanleo.app", commit: "abc1234" });
  assert.equal((await websitePublicationApi.get("p1")).url, null);
  stubFetch(200, { state: "live", kind: "weird", url: "javascript:alert(1)", commit: "<b>" });
  const odd = await websitePublicationApi.get("p1");
  assert.deepEqual([odd.kind, odd.url, odd.commit], [null, null, null]);
  stubFetch(200, { state: "deleting" });
  await assert.rejects(websitePublicationApi.get("p1"), error => error instanceof WebsitePublicationError && error.code === "failed");
});

// UC-NONE: error mapping only.
// Reason: server refusals map to fixed codes; no server text reaches the UI.
test("HTTP refusals map to closed codes", async () => {
  for (const [status, code] of [[401, "unauthorized"], [403, "unauthorized"], [409, "changed"], [429, "busy"], [503, "unavailable"], [400, "failed"]]) {
    stubFetch(status, { detail: { code: "vault_runtime_fence_busy", message: "server text" } });
    await assert.rejects(websitePublicationApi.stop("p1"), error => error instanceof WebsitePublicationError && error.code === code
      && !String(error.message).includes("server text"));
  }
});
