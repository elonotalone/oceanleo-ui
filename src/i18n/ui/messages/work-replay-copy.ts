// 2026-10-05 work-chat 波 W05 的分表（工作回放）。只由 W05 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const WORK_REPLAY_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const WORK_REPLAY_MESSAGES = emptyCopy();
