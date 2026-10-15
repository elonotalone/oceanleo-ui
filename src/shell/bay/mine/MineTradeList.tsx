"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { PublishedCategoryTag, type PublishedCategory } from "./PublishedCategoryTag";

export type MineTradeRow = {
  id: string;
  title: string;
  subtitle?: string;
  category: PublishedCategory;
  onOpen: () => void;
  orderId?: string;
  favoriteId?: string;
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
}: {
  pane: string;
  rows: MineTradeRow[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  emptyText: string;
}) {
  const tt = useUI();
  const [confirming, setConfirming] = useState("");
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);

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
      <section data-bay-pane={pane} className="px-4 py-6 text-[13px] text-stone-500">
        {tt("正在加载…")}
      </section>
    );
  }
  if (error && rows.length === 0) {
    return (
      <section data-bay-pane={pane} className="px-4 py-12 text-center">
        <p className="text-[14px] font-medium text-stone-800">{tt(error)}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center justify-center rounded-full border border-neutral-900 bg-white px-4 py-2 text-[13px] font-medium text-neutral-900"
        >
          {tt("重试")}
        </button>
      </section>
    );
  }
  if (rows.length === 0) {
    return (
      <section data-bay-pane={pane}>
        <p data-bay-empty="category" className="px-4 py-12 text-center text-[13px] text-stone-500">
          {tt(emptyText)}
        </p>
      </section>
    );
  }
  return (
    <section data-bay-pane={pane} className="py-2">
      <ul>
        {rows.map((row) => (
          <li key={row.id} data-bay-fav-row={row.favoriteId} className="border-b border-stone-100">
            <div className="flex items-start">
              <button
                type="button"
                data-bay-mine-row={row.id}
                data-bay-order-row={row.orderId}
                onClick={row.onOpen}
                className="block min-w-0 flex-1 px-4 py-2.5 text-left hover:bg-stone-50"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-stone-800">{row.title}</span>
                    {row.subtitle ? <span className="mt-0.5 block truncate text-[12px] text-stone-500">{row.subtitle}</span> : null}
                  </span>
                  <PublishedCategoryTag category={row.category} />
                </span>
              </button>
              {row.onDelete && confirming !== row.id ? (
                <button
                  type="button"
                  data-bay-mine-delete={row.id}
                  onClick={() => {
                    setFailed(null);
                    setConfirming(row.id);
                  }}
                  className="shrink-0 px-3 py-3 text-[12px] font-medium text-rose-600 hover:text-rose-700"
                >
                  {tt("删除")}
                </button>
              ) : null}
            </div>
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
