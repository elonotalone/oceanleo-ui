// Task rooms wave TU3, what is left after the session / sites wave (2026-11-21): the @leo button text and the
// tr-chat copy table. Task rows, the Tasks filter and task routing left LeoChat (see ss-ul-leochat.test.mjs);
// task-room calls, start-task and runConversationOpen were deleted with their features.
//
// node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//   --experimental-loader ./tests/ts-extension-loader.mjs --test tests/tr-tu3-inbox-routing.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { compileModule } from "./helpers/module-bench.mjs";
import { insertLeoMention } from "../src/shell/messages/composer/leo-insert.ts";

const mentionPicker = await import(await compileModule("src/shell/messages/composer/MentionPicker.tsx"));
const { hasTypedLeoMention } = mentionPicker;

test("@leo button inserts '@leo ' at the caret and the typed-mention rule recognises it", () => {
  assert.deepEqual(insertLeoMention("", 0), { text: "@leo ", caret: 5 });
  assert.deepEqual(insertLeoMention("hi", 2), { text: "hi @leo ", caret: 8 });
  assert.deepEqual(insertLeoMention("hi there", 3), { text: "hi @leo there", caret: 8 });
  assert.deepEqual(insertLeoMention("你好", 2), { text: "你好@leo ", caret: 7 });
  assert.deepEqual(insertLeoMention("abc xyz", 4, 7), { text: "abc @leo ", caret: 9 });
  for (const text of [insertLeoMention("hi", 2).text, insertLeoMention("你好", 2).text, insertLeoMention("", 0).text]) {
    assert.equal(hasTypedLeoMention(text), true, text);
  }
});

test("tr-chat copy: every locale has every key, with the same {variables}", async () => {
  const { trChatCopy } = await import(await compileModule("src/i18n/ui/messages/tr-chat-copy.ts"));
  const zh = trChatCopy("zh");
  const keys = Object.keys(zh);
  assert.ok(keys.length >= 20);
  const vars = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const locale of LOCALES) {
    const copy = trChatCopy(locale);
    assert.deepEqual(Object.keys(copy), keys, locale);
    for (const key of keys) {
      assert.ok(copy[key].trim(), `${locale}: ${key}`);
      assert.deepEqual(vars(copy[key]), vars(key), `${locale}: ${key}`);
    }
  }
  assert.equal(trChatCopy("en")["任务（列表筛选）"], "Tasks");
  assert.equal(trChatCopy("zh")["任务（列表筛选）"], "任务");
});
