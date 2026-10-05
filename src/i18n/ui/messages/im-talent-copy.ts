// 2026-10-05 work-chat 波 W07 的分表（交易会话、举报）。只由 W07 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const IM_TALENT_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const IM_TALENT_MESSAGES = emptyCopy();
