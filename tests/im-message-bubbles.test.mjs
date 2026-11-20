import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = JSON.stringify(pathToFileURL(require.resolve("react")).href);

// Session / sites wave 2026-11-21: a LeoChat / session message looks like the task page's (F2 §3, book UC item 2/4).
const nil = (names) => dataModule(names.map((name) => `export function ${name}(){return null}`).join(";"));
const { MessageItem } = await import(await compileModule("src/shell/messages/conversation/MessageItem.tsx", {
  "next-intl": dataModule('export function useLocale(){return "en"}'),
  "../../../i18n/ui/useUI": dataModule('export function useUI(){return (s)=>s}'),
  "../../i18n/ui/useUI": dataModule('export function useUI(){return (s)=>s}'),
  "../../../ui": nil(["ConfirmDialog", "Modal"]),
  "../../../ui/Toast": dataModule('export function useToast(){return {}}'),
  "../leo/LeoMessageBody": nil(["LeoMessageBody", "LeoNoticeLine"]),
  "./ArtifactCardView": nil(["ArtifactCardView"]),
  "./AttachmentView": dataModule('export function AttachmentView(){return null}; export function safeMediaUrl(url){return url}'),
  "./MessageActions": dataModule('export function MessageContextMenu(){return null}; export function actionPermissions(){return {}}'),
  "./MessageBody": dataModule(`import {createElement as h} from ${reactUrl}; export function MessageBody(p){return h("div",{"data-message-body":""},p.message.body)}`),
  "../../bay/orders/BayOrderCard": nil(["BayOrderCard"]),
  "./ReplayCardView": nil(["ReplayCardView"]),
  "./SystemLine": nil(["SystemLine"]),
  "../../task-room/TaskCardView": dataModule(`import {createElement as h} from ${reactUrl}; export function TaskCardView(p){return h("div",{"data-task-card":p.message.card.title})}`),
  "../../task-room/QuoteCardView": dataModule(`import {createElement as h} from ${reactUrl}; export function QuoteCardView(p){return h("div",{"data-quote-card":p.message.card.source_title})}`),
  "../../../lib/im/people-api": dataModule('export function visiblePersonName(p, o){return (o.showNickname && p.nickname) || p.display_name}'),
}));

function render(sender, options = {}) {
  return renderToStaticMarkup(React.createElement(MessageItem, {
    message: { id: "m1", seq: 1, sender_id: sender, sender_kind: "user", kind: "text", created_at: "2026-10-01T00:00:00Z", body: "hello", attachments: [], reactions: [], card: null, ...options.message },
    pending: options.pending ?? null,
    viewerId: "me", grouped: Boolean(options.grouped), isAdmin: false,
    profiles: { me: { display_name: "Me" }, peer: { display_name: "Peer", nickname: "Group nickname" } },
    conversation: { kind: options.kind ?? "dm", members: [] },
    dmRead: sender === "me" ? "read" : null,
    handlers: { onOpenProfile() {} },
    selectionMode: Boolean(options.selectionMode),
    selected: Boolean(options.selected),
  }));
}

test("own messages: stone-100 bubble on the right with the task page's shape, no avatar, no inline layout style", () => {
  const html = render("me");
  assert.match(html, /data-message-row="own"[^>]*class="[^"]*\bw-full\b[^"]*\bmin-w-0\b/);
  assert.match(html, /items-end/);
  assert.match(html, /data-message-bubble="own" class="[^"]*\bmax-w-\[85%\][^"]*\brounded-2xl\b[^"]*\brounded-br-md\b[^"]*\bbg-stone-100\b[^"]*\bpx-4\b[^"]*\bpy-2\.5\b[^"]*\btext-\[15px\]/);
  assert.match(html, /data-read-receipt="read"/);
  assert.doesNotMatch(html, /aria-label="Me"/);
  assert.doesNotMatch(html, /data-sender-name/);
  assert.doesNotMatch(html, /style="/);
  assert.doesNotMatch(html, /\d\.5px\]/);
});

test("others in a group: grey initials avatar + name line, white bordered bubble on the left", () => {
  const html = render("peer", { kind: "group" });
  assert.match(html, /data-message-row="incoming"/);
  assert.match(html, /items-start/);
  assert.match(html, /data-message-author=""/);
  assert.match(html, /<button[^>]*aria-label="Peer"/);
  assert.match(html, /bg-stone-200[^"]*font-medium text-stone-600/);
  assert.match(html, /<span data-sender-name=""[^>]*>Group nickname<\/span>/);
  assert.match(html, /data-message-bubble="incoming" class="[^"]*\brounded-2xl\b[^"]*\brounded-bl-md\b[^"]*\bborder-stone-200\b[^"]*\bbg-white\b/);
  assert.doesNotMatch(html, /row-reverse|data-read-receipt|style="/);
});

test("a grouped message drops the author line; a DM never shows one", () => {
  assert.doesNotMatch(render("peer", { kind: "group", grouped: true }), /data-message-author/);
  assert.doesNotMatch(render("peer", { kind: "dm" }), /data-message-author/);
});

test("no hover toolbar and no '…' button: the message menu is right-click only", () => {
  const html = render("peer", { kind: "group" });
  assert.doesNotMatch(html, /更多操作|data-message-actions|group-hover:block/);
});

test("select mode: a 20 px filled check circle left of every row (own and others), row tint when selected, whole row clickable", () => {
  for (const sender of ["me", "peer"]) {
    const off = render(sender, { kind: "group", selectionMode: true });
    assert.match(off, /role="checkbox"[^>]*aria-checked="false"/);
    assert.match(off, /data-message-select-row=""/);
    assert.match(off, /cursor-pointer/);
    assert.match(off, /\bh-5 w-5\b[^"]*rounded-full/);
    assert.ok(off.indexOf('role="checkbox"') < off.indexOf("data-message-bubble"), "the circle comes first in the row (left side)");
    assert.doesNotMatch(off, /bg-stone-100\/70/);
    const on = render(sender, { kind: "group", selectionMode: true, selected: true });
    assert.match(on, /role="checkbox"[^>]*aria-checked="true"/);
    assert.match(on, /bg-stone-900/);
    assert.match(on, /data-selected="true"[^>]*class="[^"]*bg-stone-100\/70/);
    assert.match(on, /pointer-events-none/);
  }
  assert.doesNotMatch(render("me"), /role="checkbox"/);
});

test("task and quote cards render without a bubble and without the server's fallback text", () => {
  const task = render("me", { message: { kind: "task", body: "[子任务] Report", card: { type: "task", child_kind: "agent_task", child_id: "t1", id: "t1", title: "Report" } } });
  assert.match(task, /data-task-card="Report"/);
  assert.doesNotMatch(task, /data-message-bubble|\[子任务\]/);
  const quote = render("peer", { kind: "group", message: { kind: "text", body: "", card: { type: "quote", id: "q1", title: "", source_title: "Design chat", count: 3, items: [] } } });
  assert.match(quote, /data-quote-card="Design chat"/);
  assert.doesNotMatch(quote, /data-message-bubble/);
});
