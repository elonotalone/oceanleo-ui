import type {
  CliProgram,
  TerminalRecord,
} from "../../../lib/cloud-computer-api";

export const CLI_PROGRAM_ORDER = [
  "oceanleo",
  "cursor",
  "claude",
  "codex",
  "hermes",
] as const;

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 活会话在前；每组都把最近创建/结束的放在前面。 */
export function sortTerminalRecords(
  records: readonly TerminalRecord[],
): TerminalRecord[] {
  return [...records].sort((left, right) => {
    if (left.alive !== right.alive) return left.alive ? -1 : 1;
    const leftAt = left.alive
      ? timestamp(left.created_at)
      : timestamp(left.ended_at) || timestamp(left.created_at);
    const rightAt = right.alive
      ? timestamp(right.created_at)
      : timestamp(right.ended_at) || timestamp(right.created_at);
    return rightAt - leftAt || left.id.localeCompare(right.id);
  });
}

export function shellTerminalRecords(
  records: readonly TerminalRecord[],
): TerminalRecord[] {
  return sortTerminalRecords(
    records.filter((record) => record.kind !== "cli"),
  );
}

export function runningCliTerminals(
  records: readonly TerminalRecord[],
  program: string,
): TerminalRecord[] {
  return sortTerminalRecords(
    records.filter(
      (record) =>
        record.kind === "cli" && record.program === program && record.alive,
    ),
  );
}

export function orderedCliPrograms(
  programs: readonly CliProgram[],
): CliProgram[] {
  const position = new Map<string, number>(
    CLI_PROGRAM_ORDER.map((program, index) => [program, index]),
  );
  return [...programs].sort((left, right) => {
    const leftIndex = position.get(left.id) ?? CLI_PROGRAM_ORDER.length;
    const rightIndex = position.get(right.id) ?? CLI_PROGRAM_ORDER.length;
    return leftIndex - rightIndex || left.label.localeCompare(right.label);
  });
}

export type TerminalEndCopy = {
  key: "已退出（代码 {code}）" | "已关闭" | "节点重启" | "已结束";
  vars?: { code: number | string };
};

export function terminalEndCopy(record: TerminalRecord): TerminalEndCopy {
  if (record.end_reason === "closed") return { key: "已关闭" };
  if (record.end_reason === "node_restart") return { key: "节点重启" };
  if (record.end_reason === "exit" || record.exit_code != null) {
    return {
      key: "已退出（代码 {code}）",
      vars: { code: record.exit_code ?? "—" },
    };
  }
  return { key: "已结束" };
}

