"use client";

// 发布 / 编辑一门课：资料、定价、章节。本文件归 V3 单元；组件名与 props 是合同，不许改。
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
import { INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerCard, SellerField, SellerNotice, TEXTAREA_CLASS } from "../seller/seller-ui";
import { DEFAULT_CURRENCY, yuanText } from "../seller/editor-model";
import { useBayCategoryName } from "../shell/BayList";
import { BaySignInPrompt } from "../shell/BayMine";
import { openBay, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { useBayCategories } from "../shell/use-bay-data";
import { ChapterList } from "./ChapterList";
import {
  draftFromLesson,
  emptyLessonDraft,
  lessonDraftProblems,
  lessonPatch,
  parseLessonPriceFen,
  type LessonDraft,
} from "./lesson-editor-model";

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

export function LessonEditorPane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const currency = DEFAULT_CURRENCY;
  const categoriesView = useBayCategories();
  const categoryName = useBayCategoryName();
  const routeId = props.target.kind === "lesson-editor" ? props.target.lessonId || "" : "";
  const [lesson, setLesson] = useState<BayLessonMine | null>(null);
  const [chapters, setChapters] = useState<BayLessonChapter[]>([]);
  const [draft, setDraft] = useState<LessonDraft>(emptyLessonDraft);
  const [load, setLoad] = useState({ loading: true, error: "" });
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | "create" | "">("");

  const applyLesson = useCallback((row: BayLessonMine, nextChapters?: BayLessonChapter[]) => {
    setLesson(row);
    setDraft(draftFromLesson(row, yuanText));
    if (nextChapters) setChapters(nextChapters);
  }, []);

  useEffect(() => {
    if (!signedIn || props.target.kind !== "lesson-editor") return;
    let alive = true;
    setActionError("");
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
        setLoad({ loading: false, error: errorText(error, tt("这门课不存在")) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, routeId, props.target.kind, applyLesson, tt]);

  if (props.target.kind !== "lesson-editor") return null;
  if (!signedIn) return <BaySignInPrompt text={tt("登录后才能发布课程")} />;

  const narrow = props.layout === "docked" || props.layout === "mobile";
  const knownSlugs = new Set(categoriesView.categories.map((row) => row.slug));
  const localProblems = lessonDraftProblems(draft, parseLessonPriceFen);
  const coverPreview = draft.coverUrl.startsWith("https://") ? draft.coverUrl : "";

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
      category: draft.category || null,
      posted_site: props.siteKey || null,
      price_fen: fen ?? 0,
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
        <SellerNotice tone="error">{load.error}</SellerNotice>
      </section>
    );
  }

  const infoBlock = (
    <SellerCard title={tt("课程资料")}>
      <SellerField label={tt("名称")} hint={`${draft.title.length}/80`}>
        <input className={INPUT_CLASS} maxLength={80} value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
      </SellerField>
      <SellerField label={tt("一句话简介")} hint={`${draft.summary.length}/200`}>
        <input className={INPUT_CLASS} maxLength={200} value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} />
      </SellerField>
      <SellerField label={tt("详细介绍")} hint={`${draft.description.length}/4000`}>
        <textarea className={TEXTAREA_CLASS} rows={5} maxLength={4000} value={draft.description} onChange={(event) => patch({ description: event.target.value })} />
      </SellerField>
      <SellerField label={tt("封面图地址")}>
        <div className="flex items-start gap-3">
          <input className={INPUT_CLASS} value={draft.coverUrl} onChange={(event) => patch({ coverUrl: event.target.value })} />
          {coverPreview ? <img src={coverPreview} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : null}
        </div>
      </SellerField>
      <SellerField label={tt("类目")}>
        <select className={INPUT_CLASS} value={draft.category} onChange={(event) => patch({ category: event.target.value })}>
          <option value="">{tt("请选择类目")}</option>
          {draft.category && !knownSlugs.has(draft.category) ? <option value={draft.category}>{draft.category}</option> : null}
          {categoriesView.categories.map((row) => (
            <option key={row.slug} value={row.slug}>
              {categoryName(row)}
            </option>
          ))}
        </select>
      </SellerField>
    </SellerCard>
  );

  const priceBlock = (
    <SellerCard title={tt("定价")}>
      <SellerField label={tt("价格")}>
        <div className="flex items-center gap-2">
          <input className={INPUT_CLASS} inputMode="decimal" value={draft.price} onChange={(event) => patch({ price: event.target.value })} />
          <span className="shrink-0 text-[13px] text-stone-500">{currency}</span>
        </div>
      </SellerField>
      <p className="text-[12.5px] leading-5 text-stone-500">
        {tt("买家付款时另加支付通道费，平台不抽成。款项先托管 7 天，买家确认或到期后到账")}
      </p>
    </SellerCard>
  );

  return (
    <section data-bay-pane="lesson-editor" className={`space-y-4 p-4 sm:p-6 ${narrow ? "" : "mx-auto w-full max-w-3xl"}`}>
      {infoBlock}
      {priceBlock}
      {lesson ? (
        <SellerCard title={tt("章节")}>
          <ChapterList
            lessonId={lesson.id}
            chapters={chapters}
            disabled={Boolean(busy)}
            onChapters={setChapters}
            onError={setActionError}
          />
        </SellerCard>
      ) : null}
      {localProblems.length ? (
        <p className="text-[12.5px] text-stone-500">{localProblems.map((item) => tt(item)).join("、")}</p>
      ) : null}
      {actionError ? <SellerNotice tone="error">{actionError}</SellerNotice> : null}
      <footer className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200/70 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {lesson ? (
          <>
            <button type="button" disabled={Boolean(busy)} className={SECONDARY_BUTTON} onClick={() => void saveDraft()}>
              {busy === "save" ? tt("正在保存…") : tt("存草稿")}
            </button>
            <button type="button" disabled={Boolean(busy)} className={PRIMARY_BUTTON} onClick={() => void publish()}>
              {busy === "publish" ? tt("正在上架…") : tt("上架")}
            </button>
          </>
        ) : (
          <button type="button" disabled={Boolean(busy)} className={PRIMARY_BUTTON} onClick={() => void createThenEdit()}>
            {busy === "create" ? tt("正在保存…") : tt("下一步：添加章节")}
          </button>
        )}
      </footer>
    </section>
  );
}
