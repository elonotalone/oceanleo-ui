"use client";

import { useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayApiError } from "../../../lib/bay/http";
import {
  addBayItemReviewFollowup,
  replyBayItemReview,
  unvoteBayItemReview,
  voteBayItemReview,
  type BayItemReview,
} from "../../../lib/bay/item-reviews";
import { openBay, requireBayLogin } from "../shell/bay-state";
import { ReviewPhotoFields, ReviewPhotos } from "./ReviewPhotos";
import { canFollowup, canReplyFollowup, canReplyReview, canVote, followupDays, safePhotos } from "./review-model";

function failText(error: unknown, fallback: string): string {
  if (error instanceof BayApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function Stars({ rating }: { rating: number }): ReactElement {
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="inline-flex gap-0.5 text-[13px] text-amber-500" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= value ? "text-amber-500" : "text-neutral-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0] || "";
}

function formatDay(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function ReviewCard({
  review,
  onChange,
  onMutated,
}: {
  review: BayItemReview;
  onChange: (review: BayItemReview) => void;
  onMutated?: () => void;
}): ReactElement {
  const tt = useUI();
  const [followupBody, setFollowupBody] = useState("");
  const [followupPhotos, setFollowupPhotos] = useState<string[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [followupReplyBody, setFollowupReplyBody] = useState("");
  const [showFollowup, setShowFollowup] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [showFollowupReply, setShowFollowupReply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const anonymous = review.anonymous || !review.author.user_id;
  const name = anonymous ? tt("匿名买家") : review.author.display_name || tt("匿名买家");
  const avatar = anonymous ? null : review.author.avatar_url;
  const handle = anonymous ? null : review.author.handle;
  const days = followupDays(review.created_at, review.followup_at);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(failText(caught, tt("这次没提交成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  async function toggleVote() {
    if (!canVote(review)) return;
    if (!requireBayLogin()) {
      setError(tt("登录后才能点「有用」"));
      return;
    }
    const previous = review;
    const nextVoted = !review.viewer_voted;
    onChange({
      ...review,
      viewer_voted: nextVoted,
      helpful_count: Math.max(0, review.helpful_count + (nextVoted ? 1 : -1)),
    });
    try {
      const result = nextVoted ? await voteBayItemReview(review.id) : await unvoteBayItemReview(review.id);
      onChange({ ...review, helpful_count: result.helpful_count, viewer_voted: result.viewer_voted });
    } catch (caught) {
      onChange(previous);
      setError(failText(caught, tt("这次没提交成功，请稍后再试。")));
    }
  }

  return (
    <article data-bay-item-review={review.id} className="py-2">
      <div className="flex items-start gap-3">
        {avatar && safePhotos([avatar])[0] ? (
          handle ? (
            <button type="button" onClick={() => openBay({ kind: "profile", handle })} className="shrink-0">
              <img src={safePhotos([avatar])[0]} loading="lazy" referrerPolicy="no-referrer" alt="" className="h-10 w-10 rounded-full object-cover" />
            </button>
          ) : (
            <img src={safePhotos([avatar])[0]} loading="lazy" referrerPolicy="no-referrer" alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          )
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-[14px] font-semibold text-neutral-500">
            {anonymous ? "" : initialOf(name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-neutral-600">
            {handle && !anonymous ? (
              <button type="button" onClick={() => openBay({ kind: "profile", handle })} className="truncate font-medium text-neutral-800 hover:underline">
                {name}
              </button>
            ) : (
              <span className="truncate font-medium text-neutral-800">{name}</span>
            )}
            <Stars rating={review.rating} />
            {review.created_at ? <span className="text-neutral-400">{formatDay(review.created_at)}</span> : null}
          </div>
          {review.body ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-neutral-700">{review.body}</p> : null}
          <ReviewPhotos urls={review.photos} />
          {review.seller_reply ? (
            <div className="mt-2 ml-3 rounded-lg bg-neutral-50 px-3 py-2">
              <p className="text-[11px] font-medium text-neutral-500">{tt("卖家回复")}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-neutral-700">{review.seller_reply}</p>
            </div>
          ) : null}
          {review.followup_body ? (
            <div className="mt-2">
              <p className="text-[11px] font-medium text-neutral-500">
                {days === null ? tt("追评") : tt("追评 · 购买 {count} 天后", { count: days })}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-neutral-700">{review.followup_body}</p>
              <ReviewPhotos urls={review.followup_photos} />
              {review.followup_reply ? (
                <div className="mt-2 ml-3 rounded-lg bg-neutral-50 px-3 py-2">
                  <p className="text-[11px] font-medium text-neutral-500">{tt("卖家回复")}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-neutral-700">{review.followup_reply}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {canFollowup(review) ? (
            <div className="mt-2">
              {showFollowup ? (
                <div className="space-y-2">
                  <textarea
                    value={followupBody}
                    onChange={(event) => setFollowupBody(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={tt("追评最多 2000 个字")}
                    className="w-full rounded-full border border-neutral-900 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400"
                  />
                  <ReviewPhotoFields urls={followupPhotos} onChange={setFollowupPhotos} disabled={busy} />
                  <button
                    type="button"
                    disabled={busy || !followupBody.trim()}
                    onClick={() =>
                      void run(async () => {
                        const result = await addBayItemReviewFollowup(review.id, followupBody.trim(), followupPhotos);
                        onChange(result.review);
                        onMutated?.();
                        setShowFollowup(false);
                        setFollowupBody("");
                        setFollowupPhotos([]);
                      })
                    }
                    className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
                  >
                    {tt("发布")}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowFollowup(true)} className="text-[12px] text-neutral-600 hover:underline">
                  {tt("追评")}
                </button>
              )}
            </div>
          ) : null}

          {canReplyReview(review) ? (
            <div className="mt-2">
              {showReply ? (
                <div className="space-y-2">
                  <textarea
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={tt("回复这条评价")}
                    className="w-full rounded-full border border-neutral-900 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400"
                  />
                  <button
                    type="button"
                    disabled={busy || !replyBody.trim()}
                    onClick={() =>
                      void run(async () => {
                        const result = await replyBayItemReview(review.id, replyBody.trim(), "review");
                        onChange(result.review);
                        onMutated?.();
                        setShowReply(false);
                        setReplyBody("");
                      })
                    }
                    className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
                  >
                    {tt("回复")}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowReply(true)} className="text-[12px] text-neutral-600 hover:underline">
                  {tt("回复")}
                </button>
              )}
            </div>
          ) : null}

          {canReplyFollowup(review) ? (
            <div className="mt-2">
              {showFollowupReply ? (
                <div className="space-y-2">
                  <textarea
                    value={followupReplyBody}
                    onChange={(event) => setFollowupReplyBody(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={tt("回复这条追评")}
                    className="w-full rounded-full border border-neutral-900 bg-white px-3 py-2 text-[13px] outline-none focus:border-stone-400"
                  />
                  <button
                    type="button"
                    disabled={busy || !followupReplyBody.trim()}
                    onClick={() =>
                      void run(async () => {
                        const result = await replyBayItemReview(review.id, followupReplyBody.trim(), "followup");
                        onChange(result.review);
                        onMutated?.();
                        setShowFollowupReply(false);
                        setFollowupReplyBody("");
                      })
                    }
                    className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-50"
                  >
                    {tt("回复")}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowFollowupReply(true)} className="text-[12px] text-neutral-600 hover:underline">
                  {tt("回复")}
                </button>
              )}
            </div>
          ) : null}

          {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}
        </div>
      </div>
      {canVote(review) ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            aria-pressed={review.viewer_voted}
            onClick={() => void toggleVote()}
            className={
              "rounded-lg border px-2.5 py-1 text-[12px] " +
              (review.viewer_voted
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")
            }
          >
            {tt("有用")} {review.helpful_count}
          </button>
        </div>
      ) : null}
    </article>
  );
}
