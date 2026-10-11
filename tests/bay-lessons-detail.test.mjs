// V2：课程 / 套餐详情源码合同 + 文案 17 语。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_LESSONS_DETAIL_MESSAGES, BAY_LESSONS_DETAIL_SOURCE } from "../src/i18n/ui/messages/bay-lessons-detail-copy.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HAN = /[\u4e00-\u9fff]/;

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

const FILES = [
  "src/shell/bay/lessons/LessonPane.tsx",
  "src/shell/bay/lessons/BundlePane.tsx",
  "src/shell/bay/lessons/PurchasePanel.tsx",
  "src/shell/bay/lessons/LessonOutline.tsx",
  "src/shell/bay/lessons/BuyButton.tsx",
];

test("详情组件只走 lib/bay/lessons，window.open 带 noopener,noreferrer", () => {
  const all = FILES.map(source).join("\n");
  assert.doesNotMatch(all, /fetch\(/);
  assert.doesNotMatch(all, /\/v1\//);
  assert.match(all, /from "\.\.\/\.\.\/\.\.\/lib\/bay\/lessons"/);
  assert.match(all, /window\.open\([^)]*"noopener,noreferrer"\)/);
});

test("没有 iframe 或 HTML 注入", () => {
  const all = FILES.map(source).join("\n");
  assert.doesNotMatch(all, /<iframe/);
  assert.doesNotMatch(all, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(all, /innerHTML/);
});

test("购买 / 确认 / 退款 / 介入四个动作前都有确认标记", () => {
  const all = FILES.map(source).join("\n");
  assert.match(all, /data-bay-confirm="buy"/);
  assert.match(all, /data-bay-confirm="confirm"/);
  assert.match(all, /data-bay-confirm="refund"/);
  assert.match(all, /data-bay-confirm="escalate"/);
});

test("摆了 ItemReviews，itemKind 分别是 lesson 与 bundle", () => {
  const lesson = source("src/shell/bay/lessons/LessonPane.tsx");
  const bundle = source("src/shell/bay/lessons/BundlePane.tsx");
  assert.match(lesson, /ItemReviews/);
  assert.match(bundle, /ItemReviews/);
  assert.match(lesson, /itemKind="lesson"/);
  assert.match(bundle, /itemKind="bundle"/);
});

test("bay-lessons-detail 文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_LESSONS_DETAIL_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.ok(keys.length > 0);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = BAY_LESSONS_DETAIL_MESSAGES[locale]?.[key];
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
