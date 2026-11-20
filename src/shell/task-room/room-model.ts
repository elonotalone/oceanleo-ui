// Pure rules of a task's page (task rooms wave 2026-11-20): card status words, who can open a
// child, the default message selection (rule 3) and the "Given to …" marks. No React, no network.
import type {
  SummonPreview,
  TaskChildAccess,
  TaskChildStatus,
  TaskHandoff,
  TaskRoomChild,
} from "../../lib/task-rooms-api";

/** What a person reads on a card: four states, or nothing (a task card has no run state). */
export type TaskCardStatus = "working" | "waiting" | "done" | "failed";

export function taskCardStatus(status: TaskChildStatus | null | undefined): TaskCardStatus | null {
  switch (status) {
    case "working":
      return "working";
    case "waiting":
      return "waiting";
    case "idle":
    case "closed":
      return "done";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export function canOpenChild(access: TaskChildAccess | null | undefined): boolean {
  return access === "owner" || access === "collaborate" || access === "view";
}

/** Sub tasks I may send a follow-up to (owner or Can collaborate). */
export function sendableSubTasks(children: readonly TaskRoomChild[]): TaskRoomChild[] {
  return children.filter((child) => child.kind === "agent_task" && (child.my_access === "owner" || child.my_access === "collaborate"));
}

/** Earlier sub tasks whose content may be carried into a new one (anything I can read). */
export function readableSubTasks(children: readonly TaskRoomChild[]): TaskRoomChild[] {
  return children.filter((child) => child.kind === "agent_task" && canOpenChild(child.my_access));
}

const PROGRAM_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  hermes: "Hermes",
  oceanleo: "OceanLeo",
};

export function programName(program: string | null | undefined): string {
  if (!program) return "";
  return PROGRAM_NAMES[program] ?? program;
}

/** "<program> · <title>" (title alone when the program is unknown). */
export function subTaskLabel(child: Pick<TaskRoomChild, "program" | "title">): string {
  const program = programName(child.program);
  return program ? `${program} · ${child.title}` : child.title;
}

/**
 * The selection the summon dialog starts with: what the person picked, otherwise the server's
 * default for this target (new sub task = every task message; follow-up = after the last handoff).
 * null = not known yet.
 */
export function summonSelection(explicit: readonly string[] | null, preview: Pick<SummonPreview, "default_message_ids"> | null): string[] | null {
  if (explicit) return [...explicit];
  if (preview && Array.isArray(preview.default_message_ids)) return [...preview.default_message_ids];
  return null;
}

/** message id → titles of the sub tasks it was given to, oldest handoff first, no repeats. */
export function handoffTitles(
  handoffs: readonly TaskHandoff[],
  children: readonly Pick<TaskRoomChild, "kind" | "id" | "title">[],
): Record<string, string[]> {
  const titleOf = new Map(children.filter((child) => child.kind === "agent_task").map((child) => [child.id, child.title]));
  const ordered = [...handoffs].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const marks: Record<string, string[]> = {};
  for (const handoff of ordered) {
    const title = titleOf.get(handoff.agent_task_id);
    if (!title) continue;
    for (const id of handoff.message_ids) {
      const list = (marks[id] ??= []);
      if (!list.includes(title)) list.push(title);
    }
  }
  return marks;
}

/** Characters as a short count ("12 k" style is left to Intl; this only rounds). */
export function roundedChars(chars: number): number {
  return chars >= 10_000 ? Math.round(chars / 1000) * 1000 : chars;
}
