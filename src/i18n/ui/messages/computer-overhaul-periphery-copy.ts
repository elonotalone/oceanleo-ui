// 2026-10-14 分身电脑页整改 · 服务器页外壳与对话卡周边（设置、Key、登录、安装、程序条）。本表只归一个工作单元；注册已由父 agent 在 shell-overhaul-copy.ts 完成。
// 约定同 acp-card-copy.ts：SOURCE 放全站词典里还没有的中文键；每个语种给全同名表，缺键 tsc 编不过。
import { assembleCopy } from "./shell-overhaul-copy-shared";

const SOURCE = {} as const;

export const COMPUTER_OVERHAUL_PERIPHERY_MESSAGES = assembleCopy(SOURCE, {
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
