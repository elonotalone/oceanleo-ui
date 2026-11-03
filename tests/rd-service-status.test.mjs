import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { RD_SERVICE_STATUS_MESSAGES, RD_SERVICE_STATUS_SOURCE as COPY } from "../src/i18n/ui/messages/rd-service-status-copy.ts";

const { rdServiceView, rdServicePort, RdServiceStatus } = await import(await compileModule("src/shell/RdServiceStatus.tsx", {
  "next-intl": dataModule('export function useLocale() { if(globalThis.__RD_TEST_NO_LOCALE) throw new Error("no provider"); return "en"; }'),
}));

test("pending approval is distinct from registration and responding supervisor", () => {
  const view = rdServiceView({ running: true, registration: {
    mechanism: "SMAppService.agent", installed: false, state: "requiresApproval", approvalRequired: true,
  } });
  assert.equal(view.registration, COPY.approval);
  assert.equal(view.responding, COPY.responding);
  assert.equal(view.permission, COPY.permissionsUnknown);
  assert.equal(rdServiceView(null).registration, COPY.registrationUnknown);
  assert.equal(rdServiceView({ registration: { installed: false, state: "notFound" } }).registration, COPY.registrationUnknown);
});

test("only fresh background grants are accepted and missing grants retain their separate actions", () => {
  const state = (permissions) => ({ registration: { mechanism: "SMAppService.agent", installed: true, permissions } });
  const missing = rdServiceView(state({ state: "required", missing: ["screenRecording", "accessibility", "untrusted-pane"], checkedAt: 100 }), 101);
  assert.deepEqual(missing.missing, ["screenRecording", "accessibility"]);
  assert.equal(missing.checkedAt, 100);
  assert.equal(rdServiceView(state({ state: "granted", checkedAt: 100 }), 101).permission, COPY.permissionsGranted);
  for (const now of [116, 99]) {
    const view = rdServiceView(state({ state: "granted", checkedAt: 100 }), now);
    assert.equal(view.permission, COPY.permissionsUnknown);
    assert.equal(view.checkedAt, undefined);
  }
  assert.deepEqual(rdServiceView(state({ state: "required", checkedAt: 100, missing: ["screenRecording"] }), 116).missing, []);
});

test("Windows boot fallback is visible without claiming logged-out support", () => {
  const view = rdServiceView({ running: false, registration: { installed: true, mechanism: "task-scheduler", bootTrigger: false } });
  assert.equal(view.registration, COPY.registered);
  assert.equal(view.bootFallback, true);
  assert.equal(view.mac, false);
  assert.equal(view.responding, COPY.notResponding);
});

test("native status/settings adapter sends fixed commands with bounded panes", async () => {
  assert.equal(rdServicePort({}), null);
  const calls = [];
  const core = { invoke(command, args) { assert.equal(this, core); calls.push([command, args]); return Promise.resolve({ running: true }); } };
  const port = rdServicePort({ __TAURI__: { core } });
  await port.status();
  await port.settings("background");
  await port.settings("screen");
  await port.settings("accessibility");
  assert.deepEqual(calls, [["background_service_status", undefined],
    ["background_service_open_settings", { pane: "background" }],
    ["background_service_open_settings", { pane: "screen" }],
    ["background_service_open_settings", { pane: "accessibility" }]]);
});

test("every service string is translated; non-Chinese locales use complete English fallback", () => {
  for (const source of Object.values(COPY)) {
    for (const locale of LOCALES) {
      const text = RD_SERVICE_STATUS_MESSAGES[locale][source];
      assert.ok(text, `${locale}: ${source}`);
      if (locale !== "zh" && locale !== "zh-TW") {
        assert.equal(text, RD_SERVICE_STATUS_MESSAGES.en[source]);
        assert.doesNotMatch(text, /\p{Script=Han}/u);
      }
    }
  }
});

test("settings initial rendering explains unlocked, locked and signed-out capability honestly", () => {
  const html = renderToStaticMarkup(React.createElement(RdServiceStatus));
  assert.match(html, /Checking background service/);
  assert.match(html, /Signed in and unlocked/);
  assert.match(html, /data-rd-state="locked"/);
  assert.match(html, /Signed out or before login/);
  assert.match(html, /Before the operating system starts/);
  assert.match(html, /Unverified/);
  assert.match(html, /does not confirm a remote screen connection/);
  assert.doesNotMatch(html, /\p{Script=Han}/u);
});

test("standalone native settings remain usable before locale context is mounted", () => {
  globalThis.__RD_TEST_NO_LOCALE = true;
  try {
    const html = renderToStaticMarkup(React.createElement(RdServiceStatus));
    assert.match(html, /Background remote access/);
    assert.doesNotMatch(html, /\p{Script=Han}/u);
  } finally { delete globalThis.__RD_TEST_NO_LOCALE; }
});
