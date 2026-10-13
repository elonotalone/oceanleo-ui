"use client";

// 课程详情：大纲、试看、购买、看课、确认与退款、买家评论区。本文件归 V2 单元；组件名与 props 是合同，不许改。
import { useEffect, useState, type ReactElement } from "react";
import { BayImageStage } from "../form/BayImageGallery";
import { cleanGalleryUrls } from "../form/bay-gallery";

import { useUI } from "../../../i18n/ui/useUI";
import { getBayLesson, getBayLessonProgress, reportBayLesson, type BayLessonDetail } from "../../../lib/bay/lessons";
import { ItemReviews } from "../reviews/ItemReviews";
import { openBay, type BayPaneProps } from "../shell/bay-state";
import { Avatar, PaneLoading, PaneMessage, ReportBox, Section } from "../supply/parts";
import { moneyOrFree, safeHttpUrl } from "../supply/format";
import { useBayResource } from "../supply/use-bay-resource";
import { useLedgerCurrency } from "../../../lib/money";
import { BuyButton } from "./BuyButton";
import { LessonOutline, playLessonChapter } from "./LessonOutline";
import { PurchasePanel } from "./PurchasePanel";
import { chapterAccess, nextChapterId } from "./purchase-model";

export function LessonPane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const lessonId = props.target.kind === "lesson" ? props.target.id : "";
  const resource = useBayResource(lessonId ? `lesson:${lessonId}` : null, () => getBayLesson(lessonId));
  if (!lessonId) return null;
  if (resource.loading) return <PaneLoading />;
  if (!resource.data) {
    const text = resource.status === 404 || !resource.error ? tt("这个课程不存在或已下架") : tt(resource.error);
    return <PaneMessage text={text} onRetry={resource.reload} />;
  }
  return <LessonDetailView payload={resource.data} onReload={resource.reload} />;
}

function LessonDetailView({ payload, onReload }: { payload: BayLessonDetail; onReload: () => void }): ReactElement {
  const tt = useUI();
  const currency = useLedgerCurrency();
  const { lesson, chapters, viewer } = payload;
  const owned = viewer.owned;
  const canProgress = viewer.is_owner || owned;
  const progress = useBayResource(canProgress ? `lesson-progress:${lesson.id}` : null, () => getBayLessonProgress(lesson.id));
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [continueError, setContinueError] = useState("");
  const coverUrls = cleanGalleryUrls(lesson.gallery_urls, lesson.cover_url);
  const [activeCover, setActiveCover] = useState(0);
  const cover = coverUrls[0] || safeHttpUrl(lesson.cover_url);
  const author = lesson.author;
  const authorName = author?.display_name || author?.handle || "";

  useEffect(() => {
    if (progress.data) setDoneIds(progress.data.done_chapter_ids || []);
  }, [progress.data]);

  async function continueLearning() {
    const nextId = nextChapterId(chapters, doneIds);
    const chapter = chapters.find((item) => item.id === nextId);
    if (!chapter) return;
    if (chapterAccess(chapter, owned || viewer.is_owner) === "locked") {
      setContinueError(tt("买了这门课才能看这一节"));
      return;
    }
    setContinueError("");
    const result = await playLessonChapter(lesson.id, chapter);
    if (!result.opened) {
      setContinueError(tt(result.error));
      return;
    }
    if (result.doneIds) setDoneIds(result.doneIds);
  }

  return (
    <div data-bay-pane="lesson" className="p-4">
      {coverUrls.length ? (
        <div className="mb-4">
          <BayImageStage urls={coverUrls} active={activeCover} onActive={setActiveCover} emptyLabel={tt("封面")} />
        </div>
      ) : cover ? (
        <img src={cover} alt="" className="mb-4 aspect-video w-full rounded-xl bg-neutral-100 object-cover" />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[18px] font-semibold text-neutral-950">{lesson.title}</h2>
          {lesson.summary ? <p className="mt-1.5 break-words text-[13px] text-neutral-600">{lesson.summary}</p> : null}
          {author ? (
            <div className="mt-3 flex items-center gap-2">
              <Avatar url={author.avatar_url} name={authorName} size="sm" />
              {author.handle ? (
                <button
                  type="button"
                  data-bay-author
                  onClick={() => openBay({ kind: "profile", handle: author.handle as string })}
                  className="truncate text-[13px] font-medium text-neutral-800 hover:underline"
                >
                  {authorName}
                </button>
              ) : (
                <span className="truncate text-[13px] font-medium text-neutral-800">{authorName}</span>
              )}
              {author.official ? <span className="shrink-0 text-[11px] text-neutral-500">{tt("官方")}</span> : null}
            </div>
          ) : null}
          <p className="mt-2 text-[12px] text-neutral-500">
            {tt("{n} 节 · 已售 {sold} · ★ {avg}（{count}）", {
              n: lesson.chapter_count,
              sold: lesson.sales_count,
              avg: Number(lesson.rating_avg || 0).toFixed(1),
              count: lesson.rating_count || 0,
            })}
          </p>
          <p className="mt-2 text-[16px] font-semibold text-neutral-950">{moneyOrFree(tt, lesson.price_fen, currency)}</p>
          {continueError ? <p className="mt-2 text-[12px] text-rose-600">{continueError}</p> : null}
        </div>
        <BuyButton
          itemKind="lesson"
          itemId={lesson.id}
          title={lesson.title}
          priceFen={lesson.price_fen}
          isOwner={viewer.is_owner}
          owned={owned}
          onReload={onReload}
          onContinue={() => void continueLearning()}
        />
      </div>

      {owned && !viewer.is_owner ? <PurchasePanel purchase={viewer.purchase} onReload={onReload} /> : null}
      {viewer.is_owner && viewer.purchase ? <PurchasePanel purchase={viewer.purchase} onReload={onReload} /> : null}

      <LessonOutline
        lessonId={lesson.id}
        chapters={chapters}
        doneIds={doneIds}
        owned={owned || viewer.is_owner}
        onDoneIds={setDoneIds}
      />

      {lesson.description ? (
        <Section title={tt("详细介绍")}>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-neutral-700">{lesson.description}</p>
        </Section>
      ) : null}

      <Section title={tt("买家评价")}>
        <ItemReviews itemKind="lesson" itemId={lesson.id} />
      </Section>

      {viewer.is_owner ? null : (
        <div className="mt-5">
          <ReportBox onSubmit={(reason, detail) => reportBayLesson(lesson.id, reason, detail)} />
        </div>
      )}
    </div>
  );
}
