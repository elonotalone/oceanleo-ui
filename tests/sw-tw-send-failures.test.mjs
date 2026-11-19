import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { sendFailureText } from "../src/shell/acp-task/send-failure.ts";
import { swTwCopy } from "../src/i18n/ui/messages/sw-tw-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";
const english = { ...swTwCopy("en"), "重发": "Resend" };
const tt = (key) => english[key] || key;
const useUI = dataModule(`export function useUI(){ return (key) => (${JSON.stringify(english)})[key] || key; }`);
const { StreamWaitingLine } = await import(await compileModule("src/shell/transcript/TranscriptStream.tsx", {
  "../../i18n/ui/useUI": useUI,
}));

test("working line reuses the animated My Tasks figure without a spinner or elapsed label", () => {
  const html = renderToStaticMarkup(React.createElement(StreamWaitingLine, { label: "Waiting for the model · 2:34" }));
  assert.match(html, /Agent is working/);
  assert.match(html, /data-oceanleo-acp-pixel-run/);
  assert.match(html, /oceanleo-pixel-bob/);
  assert.doesNotMatch(html, /v-spinner|Waiting for the model|2:34/);
  const retry = renderToStaticMarkup(React.createElement(StreamWaitingLine, { retrying: true, label: "Model connection interrupted, retrying" }));
  assert.match(retry, /Model connection interrupted, retrying/);
  assert.doesNotMatch(retry, /data-oceanleo-acp-pixel-run|Agent is working/);
  assert.doesNotMatch(readFileSync("src/acp/AcpTranscript.tsx", "utf8"), /等待模型回应|const elapsed =/);
});

test("each send refusal names the cause beside Resend; unknown errors retain their code", () => {
  const cases = {
    computer_offline: /offline/,
    computer_reconnecting: /reconnecting/,
    agent_not_running: /not running/,
    program_mismatch: /does not match/,
    computer_mismatch: /does not match/,
    message_too_long: /too long/,
    invalid_attachment: /cannot be used/,
    attachment_not_found: /cannot be used/,
    attachment_storage_unavailable: /cannot be read/,
    permission_denied: /permission/,
    task_grant_revoked: /permission/,
    unexpected_code: /^unexpected_code$/,
  };
  for (const [code, expected] of Object.entries(cases)) assert.match(sendFailureText({ code, status: 409 }, tt), expected, code);
  const validation = (loc, type) => ({ status: 422, payload: { detail: [{ loc: ["body", loc], type }] } });
  assert.match(sendFailureText(validation("text", "string_too_long"), tt), /too long/);
  assert.match(sendFailureText(validation("attachments", "list_type"), tt), /attachment cannot be used/);
  assert.match(sendFailureText(Object.assign(new Error("HTTP 422"), { status: 422 }), tt), /could not be sent/);
  assert.doesNotMatch(sendFailureText(new Error("HTTP 409"), tt), /HTTP|409/);
  assert.match(sendFailureText({ status: 403 }, tt), /permission/);
  assert.match(sendFailureText(Object.assign(new Error("task not found"), { status: 404 }), tt), /permission/);
  const chat = readFileSync("src/shell/AgentChat.tsx", "utf8");
  assert.match(chat, /sendFailureText\(pendingShown.error, tt\)/);
  assert.match(chat, /sendFailureText\(entry.error, tt\)/);
});

test("all 17 locales provide every working, failure and availability sentence", () => {
  for (const locale of LOCALES) {
    const copy = swTwCopy(locale);
    assert.deepEqual(Object.keys(copy), Object.keys(swTwCopy("en")));
    assert.ok(Object.values(copy).every((text) => typeof text === "string" && text.length > 0), locale);
  }
});


test("failure sentence appears under the unsent bubble beside Resend", async () => {
  const { PendingSendBubble } = await import(await compileModule("src/shell/acp-task/PendingSendBubble.tsx", {
    "../../i18n/ui/useUI": useUI,
  }));
  const html = renderToStaticMarkup(React.createElement(PendingSendBubble, {
    pending: { id: "unsent-1", status: "failed", text: "My message", attachments: [] },
    errorText: sendFailureText({ code: "computer_offline", status: 409 }, tt),
    onRetry() {},
  }));
  assert.match(html, /data-acp-pending-error=""[^>]*>The computer is offline/);
  assert.match(html, /data-acp-pending-retry="unsent-1"/);
  assert.match(html, /Resend/);
  assert.doesNotMatch(html, /HTTP 409/);
});
