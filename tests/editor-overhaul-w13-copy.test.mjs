import assert from "node:assert/strict";
import test from "node:test";
import { EDITOR_OVERHAUL_W13_COPY } from "../src/i18n/ui/messages/editor-overhaul-copy-w13.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { LOCALES } from "../src/i18n/config.ts";

test("3D bar and scene labels have complete local copy in all sixteen non-Chinese locales", () => {
  const keys = Object.keys(EDITOR_OVERHAUL_W13_COPY.en).sort();
  assert.equal(keys.length, 45);
  for (const locale of LOCALES.filter((value) => value !== "zh")) {
    const dictionary = EDITOR_OVERHAUL_W13_COPY[locale];
    assert.deepEqual(Object.keys(dictionary).sort(), keys, locale);
    for (const key of keys) {
      assert.equal(typeof dictionary[key], "string", `${locale}:${key}`);
      assert.ok(dictionary[key].trim(), `${locale}:${key}`);
      if (!["zh-TW", "ja"].includes(locale)) assert.ok(!/\p{Script=Han}/u.test(dictionary[key]), `${locale}:${key}`);
      assert.equal(UI_MESSAGES[locale][key], dictionary[key], `${locale}:${key} not registered`);
    }
  }
  assert.equal(UI_MESSAGES.en["基础色"], "Base color");
  assert.equal(UI_MESSAGES.en["缩放对象"], "Scale object");
  assert.ok(!keys.includes("材质") && !keys.includes("动画"), "existing shared translations must not be overridden");
});
