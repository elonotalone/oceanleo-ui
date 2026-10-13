import assert from "node:assert/strict";
import test from "node:test";

import { BAY_CATEGORY_LABEL, BAY_FILES_LABEL, BAY_OFFER_OPTIONS, LISTING_SECTION_LABELS } from "../src/shell/bay/form/bay-listing.ts";

test("买卖共用板块标题、分类、放文件、四种交付", () => {
  assert.equal(LISTING_SECTION_LABELS.product, "产品信息");
  assert.equal(LISTING_SECTION_LABELS.price, "价格");
  assert.equal(LISTING_SECTION_LABELS.audience, "向谁展示");
  assert.equal(LISTING_SECTION_LABELS.offer, "你交付什么");
  assert.equal(LISTING_SECTION_LABELS.offerBuy, "交付给你的是什么");
  assert.equal(LISTING_SECTION_LABELS.terms, "交付条款");
  assert.equal(BAY_CATEGORY_LABEL, "分类");
  assert.equal(BAY_FILES_LABEL, "放文件");
  assert.deepEqual(
    BAY_OFFER_OPTIONS.map((row) => row.id),
    ["digital", "service", "app", "lesson"],
  );
  assert.equal(BAY_OFFER_OPTIONS.find((row) => row.id === "service")?.label, "人工服务");
});
