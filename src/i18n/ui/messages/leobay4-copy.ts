// 2026-10-09 LeoBay 第四波的分表：右侧栏卡片首页、右侧栏里的 LeoBay（相关服务）、LeoChat 整页与右侧栏那一处。
// 只由第四波 W5 改；登记在 bay-copy.ts（父 agent 已登记，W5 不动 bay-copy.ts）。
// 写法与别的 Bay 分表相同：const SOURCE = { name: "简体中文原文" } as const; assembleCopy(SOURCE, { 16 个语种 })。
// 基础词典或别的 Bay 分表里已经有的句子不在这里重复。品牌名（LeoBay、LeoChat、OceanLeo、各站产品名）不进词典。
import { emptyCopy } from "./shell-overhaul-copy-shared";

export const LEOBAY4_MESSAGES = emptyCopy();
