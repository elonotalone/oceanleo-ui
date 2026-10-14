// 「我的」四个页面顶上的类别选择条：规则与接线。
// 纯规则直接测；接线用源码检查（组件带 useUI / 浮窗状态，不在这里挂载）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ordersShownFor } from "../src/shell/bay/mine/mine-category.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

test("订单只在「全部、成品文件、人工服务、其他」下出现；作品与课程有各自的一段", () => {
  assert.equal(ordersShownFor("all"), true);
  assert.equal(ordersShownFor("digital"), true);
  assert.equal(ordersShownFor("service"), true);
  assert.equal(ordersShownFor("other"), true);
  assert.equal(ordersShownFor("app"), false);
  assert.equal(ordersShownFor("lesson"), false);
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

test("BayMine：只有「我发布的、我卖出的、我买到的、我的收藏」显示类别条，主页与数据面板不显示", () => {
  const mine = src("src/shell/bay/shell/BayMine.tsx");
  assert.match(mine, /const CATEGORY_TABS: readonly BayMineTab\[\] = \["published", "sold", "bought", "favorites"\];/);
  assert.match(mine, /\{signedIn && categorised \? <MineCategoryBar/);
  assert.match(mine, /category=\{categorised \? category : "all"\}/);
});

test("四个页面都接收类别并按它筛选", () => {
  assert.match(src("src/shell/bay/mine/MyPublishedPane.tsx"), /showServices[\s\S]*category=\{category\}/);
  assert.match(src("src/shell/bay/seller/MyServicesPane.tsx"), /listingCategory\(service\) === category/);
  assert.match(src("src/shell/bay/mine/MySoldPane.tsx"), /fixedRole="seller" category=\{category\}/);
  assert.match(src("src/shell/bay/mine/MyBoughtPane.tsx"), /fixedRole="buyer" category=\{category\}/);
  assert.match(src("src/shell/bay/orders/MyOrdersPane.tsx"), /orderCategory\(order\.source_service_id, serviceKinds\) === category/);
  assert.match(src("src/shell/bay/mine/MyFavoritesPane.tsx"), /favoriteCategory\(item\) === category/);
});

test("发布页的交付方式多了「其他」，并且其他走服务的定价与条款", () => {
  const listing = src("src/shell/bay/form/bay-listing.ts");
  assert.match(listing, /\{ id: "other", label: "其他" \}/);
  assert.match(listing, /export function isPricedOffer\(kind: BayOfferKind\): boolean \{\n  return kind === "service" \|\| kind === "other";/);
  const editor = src("src/shell/bay/seller/ServiceEditorPane.tsx");
  assert.match(editor, /const pricedOffer = offerKind === "service" \|\| offerKind === "other";/);
});
