// 2026-10-05 work-chat 波 W08 的分表（消息外壳：入口、浮层、收件箱、设置）。只由 W08 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const IM_SHELL_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const IM_SHELL_MESSAGES = emptyCopy();
