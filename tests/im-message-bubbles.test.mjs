import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const nil = (names) => dataModule(names.map((name) => `export function ${name}(){return null}`).join(";"));
const { MessageItem } = await import(await compileModule("src/shell/messages/conversation/MessageItem.tsx", {
  "next-intl": dataModule('export function useLocale(){return "en"}'),
  "../../../i18n/ui/useUI": dataModule('export function useUI(){return (s)=>s}'),
  "../../../ui": nil(["ConfirmDialog"]),
  "../../../ui/Toast": dataModule('export function useToast(){return {}}'),
  "../leo/LeoMessageBody": nil(["LeoMessageBody", "LeoNoticeLine"]),
  "./ArtifactCardView": nil(["ArtifactCardView"]),
  "./AttachmentView": dataModule('export function AttachmentView(){return null}; export function safeMediaUrl(url){return url}'),
  "./MessageActions": dataModule('export function MessageActions(){return null}; export function actionPermissions(){return {}}'),
  "./MessageBody": nil(["MessageBody"]),
  "../../bay/orders/BayOrderCard": nil(["BayOrderCard"]),
  "./ReplayCardView": nil(["ReplayCardView"]),
  "./SystemLine": nil(["SystemLine"]),
  "../../../lib/im/people-api": dataModule('export function visiblePersonName(p, o){return (o.showNickname && p.nickname) || p.display_name}'),
}));

function render(sender, options = {}) {
  return renderToStaticMarkup(React.createElement(MessageItem, {
    message: { id: "m1", seq: 1, sender_id: sender, sender_kind: "user", kind: "text", created_at: "2026-10-01T00:00:00Z", body: "hello", attachments: [], reactions: [], ...options.message },
    pending: options.pending ?? null,
    viewerId: "me", grouped: Boolean(options.grouped), isAdmin: false,
    inThread: Boolean(options.inThread),
    profiles: { me: { display_name: "Me" }, peer: { display_name: "Peer", nickname: "Group nickname" } },
    conversation: { kind: options.kind ?? "dm", members: [] },
    dmRead: sender === "me" ? "read" : null,
    handlers: { onOpenProfile() {} },
  }));
}

test("own DM messages mirror bubble, avatar and read receipt to the right", () => {
  const html = render("me");
  assert.match(html, /data-message-row="own"[^>]*class="[^"]*\bw-full\b[^\"]*\bmin-w-0\b/);
  assert.match(html, /style="flex-direction:row-reverse"/);
  assert.match(html, /items-end/);
  assert.match(html, /data-message-bubble="own"/);
  assert.ok(html.indexOf('aria-label="Me"') < html.indexOf('data-message-bubble="own"'), "row order puts the avatar at the right-hand end under row-reverse");
  assert.match(html, /data-read-receipt="read"/);
  assert.match(html, /<button[^>]*aria-label="Me"/);
  assert.doesNotMatch(html, /data-sender-name/);
});

test("incoming group sender name is plain text; avatar remains an accessible button", () => {
  const html = render("peer", { kind: "group" });
  assert.match(html, /data-message-row="incoming"[^>]*class="[^"]*\bw-full\b[^\"]*\bmin-w-0\b/);
  assert.match(html, /data-message-bubble="incoming"/);
  assert.match(html, /<span data-sender-name=""[^>]*>Group nickname<\/span>/);
  assert.match(html, /<button[^>]*aria-label="Peer"/);
  assert.match(html, /style="flex-direction:row"/);
  assert.doesNotMatch(html, /row-reverse|data-read-receipt/);
});

test("optimistic and thread messages use the same full-width own-row geometry", () => {
  const html = render("me", {
    pending: { clientId: "c1", status: "sending" },
    inThread: true,
  });
  assert.match(html, /data-message-row="own"[^>]*class="[^"]*\bw-full\b/);
  assert.match(html, /data-message-bubble="own"/);
  assert.match(html, /data-sending=""/);
});

test("consecutive messages keep the sender avatar on both sides", () => {
  for (const sender of ["me", "peer"]) {
    assert.match(render(sender, { grouped: true }), /<button[^>]*aria-label="(?:Me|Peer)"/);
  }
});
