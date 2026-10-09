"use client";

// 「我的收藏」：服务、卖家、需求三段。整行打开目标，右边取消收藏。
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  favoriteOpenTarget,
  favoriteSubtitle,
  favoriteTitle,
  listBayFavorites,
  removeBayFavorite,
  type BayFavorite,
  type BayFavoriteKind,
} from "../../../lib/bay/favorites";
import { categoryNameBySlug, useNeedCategories } from "../needs/need-categories";
import { openBay, type BayPaneProps } from "../shell/bay-state";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { errorText } from "../supply/use-bay-resource";

const ROW =
  "block w-full border-b border-black/5 px-3 py-2.5 text-left hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 dark:border-white/10 dark:hover:bg-white/5";

const QUIET_BTN =
  "shrink-0 rounded-lg px-3 py-1.5 text-[13px] text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 disabled:opacity-50";

const GROUPS: ReadonlyArray<{ kind: BayFavoriteKind; label: string }> = [
  { kind: "service", label: "素材与服务" },
  { kind: "profile", label: "卖家" },
  { kind: "demand", label: "需求" },
];

export function MyFavoritesPane(_props: BayPaneProps) {
  const tt = useUI();
  const categories = useNeedCategories();
  const [tick, setTick] = useState(0);
  const [items, setItems] = useState<BayFavorite[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    void listBayFavorites().then(
      (data) => {
        if (!alive) return;
        setItems(data?.items || []);
        setLoading(false);
      },
      () => {
        if (!alive) return;
        setItems(null);
        setError(true);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [tick]);

  const remove = async (item: BayFavorite) => {
    if (removing) return;
    setRemoving(item.id);
    setRowError(null);
    try {
      await removeBayFavorite(item.target_kind, item.target_ref);
      setItems((list) => (list || []).filter((row) => row.id !== item.id));
    } catch (reason) {
      setRowError({ id: item.id, text: errorText(reason) || tt("收藏没成功，请稍后再试。") });
    } finally {
      setRemoving(null);
    }
  };

  if (loading && items === null) {
    return (
      <section data-bay-pane="mine-favorites">
        <PaneLoading />
      </section>
    );
  }
  if (error) {
    return (
      <section data-bay-pane="mine-favorites">
        <PaneMessage text={tt("收藏列表没读出来，请稍后再试。")} onRetry={() => setTick((value) => value + 1)} />
      </section>
    );
  }
  const list = items || [];
  if (list.length === 0) {
    return (
      <section data-bay-pane="mine-favorites">
        <div data-bay-empty="favorites" className="px-4 py-12 text-center">
          <p className="text-[14px] font-medium text-stone-800">{tt("你还没有收藏。")}</p>
          <p className="mt-2 text-[12px] text-stone-500">{tt("看到喜欢的服务、卖家或需求，点「收藏」，就会出现在这里。")}</p>
        </div>
      </section>
    );
  }

  return (
    <section data-bay-pane="mine-favorites" className="py-2">
      {GROUPS.map((group) => {
        const rows = list.filter((item) => item.target_kind === group.kind);
        if (rows.length === 0) return null;
        return (
          <div key={group.kind} data-bay-fav-group={group.kind}>
            <h3 className="px-3 pt-3 pb-1 text-[13px] font-semibold text-stone-800">{tt(group.label)}</h3>
            <ul>
              {rows.map((item) => {
                const target = favoriteOpenTarget(item);
                // 需求的副标题是类目：显示类目名，不显示类目代号。
                const raw = favoriteSubtitle(item);
                const subtitle = item.target_kind === "demand" ? categoryNameBySlug(tt, raw, categories.response) : raw;
                return (
                  <li key={item.id} data-bay-fav-row={item.id}>
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        className={`${ROW} min-w-0 flex-1`}
                        onClick={() => {
                          if (target) openBay(target);
                        }}
                      >
                        <span className="block truncate text-[14px] font-semibold text-stone-800">{favoriteTitle(item)}</span>
                        {subtitle ? <span className="mt-1 block truncate text-[11px] text-stone-500">{subtitle}</span> : null}
                      </button>
                      <button
                        type="button"
                        data-bay-fav-remove
                        disabled={removing === item.id}
                        className={QUIET_BTN}
                        onClick={() => void remove(item)}
                      >
                        {tt("取消收藏")}
                      </button>
                    </div>
                    {rowError?.id === item.id ? <p className="px-3 pb-2 text-[12px] text-rose-600">{tt(rowError.text)}</p> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
