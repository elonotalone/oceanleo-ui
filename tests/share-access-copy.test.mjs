import assert from "node:assert/strict";
import test from "node:test";
import { LOCALES } from "../src/i18n/config.ts";
import { SHARE_ACCESS_COPY_SOURCE as source, SHARE_ACCESS_MESSAGES } from "../src/i18n/ui/messages/share-access-copy.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";
import en from "../src/i18n/ui/messages/en.ts";

test("access copy preserves established global labels in aggregate and request dictionaries", async () => {
  const runtime = await loadUiMessages("en");
  assert.equal(en["登录"], "Log in");
  assert.equal(UI_MESSAGES.en["登录"], en["登录"]);
  assert.equal(runtime["登录"], en["登录"]);
});

test("every access key reaches all 16 request languages with the same precedence as the aggregate", async () => {
  for (const locale of LOCALES.filter(locale => locale !== "zh")) {
    const runtime = await loadUiMessages(locale);
    for (const key of Object.values(source)) {
      assert.ok(runtime[key]?.trim(), `${locale}: missing runtime access copy ${key}`);
      assert.equal(runtime[key], UI_MESSAGES[locale][key], `${locale}: runtime/aggregate access copy differs for ${key}`);
    }
    for (const key of [source.collaborateDescription, source.viewDescription, source.forkNote]) {
      assert.equal(runtime[key], SHARE_ACCESS_MESSAGES[locale][key], `${locale}: new access description overwritten for ${key}`);
    }
  }
});
