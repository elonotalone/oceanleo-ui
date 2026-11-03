import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";

const SOURCE = {
  k00: "正在压缩…",
  k01: "正在上传…",
  k02: "正在上传 {percent}%",
  k03: "等待电脑确认…",
  k04: "上传超时，请重试或移除文件。",
} as const;
type Messages = CopyMessagesOf<typeof SOURCE>;
const EN: Messages = {
  k00: "Compressing…",
  k01: "Uploading…",
  k02: "Uploading {percent}%",
  k03: "Waiting for computer confirmation…",
  k04: "Upload timed out. Retry or remove the file.",
};
const ZH_TW: Messages = {
  k00: "正在壓縮…",
  k01: "正在上傳…",
  k02: "正在上傳 {percent}%",
  k03: "等待電腦確認…",
  k04: "上傳逾時，請重試或移除檔案。",
};
export const UPLOAD_UI_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
