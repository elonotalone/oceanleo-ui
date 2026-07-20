import type {
  CloudBrowserControlLease,
  CloudBrowserTab,
  CloudBrowserTransportState,
} from "../lib/browser";
import {
  normalizeCloudBrowserLease,
  normalizeCloudBrowserTab,
  normalizeCloudBrowserTabs,
  parseCloudBrowserFrameMeta,
  redactedDisplayUrl,
} from "./cloud-browser-live";
import { EMPTY_BROWSER_LEASE } from "./cloud-browser-transport-config";

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
    "streaming",
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

export interface CloudBrowserProtocolState {
  transportState: CloudBrowserTransportState;
  protocol: 1 | 2 | null;
  handshake: boolean;
  socketSessionId: string;
  connectionId: string;
  runtimeId: string;
  incarnation: number;
  streamId: string;
  streamGeneration: number;
  activeTabId: string;
  tabs: CloudBrowserTab[];
  lease: CloudBrowserControlLease;
  leaseOwned: boolean;
  legacyDriving: boolean;
  controlPending: boolean;
  controlIntent: CloudBrowserControlIntent;
  address: string;
  dropNextBinary: boolean;
  pendingV2Binary: boolean;
}

export function createCloudBrowserProtocolState(
  input: Partial<CloudBrowserProtocolState> = {},
): CloudBrowserProtocolState {
  return {
    transportState: "idle",
    protocol: null,
    handshake: false,
    socketSessionId: "",
    connectionId: "",
    runtimeId: "",
    incarnation: 0,
    streamId: "",
    streamGeneration: 0,
    activeTabId: "",
    tabs: [],
    lease: EMPTY_BROWSER_LEASE,
    leaseOwned: false,
    legacyDriving: false,
    controlPending: false,
    controlIntent: "",
    address: "",
    dropNextBinary: false,
    pendingV2Binary: false,
    ...input,
  };
}

export type CloudBrowserProtocolEffect =
  | { type: "reject"; message: string }
  | { type: "error"; message: string }
  | { type: "clear_error" }
  | { type: "arm_first_frame" }
  | { type: "cancel_frame_decode" }
  | { type: "accept_frame_meta"; message: Record<string, unknown> }
  | {
      type: "draw_text_frame";
      data: string;
      message: Record<string, unknown>;
    }
  | { type: "refresh_events" };

export interface CloudBrowserProtocolFallbacks {
  runtimeFailed: string;
  navigationRejected: string;
  operationFailed: string;
}

export interface CloudBrowserProtocolReduction {
  state: CloudBrowserProtocolState;
  effects: CloudBrowserProtocolEffect[];
}

export type CloudBrowserMessageDecodeResult =
  | { ok: true; message: Record<string, unknown> }
  | { ok: false; reason: "invalid_json" | "invalid_shape" };

export function decodeCloudBrowserProtocolMessage(
  raw: unknown,
): CloudBrowserMessageDecodeResult {
  let decoded = raw;
  if (typeof raw === "string") {
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
): CloudBrowserProtocolReduction {
  return {
    state: transition(
      {
        ...state,
        handshake: false,
        pendingV2Binary: false,
        dropNextBinary: false,
      },
      "failed",
    ),
    effects: [{ type: "reject", message }],
  };
}

function adoptLegacy(
  state: CloudBrowserProtocolState,
  effects: CloudBrowserProtocolEffect[],
): CloudBrowserProtocolState {
  if (state.protocol === 2) return state;
  let next: CloudBrowserProtocolState = {
    ...state,
    protocol: 1,
    handshake: true,
  };
  if (next.transportState !== "streaming") {
    next = transition(next, "awaiting_first_frame");
    effects.push({ type: "arm_first_frame" });
  }
  return next;
}

function expectedStream(
  state: CloudBrowserProtocolState,
  message: Record<string, unknown>,
  effects: CloudBrowserProtocolEffect[],
): CloudBrowserProtocolState {
  effects.push({ type: "arm_first_frame" });
  return transition(
    {
      ...state,
      streamId: String(message.stream_id || ""),
      streamGeneration: Number(
        message.stream_generation || message.generation || 0,
      ),
    },
    "awaiting_first_frame",
  );
}

function upsertTab(
  current: readonly CloudBrowserTab[],
  tab: CloudBrowserTab,
): CloudBrowserTab[] {
  const index = current.findIndex((item) => item.id === tab.id);
  if (index < 0) return [...current, tab];
  const next = [...current];
  next[index] = {
    ...next[index],
    ...tab,
    title: tab.title || next[index].title,
    displayUrl: tab.displayUrl || next[index].displayUrl,
    faviconUrl: tab.faviconUrl || next[index].faviconUrl,
  };
  return next;
}

function updateActiveTab(
  state: CloudBrowserProtocolState,
  patch: Partial<Omit<CloudBrowserTab, "id">>,
): CloudBrowserProtocolState {
  if (!state.activeTabId) return state;
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === state.activeTabId
        ? {
            ...tab,
            ...patch,
            displayUrl: patch.displayUrl ?? tab.displayUrl,
          }
        : tab,
    ),
  };
}

export function reduceCloudBrowserProtocolMessage(
  current: CloudBrowserProtocolState,
  message: Record<string, unknown>,
  fallback: CloudBrowserProtocolFallbacks,
): CloudBrowserProtocolReduction {
  const effects: CloudBrowserProtocolEffect[] = [];
  const type = String(message.t || message.type || "");
  const isV2 = message.v === 2 || type.includes(".");
  let state = current;

  if (type === "hello") {
    const sessionId = String(message.session_id || "");
    const runtimeId = String(message.runtime_id || "");
    const incarnation = Number(message.incarnation || 0);
    const connectionId = String(message.connection_id || "");
    if (
      message.v !== 2 ||
      !sessionId ||
      sessionId !== state.socketSessionId ||
      !runtimeId ||
      (state.runtimeId && runtimeId !== state.runtimeId) ||
      !Number.isInteger(incarnation) ||
      incarnation <= 0 ||
      (state.incarnation && incarnation !== state.incarnation) ||
      !connectionId
    ) {
      return reject(state, fallback.runtimeFailed);
    }
    const tabs = normalizeCloudBrowserTabs(message.tabs);
    const activeTabId = String(
      message.active_tab_id ||
        tabs.find((tab) => tab.status !== "closed")?.id ||
        "",
    );
    const lease = normalizeCloudBrowserLease(message.lease || message.control);
    state = transition(
      {
        ...state,
        protocol: 2,
        handshake: true,
        connectionId,
        runtimeId,
        incarnation,
        streamId: String(message.stream_id || ""),
        streamGeneration: Number(
          message.stream_generation || message.generation || 0,
        ),
        tabs,
        activeTabId,
        lease,
        leaseOwned:
          lease.holderKind === "human" &&
          Boolean(lease.connectionId && lease.connectionId === connectionId),
      },
      "awaiting_first_frame",
    );
    effects.push({ type: "arm_first_frame" }, { type: "clear_error" });
    return { state, effects };
  }

  if (
    message.v === 2 &&
    !(type === "error" && !state.handshake) &&
    (!state.handshake ||
      String(message.session_id || "") !== state.socketSessionId ||
      String(message.runtime_id || "") !== state.runtimeId ||
      Number(message.incarnation || 0) !== state.incarnation ||
      String(message.connection_id || "") !== state.connectionId)
  ) {
    return reject(state, fallback.runtimeFailed);
  }

  if (type === "frame.meta" || type === "frame-meta") {
    if (type === "frame-meta" && state.protocol === 2) {
      return { state, effects };
    }
    if (isV2 && !state.handshake) {
      return { state: { ...state, dropNextBinary: true }, effects };
    }
    if (!isV2) state = adoptLegacy(state, effects);
    const meta = parseCloudBrowserFrameMeta(message);
    const staleStream =
      state.protocol === 2 &&
      Boolean(
        state.streamId &&
          meta.streamId &&
          meta.streamId !== state.streamId &&
          (!meta.generation || meta.generation <= state.streamGeneration),
      );
    const staleGeneration =
      state.protocol === 2 &&
      Boolean(
        meta.generation &&
          state.streamGeneration &&
          meta.generation < state.streamGeneration,
      );
    const wrongRuntime =
      (meta.runtimeId && state.runtimeId && meta.runtimeId !== state.runtimeId) ||
      (meta.incarnation &&
        state.incarnation &&
        meta.incarnation !== state.incarnation) ||
      (meta.tabId && state.activeTabId && meta.tabId !== state.activeTabId);
    if (state.protocol === 2 && (staleStream || staleGeneration || wrongRuntime)) {
      return {
        state: { ...state, dropNextBinary: true, pendingV2Binary: false },
        effects,
      };
    }
    const streamChanged =
      Boolean(meta.streamId && meta.streamId !== state.streamId) ||
      Boolean(
        meta.generation && meta.generation > state.streamGeneration,
      );
    if (streamChanged) {
      state = transition(
        {
          ...state,
          streamId: meta.streamId || state.streamId,
          streamGeneration: meta.generation || state.streamGeneration,
        },
        "awaiting_first_frame",
      );
      effects.push(
        { type: "cancel_frame_decode" },
        { type: "arm_first_frame" },
      );
    }
    effects.push({ type: "accept_frame_meta", message });
    return {
      state: { ...state, pendingV2Binary: state.protocol === 2 },
      effects,
    };
  }

  if (type === "frame" && message.data) {
    if (isV2 && !state.handshake) return { state, effects };
    if (!isV2) state = adoptLegacy(state, effects);
    effects.push({
      type: "draw_text_frame",
      data: String(message.data),
      message,
    });
    return { state, effects };
  }

  if (type === "tabs.snapshot") {
    const tabs = normalizeCloudBrowserTabs(message.tabs || message.items);
    state = {
      ...state,
      tabs,
      activeTabId: String(
        message.active_tab_id ||
          tabs.find((tab) => tab.id === state.activeTabId)?.id ||
          tabs[0]?.id ||
          "",
      ),
    };
    if (message.stream_id) state = expectedStream(state, message, effects);
    return { state, effects };
  }

  if (
    type === "tab.opened" ||
    type === "tab.updated" ||
    type === "tab.activated"
  ) {
    const tab = normalizeCloudBrowserTab(message.tab || message);
    if (tab) state = { ...state, tabs: upsertTab(state.tabs, tab) };
    const activate =
      type === "tab.activated" ||
      message.active === true ||
      message.active_tab_id === tab?.id;
    if (activate && tab) {
      state = expectedStream(
        { ...state, activeTabId: tab.id },
        message,
        effects,
      );
    }
    return { state, effects };
  }

  if (type === "tab.closed") {
    state = {
      ...state,
      tabs: state.tabs.filter(
        (tab) => tab.id !== String(message.tab_id || ""),
      ),
    };
    const activeTabId = String(message.active_tab_id || "");
    if (activeTabId) {
      state = expectedStream(
        { ...state, activeTabId },
        message,
        effects,
      );
    }
    return { state, effects };
  }

  if (type === "control.state") {
    const lease = normalizeCloudBrowserLease(message.lease || message);
    const owned =
      lease.holderKind === "human" &&
      Boolean(
        (lease.connectionId && lease.connectionId === state.connectionId) ||
          (!lease.connectionId && state.controlIntent === "acquire"),
      );
    return {
      state: {
        ...state,
        lease,
        leaseOwned: owned,
        controlIntent: "",
        controlPending: false,
      },
      effects,
    };
  }

  if (type === "lock") {
    if (state.protocol === 2) return { state, effects };
    state = adoptLegacy(state, effects);
    return {
      state: {
        ...state,
        legacyDriving: message.driving === "human",
        controlPending: false,
      },
      effects,
    };
  }

  if (type === "meta") {
    if (state.protocol === 2) return { state, effects };
    state = adoptLegacy(state, effects);
    const address = redactedDisplayUrl(String(message.url || ""));
    const id = `legacy:${state.socketSessionId}`;
    return {
      state: {
        ...state,
        address,
        tabs: [
          {
            id,
            title: String(message.title || ""),
            displayUrl: address,
            status: "ready",
          },
        ],
        activeTabId: id,
      },
      effects,
    };
  }

  if (type === "navigation") {
    const failed =
      message.ok === false ||
      message.state === "failed" ||
      message.status === "failed";
    if (failed) {
      effects.push({
        type: "error",
        message: String(
          message.message || message.msg || fallback.navigationRejected,
        ),
      });
      return { state, effects };
    }
    const address = redactedDisplayUrl(
      String(message.display_url || message.url || ""),
    );
    const loading =
      message.state === "started" || message.status === "started";
    if (loading) {
      state = transition(state, "awaiting_first_frame");
      effects.push({ type: "arm_first_frame" });
    }
    if (message.stream_id) {
      state = expectedStream(state, message, effects);
      effects.push({ type: "cancel_frame_decode" });
    }
    state = updateActiveTab(
      { ...state, address: address || state.address },
      {
        displayUrl: address || undefined,
        title: typeof message.title === "string" ? message.title : undefined,
        status: loading ? "loading" : "ready",
      },
    );
    if (!loading) effects.push({ type: "clear_error" });
    return { state, effects };
  }

  if (type === "history.saved") {
    return { state, effects: [{ type: "refresh_events" }] };
  }

  if (type === "checkpoint.saved") return { state, effects };

  if (type === "session.state") {
    const failed =
      message.state === "failed" ||
      message.durable_state === "failed" ||
      message.runtime_state === "dead" ||
      message.live_state === "failed";
    if (failed) {
      effects.push({
        type: "error",
        message: String(message.reason || fallback.runtimeFailed),
      });
      return { state: transition(state, "failed"), effects };
    }
    if (
      message.live_state === "awaiting_first_frame" &&
      state.transportState !== "streaming"
    ) {
      effects.push({ type: "arm_first_frame" });
      return {
        state: transition(state, "awaiting_first_frame"),
        effects,
      };
    }
    return { state, effects };
  }

  if (type === "error" || type === "warn") {
    if (String(message.code || "") === "LEASE_NOT_HELD") {
      state = {
        ...state,
        lease: { ...state.lease, holderKind: "free" },
        leaseOwned: false,
        controlPending: false,
      };
    }
    effects.push({
      type: "error",
      message: String(message.message || message.msg || fallback.operationFailed),
    });
  }
  return { state, effects };
}
