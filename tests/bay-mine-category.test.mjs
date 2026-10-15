// 「我的」四个页面顶上的类别选择条：规则与接线。
// 纯规则直接测；接线用源码检查（组件带 useUI / 浮窗状态，不在这里挂载）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  categoryOfListingKind,
  favoriteCategory,
  isMergedPaidOrder,
  isPaidListingContract,
  paidContractIds,
  rowMatchesCategory,
} from "../src/shell/bay/mine/mine-category.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

test("选中全部时每一类都留；否则只留这一类", () => {
  assert.equal(rowMatchesCategory("all", "digital"), true);
  assert.equal(rowMatchesCategory("all", "lesson"), true);
  assert.equal(rowMatchesCategory("digital", "digital"), true);
  assert.equal(rowMatchesCategory("digital", "service"), false);
  assert.equal(rowMatchesCategory("app", "app"), true);
  assert.equal(rowMatchesCategory("lesson", "service"), false);
});

test("listing_kind 映射到五类；不认识的算人工服务", () => {
  assert.equal(categoryOfListingKind("digital"), "digital");
  assert.equal(categoryOfListingKind("app"), "app");
  assert.equal(categoryOfListingKind("lesson"), "lesson");
  assert.equal(categoryOfListingKind("other"), "other");
  assert.equal(categoryOfListingKind("service"), "service");
  assert.equal(categoryOfListingKind(null), "service");
});

test("收藏：服务按 listing_kind；卖家和需求算其他", () => {
  assert.equal(favoriteCategory({ id: "1", target_kind: "service", target_ref: "s", created_at: null, target: { listing_kind: "digital" } }), "digital");
  assert.equal(favoriteCategory({ id: "2", target_kind: "profile", target_ref: "u", created_at: null, target: {} }), "other");
  assert.equal(favoriteCategory({ id: "3", target_kind: "demand", target_ref: "d", created_at: null, target: {} }), "other");
});

test("类别选择条：全部 + 五类，顺序是成品文件、人工服务、作品、课程、其他", () => {
  const tag = src("src/shell/bay/mine/PublishedCategoryTag.tsx");
  assert.match(tag, /PUBLISHED_CATEGORIES: readonly PublishedCategory\[\] = \["digital", "service", "app", "lesson", "other"\]/);
  assert.match(tag, /digital: "成品文件"/);
  assert.match(tag, /service: "人工服务"/);
  assert.match(tag, /app: "作品"/);
  assert.match(tag, /lesson: "课程"/);
  assert.match(tag, /other: "其他"/);
  const bar = src("src/shell/bay/mine/MineCategoryBar.tsx");
  assert.match(bar, /\["all", \.\.\.PUBLISHED_CATEGORIES\]/);
  assert.match(bar, /data-bay-mine-category=\{id\}/);
});

test("BayMine：四个交易页显示类别条，主页与数据面板不分类；标签是六块", () => {
  const mine = src("src/shell/bay/shell/BayMine.tsx");
  assert.match(mine, /const CATEGORY_TABS: readonly BayMineTab\[\] = \["published", "sold", "bought", "favorites"\];/);
  assert.match(mine, /\{signedIn && categorised \? <MineCategoryBar/);
  assert.match(mine, /category=\{categorised \? category : "all"\}/);
  const links = src("src/shell/bay/shell/bay-links.ts");
  assert.match(links, /BAY_MINE_UI_TABS: readonly BayMineTab\[\] = \["published", "sold", "bought", "favorites", "page", "dashboard"\]/);
});

test("四个页面都走同一张清单并按类别筛选", () => {
  for (const rel of [
    "src/shell/bay/mine/MyPublishedPane.tsx",
    "src/shell/bay/mine/MySoldPane.tsx",
    "src/shell/bay/mine/MyBoughtPane.tsx",
    "src/shell/bay/mine/MyFavoritesPane.tsx",
  ]) {
    const text = src(rel);
    assert.match(text, /MineTradeList/);
    assert.match(text, /rowMatchesCategory/);
    assert.doesNotMatch(text, /data-bay-mine-section/);
    assert.doesNotMatch(text, /SellerOverview/);
    assert.doesNotMatch(text, /List a work|Publish a lesson|发布课程|上架作品/);
  }
});

test("课程和作品购买对应的 talent 合同不进统一清单", () => {
  assert.equal(isPaidListingContract({ id: "c1", requirements: { _lesson_order: { item_kind: "lesson" } } }), true);
  assert.equal(isPaidListingContract({ id: "c2", requirements: {} }), false);
  const paidIds = paidContractIds([{ contract_id: "c3" }], [{ contract_id: "c4" }, { contract_id: "" }]);
  assert.equal(paidIds.has("c3"), true);
  assert.equal(paidIds.has("c4"), true);
  assert.equal(isMergedPaidOrder({ id: "c3" }, paidIds), true);
  assert.equal(isMergedPaidOrder({ id: "other" }, paidIds), false);
});

test("发布页的交付方式多了「其他」，并且其他走服务的定价与条款", () => {
  const listing = src("src/shell/bay/form/bay-listing.ts");
  assert.match(listing, /\{ id: "other", label: "其他" \}/);
  assert.match(listing, /export function isPricedOffer\(kind: BayOfferKind\): boolean \{\n  return kind === "service" \|\| kind === "other";/);
  const editor = src("src/shell/bay/seller/ServiceEditorPane.tsx");
  assert.match(editor, /const pricedOffer = offerKind === "service" \|\| offerKind === "other";/);
});
