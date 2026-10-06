// 2026-10-06 work-chat 第二轮 F05（PDF 按批注多人同改）的分表。只由该 owner 改；注册在 work-chat-copy.ts（父改）。
// 写法同 collab-visual-copy.ts：SOURCE 里「名字 → 简体中文原文」，各语种给同名条目；键就是简体中文原文（`tt("中文原文", { n })`）。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {} as const;

export const COLLAB_PDF_MESSAGES = assembleCopy(SOURCE, {
  de: {},
  en: {},
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
