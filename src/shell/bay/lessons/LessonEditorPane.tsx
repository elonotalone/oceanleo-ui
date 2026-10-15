"use client";

// 发布 / 编辑一门课：资料、定价、章节。本文件归 V3 单元；组件名与 props 是合同，不许改。
import { deadlineFromRow, deadlineToPayload, formatDeadline } from "../form/bay-deadline";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  createBayLesson,
  getBayLesson,
  publishBayLesson,
  updateBayLesson,
  type BayLessonChapter,
  type BayLessonMine,
} from "../../../lib/bay/lessons";
import { BayApiError } from "../../../lib/bay/http";
import { INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerCard, SellerNotice, TEXTAREA_CLASS } from "../seller/seller-ui";
import { yuanText } from "../seller/editor-model";
import { useBayCategoryName } from "../shell/BayList";
import { BaySignInPrompt } from "../shell/BayMine";
import { BAY_ADVICE_ZONE } from "../shell/bay-links";
import { openBay, useBayFilter, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { useBayCategories } from "../shell/use-bay-data";
import {
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
  howYouDeliverRow,
  isPriceInputText,
  listingAudienceItem,
  listingSectionGroups,
  type BayPostSnapshot,
  type BayRevealItem,
} from "../form";
import { ChapterList } from "./ChapterList";
import {
  draftFromLesson,
  emptyLessonDraft,
  lessonDraftProblems,
  lessonPatch,
  lessonTermsWrite,
  parseLessonPriceFen,
  type LessonDraft,
} from "./lesson-editor-model";

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

export function LessonEditorPane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const filter = useBayFilter();
  const categoriesView = useBayCategories();
  const categoryName = useBayCategoryName();
  const routeId = props.target.kind === "lesson-editor" ? props.target.lessonId || "" : "";
  const [lesson, setLesson] = useState<BayLessonMine | null>(null);
  const [chapters, setChapters] = useState<BayLessonChapter[]>([]);
  const [draft, setDraft] = useState<LessonDraft>(emptyLessonDraft);
  const [load, setLoad] = useState({ loading: true, error: "" });
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | "create" | "">("");
  const [showProblems, setShowProblems] = useState(false);

  const applyLesson = useCallback((row: BayLessonMine, nextChapters?: BayLessonChapter[]) => {
    setLesson(row);
    setDraft(draftFromLesson(row, yuanText));
    if (nextChapters) setChapters(nextChapters);
  }, []);

  useEffect(() => {
    if (!signedIn || props.target.kind !== "lesson-editor") return;
    let alive = true;
    setActionError("");
    setShowProblems(false);
    if (!routeId) {
      setLesson(null);
      setChapters([]);
      setDraft(emptyLessonDraft());
      setLoad({ loading: false, error: "" });
      return;
    }
    setLoad({ loading: true, error: "" });
    void (async () => {
      try {
        const body = await getBayLesson(routeId);
        if (!alive) return;
        applyLesson(body.lesson as BayLessonMine, body.chapters || []);
        setLoad({ loading: false, error: "" });
      } catch (error) {
        if (!alive) return;
        setLesson(null);
        setLoad({ loading: false, error: errorText(error, "这门课不存在") });
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, routeId, props.target.kind, applyLesson]);

  if (props.target.kind !== "lesson-editor") return null;
  if (!signedIn) return <BaySignInPrompt text={tt("登录后才能发布课程")} />;

  const narrow = props.layout === "docked" || props.layout === "mobile";
  const knownSlugs = new Set(categoriesView.categories.map((row) => row.slug));
  const localProblems = lessonDraftProblems(draft, parseLessonPriceFen);
  const categoryRow = categoriesView.categories.find((row) => row.slug === draft.category);
  const locked = Boolean(busy);

  function patch(next: Partial<LessonDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function inputBody() {
    const fen = parseLessonPriceFen(draft.price);
    return {
      title: draft.title,
      summary: draft.summary,
      description: draft.description,
      cover_url: draft.coverUrl.trim() === "" ? null : draft.coverUrl,
      gallery_urls: draft.galleryUrls,
      category: draft.category || null,
      posted_site: props.siteKey || null,
      price_fen: fen ?? 0,
      ...lessonTermsWrite(draft),
    };
  }

  async function persistDraft(): Promise<BayLessonMine | null> {
    if (!lesson) return null;
    const next = lessonPatch(draft, lesson, parseLessonPriceFen);
    if (Object.keys(next).length === 0) return lesson;
    const body = await updateBayLesson(lesson.id, next);
    applyLesson(body.lesson);
    return body.lesson;
  }

  async function createThenEdit() {
    if (busy) return;
    setShowProblems(true);
    if (lessonDraftProblems(draft, parseLessonPriceFen).length) return;
    setBusy("create");
    setActionError("");
    try {
      const body = await createBayLesson(inputBody());
      openBay({ kind: "lesson-editor", lessonId: body.lesson.id });
    } catch (error) {
      setActionError(errorText(error, tt("草稿没建好，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  async function saveDraft() {
    if (!lesson || busy) return;
    setShowProblems(true);
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
    if (!lesson || busy) return;
    setShowProblems(true);
    if (localProblems.length) return;
    setBusy("publish");
    setActionError("");
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const body = await publishBayLesson(saved.id);
      applyLesson(body.lesson);
      openBay({ kind: "lesson", id: body.lesson.id });
    } catch (error) {
      setActionError(errorText(error, tt("上架没有通过，请按提示改完再试。")));
    } finally {
      setBusy("");
    }
  }

  if (load.loading) {
    return (
      <section data-bay-pane="lesson-editor" className="p-4 text-[13px] text-stone-500">
        {tt("正在打开…")}
      </section>
    );
  }
  if (load.error && !lesson) {
    return (
      <section data-bay-pane="lesson-editor" className="space-y-3 p-4">
        <SellerNotice tone="error">{tt(load.error)}</SellerNotice>
      </section>
    );
  }

  const creating = !routeId;
  const subcategorySelect = (
    <BayMenuSelect
      value={draft.category}
      emptyLabel={tt("请选择")}
      onChange={(slug) => patch({ category: slug })}
      disabled={locked}
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
          disabled={locked}
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
          disabled={locked}
          onChange={(event) => patch({ title: event.target.value })}
        />
      ),
    },
    {
      id: "description",
      label: tt("详细介绍"),
      done: Boolean(draft.description.trim()),
      optional: true,
      summary: draft.description.trim() ? draft.description.trim().slice(0, 80) : undefined,
      children: (
        <textarea
          className={TEXTAREA_CLASS}
          rows={8}
          maxLength={4000}
          value={draft.description}
          disabled={locked}
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
            summary: categoryRow ? categoryName(categoryRow) : draft.category || undefined,
            children: subcategorySelect,
          } satisfies BayRevealItem,
        ]),
  ];
  const priceItems: BayRevealItem[] = [
    {
      id: "price",
      label: "",
      done: !draft.price.trim() || parseLessonPriceFen(draft.price) !== null,
      optional: true,
      summary: draft.price.trim()
        ? parseLessonPriceFen(draft.price) === 0
          ? tt("免费")
          : `${draft.price} USD`
        : undefined,
      children: (
        <div className="flex items-center gap-2" data-bay-price-amount="">
          <input
            className={BAY_FORM_AMOUNT_INPUT_CLASS}
            inputMode="decimal"
            value={draft.price}
            disabled={locked}
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
    {
      id: "deadline",
      label: tt("截止日期"),
      done: true,
      optional: true,
      summary: formatDeadline(draft.deadlineAt) || tt("交期可协商"),
      children: (
        <BayDeadlineField
          value={draft.deadlineAt}
          disabled={locked}
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
      children: <BayCustomTerms value={draft.customTerms} disabled={locked} onChange={(customTerms) => patch({ customTerms })} />,
    },
  ];
  const groups = listingSectionGroups({
    tt,
    intent: "sell",
    productItems,
    priceItems,
    audienceItems: [listingAudienceItem(tt, draft.audience, (audience) => patch({ audience }), { disabled: locked })],
    offerItems: [howYouDeliverRow(tt, "lesson", () => {}, { disabled: true })],
    termsItems,
  });

  const snapshot: BayPostSnapshot = {
    kind: "lesson",
    title: draft.title,
    summary: draft.summary,
    description: draft.description,
    coverUrl: draft.coverUrl,
    coverUrls: draft.galleryUrls.length ? draft.galleryUrls : draft.coverUrl ? [draft.coverUrl] : [],
    categoryLabel: categoryRow ? categoryName(categoryRow) : draft.category || undefined,
    priceFen: parseLessonPriceFen(draft.price) ?? 0,
    customTerms: draft.customTerms,
    deadlineLabel: deadlineToPayload(draft.deadlineAt) || undefined,
  };

  return (
    <BayPublishShell
      kind="lesson"
      snapshot={snapshot}
      onApply={(next) =>
        patch({
          title: next.title || draft.title,
          summary: next.summary || draft.summary,
          description: next.description || draft.description,
          coverUrl: next.coverUrls?.[0] || (next.coverUrl?.startsWith("https://") ? next.coverUrl : draft.coverUrl),
          galleryUrls: next.coverUrls?.length ? next.coverUrls : draft.galleryUrls,
          price: next.priceFen != null ? String(next.priceFen / 100) : draft.price,
          customTerms: next.customTerms != null ? next.customTerms : draft.customTerms,
          deadlineAt: deadlineFromRow(next.deadlineLabel) || draft.deadlineAt,
        })
      }
    >
    <section data-bay-pane="lesson-editor" className={narrow ? "flex flex-col gap-6 p-4" : BAY_FORM_PAGE_CLASS}>
      {creating ? (
        <BayPublishKindPair
          listing="lesson"
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
      {lesson ? (
        <SellerCard title={tt("章节")}>
          <ChapterList
            lessonId={lesson.id}
            chapters={chapters}
            disabled={locked}
            onChapters={setChapters}
            onError={setActionError}
          />
        </SellerCard>
      ) : null}
      {showProblems && localProblems.length ? (
        <p className="text-[12.5px] text-stone-500">{localProblems.map((item) => tt(item)).join("、")}</p>
      ) : null}
      {actionError ? <SellerNotice tone="error">{actionError}</SellerNotice> : null}
      <footer className={`${BAY_FORM_BAR_CLASS} justify-end`}>
        {lesson ? (
          <>
            <button type="button" disabled={locked} className={SECONDARY_BUTTON} onClick={() => void saveDraft()}>
              {busy === "save" ? tt("正在保存…") : tt("存草稿")}
            </button>
            <button type="button" disabled={locked} className={PRIMARY_BUTTON} onClick={() => void publish()}>
              {busy === "publish" ? tt("正在上架…") : tt("上架")}
            </button>
          </>
        ) : (
          <button type="button" disabled={locked} className={PRIMARY_BUTTON} onClick={() => void createThenEdit()}>
            {busy === "create" ? tt("正在保存…") : tt("保存")}
          </button>
        )}
      </footer>
    </section>
    </BayPublishShell>
  );
}
