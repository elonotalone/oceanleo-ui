import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { PW_U1_MESSAGES } from "../src/i18n/ui/messages/pw-u1-copy.ts";
import { rwFnCopy } from "../src/i18n/ui/messages/rw-fn-copy.ts";
await import("./agent-chat-conversations.test.mjs");
const { mount, settle, session, posts, type, submit } = globalThis.__agentChatHarness;
const task = () => ({ task: { id: "t1", status: "running", title: "Computer task", mode: "computer", plan: { computer_workspace: { version: 1 } } }, messages: [], artifacts: [] });
const open = () => mount({ taskId: "t1" }, { task: task(), sessions: [session("cts_failure", "acp", "claude")] });
const bubble = (view) => view.host.querySelector("[data-acp-pending-send]");
const failed = (view, reason) => {
  assert.equal(bubble(view)?.getAttribute("data-acp-pending-status"), "failed");
  assert.equal(bubble(view)?.querySelector("[data-acp-pending-state]")?.textContent, "未发出");
  assert.equal(bubble(view)?.querySelector("[data-acp-pending-error]")?.textContent, reason);
  assert.equal(bubble(view)?.querySelector("[data-acp-pending-retry]")?.textContent, "重新发送");
  assert.equal(view.composer("acp").__props.sendBlocked, false);
  assert.equal(view.composer("acp").__props.readOnly, false);
  assert.equal(view.host.querySelectorAll('[data-acp-pending-status="sending"], [data-acp-pending-status="retrying"], [data-oceanleo-acp-pixel-run]').length, 0);
};

for (const [status, code, message] of [
  [409, "node_busy", "计算机忙，正在排队，请稍后重试"],
  [503, "computer_home_unavailable", "暂时无法读取电脑的主目录，请重试"],
  [503, "agent_start_failed", "程序启动失败，请重试"],
]) test(`${status} ${code} keeps an unsent message with gateway reason and Resend`, async () => {
  const view = await open();
  try {
    globalThis.__acpRoute = (path) => path.endsWith("/send") ? { status, body: { detail: { code, message } } } : null;
    await type(view, "acp", "Please fix the build");
    await submit(view, "acp");
    failed(view, message);
    assert.match(bubble(view).textContent, /Please fix the build/);
    assert.equal(posts("/send").length, 1, "no HTTP error is automatically retried");
  } finally { await view.unmount(); }
});

const attachment = { url: "", artifact_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", name: "spec.pdf", mime: "application/pdf", media_type: "doc" };
test("network failure retries only once, then Resend preserves text, files and identity", async () => {
  const view = await open();
  try {
    globalThis.__acpRoute = (path) => { if (path.endsWith("/send")) throw new TypeError("Failed to fetch"); return null; };
    await type(view, "acp", "Use the attached specification");
    await act(async () => view.composer("acp").__props.onAddAttachments([{ id: "spec-file", artifactId: attachment.artifact_id, revisionId: attachment.revision_id, name: attachment.name, mime: attachment.mime, mediaType: "doc" }]));
    await submit(view, "acp");
    failed(view, "发送失败，请重试");
    const attempts = posts("/send");
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1].body, attempts[0].body);
    assert.deepEqual(attempts[0].body.attachments, [attachment]);
    globalThis.__acpRoute = (path) => path.endsWith("/send") ? { body: { row_id: 93001 } } : null;
    await act(async () => bubble(view).querySelector("[data-acp-pending-retry]").click());
    await settle();
    const resent = posts("/send");
    assert.equal(resent.length, 3);
    assert.equal(resent[2].body.text, "Use the attached specification");
    assert.deepEqual(resent[2].body.attachments, [attachment]);
    assert.equal(resent[2].body.client_message_id, resent[0].body.client_message_id);
    assert.equal(bubble(view).getAttribute("data-acp-pending-status"), "accepted");
    assert.equal(view.host.querySelector("[data-acp-pending-error]"), null);
  } finally { await view.unmount(); }
});

test("200 with row_id accepts the message normally", async () => {
  const view = await open();
  try {
    globalThis.__acpRoute = (path) => path.endsWith("/send") ? { body: { row_id: 93002 } } : null;
    await type(view, "acp", "Hello agent");
    await submit(view, "acp");
    assert.equal(posts("/send").length, 1);
    assert.equal(bubble(view).getAttribute("data-acp-pending-status"), "accepted");
    assert.equal(bubble(view).querySelector("[data-acp-pending-error]"), null);
    assert.equal(bubble(view).querySelector("[data-acp-pending-retry]"), null);
    assert.equal(view.composer("acp").__props.sendBlocked, false);
  } finally { await view.unmount(); }
});


test("English UI uses Not sent, the fallback reason and Resend", async () => {
  const english = { ...PW_U1_MESSAGES.en, ...rwFnCopy("en") };
  const { PendingSendBubble } = await import(await compileModule("src/shell/acp-task/PendingSendBubble.tsx", {
    "../../i18n/ui/useUI": dataModule(`export function useUI(){ return key => (${JSON.stringify(english)})[key] || key; }`),
  }));
  const html = renderToStaticMarkup(React.createElement(PendingSendBubble, {
    pending: { id: "english-failure", status: "failed", text: "Keep me", attachments: [], error: null },
    errorText: "", onRetry() {},
  }));
  assert.match(html, /Not sent/);
  assert.match(html, /Couldn(?:&#x27;|&#39;|')t send\. Try again\./);
  assert.match(html, /Resend/);
  assert.doesNotMatch(html, /未发出|重新发送|发送失败/);
});


test("500 without a gateway explanation uses the fallback and never retries", async () => {
  const view = await open();
  try {
    globalThis.__acpRoute = (path) => path.endsWith("/send") ? { status: 500, body: "Internal Server Error" } : null;
    await type(view, "acp", "Keep this after a server failure");
    await submit(view, "acp");
    failed(view, "发送失败，请重试");
    assert.equal(posts("/send").length, 1);
  } finally { await view.unmount(); }
});
