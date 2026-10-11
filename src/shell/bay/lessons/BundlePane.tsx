"use client";

// 套餐详情：里面有哪几门课、套餐价、购买。本文件归 V2 单元；组件名与 props 是合同，不许改。
import type { ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getBayLessonBundle, reportBayLessonBundle, type BayLessonBundleDetail } from "../../../lib/bay/lessons";
import { formatBayMoney } from "../../../lib/bay/services";
import { useLedgerCurrency } from "../../../lib/money";
import { ItemReviews } from "../reviews/ItemReviews";
import { openBay, type BayPaneProps } from "../shell/bay-state";
import { Avatar, PaneLoading, PaneMessage, ReportBox, Section } from "../supply/parts";
import { moneyOrFree, safeHttpUrl } from "../supply/format";
import { useBayResource } from "../supply/use-bay-resource";
import { BuyButton } from "./BuyButton";
import { PurchasePanel } from "./PurchasePanel";

export function BundlePane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const bundleId = props.target.kind === "bundle" ? props.target.id : "";
  const resource = useBayResource(bundleId ? `bundle:${bundleId}` : null, () => getBayLessonBundle(bundleId));
  if (!bundleId) return null;
  if (resource.loading) return <PaneLoading />;
  if (!resource.data) {
    const text = resource.status === 404 || !resource.error ? tt("这个套餐不存在或已下架") : tt(resource.error);
    return <PaneMessage text={text} onRetry={resource.reload} />;
  }
  return <BundleDetailView payload={resource.data} onReload={resource.reload} />;
}

function BundleDetailView({ payload, onReload }: { payload: BayLessonBundleDetail; onReload: () => void }): ReactElement {
  const tt = useUI();
  const currency = useLedgerCurrency();
  const { bundle, viewer } = payload;
  const cover = safeHttpUrl(bundle.cover_url);
  const author = bundle.author;
  const authorName = author?.display_name || author?.handle || "";
  const lessons = bundle.lessons || [];
  const totalFen = bundle.lessons_total_fen ?? lessons.reduce((sum, lesson) => sum + (lesson.price_fen || 0), 0);
  const savedFen = Math.max(0, totalFen - bundle.price_fen);
  const ownedIds = new Set(viewer.owned_lesson_ids || []);
  const ownedCount = ownedIds.size;

  return (
    <div data-bay-pane="bundle" className="p-4">
      {cover ? <img src={cover} alt="" className="mb-4 aspect-video w-full rounded-xl bg-neutral-100 object-cover" /> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[18px] font-semibold text-neutral-950">{bundle.title}</h2>
          {bundle.summary ? <p className="mt-1.5 break-words text-[13px] text-neutral-600">{bundle.summary}</p> : null}
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
          <p className="mt-3 text-[16px] font-semibold text-neutral-950">{moneyOrFree(tt, bundle.price_fen, currency)}</p>
          <p className="mt-1 text-[12px] text-neutral-500">
            <span className="line-through">{tt("单买合计 {price}", { price: formatBayMoney(totalFen, currency) })}</span>
            <span className="ml-2 text-neutral-800">{tt("省 {price}", { price: formatBayMoney(savedFen, currency) })}</span>
          </p>
          {ownedCount > 0 && !viewer.owned && !viewer.is_owner ? (
            <p className="mt-2 text-[12px] text-amber-800">{tt("你已拥有其中 {n} 门，套餐仍按套餐价收费", { n: ownedCount })}</p>
          ) : null}
        </div>
        <BuyButton
          itemKind="bundle"
          itemId={bundle.id}
          title={bundle.title}
          priceFen={bundle.price_fen}
          isOwner={viewer.is_owner}
          owned={viewer.owned}
          onReload={onReload}
        />
      </div>

      {viewer.owned && !viewer.is_owner ? <PurchasePanel purchase={viewer.purchase} onReload={onReload} /> : null}
      {viewer.is_owner && viewer.purchase ? <PurchasePanel purchase={viewer.purchase} onReload={onReload} /> : null}

      <section className="mt-5">
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {lessons.map((lesson) => {
            const thumb = safeHttpUrl(lesson.cover_url);
            const canGo = viewer.owned || ownedIds.has(lesson.id);
            return (
              <li key={lesson.id} className="flex items-center gap-3 px-3 py-2.5">
                {thumb ? (
                  <img src={thumb} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100" />
                )}
                <button type="button" onClick={() => openBay({ kind: "lesson", id: lesson.id })} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-medium text-neutral-900">{lesson.title}</span>
                  <span className="mt-0.5 block text-[11px] text-neutral-500">
                    {tt("{n} 节", { n: lesson.chapter_count })}
                    {" · "}
                    {moneyOrFree(tt, lesson.price_fen, currency)}
                  </span>
                </button>
                {canGo ? (
                  <button
                    type="button"
                    onClick={() => openBay({ kind: "lesson", id: lesson.id })}
                    className="shrink-0 rounded-lg border border-neutral-200 px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
                  >
                    {tt("去学习")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <Section title={tt("买家评价")}>
        <ItemReviews itemKind="bundle" itemId={bundle.id} />
      </Section>

      {viewer.is_owner ? null : (
        <div className="mt-5">
          <ReportBox onSubmit={(reason, detail) => reportBayLessonBundle(bundle.id, reason, detail)} />
        </div>
      )}
    </div>
  );
}
