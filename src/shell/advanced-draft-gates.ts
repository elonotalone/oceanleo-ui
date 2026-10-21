import type { AdvancedFlushResult } from "./advanced-session-context";
import type { PluginCommandResult } from "./plugin-command/types";
import { userEditItemKey } from "./user-edit-session";

type GateReason = "handoff" | "export";
const gates = new Map<string, (reason: GateReason) => Promise<AdvancedFlushResult>>();

/** Mode switches use the same version + session receipt as close/export. */
export function bindAdvancedDraftGate(key: string, flush: (reason: GateReason) => Promise<AdvancedFlushResult>): () => void {
  gates.set(key, flush);
  return () => { if (gates.get(key) === flush) gates.delete(key); };
}
export function flushAdvancedDraftGate(key: string, reason: GateReason = "handoff"): Promise<AdvancedFlushResult> | null {
  return gates.get(key)?.(reason) ?? null;
}
export async function ensureAdvancedDraftExport(key: string): Promise<boolean> {
  return (await flushAdvancedDraftGate(key, "export"))?.ok ?? true;
}
export async function afterAdvancedDraftExport(key: string, action: () => unknown | Promise<unknown>): Promise<void> {
  if (await ensureAdvancedDraftExport(key)) await action();
}

/** Agent saves must include the same version + Task-history receipt as the UI. */
export async function saveAdvancedEditorFromAgent(
  item: Parameters<typeof userEditItemKey>[0],
  localFlush?: () => Promise<AdvancedFlushResult>,
): Promise<PluginCommandResult> {
  const saved = localFlush
    ? await localFlush()
    : await flushAdvancedDraftGate(userEditItemKey(item), "export");
  if (!saved) return { ok: false, message: "当前编辑器的保存通道尚未就绪或由协作保存者负责；任务文件记录未更新。" };
  if (!saved.ok) return { ok: false, message: saved.error || saved.errorMessage || "文件保存或任务文件记录更新失败，请重试。" };
  return { ok: true, message: "已保存原文件的新版本，并更新任务中的文件记录。" };
}
