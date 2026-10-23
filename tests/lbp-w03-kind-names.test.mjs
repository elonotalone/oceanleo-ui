// leobay-projects 波 W03：LeoBay 其余文件的种类名清扫。
//   - 种类五个名字（人工服务 / 现成文件 / 网站与软件服务 / 课程 / 其他）中英与 §5.1 表一字不差；
//   - 信息流卡的角标按 listing_kind 取五类之一，不再写「数字商品 / 服务」；
//   - 边界内的可见文案不再用「服务 / 素材 / 作品 / 成品」指代一个种类（判定为非种类的句子逐条列在 KEEP 里）；
//   - 分表 lbp-w03-copy.ts 16 语齐全，且每一句都真的在源码里被用到。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { stripJsComments } from "./helpers/strip-js-comments.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
const { LBP_W03_MESSAGES } = await import("../src/i18n/ui/messages/lbp-w03-copy.ts");
const { LOCALES } = await import("../src/i18n/config.ts");
const listing = await import("../src/shell/bay/form/bay-listing.ts");

// ---- 一、种类名 ---------------------------------------------------------------------------

const KIND_TABLE = [
  ["service", "人工服务", "Human service"],
  ["digital", "现成文件", "Ready-made files"],
  ["app", "网站与软件服务", "Website & software service"],
  ["lesson", "课程", "Lessons"],
  ["other", "其他", "Other"],
];

test("发布表单的种类选项就是 §5.1 的五个名字，中英一字不差", () => {
  assert.deepEqual(
    listing.BAY_OFFER_OPTIONS.map((row) => row.label).sort(),
    KIND_TABLE.map(([, zh]) => zh).sort(),
  );
  for (const [kind, zh, en] of KIND_TABLE) {
    assert.equal(listing.offerKindLabel(kind), zh, kind);
    assert.equal(UI_MESSAGES.zh[zh], zh, `中文站 key 等于值：${zh}`);
    assert.equal(UI_MESSAGES.en[zh], en, `英文：${zh}`);
    for (const locale of LOCALES) {
      assert.ok(UI_MESSAGES[locale][zh], `${locale} 缺「${zh}」的译文`);
    }
  }
  assert.equal(listing.BAY_OFFER_BUY_APP_LABEL, "网站与软件服务");
});

test("offerFromFeedKind：信息流里的 listing_kind 落到五类之一，没写种类的老条目算人工服务", () => {
  for (const [kind] of KIND_TABLE) assert.equal(listing.offerFromFeedKind(kind), kind);
  for (const empty of [null, undefined, "", "consult", "nonsense"]) assert.equal(listing.offerFromFeedKind(empty), "service");
});

// ---- 二、信息流卡的角标 -------------------------------------------------------------------

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const httpStub = dataModule(`
  export class BayApiError extends Error {}
  const no = async () => { throw new Error("network is stubbed"); };
  export const bayGet = no, bayPost = no, bayPatch = no, bayDelete = no;
`);
const { ServiceCard } = await import(
  await compileModule("src/shell/bay/supply/ServiceCard.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../lib/bay/http": httpStub,
    "../auth/config": dataModule(`export const GATEWAY_BASE = "https://api.example.test";`),
  })
);

function feedItem(listingKind) {
  return {
    kind: "service",
    id: "svc-1",
    title: "一件东西",
    summary: "",
    category: "design",
    created_at: "2026-10-23T10:00:00Z",
    posted_site: "design",
    handling_site: "design",
    price: { min_fen: 100, max_fen: 100, unit: null, currency: "CNY" },
    author: { user_id: "u1", handle: "leo", display_name: "Leo", avatar_url: null, verified_level: 0, rating_avg: null, rating_count: 0, official: false },
    stats: { order_count: 0 },
    status: "published",
    deadline_at: null,
    cover_url: null,
    has_attached_work: false,
    listing_kind: listingKind,
  };
}

test("信息流卡：五类各写自己的角标，卡片和行两种版式一致", () => {
  for (const variant of ["card", "row"]) {
    for (const [kind, zh] of KIND_TABLE) {
      const out = renderToStaticMarkup(React.createElement(ServiceCard, { item: feedItem(kind), onOpen() {}, variant }));
      assert.match(out, new RegExp(`data-bay-kind="${kind}"[^>]*>${zh}<`), `${variant} ${kind}`);
    }
    const legacy = renderToStaticMarkup(React.createElement(ServiceCard, { item: feedItem(null), onOpen() {}, variant }));
    assert.match(legacy, /data-bay-kind="service"[^>]*>人工服务</, `${variant} 没写种类`);
  }
  const out = renderToStaticMarkup(React.createElement(ServiceCard, { item: feedItem("digital"), onOpen() {} }));
  assert.doesNotMatch(out, /数字商品|>服务</);
});

test("ServiceEditorPane 的种类徽标按发布种类取名，不再读旧三态表", () => {
  const pane = read("src/shell/bay/seller/ServiceEditorPane.tsx");
  assert.match(pane, /tt\(offerKindLabel\(offerKind\)\)/);
  assert.doesNotMatch(pane, /PUBLISH_KIND_LABELS/);
  const model = read("src/shell/bay/seller/editor-model.ts");
  assert.match(model, /digital: "现成文件"/);
  assert.match(model, /service: "人工服务"/);
  assert.doesNotMatch(model, /digital: "素材"|service: "服务"/);
});

// ---- 三、边界内可见文案的清扫 -------------------------------------------------------------

const BOUNDARY = [
  "src/shell/bay/appendpoint/EndpointManagePanel.tsx",
  "src/shell/bay/appendpoint/endpoint-model.ts",
  "src/shell/bay/appendpoint/EndpointPicker.tsx",
  "src/shell/bay/appfeedback/AppFeedback.tsx",
  "src/shell/bay/appfeedback/AppThreadPane.tsx",
  "src/shell/bay/appfeedback/FeedbackManagePanel.tsx",
  "src/shell/bay/appfeedback/feedback-model.ts",
  "src/shell/bay/appfeedback/MyThreadsPane.tsx",
  "src/shell/bay/appfeedback/ThreadCard.tsx",
  "src/shell/bay/appfeedback/ThreadComposer.tsx",
  "src/shell/bay/appinsights/app-source.ts",
  "src/shell/bay/appinsights/ErrorsManagePanel.tsx",
  "src/shell/bay/appinsights/insights-model.ts",
  "src/shell/bay/appinsights/ShareLinkButton.tsx",
  "src/shell/bay/appinsights/SourcesManagePanel.tsx",
  "src/shell/bay/applogin/AppLoginConsentPane.tsx",
  "src/shell/bay/applogin/AppLoginHint.tsx",
  "src/shell/bay/applogin/LoginManagePanel.tsx",
  "src/shell/bay/applogin/login-model.ts",
  "src/shell/bay/appreleases/AppReleases.tsx",
  "src/shell/bay/appreleases/FollowButton.tsx",
  "src/shell/bay/appreleases/follow-store.ts",
  "src/shell/bay/appreleases/MyFollowedAppsPane.tsx",
  "src/shell/bay/appreleases/ReleasesManagePanel.tsx",
  "src/shell/bay/appreleases/releases-model.ts",
  "src/shell/bay/apps/app-editor-model.ts",
  "src/shell/bay/apps/AppEditorPane.tsx",
  "src/shell/bay/apps/AppEmbedFrame.tsx",
  "src/shell/bay/apps/app-embed.ts",
  "src/shell/bay/apps/AppManagePane.tsx",
  "src/shell/bay/apps/AppPane.tsx",
  "src/shell/bay/apps/AppStatsBars.tsx",
  "src/shell/bay/apps/AppVerifyPanel.tsx",
  "src/shell/bay/apps/BayAppCard.tsx",
  "src/shell/bay/apps/hosted-to-bay.ts",
  "src/shell/bay/apps/index.ts",
  "src/shell/bay/apps/MyAppsPane.tsx",
  "src/shell/bay/apps/use-bay-apps.ts",
  "src/shell/bay/deal/DealCard.tsx",
  "src/shell/bay/deal/DealComposer.tsx",
  "src/shell/bay/deal/DealConversationView.tsx",
  "src/shell/bay/deal/deal-flows.ts",
  "src/shell/bay/deal/DealMessageList.tsx",
  "src/shell/bay/deal/deal-model.ts",
  "src/shell/bay/deal/DealOfferCard.tsx",
  "src/shell/bay/deal/DealOfferForm.tsx",
  "src/shell/bay/deal/DealSystemLine.tsx",
  "src/shell/bay/deal/index.ts",
  "src/shell/bay/deal/open-trade-thread.ts",
  "src/shell/bay/deal/use-deal-thread.ts",
  "src/shell/bay/form/BayAudienceField.tsx",
  "src/shell/bay/form/bay-audience.ts",
  "src/shell/bay/form/BayAutoTextarea.tsx",
  "src/shell/bay/form/BayChoice.tsx",
  "src/shell/bay/form/BayCoverDrop.tsx",
  "src/shell/bay/form/BayCustomTerms.tsx",
  "src/shell/bay/form/BayDeadlineField.tsx",
  "src/shell/bay/form/bay-deadline.ts",
  "src/shell/bay/form/BayDigitalWorksField.tsx",
  "src/shell/bay/form/bay-digital-works.ts",
  "src/shell/bay/form/bay-gallery.ts",
  "src/shell/bay/form/BayHowYouDeliver.tsx",
  "src/shell/bay/form/BayImageGallery.tsx",
  "src/shell/bay/form/BayListingPreview.tsx",
  "src/shell/bay/form/bay-listing.ts",
  "src/shell/bay/form/BayMenuSelect.tsx",
  "src/shell/bay/form/bay-price.ts",
  "src/shell/bay/form/BayPublishKindPair.tsx",
  "src/shell/bay/form/BayPublishShell.tsx",
  "src/shell/bay/form/BayRevealForm.tsx",
  "src/shell/bay/form/BaySelectMembers.tsx",
  "src/shell/bay/form/bay-typed-preview.ts",
  "src/shell/bay/form/BayTypedPreview.tsx",
  "src/shell/bay/form/bay-upload.ts",
  "src/shell/bay/form/BayWorkShowcase.tsx",
  "src/shell/bay/form/form-ui.ts",
  "src/shell/bay/form/index.ts",
  "src/shell/bay/form/listing-terms-fields.tsx",
  "src/shell/bay/form/post-templates.ts",
  "src/shell/bay/form/PublishCategoryPicker.tsx",
  "src/shell/bay/form/publish-listing.ts",
  "src/shell/bay/lessons/BayBundleCard.tsx",
  "src/shell/bay/lessons/BayLessonCard.tsx",
  "src/shell/bay/lessons/BundleEditorPane.tsx",
  "src/shell/bay/lessons/BundlePane.tsx",
  "src/shell/bay/lessons/BuyButton.tsx",
  "src/shell/bay/lessons/ChapterList.tsx",
  "src/shell/bay/lessons/lesson-editor-model.ts",
  "src/shell/bay/lessons/LessonEditorPane.tsx",
  "src/shell/bay/lessons/lesson-format.ts",
  "src/shell/bay/lessons/LessonOutline.tsx",
  "src/shell/bay/lessons/LessonPane.tsx",
  "src/shell/bay/lessons/MyBoughtLessonsPane.tsx",
  "src/shell/bay/lessons/MyLessonsPane.tsx",
  "src/shell/bay/lessons/purchase-model.ts",
  "src/shell/bay/lessons/PurchasePanel.tsx",
  "src/shell/bay/lessons/SoldOrders.tsx",
  "src/shell/bay/lessons/use-bay-lessons.ts",
  "src/shell/bay/needs/CallHumanPane.tsx",
  "src/shell/bay/needs/DemandEditor.tsx",
  "src/shell/bay/needs/DemandPane.tsx",
  "src/shell/bay/needs/GetHelpForm.tsx",
  "src/shell/bay/needs/handoff-context.tsx",
  "src/shell/bay/needs/HelpRequestPane.tsx",
  "src/shell/bay/needs/index.ts",
  "src/shell/bay/needs/LibraryWorkPicker.tsx",
  "src/shell/bay/needs/MyHelpRequestsPane.tsx",
  "src/shell/bay/needs/MyNeedsPane.tsx",
  "src/shell/bay/needs/MyProposalsPane.tsx",
  "src/shell/bay/needs/NeedCards.tsx",
  "src/shell/bay/needs/need-categories.ts",
  "src/shell/bay/needs/need-format.ts",
  "src/shell/bay/needs/need-links.ts",
  "src/shell/bay/needs/need-ui.tsx",
  "src/shell/bay/needs/PostNeedPane.tsx",
  "src/shell/bay/needs/ProposePane.tsx",
  "src/shell/bay/orders/BayOrderCard.tsx",
  "src/shell/bay/orders/index.ts",
  "src/shell/bay/orders/my-orders-model.ts",
  "src/shell/bay/orders/MyOrdersPane.tsx",
  "src/shell/bay/orders/order-dispute.tsx",
  "src/shell/bay/orders/order-links.ts",
  "src/shell/bay/orders/order-review.tsx",
  "src/shell/bay/orders/order-store.ts",
  "src/shell/bay/orders/order-ui.tsx",
  "src/shell/bay/reviews/ItemReviews.tsx",
  "src/shell/bay/reviews/ReviewCard.tsx",
  "src/shell/bay/reviews/ReviewComposer.tsx",
  "src/shell/bay/reviews/review-model.ts",
  "src/shell/bay/reviews/ReviewPhotos.tsx",
  "src/shell/bay/reviews/use-item-reviews.ts",
  "src/shell/bay/seller/editor-model.ts",
  "src/shell/bay/seller/editor-steps.tsx",
  "src/shell/bay/seller/index.ts",
  "src/shell/bay/seller/ServiceEditorPane.tsx",
  "src/shell/bay/shell/bay-auth-host.tsx",
  "src/shell/bay/shell/BayPage.tsx",
  "src/shell/bay/supply/BayProfilePublic.tsx",
  "src/shell/bay/supply/BayServicePublic.tsx",
  "src/shell/bay/supply/CheckoutPane.tsx",
  "src/shell/bay/supply/ConsultCard.tsx",
  "src/shell/bay/supply/ConsultPane.tsx",
  "src/shell/bay/supply/format.ts",
  "src/shell/bay/supply/index.ts",
  "src/shell/bay/supply/parts.tsx",
  "src/shell/bay/supply/public-text.ts",
  "src/shell/bay/supply/public-views.ts",
  "src/shell/bay/supply/ServiceCard.tsx",
  "src/shell/bay/supply/ServicePane.tsx",
  "src/shell/bay/supply/use-bay-resource.ts",
  "src/pages/settings/sections/AutomationSettingsSection.tsx",
];

/** 句子里这些词本身不是退役的种类名：两个新种类名、服务端 / 服务器、「作品图」（图集名）。 */
const NOT_A_KIND_WORD = ["人工服务", "网站与软件服务", "服务端", "服务器", "作品图"];

/**
 * 判定为非种类、保留的句子（逐条写明理由；新增一条要有理由）：
 *  · 用户库里的作品（库条目名，全站通用）：LibraryWorkPicker、附带作品、课程章节、打开作品；
 *  · 泛指创作成果 / 原始素材 / 作品集：举报理由、服务模板里的文字；
 *  · 旧向导里「交付一件成品」（交付物形态，不是种类）。
 */
const KEEP = new Set([
  "专业服务站网页",
  "图表成品，换数据就能用。",
  "把素材剪成 15 到 60 秒成片，按约定时间交付。",
  "职业方向和作品集怎么准备。不代投、不内推。",
  "还没有章节。课程的每一节是你库里的一个作品：视频、文档、幻灯片都可以",
  "没能读到你的作品，请稍后再试。",
  "从我的库挑一个作品",
  "搜索作品标题",
  "你的库里还没有作品。",
  "没有找到匹配的作品。",
  "未命名作品",
  "附有作品",
  "附带作品",
  "一个作品",
  "先选一种：交付一件成品，还是答疑",
  "交付一件成品",
  "抄袭、盗用他人作品",
  "打开作品",
]);

function chineseLiterals(code) {
  const out = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let match;
  while ((match = re.exec(code))) {
    const text = match[1] ?? match[2] ?? match[3];
    if (/[\u4e00-\u9fff]/.test(text)) out.push(text);
  }
  return out;
}

test("边界内的可见文案不再用「服务 / 素材 / 作品 / 成品」指代一个种类", () => {
  assert.equal(BOUNDARY.length, 151);
  const offenders = [];
  const kept = new Set();
  for (const rel of BOUNDARY) {
    for (const text of chineseLiterals(stripJsComments(read(rel)))) {
      let rest = text;
      for (const token of NOT_A_KIND_WORD) rest = rest.split(token).join("");
      if (!/服务|素材|作品|成品/.test(rest)) continue;
      if (KEEP.has(text)) kept.add(text);
      else offenders.push(`${rel}: ${text}`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.deepEqual([...KEEP].filter((text) => !kept.has(text)), [], "KEEP 里有句子已经不在源码里了，请删掉");
});

test("旧的种类叫法不会回来：每个被换掉的句子都不再出现在边界源码里", () => {
  const retired = [
    "这个作品不存在或已下架",
    "上架作品",
    "登录后才能上架作品",
    "查看作品页",
    "管理作品",
    "确定取消关注这个作品？",
    "你还没有关注任何作品",
    "只有你能看到：这个作品",
    "这个作品需要",
    "服务：{title}",
    "查看服务",
    "这个服务不存在或已经下架",
    "这是你发布的服务",
    "这项服务在平台外完成",
    "服务已删除",
    "登录后发布你的服务",
    "未命名服务",
    "去发布服务",
    "数字商品",
    "新作品推荐位",
    "作品货架",
    "素材没读出来",
    "正在打开这份素材",
  ];
  const sources = BOUNDARY.map((rel) => read(rel)).join("\n");
  for (const text of retired) assert.equal(sources.includes(text), false, text);
});

// ---- 四、分表 -------------------------------------------------------------------------------

test("分表 lbp-w03：16 语齐全、占位符不丢、非中日韩不含汉字、不重定义别处已有的种类名", () => {
  const keys = Object.keys(LBP_W03_MESSAGES.zh);
  assert.ok(keys.length >= 55, `只有 ${keys.length} 条`);
  for (const key of keys) {
    assert.equal(LBP_W03_MESSAGES.zh[key], key, `中文站 key 应等于值：${key}`);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      if (locale === "zh") continue;
      const value = LBP_W03_MESSAGES[locale][key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) assert.equal(/[\u4e00-\u9fff]/.test(value), false, `${locale} 含汉字：${key}`);
    }
  }
  for (const [, zh] of KIND_TABLE) assert.equal(zh in LBP_W03_MESSAGES.zh, false, `不在本表重定义种类名「${zh}」`);
});

test("分表里的每一句都在边界源码里用着（没有死词条）", () => {
  const sources = BOUNDARY.map((rel) => stripJsComments(read(rel))).join("\n");
  const dead = Object.keys(LBP_W03_MESSAGES.zh).filter((key) => !sources.includes(key));
  assert.deepEqual(dead, []);
});
