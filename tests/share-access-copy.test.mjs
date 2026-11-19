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
  assert.equal(runtime[source.collaborate], "Collaborate");
  assert.equal(UI_MESSAGES.zh[source.collaborate], "协作");
  assert.equal(UI_MESSAGES.en["协作"], en["协作"], "the role must not rename the generic collaboration label");
});

test("every access key reaches all 16 request languages with the same precedence as the aggregate", async () => {
  for (const locale of LOCALES.filter(locale => locale !== "zh")) {
    const runtime = await loadUiMessages(locale);
    for (const key of Object.values(source)) {
      assert.ok(runtime[key]?.trim(), `${locale}: missing runtime access copy ${key}`);
      assert.equal(runtime[key], UI_MESSAGES[locale][key], `${locale}: runtime/aggregate access copy differs for ${key}`);
    }
    for (const key of [source.forkNote]) {
      assert.equal(runtime[key], SHARE_ACCESS_MESSAGES[locale][key], `${locale}: new access description overwritten for ${key}`);
    }
  }
});

import { SW_TS_COPY, swTsCopy } from "../src/i18n/ui/messages/sw-ts-copy.ts";
test("task share copy has complete translations in every runtime locale and removes obsolete descriptions", async () => {
  assert.equal(source.viewDescription, undefined);
  assert.equal(source.collaborateDescription, undefined);
  for (const locale of LOCALES) {
    const runtime = await loadUiMessages(locale);
    for (const key of Object.values(SW_TS_COPY)) {
      assert.ok(swTsCopy(locale)[key]?.trim(), `${locale}: ${key}`);
      assert.equal(locale === "zh" ? runtime[key] ?? key : runtime[key], swTsCopy(locale)[key]);
      assert.equal(UI_MESSAGES[locale][key], swTsCopy(locale)[key]);
    }
  }
  assert.equal(SHARE_ACCESS_MESSAGES.fr[source.membersAndAccess], "Membres et autorisations");
  assert.equal(SHARE_ACCESS_MESSAGES.tr[source.membersAndAccess], "Üyeler ve izinler");
});
