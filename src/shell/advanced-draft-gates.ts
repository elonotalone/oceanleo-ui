import type { AdvancedFlushResult } from "./advanced-session-context";

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
