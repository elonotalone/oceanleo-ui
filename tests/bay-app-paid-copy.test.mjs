// 安全矩阵：不适用（不渲染用户生成的富内容，不涉及跨域）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_APP_PAID_MESSAGES, BAY_APP_PAID_SOURCE } from "../src/i18n/ui/messages/bay-app-paid-copy.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HAN = /[\u4e00-\u9fff]/;

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

test("bay-app-paid 文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_APP_PAID_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.ok(keys.length > 0);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = BAY_APP_PAID_MESSAGES[locale]?.[key];
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

test("收费组件里的新原文都登记进了 bay-app-paid-copy", () => {
  const files = [
    "src/shell/bay/apppaid/AppPurchaseBar.tsx",
    "src/shell/bay/apppaid/AppPurchaseStatus.tsx",
    "src/shell/bay/apppaid/PricingManagePanel.tsx",
    "src/shell/bay/apppaid/MyBoughtAppsPane.tsx",
    "src/shell/bay/apppaid/MySoldAppsPane.tsx",
  ];
  const registered = new Set(Object.values(BAY_APP_PAID_SOURCE));
  const reused = new Set([
    "购买",
    "取消",
    "确认",
    "保存",
    "已保存",
    "重试",
    "免费",
    "价格",
    "申请退款",
    "请平台介入",
    "确认退款",
    "确认请平台介入",
    "确认购买",
    "退款原因",
    "请写明退款原因（至少 4 个字）",
    "请写下退款原因",
    "正在处理…",
    "去设置付款方式",
    "同意退款",
    "拒绝",
    "已确认",
    "已退款",
    "托管中",
    "平台介入中",
    "已取消",
    "待处理退款",
    "已拒绝退款",
    "确定同意这笔退款？",
    "确定拒绝这笔退款？",
    "请写一句拒绝说明",
    "退款处理失败，请稍后再试。",
    "没处理成功，请稍后再试。",
    "购买没成功，请稍后再试。",
    "没保存成功，请稍后再试。",
    "这个作品不存在或已下架",
    "确认收货并把款项付给卖家？",
    "确认后款项付给卖家，不能再退",
    "卖家拒绝后，你可以请平台介入。由操作员裁定。",
    "已申请退款，卖家超时不处理视为同意",
    "平台正在处理这笔退款争议",
    "请输入有效的价格",
    "价格至少是 1.00",
    "试用天数须是 0 到 30 的整数",
  ]);
  for (const file of files) {
    const text = source(file);
    const matches = text.matchAll(/tt\(\s*"([^"]+)"/g);
    for (const match of matches) {
      const key = match[1];
      if (reused.has(key) || registered.has(key)) continue;
      assert.fail(`${file} 的 tt("${key}") 未登记且不在复用清单`);
    }
  }
});
