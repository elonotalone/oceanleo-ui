// W1：设置表面缺译文的中文 key 必须有 16 语、英文不是原文、占位符不丢。
// assembleCopy 的入参类型让缺语种或缺 key 编不过；这里查运行时词典。

import assert from "node:assert/strict";
import test from "node:test";

const { LOCALES } = await import("../src/i18n/config.ts");
const { SETTINGS_I18N_SOURCE, SETTINGS_I18N_MESSAGES } = await import(
  "../src/i18n/ui/messages/settings-i18n-copy.ts"
);

const TRANSLATED = LOCALES.filter((locale) => locale !== "zh");
const KEYS = Object.values(SETTINGS_I18N_SOURCE);
const PLACEHOLDER = /\{[a-zA-Z]+\}/g;
const PROPER = new Set([
  "OpenAI（GPT）",
  "Anthropic（Claude）",
  "Visa · Mastercard · Amex（Stripe）",
  "支付宝",
  "微信支付",
]);

test("SOURCE 每条中文 key 在 16 个非 zh locale 都有非空译文", () => {
  assert.ok(KEYS.length >= 40, `只收到 ${KEYS.length} 条，SOURCE 疑似空了`);
  assert.equal(SETTINGS_I18N_MESSAGES.zh[KEYS[0]], KEYS[0]);
  for (const key of KEYS) {
    for (const locale of TRANSLATED) {
      const value = SETTINGS_I18N_MESSAGES[locale][key];
      assert.ok(value, `${locale} 缺译文：${key}`);
      assert.notEqual(String(value).trim(), "", `${locale} 译文是空串：${key}`);
    }
  }
});

test("英文不是中文原文（专有名词除外），占位符不丢", () => {
  for (const key of KEYS) {
    const en = SETTINGS_I18N_MESSAGES.en[key];
    assert.ok(en, `en 缺译文：${key}`);
    if (!PROPER.has(key)) {
      assert.notEqual(en, key, `英文等于中文原文：${key}`);
    }
    const needed = key.match(PLACEHOLDER) || [];
    for (const locale of TRANSLATED) {
      const value = SETTINGS_I18N_MESSAGES[locale][key];
      for (const token of needed) {
        assert.ok(
          value.includes(token),
          `${locale} 丢了 ${token}：${key} → ${value}`,
        );
      }
    }
  }
});
