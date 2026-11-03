import assert from "node:assert/strict";
import test from "node:test";
import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const removedOverrides = [
  ["ui-followup-profile-copy", "UI_FOLLOWUP_PROFILE_MESSAGES", ["个人资料", "继续编辑"]],
  ["bay-form-gap-copy", "BAY_FORM_GAP_MESSAGES", ["游戏"]],
  ["im-shell-copy", "IM_SHELL_MESSAGES", ["消息免打扰"]],
  ["im-people-copy", "IM_PEOPLE_MESSAGES", ["备注", "置顶", "已选 {n} 人"]],
  ["collab-media-copy", "COLLAB_MEDIA_MESSAGES", ["淡入淡出"]],
  ["server-page-copy", "SERVER_PAGE_MESSAGES", ["AI 对话"]],
];

test("older copy fragments defer shared words to the existing dictionaries in all 17 locales", async () => {
  for (const [file, name, keys] of removedOverrides) {
    const table = (await import(`../src/i18n/ui/messages/${file}.ts`))[name];
    assert.ok(table, name);
    for (const locale of LOCALES) {
      for (const key of keys) {
        assert.equal(Object.hasOwn(table[locale], key), false, `${name}.${locale}:${key}`);
        assert.ok(UI_MESSAGES[locale][key]?.trim(), `${locale} lost shared translation: ${key}`);
      }
    }
  }
});

test("chat pin actions and pinned badges preserve the separate editor stacking meaning", async () => {
  for (const locale of LOCALES) {
    const { default: base } = await import(`../src/i18n/ui/messages/${locale}.ts`);
    assert.equal(UI_MESSAGES[locale]["置顶"], base["置顶"], locale);
    for (const key of ["置顶聊天", "已置顶", "消息免打扰"]) {
      assert.ok(UI_MESSAGES[locale][key]?.trim(), `${locale}:${key}`);
      if (locale !== "zh" && locale !== "zh-TW") {
        assert.notEqual(UI_MESSAGES[locale][key], key, `${locale}:${key}`);
      }
    }
  }
  assert.equal(UI_MESSAGES.en["置顶"], "Move to front");
  assert.equal(UI_MESSAGES.en["已置顶"], "Pinned");
});

test("pinned inbox and conversation badges render their localized status in all 17 locales", async () => {
  const ui = dataModule("export function useUI() { return key => globalThis.__W6_I18NOLD_DICT[key] ?? key; }");
  const { InboxRow } = await import(await compileModule("src/shell/messages/InboxRow.tsx", {
    "../../i18n/ui/useUI": ui,
    "../../lib/im/people-api": dataModule("export function conversationDisplayTitle(item) { return item.title; }"),
    "./groups/GroupAvatar": dataModule("export function GroupAvatar() { return null; }"),
  }));
  const { PinnedBar } = await import(await compileModule("src/shell/messages/conversation/PinnedBar.tsx", {
    "../../../i18n/ui/useUI": ui,
  }));
  const item = { id: "chat", kind: "dm", title: "Chat", pinned: true, muted: true, unread_count: 0, mention_count: 0 };
  const message = { id: "message", body: "Hello", attachments: [] };
  try {
    for (const locale of LOCALES) {
      globalThis.__W6_I18NOLD_DICT = UI_MESSAGES[locale];
      const row = renderToStaticMarkup(React.createElement(InboxRow, { item, active: false, hasDraft: false, onOpen() {} }));
      const bar = renderToStaticMarkup(React.createElement(PinnedBar, { pins: [message], nameOf: () => "User", onJump() {}, onUnpin() {} }));
      const pinned = renderToStaticMarkup(React.createElement("span", null, UI_MESSAGES[locale]["已置顶"])).slice(6, -7);
      assert.ok(row.includes(`>${pinned}</span>`), `${locale}: inbox pinned status`);
      assert.ok(bar.includes(`>${pinned}</span>`), `${locale}: conversation pinned status`);
      assert.ok(!row.includes(">Move to front</span>") && !bar.includes(">Move to front</span>"));
    }
  } finally {
    delete globalThis.__W6_I18NOLD_DICT;
  }
});
