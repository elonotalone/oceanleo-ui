// Session / sites wave, unit UL (2026-11-21): LeoChat list in the task-page look.
// Selected inbox row = the sidebar's selected row (no left bar); no task rows / Tasks filter; sessions never listed;
// previews render the server's label key through i18n (no "[任务]" outside zh); one grey avatar look.
//
// node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//      --experimental-loader ./tests/ts-extension-loader.mjs --test tests/ss-ul-leochat.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LOCALES } from "../src/i18n/config.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const uiStub = dataModule(`
  const tt = (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  export function useUI() { return tt; }
`);
const storeStub = dataModule(`export function formatBadge(n) { return n > 0 ? (n > 99 ? "99+" : String(n)) : ""; }`);

const { InboxRow, INBOX_ROW_SELECTED } = await import(
  await compileModule("src/shell/messages/InboxRow.tsx", { "../../i18n/ui/useUI": uiStub, "./realtime/store": storeStub })
);
const preview = await import(await compileModule("src/shell/messages/preview-label.ts"));
const { isInboxConversation } = await import(await compileModule("src/shell/messages/inbox-view.ts"));
const { ssUlCopy, SS_UL_COPY } = await import(await compileModule("src/i18n/ui/messages/ss-ul-copy.ts"));

const conv = (over = {}) => ({
  id: "c1", kind: "group", title: "Design", avatar_url: null, peer: null, member_count: 3,
  last_message: null, last_activity_at: "2026-11-20T08:00:00Z", unread_count: 0, mention_count: 0, muted: false,
  notify_level: "all", org_id: null, project_id: null, has_external: false, my_role: "member", dissolved: false, ...over,
});
const row = (item, active) => renderToStaticMarkup(React.createElement(InboxRow, { item, active, hasDraft: false, onOpen() {} }));
const classOf = (html) => /data-testid="inbox-row"[^>]*class="([^"]+)"/.exec(html)?.[1] ?? /class="([^"]+)"[^>]*data-testid="inbox-row"/.exec(html)?.[1] ?? "";

test("selected inbox row = the sidebar's selected look: rounded bg-neutral-200/80, no left bar, no private accent", () => {
  const selected = row(conv(), true);
  const idle = row(conv(), false);
  assert.match(selected, /aria-current="true"/);
  assert.ok(classOf(selected).split(/\s+/).includes(INBOX_ROW_SELECTED), "selected background");
  assert.equal(INBOX_ROW_SELECTED, "bg-neutral-200/80");
  assert.ok(classOf(selected).includes("rounded-lg"));
  assert.ok(!classOf(idle).includes("bg-neutral-200/80"), "idle row is not tinted");
  assert.ok(classOf(idle).includes("hover:bg-neutral-200/50"));
  for (const html of [selected, idle]) {
    assert.doesNotMatch(html, /inset|box-shadow|border-l-|--im-accent|black\/|hsl\(/, "no bar, no private colours");
  }
  const surface = src("shell/messages/messages-surface.tsx");
  assert.doesNotMatch(surface, /inbox-row|aria-current|--im-accent|\[data-im-/);
});

test("no task rows and no All / Tasks filter; sessions (kind project) and old task rooms never listed", () => {
  assert.equal(isInboxConversation({ kind: "dm" }), true);
  assert.equal(isInboxConversation({ kind: "group" }), true);
  assert.equal(isInboxConversation({ kind: "team" }), true);
  assert.equal(isInboxConversation({ kind: "talent" }), true);
  assert.equal(isInboxConversation({ kind: "project" }), false);
  assert.equal(isInboxConversation({ kind: "task" }), false);
  const html = row(conv({ kind: "task", title: "Launch" }), false);
  assert.doesNotMatch(html, /data-inbox-task-mark|data-conversation-kind/);
  const inbox = src("shell/messages/Inbox.tsx");
  assert.doesNotMatch(inbox, /data-inbox-filter|任务（列表筛选）|tasks\/|StartTaskSelectionAction|conversationOpenAction/);
  assert.match(inbox, /FloatingMenu/);
  assert.match(inbox, /FloatingMenuItem danger/);
  assert.doesNotMatch(src("shell/messages/host-state.ts"), /conversationOpenAction|task-page|task-panel/);
});

test("preview: server label keys render through the copy keys; legacy Chinese prefixes are mapped; typed text is left alone", () => {
  const en = { ...ssUlCopy("en"), "[图片]": "[Image]", "[文件]": "[File]", "撤回了一条消息": "Message recalled" };
  const tEn = (key) => en[key] ?? key;
  const tZh = (key) => key;
  const last = (over) => ({ id: "m", seq: 1, sender_id: null, sender_kind: "user", kind: "text", preview: "", created_at: "", ...over });
  assert.equal(preview.inboxPreviewText(last({ kind: "task", preview: "Task: Launch", preview_label: { label_key: "task", text: "Launch" } }), tEn), "[Task] Launch");
  assert.equal(preview.inboxPreviewText(last({ kind: "task", preview: "Task: Launch", preview_label: { label_key: "task", text: "Launch" } }), tZh), "[任务] Launch");
  assert.equal(preview.inboxPreviewText(last({ preview: "x", preview_label: { label_key: "quote", text: "Design" } }), tEn), "[Chat history] Design");
  assert.equal(preview.inboxPreviewText(last({ preview: "x", preview_label: { label_key: "recalled", text: "ignored" } }), tEn), "Message recalled");
  assert.equal(preview.inboxPreviewText(last({ preview: "[子任务] Launch" }), tEn), "[Task] Launch", "old server string");
  assert.equal(preview.inboxPreviewText(last({ preview: "[文件] a.pdf" }), tEn), "[File] a.pdf");
  assert.equal(preview.inboxPreviewText(last({ preview: "[图片] typed by a person", preview_label: null }), tEn), "[图片] typed by a person", "new server: text stays text");
  assert.equal(preview.inboxPreviewText(last({ preview: "hello" }), tEn), "hello");
});

test("preview labels computed locally for live messages match the server keys", () => {
  const msg = (over) => ({ id: "m", conversation_id: "c", seq: 1, sender_id: "u", sender_kind: "user", kind: "text", body: "", created_at: "", ...over });
  assert.deepEqual(preview.previewLabelOf(msg({ kind: "task", card: { type: "task", title: "Launch" } })), { label_key: "task", text: "Launch" });
  assert.deepEqual(preview.previewLabelOf(msg({ kind: "quote", card: { type: "quote", source_title: "Design", count: 3 } })), { label_key: "quote", text: "Design" });
  assert.deepEqual(preview.previewLabelOf(msg({ kind: "image", body: "" })), { label_key: "image", text: "" });
  assert.deepEqual(preview.previewLabelOf(msg({ kind: "text", body: "hi" })), null);
  assert.deepEqual(preview.previewLabelOf(msg({ kind: "text", body: "hi", recalled_at: "2026-11-21T00:00:00Z" })), { label_key: "recalled", text: "" });
});

test("ss-ul copy: every locale has every key; no locale but zh shows the Chinese task label", () => {
  const keys = Object.values(SS_UL_COPY);
  for (const locale of LOCALES) {
    const table = ssUlCopy(locale);
    for (const key of keys) {
      assert.ok(table[key] && table[key].trim(), `${locale} ${key}`);
      if (locale !== "zh") assert.notEqual(table[key], key, `${locale} ${key} translated`);
    }
    if (locale !== "zh") assert.ok(!Object.values(table).some((value) => value.includes("[任务]")), `${locale}: no [任务]`);
  }
  for (const key of Object.values(preview.PREVIEW_LABEL_COPY)) {
    assert.ok(keys.includes(key) || src("i18n/ui/messages/im-shell-copy.ts").includes(`"${key}"`) || src("i18n/ui/messages/im-talent-copy.ts").includes(`"${key}"`), `label ${key} has copy`);
  }
});

test("one avatar look: grey initials, no hashed colours, in the shared GroupAvatar", () => {
  const avatar = src("shell/messages/groups/GroupAvatar.tsx");
  assert.doesNotMatch(avatar, /hsl\(|HUES|hueOf/);
  const inboxRow = src("shell/messages/InboxRow.tsx");
  assert.doesNotMatch(inboxRow, /TILE_COLORS|#38bdf8|hashOf/);
  assert.match(inboxRow, /PersonAvatar/);
  const html = row(conv({ kind: "dm", title: "", peer: { user_id: "p", display_name: "Ann", avatar_url: null } }), false);
  assert.match(html, /bg-stone-200/);
  assert.match(html, />A<\/span>/);
});
