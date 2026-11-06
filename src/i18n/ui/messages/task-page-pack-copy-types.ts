// @oceanleo/ui — 2026-11-06 task-page-pack 波：每位 owner 一册新文案的统一形状。
// key = 中文原文（代码里 tt("…") 写的那一句）；值 = 该语种译文。
// 16 个非中文语种必须齐全（少一个语种 tsc 当场编不过）；zh 不用写，由聚合册自动生成。
// 基础词典已经有译文的词（保存、复制、登录……）不要再写进分册：分册不许改写现有译文。
import type { Locale } from "../../config";

export type TaskPagePackCopy = Record<Exclude<Locale, "zh">, Record<string, string>>;
