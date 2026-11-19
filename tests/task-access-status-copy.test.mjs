import assert from "node:assert/strict";
import test from "node:test";
import { LOCALES } from "../src/i18n/config.ts";
import { SHARE_ACCESS_MESSAGES } from "../src/i18n/ui/messages/share-access-copy.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";

test("task access loading and retry notices reach all 17 locale dictionaries", async () => {
  for (const locale of LOCALES) {
    const runtime = await loadUiMessages(locale);
    for (const key of ["正在读取访问权限…", "网络不稳定，正在重试。"]) {
      assert.ok(SHARE_ACCESS_MESSAGES[locale][key]?.trim(), `${locale}: ${key}`);
      if (locale === "zh") continue; // Chinese uses the source key directly.
      assert.equal(runtime[key], SHARE_ACCESS_MESSAGES[locale][key]);
      assert.equal(UI_MESSAGES[locale][key], runtime[key]);
      if (locale !== "zh") assert.notEqual(runtime[key], key);
    }
  }
});
