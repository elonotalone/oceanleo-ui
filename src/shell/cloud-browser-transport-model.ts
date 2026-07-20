import type {
  CloudBrowserCapabilitiesV3,
  CloudBrowserControlLease,
  CloudBrowserFrameContractV3,
  CloudBrowserTransportState,
} from "../lib/browser";
import {
  normalizeCloudBrowserLease,
  validateCloudBrowserFrameMeta,
  type ValidatedCloudBrowserFrameMeta,
} from "./cloud-browser-live";
import { EMPTY_BROWSER_LEASE } from "./cloud-browser-transport-config";
import {
  CLOUD_BROWSER_MAX_CONTROL_BYTES,
  CLOUD_BROWSER_MAX_FRAME_BYTES,
  CLOUD_BROWSER_PROTOCOL_VERSION,
  type CloudBrowserWireBinding,
} from "./cloud-browser-wire";

export const CLOUD_BROWSER_LEGAL_TRANSITIONS: Readonly<
  Record<CloudBrowserTransportState, readonly CloudBrowserTransportState[]>
> = {
  idle: ["idle", "ticketing", "closed"],
  ticketing: ["ticketing", "ws_connecting", "reconnecting", "failed", "closed"],
  ws_connecting: [
    "ws_connecting",
    "authenticated",
    "reconnecting",
    "failed",
    "closed",
  ],
  authenticated: [
    "authenticated",
    "awaiting_first_frame",
    "reconnecting",
    "failed",
    "closed",
  ],
  awaiting_first_frame: [
    "awaiting_first_frame",
    "streaming",
    "reconnecting",
    "failed",
    "closed",
  ],
  streaming: [
    "streaming",
    "awaiting_first_frame",
    "reconnecting",
    "failed",
    "closed",
  ],
  reconnecting: [
    "reconnecting",
    "authenticated",
    "awaiting_first_frame",
    "failed",
    "closed",
  ],
  failed: ["failed", "ticketing", "reconnecting", "closed"],
  closed: ["closed", "ticketing"],
};

export function isCloudBrowserTransportTransitionLegal(
  current: CloudBrowserTransportState,
  next: CloudBrowserTransportState,
): boolean {
  return CLOUD_BROWSER_LEGAL_TRANSITIONS[current].includes(next);
}

export function reduceCloudBrowserTransportTransition(
  current: CloudBrowserTransportState,
  next: CloudBrowserTransportState,
): CloudBrowserTransportState {
  return isCloudBrowserTransportTransitionLegal(current, next)
    ? next
    : current;
}

export type CloudBrowserControlIntent = "acquire" | "release" | "";
export type CloudBrowserHelloTab = {
  id: string;
  title: string;
  status:
    | "opening"
    | "loading"
    | "ready"
    | "crashed"
    | "closing"
    | "closed";
};
export type CloudBrowserFailureKind =
  | "protocol_mismatch"
  | "ticket_expired"
  | "stale_stream"
  | "first_paint"
  | "connection"
  | "lease_lost"
  | null;

const EMPTY_CAPABILITIES: CloudBrowserCapabilitiesV3 = {
  page_bookmark: false,
  session_checkpoint: false,
  clipboard: false,
  ime_composition: false,
  viewport_resize: false,
};

export interface CloudBrowserProtocolState {
  transportState: CloudBrowserTransportState;
  protocol: 3 | null;
  handshake: boolean;
  socketSessionId: string;
  sessionVersion: number;
  runtimeId: string;
  runtimeVersion: string;
  incarnation: number;
  nonce: string;
  connectionId: string;
  streamId: string;
  streamGeneration: number;
  windowId: string;
  frameContract: CloudBrowserFrameContractV3 | null;
  capabilities: CloudBrowserCapabilitiesV3;
  tabs: CloudBrowserHelloTab[];
  helloFrameSequence: number;
  lastFrameSequence: number;
  lastActionSequence: number;
  lastCallbackSequence: number;
  lease: CloudBrowserControlLease;
  leaseOwned: boolean;
  controlPending: boolean;
  controlIntent: CloudBrowserControlIntent;
  pendingBinary: boolean;
  failureKind: CloudBrowserFailureKind;
}

export function createCloudBrowserProtocolState(
  input: Partial<CloudBrowserProtocolState> = {},
): CloudBrowserProtocolState {
  return {
    transportState: "idle",
    protocol: null,
    handshake: false,
    socketSessionId: "",
    sessionVersion: 0,
    runtimeId: "",
    runtimeVersion: "",
    incarnation: 0,
    nonce: "",
    connectionId: "",
    streamId: "",
    streamGeneration: 0,
    windowId: "",
    frameContract: null,
    capabilities: EMPTY_CAPABILITIES,
    tabs: [],
    helloFrameSequence: 0,
    lastFrameSequence: 0,
    lastActionSequence: 0,
    lastCallbackSequence: 0,
    lease: EMPTY_BROWSER_LEASE,
    leaseOwned: false,
    controlPending: false,
    controlIntent: "",
    pendingBinary: false,
    failureKind: null,
    ...input,
  };
}

export type CloudBrowserProtocolEffect =
  | {
      type: "reject";
      message: string;
      kind: Exclude<CloudBrowserFailureKind, "lease_lost" | null>;
    }
  | { type: "error"; message: string; kind?: CloudBrowserFailureKind }
  | { type: "clear_error" }
  | { type: "arm_first_frame" }
  | { type: "cancel_frame_decode" }
  | {
      type: "accept_frame_meta";
      meta: ValidatedCloudBrowserFrameMeta;
    }
  | { type: "refresh_checkpoints" };

export interface CloudBrowserProtocolFallbacks {
  runtimeFailed: string;
  operationFailed: string;
  protocolMismatch: string;
  staleStream: string;
  leaseLost: string;
}

export interface CloudBrowserProtocolReduction {
  state: CloudBrowserProtocolState;
  effects: CloudBrowserProtocolEffect[];
}

export type CloudBrowserMessageDecodeResult =
  | { ok: true; message: Record<string, unknown> }
  | {
      ok: false;
      reason: "invalid_json" | "invalid_shape" | "message_too_large";
    };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function decodeCloudBrowserProtocolMessage(
  raw: unknown,
): CloudBrowserMessageDecodeResult {
  let decoded = raw;
  if (typeof raw === "string") {
    if (byteLength(raw) > CLOUD_BROWSER_MAX_CONTROL_BYTES) {
      return { ok: false, reason: "message_too_large" };
    }
    try {
      decoded = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ok: false, reason: "invalid_shape" };
  }
  return {
    ok: true,
    message: decoded as Record<string, unknown>,
  };
}

function transition(
  state: CloudBrowserProtocolState,
  next: CloudBrowserTransportState,
): CloudBrowserProtocolState {
  return {
    ...state,
    transportState: reduceCloudBrowserTransportTransition(
      state.transportState,
      next,
    ),
  };
}

function reject(
  state: CloudBrowserProtocolState,
  message: string,
  kind: Exclude<CloudBrowserFailureKind, "lease_lost" | null>,
): CloudBrowserProtocolReduction {
  return {
    state: transition(
      {
        ...state,
        handshake: false,
        pendingBinary: false,
        leaseOwned: false,
        controlPending: false,
        controlIntent: "",
        failureKind: kind,
      },
      "failed",
    ),
    effects: [{ type: "reject", message, kind }],
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedString(
  value: unknown,
  maximum: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maximum &&
    (allowEmpty || value.length > 0)
  );
}

function safeInteger(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function strictFrameContract(
  actual: unknown,
): CloudBrowserFrameContractV3 | null {
  const value = recordValue(actual);
  if (
    !value ||
    !exactKeys(value, [
      "transport",
      "codec",
      "source",
      "max_frame_bytes",
      "max_width",
      "max_height",
    ]) ||
    value.transport !== "adjacent-binary" ||
    value.codec !== "image/jpeg" ||
    value.source !== "native-chrome-window" ||
    !safeInteger(
      value.max_frame_bytes,
      32 * 1024,
      CLOUD_BROWSER_MAX_FRAME_BYTES,
    ) ||
    !safeInteger(value.max_width, 640, 4_096) ||
    !safeInteger(value.max_height, 480, 4_096)
  ) {
    return null;
  }
  return value as unknown as CloudBrowserFrameContractV3;
}

function strictCapabilities(
  actual: unknown,
): CloudBrowserCapabilitiesV3 | null {
  const value = recordValue(actual);
  const keys = [
    "page_bookmark",
    "session_checkpoint",
    "clipboard",
    "ime_composition",
    "viewport_resize",
  ] as const;
  if (
    !value ||
    !exactKeys(value, [...keys]) ||
    !keys.every((key) => typeof value[key] === "boolean")
  ) {
    return null;
  }
  return value as unknown as CloudBrowserCapabilitiesV3;
}

function strictTabs(value: unknown): CloudBrowserHelloTab[] | null {
  if (!Array.isArray(value) || value.length > 128) return null;
  const tabs: CloudBrowserHelloTab[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const tab = recordValue(candidate);
    if (
      !tab ||
      !exactKeys(tab, ["id", "title", "status"]) ||
      !boundedString(tab.id, 160) ||
      !boundedString(tab.title, 512, true) ||
      ![
        "opening",
        "loading",
        "ready",
        "crashed",
        "closing",
        "closed",
      ].includes(String(tab.status)) ||
      ids.has(tab.id)
    ) {
      return null;
    }
    ids.add(tab.id);
    tabs.push(tab as unknown as CloudBrowserHelloTab);
  }
  return tabs;
}

function strictLease(value: unknown): CloudBrowserControlLease | null {
  const item = recordValue(value);
  if (
    !item ||
    !exactKeys(item, [
      "lease_id",
      "lease_epoch",
      "holder_kind",
      "holder_id",
      "connection_id",
      "expires_at",
      "privacy_mode",
    ]) ||
    !boundedString(item.lease_id, 160, true) ||
    !safeInteger(item.lease_epoch, 1) ||
    !["agent", "human", "free"].includes(String(item.holder_kind)) ||
    (item.holder_id !== undefined &&
      !boundedString(item.holder_id, 160)) ||
    (item.connection_id !== undefined &&
      !boundedString(item.connection_id, 160)) ||
    (item.expires_at !== undefined &&
      (!boundedString(item.expires_at, 64) ||
        !Number.isFinite(Date.parse(item.expires_at)))) ||
    (item.privacy_mode !== undefined &&
      typeof item.privacy_mode !== "boolean")
  ) {
    return null;
  }
  const free = item.holder_kind === "free";
  if (
    (free &&
      (item.lease_id !== "" ||
        item.holder_id !== undefined ||
        item.connection_id !== undefined ||
        item.expires_at !== undefined)) ||
    (!free &&
      (item.lease_id === "" ||
        !boundedString(item.connection_id, 160)))
  ) {
    return null;
  }
  return normalizeCloudBrowserLease(item);
}

function coherentLeaseTransition(
  previous: CloudBrowserControlLease,
  next: CloudBrowserControlLease,
): boolean {
  if (next.epoch < previous.epoch) return false;
  const identityChanged =
    next.leaseId !== previous.leaseId ||
    next.holderKind !== previous.holderKind ||
    next.holderId !== previous.holderId ||
    next.connectionId !== previous.connectionId;
  return !identityChanged || next.epoch > previous.epoch;
}

function bindingFromState(
  state: CloudBrowserProtocolState,
): CloudBrowserWireBinding {
  return {
    sessionId: state.socketSessionId,
    sessionVersion: state.sessionVersion,
    runtimeId: state.runtimeId,
    runtimeVersion: state.runtimeVersion,
    incarnation: state.incarnation,
    nonce: state.nonce,
    connectionId: state.connectionId,
    streamId: state.streamId,
    streamGeneration: state.streamGeneration,
    windowId: state.windowId,
  };
}

function bindingMatches(
  state: CloudBrowserProtocolState,
  message: Record<string, unknown>,
): boolean {
  return (
    message.v === CLOUD_BROWSER_PROTOCOL_VERSION &&
    message.session_id === state.socketSessionId &&
    message.session_version === state.sessionVersion &&
    message.runtime_id === state.runtimeId &&
    message.runtime_version === state.runtimeVersion &&
    message.incarnation === state.incarnation &&
    message.nonce === state.nonce &&
    message.connection_id === state.connectionId &&
    message.stream_id === state.streamId &&
    message.stream_generation === state.streamGeneration &&
    message.window_id === state.windowId
  );
}

const BINDING_KEYS = [
  "v",
  "t",
  "session_id",
  "session_version",
  "runtime_id",
  "runtime_version",
  "incarnation",
  "nonce",
  "connection_id",
  "stream_id",
  "stream_generation",
  "window_id",
];

function messageHasOnly(
  message: Record<string, unknown>,
  extra: readonly string[],
): boolean {
  return exactKeys(message, [...BINDING_KEYS, ...extra]);
}

function validActionSequence(
  state: CloudBrowserProtocolState,
  value: unknown,
): value is number {
  return safeInteger(value, 0) && value >= state.lastActionSequence;
}

function freshCallbackSequence(
  state: CloudBrowserProtocolState,
  value: unknown,
): value is number {
  return (
    safeInteger(value, 1) &&
    value > state.lastCallbackSequence
  );
}

export function reduceCloudBrowserProtocolMessage(
  current: CloudBrowserProtocolState,
  message: Record<string, unknown>,
  fallback: CloudBrowserProtocolFallbacks,
  now = Date.now(),
): CloudBrowserProtocolReduction {
  const effects: CloudBrowserProtocolEffect[] = [];
  const type = String(message.t || "");
  let state = current;

  if (type === "hello") {
    const windowEvidence = recordValue(message.window);
    const lease = strictLease(message.lease);
    const frameContract = strictFrameContract(message.frame_contract);
    const capabilities = strictCapabilities(message.capabilities);
    const tabs = strictTabs(message.tabs);
    if (
      !messageHasOnly(message, [
        "frame_contract",
        "capabilities",
        "window",
        "lease",
        "tabs",
        "action_sequence",
        "callback_sequence",
      ]) ||
      state.handshake ||
      state.runtimeVersion !== "" ||
      state.connectionId !== "" ||
      state.streamId !== "" ||
      state.streamGeneration !== 0 ||
      state.windowId !== "" ||
      state.frameContract !== null ||
      message.v !== CLOUD_BROWSER_PROTOCOL_VERSION ||
      message.session_id !== state.socketSessionId ||
      message.session_version !== state.sessionVersion ||
      message.runtime_id !== state.runtimeId ||
      !boundedString(message.runtime_version, 160) ||
      message.incarnation !== state.incarnation ||
      message.nonce !== state.nonce ||
      !boundedString(message.connection_id, 160) ||
      !boundedString(message.stream_id, 160) ||
      !safeInteger(message.stream_generation, 1) ||
      !boundedString(message.window_id, 160) ||
      !frameContract ||
      !capabilities ||
      !tabs ||
      !windowEvidence ||
      !exactKeys(windowEvidence, [
        "window_id",
        "app",
        "native_chrome",
        "maximized",
        "tab_strip",
        "omnibox",
        "width",
        "height",
        "native_band_height",
      ]) ||
      windowEvidence.window_id !== message.window_id ||
      windowEvidence.app !== "chromium" ||
      windowEvidence.native_chrome !== true ||
      windowEvidence.maximized !== true ||
      windowEvidence.tab_strip !== true ||
      windowEvidence.omnibox !== true ||
      !safeInteger(windowEvidence.width, 640, 4096) ||
      !safeInteger(windowEvidence.height, 480, 4096) ||
      !safeInteger(
        windowEvidence.native_band_height,
        1,
        Math.min(512, Number(windowEvidence.height) - 1),
      ) ||
      !lease ||
      !safeInteger(message.action_sequence, 0) ||
      !safeInteger(message.callback_sequence, 0)
    ) {
      return reject(
        state,
        fallback.protocolMismatch,
        "protocol_mismatch",
      );
    }
    const connectionId = message.connection_id as string;
    const owned =
      lease.holderKind === "human" &&
      lease.connectionId === connectionId;
    state = transition(
      {
        ...state,
        protocol: CLOUD_BROWSER_PROTOCOL_VERSION,
        handshake: true,
        runtimeVersion: message.runtime_version as string,
        connectionId,
        streamId: message.stream_id as string,
        streamGeneration: message.stream_generation as number,
        windowId: message.window_id as string,
        frameContract,
        capabilities,
        tabs,
        helloFrameSequence: 0,
        lastFrameSequence: 0,
        lastActionSequence: message.action_sequence as number,
        lastCallbackSequence: message.callback_sequence as number,
        lease,
        leaseOwned: owned,
        failureKind: null,
      },
      "awaiting_first_frame",
    );
    effects.push({ type: "arm_first_frame" }, { type: "clear_error" });
    return { state, effects };
  }

  if (!state.handshake || !bindingMatches(state, message)) {
    return reject(
      state,
      fallback.protocolMismatch,
      "protocol_mismatch",
    );
  }

  if (type === "frame.meta") {
    if (state.pendingBinary || !state.frameContract) {
      return reject(
        state,
        fallback.protocolMismatch,
        "protocol_mismatch",
      );
    }
    const validation = validateCloudBrowserFrameMeta(
      message,
      {
        binding: bindingFromState(state),
        contract: state.frameContract,
        afterSequence: state.lastFrameSequence,
        minimumActionSequence: state.lastActionSequence,
      },
      now,
    );
    if (!validation.ok) {
      const stale =
        validation.reason === "stale_sequence" ||
        validation.reason === "stale_action" ||
        validation.reason === "stale_capture" ||
        validation.reason === "binding_mismatch";
      return reject(
        state,
        stale ? fallback.staleStream : fallback.protocolMismatch,
        stale ? "stale_stream" : "protocol_mismatch",
      );
    }
    state = {
      ...state,
      pendingBinary: true,
      lastFrameSequence: validation.meta.sequence,
      lastActionSequence: Math.max(
        state.lastActionSequence,
        validation.meta.actionSequence,
      ),
    };
    effects.push({
      type: "accept_frame_meta",
      meta: validation.meta,
    });
    return { state, effects };
  }

  if (type === "control.state") {
    const lease = strictLease(message.lease);
    if (
      !messageHasOnly(message, [
        "lease",
        "action_sequence",
        "callback_sequence",
      ]) ||
      !lease ||
      !coherentLeaseTransition(state.lease, lease) ||
      !validActionSequence(state, message.action_sequence) ||
      !freshCallbackSequence(state, message.callback_sequence)
    ) {
      return reject(
        state,
        fallback.protocolMismatch,
        "protocol_mismatch",
      );
    }
    const owned =
      lease.holderKind === "human" &&
      lease.connectionId === state.connectionId;
    const expectedRelease =
      state.controlPending &&
      state.controlIntent === "release" &&
      lease.holderKind === "free" &&
      lease.leaseId === "";
    const lost =
      state.leaseOwned &&
      !expectedRelease &&
      (!owned ||
        lease.leaseId !== state.lease.leaseId ||
        lease.epoch !== state.lease.epoch);
    state = {
      ...state,
      lease,
      leaseOwned: owned,
      controlIntent: "",
      controlPending: false,
      lastActionSequence: message.action_sequence as number,
      lastCallbackSequence: message.callback_sequence as number,
      failureKind: lost ? "lease_lost" : state.failureKind,
    };
    if (lost) {
      effects.push({
        type: "error",
        message: fallback.leaseLost,
        kind: "lease_lost",
      });
    }
    return { state, effects };
  }

  if (type === "action.receipt") {
    if (
      !messageHasOnly(message, [
        "action_sequence",
        "client_event_id",
        "status",
        "code",
        "message",
        "callback_sequence",
      ]) ||
      !safeInteger(message.action_sequence, 1) ||
      !boundedString(message.client_event_id, 240) ||
      !["accepted", "rejected"].includes(String(message.status)) ||
      !freshCallbackSequence(state, message.callback_sequence) ||
      (message.code !== undefined &&
        !boundedString(message.code, 96, true)) ||
      (message.message !== undefined &&
        !boundedString(message.message, 1_000, true))
    ) {
      return reject(
        state,
        fallback.protocolMismatch,
        "protocol_mismatch",
      );
    }
    if ((message.action_sequence as number) <= state.lastActionSequence) {
      return { state, effects };
    }
    state = {
      ...state,
      lastActionSequence: message.action_sequence as number,
      lastCallbackSequence: message.callback_sequence as number,
    };
    if (message.status === "rejected") {
      effects.push({
        type: "error",
        message: String(message.message || fallback.operationFailed),
      });
    }
    return { state, effects };
  }

  if (type === "checkpoint.saved") {
    if (
      !messageHasOnly(message, [
        "checkpoint_id",
        "generation",
        "created_at",
        "page_title",
        "page_url",
        "state",
        "action_sequence",
        "callback_sequence",
      ]) ||
      !boundedString(message.checkpoint_id, 160) ||
      !safeInteger(message.generation, 1) ||
      !boundedString(message.created_at, 64) ||
      !Number.isFinite(Date.parse(message.created_at)) ||
      !boundedString(message.page_title, 512, true) ||
      !boundedString(message.page_url, 2_048, true) ||
      ![
        "ready",
        "warm",
        "hibernated",
        "restoring",
        "restored",
        "failed",
      ].includes(String(message.state)) ||
      !validActionSequence(state, message.action_sequence) ||
      !freshCallbackSequence(state, message.callback_sequence)
    ) {
      return reject(
        state,
        fallback.protocolMismatch,
        "protocol_mismatch",
      );
    }
    state = {
      ...state,
      lastActionSequence: message.action_sequence as number,
      lastCallbackSequence: message.callback_sequence as number,
    };
    return {
      state,
      effects: [{ type: "refresh_checkpoints" }],
    };
  }

  if (type === "page.bookmarked") {
    if (
      !messageHasOnly(message, [
        "page_title",
        "page_url",
        "action_sequence",
        "callback_sequence",
      ]) ||
      !boundedString(message.page_title, 512, true) ||
      !boundedString(message.page_url, 2_048) ||
      !validActionSequence(state, message.action_sequence) ||
      !freshCallbackSequence(state, message.callback_sequence)
    ) {
      return reject(
        state,
        fallback.protocolMismatch,
        "protocol_mismatch",
      );
    }
    return {
      state: {
        ...state,
        lastActionSequence: message.action_sequence as number,
        lastCallbackSequence: message.callback_sequence as number,
      },
      effects,
    };
  }

  if (type === "session.state") {
    if (
      !messageHasOnly(message, [
        "state",
        "reason",
        "action_sequence",
        "callback_sequence",
      ]) ||
      !["warm", "hibernated", "restoring", "restored", "failed"].includes(
        String(message.state),
      ) ||
      (message.reason !== undefined &&
        !boundedString(message.reason, 1_000, true)) ||
      !validActionSequence(state, message.action_sequence) ||
      !freshCallbackSequence(state, message.callback_sequence)
    ) {
      return reject(
        state,
        fallback.protocolMismatch,
        "protocol_mismatch",
      );
    }
    if (message.state === "failed") {
      return reject(
        state,
        String(message.reason || fallback.runtimeFailed),
        "connection",
      );
    }
    return {
      state: {
        ...state,
        lastActionSequence: message.action_sequence as number,
        lastCallbackSequence: message.callback_sequence as number,
      },
      effects,
    };
  }

  if (type === "error") {
    if (
      !messageHasOnly(message, [
        "code",
        "message",
        "action_sequence",
        "callback_sequence",
      ]) ||
      !boundedString(message.code, 96) ||
      !boundedString(message.message, 1_000) ||
      !validActionSequence(state, message.action_sequence) ||
      !freshCallbackSequence(state, message.callback_sequence)
    ) {
      return reject(
        state,
        fallback.protocolMismatch,
        "protocol_mismatch",
      );
    }
    const leaseLost = [
      "LEASE_NOT_HELD",
      "LEASE_EPOCH_STALE",
      "LEASE_LOST",
    ].includes(message.code as string);
    if (leaseLost) {
      state = {
        ...state,
        leaseOwned: false,
        controlPending: false,
        controlIntent: "",
        lastActionSequence: message.action_sequence as number,
        lastCallbackSequence: message.callback_sequence as number,
        failureKind: "lease_lost",
      };
    } else {
      state = {
        ...state,
        lastActionSequence: message.action_sequence as number,
        lastCallbackSequence: message.callback_sequence as number,
      };
    }
    effects.push({
      type: "error",
      message: leaseLost
        ? fallback.leaseLost
        : String(message.message || fallback.operationFailed),
      kind: leaseLost ? "lease_lost" : undefined,
    });
    return { state, effects };
  }

  return reject(
    state,
    fallback.protocolMismatch,
    "protocol_mismatch",
  );
}
