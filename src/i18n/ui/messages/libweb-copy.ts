// W1-LIBWEB. Register LIBWEB_MESSAGES in the shared UI copy registry.
import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  k00: "当前预览文件是封面图，不能据此判断网站源码是否存在。",
  k01: "可用时，详情工具条上的「下载」保存完整网站源码 ZIP，「编辑」打开网站编辑器。",
  k02: "没有权限查看这个网站，请确认登录账号。",
  k03: "网站源码缺失，无法生成预览或下载源码。",
  k04: "网站预览还没生成，请稍后重试。",
  k05: "无法打开网站预览，请重试。",
  k06: "网站源码下载失败，请重试。",
  k07: "没有权限下载这个网站的源码。",
} as const;

const EN: CopyMessagesOf<typeof SOURCE> = {
  k00: "The current preview is a cover image. It does not indicate whether website source is available.",
  k01: "When available, Download saves the complete website source ZIP and Edit opens the website editor.",
  k02: "You do not have permission to view this website. Check the signed-in account.",
  k03: "The website source is missing. Preview and source download are unavailable.",
  k04: "The website preview is not ready yet. Try again later.",
  k05: "Unable to open the website preview. Try again.",
  k06: "Unable to download the website source. Try again.",
  k07: "You do not have permission to download this website's source.",
};

const ZH_TW: CopyMessagesOf<typeof SOURCE> = {
  k00: "目前預覽檔案是封面圖，不能據此判斷網站原始碼是否存在。",
  k01: "可用時，詳情工具列上的「下載」儲存完整網站原始碼 ZIP，「編輯」開啟網站編輯器。",
  k02: "沒有權限檢視這個網站，請確認登入帳號。",
  k03: "網站原始碼缺失，無法產生預覽或下載原始碼。",
  k04: "網站預覽尚未產生，請稍後重試。",
  k05: "無法開啟網站預覽，請重試。",
  k06: "網站原始碼下載失敗，請重試。",
  k07: "沒有權限下載這個網站的原始碼。",
};

export const LIBWEB_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
