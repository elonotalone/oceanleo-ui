// UC-1/UC-5: owner hosting, private credentials and isolated domains.
// Reference: oceandino/docs/architecture/oceanleo-untrusted-content-isolation.md.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { CN_HOST_MESSAGES } from "../src/i18n/ui/messages/cn-host-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

const panel = readFileSync(new URL("../src/shell/website-platform/CnHostingPanel.tsx", import.meta.url), "utf8");
const workbench = readFileSync(new URL("../src/shell/website-platform/WebsiteWorkbenchPanels.tsx", import.meta.url), "utf8");
const { cnHostingApi } = await import(await compileModule("src/lib/cn-hosting-api.ts", {
  "./auth/client": dataModule('export async function accessToken(){return "test-owner-token";}'),
  "./auth/config": dataModule('export function gatewayBase(){return "https://cn.test.invalid";}'),
}));

test("CN hosting copy covers every panel string for all locales", () => {
  const source = ts.createSourceFile("panel.tsx", panel, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const keys = new Set();
  function walk(node) {
    if (ts.isStringLiteral(node) && /[\u3400-\u9fff]/.test(node.text)) keys.add(node.text);
    ts.forEachChild(node, walk);
  }
  walk(source);
  assert.equal(keys.size, 31);
  for (const locale of LOCALES) for (const key of keys) {
    assert.ok(CN_HOST_MESSAGES[locale][key], `${locale}: missing ${key}`);
    if (!["zh", "zh-TW"].includes(locale)) assert.doesNotMatch(CN_HOST_MESSAGES[locale][key], /[\u3400-\u9fff]/);
  }
});

// UC-1: same hosting panel routes CN through the owner account; preview stays unchanged.
test("existing publish panel chooses the owner-account CN panel", () => {
  assert.match(workbench, /currentDomainFamily\(\) === "cn" \? <CnHostingPanel/);
  assert.match(workbench, /<PlatformPublishPanel/);
  assert.doesNotMatch(panel, /iframe|dangerouslySetInnerHTML|localStorage|sessionStorage/);
});

// UC-5: credentials are write-only password inputs, cleared after every connection attempt.
test("panel requires separate bucket and CDN consent and clears credential fields", () => {
  assert.match(panel, /type="password" autoComplete="off"/);
  assert.match(panel, /type="password" autoComplete="new-password"/);
  assert.match(panel, /finally \{ setKeyId\(""\); setKeySecret\(""\); \}/);
  assert.match(panel, /createBucket, setCreateBucket\] = useState\(false\)/);
  assert.match(panel, /consent, setConsent\] = useState\(false\)/);
  assert.match(panel, /crypto.randomUUID\(\)/);
  assert.match(panel, /cnHostingApi.refresh/);
  assert.match(panel, /cnHostingApi.rollback/);
  assert.match(panel, /cnHostingApi.delete/);
});

// UC-5: owner bearer token goes only to authenticated API, credentials only in POST body.
test("hosting client preserves idempotency, ownership and optimistic versions", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify({ connected: true, deployments: [], deployment: { id: "d1" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await cnHostingApi.connect("project/1", { account_id: "123", region: "cn-shanghai", bucket: "owner", domain: "cn-project.oceanleo.app", icp_number: "filing" }, "fixture-id", "fixture-secret", 4, true);
    await cnHostingApi.configure("project/1", 123, true);
    await cnHostingApi.publish("project/1", "r1", "stable-key-123");
    await cnHostingApi.publish("project/1", "r1", "stable-key-123");
    await cnHostingApi.rollback("project/1", { id: "d1", status: "ready", version: "v2" });
    await cnHostingApi.delete("project/1", { id: "d1", status: "ready", version: "v2" });
    assert.equal(calls.length, 6);
    for (const call of calls) {
      assert.match(call.url, /^https:\/\/cn\.test\.invalid\/v1\/website-projects\/project%2F1\/hosting\/aliyun\//);
      assert.equal(call.init.headers.Authorization, "Bearer test-owner-token");
      assert.equal(call.init.cache, "no-store");
      assert.doesNotMatch(call.url, /fixture-secret|test-owner-token/);
    }
    assert.equal(calls[0].body.expected_version, 4);
    assert.equal(calls[0].body.create_bucket, true);
    assert.equal(calls[1].body.certificate_id, 123);
    assert.equal(calls[1].body.consent, true);
    assert.deepEqual(calls[2].body, calls[3].body);
    assert.equal(calls[4].body.expected_version, "v2");
    assert.equal(calls[5].init.method, "DELETE");
    assert.equal(calls[5].body.expected_version, "v2");
  } finally { globalThis.fetch = original; }
});

// UC-5: backend validation objects can contain submitted secrets, so never render them.
test("hosting client never renders arbitrary validation payloads", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: [{ input: "fixture-secret" }] }), { status: 422 });
  try {
    await assert.rejects(() => cnHostingApi.account("p"), (error) => {
      assert.equal(error.message, "Hosting request failed (422)");
      return true;
    });
  } finally { globalThis.fetch = original; }
});
