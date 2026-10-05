// 2026-10-05 work-chat 波 W10 的分表（联系人、邀请、建群、成员管理）。只由 W10 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const IM_PEOPLE_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const IM_PEOPLE_MESSAGES = emptyCopy();
