// 「我的」→ 卖出的 / 买到的：把一条已了结的交易从自己的列表里移除。
// 订单、课程单、作品单、报价是交易记录，不会被真删；服务端只记「本人不想再看到它」，
// 对方的视图和账务都不动。读不到时当作没有隐藏，列表照常显示。

import { bayGet, bayPost } from "./http";

export type BayMineHiddenKind = "order" | "lesson-order" | "app-order" | "app-sub" | "proposal";

export async function listBayMineHidden(): Promise<Set<string>> {
  try {
    const body = await bayGet<{ items?: Array<{ item_kind?: string; item_ref?: string }> }>("/v1/bay/mine/hidden");
    const keys = new Set<string>();
    for (const row of body?.items || []) {
      if (row?.item_kind && row?.item_ref) keys.add(hiddenKey(row.item_kind, row.item_ref));
    }
    return keys;
  } catch {
    return new Set();
  }
}

export function hideBayMineItem(kind: BayMineHiddenKind, ref: string): Promise<{ ok: boolean }> {
  return bayPost<{ ok: boolean }>("/v1/bay/mine/hidden", { item_kind: kind, item_ref: ref });
}

export function hiddenKey(kind: string, ref: string): string {
  return `${kind}:${ref}`;
}
