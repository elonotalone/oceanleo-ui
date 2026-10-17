/**
 * Host-facing EditorSession v1 types. W01 freezes the shared export;
 * this file is the editor-runtime shape hosts should consume until then.
 */

export const EDITOR_SESSION_PROTOCOL = "oceanleo.editor-session.v1" as const;
export const MAX_EDITOR_SESSION_BYTES = 5_000_000;

export type EditorSessionHostToEditorType =
  | "open"
  | "save-ack"
  | "export"
  | "close";

export type EditorSessionEditorToHostType =
  | "ready"
  | "changed"
  | "save"
  | "error"
  | "exported"
  | "dirty"
  | "closed";

export interface EditorSessionOpen {
  protocol: typeof EDITOR_SESSION_PROTOCOL;
  type: "open";
  sessionId: string;
  documentId: string;
  schema: string;
  revision: string;
  payload: Record<string, unknown>;
  origin?: string;
}

export interface EditorSessionSave {
  protocol: typeof EDITOR_SESSION_PROTOCOL;
  type: "save";
  sessionId: string;
  requestId: string;
  documentId: string;
  schema: string;
  baseRevision: string;
  payload: Record<string, unknown>;
  origin?: string;
}

export interface EditorSessionSaveAck {
  protocol: typeof EDITOR_SESSION_PROTOCOL;
  type: "save-ack";
  sessionId: string;
  requestId: string;
  revision: string;
  ok: true;
  origin?: string;
}
