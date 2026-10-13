"use client";

// 「我的」→「我买到的」里的课程一段：我买的课、学习进度、确认与退款。本文件归 V2 单元；组件名与 props 是合同，不许改。
import { useCallback, useEffect, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { listPurchasedBayLessons, type BayPurchasedLesson } from "../../../lib/bay/lessons";
import { openBay, useBaySignedIn, type BayLayout } from "../shell/bay-state";
import { BaySignInPrompt } from "../shell/BayMine";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { safeHttpUrl } from "../supply/format";
import { errorText } from "../supply/use-bay-resource";
import { purchaseStage, type PurchaseStage } from "./purchase-model";

export interface MyBoughtLessonsPaneProps {
  layout: BayLayout;
  siteKey: string;
}

function stageLabel(stage: PurchaseStage, tt: (zh: string) => string): string {
  switch (stage) {
    case "held":
      return tt("托管中");
    case "refund-pending":
      return tt("退款处理中");
    case "refund-declined":
      return tt("卖家已拒绝退款");
    case "disputed":
      return tt("平台介入中");
    case "completed":
      return tt("已完成");
    case "refunded":
      return tt("已退款");
    default:
      return "";
  }
}

export function MyBoughtLessonsPane(_props: MyBoughtLessonsPaneProps): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [items, setItems] = useState<BayPurchasedLesson[]>([]);
  const [load, setLoad] = useState<{ loading: boolean; error: string }>({ loading: true, error: "" });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setLoad({ loading: true, error: "" });
    listPurchasedBayLessons().then(
      (body) => {
        if (!alive) return;
        setItems(body.items || []);
        setLoad({ loading: false, error: "" });
      },
      (error: unknown) => {
        if (alive) setLoad({ loading: false, error: errorText(error) || tt("没读到你买到的课，请稍后再试。") });
      },
    );
    return () => {
      alive = false;
    };
  }, [signedIn, nonce, tt]);

  if (!signedIn) return <BaySignInPrompt text={tt("登录后查看你买到的课")} />;
  if (load.loading) return <PaneLoading />;
  if (load.error) return <PaneMessage text={tt(load.error)} onRetry={reload} />;

  return (
    <section data-bay-pane="mine-bought-lessons" className="space-y-3 p-4">
      {items.length === 0 ? (
        <div data-bay-empty="bought-lessons" className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center">
          <p className="text-[13px] text-neutral-600">{tt("你还没有买过课程")}</p>
          <button
            type="button"
            onClick={() => openBay({ kind: "feed", filter: { kind: "lesson" } })}
            className="mt-3 rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800"
          >
            {tt("去逛课程")}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {items.map((row) => {
            const cover = safeHttpUrl(row.lesson.cover_url);
            const author = row.lesson.author;
            const authorName = author?.display_name || author?.handle || "";
            const stage = purchaseStage(row.purchase);
            return (
              <li key={`${row.lesson.id}:${row.purchase.id}`} className="flex items-center gap-3 py-3">
                {cover ? (
                  <img src={cover} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100" />
                )}
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => openBay({ kind: "lesson", id: row.lesson.id })} className="block w-full text-left">
                    <span className="block truncate text-[14px] font-semibold text-neutral-900">{row.lesson.title}</span>
                    {authorName ? <span className="mt-0.5 block truncate text-[12px] text-neutral-500">{authorName}</span> : null}
                  </button>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-neutral-500">
                    <span>{tt("已学 {done} / {total} 节", { done: row.done_count, total: row.lesson.chapter_count })}</span>
                    {stage !== "none" ? (
                      <span data-bay-purchase-stage={stage} className="rounded-md bg-neutral-100 px-2 py-0.5 text-neutral-600">
                        {stageLabel(stage, tt)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openBay({ kind: "lesson", id: row.lesson.id })}
                  className="shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800"
                >
                  {tt("继续学习")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
