"use client";

// 发布：先选种类，再一张表三块（产品信息 / 价格 / 交付条款）。一次存草稿或发布。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { fetchBayCategories } from "../../../lib/bay/categories";
import {
  createMyConsult,
  createMyService,
  createServiceAddon,
  createServiceFaq,
  createServiceMedia,
  deleteMyService,
  deleteServiceAddon,
  deleteServiceFaq,
  deleteServiceMedia,
  getDomainPrompts,
  getSellerProfile,
  getServicePricing,
  hiddenCaseFor,
  listConsultDomains,
  listMyContentCases,
  listMyServices,
  listPricingModels,
  listServiceAddons,
  listServiceFaq,
  listServiceMedia,
  listServiceTiers,
  patchServiceAddon,
  patchServiceFaq,
  patchServiceMedia,
  pauseMyService,
  publishMyService,
  replaceServiceTiers,
  saveServicePricing,
  saveServiceQuickPrice,
  updateMyService,
  wizardCategories,
  type BayConsultDomain,
  type BayContentCase,
  type BayDomainPrompts,
  type BayFieldValue,
  type BayPricingModel,
  type BaySellerCategory,
  type BaySellerProfile,
  type BayServicePricing,
} from "../../../lib/bay/seller";
import { ConfirmDialog } from "../../../ui";
import { useToast } from "../../../ui/Toast";
import { pickLibraryWork } from "../needs/LibraryWorkPicker";
import { ensureBayTerms } from "../settings";
import { stripLeoCategoryPrefix } from "../shell/bay-links";
import { openBay, replaceBay, requireBayLogin, useBaySignedIn, useBaySiteKey, type BayPaneProps } from "../shell/bay-state";
import {
  TITLE_MAX,
  clientKey,
  consultInput,
  draftFromLoaded,
  emptyDraft,
  faqRowsForSave,
  firstMissingSection,
  missingTotal,
  prefillFieldsFromTiers,
  pricingInput,
  publishKindOf,
  PUBLISH_KIND_LABELS,
  PUBLISH_SECTIONS,
  resolvedPriceFen,
  resolvedPricingModel,
  sectionMissing,
  SECTION_LABELS,
  serviceInput,
  specsFor,
  termsSpecs,
  tierRows,
  toFen,
  yuanText,
  type EditorContext,
  type EditorDraft,
  type PublishKind,
  type PublishSection,
} from "./editor-model";
import {
  AddonsStep,
  CategorySelect,
  ConsultPricingStep,
  ConsultTermsFields,
  DetailsStep,
  DomainStep,
  FaqStep,
  FieldsStep,
  MediaStep,
  ModelStep,
  OverreachHintList,
  PromptsStep,
  TiersStep,
} from "./editor-steps";
import { DANGER_BUTTON, HiddenByPlatformNotice, INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerField, SellerNotice, TEXTAREA_CLASS } from "./seller-ui";

const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-lg bg-stone-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_SECONDARY =
  "inline-flex items-center justify-center rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_QUIET = "rounded-lg px-3 py-1.5 text-[13px] text-stone-500 hover:bg-stone-100 hover:text-stone-900";

type PickKind = "digital" | "service" | "need";

const KIND_CARDS: { kind: PickKind; title: string; blurb: string; items: string[] }[] = [
  { kind: "digital", title: "素材", blurb: "图片、模板、文件，买家付款后立即拿到", items: ["标题和预览图", "一个价格", "授权范围"] },
  { kind: "service", title: "服务", blurb: "为买家做一件事，或者按次、按小时答疑", items: ["做什么", "价格和交付天数", "交付约定"] },
  { kind: "need", title: "需求", blurb: "说清你要做的事，别人来报价，你来挑", items: ["要做什么", "预算和期限", "报价由你挑"] },
];

const SECTION_HINT: Record<PublishKind, Record<PublishSection, string>> = {
  digital: { product: "标题、预览图和要卖的作品", price: "一个价格，0 就是免费", terms: "授权范围和固定交付规则" },
  service: { product: "标题、分类、预览图和详情", price: "价格和交付天数", terms: "改稿、交付方式和类目约定" },
  consult: { product: "领域、标题和介绍", price: "按次或按小时计价", terms: "能答范围、时长和响应时间" },
};

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "";
}

function isOfficialProfile(profile: BaySellerProfile | null): boolean {
  return profile?.official === true;
}

function intOrNull(value: string, min: number, max: number): number | null {
  const digits = value.replace(/[^\d-]/g, "");
  if (!digits.trim()) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

interface Remote<T> {
  data: T;
  loading: boolean;
  error: string;
}

export function ServiceEditorPane({ target, layout }: BayPaneProps) {
  const tt = useUI();
  const toast = useToast();
  const signedIn = useBaySignedIn();
  const postedSite = useBaySiteKey();
  const routeId = target.kind === "service-editor" ? target.serviceId || "" : "";
  const presetCategory = target.kind === "publish" ? target.category : undefined;

  const [draft, setDraft] = useState<EditorDraft>(() => emptyDraft(tt));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rejection, setRejection] = useState("");
  const [hiddenMessage, setHiddenMessage] = useState("");
  const [load, setLoad] = useState<{ loading: boolean; error: string }>({ loading: true, error: "" });
  const [nonce, setNonce] = useState(0);
  const [profile, setProfile] = useState<BaySellerProfile | null>(null);
  const [categories, setCategories] = useState<BaySellerCategory[]>([]);
  const [models, setModels] = useState<Remote<BayPricingModel[]>>({ data: [], loading: true, error: "" });
  const [pricing, setPricing] = useState<BayServicePricing | null>(null);
  const [cases, setCases] = useState<BayContentCase[]>([]);
  const [domains, setDomains] = useState<Remote<BayConsultDomain[]>>({ data: [], loading: false, error: "" });
  const [prompts, setPrompts] = useState<Remote<BayDomainPrompts | null>>({ data: null, loading: false, error: "" });
  const [domainNonce, setDomainNonce] = useState(0);
  const [promptNonce, setPromptNonce] = useState(0);
  const [modelNonce, setModelNonce] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [morePricing, setMorePricing] = useState(false);
  const [highlight, setHighlight] = useState<PublishSection | null>(null);
  const termsOk = useRef(false);
  const sectionEls = useRef<Partial<Record<PublishSection, HTMLElement | null>>>({});

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setModels((current) => ({ ...current, loading: true, error: "" }));
    listPricingModels().then(
      (body) => alive && setModels({ data: Array.isArray(body.items) ? body.items : [], loading: false, error: "" }),
      (error: unknown) => alive && setModels({ data: [], loading: false, error: errorText(error) }),
    );
    return () => {
      alive = false;
    };
  }, [signedIn, modelNonce]);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setLoad({ loading: true, error: "" });
    void (async () => {
      try {
        const [profileBody, categoriesBody] = await Promise.all([getSellerProfile(), fetchBayCategories()]);
        if (!alive) return;
        const nextProfile = profileBody.profile || null;
        setProfile(nextProfile);
        setCategories((categoriesBody.flat_items.length ? categoriesBody.flat_items : categoriesBody.items) as BaySellerCategory[]);
        listMyContentCases().then((rows) => alive && setCases(rows), () => {});
        if (!routeId) {
          const next = emptyDraft(tt);
          next.official = isOfficialProfile(nextProfile);
          setDraft(next);
          setDirty(false);
          setHighlight(null);
          setFaqOpen(false);
          setMorePricing(false);
          setLoad({ loading: false, error: "" });
          return;
        }
        const [services, tiers, addons, faq, media, pricingBody] = await Promise.all([
          listMyServices(),
          listServiceTiers(routeId),
          listServiceAddons(routeId),
          listServiceFaq(routeId),
          listServiceMedia(routeId),
          getServicePricing(routeId).catch(() => null),
        ]);
        if (!alive) return;
        const service = (services.items || []).find((row) => row.id === routeId);
        if (!service) {
          setLoad({ loading: false, error: tt("这项服务不存在，或已经被删除。") });
          return;
        }
        setPricing(pricingBody);
        const loaded = draftFromLoaded({ service, tiers: tiers.items || [], addons: addons.items || [], faq: faq.items || [], media: media.items || [], pricing: pricingBody }, tt);
        loaded.official = loaded.official || isOfficialProfile(nextProfile);
        setDraft(loaded);
        setDirty(false);
        setHighlight(null);
        setFaqOpen(false);
        setMorePricing(false);
        setLoad({ loading: false, error: "" });
      } catch (error) {
        if (alive) setLoad({ loading: false, error: errorText(error) || tt("服务加载失败，请稍后再试。") });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, routeId, nonce]);

  const kind = publishKindOf(draft);
  const isConsult = kind === "consult";

  useEffect(() => {
    if (!isConsult) return;
    let alive = true;
    setDomains({ data: [], loading: true, error: "" });
    listConsultDomains().then(
      (rows) => alive && setDomains({ data: rows, loading: false, error: "" }),
      (error: unknown) => alive && setDomains({ data: [], loading: false, error: errorText(error) }),
    );
    return () => {
      alive = false;
    };
  }, [isConsult, domainNonce]);

  useEffect(() => {
    if (!isConsult || !draft.domain) {
      setPrompts({ data: null, loading: false, error: "" });
      return;
    }
    let alive = true;
    setPrompts({ data: null, loading: true, error: "" });
    getDomainPrompts(draft.domain).then(
      (body) => alive && setPrompts({ data: body && typeof body.ask_placeholder === "string" ? body : null, loading: false, error: "" }),
      (error: unknown) => alive && setPrompts({ data: null, loading: false, error: errorText(error) }),
    );
    return () => {
      alive = false;
    };
  }, [isConsult, draft.domain, promptNonce]);

  const visibleCategories = useMemo(
    () => wizardCategories(categories, isConsult ? "consult" : "delivery", isConsult ? draft.domain : undefined),
    [categories, isConsult, draft.domain],
  );
  const selectedCategory = categories.find((row) => row.slug === draft.category);
  const selectedModel = models.data.find((model) => model.key === draft.pricingModel);
  const specs = useMemo(() => (isConsult || kind === "digital" ? [] : specsFor(draft, pricing, selectedCategory)), [isConsult, kind, draft, pricing, selectedCategory]);
  const ctx: EditorContext = { profile, categories, specs, domainKeys: domains.data.map((row) => row.key) };
  const missing = sectionMissing(draft, ctx);
  const leftover = missingTotal(missing);
  const hiddenCase = hiddenCaseFor(cases, "talent_service", draft.serviceId || undefined);
  const currency = (profile?.currency || "USD").toUpperCase();
  const narrow = layout === "docked" || layout === "mobile";
  const showPick = !draft.serviceId && !kind;

  const patch = useCallback((next: Partial<EditorDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);

  function pickKind(next: PublishKind) {
    if (draft.serviceId) return;
    if (publishKindOf(draft) === next) return;
    const base = emptyDraft(tt);
    base.official = draft.official || isOfficialProfile(profile);
    base.catalogKind = next === "consult" ? "consult" : "delivery";
    base.listingKind = next === "digital" ? "digital" : "service";
    base.simplePrice = true;
    if ((next === "service" || next === "digital") && presetCategory && wizardCategories(categories, "delivery").some((row) => row.slug === presetCategory)) {
      base.category = presetCategory;
    }
    setDraft(base);
    setDirty(true);
    setHighlight(null);
    setFaqOpen(false);
    setMorePricing(false);
  }

  function pickPublishCard(card: PickKind) {
    if (card === "need") {
      replaceBay(presetCategory ? { kind: "post-need", category: presetCategory } : { kind: "post-need" });
      return;
    }
    pickKind(card);
  }

  function pickKindReset() {
    const next = emptyDraft(tt);
    next.official = draft.official || isOfficialProfile(profile);
    setDraft(next);
    setDirty(false);
    setHighlight(null);
    setFaqOpen(false);
    setMorePricing(false);
  }

  function changeCategory(slug: string) {
    patch({ category: slug, fieldValues: {} });
  }

  function changeTier(index: number, next: Partial<EditorDraft["tiers"][number]>) {
    setDraft((current) => ({ ...current, simplePrice: false, tiers: current.tiers.map((tier, i) => (i === index ? { ...tier, ...next } : tier)) }));
    setDirty(true);
  }

  function setSimplePrice(fen: number, free: boolean) {
    const price = draft.official || free ? 0 : fen;
    setDraft((current) => ({
      ...current,
      pricingModel: current.official || free ? "free" : "fixed",
      tiers: current.tiers.map((tier, index) => (index === 0 ? { ...tier, price_fen: price, enabled: true } : tier)),
    }));
    setDirty(true);
  }

  function setDeliveryDays(days: number | null) {
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier, index) => (index === 0 ? { ...tier, delivery_days: days } : tier)),
    }));
    setDirty(true);
  }

  function setRevisions(revisions: number) {
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier, index) => (index === 0 ? { ...tier, revisions } : tier)),
    }));
    setDirty(true);
  }

  async function pickWork() {
    const work = await pickLibraryWork({ title: tt("从我的库选") });
    if (!work) return;
    patch({ digitalWork: { id: work.id, title: work.title || work.id } });
  }

  function reportFailure(error: unknown, fallback: string) {
    const message = errorText(error) || fallback;
    setRejection(message);
    toast.error(tt(message));
  }

  async function saveBase(): Promise<string | null> {
    if (!draft.title.trim()) {
      setRejection(tt("请先填写标题"));
      setHighlight("product");
      return null;
    }
    const input = serviceInput(draft, selectedModel);
    const body = draft.serviceId ? await updateMyService(draft.serviceId, input) : await createMyService(input, postedSite);
    const saved = body.service;
    if (!saved?.id) throw new Error(tt("草稿保存失败，请稍后再试。"));
    const official = draft.official || saved.official === true;
    setDraft((current) => ({
      ...current,
      serviceId: saved.id,
      status: saved.status || current.status,
      moderationHidden: saved.moderation_hidden === true || current.moderationHidden,
      official,
    }));
    return saved.id;
  }

  async function savePricing(sid: string): Promise<void> {
    const input = pricingInput({ ...draft, pricingModel: resolvedPricingModel(draft) }, specs);
    if (!input) return;
    const body = await saveServicePricing(sid, input);
    setPricing(body);
  }

  async function saveTiers(sid: string): Promise<void> {
    const simple = draft.simplePrice || draft.listingKind === "digital";
    if (simple) {
      const days = draft.listingKind === "digital" ? null : draft.tiers[0]?.delivery_days ?? null;
      await saveServiceQuickPrice(sid, { price_fen: resolvedPriceFen(draft), delivery_days: days });
      return;
    }
    await replaceServiceTiers(
      sid,
      tierRows({
        ...draft,
        tiers: draft.official ? draft.tiers.map((tier) => ({ ...tier, price_fen: 0 })) : draft.tiers,
      }),
    );
  }

  async function saveAddons(sid: string): Promise<void> {
    await Promise.all(draft.deletedAddonIds.map((id) => deleteServiceAddon(sid, id)));
    await Promise.all(
      draft.addons
        .filter((addon) => addon.title.trim())
        .map((addon, position) => {
          const input = { title: addon.title.trim(), description: addon.description.trim(), price_fen: addon.price_fen, extra_days: addon.extra_days, position, enabled: addon.enabled };
          return addon.id ? patchServiceAddon(sid, addon.id, input) : createServiceAddon(sid, input);
        }),
    );
    const fresh = await listServiceAddons(sid);
    setDraft((current) => ({
      ...current,
      deletedAddonIds: [],
      addons: (fresh.items || []).map((row) => ({ key: row.id, id: row.id, title: row.title, description: row.description || "", price_fen: row.price_fen, extra_days: row.extra_days, enabled: row.enabled !== false })),
    }));
  }

  async function saveFaqs(sid: string): Promise<void> {
    const question = tt("开始前需要我提供什么？");
    const { rows, deleted } = faqRowsForSave(draft, question);
    await Promise.all(deleted.map((id) => deleteServiceFaq(sid, id)));
    await Promise.all(
      rows.map((row, position) => {
        const input = { question: row.question.trim(), answer: row.answer.trim(), position };
        return row.id ? patchServiceFaq(sid, row.id, input) : createServiceFaq(sid, input);
      }),
    );
    const fresh = await listServiceFaq(sid);
    const items = [...(fresh.items || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
    const inputs = items.find((row) => row.question === question);
    setDraft((current) => ({
      ...current,
      deletedFaqIds: [],
      buyerInputsFaqId: inputs?.id || "",
      faqs: items.filter((row) => row !== inputs).map((row) => ({ key: row.id, id: row.id, question: row.question, answer: row.answer })),
    }));
  }

  async function saveMedia(sid: string): Promise<void> {
    await Promise.all(draft.deletedMediaIds.map((id) => deleteServiceMedia(sid, id)));
    await Promise.all(
      draft.media
        .filter((item) => item.url.trim())
        .map((item, position) => {
          const input = { kind: item.kind, url: item.url.trim(), poster_url: item.poster_url.trim() || null, caption: item.caption.trim(), position };
          return item.id ? patchServiceMedia(sid, item.id, input) : createServiceMedia(sid, input);
        }),
    );
    const fresh = await listServiceMedia(sid);
    setDraft((current) => ({
      ...current,
      deletedMediaIds: [],
      media: [...(fresh.items || [])]
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map((row) => ({ key: row.id, id: row.id, kind: row.kind, url: row.url, poster_url: row.poster_url || "", caption: row.caption || "" })),
    }));
  }

  async function persist(mode: "draft" | "publish") {
    if (saving) return;
    if (mode === "publish") {
      const first = firstMissingSection(missing);
      if (first) {
        setHighlight(first);
        sectionEls.current[first]?.scrollIntoView?.({ block: "start" });
        return;
      }
      if (!(await ensureBayTerms("seller"))) {
        toast.info(tt("没有同意卖家条款，服务还没有上架。"));
        return;
      }
      termsOk.current = true;
    }
    setSaving(true);
    setRejection("");
    try {
      if (isConsult) {
        if (mode === "publish") {
          await createMyConsult(consultInput(draft, "published"), postedSite);
          setDirty(false);
          toast.success(tt("答疑已上架"));
          openBay({ kind: "mine", tab: "published" });
          return;
        }
        if (!draft.serviceId) {
          const body = await createMyConsult(consultInput(draft, "draft"), postedSite);
          const id = body.consult?.id;
          if (id) setDraft((current) => ({ ...current, serviceId: id, status: "draft" }));
        }
        setDirty(false);
        toast.success(tt("草稿已保存"));
        return;
      }
      const created = !draft.serviceId;
      const sid = await saveBase();
      if (!sid) return;
      if (kind === "service") {
        setDraft((current) => ({ ...current, fieldValues: prefillFieldsFromTiers(specs, current.fieldValues, current.tiers), pricingModel: resolvedPricingModel(current) }));
        await savePricing(sid);
      }
      await saveTiers(sid);
      if (kind === "service") {
        await saveAddons(sid);
        await saveFaqs(sid);
      }
      await saveMedia(sid);
      if (mode === "publish") {
        const result = await publishMyService(sid, kind === "service" ? pricingInput({ ...draft, pricingModel: resolvedPricingModel(draft) }, specs) : undefined);
        const hidden = result.moderation_hidden === true || result.service?.moderation_hidden === true;
        setDraft((current) => ({ ...current, status: "published", moderationHidden: hidden }));
        setHiddenMessage(hidden ? result.moderation_message || "" : "");
        toast.success(hidden ? tt("已上架，但被平台暂时隐藏") : tt("服务已上架，买家现在能在 LeoBay 里看到它"));
      } else {
        toast.success(created ? tt("草稿已建好") : draft.status === "published" ? tt("修改已保存") : tt("草稿已保存"));
      }
      setDirty(false);
    } catch (error) {
      reportFailure(error, mode === "publish" ? tt("上架没有通过，请按提示修改后再试。") : "保存失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  }

  async function pause() {
    if (saving || !draft.serviceId) return;
    setSaving(true);
    try {
      await pauseMyService(draft.serviceId);
      setDraft((current) => ({ ...current, status: "paused" }));
      toast.success(tt("已暂停，买家暂时看不到这项服务"));
    } catch (error) {
      reportFailure(error, tt("暂停失败，请稍后再试。"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (saving || !draft.serviceId) return;
    setPendingDelete(false);
    setSaving(true);
    try {
      await deleteMyService(draft.serviceId);
      toast.success(tt("服务已删除"));
      openBay({ kind: "mine", tab: "published" });
    } catch (error) {
      reportFailure(error, tt("删除失败，请稍后再试。"));
    } finally {
      setSaving(false);
    }
  }

  const mediaProps = {
    items: draft.media,
    coverUrl: draft.coverUrl,
    onChange: (key: string, next: Partial<EditorDraft["media"][number]>) => patch({ media: draft.media.map((item) => (item.key === key ? { ...item, ...next } : item)) }),
    onCover: (url: string) => patch({ coverUrl: url }),
    onAdd: () => patch({ media: [...draft.media, { key: clientKey("media"), kind: "image" as const, url: "", poster_url: "", caption: "" }] }),
    onRemove: (key: string) => {
      const row = draft.media.find((item) => item.key === key);
      patch({
        media: draft.media.filter((item) => item.key !== key),
        deletedMediaIds: row?.id ? [...draft.deletedMediaIds, row.id] : draft.deletedMediaIds,
        coverUrl: row && row.url === draft.coverUrl ? "" : draft.coverUrl,
      });
    },
    onMove: (index: number, direction: -1 | 1) => {
      const next = [...draft.media];
      const [row] = next.splice(index, 1);
      next.splice(index + direction, 0, row);
      patch({ media: next });
    },
  };

  if (!signedIn) {
    return (
      <section data-bay-pane="service-editor" className="space-y-3 p-4 text-[13px] text-stone-600">
        <p>{tt("登录后发布你的服务。")}</p>
        <button type="button" onClick={() => requireBayLogin()} className={PRIMARY_BUTTON}>
          {tt("登录")}
        </button>
      </section>
    );
  }
  if (load.loading) return <section data-bay-pane="service-editor" className="p-4 text-[13px] text-stone-500">{tt("正在打开…")}</section>;
  if (load.error) {
    return (
      <section data-bay-pane="service-editor" className="space-y-3 p-4">
        <SellerNotice tone="error">{tt(load.error)}</SellerNotice>
        <button type="button" onClick={() => setNonce((value) => value + 1)} className={SECONDARY_BUTTON}>
          {tt("重试")}
        </button>
      </section>
    );
  }

  const statusLabel = draft.status === "published" ? tt("已上架") : draft.status === "paused" ? tt("已暂停") : tt("草稿");

  if (showPick) {
    return (
      <section data-bay-pane="service-editor" data-bay-publish="pick" className={`space-y-6 p-5 sm:p-8 ${narrow ? "" : "mx-auto w-full max-w-4xl"}`}>
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight text-stone-900">{tt("你要发布什么？")}</h3>
          <p className="mt-1 text-[13px] text-stone-500">{tt("选一种就行。每一种只问它该问的那几项。")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {KIND_CARDS.map((card) => (
            <button
              key={card.kind}
              type="button"
              data-bay-kind={card.kind}
              onClick={() => pickPublishCard(card.kind)}
              className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-stone-400"
            >
              <span className="block text-[15px] font-semibold tracking-tight text-stone-900">{tt(card.title)}</span>
              <span className="mt-1 block text-[13px] leading-5 text-stone-500">{tt(card.blurb)}</span>
              <ul className="mt-3 space-y-1 text-[13px] text-stone-600">
                {card.items.map((item) => (
                  <li key={item}>{tt(item)}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const publishKind = kind as PublishKind;

  return (
    <section data-bay-pane="service-editor" data-bay-publish="form" className={`space-y-4 p-4 sm:p-6 ${narrow ? "" : "mx-auto w-full max-w-3xl"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-neutral-600" data-bay-editor-status={draft.status}>
          <span className="rounded-md bg-stone-900 px-2 py-0.5 text-[12px] font-medium text-white">{tt(PUBLISH_KIND_LABELS[publishKind])}</span>
          <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-600">{statusLabel}</span>
          {dirty ? <span className="text-[12px] text-amber-600">{tt("有没保存的修改")}</span> : null}
        </p>
        {!draft.serviceId ? (
          <button type="button" data-bay-switch-kind onClick={() => pickKindReset()} className={BTN_QUIET}>
            {tt("换一种")}
          </button>
        ) : null}
      </div>

      {draft.moderationHidden ? <HiddenByPlatformNotice what="service" caseRow={hiddenCase} /> : null}
      {hiddenMessage && !hiddenCase ? <SellerNotice tone="warn">{hiddenMessage}</SellerNotice> : null}

      <div className="space-y-4">
        <SectionCard
          index={1}
          section="product"
          missing={missing.product}
          highlight={highlight === "product"}
          hint={tt(SECTION_HINT[publishKind].product)}
          onRef={(node) => {
            sectionEls.current.product = node;
          }}
        >
          {!draft.serviceId && (publishKind === "service" || publishKind === "consult") ? (
            <ServiceFormToggle value={publishKind} onPick={(next) => pickKind(next)} />
          ) : null}
          {publishKind === "consult" ? (
            <>
              <DomainStep
                plain
                domains={domains.data}
                loading={domains.loading}
                error={domains.error}
                onReload={() => setDomainNonce((value) => value + 1)}
                domain={draft.domain}
                onDomain={(key) => patch({ domain: key, category: "" })}
                categories={visibleCategories}
                category={draft.category}
                onCategory={changeCategory}
              />
              <SellerField label={tt("标题")} hint={`${draft.title.length}/${TITLE_MAX}`}>
                <input className={INPUT_CLASS} data-bay-field="title" value={draft.title} maxLength={TITLE_MAX} onChange={(event) => patch({ title: event.target.value })} />
                <OverreachHintList text={draft.title} />
              </SellerField>
              <SellerField label={tt("一句介绍")} hint={`${draft.summary.length}/${TITLE_MAX}`}>
                <input className={INPUT_CLASS} data-bay-field="summary" value={draft.summary} maxLength={240} onChange={(event) => patch({ summary: event.target.value })} />
              </SellerField>
            </>
          ) : (
            <>
              <SellerField label={tt("标题")} hint={`${draft.title.length}/${TITLE_MAX}`}>
                <input className={INPUT_CLASS} data-bay-field="title" value={draft.title} maxLength={TITLE_MAX} onChange={(event) => patch({ title: event.target.value })} />
                <OverreachHintList text={draft.title} />
              </SellerField>
              {publishKind === "service" || publishKind === "digital" ? (
                <SellerField label={tt("分类")}>
                  <CategorySelect categories={visibleCategories} value={draft.category} onChange={changeCategory} />
                </SellerField>
              ) : null}
              <MediaStep {...mediaProps} plain imagesOnly />
              {publishKind === "digital" ? (
                <div data-bay-digital-work>
                  {draft.digitalWork ? (
                    <p className="flex flex-wrap items-center gap-2 text-[13px] text-neutral-700">
                      <span>{draft.digitalWork.title || draft.digitalWork.id}</span>
                      <button type="button" onClick={() => void pickWork()} className={BTN_QUIET}>
                        {tt("换一个")}
                      </button>
                    </p>
                  ) : (
                    <button type="button" onClick={() => void pickWork()} className={BTN_SECONDARY}>
                      {tt("从我的库选")}
                    </button>
                  )}
                </div>
              ) : null}
              {publishKind === "digital" ? (
                <SellerField label={tt("一句介绍")}>
                  <input className={INPUT_CLASS} data-bay-field="summary" value={draft.summary} maxLength={240} onChange={(event) => patch({ summary: event.target.value })} />
                </SellerField>
              ) : (
                <DetailsStep
                  plain
                  minChars={0}
                  showBuyerInputs={false}
                  description={draft.description}
                  onDescription={(value) => patch({ description: value })}
                  buyerInputs={draft.buyerInputs}
                  onBuyerInputs={(value) => patch({ buyerInputs: value })}
                />
              )}
              {publishKind === "service" ? (
                <div>
                  <button type="button" data-bay-faq-toggle aria-expanded={faqOpen} onClick={() => setFaqOpen((open) => !open)} className={BTN_QUIET}>
                    {tt("添加常见问题")}
                  </button>
                  {faqOpen ? (
                    <FaqStep
                      plain
                      items={draft.faqs}
                      onChange={(key, next) => patch({ faqs: draft.faqs.map((faq) => (faq.key === key ? { ...faq, ...next } : faq)) })}
                      onAdd={() => patch({ faqs: [...draft.faqs, { key: clientKey("faq"), question: "", answer: "" }] })}
                      onRemove={(key) => {
                        const row = draft.faqs.find((faq) => faq.key === key);
                        patch({ faqs: draft.faqs.filter((faq) => faq.key !== key), deletedFaqIds: row?.id ? [...draft.deletedFaqIds, row.id] : draft.deletedFaqIds });
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </SectionCard>

        <SectionCard
          index={2}
          section="price"
          missing={missing.price}
          highlight={highlight === "price"}
          hint={tt(SECTION_HINT[publishKind].price)}
          onRef={(node) => {
            sectionEls.current.price = node;
          }}
        >
          {draft.official ? (
            <p data-bay-official-free className="text-[13px] text-neutral-600">
              {tt("官方账号发布的内容一律免费")}
            </p>
          ) : publishKind === "consult" ? (
            <ConsultPricingStep
              plain
              includeTerms={false}
              currency={currency}
              unit={draft.consultUnit}
              onUnit={(unit) => patch({ consultUnit: unit })}
              priceFen={draft.tiers[0]?.price_fen || 0}
              onPriceFen={(fen) => {
                setDraft((current) => ({ ...current, tiers: current.tiers.map((tier, index) => (index === 0 ? { ...tier, price_fen: fen } : tier)) }));
                setDirty(true);
              }}
              rounds={draft.consultRounds}
              onRounds={(value) => patch({ consultRounds: value })}
              minutes={draft.consultMinutes}
              onMinutes={(value) => patch({ consultMinutes: value })}
              responseWindow={draft.responseWindow}
              onResponseWindow={(value) => patch({ responseWindow: value })}
            />
          ) : publishKind === "digital" ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[8rem] flex-1">
                <SellerField label={tt("价格")}>
                  <input
                    className={INPUT_CLASS}
                    data-bay-field="price"
                    inputMode="decimal"
                    disabled={draft.pricingModel === "free"}
                    value={yuanText(draft.tiers[0]?.price_fen || 0)}
                    onChange={(event) => setSimplePrice(toFen(event.target.value), false)}
                  />
                </SellerField>
              </div>
              <label className="flex items-center gap-2 rounded-xl px-3 py-3 text-[13px] text-neutral-700">
                <input
                  type="checkbox"
                  data-bay-free
                  checked={draft.pricingModel === "free"}
                  onChange={(event) => setSimplePrice(event.target.checked ? 0 : draft.tiers[0]?.price_fen || 0, event.target.checked)}
                />
                {tt("免费")}
              </label>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[8rem] flex-1">
                  <SellerField label={tt("价格")}>
                    <input className={INPUT_CLASS} data-bay-field="price" inputMode="decimal" value={yuanText(draft.tiers[0]?.price_fen || 0)} onChange={(event) => setSimplePrice(toFen(event.target.value), false)} />
                  </SellerField>
                </div>
                <div className="min-w-[8rem] flex-1">
                  <SellerField label={tt("交付天数")}>
                    <input
                      className={INPUT_CLASS}
                      data-bay-field="delivery-days"
                      inputMode="numeric"
                      value={draft.tiers[0]?.delivery_days == null ? "" : String(draft.tiers[0].delivery_days)}
                      onChange={(event) => setDeliveryDays(intOrNull(event.target.value, 1, 365))}
                    />
                  </SellerField>
                </div>
              </div>
              <div>
                <button type="button" data-bay-more-pricing-toggle aria-expanded={morePricing} onClick={() => setMorePricing((open) => !open)} className={BTN_QUIET}>
                  {tt("更多定价")}
                </button>
                {morePricing ? (
                  <div data-bay-more-pricing className="mt-3 space-y-4">
                    <ModelStep
                      plain
                      models={models.data}
                      loading={models.loading}
                      error={models.error}
                      onReload={() => setModelNonce((value) => value + 1)}
                      selected={draft.pricingModel}
                      onSelect={(key) =>
                        patch({
                          simplePrice: false,
                          pricingModel: key,
                          tiers: key === "free" ? draft.tiers.map((tier) => ({ ...tier, price_fen: 0 })) : draft.tiers,
                        })
                      }
                    />
                    <TiersStep
                      plain
                      tiers={draft.tiers}
                      currency={currency}
                      free={draft.pricingModel === "free"}
                      onChange={changeTier}
                      onBasicOnly={() => patch({ tiers: draft.tiers.map((tier, index) => ({ ...tier, enabled: index === 0 })) })}
                    />
                    <AddonsStep
                      plain
                      addons={draft.addons}
                      currency={currency}
                      onChange={(key, next) => {
                        patch({ simplePrice: false, addons: draft.addons.map((addon) => (addon.key === key ? { ...addon, ...next } : addon)) });
                      }}
                      onAdd={() => patch({ simplePrice: false, addons: [...draft.addons, { key: clientKey("addon"), title: "", description: "", price_fen: 0, extra_days: 0, enabled: true }] })}
                      onRemove={(key) => {
                        const row = draft.addons.find((addon) => addon.key === key);
                        patch({ addons: draft.addons.filter((addon) => addon.key !== key), deletedAddonIds: row?.id ? [...draft.deletedAddonIds, row.id] : draft.deletedAddonIds });
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard
          index={3}
          section="terms"
          missing={missing.terms}
          highlight={highlight === "terms"}
          hint={tt(SECTION_HINT[publishKind].terms)}
          onRef={(node) => {
            sectionEls.current.terms = node;
          }}
        >
          {publishKind === "digital" ? (
            <>
              <div className="space-y-2" role="radiogroup" data-bay-license-group>
                {(["personal", "commercial"] as const).map((value) => (
                  <label key={value} data-bay-license={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left ${draft.license === value ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"}`}>
                    <input type="radio" name="bay-license" className="mt-1" checked={draft.license === value} onChange={() => patch({ license: value })} />
                    <span className="text-[13px] font-semibold text-neutral-900">{value === "personal" ? tt("个人使用") : tt("可商用")}</span>
                  </label>
                ))}
              </div>
              <ul data-bay-digital-terms className="space-y-1 text-[13px] text-neutral-600">
                <li>{tt("付款后立即交付")}</li>
                <li>{tt("已交付的数字商品不退款")}</li>
                <li>{tt("不得转售原文件")}</li>
              </ul>
            </>
          ) : publishKind === "consult" ? (
            <>
              <ConsultTermsFields
                scopeNote={draft.scopeNote}
                onScopeNote={(value) => patch({ scopeNote: value })}
                unit={draft.consultUnit}
                rounds={draft.consultRounds}
                onRounds={(value) => patch({ consultRounds: value })}
                minutes={draft.consultMinutes}
                onMinutes={(value) => patch({ consultMinutes: value })}
                responseWindow={draft.responseWindow}
                onResponseWindow={(value) => patch({ responseWindow: value })}
              />
              <PromptsStep
                plain
                domainName={tt(domains.data.find((row) => row.key === draft.domain)?.name_zh || "")}
                prompts={prompts.data}
                loading={prompts.loading}
                error={prompts.error}
                onReload={() => setPromptNonce((value) => value + 1)}
              />
            </>
          ) : (
            <>
              <SellerField label={tt("改稿次数")} hint={tt("-1 表示不限")}>
                <input className={INPUT_CLASS} data-bay-field="revisions" inputMode="numeric" value={String(draft.tiers[0]?.revisions ?? 0)} onChange={(event) => setRevisions(intOrNull(event.target.value, -1, 100) ?? 0)} />
              </SellerField>
              <SellerField label={tt("需要买家先提供什么")}>
                <textarea className={TEXTAREA_CLASS} data-bay-field="buyer-inputs" rows={3} maxLength={2000} value={draft.buyerInputs} onChange={(event) => patch({ buyerInputs: event.target.value })} />
              </SellerField>
              <SellerField label={tt("交付方式")}>
                <div className="space-y-2" role="radiogroup">
                  {(["on_platform", "off_platform"] as const).map((mode) => (
                    <label key={mode} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left ${draft.deliveryMode === mode ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"}`}>
                      <input type="radio" name="bay-delivery-mode" className="mt-1" checked={draft.deliveryMode === mode} onChange={() => patch({ deliveryMode: mode })} />
                      <span className="text-[13px] font-semibold text-neutral-900">{mode === "on_platform" ? tt("站内交付") : tt("站外交付")}</span>
                    </label>
                  ))}
                </div>
              </SellerField>
              <FieldsStep
                plain
                specs={termsSpecs(specs)}
                values={draft.fieldValues}
                categoryName={stripLeoCategoryPrefix(tt(selectedCategory?.name_zh || ""))}
                onChange={(key: string, value: BayFieldValue) => patch({ fieldValues: { ...draft.fieldValues, [key]: value } })}
              />
            </>
          )}
        </SectionCard>
      </div>

      {rejection ? (
        <SellerNotice tone="error">
          <span className="font-semibold">{tt("这一步没有保存成功")}</span>
          <span className="mt-1 block whitespace-pre-wrap">{tt(rejection)}</span>
        </SellerNotice>
      ) : null}

      <footer
        data-bay-publish-bar
        className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200/70 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <p className={`text-[13px] font-medium ${leftover ? "text-neutral-500" : "text-emerald-600"}`}>{leftover ? tt("还差 {n} 项就能发布", { n: leftover }) : tt("可以发布了")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={saving} onClick={() => void persist("draft")} className={BTN_SECONDARY} data-bay-action="save-draft">
            {tt("存草稿")}
          </button>
          <button type="button" disabled={saving} onClick={() => void persist("publish")} className={BTN_PRIMARY} data-bay-action="publish">
            {saving ? tt("正在检查…") : draft.status === "published" ? tt("保存修改") : tt("发布")}
          </button>
        </div>
      </footer>

      {draft.serviceId ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3" data-bay-manage>
          {draft.status === "published" ? (
            <button type="button" disabled={saving} onClick={() => void pause()} className={BTN_SECONDARY} data-bay-action="pause">
              {tt("暂停接单")}
            </button>
          ) : null}
          <button type="button" disabled={saving} onClick={() => setPendingDelete(true)} className={DANGER_BUTTON} data-bay-action="remove">
            {tt("删除")}
          </button>
        </div>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={tt("确定删除「{title}」？价格档、加购项、作品图会一起删除。", { title: draft.title || tt("未命名服务") })}
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setPendingDelete(false)}
        />
      ) : null}
    </section>
  );
}

function ServiceFormToggle({ value, onPick }: { value: "service" | "consult"; onPick: (next: "service" | "consult") => void }) {
  const tt = useUI();
  const options: { kind: "service" | "consult"; title: string; detail: string }[] = [
    { kind: "service", title: "做一件事", detail: "按约定的时间交付成果" },
    { kind: "consult", title: "答疑", detail: "按次或按小时回答问题" },
  ];
  return (
    <div className="space-y-2" data-bay-service-form>
      <p className="text-[13px] font-medium text-stone-800">{tt("服务形式")}</p>
      {options.map((option) => (
        <button
          key={option.kind}
          type="button"
          data-bay-service-form-option={option.kind}
          aria-pressed={value === option.kind}
          onClick={() => onPick(option.kind)}
          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${value === option.kind ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"}`}
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-neutral-900">{tt(option.title)}</span>
            <span className="mt-0.5 block text-[12px] leading-5 text-neutral-500">{tt(option.detail)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const SECTION_TONE: Readonly<Record<PublishSection, string>> = {
  product: "bg-stone-400",
  price: "bg-stone-400",
  terms: "bg-stone-400",
};

function SectionCard({
  index,
  section,
  missing,
  highlight,
  hint,
  onRef,
  children,
}: {
  index: number;
  section: PublishSection;
  missing: string[];
  highlight: boolean;
  hint: string;
  onRef: (node: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const tt = useUI();
  const done = missing.length === 0;
  return (
    <section
      ref={onRef}
      data-bay-section={section}
      data-bay-section-done={done ? "true" : "false"}
      className={`scroll-mt-4 rounded-xl border bg-white p-4 sm:p-5 ${highlight ? "border-rose-300" : "border-stone-200"}`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold text-white ${done ? "bg-stone-900" : SECTION_TONE[section]}`}
          >
            {done ? "✓" : index}
          </span>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-stone-900">{tt(SECTION_LABELS[section])}</h3>
            <p className="mt-0.5 text-[13px] text-stone-500">{hint}</p>
          </div>
        </div>
        <p
          className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${
            highlight ? "bg-rose-50 text-rose-600" : done ? "bg-stone-100 text-stone-700" : "bg-stone-100 text-stone-500"
          }`}
        >
          {done ? tt("已填好") : tt("还差 {n} 项", { n: missing.length })}
        </p>
      </header>
      {highlight && missing.length ? <p className="mb-3 text-[12.5px] text-rose-600">{missing.map((item) => tt(item)).join("、")}</p> : null}
      <div className="space-y-4">{children}</div>
    </section>
  );
}
