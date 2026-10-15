"use client";

// 上架 / 编辑一个作品。本文件归 U3 单元；组件名与 props 是合同，不许改。
import { deadlineFromRow, deadlineToPayload, formatDeadline } from "../form/bay-deadline";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  listMyBayApps,
  publishBayApp,
  updateBayApp,
  type BayAppMine,
} from "../../../lib/bay/apps";
import { saveBayAppPricing } from "../../../lib/bay/app-paid";
import { BayApiError } from "../../../lib/bay/http";
import { EndpointPicker } from "../appendpoint/EndpointPicker";
import {
  BayChoice,
  BayCustomTerms,
  BayDeadlineField,
  BayImageGallery,
  BayMenuSelect,
  BayPublishKindPair,
  BayPublishShell,
  BayPublishSubcategoryLabel,
  BayRevealForm,
  BAY_CATEGORY_LABEL,
  BAY_FORM_AMOUNT_INPUT_CLASS,
  BAY_FORM_BAR_CLASS,
  BAY_FORM_PAGE_CLASS,
  emptyAudience,
  howYouDeliverRow,
  isPriceInputText,
  listingAudienceItem,
  listingSectionGroups,
  type BayPostSnapshot,
  type BayRevealItem,
} from "../form";
import { INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerNotice, TEXTAREA_CLASS } from "../seller/seller-ui";
import { useBayCategoryName } from "../shell/BayList";
import { BaySignInPrompt } from "../shell/BayMine";
import { BAY_ADVICE_ZONE } from "../shell/bay-links";
import { openBay, useBayFilter, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { useBayCategories } from "../shell/use-bay-data";
import {
  draftFromApp,
  draftProblems,
  parseAppPriceFen,
  patchFromDraft,
  priceModelOf,
  pricingFromDraft,
  type AppDraft,
  type AppPriceModel,
} from "./app-editor-model";

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

function emptyDraft(): AppDraft {
  return {
    title: "",
    summary: "",
    description: "",
    coverUrl: "",
    galleryUrls: [],
    category: "",
    embedMode: "embed",
    url: "",
    endpointId: "",
    customTerms: "",
    audience: emptyAudience(),
    deadlineAt: "",
    priceModel: "free",
    price: "",
  };
}

export function AppEditorPane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const filter = useBayFilter();
  const categoriesView = useBayCategories();
  const categoryName = useBayCategoryName();
  const routeId = props.target.kind === "app-editor" ? props.target.appId || "" : "";
  const [app, setApp] = useState<BayAppMine | null>(null);
  const [draft, setDraft] = useState<AppDraft>(emptyDraft);
  const [load, setLoad] = useState<{ loading: boolean; error: string }>({ loading: Boolean(routeId), error: "" });
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | "">("");
  const [attempted, setAttempted] = useState(false);

  const applyApp = useCallback((row: BayAppMine) => {
    setApp(row);
    setDraft(draftFromApp(row));
  }, []);

  useEffect(() => {
    if (!signedIn || props.target.kind !== "app-editor") return;
    let alive = true;
    setActionError("");
    if (!routeId) {
      setApp(null);
      setDraft(emptyDraft());
      setLoad({ loading: false, error: "" });
      return;
    }
    setLoad({ loading: true, error: "" });
    void (async () => {
      try {
        const body = await listMyBayApps();
        if (!alive) return;
        const row = (body.items || []).find((item) => item.id === routeId);
        if (!row) {
          setApp(null);
          setLoad({ loading: false, error: "这个作品不存在" });
          return;
        }
        applyApp(row);
        setLoad({ loading: false, error: "" });
      } catch (error) {
        if (alive) setLoad({ loading: false, error: errorText(error, "作品没读出来，请稍后再试。") });
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, routeId, props.target.kind, applyApp]);

  if (props.target.kind !== "app-editor") return null;
  if (!signedIn) return <BaySignInPrompt text={tt("登录后才能上架作品")} />;

  const narrow = props.layout === "docked" || props.layout === "mobile";

  function patch(next: Partial<AppDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function persistDraft(): Promise<BayAppMine | null> {
    if (!app) return null;
    const next = patchFromDraft(draft, app);
    let saved = app;
    if (Object.keys(next).length > 0) {
      const body = await updateBayApp(app.id, next);
      saved = body.app;
    }
    const pricing = pricingFromDraft(draft, saved);
    if (pricing) {
      try {
        const body = await saveBayAppPricing(saved.id, pricing);
        saved = body.app;
      } catch (error) {
        applyApp(saved);
        throw error;
      }
    }
    applyApp(saved);
    return saved;
  }

  async function saveDraft() {
    if (!app || busy) return;
    setBusy("save");
    setActionError("");
    try {
      await persistDraft();
    } catch (error) {
      setActionError(errorText(error, tt("保存失败，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (!app || busy) return;
    setAttempted(true);
    if (draftProblems(draft).length) return;
    setBusy("publish");
    setActionError("");
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const body = await publishBayApp(saved.id);
      applyApp(body.app);
      openBay({ kind: "app", id: body.app.id });
    } catch (error) {
      setActionError(errorText(error, tt("上架没有通过，请按提示改完再试。")));
    } finally {
      setBusy("");
    }
  }

  if (load.loading) {
    return (
      <section data-bay-pane="app-editor" className="p-4 text-[13px] text-stone-500">
        {tt("正在打开…")}
      </section>
    );
  }
  if (load.error && !app) {
    return (
      <section data-bay-pane="app-editor" className="space-y-3 p-4">
        <SellerNotice tone="error">{tt(load.error)}</SellerNotice>
      </section>
    );
  }

  const localProblems = draftProblems(draft);
  const knownSlugs = new Set(categoriesView.categories.map((row) => row.slug));
  const creating = !routeId;
  const priceModel = priceModelOf(draft.priceModel);
  const priceFen = parseAppPriceFen(draft.price) ?? 0;
  const subcategorySelect = (
    <BayMenuSelect
      value={draft.category}
      emptyLabel={tt("请选择")}
      onChange={(slug) => patch({ category: slug })}
      options={[
        ...(draft.category && !knownSlugs.has(draft.category) ? [{ value: draft.category, label: draft.category }] : []),
        ...categoriesView.categories.map((row) => ({ value: row.slug, label: categoryName(row) })),
      ]}
    />
  );

  const productItems: BayRevealItem[] = [
    {
      id: "cover",
      label: tt("作品图"),
      done: draft.coverUrl.startsWith("https://") || draft.galleryUrls.length > 0,
      summary: draft.galleryUrls.length || draft.coverUrl.startsWith("https://") ? tt("已填好") : undefined,
      alwaysOpen: true,
      children: (
        <BayImageGallery
          urls={draft.galleryUrls.length ? draft.galleryUrls : draft.coverUrl ? [draft.coverUrl] : []}
          onUrls={(urls) => patch({ coverUrl: urls[0] || "", galleryUrls: urls })}
          disabled={Boolean(busy)}
        />
      ),
    },
    {
      id: "title",
      label: tt("标题"),
      done: Boolean(draft.title.trim()),
      summary: draft.title.trim() || undefined,
      children: (
        <input
          className={INPUT_CLASS}
          maxLength={80}
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
        />
      ),
    },
    {
      id: "description",
      label: tt("详细介绍"),
      done: Boolean(draft.description.trim()),
      optional: true,
      summary: draft.description.trim() || undefined,
      children: (
        <textarea
          className={TEXTAREA_CLASS}
          rows={8}
          maxLength={4000}
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
        />
      ),
    },
    ...(creating
      ? []
      : [
          {
            id: "category",
            label: tt(BAY_CATEGORY_LABEL),
            done: Boolean(draft.category.trim()),
            summary: draft.category
              ? categoryName(
                  categoriesView.categories.find((row) => row.slug === draft.category) || {
                    slug: draft.category,
                    name_zh: draft.category,
                    name_en: draft.category,
                  },
                )
              : undefined,
            children: subcategorySelect,
          } satisfies BayRevealItem,
        ]),
  ];
  const priceItems: BayRevealItem[] = [
    {
      id: "app-price-model",
      label: tt("计价方式"),
      done: true,
      summary: priceModel === "free" ? tt("免费") : priceModel === "subscription" ? tt("按月") : tt("一次买断"),
      children: (
        <BayChoice
          options={[
            { value: "free", title: tt("免费") },
            { value: "one_time", title: tt("一次买断") },
            { value: "subscription", title: tt("按月") },
          ]}
          value={priceModel}
          onChange={(value: AppPriceModel) => {
            if (value === "free") patch({ priceModel: "free", price: "" });
            else patch({ priceModel: value });
          }}
        />
      ),
    },
    {
      id: "price",
      label: "",
      done: priceModel === "free" || !draft.price.trim() || priceFen > 0,
      summary: priceModel === "free" ? tt("免费") : draft.price.trim() ? `${draft.price} USD` : undefined,
      optional: true,
      children: (
        <div className="flex items-center gap-2" data-bay-price-amount="">
          <input
            className={BAY_FORM_AMOUNT_INPUT_CLASS}
            data-bay-field="price"
            inputMode="decimal"
            value={draft.price}
            disabled={Boolean(busy) || priceModel === "free"}
            onChange={(event) => {
              if (isPriceInputText(event.target.value)) patch({ price: event.target.value });
            }}
          />
          <span className="shrink-0 text-[13px] text-neutral-600" data-bay-price-currency="">
            USD
          </span>
        </div>
      ),
    },
  ];
  const termsItems: BayRevealItem[] = [
    ...(app?.source_kind === "computer"
      ? [
          {
            id: "endpoint",
            label: tt("云电脑"),
            done: true,
            optional: true,
            children: (
              <div data-bay-app-computer-url className="space-y-3">
                <EndpointPicker
                  selectedId={draft.endpointId || app.endpoint_id}
                  keepAppId={app.id}
                  onSelect={(row) => patch({ endpointId: row.id })}
                  disabled={Boolean(busy)}
                />
              </div>
            ),
          } satisfies BayRevealItem,
        ]
      : []),
    {
      id: "deadline",
      label: tt("截止日期"),
      done: true,
      optional: true,
      summary: formatDeadline(draft.deadlineAt) || tt("交期可协商"),
      children: (
        <BayDeadlineField
          value={draft.deadlineAt}
          disabled={Boolean(busy)}
          onChange={(deadlineAt) => patch({ deadlineAt })}
        />
      ),
    },
    {
      id: "custom-terms",
      label: tt("用户自定义"),
      done: true,
      optional: true,
      summary: draft.customTerms.trim() ? tt("已填好") : undefined,
      children: (
        <BayCustomTerms
          value={draft.customTerms}
          disabled={Boolean(busy)}
          onChange={(customTerms) => patch({ customTerms })}
        />
      ),
    },
  ];
  const groups = listingSectionGroups({
    tt,
    intent: "sell",
    productItems,
    priceItems,
    audienceItems: [listingAudienceItem(tt, draft.audience, (audience) => patch({ audience }), { disabled: Boolean(busy) })],
    offerItems: [howYouDeliverRow(tt, "app", () => {}, { disabled: true })],
    termsItems,
  });

  const snapshot: BayPostSnapshot = {
    kind: "app",
    title: draft.title,
    summary: draft.summary,
    description: draft.description,
    coverUrl: draft.coverUrl,
    coverUrls: draft.galleryUrls.length ? draft.galleryUrls : draft.coverUrl ? [draft.coverUrl] : [],
    categoryLabel: draft.category
      ? categoryName(
          categoriesView.categories.find((row) => row.slug === draft.category) || {
            slug: draft.category,
            name_zh: draft.category,
            name_en: draft.category,
          },
        )
      : undefined,
    priceFen: priceModel === "free" ? 0 : priceFen,
    customTerms: draft.customTerms,
    deadlineLabel: deadlineToPayload(draft.deadlineAt) || undefined,
  };

  return (
    <BayPublishShell
      kind="app"
      snapshot={snapshot}
      onApply={(next) =>
        patch({
          title: next.title || draft.title,
          summary: next.summary || draft.summary,
          description: next.description || draft.description,
          coverUrl: next.coverUrls?.[0] || (next.coverUrl?.startsWith("https://") ? next.coverUrl : draft.coverUrl),
          galleryUrls: next.coverUrls?.length ? next.coverUrls : draft.galleryUrls,
          customTerms: next.customTerms != null ? next.customTerms : draft.customTerms,
          deadlineAt: deadlineFromRow(next.deadlineLabel) || draft.deadlineAt,
          price: next.priceFen != null ? (next.priceFen > 0 ? String(next.priceFen / 100) : "") : draft.price,
          priceModel: next.priceFen != null ? (next.priceFen > 0 ? (priceModel === "free" ? "one_time" : priceModel) : "free") : draft.priceModel,
        })
      }
    >
    <section data-bay-pane="app-editor" data-bay-reveal className={narrow ? "flex flex-col gap-6 p-4" : BAY_FORM_PAGE_CLASS}>
      {creating ? (
        <BayPublishKindPair
          listing="app"
          siteCategory={filter.category && filter.category !== BAY_ADVICE_ZONE ? filter.category : undefined}
          subcategory={
            <>
              <BayPublishSubcategoryLabel />
              {subcategorySelect}
            </>
          }
        />
      ) : null}

      <BayRevealForm groups={groups} />

      {attempted && localProblems.length ? (
        <p className="text-[12.5px] text-rose-600">{localProblems.map((item) => tt(item)).join("、")}</p>
      ) : null}
      {actionError ? <SellerNotice tone="error">{actionError}</SellerNotice> : null}

      {app ? (
        <footer className={`${BAY_FORM_BAR_CLASS} justify-end`}>
          <button type="button" disabled={Boolean(busy)} className={SECONDARY_BUTTON} onClick={() => void saveDraft()}>
            {busy === "save" ? tt("正在保存…") : tt("存草稿")}
          </button>
          <button type="button" disabled={Boolean(busy)} className={PRIMARY_BUTTON} onClick={() => void publish()}>
            {busy === "publish" ? tt("正在上架…") : tt("上架")}
          </button>
        </footer>
      ) : null}
    </section>
    </BayPublishShell>
  );
}
