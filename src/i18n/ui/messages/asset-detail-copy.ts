// W2-L5B shared asset information. Parent registers ASSET_DETAIL_MESSAGES.
import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  author: "作者 / 上传者",
  created: "创建时间",
  license: "授权说明",
  price: "价格",
  unknownPrice: "价格待确认",
  commercial: "允许商业使用",
  noncommercial: "仅限非商业使用",
  modify: "允许修改",
  noModify: "不允许修改",
};
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  author: "Author / uploader",
  created: "Created",
  license: "License",
  price: "Price",
  unknownPrice: "Price to be confirmed",
  commercial: "Commercial use allowed",
  noncommercial: "Noncommercial use only",
  modify: "Modifications allowed",
  noModify: "Modifications not allowed",
};
const ZH_TW: Messages = {
  author: "作者 / 上傳者",
  created: "建立時間",
  license: "授權說明",
  price: "價格",
  unknownPrice: "價格待確認",
  commercial: "允許商業使用",
  noncommercial: "僅限非商業使用",
  modify: "允許修改",
  noModify: "不允許修改",
};
export const ASSET_DETAIL_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
