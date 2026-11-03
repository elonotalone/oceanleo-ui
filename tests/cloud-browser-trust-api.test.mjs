import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { createCloudBrowserTrustClient, browserTrustOrigin, projectBrowserSessionTrust } = await import(
  await compileModule("src/lib/browser-trust.ts", {
    "./agent": dataModule("export async function authed() { throw new Error('real auth must not run in this test'); }"),
  })
);
const timestamp = "2026-11-04T00:00:00.000Z";
const pending = {
  pending_approvals: [{ request_id: "request/1", origin: "https://shop.example/checkout?token=secret", action_kind: "payment", summary: "支付订单 123", reason: "付款后无法撤回", password: "never-in-state" }],
  login_candidates: [{ id: "candidate/1", origin: "https://mail.example/login", cookies: "never-in-state" }],
  privacy_active: true,
  profile: { password: "never-in-state" },
};

function harness(response = {}) {
  const calls = [];
  return { calls, client: createCloudBrowserTrustClient(async (path, init) => {
    calls.push({ path, init });
    return { ok: true, data: init?.method === "DELETE" ? { ok: true } : response };
  }) };
}

test("trust metadata projects safe origins and excludes profile/action secrets", async () => {
  assert.equal(browserTrustOrigin("https://user:password@shop.example/path?token=secret#card"), "https://shop.example");
  assert.equal(browserTrustOrigin("javascript:alert(1)"), "");
  const { client } = harness(pending);
  const result = await client.session("session-1");
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    pending_approvals: [{ request_id: "request/1", origin: "https://shop.example", action_kind: "payment", summary: "支付订单 123", reason: "付款后无法撤回" }],
    login_candidates: [{ id: "candidate/1", origin: "https://mail.example" }],
    privacy_active: true,
  });
  assert.equal(JSON.stringify(result).includes("never-in-state"), false);
});

test("trust settings/logins/grants use only the owner-scoped collection endpoints", async () => {
  const settings = harness({ save_logins: true, token: "secret" });
  assert.deepEqual((await settings.client.settings()).data, { save_logins: true });
  await settings.client.updateSettings(false);
  assert.deepEqual(settings.calls.map(call => [call.path, call.init.method, call.init.body]), [
    ["/v1/browser/trust/settings", "GET", undefined],
    ["/v1/browser/trust/settings", "PATCH", '{"save_logins":false}'],
  ]);
  const logins = harness({ logins: [{ id: "login/1", origin: "https://shop.example", saved_at: timestamp, last_used_at: null, cookie: "secret" }] });
  assert.deepEqual((await logins.client.logins()).data, { logins: [{ id: "login/1", origin: "https://shop.example", saved_at: timestamp, last_used_at: null }] });
  await logins.client.deleteLogin("login/1");
  await logins.client.deleteAllLogins();
  assert.deepEqual(logins.calls.map(call => [call.path, call.init.method]), [
    ["/v1/browser/trust/logins", "GET"], ["/v1/browser/trust/logins/login%2F1", "DELETE"], ["/v1/browser/trust/logins", "DELETE"],
  ]);
  const grants = harness({ approvals: [{ id: "grant/1", origin: "https://shop.example", action_kind: "payment", scope: "site_action", task_id: null, created_at: timestamp, credential: "secret" }] });
  const result = await grants.client.approvals();
  assert.deepEqual(Object.keys(result.data.approvals[0]), ["id", "origin", "action_kind", "scope", "task_id", "created_at"]);
  await grants.client.revokeApproval("grant/1");
  await grants.client.revokeAllApprovals();
  assert.deepEqual(grants.calls.map(call => [call.path, call.init.method]), [
    ["/v1/browser/trust/approvals", "GET"], ["/v1/browser/trust/approvals/grant%2F1", "DELETE"], ["/v1/browser/trust/approvals", "DELETE"],
  ]);
});

test("approval choices send the exact selected-session scope without durations or action replay", async () => {
  const { client, calls } = harness({ ok: true, result: { plaintext: "never-in-state" } });
  for (const scope of ["once", "task", "site_action"]) {
    const result = await client.decideApproval("session/1", "request/1", "approve", scope);
    assert.deepEqual(result.data, { ok: true });
    assert.equal(JSON.stringify(result).includes("never-in-state"), false);
  }
  await client.decideApproval("session/1", "request/1", "deny", "once");
  assert.equal(calls.length, 4);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.path, "/v1/browser/sessions/session%2F1/trust/approvals/request%2F1");
    assert.equal(call.init.method, "POST");
    assert.deepEqual(JSON.parse(call.init.body), { decision: index === 3 ? "deny" : "approve", scope: ["once", "task", "site_action", "once"][index] });
    assert.ok(call.init.signal instanceof AbortSignal);
  }
});

test("save and dismiss address an opaque candidate without reading credentials", async () => {
  const { client, calls } = harness({ ok: true, saved: true });
  await client.decideLogin("session/1", "candidate/1", true);
  await client.decideLogin("session/1", "candidate/1", false);
  assert.deepEqual(calls.map(call => [call.path, JSON.parse(call.init.body)]), [
    ["/v1/browser/sessions/session%2F1/trust/logins", { candidate_id: "candidate/1", save: true }],
    ["/v1/browser/sessions/session%2F1/trust/logins", { candidate_id: "candidate/1", save: false }],
  ]);
});

test("malformed trust status and duration-based grants fail closed", async () => {
  assert.equal(projectBrowserSessionTrust({ ...pending, privacy_active: "true" }), null);
  assert.equal(projectBrowserSessionTrust({ ...pending, pending_approvals: [{ id: "missing-request-id", origin: "https://shop.example", action_kind: "payment" }] }), null);
  const { client } = harness({ approvals: [{ id: "grant-1", origin: "https://shop.example", action_kind: "payment", scope: "24h", created_at: timestamp }] });
  assert.deepEqual(await client.approvals(), { ok: false, status: 502, error: "BROWSER_TRUST_INVALID_RESPONSE" });
  const failure = createCloudBrowserTrustClient(async () => ({ ok: false, status: 403, error: "secret server diagnostic" }));
  assert.deepEqual(await failure.session("session-1"), { ok: false, status: 403, error: "BROWSER_TRUST_UNAVAILABLE" });
  const unacknowledged = harness({ ok: false });
  assert.deepEqual(await unacknowledged.client.decideApproval("session-1", "request-1", "approve", "once"), { ok: false, status: 502, error: "BROWSER_TRUST_INVALID_RESPONSE" });
});

test("caller cancellation reaches the authenticated request", async () => {
  const controller = new AbortController();
  const { client, calls } = harness(pending);
  await client.session("session-1", controller.signal);
  assert.equal(calls[0].init.signal.aborted, false);
  controller.abort();
  assert.equal(calls[0].init.signal.aborted, true);
});
