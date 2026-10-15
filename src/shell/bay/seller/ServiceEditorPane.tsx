"use client";

// 发布：一进就是填写表（封面图在最前），类别只是表上的选择器。一张表三块（产品信息 / 价格 / 交付条款）。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { fetchBayCategories } from "../../../lib/bay/categories";
import {
  createMyConsult,
  createMyService,
  createServiceMedia,
  deleteMyService,
  deleteServiceMedia,
  getDomainPrompts,
  getSellerProfile,
  getServicePricing,
  hiddenCaseFor,
  listConsultDomains,
  listMyContentCases,
  listMyServices,
  listPricingModels,
  listServiceFaq,
  listServiceMedia,
  listServiceTiers,
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
  type BayPricingModel,
  type BaySellerCategory,
  type BaySellerProfile,
  type BayServicePricing,
} from "../../../lib/bay/seller";
import { ConfirmDialog } from "../../../ui";
import { useToast } from "../../../ui/Toast";
import { getCurrentArtifactItem } from "../../artifact-client";
import {
  applyDigitalWorks,
  BayAutoTextarea,
  BayDigitalWorksField,
  BAY_FILES_LABEL,
  BayPublishKindPair,
  BayPublishShell,
  BayPublishSubcategoryLabel,
  BayRevealForm,
  consumePublishListing,
  httpsWorkUrl,
  howYouDeliverRow,
  listingAudienceItem,
  listingPriceItems,
  listingSectionGroups,
  listingTermsItems,
  offerFromListing,
  type BayOfferKind,
  type BayPostSnapshot,
  type BayRevealItem,
  type ListingGroupId,
} from "../form";
import { ensureBayTerms } from "../settings";
import { stripLeoCategoryPrefix } from "../shell/bay-links";
import { openBay, requireBayLogin, useBaySignedIn, useBaySiteKey, type BayPaneProps } from "../shell/bay-state";
import {
  TITLE_MAX,
  clientKey,
  consultInput,
  draftFromLoaded,
  emptyDraft,
  freshPublishDraft,
  hasPreviewImage,
  imageUrlsOf,
  draftFromGalleryUrls,
  mediaForDigitalWorks,
  prefillFieldsFromTiers,
  pricingInput,
  publishKindOf,
  PUBLISH_KIND_LABELS,
  resolvedPriceFen,
  resolvedPricingModel,
  sectionMissing,
  serviceInput,
  specsFor,
  tierRows,
  type EditorContext,
  type EditorDraft,
  type PublishKind,
} from "./editor-model";
import {
  CategorySelect,
  MediaStep,
  ModelStep,
  OverreachHintList,
} from "./editor-steps";
import { BAY_FORM_BAR_CLASS, BAY_FORM_PAGE_CLASS } from "../form/form-ui";
import { DANGER_BUTTON, HiddenByPlatformNotice, INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerNotice } from "./seller-ui";

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "";
}

/** 必填项的缺项文案 → 页面上对应的那一项与它所在的组；顺序就是页面从上到下的顺序。 */
const MISSING_ITEMS: { label: string; item: string; group: ListingGroupId }[] = [
  { label: "分类", item: "category", group: "product" },
  { label: "至少一张预览图", item: "cover", group: "product" },
  { label: "标题", item: "title", group: "product" },
  { label: "放文件", item: "files", group: "product" },
  { label: "价格要大于 0", item: "price", group: "price" },
  { label: "免费协作的价格要是 0", item: "price", group: "price" },
  { label: "向谁展示", item: "who", group: "audience" },
  { label: "计费方式", item: "billing-model", group: "terms" },
  { label: "交付天数", item: "delivery-days", group: "terms" },
];

function isOfficialProfile(profile: BaySellerProfile | null): boolean {
  return profile?.official === true;
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

  const [draft, setDraft] = useState<EditorDraft>(() => {
    const pending = consumePublishListing();
    return freshPublishDraft(tt, pending && pending !== "need" ? offerFromListing(pending) : "digital");
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rejection, setRejection] = useState("");
  const [hiddenMessage, setHiddenMessage] = useState("");
  const [load, setLoad] = useState<{ loading: boolean; error: string }>({ loading: Boolean(routeId), error: "" });
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
  // 点过发布但还有必填项没填：之后页面一直标出缺的项，补好一项就少一项。
  const [attempted, setAttempted] = useState(false);
  const [focusReq, setFocusReq] = useState<{ item: string; n: number } | null>(null);
  const termsOk = useRef(false);
  const formEl = useRef<HTMLElement | null>(null);

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
    if (routeId) setLoad({ loading: true, error: "" });
    void (async () => {
      try {
        const [profileBody, categoriesBody] = await Promise.all([getSellerProfile(), fetchBayCategories()]);
        if (!alive) return;
        const nextProfile = profileBody.profile || null;
        const categoryRows = (categoriesBody.flat_items.length ? categoriesBody.flat_items : categoriesBody.items) as BaySellerCategory[];
        setProfile(nextProfile);
        setCategories(categoryRows);
        listMyContentCases().then((rows) => alive && setCases(rows), () => {});
        if (!routeId) {
          setDraft((current) => {
            const next = { ...current, official: isOfficialProfile(nextProfile) };
            if (!next.category && presetCategory && wizardCategories(categoryRows, "delivery").some((row) => row.slug === presetCategory)) {
              next.category = presetCategory;
            }
            return next;
          });
          setLoad({ loading: false, error: "" });
          return;
        }
        const [services, tiers, faq, media, pricingBody] = await Promise.all([
          listMyServices(),
          listServiceTiers(routeId),
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
        const loaded = draftFromLoaded({ service, tiers: tiers.items || [], faq: faq.items || [], media: media.items || [], pricing: pricingBody }, tt);
        loaded.official = loaded.official || isOfficialProfile(nextProfile);
        setDraft(loaded);
        setDirty(false);
        setAttempted(false);
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

  // 跳到缺的那一项：先等高亮把收着的组撑开，再滚到位并把光标放进去。
  useEffect(() => {
    if (!focusReq) return;
    const node = formEl.current?.querySelector<HTMLElement>(`[data-bay-reveal-item="${focusReq.item}"]`);
    if (!node) return;
    node.scrollIntoView?.({ block: "center", behavior: "smooth" });
    node.querySelector<HTMLElement>("input:not([type=file]), textarea, button")?.focus({ preventScroll: true });
  }, [focusReq]);

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
  const missingLabels = new Set<string>([...missing.product, ...missing.price, ...missing.terms]);
  const missingItems = MISSING_ITEMS.filter((row) => missingLabels.has(row.label));
  const invalidItems = new Set(attempted ? missingItems.map((row) => row.item) : []);
  const highlight: ListingGroupId | null = attempted ? missingItems[0]?.group ?? null : null;
  const groupMissing = (group: ListingGroupId) => missingItems.filter((row) => row.group === group).map((row) => tt(row.label));
  const hiddenCase = hiddenCaseFor(cases, "talent_service", draft.serviceId || undefined);
  const currency = (profile?.currency || "USD").toUpperCase();
  const narrow = layout === "docked" || layout === "mobile";

  const patch = useCallback((next: Partial<EditorDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);

  function pickKind(next: PublishKind, extra?: Partial<EditorDraft>) {
    if (draft.serviceId) {
      if (extra) patch(extra);
      return;
    }
    if (publishKindOf(draft) === next) {
      if (extra) patch(extra);
      return;
    }
    const base = emptyDraft(tt);
    base.official = draft.official || isOfficialProfile(profile);
    base.catalogKind = next === "consult" ? "consult" : "delivery";
    base.listingKind = next === "digital" ? "digital" : "service";
    base.offerKind = extra?.offerKind || (next === "digital" ? "digital" : "service");
    base.simplePrice = true;
    base.title = draft.title;
    base.coverUrl = draft.coverUrl;
    base.media = draft.media;
    base.description = draft.description;
    base.category = draft.category;
    base.digitalWork = draft.digitalWork;
    base.digitalWorks = draft.digitalWorks;
    base.customTerms = draft.customTerms;
    base.audience = draft.audience;
    base.deadlineAt = draft.deadlineAt;
    base.consultUnit = draft.consultUnit;
    base.consultRounds = draft.consultRounds;
    base.consultMinutes = draft.consultMinutes;
    base.responseWindow = draft.responseWindow;
    base.tiers = draft.tiers;
    if (!base.category && (next === "service" || next === "digital") && presetCategory && wizardCategories(categories, "delivery").some((row) => row.slug === presetCategory)) {
      base.category = presetCategory;
    }
    setDraft({ ...base, ...extra });
    setDirty(true);
    setAttempted(false);
  }

  function pickOffer(next: BayOfferKind) {
    if (draft.offerKind === next && !draft.serviceId) return;
    pickKind(next === "service" ? "service" : "digital", {
      offerKind: next,
      listingKind: next === "service" || next === "other" ? "service" : "digital",
      catalogKind: "delivery",
    });
  }

  function applySnapshot(snapshot: BayPostSnapshot) {
    const nextKind: PublishKind = snapshot.kind === "consult" ? "consult" : snapshot.kind === "digital" ? "digital" : "service";
    const first = draft.tiers[0];
    pickKind(nextKind, {
      title: snapshot.title || draft.title,
      description: snapshot.description || draft.description,
      summary: snapshot.summary || draft.summary,
      scopeNote: snapshot.scopeNote || draft.scopeNote,
      responseWindow: snapshot.responseWindow || draft.responseWindow,
      consultUnit: snapshot.billing === "hour" ? "hour" : snapshot.billing === "session" ? "session" : draft.consultUnit,
      consultRounds: snapshot.consultRounds ?? draft.consultRounds,
      consultMinutes: snapshot.consultMinutes ?? draft.consultMinutes,
      coverUrl: snapshot.coverUrl?.startsWith("https://") ? snapshot.coverUrl : draft.coverUrl,
      ...(snapshot.coverUrls?.length ? draftFromGalleryUrls(draft, snapshot.coverUrls) : {}),
      ...(snapshot.materialKind
        ? applyDigitalWorks([])
        : snapshot.previewArtifactId
          ? applyDigitalWorks([
              {
                id: snapshot.previewArtifactId,
                title: snapshot.previewWorkTitle || snapshot.previewArtifactId,
                kind: "artifact" as const,
              },
            ])
          : applyDigitalWorks(draft.digitalWorks.length ? draft.digitalWorks : draft.digitalWork ? [draft.digitalWork] : [])),
      license: snapshot.license === "personal" || snapshot.license === "commercial" ? snapshot.license : draft.license,
      priceUnset: snapshot.priceFen == null,
      tiers: draft.tiers.map((tier, index) =>
        index === 0
          ? {
              ...tier,
              price_fen: snapshot.priceFen ?? first?.price_fen ?? 0,
              delivery_days: snapshot.deliveryDays === undefined ? tier.delivery_days : snapshot.deliveryDays,
            }
          : tier,
      ),
    });
  }

  function changeCategory(slug: string) {
    patch({ category: slug, fieldValues: {} });
  }

  // 免费只由价格框表达：价格是 0 就是免费，填了正数再从免费切回一口价。
  function setSimplePrice(fen: number | null) {
    setDraft((current) => ({
      ...current,
      priceUnset: fen == null,
      pricingModel: fen == null ? current.pricingModel : fen === 0 ? "free" : current.pricingModel === "free" ? "fixed" : current.pricingModel,
      tiers: current.tiers.map((tier, index) => (index === 0 ? { ...tier, price_fen: fen ?? 0, enabled: true } : tier)),
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

  function reportFailure(error: unknown, fallback: string) {
    const message = errorText(error) || fallback;
    setRejection(message);
    toast.error(tt(message));
  }

  async function saveBase(): Promise<string | null> {
    if (!draft.title.trim()) {
      setRejection(tt("请先填写标题"));
      setAttempted(true);
      setFocusReq((current) => ({ item: "title", n: (current?.n ?? 0) + 1 }));
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
    await replaceServiceTiers(sid, tierRows(draft));
  }

  async function saveMedia(sid: string): Promise<void> {
    const works = draft.digitalWorks.length ? draft.digitalWorks : draft.digitalWork ? [draft.digitalWork] : [];
    const resolved = await Promise.all(
      works.map(async (work) => {
        if (httpsWorkUrl(work.url) && httpsWorkUrl(work.thumbUrl)) return work;
        try {
          const result = await getCurrentArtifactItem(work.id);
          if (!result.ok || !result.data) return work;
          const url = httpsWorkUrl(work.url) || httpsWorkUrl(result.data.url) || httpsWorkUrl(result.data.previewUrl);
          const thumbUrl = httpsWorkUrl(work.thumbUrl) || httpsWorkUrl(result.data.posterUrl) || httpsWorkUrl(result.data.thumbUrl);
          return { ...work, ...(url ? { url } : {}), ...(thumbUrl ? { thumbUrl } : {}) };
        } catch {
          return work;
        }
      }),
    );
    const syncedWorks = applyDigitalWorks(resolved);
    if (syncedWorks.digitalWorks.some((work, index) => work.url !== works[index]?.url || work.thumbUrl !== works[index]?.thumbUrl)) {
      patch(syncedWorks);
    }
    const synced = mediaForDigitalWorks({ ...draft, ...syncedWorks });
    await Promise.all(synced.deletedMediaIds.map((id) => deleteServiceMedia(sid, id)));
    await Promise.all(
      synced.media
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
      if (missingItems.length) {
        setAttempted(true);
        setFocusReq((current) => ({ item: missingItems[0].item, n: (current?.n ?? 0) + 1 }));
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
    onCover: (url: string) => {
      patch(draftFromGalleryUrls(draft, url ? [url, ...imageUrlsOf(draft).filter((item) => item !== url)] : []));
    },
    onUrls: (urls: string[]) => {
      patch(draftFromGalleryUrls(draft, urls));
    },
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

  const publishKind: PublishKind = kind || "digital";
  const coverDone = hasPreviewImage(draft);
  const categoryName = stripLeoCategoryPrefix(tt(selectedCategory?.name_zh || ""));
  const titleRow = revealRow(
    "title",
    tt("标题"),
    Boolean(draft.title.trim()),
    <>
      <input className={INPUT_CLASS} data-bay-field="title" value={draft.title} maxLength={TITLE_MAX} onChange={(event) => patch({ title: event.target.value })} />
      <OverreachHintList text={draft.title} />
    </>,
    { summary: draft.title.trim() || undefined, required: true },
  );
  const offerKind: BayOfferKind = draft.offerKind || (publishKind === "service" ? "service" : "digital");
  // 人工服务与「其他」都走服务的定价与条款；成品文件、作品、课程各有自己的一套。
  const pricedOffer = offerKind === "service" || offerKind === "other";
  const coverRow = revealRow("cover", tt("作品图"), coverDone, <MediaStep {...mediaProps} plain imagesOnly />, {
    summary: coverDone ? tt("已填好") : undefined,
    alwaysOpen: true,
    required: true,
  });
  const descriptionRow = revealRow(
    "description",
    tt("详细介绍"),
    Boolean(draft.description.trim()),
    <BayAutoTextarea
      data-bay-field="description"
      maxLength={20000}
      value={draft.description}
      onChange={(event) => patch({ description: event.target.value })}
    />,
    { summary: draft.description.trim() ? tt("已填好") : undefined, optional: true },
  );
  const filesRow = revealRow(
    "files",
    tt(BAY_FILES_LABEL),
    Boolean((draft.digitalWorks[0] ?? draft.digitalWork)?.id),
    <BayDigitalWorksField
      works={draft.digitalWorks.length ? draft.digitalWorks : draft.digitalWork ? [draft.digitalWork] : []}
      onChange={(works) => patch(applyDigitalWorks(works))}
    />,
    {
      summary: (draft.digitalWorks[0] ?? draft.digitalWork)?.title || (draft.digitalWorks[0] ?? draft.digitalWork)?.id,
      alwaysOpen: true,
      optional: pricedOffer || offerKind === "lesson",
      required: offerKind === "digital" || offerKind === "app",
    },
  );
  const flagged = (items: BayRevealItem[]) => items.map((item) => (invalidItems.has(item.id) ? { ...item, invalid: true } : item));
  const productItems: BayRevealItem[] = flagged([coverRow, titleRow, descriptionRow, filesRow]);
  const priceFen = draft.priceUnset ? null : draft.tiers[0]?.price_fen ?? null;
  const billingValue: "service" | "session" | "hour" =
    !pricedOffer ? "service" : draft.pricingModel === "hour" ? "hour" : draft.pricingModel === "session" ? "session" : "service";
  const appPriceModel = draft.pricingModel === "subscription" ? "subscription" : "one_time";
  const priceItems = listingPriceItems(tt, {
    offerKind,
    priceFen,
    onPriceFen: setSimplePrice,
    appPriceModel,
    onAppPriceModel: (value) => patch({ pricingModel: value, simplePrice: true }),
  });
  // 计费方式排在交付条款的第一项：一口价 / 按次 / 按时 / 分阶段，各带结算规则与自动验收天数。
  const billingModel = models.data.find((model) => model.key === resolvedPricingModel(draft));
  const billingItem: BayRevealItem[] = pricedOffer
    ? [
        {
          id: "billing-model",
          label: tt("计费方式"),
          done: Boolean(billingModel),
          required: true,
          summary: billingModel ? tt(billingModel.name_zh) : undefined,
          children: (
            <ModelStep
              plain
              models={models.data.filter((model) => model.key !== "free")}
              loading={models.loading}
              error={models.error}
              onReload={() => setModelNonce((value) => value + 1)}
              selected={resolvedPricingModel(draft)}
              onSelect={(key) => patch({ pricingModel: key })}
            />
          ),
        },
      ]
    : [];
  const termsItems = flagged([...billingItem, ...listingTermsItems(tt, {
    offerKind,
    billing: billingValue,
    deliveryDays: draft.tiers[0]?.delivery_days ?? null,
    onDeliveryDays: setDeliveryDays,
    revisions: draft.tiers[0]?.revisions ?? 0,
    onRevisions: setRevisions,
    consultRounds: draft.consultRounds,
    onConsultRounds: (consultRounds) => patch({ consultRounds }),
    consultMinutes: draft.consultMinutes,
    onConsultMinutes: (consultMinutes) => patch({ consultMinutes }),
    deadline: draft.deadlineAt,
    onDeadline: (deadlineAt) => patch({ deadlineAt }),
    customTerms: draft.customTerms,
    onCustomTerms: (customTerms) => patch({ customTerms }),
  })]);

  const listingKind = pricedOffer ? "service" : offerKind;
  const previewWork = draft.digitalWorks[0] ?? draft.digitalWork;
  const snapshot: BayPostSnapshot = {
    kind: listingKind,
    title: draft.title,
    description: draft.description,
    summary: draft.summary,
    coverUrl: draft.coverUrl,
    coverUrls: imageUrlsOf(draft),
    previewArtifactId: previewWork?.kind === "artifact" ? previewWork.id : undefined,
    previewWorkTitle: previewWork?.title,
    categoryLabel: categoryName,
    priceFen: priceFen ?? undefined,
    billing: pricedOffer ? (billingValue === "hour" ? "hour" : billingValue === "session" ? "session" : "delivery") : "delivery",
    deliveryDays: draft.tiers[0]?.delivery_days ?? null,
    license: draft.license,
    customTerms: draft.customTerms,
    deadlineLabel: draft.deadlineAt || undefined,
    scopeNote: draft.scopeNote,
    consultRounds: draft.consultRounds,
    consultMinutes: draft.consultMinutes,
    responseWindow: draft.responseWindow,
  };

  return (
    <BayPublishShell kind={listingKind} snapshot={snapshot} onApply={applySnapshot}>
    <section ref={formEl} data-bay-pane="service-editor" data-bay-publish="form" className={narrow ? "flex flex-col gap-6 p-4" : BAY_FORM_PAGE_CLASS}>
      {draft.serviceId ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-neutral-600" data-bay-editor-status={draft.status}>
            <span className="rounded-md bg-stone-900 px-2 py-0.5 text-[12px] font-medium text-white">{tt(PUBLISH_KIND_LABELS[publishKind])}</span>
            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-600">{statusLabel}</span>
            {dirty ? <span className="text-[12px] text-amber-600">{tt("有没保存的修改")}</span> : null}
          </p>
        </div>
      ) : (
        <BayPublishKindPair
          listing={offerKind === "service" || offerKind === "other" ? "service" : offerKind === "app" ? "app" : offerKind === "lesson" ? "lesson" : "digital"}
          siteCategory={presetCategory}
          subcategory={
            <>
              <BayPublishSubcategoryLabel required invalid={invalidItems.has("category")} />
              <CategorySelect categories={visibleCategories} value={draft.category} onChange={changeCategory} />
            </>
          }
        />
      )}

      {draft.moderationHidden ? <HiddenByPlatformNotice what="service" caseRow={hiddenCase} /> : null}
      {hiddenMessage && !hiddenCase ? <SellerNotice tone="warn">{hiddenMessage}</SellerNotice> : null}

      <BayRevealForm
        groups={listingSectionGroups({
          tt,
          intent: "sell",
          productItems,
          priceItems,
          audienceItems: flagged([listingAudienceItem(tt, draft.audience, (audience) => patch({ audience }))]),
          offerItems: flagged([howYouDeliverRow(tt, offerKind, pickOffer)]),
          termsItems,
          highlight,
          missing: {
            product: groupMissing("product"),
            price: groupMissing("price"),
            audience: groupMissing("audience"),
            terms: groupMissing("terms"),
          },
        })}
      />

      {rejection ? (
        <SellerNotice tone="error">
          <span className="font-semibold">{tt("这一步没有保存成功")}</span>
          <span className="mt-1 block whitespace-pre-wrap">{tt(rejection)}</span>
        </SellerNotice>
      ) : null}

      <footer
        data-bay-publish-bar
        className={`${BAY_FORM_BAR_CLASS} justify-end`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={saving} onClick={() => void persist("draft")} className={SECONDARY_BUTTON} data-bay-action="save-draft">
            {tt("存草稿")}
          </button>
          <button type="button" disabled={saving} onClick={() => void persist("publish")} className={PRIMARY_BUTTON} data-bay-action="publish">
            {saving ? tt("正在检查…") : draft.status === "published" ? tt("保存修改") : tt("发布")}
          </button>
        </div>
      </footer>

      {draft.serviceId ? (
        <div className="flex flex-wrap items-center gap-2" data-bay-manage>
          {draft.status === "published" ? (
            <button type="button" disabled={saving} onClick={() => void pause()} className={SECONDARY_BUTTON} data-bay-action="pause">
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
          title={tt("确定删除「{title}」？价格、作品图会一起删除。", { title: draft.title || tt("未命名服务") })}
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setPendingDelete(false)}
        />
      ) : null}
    </section>
    </BayPublishShell>
  );
}

function revealRow(
  id: string,
  label: string,
  done: boolean,
  children: ReactNode,
  extra?: { summary?: string; optional?: boolean; required?: boolean; alwaysOpen?: boolean },
): BayRevealItem {
  return { id, label, done, children, summary: extra?.summary, optional: extra?.optional, required: extra?.required, alwaysOpen: extra?.alwaysOpen };
}

