// 信息流里一条内容的两种外形，四种卡（需求、求助、服务、答疑）共用：
//   row  —— 浮窗和窄列里的一整行，字号与聊天列表的一行相同；
//   card —— /bay 页网格里的一张卡，外框与应用市场的卡片相同。
// 这里只有类名，没有文案，也不 import 任何模块（needs 与 supply 都从这里取，不成环）。

export type BayFeedCardVariant = "row" | "card";

export type BayFeedKindTone = "demand" | "help" | "service" | "consult";

/** 一整行：自带内边距与下边线；选中底色由外层给。 */
export const FEED_ROW_CLASS =
  "group block w-full border-b border-black/5 px-3 py-2.5 text-left transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-black/[0.03] focus-visible:bg-black/[0.03] focus-visible:outline-none dark:border-white/10 dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.04]";

/** 一张卡：圆角描边白底，悬停抬起；撑满所在网格格子的高度。 */
export const FEED_TILE_CLASS =
  "group flex h-full w-full flex-col rounded-2xl border border-stone-200/80 bg-white p-4 text-left shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md focus-visible:border-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300";

export function feedCardClass(variant: BayFeedCardVariant | undefined): string {
  return variant === "card" ? FEED_TILE_CLASS : FEED_ROW_CLASS;
}

const KIND_TONE: Readonly<Record<BayFeedKindTone, string>> = {
  demand: "bg-stone-100 text-stone-600",
  help: "bg-amber-50 text-amber-700",
  service: "bg-sky-50 text-sky-700",
  consult: "bg-violet-50 text-violet-700",
};

/** 种类小标（需求 / 求助 / 服务 / 答疑）：四种卡都带，混排时一眼分得清。 */
export function feedKindBadgeClass(tone: BayFeedKindTone): string {
  return `shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${KIND_TONE[tone]}`;
}

export const FEED_ROW_TITLE_CLASS = "min-w-0 truncate text-[13px] font-semibold tracking-tight text-stone-800";
export const FEED_ROW_SUMMARY_CLASS = "mt-1 line-clamp-2 break-words text-[12px] leading-5 text-stone-500";
export const FEED_ROW_PRICE_CLASS = "shrink-0 text-[13px] font-semibold text-stone-800";
export const FEED_ROW_META_CLASS = "mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-stone-500";
export const FEED_ROW_FOOTER_CLASS = "mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-stone-400";

export const FEED_TILE_TITLE_CLASS = "line-clamp-2 break-words text-[15px] font-semibold leading-snug text-stone-900";
export const FEED_TILE_SUMMARY_CLASS = "mt-1.5 line-clamp-2 break-words text-[13px] leading-relaxed text-stone-500";
export const FEED_TILE_PRICE_CLASS = "min-w-0 truncate text-[14px] font-semibold text-stone-900";
/** 卡片下半：贴底的一排小标签。 */
export const FEED_TILE_META_CLASS = "mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-[11px] text-stone-500";
export const FEED_TILE_PILL_CLASS = "rounded-full bg-stone-100 px-2 py-1 text-[11px] text-stone-500";
/** 卡片最底下一行：谁发的、什么时候。 */
export const FEED_TILE_FOOTER_CLASS = "mt-3 flex items-center gap-2 border-t border-stone-100 pt-3 text-[12px] text-stone-500";
