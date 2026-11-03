import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  video: "视频素材",
  image: "图片素材",
  website: "网站素材",
  essay: "文章素材",
  sections: "首页素材分类",
  emptyVideo: "暂无可用视频素材",
  empty: "暂无可用素材",
  loading: "正在加载首页素材…",
  unavailable: "首页素材暂时无法加载，请稍后重试。",
  open: "打开素材：{title}",
  prompts: "我的 prompt",
  edit: "编辑 prompt：{title}",
} as const;
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  video: "Video", image: "Image", website: "Website", essay: "Essay",
  sections: "Home asset categories", emptyVideo: "No video assets available yet",
  empty: "No assets available yet", loading: "Loading home assets…",
  unavailable: "Home assets could not be loaded. Please try again later.",
  open: "Open asset: {title}", prompts: "My prompts", edit: "Edit prompt: {title}",
};
const ZH_TW: Messages = {
  video: "影片素材", image: "圖片素材", website: "網站素材", essay: "文章素材",
  sections: "首頁素材分類", emptyVideo: "暫無可用影片素材", empty: "暫無可用素材",
  loading: "正在載入首頁素材…", unavailable: "首頁素材暫時無法載入，請稍後重試。",
  open: "開啟素材：{title}", prompts: "我的 prompt", edit: "編輯 prompt：{title}",
};

export const HOME_ASSET_CARDS_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
