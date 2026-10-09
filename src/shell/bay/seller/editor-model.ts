// 服务向导的纯逻辑（移植自 talent `components/seller/ServiceWizard.tsx`）：步骤、校验、载荷、载入映射、预览卡。
// 不碰 React 与网络，测试直接调用。界面文案在这里只写中文原文，由调用方 tt() 翻译。

import type { BayFeedItem } from "../../../lib/bay/types";
import {
  isSellerRestrictedDomain,
  type BayCatalogKind,
  type BayConsultInput,
  type BayConsultUnit,
  type BayDeliveryMode,
  type BayFieldSpec,
  type BayFieldValue,
  type BayFieldValues,
  type BayLicense,
  type BayListingKind,
  type BayOwnService,
  type BayPricingInput,
  type BayPricingModel,
  type BaySellerCategory,
  type BaySellerPriceUnit,
  type BaySellerProfile,
  type BayServiceAddonRow,
  type BayServiceFaqRow,
  type BayServiceInput,
  type BayServiceMediaKind,
  type BayServiceMediaRow,
  type BayServicePricing,
  type BayServiceStatus,
  type BayServiceTierRow,
  type BayTierName,
} from "../../../lib/bay/seller";

export type Translate = (zh: string, vars?: Record<string, string | number>) => string;

export type EditorStep =
  | "kind"
  | "domain"
  | "prompts"
  | "basics"
  | "model"
  | "fields"
  | "pricing"
  | "addons"
  | "details"
  | "faq"
  | "media"
  | "publish";

export const DELIVERY_STEPS: EditorStep[] = ["kind", "basics", "model", "fields", "pricing", "addons", "details", "faq", "media", "publish"];

/** 答疑没有计费方式、加购、图集：按次或按小时一个价，对话本身就是交付物。 */
export const CONSULT_STEPS: EditorStep[] = ["kind", "domain", "prompts", "basics", "pricing", "publish"];

export const STEP_LABELS: Record<EditorStep, string> = {
  kind: "做哪种",
  domain: "选领域",
  prompts: "提问方式",
  basics: "它是什么",
  model: "计费方式",
  fields: "交付约定",
  pricing: "价格与交期",
  addons: "加购项",
  details: "详情",
  faq: "常见问题",
  media: "作品图",
  publish: "预览与上架",
};

export const MIN_DESCRIPTION = 30;
export const TITLE_MAX = 120;
export const SUMMARY_MAX = 240;

export type PublishKind = "digital" | "service" | "consult";
export type PublishSection = "product" | "price" | "terms";
export const PUBLISH_SECTIONS: PublishSection[] = ["product", "price", "terms"];
export const SECTION_LABELS: Record<PublishSection, string> = {
  product: "产品信息",
  price: "价格",
  terms: "交付条款",
};
export const PUBLISH_KIND_LABELS: Record<PublishKind, string> = {
  digital: "素材",
  service: "服务",
  consult: "答疑",
};

export interface DraftTier {
  tier: BayTierName;
  title: string;
  description: string;
  price_fen: number;
  delivery_days: number | null;
  revisions: number;
  features: string[];
  enabled: boolean;
}

export interface DraftAddon {
  key: string;
  id?: string;
  title: string;
  description: string;
  price_fen: number;
  extra_days: number;
  enabled: boolean;
}

export interface DraftFaq {
  key: string;
  id?: string;
  question: string;
  answer: string;
}

export interface DraftMedia {
  key: string;
  id?: string;
  kind: BayServiceMediaKind;
  url: string;
  poster_url: string;
  caption: string;
}

export interface EditorDraft {
  serviceId: string;
  status: BayServiceStatus;
  moderationHidden: boolean;
  catalogKind: BayCatalogKind | "";
  title: string;
  category: string;
  summary: string;
  deliveryMode: BayDeliveryMode;
  description: string;
  coverUrl: string;
  /** 开始前需要买家提供什么（存成常见问题里的第一条）。 */
  buyerInputs: string;
  buyerInputsFaqId: string;
  pricingModel: string;
  fieldValues: BayFieldValues;
  tiers: DraftTier[];
  addons: DraftAddon[];
  faqs: DraftFaq[];
  media: DraftMedia[];
  deletedAddonIds: string[];
  deletedFaqIds: string[];
  deletedMediaIds: string[];
  domain: string;
  consultUnit: BayConsultUnit;
  consultRounds: number | null;
  consultMinutes: number | null;
  scopeNote: string;
  responseWindow: string;
  listingKind: BayListingKind;
  license: BayLicense | "";
  digitalWork: { id: string; title: string } | null;
  simplePrice: boolean;
  official: boolean;
}

let keySeq = 0;
export function clientKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${keySeq}`;
}

export function defaultTiers(tt: Translate): DraftTier[] {
  return [
    { tier: "basic", title: tt("基础版"), description: tt("完成核心交付"), price_fen: 0, delivery_days: 3, revisions: 1, features: [], enabled: true },
    { tier: "standard", title: tt("标准版"), description: tt("更完整的交付范围"), price_fen: 0, delivery_days: 5, revisions: 2, features: [], enabled: false },
    { tier: "premium", title: tt("高级版"), description: tt("完整方案与优先协作"), price_fen: 0, delivery_days: 7, revisions: 3, features: [], enabled: false },
  ];
}

export function emptyDraft(tt: Translate): EditorDraft {
  return {
    serviceId: "",
    status: "draft",
    moderationHidden: false,
    catalogKind: "",
    title: "",
    category: "",
    summary: "",
    deliveryMode: "on_platform",
    description: "",
    coverUrl: "",
    buyerInputs: "",
    buyerInputsFaqId: "",
    pricingModel: "",
    fieldValues: {},
    tiers: defaultTiers(tt),
    addons: [],
    faqs: [],
    media: [],
    deletedAddonIds: [],
    deletedFaqIds: [],
    deletedMediaIds: [],
    domain: "",
    consultUnit: "session",
    consultRounds: null,
    consultMinutes: null,
    scopeNote: "",
    responseWindow: "",
    listingKind: "service",
    license: "",
    digitalWork: null,
    simplePrice: true,
    official: false,
  };
}

export function stepsFor(kind: BayCatalogKind | ""): EditorStep[] {
  if (kind === "consult") return CONSULT_STEPS;
  if (kind === "delivery") return DELIVERY_STEPS;
  return ["kind"];
}

/** 不打后端的步骤：选形态、选领域、看提问方式；答疑全程本地，最后一步一次发布。 */
export function isLocalStep(step: EditorStep, kind: BayCatalogKind | ""): boolean {
  if (kind === "consult") return step !== "publish";
  return step === "kind" || step === "domain" || step === "prompts";
}

// ---- 金额与字段 -------------------------------------------------------------------

/** Bay 不在境内站出现，账本币种缺省是美元；付款配置或服务行给了币种就用它。 */
export const DEFAULT_CURRENCY = "USD";

const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", RMB: "¥", USD: "$", EUR: "€", GBP: "£", JPY: "¥", HKD: "HK$" };

export function normalizeCurrency(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(code) ? code : DEFAULT_CURRENCY;
}

/** 金额（最小单位）→ 「$12」「¥1,280.50」；认不出的币种写成「12.50 XYZ」。 */
export function moneyText(minor: number, currency: string): string {
  const code = normalizeCurrency(currency);
  const value = (Number.isFinite(minor) ? minor : 0) / 100;
  const number = Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = CURRENCY_SYMBOL[code];
  return symbol ? `${symbol}${number}` : `${number} ${code}`;
}

/** 输入框里显示的金额（主单位）；0 显示为空，方便直接输入。 */
export function yuanText(fen: number): string {
  return fen ? String(fen / 100) : "";
}

export function toFen(value: string): number {
  const amount = Number(String(value).replace(/[,\s]/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? Math.min(Math.round(amount * 100), 1_000_000_000) : 0;
}

export function fieldFilled(value: BayFieldValue | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => String(item).trim().length > 0);
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function cleanFieldValue(value: BayFieldValue): BayFieldValue {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.trim();
  return value;
}

export function missingFields(specs: BayFieldSpec[], values: BayFieldValues): BayFieldSpec[] {
  return specs.filter((spec) => !fieldFilled(values[spec.key]));
}

/** 交期、改稿次数这两项约定在价格档里已经填过：约定为空时用第一档的数字补上，卖家仍可改。 */
export function prefillFieldsFromTiers(specs: BayFieldSpec[], values: BayFieldValues, tiers: DraftTier[]): BayFieldValues {
  const first = tiers.find((tier) => tier.enabled) || tiers[0];
  if (!first) return values;
  const next: BayFieldValues = { ...values };
  for (const spec of specs) {
    if (fieldFilled(next[spec.key])) continue;
    if (spec.key === "delivery_days" && first.delivery_days) next[spec.key] = first.delivery_days;
    if (spec.key === "revisions" && first.revisions >= 0) next[spec.key] = first.revisions;
  }
  return next;
}

/** 类目接口给的品类字段（草稿还没存计费方式时用）。 */
export function categorySpecs(category: BaySellerCategory | undefined): BayFieldSpec[] {
  const specs = Array.isArray(category?.required_fields) ? category!.required_fields! : [];
  return specs.filter((spec) => spec && typeof spec.key === "string");
}

/**
 * 这项服务要写的交付约定：网关 `/pricing` 给的那份（品类字段 + 计费方式要求的字段）与当前类目、
 * 计费方式对得上就用它；对不上（刚换了类目或计费方式、还没存）先用类目字段，存过一次再以网关为准。
 * 不截断：发布闸门逐项核对全部字段。
 */
export function specsFor(
  draft: Pick<EditorDraft, "category" | "pricingModel">,
  pricing: BayServicePricing | null,
  category: BaySellerCategory | undefined,
): BayFieldSpec[] {
  if (pricing && pricing.category === draft.category && (pricing.pricing_model?.key || "") === draft.pricingModel && Array.isArray(pricing.required_fields)) {
    return pricing.required_fields.filter((spec) => spec && typeof spec.key === "string");
  }
  return categorySpecs(category);
}

/** 计费方式与交付约定的载荷：只发规格里有、且已经填了的字段（网关对未知字段与空值都会报错）。 */
export function pricingInput(draft: EditorDraft, specs: BayFieldSpec[]): BayPricingInput | undefined {
  if (!draft.pricingModel) return undefined;
  const fields: BayFieldValues = {};
  for (const spec of specs) {
    const value = draft.fieldValues[spec.key];
    if (fieldFilled(value)) fields[spec.key] = cleanFieldValue(value as BayFieldValue);
  }
  return { pricing_model: draft.pricingModel, fields };
}

// ---- 价格档 -----------------------------------------------------------------------

export function enabledTiers(draft: Pick<EditorDraft, "tiers">): DraftTier[] {
  return draft.tiers.filter((tier) => tier.enabled);
}

export function pricesLegal(draft: Pick<EditorDraft, "tiers" | "pricingModel" | "catalogKind">): boolean {
  const tiers = enabledTiers(draft);
  if (!tiers.length) return false;
  if (draft.catalogKind === "delivery" && draft.pricingModel === "free") return tiers.every((tier) => tier.price_fen === 0);
  return tiers.every((tier) => tier.price_fen > 0);
}

export function pricesOrdered(draft: Pick<EditorDraft, "tiers">): boolean {
  const tiers = enabledTiers(draft);
  return tiers.every((tier, index) => index === 0 || tiers[index - 1].price_fen <= tier.price_fen);
}

export function tierRows(draft: Pick<EditorDraft, "tiers">): BayServiceTierRow[] {
  return draft.tiers.map((tier) => ({
    tier: tier.tier,
    title: tier.title.trim(),
    description: tier.description.trim(),
    price_fen: Math.max(0, Math.round(tier.price_fen || 0)),
    delivery_days: tier.delivery_days,
    revisions: tier.revisions,
    features: tier.features.map((item) => item.trim()).filter(Boolean).slice(0, 20),
    enabled: tier.enabled,
  }));
}

// ---- 载荷 -------------------------------------------------------------------------

function priceUnitOf(model: BayPricingModel | undefined): BaySellerPriceUnit {
  const unit = model?.unit;
  return unit === "session" || unit === "hour" || unit === "day" || unit === "month" ? unit : "project";
}

export function listingPayload(draft: EditorDraft): {
  listing_kind: BayListingKind;
  license: BayLicense | null;
  digital_work: { kind: "task"; id: string } | null;
} {
  return {
    listing_kind: draft.listingKind,
    license: draft.license === "personal" || draft.license === "commercial" ? draft.license : null,
    digital_work: draft.listingKind === "digital" && draft.digitalWork?.id ? { kind: "task", id: draft.digitalWork.id } : null,
  };
}

export function resolvedPricingModel(draft: EditorDraft): string {
  if (draft.official) return "free";
  if (draft.listingKind === "digital" || draft.simplePrice) {
    return (draft.tiers[0]?.price_fen || 0) === 0 ? "free" : "fixed";
  }
  return draft.pricingModel;
}

export function resolvedPriceFen(draft: EditorDraft): number {
  if (draft.official) return 0;
  return enabledTiers(draft)[0]?.price_fen || draft.tiers[0]?.price_fen || 0;
}

/** `PUT /me/services/{id}` 是整份覆盖：标题、类目、价格、交期、状态每次都带全。 */
export function serviceInput(draft: EditorDraft, model?: BayPricingModel): BayServiceInput {
  const primary = enabledTiers(draft)[0] || draft.tiers[0];
  const extra = listingPayload(draft);
  return {
    title: draft.title.trim().slice(0, TITLE_MAX),
    summary: draft.summary.trim().slice(0, SUMMARY_MAX),
    description: draft.description,
    category: draft.category,
    cover_url: safeHttpUrl(draft.coverUrl),
    engagement_kind: resolvedPricingModel(draft) || undefined,
    delivery_mode: draft.deliveryMode,
    price_fen: resolvedPriceFen(draft),
    price_unit: priceUnitOf(model),
    delivery_days: primary?.delivery_days || null,
    status: draft.serviceId ? draft.status : "draft",
    catalog_kind: "delivery",
    regulated_domain: "none",
    listing_kind: extra.listing_kind,
    license: extra.license,
    digital_work: extra.digital_work,
  };
}

export function consultInput(draft: EditorDraft, status: "draft" | "published"): BayConsultInput {
  const price = draft.tiers[0]?.price_fen || 0;
  return {
    category_slug: draft.category,
    regulated_domain: draft.domain,
    title: draft.title.trim().slice(0, TITLE_MAX),
    summary: draft.summary.trim().slice(0, SUMMARY_MAX),
    scope_note: draft.scopeNote.trim(),
    price_fen: price,
    price_unit: draft.consultUnit,
    rounds: draft.consultUnit === "session" ? draft.consultRounds : null,
    minutes: draft.consultUnit === "hour" ? draft.consultMinutes : null,
    response_window: draft.responseWindow.trim(),
    status,
  };
}

/** 要存的常见问题：「开始前需要我提供什么」放第一条，其余照卖家的顺序。 */
export function faqRowsForSave(draft: EditorDraft, buyerInputsQuestion: string): { rows: DraftFaq[]; deleted: string[] } {
  const rows: DraftFaq[] = [];
  const deleted = [...draft.deletedFaqIds];
  const inputs = draft.buyerInputs.trim();
  if (inputs) {
    rows.push({ key: "buyer-inputs", id: draft.buyerInputsFaqId || undefined, question: buyerInputsQuestion, answer: inputs });
  } else if (draft.buyerInputsFaqId) {
    deleted.push(draft.buyerInputsFaqId);
  }
  for (const faq of draft.faqs) {
    if (!faq.question.trim() && !faq.answer.trim()) {
      if (faq.id) deleted.push(faq.id);
      continue;
    }
    rows.push(faq);
  }
  return { rows, deleted };
}

// ---- 载入 -------------------------------------------------------------------------

export interface LoadedService {
  service: BayOwnService;
  tiers: BayServiceTierRow[];
  addons: BayServiceAddonRow[];
  faq: BayServiceFaqRow[];
  media: BayServiceMediaRow[];
  pricing: BayServicePricing | null;
}

export function draftFromLoaded(loaded: LoadedService, tt: Translate): EditorDraft {
  const base = emptyDraft(tt);
  const { service } = loaded;
  const savedTiers = Array.isArray(loaded.tiers) ? loaded.tiers : [];
  const tiers = base.tiers.map((fallback) => {
    const saved = savedTiers.find((row) => row.tier === fallback.tier);
    return saved
      ? {
          tier: saved.tier,
          title: saved.title || "",
          description: saved.description || "",
          price_fen: saved.price_fen || 0,
          delivery_days: saved.delivery_days ?? null,
          revisions: typeof saved.revisions === "number" ? saved.revisions : 0,
          features: Array.isArray(saved.features) ? saved.features : [],
          enabled: saved.enabled !== false,
        }
      : fallback;
  });
  const marker = tt("开始前需要我提供什么？");
  const faqRows = [...(loaded.faq || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
  const inputsRow = faqRows.find((row) => row.question === marker);
  const pricing = loaded.pricing;
  const extras = extrasFromService(service);
  const enabledCount = tiers.filter((tier) => tier.enabled).length;
  const addonCount = (loaded.addons || []).filter((row) => row.title).length;
  return {
    ...base,
    serviceId: service.id,
    status: service.status === "published" || service.status === "paused" ? service.status : "draft",
    moderationHidden: service.moderation_hidden === true,
    catalogKind: "delivery",
    title: service.title || "",
    category: service.category || "",
    summary: service.summary || "",
    deliveryMode: service.delivery_mode === "off_platform" ? "off_platform" : "on_platform",
    description: service.description || "",
    coverUrl: service.cover_url || "",
    buyerInputs: inputsRow?.answer || "",
    buyerInputsFaqId: inputsRow?.id || "",
    pricingModel: pricing?.pricing_model?.key || service.engagement_kind || "",
    fieldValues: { ...(pricing?.values || {}) },
    tiers,
    addons: (loaded.addons || []).map((row) => ({
      key: row.id,
      id: row.id,
      title: row.title || "",
      description: row.description || "",
      price_fen: row.price_fen || 0,
      extra_days: row.extra_days || 0,
      enabled: row.enabled !== false,
    })),
    faqs: faqRows.filter((row) => row !== inputsRow).map((row) => ({ key: row.id, id: row.id, question: row.question || "", answer: row.answer || "" })),
    media: [...(loaded.media || [])]
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((row) => ({ key: row.id, id: row.id, kind: row.kind, url: row.url || "", poster_url: row.poster_url || "", caption: row.caption || "" })),
    listingKind: extras.listingKind,
    license: extras.license,
    digitalWork: extras.digitalWork,
    official: extras.official,
    simplePrice: extras.listingKind === "digital" || (enabledCount <= 1 && addonCount === 0),
  };
}

function extrasFromService(service: BayOwnService): {
  listingKind: BayListingKind;
  license: BayLicense | "";
  digitalWork: { id: string; title: string } | null;
  official: boolean;
} {
  const work = (service as BayOwnService & { digital_work?: { kind?: string; id?: string; title?: string } | null }).digital_work;
  return {
    listingKind: service.listing_kind === "digital" ? "digital" : "service",
    license: service.license === "personal" || service.license === "commercial" ? service.license : "",
    digitalWork: work && typeof work.id === "string" && work.id ? { id: work.id, title: typeof work.title === "string" ? work.title : "" } : null,
    official: service.official === true,
  };
}

// ---- 校验 -------------------------------------------------------------------------

export interface EditorContext {
  profile: BaySellerProfile | null;
  categories: BaySellerCategory[];
  specs: BayFieldSpec[];
  domainKeys: string[];
}

export interface Blocked {
  message: string;
  vars?: Record<string, string | number>;
}

/** 这一步还差什么没填（在本地先拦住，别让人白跑一趟网关 400）。 */
export function blockedReason(step: EditorStep, draft: EditorDraft, ctx: EditorContext): Blocked | null {
  if (step === "kind" && !draft.catalogKind) return { message: "先选一种：交付一件成品，还是答疑" };
  if (step === "domain") {
    if (!draft.domain || isSellerRestrictedDomain(draft.domain) || !ctx.domainKeys.includes(draft.domain)) {
      return { message: "先选一个领域" };
    }
    if (!draft.category) return { message: "再选一个这个领域下的类目" };
  }
  if (step === "basics") {
    if (!draft.title.trim()) return { message: "请先填写标题" };
    if (draft.catalogKind === "delivery" && !draft.category) return { message: "请选择类目" };
    if (!ctx.profile) return { message: "先建卖家资料，才能保存服务" };
  }
  if (step === "model" && !draft.pricingModel) return { message: "先选一种计费方式" };
  if (step === "fields") {
    const missing = missingFields(ctx.specs, draft.fieldValues);
    if (missing.length) return { message: "还差这几项没填：{items}", vars: { items: missing.map((spec) => spec.label_zh).join("、") } };
  }
  if (step === "pricing") {
    if (draft.catalogKind === "consult") {
      if (!(draft.tiers[0]?.price_fen > 0)) return { message: "答疑价格要大于 0" };
      if (draft.consultUnit === "session" && !(draft.consultRounds && draft.consultRounds > 0)) return { message: "按次答疑要写明一次包含几轮问答" };
      if (draft.consultUnit === "hour" && !(draft.consultMinutes && draft.consultMinutes > 0)) return { message: "按小时答疑要写明一小时按多少分钟计" };
    } else {
      if (!enabledTiers(draft).length) return { message: "至少启用一档价格" };
      if (!pricesLegal(draft)) return { message: draft.pricingModel === "free" ? "免费协作的每档价格都要是 0" : "每档价格都要大于 0" };
      if (!pricesOrdered(draft)) return { message: "启用的价格档要按基础、标准、高级从低到高" };
    }
  }
  if (step === "media") {
    const bad = draft.media.find((item) => item.url.trim() && !safeHttpUrl(item.url));
    if (bad) return { message: "作品图地址要以 https:// 开头" };
  }
  return null;
}

export interface PublishCheck {
  key: string;
  label: string;
  vars?: Record<string, string | number>;
  done: boolean;
}

export function publishKindOf(draft: Pick<EditorDraft, "catalogKind" | "listingKind">): PublishKind | "" {
  if (draft.catalogKind === "consult") return "consult";
  if (draft.listingKind === "digital") return "digital";
  if (draft.catalogKind === "delivery") return "service";
  return "";
}

export function hasPreviewImage(draft: Pick<EditorDraft, "coverUrl" | "media">): boolean {
  return Boolean(safeHttpUrl(draft.coverUrl)) || draft.media.some((item) => Boolean(safeHttpUrl(item.url)));
}

export function termsSpecs(specs: BayFieldSpec[]): BayFieldSpec[] {
  return specs.filter((spec) => spec.key !== "delivery_days" && spec.key !== "revisions");
}

/** 每块还差哪些（中文短语）。规则按合同 §1.4。 */
export function sectionMissing(draft: EditorDraft, ctx: EditorContext): Record<PublishSection, string[]> {
  const kind = publishKindOf(draft);
  const product: string[] = [];
  const price: string[] = [];
  const terms: string[] = [];
  const preview = hasPreviewImage(draft);
  const categoryKnown = ctx.categories.some(
    (row) => row.slug === draft.category && row.catalog_kind === "delivery" && !isSellerRestrictedDomain(row.regulated_domain),
  );
  if (kind === "digital") {
    if (!draft.title.trim()) product.push("标题");
    if (!categoryKnown) product.push("分类");
    if (!preview) product.push("至少一张预览图");
    if (!draft.digitalWork?.id) product.push("要卖的作品");
    if (draft.license !== "personal" && draft.license !== "commercial") terms.push("授权范围");
  } else if (kind === "service") {
    if (!draft.title.trim()) product.push("标题");
    if (!categoryKnown) product.push("分类");
    if (!preview) product.push("至少一张预览图");
    if (draft.simplePrice) {
      if (!(draft.tiers[0]?.delivery_days && draft.tiers[0].delivery_days > 0)) price.push("交付天数");
    } else {
      if (!resolvedPricingModel(draft) && !draft.pricingModel) price.push("计费方式");
      if (!enabledTiers(draft).length) price.push("至少启用一档价格");
      else if (!pricesLegal({ ...draft, pricingModel: resolvedPricingModel(draft) || draft.pricingModel })) {
        price.push(draft.pricingModel === "free" ? "免费协作的每档价格都要是 0" : "每档价格都要大于 0");
      } else if (!pricesOrdered(draft)) price.push("启用的价格档要按基础、标准、高级从低到高");
    }
    for (const spec of missingFields(termsSpecs(ctx.specs), draft.fieldValues)) terms.push(spec.label_zh);
  } else if (kind === "consult") {
    if (!draft.domain || isSellerRestrictedDomain(draft.domain) || !ctx.domainKeys.includes(draft.domain)) product.push("领域");
    if (!draft.category) product.push("领域下的类目");
    if (!draft.title.trim()) product.push("标题");
    if (!draft.official && !(draft.tiers[0]?.price_fen > 0)) price.push("价格");
    if (!draft.scopeNote.trim()) terms.push("能答范围");
    if (draft.consultUnit === "session") {
      if (!(draft.consultRounds && draft.consultRounds > 0)) terms.push("单次轮次");
    } else if (!(draft.consultMinutes && draft.consultMinutes > 0)) terms.push("单次时长");
    if (!draft.responseWindow.trim()) terms.push("最长响应时间");
  }
  return { product, price, terms };
}

export function missingTotal(missing: Record<PublishSection, string[]>): number {
  return PUBLISH_SECTIONS.reduce((sum, section) => sum + missing[section].length, 0);
}

export function firstMissingSection(missing: Record<PublishSection, string[]>): PublishSection | null {
  return PUBLISH_SECTIONS.find((section) => missing[section].length > 0) || null;
}

/** 上架前的检查清单：由 sectionMissing 展开。不再拦「先公开卖家资料」。 */
export function publishChecks(draft: EditorDraft, ctx: EditorContext): PublishCheck[] {
  if (!publishKindOf(draft)) return [];
  const missing = sectionMissing(draft, ctx);
  const checks: PublishCheck[] = [];
  for (const section of PUBLISH_SECTIONS) {
    for (const item of missing[section]) {
      checks.push({ key: `${section}:${item}`, label: item, done: false });
    }
  }
  if (!checks.length) return [{ key: "ready", label: "可以发布了", done: true }];
  return checks;
}

export function readyToPublish(checks: PublishCheck[]): boolean {
  return checks.length > 0 && checks.every((check) => check.done);
}

// ---- 预览 -------------------------------------------------------------------------

/** 只认 http(s)：作品图、封面、头像都按这个过滤，别的协议一律不渲染。 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** 预览用的信息流卡片数据：买家在 Bay 列表里会看到的那一张。 */
export function previewFeedItem(
  draft: EditorDraft,
  opts: { profile: BaySellerProfile | null; siteKey: string; currency?: string; model?: BayPricingModel },
): BayFeedItem {
  const tiers = enabledTiers(draft);
  const prices = (draft.catalogKind === "consult" ? draft.tiers.slice(0, 1) : tiers).map((tier) => tier.price_fen);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const profile = opts.profile;
  const cover = safeHttpUrl(draft.coverUrl) || draft.media.map((item) => (item.kind === "image" ? safeHttpUrl(item.url) : null)).find(Boolean) || null;
  const unit = draft.catalogKind === "consult" ? draft.consultUnit : priceUnitOf(opts.model);
  return {
    kind: draft.catalogKind === "consult" ? "consult" : "service",
    id: draft.serviceId || "preview",
    title: draft.title.trim(),
    summary: draft.summary.trim().slice(0, 200),
    category: draft.category || null,
    created_at: new Date(0).toISOString(),
    posted_site: opts.siteKey || null,
    handling_site: opts.siteKey || "oceanleo",
    price: { min_fen: min, max_fen: max, unit, currency: normalizeCurrency(opts.currency) },
    author: {
      user_id: profile?.user_id || "",
      handle: profile?.handle || null,
      display_name: profile?.display_name || "",
      avatar_url: safeHttpUrl(profile?.avatar_url),
      verified_level: 0,
      rating_avg: profile?.rating_avg ?? null,
      rating_count: profile?.rating_count ?? 0,
    },
    stats: { order_count: 0 },
    status: "preview",
    deadline_at: null,
    cover_url: cover,
    has_attached_work: false,
  };
}
