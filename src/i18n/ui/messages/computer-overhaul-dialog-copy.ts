// 2026-10-14 分身电脑页整改 · AI 对话卡主链路（会话、历史、流式、模型菜单、Markdown）。本表只归一个工作单元；注册已由父 agent 在 shell-overhaul-copy.ts 完成。
// 约定同 acp-card-copy.ts：SOURCE 放全站词典里还没有的中文键；每个语种给全同名表，缺键 tsc 编不过。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {} as const;

export const COMPUTER_OVERHAUL_DIALOG_MESSAGES = assembleCopy(SOURCE, {
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
