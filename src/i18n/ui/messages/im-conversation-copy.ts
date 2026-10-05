// 2026-10-05 work-chat 波 W09 的分表（会话、输入框、线程、搜索）。只由 W09 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const IM_CONVERSATION_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const IM_CONVERSATION_MESSAGES = emptyCopy();
