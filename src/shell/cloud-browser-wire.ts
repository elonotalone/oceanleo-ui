import type {
  CloudBrowserControlLease,
  CloudBrowserTicket,
} from "../lib/browser";

export const CLOUD_BROWSER_PROTOCOL_VERSION = 3 as const;
export const CLOUD_BROWSER_MAX_CONTROL_BYTES = 64 * 1024;
export const CLOUD_BROWSER_MAX_FRAME_BYTES = 8 * 1024 * 1024;
export const CLOUD_BROWSER_MAX_TEXT_BYTES = 32 * 1024;

const MAX_ID_LENGTH = 160;
const MAX_PRINCIPAL_LENGTH = 256;
const MAX_NONCE_LENGTH = 256;
const MAX_TICKET_LENGTH = 4_096;
const MAX_TICKET_SECONDS = 300;
const MAX_FRAME_DIMENSION = 4_096;

const TICKET_KEYS = new Set([
  "ticket",
  "ticket_nonce",
  "expires_at",
  "expires_in",
  "protocol_version",
  "owner_principal",
  "session_id",
  "runtime_id",
  "incarnation",
  "session_version",
  "binary_frames",
]);

/**
 * The HTTP ticket deliberately contains only fences known by the gateway.
 * Runtime version, stream, window, frame contract and capabilities do not
 * exist client-side until the executor-backed hello is accepted.
 */
export type CloudBrowserPreHandshakeBinding = {
  ownerPrincipal: string;
  sessionId: string;
  sessionVersion: number;
  runtimeId: string;
  incarnation: number;
  ticketNonce: string;
};

export type CloudBrowserWireBinding = {
  sessionId: string;
  sessionVersion: number;
  runtimeId: string;
  runtimeVersion: string;
  incarnation: number;
  nonce: string;
  connectionId: string;
  streamId: string;
  streamGeneration: number;
  windowId: string;
};

export type CloudBrowserControlMutationType =
  | "control.acquire"
  | "control.renew"
  | "control.release";

export function canSendCloudBrowserControlMutation(
  type: CloudBrowserControlMutationType,
  lease: CloudBrowserControlLease,
  leaseOwned: boolean,
  connectionId: string,
): boolean {
  if (!connectionId || lease.epoch <= 0) return false;
  if (type === "control.acquire") {
    return (
      !leaseOwned &&
      lease.holderKind === "free" &&
      lease.leaseId === "" &&
      lease.holderId === undefined &&
      lease.connectionId === undefined &&
      lease.expiresAt === undefined
    );
  }
  return (
    leaseOwned &&
    lease.holderKind === "human" &&
    lease.leaseId.length > 0 &&
    lease.connectionId === connectionId
  );
}

export type CloudBrowserTicketValidationReason =
  | "protocol_mismatch"
  | "invalid_ticket"
  | "session_mismatch"
  | "ticket_expired";

export type CloudBrowserTicketValidation =
  | {
      ok: true;
      ticket: CloudBrowserTicket;
      binding: CloudBrowserPreHandshakeBinding;
      expiresAt: number;
    }
  | {
      ok: false;
      reason: CloudBrowserTicketValidationReason;
    };

export type CloudBrowserAuthResult =
  | {
      ok: true;
      binding: CloudBrowserPreHandshakeBinding;
      expiresAt: number;
      message: Record<string, unknown>;
    }
  | {
      ok: false;
      binding: null;
      message: null;
      reason: CloudBrowserTicketValidationReason;
    };

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function boundedString(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.length > 0)
  );
}

function positiveInteger(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= max
    ? value
    : 0;
}

export function validateCloudBrowserTicket(
  ticket: unknown,
  requestedSessionId: string,
  now = Date.now(),
): CloudBrowserTicketValidation {
  const envelope = recordValue(ticket);
  if (
    !envelope ||
    envelope.protocol_version !== CLOUD_BROWSER_PROTOCOL_VERSION
  ) {
    return { ok: false, reason: "protocol_mismatch" };
  }
  if (
    !hasOnlyKeys(envelope, TICKET_KEYS) ||
    !boundedString(envelope.ticket, MAX_TICKET_LENGTH) ||
    !boundedString(envelope.ticket_nonce, MAX_NONCE_LENGTH) ||
    !boundedString(envelope.expires_at, 64) ||
    !positiveInteger(envelope.expires_in, MAX_TICKET_SECONDS) ||
    !boundedString(envelope.owner_principal, MAX_PRINCIPAL_LENGTH) ||
    !boundedString(envelope.session_id, MAX_ID_LENGTH) ||
    !boundedString(envelope.runtime_id, MAX_ID_LENGTH) ||
    !positiveInteger(envelope.incarnation) ||
    !positiveInteger(envelope.session_version) ||
    envelope.binary_frames !== true
  ) {
    return { ok: false, reason: "invalid_ticket" };
  }
  if (
    !requestedSessionId ||
    envelope.session_id !== requestedSessionId
  ) {
    return { ok: false, reason: "session_mismatch" };
  }
  const expiresAt = Date.parse(envelope.expires_at);
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    expiresAt >
      now + (envelope.expires_in as number) * 1_000 + 2_000
  ) {
    return { ok: false, reason: "ticket_expired" };
  }
  const typedTicket = envelope as unknown as CloudBrowserTicket;
  return {
    ok: true,
    ticket: typedTicket,
    expiresAt,
    binding: {
      ownerPrincipal: typedTicket.owner_principal,
      sessionId: typedTicket.session_id,
      sessionVersion: typedTicket.session_version,
      runtimeId: typedTicket.runtime_id,
      incarnation: typedTicket.incarnation,
      ticketNonce: typedTicket.ticket_nonce,
    },
  };
}

export function cloudBrowserTicketBinding(
  ticket: CloudBrowserTicket,
  requestedSessionId: string,
  now = Date.now(),
): CloudBrowserPreHandshakeBinding | null {
  const validation = validateCloudBrowserTicket(
    ticket,
    requestedSessionId,
    now,
  );
  return validation.ok ? validation.binding : null;
}

export function cloudBrowserAuthMessage(
  ticket: CloudBrowserTicket,
  requestedSessionId: string,
  now = Date.now(),
): CloudBrowserAuthResult {
  const validation = validateCloudBrowserTicket(
    ticket,
    requestedSessionId,
    now,
  );
  if (!validation.ok) {
    return {
      ok: false,
      binding: null,
      message: null,
      reason: validation.reason,
    };
  }
  const { binding } = validation;
  return {
    ok: true,
    binding,
    expiresAt: validation.expiresAt,
    message: {
      v: CLOUD_BROWSER_PROTOCOL_VERSION,
      t: "auth",
      ticket: validation.ticket.ticket,
      ticket_nonce: binding.ticketNonce,
      owner_principal: binding.ownerPrincipal,
      session_id: binding.sessionId,
      runtime_id: binding.runtimeId,
      incarnation: binding.incarnation,
      session_version: binding.sessionVersion,
      binary_frames: true,
    },
  };
}

export function cloudBrowserV3Message(
  binding: CloudBrowserWireBinding,
  type: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...payload,
    v: CLOUD_BROWSER_PROTOCOL_VERSION,
    t: type,
    session_id: binding.sessionId,
    session_version: binding.sessionVersion,
    runtime_id: binding.runtimeId,
    runtime_version: binding.runtimeVersion,
    incarnation: binding.incarnation,
    nonce: binding.nonce,
    connection_id: binding.connectionId,
    stream_id: binding.streamId,
    stream_generation: binding.streamGeneration,
    window_id: binding.windowId,
  };
}

export function cloudBrowserV3FrameReceipt(
  binding: CloudBrowserWireBinding,
  type: "frame.received" | "frame.dropped" | "frame.presented",
  frameSequence: number,
  frameActionSequence: number,
): Record<string, unknown> {
  return cloudBrowserV3Message(binding, type, {
    frame_sequence: frameSequence,
    action_sequence: frameActionSequence,
  });
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function textBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Client-side input validation is intentionally a closed allow-list. The
 * gateway remains authoritative, but malformed or oversized events never
 * leave the browser and therefore cannot be replayed after reconnect.
 */
export function validateCloudBrowserMutation(
  type: string,
  payload: Record<string, unknown>,
): boolean {
  const keys = new Set(Object.keys(payload));
  const only = (...allowed: string[]) =>
    [...keys].every((key) => allowed.includes(key));
  const point = () =>
    finiteNumber(payload.nx, 0, 1) &&
    finiteNumber(payload.ny, 0, 1);
  const boundedText = (value: unknown) =>
    boundedString(value, CLOUD_BROWSER_MAX_TEXT_BYTES, true) &&
    textBytes(value) <= CLOUD_BROWSER_MAX_TEXT_BYTES;

  if (type === "pointer") {
    return (
      only("event", "nx", "ny", "button", "pointer_id") &&
      ["down", "move", "up", "cancel"].includes(
        String(payload.event),
      ) &&
      point() &&
      ["left", "middle", "right", ""].includes(
        String(payload.button || ""),
      ) &&
      positiveInteger(payload.pointer_id, 32) > 0
    );
  }
  if (type === "wheel") {
    return (
      only("nx", "ny", "dx", "dy") &&
      point() &&
      finiteNumber(payload.dx, -2_000, 2_000) &&
      finiteNumber(payload.dy, -2_000, 2_000)
    );
  }
  if (type === "key") {
    return (
      only("event", "key") &&
      ["press", "down", "up"].includes(String(payload.event)) &&
      boundedString(payload.key, 96)
    );
  }
  if (type === "text.commit") {
    return (
      only("text", "composition_id") &&
      boundedText(payload.text) &&
      boundedString(payload.composition_id, 160)
    );
  }
  if (
    type === "composition.start" ||
    type === "composition.update" ||
    type === "composition.end"
  ) {
    return (
      only("composition_id", "text") &&
      boundedString(payload.composition_id, 160) &&
      boundedText(payload.text)
    );
  }
  if (type === "focus") {
    return only("focused") && typeof payload.focused === "boolean";
  }
  if (type === "clipboard.paste") {
    return (
      only("text", "composition_id") &&
      boundedText(payload.text) &&
      boundedString(payload.composition_id, 160)
    );
  }
  if (type === "viewport.set") {
    return (
      only("width", "height", "dpr") &&
      positiveInteger(payload.width, MAX_FRAME_DIMENSION) >= 640 &&
      positiveInteger(payload.height, MAX_FRAME_DIMENSION) >= 480 &&
      finiteNumber(payload.dpr, 1, 2)
    );
  }
  if (type === "page.bookmark" || type === "checkpoint.create") {
    return keys.size === 0;
  }
  return false;
}
