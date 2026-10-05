// 2026-10-05 work-chat 波 W06 的分表（leo 在会话里）。只由 W06 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const IM_LEO_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const IM_LEO_MESSAGES = emptyCopy();
