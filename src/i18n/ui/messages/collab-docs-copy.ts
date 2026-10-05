// 2026-10-05 work-chat 波 W12 的分表（文档、表格的多人同改与回放画法）。只由 W12 改；注册在 work-chat-copy.ts（父改）。
// 写法：const SOURCE = { "简体中文原文": "简体中文原文" } as const;
//       export const COLLAB_DOCS_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const COLLAB_DOCS_MESSAGES = emptyCopy();
