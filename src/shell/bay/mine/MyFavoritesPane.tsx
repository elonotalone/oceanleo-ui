"use client";

// 「我的收藏」：一张列表。服务按交付种类归类，卖家和需求算其他；行右边标明类别。
import { useUI } from "../../../i18n/ui/useUI";
import {
  favoriteOpenTarget,
  favoriteSubtitle,
  favoriteTitle,
  listBayFavorites,
  removeBayFavorite,
} from "../../../lib/bay/favorites";
import { categoryNameBySlug, useNeedCategories } from "../needs/need-categories";
import { openBay, useBaySignedIn } from "../shell/bay-state";
import { useMineBundle, type MinePaneProps } from "./mine-bundle";
import { favoriteCategory, mineEmptyText, rowMatchesCategory } from "./mine-category";
import { MineTradeList, type MineTradeRow } from "./MineTradeList";

export function MyFavoritesPane({ category = "all" }: MinePaneProps) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const categories = useNeedCategories();
  const bundle = useMineBundle(
    signedIn,
    () => listBayFavorites().then((data) => data?.items || []),
    tt("收藏列表没读出来，请稍后再试。"),
  );
  const rows: MineTradeRow[] = [];
  for (const item of bundle.data || []) {
    const kind = favoriteCategory(item);
    if (!rowMatchesCategory(category, kind)) continue;
    const target = favoriteOpenTarget(item);
    const raw = favoriteSubtitle(item);
    const subtitle = item.target_kind === "demand" ? categoryNameBySlug(tt, raw, categories.response) : raw;
    rows.push({
      id: item.id,
      title: favoriteTitle(item) || item.target_ref,
      subtitle,
      category: kind,
      favoriteId: item.id,
      deleteHint: tt("确定取消这条收藏吗？"),
      onDelete: async () => {
        await removeBayFavorite(item.target_kind, item.target_ref);
        bundle.reload();
      },
      onOpen: () => {
        if (target) openBay(target);
      },
    });
  }
  return (
    <MineTradeList
      pane="mine-favorites"
      rows={rows}
      loading={bundle.loading}
      error={bundle.error}
      onRetry={bundle.reload}
      emptyText={mineEmptyText("favorites")}
    />
  );
}
