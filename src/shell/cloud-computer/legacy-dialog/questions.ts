// Cursor 的提问结构不固定。认得出「标题 + 选项」就按项渲染，否则整张卡退成一个文本框。
// cursor/ask_question 把题目数组放在 `{ questions: [...] }` 里，不能把整个 params 对象
// 当成数组——否则界面只剩「需要你回答」，选项丢失，回包也不被 Cursor 认。

import { asRecord } from "./parse";

export type QuestionField = {
  id: string;
  title: string;
  options: { id: string; label: string }[];
  allowMultiple: boolean;
};

export type QuestionForm =
  | { mode: "text" }
  | { mode: "fields"; fields: QuestionField[] };

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textOf(value);
    if (text.trim()) return text;
  }
  return "";
}

function readOptions(raw: unknown): { id: string; label: string }[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const options: { id: string; label: string }[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      options.push({ id: item, label: item });
      continue;
    }
    const row = asRecord(item);
    if (!row) return null;
    const label = firstText(row.label, row.name, row.title, row.value, row.id);
    const id = firstText(row.id, row.value) || label;
    if (!label || !id) return null;
    options.push({ id, label });
  }
  return options;
}

/** Cursor 把题目放在 params.questions；老帧也可能直接给数组。 */
export function questionItemsOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const rec = asRecord(raw);
  if (rec && Array.isArray(rec.questions)) return rec.questions;
  return [];
}

export function normalizeQuestions(raw: unknown): QuestionForm {
  const list = questionItemsOf(raw);
  if (list.length === 0) return { mode: "text" };
  const fields: QuestionField[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = asRecord(list[index]);
    if (!item) return { mode: "text" };
    const title = firstText(item.prompt, item.question, item.title, item.text, item.label);
    if (!title) return { mode: "text" };
    const options = readOptions(item.options ?? item.choices);
    if (!options) return { mode: "text" };
    fields.push({
      id: firstText(item.id) || `q${index}`,
      title,
      options,
      allowMultiple: item.allowMultiple === true,
    });
  }
  return { mode: "fields", fields };
}
