// One task conversation target. Shared by the Device menu (R2), the host
// (R3) and native surfaces (R4). Contract: docs/work-logs/2026-10-30-unified-computer-task/R0-redo-contract.md.
import type { ExecutionTarget } from "../../lib/execution-target";

export type NativeProgram = "cursor" | "claude" | "codex" | "hermes";

export type ConversationTarget =
  | { kind: "oceanleo"; target: ExecutionTarget }
  | { kind: "native"; computerId: string; computerName: string; program: NativeProgram; view: "chat" | "cli"; sessionId?: string }
  | { kind: "terminal"; computerId: string; computerName: string; sessionId?: string };
