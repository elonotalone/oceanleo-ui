/** Read-only editor context. File mutations run through background Library tools. */
export interface EditorTarget {
  workspaceScopeId: string;
  editorId: string;
  artifactId: string;
  revisionId: string;
  artifactType: string;
  editRevision: string | number;
  surfaceInstanceId: string;
}
export type PluginAgentContext =
  | { ready: false; reason: string }
  | { ready: true; kind: "text" | "structured" | "visual"; content: unknown; truncated?: boolean; note?: string };
export type EditorSelection =
  | { kind: "whole-file" }
  | { kind: "text"; from: number; to: number }
  | { kind: "slides"; slideIds: string[]; elementIds: string[] }
  | { kind: "cells"; sheetId: string; range: { startRow: number; endRow: number; startColumn: number; endColumn: number } }
  | { kind: "objects"; objectIds: string[]; region?: Record<string, number> }
  | { kind: "pdf"; page: number; annotationIds: string[]; region?: Record<string, number> }
  | { kind: "timeline"; clipIds: string[]; playheadMs: number };
export interface EditorContextSurface {
  editorId: string;
  workspaceScopeId?: string;
  target?(): EditorTarget | null;
  selection(): EditorSelection;
  agentContext(): PluginAgentContext;
}
export interface EditorContextSurfaceInput extends Omit<EditorContextSurface, "target"> {
  target?(): Omit<EditorTarget, "workspaceScopeId" | "surfaceInstanceId"> | EditorTarget | null;
}
