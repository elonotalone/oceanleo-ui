// 2026-10-05 work-chat 波 W14 的分表（游戏、3D、音频、PDF、视频、流程图的多人同改与回放画法）。只由 W14 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const COLLAB_MEDIA_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const COLLAB_MEDIA_MESSAGES = emptyCopy();
