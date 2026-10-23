// 「我的」页三块的纯规则（不带组件，测试直接加载）。
//
// 页面上看见三块：交易 / 我的主页 / 数据面板。「交易」里再用一个下拉选列表：
// 我发布的 / 我卖出的 / 我买到的 / 我的收藏。
// 地址里的 `?bay=mine:<tab>` 仍是六个值（BayMineTab 与 bay-links 不动）：
// published | sold | bought | favorites 都落在「交易」并选中对应列表，page / dashboard 原样。
import type { BayMineTab } from "../shell/bay-state";

export type MineBlock = "trade" | "page" | "dashboard";
export type MineList = "published" | "sold" | "bought" | "favorites";

export const MINE_BLOCKS: readonly MineBlock[] = ["trade", "page", "dashboard"];
export const MINE_LISTS: readonly MineList[] = ["published", "sold", "bought", "favorites"];
export const DEFAULT_MINE_LIST: MineList = "published";

const ALL_TABS: readonly BayMineTab[] = ["published", "sold", "bought", "favorites", "page", "dashboard"];

export function isMineList(value: unknown): value is MineList {
  return typeof value === "string" && (MINE_LISTS as readonly string[]).includes(value);
}

/** 认不出的地址值一律当「我发布的」。 */
export function normalizeMineTab(value: unknown): BayMineTab {
  return typeof value === "string" && (ALL_TABS as readonly string[]).includes(value) ? (value as BayMineTab) : "published";
}

/** 地址值落在哪一块：四个列表 → 交易，其余原样。 */
export function mineBlockOfTab(value: unknown): MineBlock {
  const tab = normalizeMineTab(value);
  if (tab === "page") return "page";
  if (tab === "dashboard") return "dashboard";
  return "trade";
}

/** 地址值对应的列表；主页 / 数据面板没有列表，用 `fallback`（最近一次看的那个）。 */
export function mineListOfTab(value: unknown, fallback: MineList = DEFAULT_MINE_LIST): MineList {
  const tab = normalizeMineTab(value);
  return isMineList(tab) ? tab : fallback;
}

/** 点某一块页签时要换到的地址值：交易 → 最近看的列表，其余块 → 同名。 */
export function mineTabOfBlock(block: MineBlock, list: MineList = DEFAULT_MINE_LIST): BayMineTab {
  if (block === "page") return "page";
  if (block === "dashboard") return "dashboard";
  return list;
}
