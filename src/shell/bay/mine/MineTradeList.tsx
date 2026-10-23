"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { CollectionView } from "../../collection-chrome";
import { MineStatement } from "./MineStatement";
import { filterMineTradeRows, mineCoverUrl } from "./mine-trade-model";
import { PUBLISHED_CATEGORY_LABEL, PublishedCategoryTag, type PublishedCategory } from "./PublishedCategoryTag";

export type MineTradeRow = {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string | null;
  searchText?: string;
  category: PublishedCategory;
  onOpen: () => void;
  orderId?: string;
  favoriteId?: string;
  /** 付款金额（已排好版的文字）；给了就在行右侧、类别标签左边显示。「我买到的」用。 */
  amount?: string;
  /** 这一行对应的订单（合同）号；给了就出现「查看对账单」，点开在这一行下面展开对账单。 */
  statementContractId?: string;
  /** 给了就在行右侧显示「删除」；返回的 Promise 失败时，错误文案显示在这一行下面。 */
  onDelete?: () => Promise<void>;
  /** 点「删除」后的确认文案；不给就用通用的。 */
  deleteHint?: string;
};

export function MineTradeList({
  pane,
  rows,
  loading,
  error,
  onRetry,
  emptyText,
  query = "",
  display = "grid",
}: {
  pane: string;
  rows: MineTradeRow[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  emptyText: string;
  query?: string;
  display?: CollectionView;
}) {
  const tt = useUI();
  const [confirming, setConfirming] = useState("");
  const [busy, setBusy] = useState("");
  const [statementOpen, setStatementOpen] = useState("");
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const visibleRows = filterMineTradeRows(rows, query, (category) => tt(PUBLISHED_CATEGORY_LABEL[category]));
  const grid = display === "grid";

  async function remove(row: MineTradeRow) {
    if (!row.onDelete || busy) return;
    setBusy(row.id);
    setFailed(null);
    try {
      await row.onDelete();
      setConfirming("");
    } catch (reason) {
      const message = reason instanceof Error && reason.message ? reason.message : tt("删除失败，请稍后再试。");
      setFailed({ id: row.id, message });
    } finally {
      setBusy("");
    }
  }

  if (loading && rows.length === 0 && !error) {
    return (
      <section data-bay-pane={pane} className="rounded-xl border border-neutral-200 bg-white px-4 py-6 text-[13px] text-stone-500" role="status">
        {tt("正在加载…")}
      </section>
    );
  }
  if (error && rows.length === 0) {
    return (
      <section data-bay-pane={pane} className="rounded-xl border border-neutral-200 bg-white px-4 py-12 text-center">
        <p className="text-[14px] font-medium text-stone-800">{tt(error)}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-900"
        >
          {tt("重试")}
        </button>
      </section>
    );
  }
  if (visibleRows.length === 0) {
    return (
      <section data-bay-pane={pane} className="rounded-xl border border-neutral-200 bg-white">
        <p data-bay-empty={query.trim() ? "search" : "category"} className="px-4 py-12 text-center text-[13px] text-stone-500">
          {tt(query.trim() ? "没有找到匹配结果" : emptyText)}
        </p>
      </section>
    );
  }
  return (
    <section data-bay-pane={pane} data-bay-mine-view={display}>
      {error ? <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{tt(error)}</p> : null}
      <ul
        className={grid ? "grid gap-4" : "flex flex-col gap-2.5"}
        style={grid ? { gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,220px),1fr))" } : undefined}
      >
        {visibleRows.map((row) => (
          <li key={row.id} data-bay-fav-row={row.favoriteId} className="min-w-0 rounded-xl border border-neutral-200 bg-white">
            <div className={grid ? "flex flex-col" : "flex flex-wrap items-center"}>
              <button
                type="button"
                data-bay-mine-row={row.id}
                data-bay-order-row={row.orderId}
                onClick={row.onOpen}
                className={grid ? "block min-w-0 flex-1 overflow-hidden rounded-t-xl text-left hover:bg-neutral-50" : "flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left hover:bg-neutral-50"}
              >
                <MineCover row={row} grid={grid} />
                <span className={grid ? "flex min-w-0 flex-col gap-3 p-4" : "flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3"}>
                  <span className="block min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-stone-800">{row.title}</span>
                    {row.subtitle ? <span className="mt-0.5 block truncate text-[12px] text-stone-500">{row.subtitle}</span> : null}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {row.amount ? (
                      <span data-bay-mine-amount={row.id} className="text-[14px] font-semibold tabular-nums text-stone-900">
                        {row.amount}
                      </span>
                    ) : null}
                    <PublishedCategoryTag category={row.category} />
                  </span>
                </span>
              </button>
              {row.statementContractId || row.onDelete ? <div data-bay-mine-actions="" className={grid ? "flex flex-wrap items-center justify-end gap-1 border-t border-neutral-100 px-2 py-1" : "flex flex-wrap items-center justify-end gap-1 px-2"}>
              {row.statementContractId ? (
                <button
                  type="button"
                  data-bay-mine-statement={row.id}
                  aria-expanded={statementOpen === row.id}
                  onClick={() => setStatementOpen(statementOpen === row.id ? "" : row.id)}
                  className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-medium text-stone-700 hover:bg-neutral-50 hover:text-stone-900"
                >
                  {tt("查看对账单")}
                </button>
              ) : null}
              {row.onDelete && confirming !== row.id ? (
                <button
                  type="button"
                  data-bay-mine-delete={row.id}
                  onClick={() => {
                    setFailed(null);
                    setConfirming(row.id);
                  }}
                  className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  {tt("删除")}
                </button>
              ) : null}
              </div> : null}
            </div>
            {row.statementContractId && statementOpen === row.id ? (
              <div data-bay-mine-statement-panel={row.id} className="border-t border-stone-100 bg-stone-50 px-4 py-3">
                <MineStatement contractId={row.statementContractId} onClose={() => setStatementOpen("")} />
              </div>
            ) : null}
            {row.onDelete && confirming === row.id ? (
              <div data-bay-mine-confirm={row.id} className="flex flex-wrap items-center gap-3 bg-rose-50 px-4 py-2">
                <p className="min-w-0 flex-1 text-[12px] text-rose-700">{row.deleteHint || tt("确定删除吗？删除后不能恢复。")}</p>
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => setConfirming("")}
                  className="text-[12px] font-medium text-stone-600"
                >
                  {tt("取消")}
                </button>
                <button
                  type="button"
                  data-bay-mine-delete-confirm={row.id}
                  disabled={busy === row.id}
                  onClick={() => void remove(row)}
                  className="rounded-full bg-rose-600 px-3 py-1 text-[12px] font-medium text-white disabled:opacity-60"
                >
                  {busy === row.id ? tt("正在删除…") : tt("确认删除")}
                </button>
              </div>
            ) : null}
            {failed && failed.id === row.id ? (
              <p role="alert" data-bay-mine-delete-error={row.id} className="bg-rose-50 px-4 pb-2 text-[12px] text-rose-700">
                {tt(failed.message)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MineCover({ row, grid }: { row: MineTradeRow; grid: boolean }) {
  const tt = useUI();
  const cover = mineCoverUrl({ cover_url: row.coverUrl });
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const paths: Record<PublishedCategory, string> = {
    digital: "M7 3h7l4 4v14H6V3h1M14 3v5h5M9 13h6M9 17h6",
    service: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 7h18v14H3V7M3 12h18M10 11v3h4v-3",
    app: "M3 4h18v16H3V4M3 9h18M7 6h.01M10 6h.01M9 12l-3 3 3 3M15 12l3 3-3 3",
    lesson: "M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1M12 5v15",
    other: "M3 3h7v7H3V3M14 3h7v7h-7V3M3 14h7v7H3v-7M14 14h7v7h-7v-7",
  };
  return (
    <span
      data-bay-mine-cover={row.id}
      className={grid ? "relative flex w-full items-center justify-center overflow-hidden rounded-t-xl bg-neutral-100 text-neutral-400" : "relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-400"}
      style={grid ? { aspectRatio: "4 / 3" } : undefined}
    >
      <svg width={grid ? 40 : 26} height={grid ? 40 : 26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={tt(PUBLISHED_CATEGORY_LABEL[row.category])}>
        <path d={paths[row.category]} />
      </svg>
      {cover && failedUrl !== cover ? <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailedUrl(cover)} /> : null}
    </span>
  );
}
