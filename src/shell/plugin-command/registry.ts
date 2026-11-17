import type { EditorContextSurface } from "./types";
let active: EditorContextSurface | null = null;
let owner: EditorContextSurface | null = null;
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) listener(); }
/** Allowlist read methods at runtime as well as in TypeScript; extra callbacks never escape. */
export function registerEditorContext(surface: EditorContextSurface): () => void {
  owner = surface;
  active = {
    editorId: surface.editorId,
    workspaceScopeId: surface.workspaceScopeId,
    target: () => surface.target?.() || null,
    selection: () => surface.selection?.() || { kind: "whole-file" },
    agentContext: () => surface.agentContext?.() || { ready: false, reason: "Source unavailable" },
  };
  notify();
  return () => { if (owner === surface) { owner = null; active = null; notify(); } };
}
export function currentEditorContext(): EditorContextSurface | null { return active; }
export function subscribeEditorContext(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function resetEditorContext(): void { owner = null; active = null; notify(); }
