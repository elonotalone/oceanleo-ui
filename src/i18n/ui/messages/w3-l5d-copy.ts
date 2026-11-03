import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom } from "./shell-overhaul-copy-shared";

// Website facet copy was previously unregistered in the old material shelf.
// Keep machine facet keys in the catalog; only these visible labels translate.
// Industry / sub-industry names are not repeated here: the base dictionary translates them in all 17 locales
// (2026-11-03 — repeating them put English over fr/de/ja/... and changed 85 English labels site-wide).
const ROWS = [
  ["正在打开这份素材…", "Opening asset…", "正在開啟這份素材…"],
  ["子类", "Subcategory", "子類"], ["全部子类", "All subcategories", "全部子類"],
  ["全部行业", "All industries", "全部行業"], ["全部页数", "All page counts", "全部頁數"],
  ["全部外观", "All appearances", "全部外觀"], ["换一个版本", "Choose a version", "換一個版本"],
  ["看第 {n} 个版本，共 {total} 个", "Version {n} of {total}", "看第 {n} 個版本，共 {total} 個"],
  ["3页", "3 pages", "3頁"], ["4页", "4 pages", "4頁"], ["5页", "5 pages", "5頁"], ["6页", "6 pages", "6頁"],
  ["素白", "Paper", "素白"], ["杂志", "Editorial", "雜誌"], ["便当", "Bento", "便當"],
  ["粗野", "Brutalist", "粗野"], ["全屏叙事", "Fullscreen", "全螢幕敘事"],
  ["暖砂", "Warm sand", "暖砂"], ["深蓝", "Navy", "深藍"], ["玻璃", "Glass", "玻璃"],
] as const;
const SOURCE = Object.fromEntries(ROWS.map(([source]) => [source, source]));
const EN = Object.fromEntries(ROWS.map(([source, en]) => [source, en]));
const ZH_TW = Object.fromEntries(ROWS.map(([source, , tw]) => [source, tw]));
export const W3_L5D_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
