import type { ExecutionTarget } from "./execution-target";

export const NATIVE_PROGRAMS = ["cursor", "claude", "codex", "hermes"] as const;
export type NativeProgram = (typeof NATIVE_PROGRAMS)[number];
export type WsProgram = NativeProgram;
export const PROGRAM_LABEL: Record<NativeProgram | "oceanleo", string> = {
  cursor: "Cursor",
  hermes: "Hermes",
  claude: "Claude Code",
  codex: "Codex",
  oceanleo: "OceanLeo agent",
};
export type ConversationTarget =
  | { kind: "oceanleo"; target: ExecutionTarget }
  | { kind: "native"; computerId: string; computerName: string; program: NativeProgram; view: "chat" | "cli"; sessionId?: string }
  | { kind: "terminal"; computerId: string; computerName: string; sessionId?: string };
export type ProgramOption = { id: string; label: string; default?: boolean };
export type ProgramOptions = {
  program: NativeProgram;
  installed: boolean;
  version: string | null;
  login: { state: "logged_in" | "logged_out" | "unknown"; account: string | null };
  models: ProgramOption[];
  modes: ProgramOption[];
  efforts: ProgramOption[];
  fast: { available: boolean };
};
export type ProgramOperation = {
  operation_id: string;
  kind: "install" | "login";
  state: "running" | "needs_code" | "succeeded" | "failed" | "cancelled";
  url?: string;
  message?: string;
  progress?: number;
};
