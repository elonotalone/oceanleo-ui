import { LOCALES, type Locale } from "../../config";
import { copyDictionaryFrom, type CopyMessagesOf } from "./shell-overhaul-copy-shared";
const SOURCE = { copy: "复制工具内容", copied: "工具内容已复制" } as const;
const EN: CopyMessagesOf<typeof SOURCE> = { copy: "Copy tool content", copied: "Tool content copied" };
const ZH_TW: CopyMessagesOf<typeof SOURCE> = { copy: "複製工具內容", copied: "工具內容已複製" };
export const TOOLUI_MESSAGES = Object.fromEntries(LOCALES.map(locale => [locale,
  copyDictionaryFrom(SOURCE, locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN),
])) as Record<Locale, Record<string, string>>;
export function tooluiText(locale: string, copied = false): string {
  const table = locale === "zh" ? SOURCE : locale === "zh-TW" ? ZH_TW : EN;
  return table[copied ? "copied" : "copy"];
}
