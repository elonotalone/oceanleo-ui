// 输入框下方的 @leo 按钮：在光标处插入 `@leo `。前一个字符紧贴着字母数字时先补一个空格，
// 否则 `foo@leo` 不算提到 leo（见 MentionPicker 的手打 @leo 规则）。选中的文字被替换。
export const LEO_INSERT_TEXT = "@leo ";

export function insertLeoMention(text: string, start: number, end: number = start): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const before = text.slice(0, from);
  const needsSpace = /[A-Za-z0-9_]$/.test(before);
  const insert = (needsSpace ? " " : "") + LEO_INSERT_TEXT;
  return { text: before + insert + text.slice(to), caret: from + insert.length };
}
