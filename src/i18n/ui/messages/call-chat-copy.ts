// 2026-10-23 LeoChat 通话 v2 · W08 的分表：聊天里的通话：入口、来电、卡片、列表标记（`call/chat/`、`call/incoming/`）。
// 桩由 W07 在首个提交里建；之后本表只归 W08 改。注册在 call-copy.ts（W07 聚合）→ work-chat-copy.ts。
// 写法同 leochat-page-copy.ts：SOURCE 里「名字 → 简体中文原文」，各语种给同名条目；键就是简体中文原文（`tt("中文原文", { n })`）。
// 17 种语言写全；缺一条 key 或少一个语种，assembleCopy 的入参类型会让 tsc 编不过。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {} as const;

export const CALL_CHAT_MESSAGES = assembleCopy(SOURCE, {
  en: {},
  de: {},
  es: {},
  "es-419": {},
  fr: {},
  it: {},
  "pt-BR": {},
  "pt-PT": {},
  vi: {},
  tr: {},
  "zh-TW": {},
  ja: {},
  ko: {},
  ar: {},
  th: {},
  hi: {},
});
