// 「切换对话」记住上一次（2026-10-31 C-3）：首页 / 新任务草稿的 Device 菜单按这个
// 账号上一次选的「电脑 · 程序」对话显示，不再每次回到云端。只记电脑 + 程序：
// 绝不记 session / task id —— 新任务不能接到旧对话上。选择失效（电脑删了、
// 程序不在）时由调用方清掉并回落到 OceanLeo 目标（默认云端）。
import type { ConversationTarget, NativeProgram } from "../native-thread/types";

export type RememberedNativeChat = {
  kind: "native";
  computerId: string;
  computerName: string;
  program: NativeProgram;
  view: "chat";
};

const PREFIX = "oceanleo.dock-conversation.v1:";
const ID = /^[A-Za-z0-9_:.-]{1,128}$/;
const PROGRAMS: readonly NativeProgram[] = ["codex", "claude", "cursor", "hermes"];

function isProgram(value: unknown): value is NativeProgram {
  return typeof value === "string" && (PROGRAMS as readonly string[]).includes(value);
}

export function normalizeRememberedConversation(value: unknown): RememberedNativeChat | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.kind !== "native" || item.view !== "chat") return null;
  if (typeof item.computerId !== "string" || !ID.test(item.computerId) || !isProgram(item.program)) return null;
  const computerName = typeof item.computerName === "string" && item.computerName.trim() ? item.computerName.slice(0, 120) : item.computerId;
  return { kind: "native", computerId: item.computerId, computerName, program: item.program, view: "chat" };
}

export function readRememberedConversation(userId: string | null): RememberedNativeChat | null {
  if (!userId || typeof window === "undefined") return null;
  try { return normalizeRememberedConversation(JSON.parse(window.localStorage.getItem(PREFIX + userId) || "null")); }
  catch { return null; }
}

/** `null` forgets the pick (the user went back to an OceanLeo row, or the pick is gone). */
export function writeRememberedConversation(userId: string | null, conversation: ConversationTarget | null): void {
  if (!userId || typeof window === "undefined") return;
  try {
    if (!conversation) { window.localStorage.removeItem(PREFIX + userId); return; }
    // Only the computer + program travel; a sessionId on the pick is dropped here.
    const clean = normalizeRememberedConversation(conversation);
    if (clean) window.localStorage.setItem(PREFIX + userId, JSON.stringify(clean));
  } catch { /* private mode */ }
}

/**
 * The remembered pick against what the gateway lists now. `computers`: the
 * account's connected computers. `programs`: that computer's program rows, or
 * null when not known (offline / not read): an unknown state keeps the pick.
 * Returns null when the computer is gone or the program is not on it.
 */
export function resolveRememberedConversation(
  remembered: RememberedNativeChat,
  computers: readonly { id: string; name?: string | null }[],
  programs: readonly { id: string; installed?: boolean }[] | null,
): RememberedNativeChat | null {
  const computer = computers.find((item) => item.id === remembered.computerId);
  if (!computer) return null;
  if (programs && programs.length > 0) {
    const row = programs.find((item) => item.id === remembered.program);
    if (!row || row.installed === false) return null;
  }
  return { ...remembered, computerName: computer.name || remembered.computerName };
}
