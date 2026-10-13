"use client";

import { useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayApiError } from "../../../lib/bay/http";
import { createBayItemReview, type BayItemReview } from "../../../lib/bay/item-reviews";
import { ReviewPhotoFields } from "./ReviewPhotos";
import { composerProblem } from "./review-model";

export function ReviewComposer({
  contractId,
  onPublished,
  onNotice,
}: {
  contractId: string;
  onPublished?: (result: { review: BayItemReview; moderation_hidden: boolean; moderation_message: string }) => void;
  onNotice?: (text: string, kind?: "ok" | "error") => void;
}): ReactElement {
  const tt = useUI();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function publish() {
    const problem = composerProblem({ rating, body, photos });
    if (problem) {
      setError(tt(problem));
      onNotice?.(tt(problem), "error");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await createBayItemReview({
        contract_id: contractId,
        rating,
        body,
        photos,
        anonymous,
      });
      if (result.moderation_hidden && result.moderation_message) {
        setError(result.moderation_message);
        onNotice?.(result.moderation_message, "error");
      } else {
        onNotice?.(tt("评价已公开"), "ok");
      }
      onPublished?.(result);
      setBody("");
      setPhotos([]);
      setRating(0);
    } catch (caught) {
      const message =
        caught instanceof BayApiError && caught.message
          ? caught.message
          : caught instanceof Error && caught.message
            ? caught.message
            : tt("这次没提交成功，请稍后再试。");
      setError(message);
      onNotice?.(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      data-bay-review-composer
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void publish();
      }}
    >
      <p className="text-[12.5px] font-medium text-neutral-800">{tt("写评价")}</p>
      <div className="flex items-center gap-1" role="group" aria-label={tt("星级")}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={tt("{n} 星", { n: value })}
            aria-pressed={rating === value}
            onClick={() => setRating(value)}
            className={"text-[20px] leading-none " + (value <= rating ? "text-amber-500" : "text-neutral-300")}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={tt("可以说说这次买到的怎么样（可选）")}
        className="w-full rounded-full border border-neutral-900 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none focus:border-stone-400"
      />
      <ReviewPhotoFields urls={photos} onChange={setPhotos} disabled={busy} />
      <label className="flex items-center gap-2 text-[12.5px] text-neutral-700">
        <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
        {tt("匿名评价")}
      </label>
      {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {tt("发布")}
      </button>
    </form>
  );
}
