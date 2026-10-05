// 2026-10-05 work-chat 波 W03 的分表（提醒设置、推送、桌面通知）。只由 W03 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const IM_NOTIFY_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const IM_NOTIFY_MESSAGES = emptyCopy();
