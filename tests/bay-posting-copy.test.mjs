// 安全矩阵：不适用（卖/买两档文案分表，无不可信注入）
import assert from "node:assert/strict";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_POSTING_MESSAGES, BAY_POSTING_SOURCE } from "../src/i18n/ui/messages/bay-posting-copy.ts";
import { BAY_MESSAGES } from "../src/i18n/ui/messages/bay-copy.ts";

const HAN = /[\u4e00-\u9fff]/;

const REQUIRED = [
  "我想要卖",
  "我想要买",
  "我想要卖还是买",
  "现成文件",
  "按约定交付",
  "人工服务",
  "种类",
  "看别人在卖还是在买",
  "公开征集",
  "尽快接手",
  "指定某人",
  "指定一群人",
  "向谁展示",
  "所有人",
  "你交付什么",
  "交付给你的是什么",
  "价格",
  "所有人可见，别人报价，你来挑",
  "只给认证过的人看，谁先接就由谁来做",
  "只有这个人能看到",
  "只有选中的人能看到",
  "用户自定义",
  "点一下加进条款，也可以自己写",
  "仅个人使用",
  "已交付不退款",
  "含改稿",
  "已选 {n} 人",
  "选择成员",
  "价格条款",
  "放文件",
  "交期可协商",
  "付款后立即交付",
];

test("bay-posting 文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_POSTING_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.equal(keys.length, Object.keys(BAY_POSTING_SOURCE).length);
  assert.equal(BAY_POSTING_SOURCE.pricingTerms, "价格条款");
  assert.equal(BAY_POSTING_SOURCE.putFiles, "放文件");
  assert.equal(BAY_POSTING_SOURCE.price, "价格");
  assert.equal(BAY_POSTING_SOURCE.whoToShow, "向谁展示");
  assert.equal(BAY_POSTING_SOURCE.humanService, "人工服务");
  assert.equal(BAY_POSTING_MESSAGES.en["价格条款"], "Pricing terms");
  assert.equal(BAY_POSTING_MESSAGES.en["价格"], "price");
  assert.equal(BAY_POSTING_MESSAGES.en["向谁展示"], "Who to show");
  assert.equal(BAY_POSTING_MESSAGES.en["所有人"], "everyone");
  assert.equal(BAY_POSTING_MESSAGES.en["你交付什么"], "What you deliver");
  assert.equal(BAY_POSTING_MESSAGES.en["交付给你的是什么"], "What is delivered to you");
  assert.equal(BAY_POSTING_MESSAGES.en["人工服务"], "Human service");
  assert.equal(BAY_POSTING_MESSAGES.en["放文件"], "Put files");
  assert.equal(BAY_POSTING_MESSAGES.en["选日期"], "Date");
  assert.equal(BAY_POSTING_MESSAGES["zh-TW"]["价格条款"], "價格條款");
  assert.equal(BAY_POSTING_MESSAGES["zh-TW"]["放文件"], "放檔案");
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = BAY_POSTING_MESSAGES[locale]?.[key];
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

test("任务书所列原文都能在 Bay 聚合词典里查到 17 语", () => {
  for (const key of REQUIRED) {
    for (const locale of LOCALES) {
      const value = BAY_MESSAGES[locale]?.[key];
      assert.ok(value && String(value).trim(), `${locale} 缺译文：${key}`);
      const placeholders = (key.match(/\{\w+\}/g) || []).sort();
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (locale === "zh") {
        assert.equal(value, key);
      }
    }
  }
});
