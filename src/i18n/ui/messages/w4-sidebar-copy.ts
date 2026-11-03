import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";
const SOURCE = {
  bay: "找素材、逛服务、发需求",
  loading: "正在打开素材…",
  wait: "请稍候。",
  failed: "无法打开这份素材",
  permissions: "这份素材的权限未能刷新，请重新打开后再操作。",
  read: "素材暂时无法读取，请重试。",
  access: "你没有查看这份素材的权限，请先登录或联系作者。",
  missing: "这份素材已下架或不存在。",
  network: "连接暂时不可用，请检查网络后重试。",
  edit: "这份素材暂时无法编辑，请重新打开后再试。",
} as const;
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  bay: "Find materials, browse services and post requests",
  loading: "Opening asset…", wait: "Please wait.", failed: "This asset could not be opened",
  permissions: "Asset permissions could not be refreshed. Please reopen it before continuing.",
  read: "This asset could not be read. Please retry.",
  access: "You do not have access to this asset. Please sign in or contact its author.",
  missing: "This asset has been removed or does not exist.",
  network: "The connection is unavailable. Check your network and retry.",
  edit: "This asset cannot be edited right now. Please reopen it and try again.",
};
const ZH_TW: Messages = {
  bay: "找素材、逛服務、發需求", loading: "正在開啟素材…", wait: "請稍候。", failed: "無法開啟這份素材",
  permissions: "這份素材的權限未能更新，請重新開啟後再操作。",
  read: "素材暫時無法讀取，請重試。",
  access: "你沒有檢視這份素材的權限，請先登入或聯絡作者。",
  missing: "這份素材已下架或不存在。",
  network: "連線暫時無法使用，請檢查網路後重試。",
  edit: "這份素材暫時無法編輯，請重新開啟後再試。",
};
export const W4_SIDEBAR_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
