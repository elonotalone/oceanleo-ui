import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { BAY_CATEGORY_LABEL, BAY_FILES_LABEL, BAY_OFFER_OPTIONS, LISTING_SECTION_LABELS } from "../src/shell/bay/form/bay-listing.ts";

test("买卖共用板块标题、分类、放文件、五种交付（含其他）", () => {
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
    ["digital", "service", "app", "lesson", "other"],
  );
  assert.equal(BAY_OFFER_OPTIONS.find((row) => row.id === "service")?.label, "人工服务");
  assert.equal(BAY_OFFER_OPTIONS.find((row) => row.id === "app")?.label, "网站与软件服务");
});

test("发帖页左右分栏：封面在左，选择条打开盖住下面的字段", () => {
  const reveal = readFileSync(new URL("../src/shell/bay/form/BayRevealForm.tsx", import.meta.url), "utf8");
  const choice = readFileSync(new URL("../src/shell/bay/form/BayChoice.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../src/shell/bay/form/form-ui.ts", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/shell/bay/seller/ServiceEditorPane.tsx", import.meta.url), "utf8");
  const globals = readFileSync(new URL("../src/theme/globals.css", import.meta.url), "utf8");
  const gallery = readFileSync(new URL("../src/shell/bay/form/BayImageGallery.tsx", import.meta.url), "utf8");
  assert.match(reveal, /data-bay-listing-layout="split"/);
  assert.match(reveal, /data-bay-listing-stage/);
  assert.doesNotMatch(reveal, /md:grid-cols-2/);
  assert.match(editor, /layout="listing"/);
  assert.match(choice, /data-bay-choice-menu/);
  assert.match(choice, /absolute inset-x-0 top-full/);
  assert.match(form, /max-w-6xl/);
  assert.match(form, /BAY_FORM_SELECT_CLASS/);
  assert.match(globals, /\[data-bay-listing-layout="split"\]/);
  assert.match(globals, /minmax\(0, 1\.55fr\)/);
  assert.match(globals, /#faf8f5/);
  assert.match(globals, /html:not\(\.dark\) \[data-oceanleo-chrome\]\[data-oceanleo-sidebar-mode\]/);
  assert.match(reveal, /data-bay-listing-lead/);
  assert.match(reveal, /data-bay-listing-split-css/);
  assert.match(gallery, /data-bay-gallery-rail/);
  assert.match(gallery, /variant\?: "grid" \| "listing"/);
});
