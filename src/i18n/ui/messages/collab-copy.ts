// 2026-10-05 work-chat 波 W11 的分表（多人同改公共层：头像、锁、邀请一起改）。只由 W11 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const COLLAB_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const COLLAB_MESSAGES = emptyCopy();
