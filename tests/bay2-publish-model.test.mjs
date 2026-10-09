// W4 / W2B：发布表单纯逻辑。三种种类的 sectionMissing、素材也要类目、
// 服务不要求 30 字、提交载荷带 listing_kind / license / digital_work。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const stubs = {
  "../../../lib/bay/http": dataModule(`
    export class BayApiError extends Error {}
    export const bayGet = async () => ({});
    export const bayPost = async () => ({});
    export const bayPatch = async () => ({});
    export const bayDelete = async () => ({});
  `),
  "../../../lib/agent": dataModule(`export async function authed(){ return { ok: true, data: {} }; }`),
};
const model = await import(await compileModule("src/shell/bay/seller/editor-model.ts", stubs));

const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

const CATEGORIES = [
  { slug: "design", name_zh: "设计与视觉", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true, required_fields: [{ key: "file_formats", label_zh: "交付格式", type: "list" }] },
  { slug: "tax-basic", name_zh: "个税答疑", catalog_kind: "consult", regulated_domain: "tax", position: 1100, published: true },
];
const PROFILE = { user_id: "seller-1", handle: "leo", display_name: "Leo", avatar_url: null, headline: "", bio: "", categories: [], skills: [], languages: [], published: false, currency: "USD" };
const CTX = { profile: PROFILE, categories: CATEGORIES, specs: [{ key: "file_formats", label_zh: "交付格式", type: "list" }], domainKeys: ["tax", "career"] };
const CTX_BARE = { profile: null, categories: CATEGORIES, specs: [], domainKeys: ["tax", "career"] };

function digitalDraft(extra = {}) {
  const draft = model.emptyDraft(tt);
  return {
    ...draft,
    catalogKind: "delivery",
    listingKind: "digital",
    title: "一套图标",
    category: "design",
    coverUrl: "https://cdn.example.com/a.png",
    digitalWork: { id: "task-1", title: "图标包" },
    license: "personal",
    ...extra,
  };
}

function serviceDraft(extra = {}) {
  const draft = model.emptyDraft(tt);
  return {
    ...draft,
    catalogKind: "delivery",
    listingKind: "service",
    title: "品牌 Logo 设计",
    category: "design",
    coverUrl: "https://cdn.example.com/a.png",
    description: "短",
    pricingModel: "fixed",
    fieldValues: { file_formats: ["PNG"] },
    tiers: draft.tiers.map((tier, index) => (index === 0 ? { ...tier, price_fen: 12000, delivery_days: 3 } : tier)),
    ...extra,
  };
}

function consultDraft(extra = {}) {
  const draft = model.emptyDraft(tt);
  return {
    ...draft,
    catalogKind: "consult",
    listingKind: "service",
    title: "个税答疑",
    domain: "tax",
    category: "tax-basic",
    scopeNote: "只答汇算清缴",
    consultUnit: "session",
    consultRounds: 3,
    responseWindow: "24 小时内",
    tiers: draft.tiers.map((tier, index) => (index === 0 ? { ...tier, price_fen: 4900 } : tier)),
    ...extra,
  };
}

test("数字商品空草稿：差标题、分类、预览图、要卖的作品、授权范围；价格块不差项", () => {
  const draft = model.emptyDraft(tt);
  draft.catalogKind = "delivery";
  draft.listingKind = "digital";
  const missing = model.sectionMissing(draft, CTX_BARE);
  assert.deepEqual(missing.product, ["标题", "分类", "至少一张预览图", "要卖的作品"]);
  assert.deepEqual(missing.price, []);
  assert.deepEqual(missing.terms, ["授权范围"]);
});

test("数字商品填齐后三块都是空数组", () => {
  assert.deepEqual(model.sectionMissing(digitalDraft(), CTX), { product: [], price: [], terms: [] });
});

test("素材没类目时报分类；不要求详情、档位", () => {
  const missing = model.sectionMissing(digitalDraft({ category: "", description: "", simplePrice: true }), CTX);
  assert.equal(missing.product.includes("分类"), true);
  assert.equal(missing.product.some((item) => item.includes("详情")), false);
  assert.equal(missing.price.some((item) => item.includes("档")), false);
  assert.equal(missing.price.includes("计费方式"), false);
});

test("数字商品价格为 0 可以发布；封面或作品图任一即可", () => {
  const byCover = digitalDraft({ tiers: model.emptyDraft(tt).tiers.map((tier, i) => (i === 0 ? { ...tier, price_fen: 0 } : tier)) });
  assert.deepEqual(model.sectionMissing(byCover, CTX_BARE).price, []);
  const byMedia = digitalDraft({
    coverUrl: "",
    media: [{ key: "m", kind: "image", url: "https://cdn.example.com/b.png", poster_url: "", caption: "" }],
  });
  assert.deepEqual(model.sectionMissing(byMedia, CTX_BARE).product, []);
});

test("服务空草稿：差标题、分类、预览图；默认交期已有所以价格块不差交期", () => {
  const draft = model.emptyDraft(tt);
  draft.catalogKind = "delivery";
  draft.listingKind = "service";
  const missing = model.sectionMissing(draft, CTX_BARE);
  assert.deepEqual(missing.product, ["标题", "分类", "至少一张预览图"]);
  assert.deepEqual(missing.price, []);
  assert.deepEqual(missing.terms, []);
});

test("服务填齐后三块都是空数组", () => {
  assert.deepEqual(model.sectionMissing(serviceDraft(), CTX), { product: [], price: [], terms: [] });
});

test("服务不要求 30 字详情；类目必填项在交付条款", () => {
  const short = serviceDraft({ description: "短", fieldValues: {} });
  const missing = model.sectionMissing(short, CTX);
  assert.equal(missing.product.some((item) => item.includes("30") || item.includes("详情")), false);
  assert.deepEqual(missing.terms, ["交付格式"]);
});

test("服务简单价缺交付天数时记在价格块", () => {
  const draft = serviceDraft({
    simplePrice: true,
    tiers: model.emptyDraft(tt).tiers.map((tier, i) => (i === 0 ? { ...tier, price_fen: 100, delivery_days: null } : tier)),
  });
  assert.deepEqual(model.sectionMissing(draft, CTX).price, ["交付天数"]);
});

test("答疑空草稿：差领域、类目、标题、价格、能答范围、轮次、响应时间", () => {
  const draft = model.emptyDraft(tt);
  draft.catalogKind = "consult";
  const missing = model.sectionMissing(draft, CTX_BARE);
  assert.deepEqual(missing.product, ["领域", "领域下的类目", "标题"]);
  assert.deepEqual(missing.price, ["价格"]);
  assert.deepEqual(missing.terms, ["能答范围", "单次轮次", "最长响应时间"]);
});

test("答疑填齐后三块都是空数组", () => {
  assert.deepEqual(model.sectionMissing(consultDraft(), CTX_BARE), { product: [], price: [], terms: [] });
});

test("答疑官方账号不要求价格大于 0", () => {
  const draft = consultDraft({ official: true, tiers: model.emptyDraft(tt).tiers });
  assert.deepEqual(model.sectionMissing(draft, CTX_BARE).price, []);
});

test("提交载荷带 listing_kind、license、digital_work", () => {
  const digital = model.serviceInput(digitalDraft({ license: "commercial" }));
  assert.equal(digital.listing_kind, "digital");
  assert.equal(digital.license, "commercial");
  assert.deepEqual(digital.digital_work, { kind: "task", id: "task-1" });
  assert.equal(digital.category, "design");
  const service = model.serviceInput(serviceDraft());
  assert.equal(service.listing_kind, "service");
  assert.equal(service.license, null);
  assert.equal(service.digital_work, null);
  assert.equal(service.category, "design");
});

test("listingPayload 与 publishKindOf 对应三种", () => {
  assert.equal(model.publishKindOf(digitalDraft()), "digital");
  assert.equal(model.publishKindOf(serviceDraft()), "service");
  assert.equal(model.publishKindOf(consultDraft()), "consult");
  assert.equal(model.publishKindOf(model.emptyDraft(tt)), "");
  assert.deepEqual(model.listingPayload(digitalDraft()), { listing_kind: "digital", license: "personal", digital_work: { kind: "task", id: "task-1" } });
});

test("publishChecks 基于 sectionMissing，不再拦卖家资料；填齐后可以发布", () => {
  const unpublished = { ...CTX, profile: { ...PROFILE, published: false } };
  const checks = model.publishChecks(serviceDraft({ description: "短" }), unpublished);
  assert.equal(checks.some((check) => check.key === "profile"), false);
  assert.equal(model.readyToPublish(model.publishChecks(serviceDraft(), CTX)), true);
  assert.deepEqual(model.publishChecks(model.emptyDraft(tt), CTX_BARE), []);
  assert.equal(model.readyToPublish(model.publishChecks(model.emptyDraft(tt), CTX_BARE)), false);
});

test("载入已有数字商品：listingKind、license、digitalWork、official、simplePrice", () => {
  const draft = model.draftFromLoaded(
    {
      service: {
        id: "s1",
        title: "图标",
        summary: "",
        category: "design",
        cover_url: "https://cdn.example.com/a.png",
        price_fen: 0,
        delivery_days: null,
        status: "draft",
        listing_kind: "digital",
        license: "commercial",
        official: true,
        digital_work: { kind: "task", id: "task-9", title: "图标包" },
      },
      tiers: [{ tier: "basic", title: "基础版", description: "", price_fen: 0, delivery_days: null, revisions: 1, features: [], enabled: true }],
      addons: [],
      faq: [],
      media: [],
      pricing: null,
    },
    tt,
  );
  assert.equal(draft.listingKind, "digital");
  assert.equal(draft.category, "design");
  assert.equal(draft.license, "commercial");
  assert.deepEqual(draft.digitalWork, { id: "task-9", title: "图标包" });
  assert.equal(draft.official, true);
  assert.equal(draft.simplePrice, true);
  assert.equal(model.resolvedPriceFen(draft), 0);
});
