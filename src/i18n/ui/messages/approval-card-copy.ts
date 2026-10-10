// W7 对话里的外发确认卡 的 17 语文案（2026-10-10 波）。
// 写法照 ./agent-progress-copy.ts：sourceKeys（中文原文）+ translations（其余 16 语）。
// 已由父 agent 在 ./shell-overhaul-copy.ts 的 PARTS 里登记，本文件的 owner 只需填内容。
import { LOCALES, type Locale } from "../../config";

export const APPROVAL_CARD_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(LOCALES.map((locale) => [locale, {}])) as Record<
    Locale,
    Record<string, string>
  >;
