// 2026-10-23 LeoChat 通话 v2 词典聚合器：五个分表按语种合并成一张，只在 work-chat-copy.ts 注册这一张。
// 分表各归一个 owner：call-ui（W07）、call-services（W06）、call-chat（W08）、call-control（W09）、call-diagnostics（W14）。
// 本文件只由 W07 改。

import { LOCALES, type Locale } from "../../config";
import { CALL_UI_MESSAGES } from "./call-ui-copy";
import { CALL_SERVICES_MESSAGES } from "./call-services-copy";
import { CALL_CHAT_MESSAGES } from "./call-chat-copy";
import { CALL_CONTROL_MESSAGES } from "./call-control-copy";
import { CALL_DIAGNOSTICS_MESSAGES } from "./call-diagnostics-copy";

const PARTS = [
  CALL_UI_MESSAGES,
  CALL_SERVICES_MESSAGES,
  CALL_CHAT_MESSAGES,
  CALL_CONTROL_MESSAGES,
  CALL_DIAGNOSTICS_MESSAGES,
];

export const CALL_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      Object.assign({}, ...PARTS.map((part) => part[locale] ?? {})),
    ]),
  ) as Record<Locale, Record<string, string>>;
