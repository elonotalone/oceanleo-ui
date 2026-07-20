import type { CloudBrowserTicket } from "../lib/browser";

export type CloudBrowserWireBinding = {
  sessionId: string;
  runtimeId: string;
  incarnation: number;
  connectionId?: string;
};

const CLIENT_CAPABILITIES = {
  frame_presented: true,
  tabs: true,
  ime_commit: true,
  viewport: true,
} as const;

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function cloudBrowserTicketBinding(
  ticket: CloudBrowserTicket,
  requestedSessionId: string,
): CloudBrowserWireBinding | null {
  const sessionId = String(ticket.session_id || requestedSessionId || "");
  const runtimeId = String(ticket.runtime_id || "");
  const incarnation = positiveInteger(ticket.incarnation);
  if (
    ticket.protocol_version !== 2 ||
    !sessionId ||
    sessionId !== requestedSessionId ||
    !runtimeId ||
    !incarnation
  ) {
    return null;
  }
  return { sessionId, runtimeId, incarnation };
}

export function cloudBrowserAuthMessage(
  ticket: CloudBrowserTicket,
  requestedSessionId: string,
): {
  binding: CloudBrowserWireBinding | null;
  message: Record<string, unknown>;
} {
  const binding = cloudBrowserTicketBinding(ticket, requestedSessionId);
  const common = {
    t: "auth",
    ticket: ticket.ticket,
    binary_frames: true,
    protocol_versions: [2, 1],
    capabilities: CLIENT_CAPABILITIES,
  };
  if (!binding) {
    return { binding: null, message: common };
  }
  return {
    binding,
    message: {
      v: 2,
      ...common,
      session_id: binding.sessionId,
      runtime_id: binding.runtimeId,
      incarnation: binding.incarnation,
    },
  };
}

export function cloudBrowserV2Message(
  binding: CloudBrowserWireBinding,
  type: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    v: 2,
    t: type,
    session_id: binding.sessionId,
    runtime_id: binding.runtimeId,
    incarnation: binding.incarnation,
    connection_id: binding.connectionId || "",
    ...payload,
  };
}
