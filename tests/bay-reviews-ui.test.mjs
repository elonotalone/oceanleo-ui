import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_REVIEWS_MESSAGES, BAY_REVIEWS_SOURCE } from "../src/i18n/ui/messages/bay-reviews-copy.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HAN = /[\u4e00-\u9fff]/;
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

const FILES = [
  "src/shell/bay/reviews/ItemReviews.tsx",
  "src/shell/bay/reviews/ReviewComposer.tsx",
  "src/shell/bay/reviews/ReviewCard.tsx",
  "src/shell/bay/reviews/ReviewPhotos.tsx",
  "src/shell/bay/reviews/use-item-reviews.ts",
];

test("评论区只走 lib/bay/item-reviews 和 uploadFile，没有 fetch 或 /v1/", () => {
  for (const file of FILES) {
    const text = src(file);
    assert.doesNotMatch(text, /\bfetch\s*\(/, `${file} 不得自己 fetch`);
    assert.doesNotMatch(text, /\/v1\//, `${file} 不得写 /v1/`);
  }
  const hook = src("src/shell/bay/reviews/use-item-reviews.ts");
  const item = src("src/shell/bay/reviews/ItemReviews.tsx");
  const composer = src("src/shell/bay/reviews/ReviewComposer.tsx");
  const card = src("src/shell/bay/reviews/ReviewCard.tsx");
  const photos = src("src/shell/bay/reviews/ReviewPhotos.tsx");
  assert.match(hook, /listBayItemReviews/);
  assert.match(hook, /AbortController/);
  assert.match(item, /getBayReviewableOrder/);
  assert.match(composer, /createBayItemReview/);
  assert.match(card, /addBayItemReviewFollowup/);
  assert.match(card, /replyBayItemReview/);
  assert.match(card, /voteBayItemReview/);
  assert.match(card, /unvoteBayItemReview/);
  assert.match(photos, /uploadFile/);
  assert.match(photos, /import\(["']\.\.\/\.\.\/\.\.\/lib\/database["']\)/);
});

test("图片带 referrerPolicy=no-referrer 且经过 safePhotos；正文不当 HTML；无 iframe", () => {
  for (const file of FILES) {
    const text = src(file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${file} 不得注入 HTML`);
    assert.doesNotMatch(text, /\.innerHTML\s*=/, `${file} 不得写 innerHTML`);
    assert.doesNotMatch(text, /<iframe/, `${file} 不得加 iframe`);
  }
  const photos = src("src/shell/bay/reviews/ReviewPhotos.tsx");
  const card = src("src/shell/bay/reviews/ReviewCard.tsx");
  assert.match(photos, /referrerPolicy=["']no-referrer["']/);
  assert.match(photos, /safePhotos\(/);
  assert.match(photos, /role=["']dialog["']/);
  assert.match(card, /referrerPolicy=["']no-referrer["']/);
  assert.match(card, /safePhotos\(/);
  assert.match(card, /whitespace-pre-wrap/);
  const composer = src("src/shell/bay/reviews/ReviewComposer.tsx");
  assert.match(composer, /whitespace-pre-wrap|ReviewPhotoFields/);
});

test("六个筛选标记都在", () => {
  const item = src("src/shell/bay/reviews/ItemReviews.tsx");
  assert.match(item, /data-bay-item-reviews/);
  assert.match(item, /data-bay-review-filter=\{filter\}/);
  assert.match(item, /REVIEW_FILTERS/);
  const model = src("src/shell/bay/reviews/review-model.ts");
  assert.match(model, /\["all", "good", "mid", "bad", "photos", "followup"\]/);
});

test("ServicePane 摆了 ItemReviews 且 itemKind=service；订单页买家用 ReviewComposer，卖家原表单还在", () => {
  const pane = src("src/shell/bay/supply/ServicePane.tsx");
  assert.match(pane, /<ItemReviews itemKind="service" itemId=\{service\.id\} \/>/);
  assert.doesNotMatch(pane, /<ReviewList /);
  const order = src("src/shell/bay/orders/order-review.tsx");
  assert.match(order, /viewerRole === "buyer"/);
  assert.match(order, /<ReviewComposer/);
  assert.match(order, /viewerRole === "seller"/);
  assert.match(order, /data-bay-review-form/);
  assert.match(order, /submitBayReview/);
  assert.match(order, /SCORE_FIELDS/);
});

test("bay-reviews 文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_REVIEWS_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.ok(keys.length > 0);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = BAY_REVIEWS_MESSAGES[locale]?.[key];
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
