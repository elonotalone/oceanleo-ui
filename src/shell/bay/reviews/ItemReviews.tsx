"use client";

// 买家评论区（服务、课程、套餐共用）：评分汇总、筛选、列表、写评价、追评、卖家回复、有用。
// 本文件归 V4 单元；组件名与 props 是合同，不许改。
import { useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayApiError } from "../../../lib/bay/http";
import {
  getBayReviewableOrder,
  type BayReviewableOrder,
  type BayReviewItemKind,
} from "../../../lib/bay/item-reviews";
import { ReviewCard } from "./ReviewCard";
import { ReviewComposer } from "./ReviewComposer";
import { REVIEW_FILTERS, filterCount, filterLabel } from "./review-model";
import { useItemReviews } from "./use-item-reviews";

export interface ItemReviewsProps {
  itemKind: BayReviewItemKind;
  itemId: string;
}

export function ItemReviews({ itemKind, itemId }: ItemReviewsProps): ReactElement {
  const tt = useUI();
  const view = useItemReviews(itemKind, itemId);
  const [reviewable, setReviewable] = useState<BayReviewableOrder | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!itemId) {
      setReviewable(null);
      return;
    }
    let live = true;
    void getBayReviewableOrder(itemKind, itemId)
      .then((data) => {
        if (live) setReviewable(data.order ?? null);
      })
      .catch((error: unknown) => {
        if (!live) return;
        if (error instanceof BayApiError && error.status === 401) {
          setReviewable(null);
          return;
        }
        setReviewable(null);
      });
    return () => {
      live = false;
    };
  }, [itemKind, itemId]);

  const canWrite = Boolean(reviewable && !reviewable.review);
  const empty = view.summary.total === 0 && !view.loading;

  return (
    <div data-bay-item-reviews className="space-y-3">
      {canWrite ? (
        composerOpen ? (
          <ReviewComposer
            contractId={reviewable!.contract_id}
            onPublished={(result) => {
              setComposerOpen(false);
              setReviewable((prev) => (prev ? { ...prev, review: result.review } : prev));
              if (result.moderation_hidden && result.moderation_message) {
                setActionError(result.moderation_message);
                return;
              }
              view.patchItem(result.review);
              view.reload();
            }}
            onNotice={(text, kind) => {
              if (kind === "error") setActionError(text);
              else setActionError("");
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] text-neutral-800 hover:bg-neutral-50"
          >
            {tt("写评价")}
          </button>
        )
      ) : null}

      {actionError ? <p className="text-[12px] text-rose-600">{actionError}</p> : null}

      {view.loading && view.items.length === 0 ? <p className="text-[12.5px] text-neutral-500">{tt("正在读取评价…")}</p> : null}
      {view.error ? (
        <div className="space-y-2">
          <p className="text-[12.5px] text-rose-600">{tt(view.error)}</p>
          <button type="button" onClick={view.reload} className="text-[12px] text-neutral-600 hover:underline">
            {tt("重试")}
          </button>
        </div>
      ) : null}

      {empty ? <p className="text-[13px] text-neutral-500">{tt("还没有评价")}</p> : null}

      {!empty && view.summary.total > 0 ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-[26px] font-semibold leading-none text-neutral-900">{view.summary.avg.toFixed(1)}</p>
            <p className="text-[13px] text-neutral-600">{tt("共 {count} 条评价", { count: view.summary.total })}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_FILTERS.map((filter) => {
              const active = view.filter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  data-bay-review-filter={filter}
                  aria-pressed={active}
                  onClick={() => view.setFilter(filter)}
                  className={
                    "rounded-lg border px-2.5 py-1 text-[12px] " +
                    (active
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
                  }
                >
                  {tt(filterLabel(filter))} {filterCount(view.summary, filter)}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            {view.items.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                onChange={view.patchItem}
                onMutated={view.reload}
              />
            ))}
          </div>
          {view.hasMore ? (
            <button
              type="button"
              onClick={view.loadMore}
              disabled={view.loading}
              className="w-full rounded-lg border border-neutral-200 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
            >
              {tt("加载更多")}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
