// W08（oceanleo-bay）：「发布服务」向导。
// 覆盖：字段校验（本地先拦住）、存草稿（新建带 posted_site = 当前站）、上架前先过 ensureBayTerms("seller")
// 且返回 false 不上架、受限领域（医疗、法律、宠物医疗）的类目与领域不出现、答疑上架带 posted_site、
// 预览卡数据、载入已有服务的映射。网络、条款、站点状态全是桩。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "https://video.oceanleo.com/bay" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const httpStub = dataModule(`
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.name = "BayApiError"; this.status = status; this.code = code; }
  }
  async function reply(method, path, body, opts) {
    (globalThis.__bayCalls ||= []).push({ method, path, body, anonymous: Boolean(opts && opts.anonymous) });
    const responder = globalThis.__bayRespond;
    return responder ? responder(method, path, body) : {};
  }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const agentStub = dataModule(`
  export async function authed(path, init) {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : undefined;
    (globalThis.__bayCalls ||= []).push({ method, path, body });
    const responder = globalThis.__bayRespond;
    try {
      return { ok: true, data: responder ? await responder(method, path, body) : {} };
    } catch (error) {
      return { ok: false, status: error.status || 400, error: error.message };
    }
  }
  export async function listTasks(){ return { ok: true, data: { items: [] } }; }
`);
const categoriesStub = dataModule(`
  export async function fetchBayCategories() {
    const rows = globalThis.__bayCategories || [];
    return { items: rows, flat_items: rows, total: rows.length, site_defaults: {} };
  }
`);
const toastStub = dataModule(`
  export function useToast() {
    const push = (kind) => (title) => { (globalThis.__bayToasts ||= []).push({ kind, title }); return {}; };
    return { success: push("success"), error: push("error"), info: push("info") };
  }
`);
const settingsStub = dataModule(`
  export async function ensureBayTerms(scope) { (globalThis.__bayTerms ||= []).push(scope); return globalThis.__bayTermsAccept !== false; }
  export function openBaySettings(pane) { (globalThis.__baySettingsOpened ||= []).push(pane ?? null); }
`);
const stateStub = dataModule(`
  export function openBay(target) { (globalThis.__bayOpened ||= []).push(target); }
  export function replaceBay(target) { (globalThis.__bayReplaced ||= []).push(target); }
  export function requireBayLogin() { return globalThis.__baySignedIn !== false; }
  export function useBaySignedIn() { return globalThis.__baySignedIn !== false; }
  export function useBaySiteKey() { return globalThis.__baySiteKey || "oceanleo"; }
`);
const supplyStub = dataModule(`export function ServiceCard({ item }) { globalThis.__bayPreview = item; return null; }`);
const domainStub = dataModule(`export function portalHref(path) { return "https://oceanleo.com" + path; }`);
const reactHref = pathToFileURL(require.resolve("react")).href;
const confirmStub = dataModule(`
  import { createElement as h } from ${JSON.stringify(reactHref)};
  export function ConfirmDialog({ title, body, confirmLabel = "确认", cancelLabel = "取消", danger, onConfirm, onCancel }) {
    return h("div", { role: "dialog", "data-bay-confirm": "", "data-danger": danger ? "1" : "0" },
      h("p", { "data-bay-confirm-title": "" }, title),
      body ? h("p", { "data-bay-confirm-body": "" }, body) : null,
      h("button", { type: "button", "data-bay-confirm-cancel": "", onClick: onCancel }, cancelLabel),
      h("button", { type: "button", "data-bay-confirm-ok": "", onClick: onConfirm }, confirmLabel));
  }
`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": agentStub,
  "../../../lib/bay/categories": categoriesStub,
  "../../../ui": confirmStub,
  "../../../ui/Toast": toastStub,
  "../../../contracts/domain-family": domainStub,
  "../settings": settingsStub,
  "../shell/bay-state": stateStub,
  "../supply": supplyStub,
  "../needs/LibraryWorkPicker": dataModule(`export async function pickLibraryWork(){ return null; } export function LibraryWorkPickerHost(){ return null; }`),
};
const { ServiceEditorPane } = await import(await compileModule("src/shell/bay/seller/ServiceEditorPane.tsx", stubs));
const model = await import(await compileModule("src/shell/bay/seller/editor-model.ts", stubs));

const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

const CATEGORIES = [
  { slug: "design", name_zh: "设计与视觉", catalog_kind: "delivery", regulated_domain: "none", position: 10, published: true, required_fields: [{ key: "file_formats", label_zh: "交付格式", type: "list" }] },
  { slug: "video", name_zh: "视频与动画", catalog_kind: "delivery", regulated_domain: "none", position: 30, published: true, required_fields: [] },
  { slug: "med-docs", name_zh: "病历整理", catalog_kind: "delivery", regulated_domain: "medical", position: 5, published: true },
  { slug: "tax-basic", name_zh: "个税答疑", catalog_kind: "consult", regulated_domain: "tax", position: 1100, published: true },
  { slug: "career-plan", name_zh: "求职规划", catalog_kind: "consult", regulated_domain: "career", position: 1200, published: true },
  { slug: "med-qa", name_zh: "健康咨询", catalog_kind: "consult", regulated_domain: "medical", position: 1000, published: true },
  { slug: "law-qa", name_zh: "合同答疑", catalog_kind: "consult", regulated_domain: "legal", position: 1010, published: true },
  { slug: "pet-qa", name_zh: "宠物问诊", catalog_kind: "consult", regulated_domain: "vet", position: 1020, published: true },
];
const DOMAINS = ["medical", "legal", "tax", "vet", "career", "none"].map((key) => ({ key, name_zh: `领域-${key}`, gated: ["medical", "legal", "vet"].includes(key) }));
const MODELS = [
  { key: "fixed", name_zh: "一口价", unit: "project", settlement_rule_zh: "验收后一次结清", auto_accept_days_default: 3, requires: [] },
  { key: "free", name_zh: "免费协作", unit: "project", settlement_rule_zh: "不收钱", auto_accept_days_default: null, requires: [] },
];
const PROFILE = { user_id: "seller-1", handle: "leo", display_name: "Leo", avatar_url: null, headline: "", bio: "", categories: [], skills: [], languages: [], published: true, currency: "USD" };

function existingService(extra = {}) {
  return {
    id: "s1",
    title: "品牌 Logo 设计",
    summary: "适合刚起步的团队",
    description: "交付三版方案，含源文件与使用说明，不含印刷与商标注册服务，沟通在共享项目里。",
    category: "design",
    cover_url: "https://cdn.example.com/cover.png",
    engagement_kind: "fixed",
    price_fen: 12000,
    price_unit: "project",
    delivery_days: 3,
    delivery_mode: "on_platform",
    status: "draft",
    moderation_hidden: false,
    posted_site: "design",
    ...extra,
  };
}

function reset({ service = existingService(), profile = PROFILE } = {}) {
  globalThis.__bayCalls = [];
  globalThis.__bayToasts = [];
  globalThis.__bayTerms = [];
  globalThis.__bayTermsAccept = true;
  globalThis.__bayOpened = [];
  globalThis.__bayReplaced = [];
  globalThis.__baySettingsOpened = [];
  globalThis.__baySignedIn = true;
  globalThis.__baySiteKey = "video";
  globalThis.__bayPreview = null;
  globalThis.__bayCategories = CATEGORIES;
  globalThis.__bayRespond = (method, path, body) => {
    if (method === "GET" && path === "/v1/talent/me") return { profile };
    if (method === "GET" && path === "/v1/talent/pricing-models") return { items: MODELS };
    if (method === "GET" && path === "/v1/moderation/my-cases") return { cases: [] };
    if (method === "GET" && path === "/v1/talent/domains") return { domains: DOMAINS };
    if (method === "GET" && path.startsWith("/v1/talent/domains/")) return { ask_placeholder: "描述你的情况", forbidden_hint: "不代替执业意见", answer_disclaimer: "仅供参考" };
    if (method === "GET" && path === "/v1/talent/me/services") return { items: service ? [service] : [] };
    if (method === "GET" && path === "/v1/talent/me/services/s1/tiers") {
      return { items: [{ id: "t1", tier: "basic", title: "基础版", description: "一版", price_fen: 12000, delivery_days: 3, revisions: 1, features: ["源文件"], enabled: true }] };
    }
    if (method === "GET" && path === "/v1/talent/me/services/s1/addons") return { items: [] };
    if (method === "GET" && path === "/v1/talent/me/services/s1/faq") return { items: [{ id: "f1", question: "开始前需要我提供什么？", answer: "品牌名与参考图", position: 0 }] };
    if (method === "GET" && path === "/v1/talent/me/services/s1/media") {
      return { items: [{ id: "m1", kind: "image", url: "https://cdn.example.com/cover.png", poster_url: null, caption: "", position: 0 }] };
    }
    if (method === "GET" && path === "/v1/talent/me/services/s1/pricing") {
      return { service_id: "s1", category: "design", pricing_model: MODELS[0], required_fields: [{ key: "file_formats", label_zh: "交付格式", type: "list" }], values: { file_formats: ["PNG", "AI"] }, missing: [] };
    }
    if (method === "POST" && path === "/v1/talent/me/services") return { service: { id: "s-new", status: "draft" } };
    if (method === "PUT" && path.startsWith("/v1/talent/me/services/") && path.endsWith("/pricing")) {
      return { service_id: "s1", category: "design", pricing_model: MODELS[0], required_fields: [{ key: "file_formats", label_zh: "交付格式", type: "list" }], values: body.fields, missing: [] };
    }
    if (method === "PUT" && path.startsWith("/v1/talent/me/services/")) return path.endsWith("/tiers") ? { items: body.tiers } : { service: { ...existingService(), ...body, id: "s1" } };
    if (method === "POST" && path === "/v1/talent/me/services/s1/publish") return { service: { ...existingService(), status: "published" }, moderation_hidden: false };
    if (method === "POST" && path === "/v1/talent/me/services/s1/unpublish") return { service: { ...existingService(), status: "paused" } };
    if (method === "POST" && path === "/v1/talent/consults") return { consult: { id: "c-new", ...body } };
    return {};
  };
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await act(async () => {});
};

async function mount(target) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(ServiceEditorPane, { target, layout: "docked", siteKey: globalThis.__baySiteKey })));
  await settle();
  const find = (selector) => {
    const node = host.querySelector(selector);
    assert.ok(node, `找不到 ${selector}`);
    return node;
  };
  const setValue = async (selector, value) => {
    const node = find(selector);
    const proto = node.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : node.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
    await act(async () => node.dispatchEvent(new window.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })));
  };
  const click = async (selector) => {
    const node = find(selector);
    await act(async () => node.click());
    await settle();
  };
  return { host, find, setValue, click, unmount: () => act(() => root.unmount()) };
}

const calls = (method, path) => globalThis.__bayCalls.filter((call) => call.method === method && (path === undefined || call.path === path));

test("未登录：只给登录入口，不取数", async () => {
  reset();
  globalThis.__baySignedIn = false;
  const view = await mount({ kind: "service-editor" });
  assert.match(view.host.textContent, /登录后发布你的服务/);
  assert.deepEqual(globalThis.__bayCalls, []);
  await view.unmount();
});

// ---- 纯逻辑 ------------------------------------------------------------------------

function filledDraft(extra = {}) {
  const draft = model.emptyDraft(tt);
  return {
    ...draft,
    serviceId: "s1",
    catalogKind: "delivery",
    title: "品牌 Logo 设计",
    category: "design",
    pricingModel: "fixed",
    fieldValues: { file_formats: ["PNG"] },
    description: "x".repeat(40),
    coverUrl: "https://cdn.example.com/a.png",
    tiers: draft.tiers.map((tier, index) => (index === 0 ? { ...tier, price_fen: 12000 } : tier)),
    ...extra,
  };
}

const CTX = { profile: PROFILE, categories: CATEGORIES, specs: [{ key: "file_formats", label_zh: "交付格式", type: "list" }], domainKeys: ["tax", "career"] };

test("字段校验：每一步缺什么就拦在本地", () => {
  const blocked = (step, extra, ctx = CTX) => model.blockedReason(step, filledDraft(extra), ctx)?.message ?? null;
  assert.equal(blocked("kind", { catalogKind: "" }), "先选一种：交付一件成品，还是答疑");
  assert.equal(blocked("basics", { title: "  " }), "请先填写标题");
  assert.equal(blocked("basics", { category: "" }), "请选择类目");
  assert.equal(blocked("basics", {}, { ...CTX, profile: null }), "先建卖家资料，才能保存服务");
  assert.equal(blocked("basics", {}), null);
  assert.equal(blocked("model", { pricingModel: "" }), "先选一种计费方式");
  const missing = model.blockedReason("fields", filledDraft({ fieldValues: { file_formats: [" "] } }), CTX);
  assert.deepEqual(missing, { message: "还差这几项没填：{items}", vars: { items: "交付格式" } });
  assert.equal(blocked("fields", {}), null);
  const draft = filledDraft();
  const withTiers = (prices, enabled = [true, true, true]) => ({ tiers: draft.tiers.map((tier, i) => ({ ...tier, price_fen: prices[i], enabled: enabled[i] })) });
  assert.equal(blocked("pricing", withTiers([0, 0, 0], [true, false, false])), "每档价格都要大于 0");
  assert.equal(blocked("pricing", { ...withTiers([100, 0, 0], [true, false, false]), pricingModel: "free" }), "免费协作的每档价格都要是 0");
  assert.equal(blocked("pricing", withTiers([300, 200, 400])), "启用的价格档要按基础、标准、高级从低到高");
  assert.equal(blocked("pricing", withTiers([0, 0, 0], [false, false, false])), "至少启用一档价格");
  assert.equal(blocked("pricing", withTiers([100, 200, 300])), null);
  assert.equal(blocked("media", { media: [{ key: "m", kind: "image", url: "javascript:alert(1)", poster_url: "", caption: "" }] }), "作品图地址要以 https:// 开头");
  const consult = { catalogKind: "consult", domain: "tax", category: "tax-basic" };
  assert.equal(blocked("domain", { ...consult, domain: "medical" }), "先选一个领域", "受限领域选不上");
  assert.equal(blocked("domain", { ...consult, category: "" }), "再选一个这个领域下的类目");
  assert.equal(blocked("pricing", { ...consult, ...withTiers([0, 0, 0]) }), "答疑价格要大于 0");
  assert.equal(blocked("pricing", { ...consult, consultUnit: "hour", consultMinutes: null }), "按小时答疑要写明一小时按多少分钟计");
});

test("上架检查清单：逐项对应网关闸门；不再拦「先公开卖家资料」", () => {
  const checks = model.publishChecks(filledDraft(), CTX);
  assert.deepEqual(checks.filter((check) => !check.done).map((check) => check.key), []);
  assert.equal(model.readyToPublish(checks), true);
  const unpublished = model.publishChecks(filledDraft(), { ...CTX, profile: { ...PROFILE, published: false } });
  assert.equal(model.readyToPublish(unpublished), true);
  const thin = model.publishChecks(filledDraft({ description: "太短", coverUrl: "", category: "med-docs" }), CTX);
  assert.deepEqual(
    thin.filter((check) => !check.done).map((check) => check.key),
    ["product:分类", "product:至少一张预览图"],
  );
  assert.equal(model.readyToPublish([]), false);
});

test("载荷：整份覆盖带全量与当前状态；新建一律草稿；封面只认 http(s)", () => {
  const input = model.serviceInput(filledDraft({ status: "published", title: `  ${"长".repeat(130)}  `, coverUrl: "javascript:alert(1)" }), MODELS[0]);
  assert.equal(input.status, "published");
  assert.equal(input.title.length, 120);
  assert.equal(input.cover_url, null);
  assert.equal(input.price_fen, 12000);
  assert.equal(input.price_unit, "project");
  assert.equal(input.engagement_kind, "fixed");
  assert.equal(input.catalog_kind, "delivery");
  assert.equal(input.regulated_domain, "none");
  assert.equal("posted_site" in input, false);
  assert.equal(model.serviceInput(filledDraft({ serviceId: "", status: "published" })).status, "draft");

  assert.deepEqual(model.pricingInput(filledDraft({ fieldValues: { file_formats: [" PNG ", ""], stray: "x", empty: "" } }), CTX.specs), {
    pricing_model: "fixed",
    fields: { file_formats: ["PNG"] },
  });
  assert.equal(model.pricingInput(filledDraft({ pricingModel: "" }), CTX.specs), undefined);

  const consult = model.consultInput(filledDraft({ catalogKind: "consult", domain: "tax", category: "tax-basic", consultUnit: "hour", consultMinutes: 60, consultRounds: 3 }), "draft");
  assert.equal(consult.minutes, 60);
  assert.equal(consult.rounds, null);
  assert.equal(consult.price_unit, "hour");
});

test("常见问题：「开始前需要我提供什么」放第一条；清空就删掉；空行不存", () => {
  const draft = filledDraft({
    buyerInputs: "  品牌名  ",
    buyerInputsFaqId: "f0",
    faqs: [
      { key: "a", id: "f1", question: "能开发票吗", answer: "可以" },
      { key: "b", id: "f2", question: " ", answer: "" },
      { key: "c", question: "", answer: "" },
    ],
  });
  const saved = model.faqRowsForSave(draft, "开始前需要我提供什么？");
  assert.deepEqual(saved.rows.map((row) => [row.id, row.question]), [["f0", "开始前需要我提供什么？"], ["f1", "能开发票吗"]]);
  assert.equal(saved.rows[0].answer, "品牌名");
  assert.deepEqual(saved.deleted, ["f2"]);
  assert.deepEqual(model.faqRowsForSave({ ...draft, buyerInputs: " ", faqs: [] }, "开始前需要我提供什么？").deleted, ["f0"]);
});

test("载入已有服务：档位、常见问题里的「需要买家提供什么」、作品图顺序都映射回来", () => {
  const draft = model.draftFromLoaded(
    {
      service: existingService({ status: "paused", moderation_hidden: true }),
      tiers: [{ tier: "premium", title: "高级", description: "", price_fen: 50000, delivery_days: 7, revisions: -1, features: [], enabled: true }],
      addons: [{ id: "a1", title: "加急", description: "", price_fen: 2000, extra_days: 0, position: 0, enabled: true }],
      faq: [
        { id: "f2", question: "能开发票吗", answer: "可以", position: 1 },
        { id: "f1", question: "开始前需要我提供什么？", answer: "品牌名", position: 0 },
      ],
      media: [
        { id: "m2", kind: "image", url: "https://cdn.example.com/2.png", poster_url: null, caption: "", position: 2 },
        { id: "m1", kind: "image", url: "https://cdn.example.com/1.png", poster_url: null, caption: "", position: 1 },
      ],
      pricing: { service_id: "s1", category: "design", pricing_model: MODELS[0], required_fields: [], values: { file_formats: ["PNG"] }, missing: [] },
    },
    tt,
  );
  assert.equal(draft.status, "paused");
  assert.equal(draft.moderationHidden, true);
  assert.equal(draft.catalogKind, "delivery");
  assert.equal(draft.buyerInputs, "品牌名");
  assert.equal(draft.buyerInputsFaqId, "f1");
  assert.deepEqual(draft.faqs.map((faq) => faq.id), ["f2"]);
  assert.deepEqual(draft.media.map((item) => item.id), ["m1", "m2"]);
  assert.deepEqual(draft.tiers.map((tier) => [tier.tier, tier.enabled, tier.price_fen]), [["basic", true, 0], ["standard", false, 0], ["premium", true, 50000]]);
  assert.equal(draft.pricingModel, "fixed");
  assert.deepEqual(draft.fieldValues, { file_formats: ["PNG"] });
});

test("预览卡：买家在信息流里看到的价格区间、币种、封面；地址只认 http(s)", () => {
  const draft = filledDraft({
    coverUrl: "",
    media: [
      { key: "x", kind: "image", url: "javascript:alert(1)", poster_url: "", caption: "" },
      { key: "y", kind: "image", url: "https://cdn.example.com/y.png", poster_url: "", caption: "" },
    ],
  });
  draft.tiers = draft.tiers.map((tier, index) => ({ ...tier, enabled: index < 2, price_fen: [12000, 30000, 90000][index] }));
  const item = model.previewFeedItem(draft, { profile: PROFILE, siteKey: "video", currency: "usd", model: MODELS[0] });
  assert.equal(item.kind, "service");
  assert.deepEqual(item.price, { min_fen: 12000, max_fen: 30000, unit: "project", currency: "USD" });
  assert.equal(item.cover_url, "https://cdn.example.com/y.png");
  assert.equal(item.posted_site, "video");
  assert.equal(item.author.handle, "leo");
  assert.equal(model.previewFeedItem({ ...draft, catalogKind: "consult", consultUnit: "hour" }, { profile: null, siteKey: "" }).kind, "consult");
  assert.equal(model.safeHttpUrl("data:image/png;base64,AAAA"), null);
  assert.equal(model.safeHttpUrl(" https://a.example/x.png "), "https://a.example/x.png");
  assert.equal(model.moneyText(1200, "usd"), "$12");
  assert.equal(model.moneyText(128050, "CNY"), "¥1,280.50");
  assert.equal(model.moneyText(1250, "XYZ"), "12.50 XYZ");
  assert.equal(model.normalizeCurrency(undefined), "USD");
  assert.equal(model.toFen("12.345"), 1235);
  assert.equal(model.toFen("-3"), 0);
});

test("源码里不再有 window.confirm", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/shell/bay/seller/ServiceEditorPane.tsx", import.meta.url)), "utf8");
  assert.equal(source.includes("window.confirm"), false);
  assert.equal(source.includes("window.alert"), false);
  assert.equal(source.includes("window.prompt"), false);
  assert.match(source, /<ConfirmDialog/);
});

test("删除路径：点删除后出现确认弹窗、点取消没有发出 DELETE、点确认才发", async () => {
  reset();
  const view = await mount({ kind: "service-editor", serviceId: "s1" });
  assert.equal(view.host.querySelector("[data-bay-confirm]"), null);
  await view.click('[data-bay-action="remove"]');
  assert.match(view.find("[data-bay-confirm-title]").textContent, /确定删除「品牌 Logo 设计」/);
  assert.equal(view.find("[data-bay-confirm]").getAttribute("data-danger"), "1");
  await view.click("[data-bay-confirm-cancel]");
  assert.equal(view.host.querySelector("[data-bay-confirm]"), null);
  assert.deepEqual(calls("DELETE"), [], "取消删除：不发请求");
  assert.equal(view.find("[data-bay-editor-status]").getAttribute("data-bay-editor-status"), "draft");

  await view.click('[data-bay-action="remove"]');
  await view.click("[data-bay-confirm-ok]");
  assert.deepEqual(
    calls("DELETE").map((call) => call.path),
    ["/v1/talent/me/services/s1"],
  );
  assert.equal(globalThis.__bayToasts.at(-1).title, "服务已删除");
  assert.deepEqual(globalThis.__bayOpened.at(-1), { kind: "mine", tab: "published" });
  await view.unmount();
});

test("交付约定：交期、改稿次数为空时用第一档的数字补上，填过的不动", () => {
  const specs = [{ key: "delivery_days", label_zh: "交付天数", type: "int" }, { key: "revisions", label_zh: "修改次数", type: "int" }, { key: "file_formats", label_zh: "交付格式", type: "list" }];
  const tiers = model.defaultTiers(tt);
  assert.deepEqual(model.prefillFieldsFromTiers(specs, {}, tiers), { delivery_days: 3, revisions: 1 });
  assert.deepEqual(model.prefillFieldsFromTiers(specs, { delivery_days: 9 }, tiers), { delivery_days: 9, revisions: 1 });
  assert.deepEqual(model.stepsFor(""), ["kind"]);
  assert.equal(model.stepsFor("consult").includes("media"), false, "答疑没有作品图、加购");
  assert.equal(model.isLocalStep("pricing", "consult"), true);
  assert.equal(model.isLocalStep("pricing", "delivery"), false);
});
