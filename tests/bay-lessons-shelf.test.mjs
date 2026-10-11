// V1：课程栏货架 / 卡片 / 钩子源码合同，以及分表 17 语译文。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { BAY_LESSONS_SHELF_MESSAGES, BAY_LESSONS_SHELF_SOURCE } = await import(
  "../src/i18n/ui/messages/bay-lessons-shelf-copy.ts"
);
const { lessonPriceLabel, ratingLabel, bundleSaving } = await import(
  "../src/shell/bay/lessons/lesson-format.ts"
);

const LOCALES = ["zh-TW", "en", "ja", "ko", "fr", "de", "it", "es", "es-419", "pt-BR", "pt-PT", "ar", "hi", "th", "tr", "vi"];
const HAN = /[\u4e00-\u9fff]/;

function src(rel) {
  return readFileSync(join(REPO, "src", rel), "utf8");
}

test("lessonPriceLabel：0 是免费，其余走传入的格式化", () => {
  const format = (fen) => `$${fen}`;
  assert.equal(lessonPriceLabel(0, format), "免费");
  assert.equal(lessonPriceLabel(-1, format), "免费");
  assert.equal(lessonPriceLabel(Number.NaN, format), "免费");
  assert.equal(lessonPriceLabel(199, format), "$199");
  assert.equal(lessonPriceLabel(1, format), "$1");
});

test("ratingLabel：无评价为 null，有则一位小数", () => {
  assert.equal(ratingLabel(4.8, 0), null);
  assert.equal(ratingLabel(4.8, -2), null);
  assert.equal(ratingLabel(4.8, 23), "★ 4.8（23）");
  assert.equal(ratingLabel(5, 1), "★ 5.0（1）");
  assert.equal(ratingLabel(4.25, 8), "★ 4.3（8）");
});

test("bundleSaving：单买合计减套餐价，负数当 0", () => {
  assert.equal(bundleSaving({ price_fen: 800, lessons_total_fen: 1000 }), 200);
  assert.equal(bundleSaving({ price_fen: 1000, lessons_total_fen: 1000 }), 0);
  assert.equal(bundleSaving({ price_fen: 1200, lessons_total_fen: 1000 }), 0);
  assert.equal(bundleSaving({ price_fen: 0, lessons_total_fen: 500 }), 500);
});

test("use-bay-lessons / 货架 / 卡片只走 lib/bay/lessons，有取消与封面约束", () => {
  const hook = src("shell/bay/lessons/use-bay-lessons.ts");
  const shelf = src("shell/bay/lessons/BayLessonShelf.tsx");
  const lessonCard = src("shell/bay/lessons/BayLessonCard.tsx");
  const bundleCard = src("shell/bay/lessons/BayBundleCard.tsx");
  for (const [name, text] of [
    ["use-bay-lessons.ts", hook],
    ["BayLessonShelf.tsx", shelf],
    ["BayLessonCard.tsx", lessonCard],
    ["BayBundleCard.tsx", bundleCard],
  ]) {
    assert.doesNotMatch(text, /fetch\(/, `${name} 不得自己 fetch`);
    assert.doesNotMatch(text, /\/v1\//, `${name} 不得手写接口地址`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${name} 不得注入 HTML`);
    assert.doesNotMatch(text, /innerHTML/, `${name} 不得写 innerHTML`);
    assert.doesNotMatch(text, /<iframe/, `${name} 不得嵌 iframe`);
  }
  assert.match(hook, /listBayLessons/);
  assert.match(hook, /listBayLessonBundles/);
  assert.match(hook, /from "\.\.\/\.\.\/\.\.\/lib\/bay\/lessons"/);
  assert.match(hook, /AbortController/);
  assert.match(hook, /requestRef/);
  assert.match(lessonCard, /referrerPolicy="no-referrer"/);
  assert.match(bundleCard, /referrerPolicy="no-referrer"/);
  assert.match(lessonCard, /startsWith\("https:\/\/"\)/);
  assert.match(bundleCard, /startsWith\("https:\/\/"\)/);
  assert.match(shelf, /data-bay-lesson-shelf/);
  assert.match(shelf, /data-bay-lesson-tab/);
  assert.match(shelf, /data-bay-lesson-empty/);
  assert.match(shelf, /data-bay-lesson-error/);
  assert.match(shelf, /data-bay-lesson-more/);
  assert.match(shelf, /data-bay-lesson-loading/);
});

test("bay-lessons-shelf-copy：每条原文 16 语非空，非中日韩不含汉字", () => {
  const keys = Object.values(BAY_LESSONS_SHELF_SOURCE);
  assert.ok(keys.length >= 12, `只有 ${keys.length} 条`);
  for (const key of keys) {
    assert.equal(BAY_LESSONS_SHELF_MESSAGES.zh[key], key, `中文站 key 应等于值：${key}`);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = BAY_LESSONS_SHELF_MESSAGES[locale][key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
    }
  }
});
