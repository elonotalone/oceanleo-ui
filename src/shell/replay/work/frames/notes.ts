// 回放里「这一步改了什么」那句话的公共零件（F04）。
// 规则：句子一律是 `tt("中文模板 {n}", { n })`，不在这里或适配器里拼中文；
// 每个模板都要进 `i18n/ui/messages/work-replay-copy.ts` 的 REPLAY_NOTE_TRANSLATIONS（有测试逐个核对）。
import type { UITranslate } from "../../../../i18n/ui/useUI";

export type ChangeTranslate = UITranslate;

/** 没传 `tt` 时回落成中文原文（老测试、非界面调用）；有变量就做 `{x}` 插值。 */
export const plainChangeTranslate: ChangeTranslate = (zh, vars) =>
  vars ? zh.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match)) : zh;

/** 适配器的 `*ChangeNote()` 给的模板 + 变量。 */
export interface ChangeNote {
  zh: string;
  vars?: Record<string, string | number>;
}

export function noteText(tt: ChangeTranslate | undefined, note: ChangeNote | null): string | null {
  if (!note) return null;
  return (tt ?? plainChangeTranslate)(note.zh, note.vars);
}

/** 把几句并成一句；连接符也走 `tt`（各语言自己的逗号）。 */
export function joinNotes(tt: ChangeTranslate | undefined, parts: readonly string[]): string | null {
  if (parts.length === 0) return null;
  const translate = tt ?? plainChangeTranslate;
  return parts.reduce((a, b) => translate("{a}，{b}", { a, b }));
}
