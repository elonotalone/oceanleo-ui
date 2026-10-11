// 安全矩阵：不适用（只显示自己的汇总数字）
import assert from "node:assert/strict";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_DASHBOARD_MESSAGES, BAY_DASHBOARD_SOURCE } from "../src/i18n/ui/messages/bay-dashboard-copy.ts";
import { BAY_SHELL_MESSAGES } from "../src/i18n/ui/messages/bay-shell-copy.ts";

const HAN = /[\u4e00-\u9fff]/;
const SHELL_TITLES = ["管理作品", "留言详情", "数据面板", "登录确认"];

test("bay-dashboard 文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_DASHBOARD_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.ok(keys.length > 0);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = BAY_DASHBOARD_MESSAGES[locale]?.[key];
      assert.ok(value && String(value).trim(), `${locale} 缺译文：${key}`);
      const placeholders = (key.match(/\{\w+\}/g) || []).sort();
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (locale === "zh") assert.equal(value, key);
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
    }
  }
});

test("外壳四句标题在 bay-shell-copy 17 语齐全", () => {
  for (const key of SHELL_TITLES) {
    assert.equal(BAY_SHELL_MESSAGES.zh[key], key);
    for (const locale of LOCALES) {
      const value = BAY_SHELL_MESSAGES[locale]?.[key];
      assert.ok(value && String(value).trim(), `${locale} 缺译文：${key}`);
      if (locale === "zh") assert.equal(value, key);
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
    }
  }
});
