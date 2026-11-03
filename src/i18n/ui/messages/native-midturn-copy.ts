import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";
const SOURCE = {
  restore: "恢复草稿", waiting: "等待处理", delivered: "已送入当前执行", unsent: "未发送", withdrawn: "已撤回",
  uncertain: "发送结果尚未确认，重试会核对原消息，避免重复执行。",
  restored: "已撤回的消息已放回输入框。",
};
const EN: CopyMessagesOf<typeof SOURCE> = {
  restore: "Restore draft", waiting: "Waiting to be processed", delivered: "Delivered to the current run", unsent: "Not sent", withdrawn: "Withdrawn",
  uncertain: "Delivery is unconfirmed. Retry checks the original message to avoid running it twice.",
  restored: "Withdrawn messages were restored to the composer.",
};
const ZH_TW: CopyMessagesOf<typeof SOURCE> = {
  restore: "恢復草稿", waiting: "等待處理", delivered: "已送入目前執行", unsent: "未傳送", withdrawn: "已撤回",
  uncertain: "傳送結果尚未確認，重試會核對原訊息，避免重複執行。",
  restored: "已撤回的訊息已放回輸入框。",
};
export const NATIVE_MIDTURN_MESSAGES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN)]),
) as Record<Locale, Record<string, string>>;
