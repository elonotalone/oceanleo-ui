// 安全矩阵：UC-1（公开网址由网关分配，只落用户内容域；界面不拼域名）
import assert from "node:assert/strict";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_APP_ENDPOINT_MESSAGES, BAY_APP_ENDPOINT_SOURCE } from "../src/i18n/ui/messages/bay-app-endpoint-copy.ts";

const HAN = /[\u4e00-\u9fff]/;

test("bay-app-endpoint 文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_APP_ENDPOINT_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.ok(keys.length > 0);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = BAY_APP_ENDPOINT_MESSAGES[locale]?.[key];
      assert.ok(value && String(value).trim(), `${locale} 缺译文：${key}`);
      const placeholders = (key.match(/\{\w+\}/g) || []).sort();
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (locale === "zh") {
        assert.equal(value, key);
      }
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
    }
  }
});
