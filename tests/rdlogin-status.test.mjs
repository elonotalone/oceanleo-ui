import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { RDLOGIN_MESSAGES, RDLOGIN_SOURCE as COPY } from "../src/i18n/ui/messages/rdlogin-copy.ts";
const { rdCapabilityView, rdServicePort } = await import(await compileModule("src/shell/RdServiceStatus.tsx", {
  "next-intl": dataModule('export function useLocale() { return "en"; }'),
}));
test("all four states remain distinct with missing, malformed or duplicate evidence", () => {
  for (const input of [null, {}, { capabilities: "bad" }, { capabilities: [null, 4, {}] },
    { helperVerified: true, capabilities: [{ state: "locked", verified: true, capture: "available" }, { state: "locked" }] }]) {
    const { rows } = rdCapabilityView(input);
    assert.deepEqual(rows.map((r) => r.state), ["loggedIn", "locked", "loggedOut", "preBoot"]);
    assert.equal(rows[1].capture, COPY.unverified);
    assert.equal(rows[3].presence, COPY.unavailable);
    assert.equal(rows[3].capture, COPY.unavailable);
    assert.equal(rows[3].input, COPY.unavailable);
  }
});
test("online, registration and unlocked state never imply verified control", () => {
  const row = { state: "locked", verified: false, presence: "available", capture: "available", input: "available" };
  const snapshot = { lockState: false, helperVerified: true, capabilities: [row], installPlan: { state: "installed" } };
  assert.equal(rdCapabilityView(snapshot).rows[1].input, COPY.unverified);
  snapshot.capabilities[0].verified = true;
  assert.equal(rdCapabilityView(snapshot).rows[1].input, COPY.available);
  snapshot.helperVerified = false;
  assert.equal(rdCapabilityView(snapshot).rows[1].input, COPY.unverified);
});
test("Mac login-window and pre-boot unsupported states survive all availability claims", () => {
  const snapshot = { helperVerified: true, installPlan: { state: "integrationRequired", message: "macosBrokerIntegrationRequired" },
    capabilities: [{ state: "loggedOut", capture: "unavailable", input: "unavailable", reason: "macosLoginWindowNotSupported" },
      { state: "preBoot", verified: true, presence: "available", capture: "available", input: "available" }] };
  const view = rdCapabilityView(snapshot);
  assert.equal(view.message, COPY.macosBrokerIntegrationRequired);
  assert.equal(view.rows[2].capture, COPY.unavailable);
  assert.equal(view.rows[2].reason, COPY.macosLoginWindowNotSupported);
  assert.equal(view.rows[3].capture, COPY.unavailable);
});
test("unknown native copy is not rendered and capability failures reset to unverified", () => {
  const view = rdCapabilityView({ installPlan: { state: "integrationRequired", message: "raw secret or untranslated text" }, capabilities: [] });
  assert.equal(view.message, COPY.deviceVerificationRequired);
  assert.equal(rdCapabilityView(null).rows[0].capture, COPY.unverified);
});
test("capabilities use the existing fixed native command", async () => {
  const calls = [];
  const port = rdServicePort({ __TAURI__: { core: { invoke(command) { calls.push(command); return Promise.resolve({}); } } } });
  await port.capabilities();
  assert.deepEqual(calls, ["remote_secure_desktop_status"]);
});
test("every new string has Chinese, Traditional Chinese and English fallback for all other locales", () => {
  for (const locale of LOCALES) for (const source of Object.values(COPY)) {
    const value = RDLOGIN_MESSAGES[locale][source];
    assert.ok(value);
    if (!["zh", "zh-TW"].includes(locale)) {
      assert.equal(value, RDLOGIN_MESSAGES.en[source]);
      assert.doesNotMatch(value, /\p{Script=Han}/u);
    }
  }
});
