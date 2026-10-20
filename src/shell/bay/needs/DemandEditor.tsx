"use client";

import { deadlineFromRow, deadlineToPayload } from "../form/bay-deadline";
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  DEMAND_DESCRIPTION_MAX_LENGTH,
  DEMAND_TITLE_MAX_LENGTH,
  createDemand,
  updateDemand,
  type BayDemandDetail,
  type DemandInput,
} from "../../../lib/bay/demands";
import { useToast } from "../../../ui/Toast";
import { BAY_FORM_BAR_CLASS, BAY_FORM_PAGE_CLASS } from "../form/form-ui";
import { audienceDone, audienceMemberIds, normalizeAudience, type BayAudience } from "../form/bay-audience";
import {
  applyDigitalWorks,
  BAY_FILES_LABEL,
  BayDigitalWorksField,
  BayImageGallery,
  BayPublishKindPair,
  BayPublishSubcategoryLabel,
  BayPublishShell,
  BayRevealForm,
  engagementOf,
  howYouDeliverRow,
  listingAudienceItem,
  listingPriceItems,
  listingSectionGroups,
  listingTermsItems,
  offerFromListing,
  type BayOfferKind,
  type BayPostSnapshot,
  type DigitalWorkRef,
  type ListingAppPriceModel,
  type ListingBilling,
} from "../form";
import { INPUT_CLASS, TEXTAREA_CLASS } from "../seller/seller-ui";
import { ensureBayTerms } from "../settings";
import { requireBayLogin } from "../shell/bay-state";
import { LibraryWorkPickerHost } from "./LibraryWorkPicker";
import { categoryNameBySlug, defaultNeedCategory, isNeedCategory, useNeedCategories } from "./need-categories";
import { BTN_PRIMARY, BTN_SECONDARY, CategoryChooser, PaneNotice, errorText } from "./need-ui";

const DESCRIPTION_MIN_LENGTH = 20;

function billingOf(kind: string | undefined): ListingBilling {
  if (kind === "hourly") return "hour";
  if (kind === "session") return "session";
  return "service";
}

function appPriceOf(kind: string | undefined): ListingAppPriceModel {
  if (kind === "retainer") return "subscription";
  return "one_time";
}

export interface DemandEditorProps {
  siteKey: string;
  initial?: BayDemandDetail | null;
  presetCategory?: string;
  onDone: (demandId: string) => void;
  onCancel?: () => void;
}

export function DemandEditor({ siteKey, initial, presetCategory, onDone, onCancel }: DemandEditorProps) {
  const tt = useUI();
  const toast = useToast();
  const { response, categories, loading: categoriesLoading } = useNeedCategories();
  const editing = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initial?.category));
  const [coverUrls, setCoverUrls] = useState<string[]>(initial?.cover_url ? [initial.cover_url] : []);
  const [files, setFiles] = useState<DigitalWorkRef[]>(() =>
    initial?.attached_work
      ? [{ id: initial.attached_work.id, title: initial.attached_work.title || "", kind: initial.attached_work.kind }]
      : [],
  );
  const [workChanged, setWorkChanged] = useState(false);
  const [offerKind, setOfferKind] = useState<BayOfferKind>(() => offerFromListing(initial?.listing_kind || "digital"));
  const [priceFen, setPriceFen] = useState<number | null>(initial?.budget_min_fen ?? initial?.budget_max_fen ?? null);
  const [billing, setBilling] = useState<ListingBilling>(() => billingOf(initial?.engagement_kind));
  const [appPriceModel, setAppPriceModel] = useState<ListingAppPriceModel>(() => appPriceOf(initial?.engagement_kind));
  const [deliveryDays, setDeliveryDays] = useState<number | null>(initial?.delivery_days ?? null);
  const [revisions, setRevisions] = useState(initial?.revisions ?? 0);
  const [consultRounds, setConsultRounds] = useState<number | null>(initial?.consult_rounds ?? null);
  const [consultMinutes, setConsultMinutes] = useState<number | null>(initial?.consult_minutes ?? null);
  const [deadline, setDeadline] = useState(deadlineFromRow(initial?.deadline_at));
  const [audience, setAudience] = useState<BayAudience>(() =>
    normalizeAudience({
      mode: initial?.audience_mode || "public",
      handle: initial?.audience_handle || "",
      members: (initial?.audience_member_ids || []).map((userId) => ({ userId, name: userId })),
    }),
  );
  const [customTerms, setCustomTerms] = useState(initial?.custom_terms || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (categoryTouched || !response) return;
    const preset = presetCategory && isNeedCategory(presetCategory, response) ? presetCategory : null;
    setCategory(preset || defaultNeedCategory(siteKey, response) || "");
  }, [categoryTouched, presetCategory, response, siteKey]);

  const validate = (): string => {
    if (!coverUrls.length) return tt("至少一张预览图");
    if (!title.trim()) return tt("请先写需求标题");
    if (description.trim().length < DESCRIPTION_MIN_LENGTH) return tt("请把详细介绍写到至少 20 个字");
    if (!category || !isNeedCategory(category, response)) return tt("请选择类目");
    if (!audienceDone(audience)) return tt("请选择要给谁看");
    return "";
  };

  const submit = async () => {
    if (busy) return;
    const invalid = validate();
    setError(invalid || null);
    if (invalid) return;
    if (!requireBayLogin()) return;
    if (!(await ensureBayTerms("buyer"))) return;
    const first = files[0];
    const input: DemandInput = {
      title: title.trim().slice(0, DEMAND_TITLE_MAX_LENGTH),
      description: description.trim().slice(0, DEMAND_DESCRIPTION_MAX_LENGTH),
      category,
      skills: initial?.skills || [],
      reference_links: initial?.reference_links || [],
      budget_min_fen: priceFen,
      budget_max_fen: priceFen,
      deadline_at: deadlineToPayload(deadline),
      status: "open",
      audience_mode: audience.mode === "verified_first" ? "public" : audience.mode,
      audience_handle: audience.mode === "invited" ? audience.handle.trim() || audience.members[0]?.name || null : null,
      audience_member_ids: audience.mode === "invited" || audience.mode === "group" ? audienceMemberIds(audience) : [],
      custom_terms: customTerms.trim() || null,
      listing_kind: offerKind,
      delivery_days: offerKind === "service" && deliveryDays && deliveryDays > 0 ? deliveryDays : null,
      cover_url: coverUrls[0] || null,
      engagement_kind: engagementOf(offerKind, billing, appPriceModel, priceFen),
      revisions: offerKind === "service" ? revisions : null,
      consult_rounds: offerKind === "service" && billing === "session" ? consultRounds : null,
      consult_minutes: offerKind === "service" && billing === "hour" ? consultMinutes : null,
    };
    setBusy(true);
    try {
      const ref = first?.id
        ? { kind: (first.kind === "artifact" ? "artifact" : "task") as "artifact" | "task", id: first.id }
        : null;
      const result =
        editing && initial
          ? await updateDemand(initial.id, input, workChanged ? ref : undefined)
          : await createDemand(input, { postedSite: siteKey, attachedWork: ref });
      toast.success(editing ? tt("需求已更新") : tt("需求已发布"));
      onDone(result.demand?.id || initial?.id || "");
    } catch (reason) {
      setError(errorText(tt, reason, editing ? tt("保存失败，请稍后再试。") : tt("发布失败，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  };

  const subcategoryField = (
    <>
      <BayPublishSubcategoryLabel />
      <CategoryChooser
        categories={categories}
        value={category}
        loading={categoriesLoading}
        onChange={(slug) => {
          setCategory(slug);
          setCategoryTouched(true);
        }}
      />
    </>
  );

  const productItems = [
    {
      id: "cover",
      label: tt("作品图"),
      done: coverUrls.length > 0,
      alwaysOpen: true,
      summary: coverUrls.length ? tt("已填好") : undefined,
      children: <BayImageGallery variant="listing" urls={coverUrls} onUrls={setCoverUrls} />,
    },
    {
      id: "title",
      label: tt("标题"),
      done: Boolean(title.trim()),
      summary: title.trim() || undefined,
      children: (
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={DEMAND_TITLE_MAX_LENGTH}
          className={INPUT_CLASS}
          data-bay-demand-title=""
          data-bay-field="title"
        />
      ),
    },
    {
      id: "description",
      label: tt("详细介绍"),
      done: description.trim().length >= DESCRIPTION_MIN_LENGTH,
      summary: description.trim() ? tt("已填好") : undefined,
      children: (
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={8}
          maxLength={DEMAND_DESCRIPTION_MAX_LENGTH}
          className={TEXTAREA_CLASS}
          data-bay-demand-description=""
          data-bay-field="description"
        />
      ),
    },
    {
      id: "files",
      label: tt(BAY_FILES_LABEL),
      done: files.length > 0,
      optional: true,
      alwaysOpen: true,
      summary: files[0]?.title || files[0]?.id,
      children: (
        <BayDigitalWorksField
          works={files}
          onChange={(works) => {
            setFiles(applyDigitalWorks(works).digitalWorks);
            setWorkChanged(true);
          }}
        />
      ),
    },
  ];

  const priceItems = listingPriceItems(tt, {
    offerKind,
    priceFen,
    onPriceFen: setPriceFen,
    showBilling: true,
    billing,
    onBilling: setBilling,
    appPriceModel,
    onAppPriceModel: setAppPriceModel,
  });
  const termsItems = listingTermsItems(tt, {
    offerKind,
    billing,
    deliveryDays,
    onDeliveryDays: setDeliveryDays,
    revisions,
    onRevisions: setRevisions,
    consultRounds,
    onConsultRounds: setConsultRounds,
    consultMinutes,
    onConsultMinutes: setConsultMinutes,
    deadline,
    onDeadline: setDeadline,
    customTerms,
    onCustomTerms: setCustomTerms,
  });

  const leftover = [
    coverUrls.length === 0,
    !title.trim(),
    description.trim().length < DESCRIPTION_MIN_LENGTH,
    !category,
    !audienceDone(audience),
  ].filter(Boolean).length;

  const snapshot: BayPostSnapshot = {
    kind: "need",
    title,
    description,
    coverUrl: coverUrls[0],
    coverUrls,
    categoryLabel: categoryNameBySlug(tt, category, response) || undefined,
    budgetFen: priceFen,
    priceFen: priceFen ?? undefined,
    deadlineLabel: deadline || undefined,
    customTerms,
    previewArtifactId: files[0]?.kind === "artifact" ? files[0].id : undefined,
    previewWorkTitle: files[0]?.kind === "artifact" ? files[0].title : undefined,
  };

  return (
    <BayPublishShell
      kind="need"
      snapshot={snapshot}
      onApply={(next) => {
        if (next.title) setTitle(next.title.slice(0, DEMAND_TITLE_MAX_LENGTH));
        if (next.description) setDescription(next.description.slice(0, DEMAND_DESCRIPTION_MAX_LENGTH));
        if (next.priceFen != null) setPriceFen(next.priceFen);
        else if (next.budgetFen != null) setPriceFen(next.budgetFen);
        if (next.coverUrls?.length) setCoverUrls(next.coverUrls);
        if (next.customTerms != null) setCustomTerms(next.customTerms);
      }}
    >
      <div className={BAY_FORM_PAGE_CLASS} data-bay-demand-editor={editing ? "edit" : "create"}>
        <LibraryWorkPickerHost />
        <BayRevealForm
          layout="listing"
          lead={editing ? null : <BayPublishKindPair listing="need" siteCategory={presetCategory} subcategory={subcategoryField} />}
          groups={listingSectionGroups({
            tt,
            intent: "buy",
            productItems,
            priceItems,
            audienceItems: [listingAudienceItem(tt, audience, setAudience)],
            offerItems: [howYouDeliverRow(tt, offerKind, setOfferKind, { buy: true })],
            termsItems,
          })}
        />

        {error ? <PaneNotice tone="error">{error}</PaneNotice> : null}

        <footer data-bay-publish-bar className={`${BAY_FORM_BAR_CLASS} justify-between`}>
          <p className={`text-[13px] font-medium ${leftover ? "text-neutral-600" : "text-emerald-600"}`}>
            {leftover ? tt("还差 {n} 项就能发布", { n: leftover }) : tt("可以发布了")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {onCancel ? (
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={onCancel}>
                {tt("取消")}
              </button>
            ) : null}
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submit()} data-bay-submit>
              {busy ? tt("正在提交…") : editing ? tt("保存修改") : tt("发布需求")}
            </button>
          </div>
        </footer>
      </div>
    </BayPublishShell>
  );
}
