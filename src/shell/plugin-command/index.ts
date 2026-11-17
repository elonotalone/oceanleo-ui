"use client";
import { useEffect, useRef } from "react";
import { registerEditorContext } from "./registry";
import { useOptionalWorkspaceSession } from "../workspace-session-context";
import { useWorkspacePane } from "../SplitWorkspace";
import type { EditorContextSurfaceInput } from "./types";
export * from "./types";
export * from "./registry";
let sequence = 0;
export function useEditorContext(surface: EditorContextSurfaceInput | null | undefined): void {
  const workspace = useOptionalWorkspaceSession();
  const scopeId = workspace?.activeFileScopeId || "standalone";
  const pane = useWorkspacePane();
  const open = pane?.libraryOpen !== false;
  const latest = useRef(surface); latest.current = surface;
  const editorId = surface?.editorId || "";
  useEffect(() => {
    if (!editorId || !open) return;
    const surfaceInstanceId = `editor-context-${++sequence}`;
    return registerEditorContext({
      editorId, workspaceScopeId: scopeId,
      target: () => {
        const target = latest.current?.target?.();
        return target ? { ...target, workspaceScopeId: scopeId, surfaceInstanceId } : null;
      },
      selection: () => latest.current?.selection() || { kind: "whole-file" },
      agentContext: () => latest.current?.agentContext() || { ready: false, reason: "Source unavailable" },
    });
  }, [editorId, open, scopeId]);
}
