// @oceanleo/ui — 2026-10-23 编辑器整改波：每位 owner 一册新文案的统一形状。
// key = 中文原文（就是代码里 tt("…") 写的那一句）；值 = 该语种译文。
// 16 个非中文语种必须齐全（少一个语种 tsc 当场编不过）；zh 不用写，由聚合册自动生成。
import type { Locale } from "../../config";

export type EditorOverhaulCopy = Record<
  Exclude<Locale, "zh">,
  Record<string, string>
>;
