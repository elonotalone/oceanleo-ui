"use client";

// 「发布服务」向导（移植自 talent `ServiceWizard.tsx`）：选形态 → 填写 → 存草稿 → 预览 → 上架。
// 新建时记下当前站（posted_site）；上架前先过 ensureBayTerms("seller")，返回 false 就不上架。
// 编辑已有服务（target.serviceId）、暂停、删除；被平台隐藏时写清原因和申诉入口。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  updateMyService,
  wizardCategories,
  type BayCatalogKind,
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
import { openBaySettings, ensureBayTerms } from "../settings";
import { openBay, requireBayLogin, useBaySignedIn, useBaySiteKey, type BayPaneProps } from "../shell/bay-state";
import { ServiceCard } from "../supply";
import {
  STEP_LABELS,
  blockedReason,
  clientKey,
  consultInput,
  draftFromLoaded,
  emptyDraft,
  faqRowsForSave,
  isLocalStep,
  moneyText,
  normalizeCurrency,
  previewFeedItem,
  prefillFieldsFromTiers,
  pricingInput,
  publishChecks,
  readyToPublish,
  serviceInput,
  specsFor,
  stepsFor,
  tierRows,
  type EditorContext,
  type EditorDraft,
  type EditorStep,
} from "./editor-model";
import {
  AddonsStep,
  BasicsStep,
  ConsultPricingStep,
  DetailsStep,
  DomainStep,
  FaqStep,
  FieldsStep,
  KindStep,
  MediaStep,
  ModelStep,
  PromptsStep,
  PublishChecklist,
  TiersStep,
} from "./editor-steps";
import { DANGER_BUTTON, HiddenByPlatformNotice, LINK_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerNotice } from "./seller-ui";

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "";
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

  const [draft, setDraft] = useState<EditorDraft>(() => emptyDraft(tt));
  const [step, setStep] = useState<EditorStep>("kind");
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
  const [pendingLeave, setPendingLeave] = useState<EditorStep | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const termsOk = useRef(false);

  // ---- 载入 ----------------------------------------------------------------------
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
        setProfile(profileBody.profile || null);
        setCategories((categoriesBody.flat_items.length ? categoriesBody.flat_items : categoriesBody.items) as BaySellerCategory[]);
        listMyContentCases().then((rows) => alive && setCases(rows), () => {});
        if (!routeId) {
          setDraft(emptyDraft(tt));
          setStep("kind");
          setDirty(false);
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
        setDraft(draftFromLoaded({ service, tiers: tiers.items || [], addons: addons.items || [], faq: faq.items || [], media: media.items || [], pricing: pricingBody }, tt));
        setStep("basics");
        setDirty(false);
        setLoad({ loading: false, error: "" });
      } catch (error) {
        if (alive) setLoad({ loading: false, error: errorText(error) || tt("服务加载失败，请稍后再试。") });
      }
    })();
    return () => {
      alive = false;
    };
    // tt 每次渲染都可能是新函数；只按服务与重试键重新载入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, routeId, nonce]);

  const isConsult = draft.catalogKind === "consult";

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

  // ---- 派生 ----------------------------------------------------------------------
  const steps = stepsFor(draft.catalogKind);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const currentStep = steps[stepIndex];
  const visibleCategories = useMemo(
    () => wizardCategories(categories, isConsult ? "consult" : "delivery", isConsult ? draft.domain : undefined),
    [categories, isConsult, draft.domain],
  );
  const selectedCategory = categories.find((row) => row.slug === draft.category);
  const selectedModel = models.data.find((model) => model.key === draft.pricingModel);
  const specs = useMemo(() => (isConsult ? [] : specsFor(draft, pricing, selectedCategory)), [isConsult, draft, pricing, selectedCategory]);
  const ctx: EditorContext = { profile, categories, specs, domainKeys: domains.data.map((row) => row.key) };
  const checks = publishChecks(draft, ctx);
  const ready = readyToPublish(checks);
  const hiddenCase = hiddenCaseFor(cases, "talent_service", draft.serviceId || undefined);
  const currency = normalizeCurrency(profile?.currency);
  const narrow = layout === "docked" || layout === "mobile";

  // ---- 编辑 ----------------------------------------------------------------------
  const patch = useCallback((next: Partial<EditorDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);

  function changeKind(kind: BayCatalogKind) {
    if (draft.serviceId) return;
    setDraft((current) => ({ ...current, catalogKind: kind, category: "", domain: "", fieldValues: {}, pricingModel: kind === "consult" ? "" : current.pricingModel }));
    setDirty(true);
  }

  function changeCategory(slug: string) {
    patch({ category: slug, fieldValues: {} });
  }

  function changeTier(index: number, next: Partial<EditorDraft["tiers"][number]>) {
    setDraft((current) => ({ ...current, tiers: current.tiers.map((tier, i) => (i === index ? { ...tier, ...next } : tier)) }));
    setDirty(true);
  }

  function applyGoTo(next: EditorStep) {
    if (next === "fields") setDraft((current) => ({ ...current, fieldValues: prefillFieldsFromTiers(specs, current.fieldValues, current.tiers) }));
    setStep(next);
  }

  function goTo(next: EditorStep) {
    const index = steps.indexOf(next);
    if (index < 0 || next === currentStep) return;
    const basicsIndex = steps.indexOf("basics");
    if (!isConsult && !draft.serviceId && basicsIndex >= 0 && index > basicsIndex) {
      toast.info(tt("先保存「它是什么」这一步，草稿建好后才能往后填。"));
      return;
    }
    if (dirty && !isLocalStep(currentStep, draft.catalogKind)) {
      setPendingLeave(next);
      return;
    }
    applyGoTo(next);
  }

  // ---- 保存 ----------------------------------------------------------------------
  async function termsForPublishedSave(): Promise<boolean> {
    if (draft.status !== "published" || termsOk.current) return true;
    termsOk.current = await ensureBayTerms("seller");
    return termsOk.current;
  }

  function reportFailure(error: unknown, fallback: string) {
    const message = errorText(error) || fallback;
    setRejection(message);
    toast.error(tt(message));
  }

  async function saveBase(): Promise<string | null> {
    if (!draft.title.trim()) {
      toast.error(tt("请先填写标题"));
      return null;
    }
    const input = serviceInput(draft, selectedModel);
    const body = draft.serviceId ? await updateMyService(draft.serviceId, input) : await createMyService(input, postedSite);
    const saved = body.service;
    if (!saved?.id) throw new Error(tt("草稿保存失败，请稍后再试。"));
    setDraft((current) => ({ ...current, serviceId: saved.id, status: saved.status || current.status, moderationHidden: saved.moderation_hidden === true || current.moderationHidden }));
    return saved.id;
  }

  async function savePricing(sid: string): Promise<void> {
    const input = pricingInput(draft, specs);
    if (!input) return;
    const body = await saveServicePricing(sid, input);
    setPricing(body);
  }

  async function saveTiers(sid: string): Promise<void> {
    await replaceServiceTiers(sid, tierRows(draft));
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

  async function saveCurrentStep() {
    if (saving) return;
    const blocked = blockedReason(currentStep, draft, ctx);
    if (blocked) {
      toast.error(tt(blocked.message, blocked.vars));
      return;
    }
    const nextStep = steps[Math.min(steps.length - 1, stepIndex + 1)];
    if (isLocalStep(currentStep, draft.catalogKind)) {
      goToAfterSave(nextStep);
      return;
    }
    if (!(await termsForPublishedSave())) return;
    setSaving(true);
    try {
      const created = !draft.serviceId;
      const sid = await saveBase();
      if (!sid) return;
      if (currentStep === "basics" || currentStep === "model" || currentStep === "fields") await savePricing(sid);
      if (currentStep === "pricing") await saveTiers(sid);
      if (currentStep === "addons") await saveAddons(sid);
      if (currentStep === "details" || currentStep === "faq") await saveFaqs(sid);
      if (currentStep === "media") await saveMedia(sid);
      setRejection("");
      setDirty(false);
      toast.success(created ? tt("草稿已建好") : tt("这一步已保存"));
      goToAfterSave(nextStep);
    } catch (error) {
      reportFailure(error, "保存失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  }

  function goToAfterSave(next: EditorStep) {
    if (next === "fields") setDraft((current) => ({ ...current, fieldValues: prefillFieldsFromTiers(specs, current.fieldValues, current.tiers) }));
    setStep(next);
  }

  async function saveEverything(sid: string) {
    await savePricing(sid);
    await saveTiers(sid);
    await saveAddons(sid);
    await saveFaqs(sid);
    await saveMedia(sid);
  }

  async function saveAsDraft() {
    if (saving) return;
    if (!(await termsForPublishedSave())) return;
    setSaving(true);
    try {
      const sid = await saveBase();
      if (!sid) return;
      await saveEverything(sid);
      setRejection("");
      setDirty(false);
      toast.success(draft.status === "published" ? tt("修改已保存") : tt("草稿已保存"));
    } catch (error) {
      reportFailure(error, "保存失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (saving || !ready) return;
    if (!(await ensureBayTerms("seller"))) {
      toast.info(tt("没有同意卖家条款，服务还没有上架。"));
      return;
    }
    termsOk.current = true;
    setSaving(true);
    try {
      if (isConsult) {
        await createMyConsult(consultInput(draft, "published"), postedSite);
        setDirty(false);
        toast.success(tt("答疑已上架"));
        openBay({ kind: "mine", tab: "services" });
        return;
      }
      const sid = await saveBase();
      if (!sid) return;
      await saveEverything(sid);
      const result = await publishMyService(sid, pricingInput(draft, specs));
      const hidden = result.moderation_hidden === true || result.service?.moderation_hidden === true;
      setDraft((current) => ({ ...current, status: "published", moderationHidden: hidden }));
      setHiddenMessage(hidden ? result.moderation_message || "" : "");
      setRejection("");
      setDirty(false);
      toast.success(hidden ? tt("已上架，但被平台暂时隐藏") : tt("服务已上架，买家现在能在 Bay 里看到它"));
    } catch (error) {
      reportFailure(error, tt("上架没有通过，请按提示修改后再试。"));
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

  function remove() {
    if (saving || !draft.serviceId) return;
    setPendingDelete(true);
  }

  async function confirmRemove() {
    if (saving || !draft.serviceId) return;
    setPendingDelete(false);
    setSaving(true);
    try {
      await deleteMyService(draft.serviceId);
      toast.success(tt("服务已删除"));
      openBay({ kind: "mine", tab: "services" });
    } catch (error) {
      reportFailure(error, tt("删除失败，请稍后再试。"));
    } finally {
      setSaving(false);
    }
  }

  // ---- 渲染 ----------------------------------------------------------------------
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

  function renderStep() {
    switch (currentStep) {
      case "kind":
        return <KindStep selected={draft.catalogKind} locked={Boolean(draft.serviceId)} onSelect={changeKind} />;
      case "domain":
        return (
          <DomainStep
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
        );
      case "prompts":
        return (
          <PromptsStep
            domainName={tt(domains.data.find((row) => row.key === draft.domain)?.name_zh || "")}
            prompts={prompts.data}
            loading={prompts.loading}
            error={prompts.error}
            onReload={() => setPromptNonce((value) => value + 1)}
          />
        );
      case "basics":
        return (
          <BasicsStep
            kind={draft.catalogKind || "delivery"}
            title={draft.title}
            onTitle={(value) => patch({ title: value })}
            category={draft.category}
            onCategory={changeCategory}
            categories={visibleCategories}
            summary={draft.summary}
            onSummary={(value) => patch({ summary: value })}
            deliveryMode={draft.deliveryMode}
            onDeliveryMode={(mode) => patch({ deliveryMode: mode })}
            scopeNote={draft.scopeNote}
            onScopeNote={(value) => patch({ scopeNote: value })}
          />
        );
      case "model":
        return (
          <ModelStep
            models={models.data}
            loading={models.loading}
            error={models.error}
            onReload={() => setModelNonce((value) => value + 1)}
            selected={draft.pricingModel}
            onSelect={(key) => patch({ pricingModel: key, tiers: key === "free" ? draft.tiers.map((tier) => ({ ...tier, price_fen: 0 })) : draft.tiers })}
          />
        );
      case "fields":
        return (
          <FieldsStep
            specs={specs}
            values={draft.fieldValues}
            categoryName={tt(selectedCategory?.name_zh || "")}
            onChange={(key: string, value: BayFieldValue) => patch({ fieldValues: { ...draft.fieldValues, [key]: value } })}
          />
        );
      case "pricing":
        return isConsult ? (
          <ConsultPricingStep
            currency={currency}
            unit={draft.consultUnit}
            onUnit={(unit) => patch({ consultUnit: unit })}
            priceFen={draft.tiers[0]?.price_fen || 0}
            onPriceFen={(fen) => changeTier(0, { price_fen: fen })}
            rounds={draft.consultRounds}
            onRounds={(value) => patch({ consultRounds: value })}
            minutes={draft.consultMinutes}
            onMinutes={(value) => patch({ consultMinutes: value })}
            responseWindow={draft.responseWindow}
            onResponseWindow={(value) => patch({ responseWindow: value })}
          />
        ) : (
          <TiersStep
            tiers={draft.tiers}
            currency={currency}
            free={draft.pricingModel === "free"}
            onChange={changeTier}
            onBasicOnly={() => patch({ tiers: draft.tiers.map((tier, index) => ({ ...tier, enabled: index === 0 })) })}
          />
        );
      case "addons":
        return (
          <AddonsStep
            addons={draft.addons}
            currency={currency}
            onChange={(key, next) => patch({ addons: draft.addons.map((addon) => (addon.key === key ? { ...addon, ...next } : addon)) })}
            onAdd={() => patch({ addons: [...draft.addons, { key: clientKey("addon"), title: "", description: "", price_fen: 0, extra_days: 0, enabled: true }] })}
            onRemove={(key) => {
              const row = draft.addons.find((addon) => addon.key === key);
              patch({ addons: draft.addons.filter((addon) => addon.key !== key), deletedAddonIds: row?.id ? [...draft.deletedAddonIds, row.id] : draft.deletedAddonIds });
            }}
          />
        );
      case "details":
        return <DetailsStep description={draft.description} onDescription={(value) => patch({ description: value })} buyerInputs={draft.buyerInputs} onBuyerInputs={(value) => patch({ buyerInputs: value })} />;
      case "faq":
        return (
          <FaqStep
            items={draft.faqs}
            onChange={(key, next) => patch({ faqs: draft.faqs.map((faq) => (faq.key === key ? { ...faq, ...next } : faq)) })}
            onAdd={() => patch({ faqs: [...draft.faqs, { key: clientKey("faq"), question: "", answer: "" }] })}
            onRemove={(key) => {
              const row = draft.faqs.find((faq) => faq.key === key);
              patch({ faqs: draft.faqs.filter((faq) => faq.key !== key), deletedFaqIds: row?.id ? [...draft.deletedFaqIds, row.id] : draft.deletedFaqIds });
            }}
          />
        );
      case "media":
        return (
          <MediaStep
            items={draft.media}
            coverUrl={draft.coverUrl}
            onChange={(key, next) => patch({ media: draft.media.map((item) => (item.key === key ? { ...item, ...next } : item)) })}
            onCover={(url) => patch({ coverUrl: url })}
            onAdd={() => patch({ media: [...draft.media, { key: clientKey("media"), kind: "image", url: "", poster_url: "", caption: "" }] })}
            onRemove={(key) => {
              const row = draft.media.find((item) => item.key === key);
              patch({
                media: draft.media.filter((item) => item.key !== key),
                deletedMediaIds: row?.id ? [...draft.deletedMediaIds, row.id] : draft.deletedMediaIds,
                coverUrl: row && row.url === draft.coverUrl ? "" : draft.coverUrl,
              });
            }}
            onMove={(index, direction) => {
              const next = [...draft.media];
              const [row] = next.splice(index, 1);
              next.splice(index + direction, 0, row);
              patch({ media: next });
            }}
          />
        );
      case "publish":
        return (
          <section className="space-y-4" data-bay-step="publish">
            <div>
              <p className="mb-2 text-[12px] font-semibold text-stone-500">{tt("买家在 Bay 列表里看到的样子")}</p>
              <ServiceCard item={previewFeedItem(draft, { profile, siteKey: postedSite, currency, model: selectedModel })} onOpen={() => {}} />
              <TierPreview draft={draft} currency={currency} />
            </div>
            <PublishChecklist checks={checks} />
            {!profile || !profile.published ? (
              <SellerNotice tone="warn">
                {profile ? tt("还差一步：公开你的卖家资料，服务才能上架。") : tt("先建好并公开卖家资料，服务才能上架。")}{" "}
                <button type="button" onClick={() => openBaySettings("profile")} className={LINK_BUTTON}>
                  {profile ? tt("去公开资料") : tt("去建资料")}
                </button>
              </SellerNotice>
            ) : null}
            {isConsult ? <SellerNotice>{tt("答疑上架后暂时不能修改；要改内容，先在「我的服务」里另发一条。")}</SellerNotice> : null}
          </section>
        );
      default:
        return null;
    }
  }

  return (
    <section data-bay-pane="service-editor" className={`space-y-4 p-4 ${narrow ? "" : "mx-auto max-w-2xl"}`}>
      <p className="text-[11.5px] font-medium text-stone-500" data-bay-editor-status={draft.status}>
        {tt("第 {n} 步，共 {total} 步", { n: stepIndex + 1, total: steps.length })} · {statusLabel}
        {dirty ? ` · ${tt("有没保存的修改")}` : ""}
      </p>

      {draft.moderationHidden ? <HiddenByPlatformNotice what="service" caseRow={hiddenCase} /> : null}
      {hiddenMessage && !hiddenCase ? <SellerNotice tone="warn">{hiddenMessage}</SellerNotice> : null}
      {!profile && currentStep !== "kind" ? (
        <SellerNotice tone="warn">
          {tt("还没有卖家资料：先建资料，才能保存服务。")}{" "}
          <button type="button" onClick={() => openBaySettings("profile")} className={LINK_BUTTON}>
            {tt("去建资料")}
          </button>
        </SellerNotice>
      ) : null}

      <nav aria-label={tt("发布步骤")} className="flex flex-wrap gap-1.5" data-bay-steps>
        {steps.map((id, index) => (
          <button
            key={id}
            type="button"
            onClick={() => goTo(id)}
            data-bay-step-chip={id}
            aria-current={id === currentStep ? "step" : undefined}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] ${id === currentStep ? "border-stone-900 bg-stone-900 font-semibold text-white" : "border-stone-200 bg-white text-stone-600"}`}
          >
            {index + 1}. {tt(STEP_LABELS[id])}
          </button>
        ))}
      </nav>

      {renderStep()}

      {rejection ? (
        <SellerNotice tone="error">
          <span className="font-semibold">{tt("平台没有通过")}</span>
          <span className="mt-1 block whitespace-pre-wrap">{tt(rejection)}</span>
        </SellerNotice>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
        <button type="button" disabled={stepIndex === 0 || saving} onClick={() => goTo(steps[Math.max(0, stepIndex - 1)])} className={SECONDARY_BUTTON} data-bay-action="prev">
          {tt("上一步")}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {currentStep === "publish" ? (
            <>
              {!isConsult ? (
                <button type="button" disabled={saving || !draft.title.trim()} onClick={() => void saveAsDraft()} className={SECONDARY_BUTTON} data-bay-action="save-draft">
                  {draft.status === "published" ? tt("保存修改") : tt("存草稿")}
                </button>
              ) : null}
              {draft.status !== "published" ? (
                <button type="button" disabled={saving || !ready} onClick={() => void publish()} className={PRIMARY_BUTTON} data-bay-action="publish">
                  {saving ? tt("正在检查…") : tt("上架")}
                </button>
              ) : null}
            </>
          ) : (
            <button type="button" disabled={saving} onClick={() => void saveCurrentStep()} className={PRIMARY_BUTTON} data-bay-action="next">
              {saving ? tt("保存中…") : isLocalStep(currentStep, draft.catalogKind) ? tt("下一步") : tt("存草稿并继续")}
            </button>
          )}
        </div>
      </footer>

      {draft.serviceId ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3" data-bay-manage>
          {draft.status === "published" ? (
            <button type="button" disabled={saving} onClick={() => void pause()} className={SECONDARY_BUTTON} data-bay-action="pause">
              {tt("暂停接单")}
            </button>
          ) : null}
          {draft.status === "paused" ? (
            <button type="button" disabled={saving} onClick={() => setStep("publish")} className={SECONDARY_BUTTON} data-bay-action="republish">
              {tt("重新上架")}
            </button>
          ) : null}
          <button type="button" disabled={saving} onClick={() => remove()} className={DANGER_BUTTON} data-bay-action="remove">
            {tt("删除")}
          </button>
        </div>
      ) : null}

      {pendingLeave ? (
        <ConfirmDialog
          title={tt("这一步还有没保存的修改，确定先离开？")}
          onConfirm={() => {
            const next = pendingLeave;
            setPendingLeave(null);
            applyGoTo(next);
          }}
          onCancel={() => setPendingLeave(null)}
        />
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

function TierPreview({ draft, currency }: { draft: EditorDraft; currency: string }) {
  const tt = useUI();
  const rows = draft.catalogKind === "consult" ? draft.tiers.slice(0, 1) : draft.tiers.filter((tier) => tier.enabled);
  if (!rows.length) return null;
  return (
    <ul className="mt-2 space-y-1.5" data-bay-tier-preview>
      {rows.map((tier) => (
        <li key={tier.tier} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[12.5px] text-stone-700">
          <span className="font-semibold text-stone-900">{draft.catalogKind === "consult" ? draft.title || tt("答疑") : tier.title || tt("未命名价格档")}</span>
          <span className="ml-2">{moneyText(tier.price_fen, currency)}</span>
          {draft.catalogKind === "consult" ? (
            <span className="ml-2 text-stone-500">
              {draft.consultUnit === "session" ? tt("每次 {n} 轮问答", { n: draft.consultRounds ?? "—" }) : tt("每小时按 {n} 分钟计", { n: draft.consultMinutes ?? "—" })}
            </span>
          ) : (
            <span className="ml-2 text-stone-500">
              {tier.delivery_days ? tt("{n} 天交付", { n: tier.delivery_days }) : tt("交期面议")} · {tier.revisions === -1 ? tt("不限修改") : tt("修改 {n} 次", { n: tier.revisions })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
