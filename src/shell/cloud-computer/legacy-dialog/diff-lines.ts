// 工具卡里的行级 diff。自己写，不引依赖；大输入直接分成删除和新增，避免卡住页面。

export type DiffRow = { op: " " | "+" | "-"; text: string };

const MAX_LINES = 200;

export function lineDiff(oldText: string, newText: string): DiffRow[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  if (a.length > MAX_LINES || b.length > MAX_LINES || a.length * b.length > 20000) {
    return [
      ...a.slice(0, MAX_LINES).map((text) => ({ op: "-" as const, text })),
      ...b.slice(0, MAX_LINES).map((text) => ({ op: "+" as const, text })),
    ];
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = dp[i];
    const next = dp[i + 1];
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ op: " ", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ op: "-", text: a[i] });
      i += 1;
    } else {
      rows.push({ op: "+", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    rows.push({ op: "-", text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    rows.push({ op: "+", text: b[j] });
    j += 1;
  }
  return rows;
}
