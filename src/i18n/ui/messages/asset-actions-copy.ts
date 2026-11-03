import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  get: "获取", buy: "购买", free: "免费", priceUnavailable: "价格暂不可用",
  refreshPrice: "刷新价格", refreshPurchase: "刷新购买状态", refreshAsset: "刷新素材状态",
  pending: "等待付款确认", refunded: "已退款", add: "加入我的库", use: "用于任务",
  download: "下载", edit: "编辑", retry: "重试", actions: "素材操作",
  author: "作者：{name}", license: "授权：{license}", licenseDetails: "查看授权说明",
  commercial: "允许商用", noncommercial: "不允许商用", modify: "允许修改", noModify: "不允许修改", attribution: "署名：{name}",
  claimFailed: "未能加入我的库，请重试。", checkoutFailed: "未能打开购买页面，请重试。", failed: "操作未完成，请重试。",
  editUnavailable: "这份内容暂时无法编辑，请刷新后重试。", previewUnavailable: "暂时无法预览，请刷新后重试。",
  insertUnavailable: "暂时无法插入，请刷新后重试。", replaceUnavailable: "暂时无法替换，请刷新后重试。",
  downloadUnavailable: "暂时无法下载，请刷新后重试。", favoriteUnavailable: "暂时无法收藏，请刷新后重试。",
  exportUnavailable: "暂时无法导出，请刷新后重试。", preparingDownload: "正在准备下载…",
  versionRetry: "没取到这份素材的当前版本，重试一次即可。",
} as const;
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  get: "Get", buy: "Buy", free: "Free", priceUnavailable: "Price unavailable",
  refreshPrice: "Refresh price", refreshPurchase: "Refresh purchase status", refreshAsset: "Refresh asset",
  pending: "Awaiting payment confirmation", refunded: "Refunded", add: "Add to My Library", use: "Use in task",
  download: "Download", edit: "Edit", retry: "Retry", actions: "Asset actions",
  author: "Author: {name}", license: "License: {license}", licenseDetails: "View license details",
  commercial: "Commercial use allowed", noncommercial: "Commercial use not allowed", modify: "Modification allowed", noModify: "Modification not allowed", attribution: "Attribution: {name}",
  claimFailed: "Could not add to My Library. Please retry.", checkoutFailed: "Could not open checkout. Please retry.", failed: "Could not complete this action. Please retry.",
  editUnavailable: "Editing is unavailable. Refresh and try again.", previewUnavailable: "Preview unavailable. Refresh and try again.",
  insertUnavailable: "Cannot insert this content. Refresh and try again.", replaceUnavailable: "Cannot replace this content. Refresh and try again.",
  downloadUnavailable: "Download unavailable. Refresh and try again.", favoriteUnavailable: "Cannot save this favorite. Refresh and try again.",
  exportUnavailable: "Export unavailable. Refresh and try again.", preparingDownload: "Preparing download…",
  versionRetry: "Could not load the current version. Please retry.",
};
const ZH_TW: Messages = {
  get: "取得", buy: "購買", free: "免費", priceUnavailable: "價格暫不可用",
  refreshPrice: "重新整理價格", refreshPurchase: "重新整理購買狀態", refreshAsset: "重新整理素材狀態",
  pending: "等待付款確認", refunded: "已退款", add: "加入我的庫", use: "用於任務",
  download: "下載", edit: "編輯", retry: "重試", actions: "素材操作",
  author: "作者：{name}", license: "授權：{license}", licenseDetails: "查看授權說明",
  commercial: "允許商用", noncommercial: "不允許商用", modify: "允許修改", noModify: "不允許修改", attribution: "署名：{name}",
  claimFailed: "未能加入我的庫，請重試。", checkoutFailed: "未能開啟購買頁面，請重試。", failed: "操作未完成，請重試。",
  editUnavailable: "這份內容暫時無法編輯，請重新整理後重試。", previewUnavailable: "暫時無法預覽，請重新整理後重試。",
  insertUnavailable: "暫時無法插入，請重新整理後重試。", replaceUnavailable: "暫時無法替換，請重新整理後重試。",
  downloadUnavailable: "暫時無法下載，請重新整理後重試。", favoriteUnavailable: "暫時無法收藏，請重新整理後重試。",
  exportUnavailable: "暫時無法匯出，請重新整理後重試。", preparingDownload: "正在準備下載…",
  versionRetry: "未取得這份素材的目前版本，請重試。",
};

export const ASSET_ACTIONS_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
