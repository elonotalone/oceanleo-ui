/** Explicit execution choice; private to the signed-in account, never a global mount. */
export type ExecutionTarget = { kind: "cloud" } | { kind: "computer" | "device"; id: string; name: string };
export const EXECUTION_TARGET_EVENT = "oceanleo:execution-target";
const PREFIX = "oceanleo.execution-target.v1:";

export function normalizeExecutionTarget(value: unknown): ExecutionTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.kind === "cloud") return { kind: "cloud" };
  if ((item.kind !== "computer" && item.kind !== "device") || typeof item.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(item.id) || typeof item.name !== "string") return null;
  return { kind: item.kind, id: item.id, name: item.name.slice(0, 120) };
}
export function readExecutionTarget(userId: string | null): ExecutionTarget {
  if (!userId || typeof window === "undefined") return { kind: "cloud" };
  try { return normalizeExecutionTarget(JSON.parse(window.localStorage.getItem(PREFIX + userId) || "null")) ?? { kind: "cloud" }; }
  catch { return { kind: "cloud" }; }
}
export function writeExecutionTarget(userId: string, target: ExecutionTarget): void {
  const clean = normalizeExecutionTarget(target);
  if (!userId || !clean || typeof window === "undefined") return;
  try { window.localStorage.setItem(PREFIX + userId, JSON.stringify(clean)); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(EXECUTION_TARGET_EVENT, { detail: { userId, target: clean } }));
}
export function executionTargetRequestFields(target: ExecutionTarget): {
  execution_target: { kind: ExecutionTarget["kind"]; id?: string }; computer_id: string;
} {
  return { execution_target: target.kind === "cloud" ? { kind: "cloud" } : { kind: target.kind, id: target.id },
    // Suppress stale legacy mounts for an explicit default-cloud/local choice.
    computer_id: target.kind === "computer" ? target.id : "" };
}
