"use client";

// 完成后双方互评：五项 1–5 分 + 正文；对方写了才能看见（revealed）。卖家可以公开回复一条。
// 提交走 W05 的 reputation 导出，内容一律当纯文字。

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  listBayContractReviews,
  replyBayReview,
  reviewInputProblem,
  submitBayReview,
  type BayTrustReview,
} from "../../../lib/bay/reputation";
import { ORDER_BUTTON, ORDER_BUTTON_QUIET, ORDER_INPUT, OrderNote, useOrderDate } from "./order-ui";

const SCORE_FIELDS = ["rating", "score_communication", "score_quality", "score_timeliness", "score_value"] as const;

function scoreLabel(tt: (zh: string) => string, key: (typeof SCORE_FIELDS)[number]): string {
  switch (key) {
    case "rating":
      return tt("总体");
    case "score_communication":
      return tt("沟通");
    case "score_quality":
      return tt("质量");
    case "score_timeliness":
      return tt("时效");
    case "score_value":
      return tt("性价比");
  }
}

export function OrderReviewSection({
  contractId,
  canWrite,
  viewerRole,
  busy,
  onBusy,
  onNotice,
}: {
  contractId: string;
  canWrite: boolean;
  viewerRole: "buyer" | "seller" | null;
  busy: string | null;
  onBusy: (key: string | null) => void;
  onNotice: (text: string, kind?: "ok" | "error") => void;
}) {
  const tt = useUI();
  const formatDate = useOrderDate();
  const [reviews, setReviews] = useState<BayTrustReview[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [mine, setMine] = useState<BayTrustReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState({ rating: 5, score_communication: 5, score_quality: 5, score_timeliness: 5, score_value: 5 });
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");

  async function reload() {
    const data = await listBayContractReviews(contractId);
    setReviews(Array.isArray(data.reviews) ? data.reviews : []);
    setRevealed(Boolean(data.revealed));
    setMine(data.mine ?? data.reviews?.find((item) => item.author_role === viewerRole) ?? null);
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    void reload()
      .catch((error: unknown) => {
        if (live) onNotice(error instanceof Error ? error.message : tt("评价暂时取不到。"), "error");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // 只随订单与身份重取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, viewerRole]);

  return (
    <section data-bay-order-reviews className="space-y-3">
      <h3 className="text-[13px] font-semibold text-neutral-900">{tt("评价")}</h3>
      {loading ? <p className="text-[12.5px] text-neutral-500">{tt("正在读取评价…")}</p> : null}
      {!loading && !revealed && mine ? (
        <OrderNote kind="info">{tt("你的评价已提交。对方写完之后才会互相看见。")}</OrderNote>
      ) : null}

      {canWrite && !mine ? (
        <form
          data-bay-review-form
          className="space-y-2 rounded-xl border border-neutral-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const input = { contract_id: contractId, ...scores, body };
            const problem = reviewInputProblem(tt, input);
            if (problem) {
              onNotice(problem, "error");
              return;
            }
            if (busy) return;
            onBusy("review");
            void submitBayReview(input)
              .then(async () => {
                onNotice(tt("评价已提交。"), "ok");
                setBody("");
                await reload();
              })
              .catch((error: unknown) => {
                onNotice(error instanceof Error ? error.message : tt("没成功，请稍后再试。"), "error");
              })
              .finally(() => onBusy(null));
          }}
        >
          <p className="text-[12.5px] font-medium">{tt("给对方写评价")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCORE_FIELDS.map((field) => (
              <label key={field} className="block text-[12px] text-neutral-600">
                {scoreLabel(tt, field)}
                <select
                  data-bay-review-score={field}
                  value={scores[field]}
                  onChange={(event) => setScores((prev) => ({ ...prev, [field]: Number(event.target.value) }))}
                  className={"mt-1 " + ORDER_INPUT}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <textarea
            data-bay-review-body
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder={tt("可以说说这次合作怎么样（可选）")}
            className={ORDER_INPUT}
          />
          <button type="submit" data-bay-action="submit-review" disabled={busy !== null} className={ORDER_BUTTON}>
            {tt("提交评价")}
          </button>
        </form>
      ) : null}

      {revealed
        ? reviews.map((item) => (
            <article key={item.id} data-bay-review={item.id} className="rounded-xl border border-neutral-200 p-3">
              <p className="text-[12.5px] font-medium text-neutral-800">
                {item.author_role === "buyer" ? tt("买家评价") : tt("卖家评价")}
                {item.rating ? <span className="ms-2 text-neutral-500">{tt("{n} 评分", { n: item.rating })}</span> : null}
                {item.created_at ? <span className="ms-2 text-[11.5px] text-neutral-400">{formatDate(item.created_at)}</span> : null}
              </p>
              {item.body ? <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-neutral-700">{item.body}</p> : null}
              {item.seller_reply ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] text-neutral-600">
                  {tt("卖家回复")}：{item.seller_reply}
                </p>
              ) : viewerRole === "seller" && item.author_role === "buyer" ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    data-bay-review-reply
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={3}
                    placeholder={tt("公开回复这条评价（可选）")}
                    className={ORDER_INPUT}
                  />
                  <button
                    type="button"
                    data-bay-action="reply-review"
                    disabled={busy !== null || !reply.trim()}
                    onClick={() => {
                      if (busy) return;
                      onBusy("reply");
                      void replyBayReview(item.id, reply)
                        .then(async () => {
                          onNotice(tt("回复已公开。"), "ok");
                          setReply("");
                          await reload();
                        })
                        .catch((error: unknown) => {
                          onNotice(error instanceof Error ? error.message : tt("没成功，请稍后再试。"), "error");
                        })
                        .finally(() => onBusy(null));
                    }}
                    className={ORDER_BUTTON_QUIET}
                  >
                    {tt("回复评价")}
                  </button>
                </div>
              ) : null}
            </article>
          ))
        : null}
    </section>
  );
}
