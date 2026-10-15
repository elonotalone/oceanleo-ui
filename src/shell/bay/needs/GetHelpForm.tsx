"use client";

import { deadlineFromRow, deadlineToPayload } from "../form/bay-deadline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { HANDOFF_BRIEF_MAX_LENGTH } from "../../../api/talent-handoff";
import {
  DEMAND_DESCRIPTION_MAX_LENGTH,
  DEMAND_TITLE_MAX_LENGTH,
  createDemand,
} from "../../../lib/bay/demands";
import { createBayHandoff } from "../../../lib/bay/handoffs";
import { useToast } from "../../../ui/Toast";
import { BayMenuSelect } from "../form/BayMenuSelect";
import { BAY_FORM_BAR_CLASS, BAY_FORM_PAGE_CLASS } from "../form/form-ui";
import { audienceDone, audienceMemberIds, emptyAudience, type BayAudience } from "../form/bay-audience";
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
  type BayOfferKind,
  type BayPostSnapshot,
  type DigitalWorkRef,
  type ListingAppPriceModel,
  type ListingBilling,
} from "../form";
import { INPUT_CLASS, TEXTAREA_CLASS } from "../seller/seller-ui";
import { ensureBayTerms } from "../settings";
import { openBay, requireBayLogin, useBaySignedIn, useBayTaskContext } from "../shell/bay-state";
import { LibraryWorkPickerHost } from "./LibraryWorkPicker";
import {
  HandoffContextPicker,
  candidatesFromTaskMessages,
  selectedHandoffRefs,
  toggleHandoffPick,
} from "./handoff-context";
import { categoryName, categoryNameBySlug, defaultNeedCategory, isNeedCategory, useNeedCategories } from "./need-categories";
import { BTN_PRIMARY, LoginPrompt, PaneNotice, errorText } from "./need-ui";

export type GetHelpMode = "public" | "open" | "invited" | "group";

function audienceFromMode(mode: GetHelpMode): BayAudience {
  const next = emptyAudience();
  if (mode === "invited") next.mode = "invited";
  else if (mode === "group") next.mode = "group";
  else next.mode = "public";
  return next;
}

export interface GetHelpFormProps {
  siteKey: string;
  presetCategory?: string;
  defaultMode: GetHelpMode;
  showListingPicker?: boolean;
}

export function GetHelpForm(props: GetHelpFormProps) {
  const { siteKey, presetCategory, defaultMode, showListingPicker } = props;
  const tt = useUI();
  const ttRef = useRef(tt);
  ttRef.current = tt;
  const toast = useToast();
  const signedIn = useBaySignedIn();
  const task = useBayTaskContext();
  const { response, categories, loading: categoriesLoading } = useNeedCategories();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(Boolean(presetCategory));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrls, setCoverUrls] = useState<string[]>([]);
  const [files, setFiles] = useState<DigitalWorkRef[]>([]);
  const [offerKind, setOfferKind] = useState<BayOfferKind>("digital");
  const [priceFen, setPriceFen] = useState<number | null>(null);
  const [billing, setBilling] = useState<ListingBilling>("service");
  const [appPriceModel, setAppPriceModel] = useState<ListingAppPriceModel>("one_time");
  const [deliveryDays, setDeliveryDays] = useState<number | null>(null);
  const [revisions, setRevisions] = useState(0);
  const [consultRounds, setConsultRounds] = useState<number | null>(null);
  const [consultMinutes, setConsultMinutes] = useState<number | null>(null);
  const [audience, setAudience] = useState<BayAudience>(() => audienceFromMode(defaultMode));
  const [deadline, setDeadline] = useState("");
  const [customTerms, setCustomTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = audience.mode;
  const publicCall = mode === "public" || mode === "group";
  /** 公开征集（发需求）才要 20 字；叫真人走求助，不套这道门槛。 */
  const publicDemand = publicCall && defaultMode !== "open";

  useEffect(() => {
    if (categoryTouched || !response) return;
    const preset = presetCategory && isNeedCategory(presetCategory, response) ? presetCategory : null;
    setCategory(preset || defaultNeedCategory(siteKey, response) || "");
  }, [categoryTouched, presetCategory, response, siteKey]);

  useEffect(() => {
    if (defaultMode === "open" && task?.taskId && files.length === 0) {
      setFiles([{ id: task.taskId, title: ttRef.current("当前任务"), kind: "task" }]);
    }
  }, [defaultMode, task?.taskId, files.length]);

  const candidates = useMemo(() => (task?.messages ? candidatesFromTaskMessages(task.messages) : []), [task]);
  const grant = useMemo(() => selectedHandoffRefs(candidates, selected), [candidates, selected]);

  const submit = async () => {
    if (busy) return;
    if (!requireBayLogin()) return;
    const titleLine = title.trim();
    const details = description.trim();
    if (showListingPicker && coverUrls.length === 0) {
      setError(tt("至少一张预览图"));
      return;
    }
    if (!titleLine) {
      setError(tt("请先写标题"));
      return;
    }
    if (publicDemand && details.length < 20) {
      setError(tt("公开征集请至少写 20 个字"));
      return;
    }
    if (!category || !isNeedCategory(category, response)) {
      setError(tt("请选择类目"));
      return;
    }
    if (!audienceDone(audience)) {
      setError(tt("请选择要给谁看"));
      return;
    }
    setError(null);
    if (!(await ensureBayTerms("buyer"))) return;
    const first = files[0];
    const attachedWork = first?.id
      ? { kind: (first.kind === "artifact" ? "artifact" : "task") as "artifact" | "task", id: first.id }
      : null;
    const due = deadlineToPayload(deadline);
    const brief = details || titleLine;
    const asDemand = defaultMode !== "open";
    setBusy(true);
    try {
      if (asDemand) {
        const result = await createDemand(
          {
            title: titleLine.slice(0, DEMAND_TITLE_MAX_LENGTH),
            description: brief.slice(0, DEMAND_DESCRIPTION_MAX_LENGTH),
            category,
            budget_min_fen: priceFen,
            budget_max_fen: priceFen,
            deadline_at: due,
            status: "open",
            audience_mode: mode === "verified_first" ? "public" : mode,
            audience_handle: mode === "invited" ? audience.handle.trim() || audience.members[0]?.name || null : null,
            audience_member_ids: mode === "invited" || mode === "group" ? audienceMemberIds(audience) : [],
            custom_terms: customTerms.trim() || null,
            listing_kind: offerKind,
            delivery_days: offerKind === "service" && deliveryDays && deliveryDays > 0 ? deliveryDays : null,
            cover_url: coverUrls[0] || null,
            engagement_kind: engagementOf(offerKind, billing, appPriceModel, priceFen),
            revisions: offerKind === "service" ? revisions : null,
            consult_rounds: offerKind === "service" && billing === "session" ? consultRounds : null,
            consult_minutes: offerKind === "service" && billing === "hour" ? consultMinutes : null,
          },
          { postedSite: siteKey, attachedWork },
        );
        toast.success(tt("需求已发布"));
        const id = result.demand?.id;
        if (id) openBay({ kind: "demand", id });
      } else {
        const result = await createBayHandoff({
          originKind: task?.taskId ? "conversation" : "manual",
          originRef: task?.taskId || "",
          category,
          brief: brief.slice(0, HANDOFF_BRIEF_MAX_LENGTH),
          budgetFen: priceFen ?? 0,
          mode: mode === "invited" ? "invited" : "open",
          invitedHandle: mode === "invited" ? audience.handle.trim() : null,
          context: grant,
          postedSite: siteKey,
          attachedWork,
        });
        toast.success(tt("求助已发出"));
        const id = result.handoff?.id;
        if (id) openBay({ kind: "help", id });
      }
    } catch (reason) {
      setError(errorText(tt, reason, tt("发布失败，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  };

  const subcategoryField = (
    <div data-bay-help-category>
      <BayPublishSubcategoryLabel />
      {categoriesLoading && categories.length === 0 ? (
        <div className="animate-pulse rounded-xl bg-stone-100 py-5" />
      ) : categories.length === 0 ? (
        <p className="text-[12px] text-amber-700">{tt("类目暂时读不出来，请稍后再试。")}</p>
      ) : (
        <BayMenuSelect
          value={category}
          emptyLabel={tt("请选择")}
          onChange={(slug) => {
            setCategory(slug);
            setCategoryTouched(true);
          }}
          selectProps={{ "data-bay-category-select": "" }}
          options={categories.map((row) => ({
            value: row.slug,
            label: categoryName(tt, row),
            attrs: { "data-bay-category": row.slug },
          }))}
        />
      )}
    </div>
  );

  const contextItem =
    task
      ? {
          id: "context",
          label: tt("要给对方看的内容"),
          done: grant.messages.length + grant.artifacts.length > 0,
          optional: true,
          summary: tt("已选 {n} 条", { n: grant.messages.length + grant.artifacts.length }),
          children: (
            <section>
              <HandoffContextPicker
                items={candidates}
                selected={selected}
                onToggle={(item) => setSelected((current) => toggleHandoffPick(current, item))}
              />
            </section>
          ),
        }
      : null;

  const productItems = [
    {
      id: "cover",
      label: tt("作品图"),
      done: coverUrls.length > 0,
      optional: !showListingPicker,
      alwaysOpen: true,
      summary: coverUrls.length ? tt("已填好") : undefined,
      children: <BayImageGallery urls={coverUrls} onUrls={setCoverUrls} />,
    },
    {
      id: "title",
      label: tt("标题"),
      done: Boolean(title.trim()),
      summary: title.trim() || undefined,
      children: (
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value.slice(0, DEMAND_TITLE_MAX_LENGTH))}
          maxLength={DEMAND_TITLE_MAX_LENGTH}
          className={INPUT_CLASS}
          data-bay-field="title"
          data-bay-help-text=""
          data-bay-demand-title=""
        />
      ),
    },
    {
      id: "description",
      label: tt("详细介绍"),
      done: publicDemand ? description.trim().length >= 20 : Boolean(description.trim()),
      optional: !publicDemand,
      summary: description.trim() ? tt("已填好") : undefined,
      children: (
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, DEMAND_DESCRIPTION_MAX_LENGTH))}
          rows={8}
          maxLength={DEMAND_DESCRIPTION_MAX_LENGTH}
          className={TEXTAREA_CLASS}
          data-bay-field="description"
          data-bay-demand-description=""
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
          onChange={(works) => setFiles(applyDigitalWorks(works).digitalWorks)}
        />
      ),
    },
    ...(contextItem ? [contextItem] : []),
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

  const groups = listingSectionGroups({
    tt,
    intent: "buy",
    productItems,
    priceItems,
    audienceItems: [listingAudienceItem(tt, audience, setAudience)],
    offerItems: [howYouDeliverRow(tt, offerKind, setOfferKind, { buy: true })],
    termsItems,
  });

  const leftover = [
    showListingPicker && coverUrls.length === 0,
    !title.trim(),
    publicDemand && description.trim().length < 20,
    !category,
    !audienceDone(audience),
  ].filter(Boolean).length;
  const snapshot: BayPostSnapshot = {
    kind: "need",
    title: title.trim(),
    description,
    coverUrl: coverUrls[0],
    coverUrls,
    categoryLabel: categoryNameBySlug(tt, category, response) || undefined,
    budgetFen: priceFen,
    priceFen: priceFen ?? undefined,
    deadlineLabel: deadline || undefined,
    customTerms,
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
        else if (next.coverUrl) setCoverUrls([next.coverUrl]);
        if (next.customTerms != null) setCustomTerms(next.customTerms);
      }}
    >
      <div className={BAY_FORM_PAGE_CLASS} data-bay-get-help>
        <LibraryWorkPickerHost />
        {showListingPicker ? (
          <BayPublishKindPair listing="need" siteCategory={presetCategory} subcategory={subcategoryField} />
        ) : null}
        {!signedIn ? <LoginPrompt message={tt("登录后才能找人帮忙。")} /> : null}

        <BayRevealForm groups={groups} />

        {error ? <PaneNotice tone="error">{error}</PaneNotice> : null}

        <footer data-bay-publish-bar className={`${BAY_FORM_BAR_CLASS} justify-between`}>
          <p className={`text-[13px] font-medium ${leftover ? "text-neutral-600" : "text-emerald-600"}`}>
            {leftover ? tt("还差 {n} 项就能发布", { n: leftover }) : tt("可以发布了")}
          </p>
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submit()} data-bay-submit>
            {busy ? tt("正在提交…") : tt("发布")}
          </button>
        </footer>
      </div>
    </BayPublishShell>
  );
}
