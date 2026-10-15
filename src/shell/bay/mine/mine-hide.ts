// 卖出的 / 买到的两张清单里「删除」的公共部分：只对已了结的交易给出，动作是
// 「从我的列表移除」，不碰交易本身。
import type { UITranslate } from "../../../i18n/ui/useUI";
import { hideBayMineItem, type BayMineHiddenKind } from "../../../lib/bay/mine-hidden";
import type { MineTradeRow } from "./MineTradeList";

export function hideRowProps(
  tt: UITranslate,
  reload: () => void,
  settled: boolean,
  kind: BayMineHiddenKind,
  ref: string,
): Pick<MineTradeRow, "onDelete" | "deleteHint"> {
  if (!settled || !ref) return {};
  return {
    deleteHint: tt("从你的列表里移除这条记录吗？对方的记录和账务都不受影响。"),
    onDelete: async () => {
      await hideBayMineItem(kind, ref);
      reload();
    },
  };
}
