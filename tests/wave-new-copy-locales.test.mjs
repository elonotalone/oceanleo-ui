import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LOCALES } from "../src/i18n/config.ts";
import { purchaseCopy } from "../src/i18n/ui/messages/purchase-copy.ts";
import { localBrowserCopy } from "../src/i18n/ui/messages/local-browser-copy.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";

const fields = JSON.parse(readFileSync(new URL("./fixtures/wave-new-copy-keys.json", import.meta.url), "utf8"));
const placeholders = value => [...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();
const numbers = value => value.match(/\d+(?:\.\d+)?/g)?.sort() || [];
function check(locale, key, canonicalEnglish, value) {
  assert.ok(value?.trim(), `${locale}: ${key}`);
  assert.deepEqual(placeholders(value), placeholders(key), `${locale} placeholders: ${key}`);
  assert.deepEqual(numbers(value), numbers(key), `${locale} numbers: ${key}`);
  if (locale === "zh") assert.equal(value, key);
  else if (locale === "en") assert.equal(value, canonicalEnglish);
  else assert.notEqual(value, canonicalEnglish, `${locale} leaked English default: ${key}`);
  if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) assert.doesNotMatch(value, /[\u4e00-\u9fff]/u, `${locale}: ${key}`);
  if (locale !== "zh" && key.length > 4) assert.notEqual(value, key, `${locale} leaked Chinese fallback: ${key}`);
}

test("wave server allowance strings are really translated in all17 locales; numbers and financial source keys stay exact", () => {
  assert.equal(LOCALES.length, 17);
  assert.equal(Object.keys(fields.budget).length, 56);
  for (const locale of LOCALES) for (const [key, en] of Object.entries(fields.budget)) check(locale, key, en, purchaseCopy(locale)[key]);
});
test("wave local-browser disclosure and setup use real locale text", () => {
  assert.equal(Object.keys(fields.browser).length, 2);
  for (const locale of LOCALES) for (const [key, en] of Object.entries(fields.browser)) check(locale, key, en, localBrowserCopy(locale)[key]);
});
test("new wave strings reach both static and selected runtime dictionaries without locale fallback", async () => {
  const english = UI_MESSAGES.en;
  for (const locale of LOCALES) {
    const runtime = await loadUiMessages(locale);
    if (locale === "zh") assert.deepEqual(runtime, {});
    for (const [key, en] of Object.entries({ ...fields.budget, ...fields.browser })) {
      const value = UI_MESSAGES[locale][key];
      assert.ok(value?.trim(), `${locale} static: ${key}`);
      if (locale !== "zh") assert.equal(runtime[key], value, `${locale} runtime drift: ${key}`);
      if (!["zh", "en"].includes(locale)) {
        assert.notEqual(value, english[key], `${locale} merged English fallback: ${key}`);
        if (!["zh-TW", "ja", "ko"].includes(locale)) assert.doesNotMatch(value, /[\u4e00-\u9fff]/u, `${locale}: ${key}`);
      }
    }
  }
});
