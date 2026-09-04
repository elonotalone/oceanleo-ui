/**
 * 审阅面板用的行级 / 词级 diff。纯函数，不碰 DOM。
 *
 * 产物给两处用：文本类 `review-proposal.diff` 的展示，以及从「前/后」摘要拼 unified
 * 文本。算法是有界 LCS，超长输入截断后仍给出可读的增删，不抛。
 */

export type DiffOp = {
  type: "equal" | "add" | "remove";
  text: string;
};

const LINE_CAP = 2_000;
const WORD_CAP = 4_000;

function lcsOps(before: readonly string[], after: readonly string[]): DiffOp[] {
  const a = before.length > LINE_CAP ? before.slice(0, LINE_CAP) : before;
  const b = after.length > LINE_CAP ? after.slice(0, LINE_CAP) : after;
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", text: a[i] });
      i += 1;
    } else {
      ops.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "remove", text: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "add", text: b[j] });
    j += 1;
  }
  return ops;
}

export function splitLines(text: string): string[] {
  if (!text) return [""];
  return text.split(/\r?\n/);
}

export function splitWords(text: string): string[] {
  if (!text) return [""];
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

export function lineDiff(before: string, after: string): DiffOp[] {
  return lcsOps(splitLines(before), splitLines(after));
}

export function wordDiff(before: string, after: string): DiffOp[] {
  const left = splitWords(before).slice(0, WORD_CAP);
  const right = splitWords(after).slice(0, WORD_CAP);
  return lcsOps(left, right);
}

/** 给 `EditorReviewProposal.diff` 用的 unified 文本（非空，契约 required）。 */
export function unifiedDiff(before: string, after: string): string {
  const ops = lineDiff(before, after);
  const lines = ops.map((op) =>
    op.type === "equal" ? ` ${op.text}` : op.type === "add" ? `+${op.text}` : `-${op.text}`,
  );
  const text = lines.join("\n");
  return text.length > 0 ? text : `-${before || " "}\n+${after || " "}`;
}
