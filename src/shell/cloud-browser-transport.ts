"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import {
  cloudBrowserLiveUrl,
  createCloudBrowserTicket,
  type CloudBrowserCapabilitiesV3,
  type CloudBrowserControlLease,
  type CloudBrowserFrameContractV3,
  type CloudBrowserTransportState,
} from "../lib/browser";
import {
  useCloudBrowserFramePainter,
  type ValidatedCloudBrowserFrameMeta,
} from "./cloud-browser-live";
import {
  handleCloudBrowserProtocolMessage,
  type CloudBrowserProtocolContext,
} from "./cloud-browser-protocol";
import {
  CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS,
  createCloudBrowserTransportActions,
} from "./cloud-browser-transport-actions";
import {
  EMPTY_BROWSER_LEASE,
  FIRST_FRAME_TIMEOUT_MS,
  LIVE_RECONNECT_BASE_MS,
  MAX_LIVE_RECONNECTS,
  type CloudBrowserTransportOptions,
} from "./cloud-browser-transport-config";
import {
  decodeCloudBrowserProtocolMessage,
  planCloudBrowserLiveRecovery,
  reduceCloudBrowserTransportTransition,
  type CloudBrowserFailureKind,
  type CloudBrowserHelloTab,
  type CloudBrowserProtocolDiagnostic,
} from "./cloud-browser-transport-model";
import {
  CLOUD_BROWSER_MAX_CONTROL_BYTES,
  canSendCloudBrowserControlMutation,
  cloudBrowserAuthMessage,
  cloudBrowserV3FrameReceipt,
  cloudBrowserV3Message,
  isAuthoritativeCloudBrowserHumanLease,
  validateCloudBrowserMutation,
  type CloudBrowserWireBinding,
} from "./cloud-browser-wire";

const EMPTY_CAPABILITIES: CloudBrowserCapabilitiesV3 = {
  page_bookmark: false,
  session_checkpoint: false,
  clipboard: false,
  ime_composition: false,
  viewport_resize: false,
};
const MAX_SOCKET_BUFFER_BYTES = 256 * 1024;
const MAX_SENT_EVENT_IDS = 256;
const LIVE_HEARTBEAT_MS = 15_000;
const REUSABLE_LIVE_STATES: ReadonlySet<CloudBrowserTransportState> =
  new Set([
    "ticketing",
    "ws_connecting",
    "authenticated",
    "awaiting_first_frame",
    "streaming",
    "reconnecting",
  ]);

export function useCloudBrowserTransport({
  selectedId,
  liveRequested,
  setLiveRequested,
  scopeKey,
  tt,
  setBusy,
  setError,
  refreshCheckpoints,
}: CloudBrowserTransportOptions) {
  const [transportState, setTransportState] =
    useState<CloudBrowserTransportState>("idle");
  const [protocol, setProtocol] = useState<3 | null>(null);
  const [capabilities, setCapabilitiesState] =
    useState<CloudBrowserCapabilitiesV3>(EMPTY_CAPABILITIES);
  const [lease, setLease] =
    useState<CloudBrowserControlLease>(EMPTY_BROWSER_LEASE);
  const [leaseOwned, setLeaseOwned] = useState(false);
  const [controlPending, setControlPendingState] = useState(false);
  const [controlIntentSent, setControlIntentSentState] = useState(false);
  const [hasCanvasFrame, setHasCanvasFrame] = useState(false);
  const [failureKind, setFailureKindState] =
    useState<CloudBrowserFailureKind>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const socketSessionRef = useRef("");
  const socketGenerationRef = useRef(0);
  const connectAttemptSerialRef = useRef(0);
  const activeConnectAttemptRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const liveRecoveryAttemptsRef = useRef(0);
  const liveRecoveryAttemptSerialRef = useRef(0);
  const liveRecoveryAttemptRef = useRef<{
    token: number;
    sessionId: string;
    generation: number;
  } | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const waitingForOnlineRef = useRef(false);
  const firstFrameTimerRef = useRef<number | null>(null);
  const takeoverTimeoutRef = useRef<number | null>(null);
  const liveRequestedRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  const selectedPropRef = useRef(selectedId);
  const scopeRef = useRef(scopeKey);
  const transportStateRef =
    useRef<CloudBrowserTransportState>("idle");
  const protocolRef = useRef<3 | null>(null);
  const handshakeRef = useRef(false);
  const sessionVersionRef = useRef(0);
  const runtimeIdRef = useRef("");
  const runtimeVersionRef = useRef("");
  const incarnationRef = useRef(0);
  const nonceRef = useRef("");
  const connectionIdRef = useRef("");
  const streamIdRef = useRef("");
  const streamGenerationRef = useRef(0);
  const windowIdRef = useRef("");
  const frameContractRef =
    useRef<CloudBrowserFrameContractV3 | null>(null);
  const capabilitiesRef =
    useRef<CloudBrowserCapabilitiesV3>(EMPTY_CAPABILITIES);
  const tabsRef = useRef<CloudBrowserHelloTab[]>([]);
  const helloFrameSequenceRef = useRef(0);
  const lastFrameSequenceRef = useRef(0);
  const lastActionSequenceRef = useRef(0);
  const lastCallbackSequenceRef = useRef(0);
  const clientActionSequenceRef = useRef(0);
  const leaseRef = useRef<CloudBrowserControlLease>(EMPTY_BROWSER_LEASE);
  const leaseOwnedRef = useRef(false);
  const controlIntentRef = useRef<"acquire" | "release" | "">("");
  const controlIntentSentRef = useRef(false);
  const controlPendingRef = useRef(false);
  const pendingBinaryRef = useRef(false);
  const failureKindRef = useRef<CloudBrowserFailureKind>(null);
  const fenceSerialRef = useRef(0);
  const sentEventIdsRef = useRef(new Set<string>());
  const lastDiagnosticRef =
    useRef<CloudBrowserProtocolDiagnostic | null>(null);
  const cancelFrameDecodeRef =
    useRef<
      (
        clearCanvas?: boolean,
        preservePendingMeta?: boolean,
        notifyDropped?: boolean,
      ) => void
    >(() => {});
  const scheduleLiveRecoveryRef = useRef<
    (kind: Exclude<CloudBrowserFailureKind, null>) => boolean
  >(() => false);
  const recoverConnectionRef = useRef<
    (
      reason: string,
      kind?: Exclude<CloudBrowserFailureKind, null>,
      immediate?: boolean,
    ) => void
  >(() => {});
  const reconcileControlIntentRef = useRef<() => void>(() => {});

  const clearTakeoverTimeout = useCallback(() => {
    if (takeoverTimeoutRef.current === null) return;
    window.clearTimeout(takeoverTimeoutRef.current);
    takeoverTimeoutRef.current = null;
  }, []);

  const setControlPending = useCallback(
    (value: SetStateAction<boolean>) => {
      const current = controlPendingRef.current;
      const next =
        typeof value === "function" ? value(current) : value;
      if (!next) clearTakeoverTimeout();
      controlPendingRef.current = next;
      setControlPendingState(next);
    },
    [clearTakeoverTimeout],
  );

  const setControlIntentSent = useCallback(
    (next: boolean) => {
      if (!next) clearTakeoverTimeout();
      controlIntentSentRef.current = next;
      setControlIntentSentState(next);
    },
    [clearTakeoverTimeout],
  );

  const setCapabilities = useCallback(
    (value: SetStateAction<CloudBrowserCapabilitiesV3>) => {
      setCapabilitiesState((current) => {
        const next =
          typeof value === "function" ? value(current) : value;
        capabilitiesRef.current = next;
        return next;
      });
    },
    [],
  );

  const setFailureKind = useCallback(
    (kind: CloudBrowserFailureKind) => {
      failureKindRef.current = kind;
      setFailureKindState(kind);
    },
    [],
  );

  const transition = useCallback((next: CloudBrowserTransportState) => {
    const legal = reduceCloudBrowserTransportTransition(
      transportStateRef.current,
      next,
    );
    transportStateRef.current = legal;
    setTransportState(legal);
  }, []);

  const setProtocolVersion = useCallback((next: 3 | null) => {
    protocolRef.current = next;
    setProtocol(next);
  }, []);

  const setCurrentLease = useCallback(
    (next: CloudBrowserControlLease, owned: boolean) => {
      const previous = leaseRef.current;
      const authoritativeOwned =
        owned &&
        isAuthoritativeCloudBrowserHumanLease(
          next,
          connectionIdRef.current,
        );
      if (
        previous.leaseId !== next.leaseId ||
        previous.epoch !== next.epoch ||
        previous.connectionId !== next.connectionId ||
        leaseOwnedRef.current !== authoritativeOwned
      ) {
        ++fenceSerialRef.current;
      }
      leaseRef.current = next;
      leaseOwnedRef.current = authoritativeOwned;
      setLease(next);
      setLeaseOwned(authoritativeOwned);
    },
    [],
  );

  const clearFirstFrameTimeout = useCallback(() => {
    if (firstFrameTimerRef.current === null) return;
    window.clearTimeout(firstFrameTimerRef.current);
    firstFrameTimerRef.current = null;
  }, []);

  const prepareControlIntentForReconnect = useCallback(() => {
    const preserveTakeover =
      controlIntentRef.current === "acquire" ||
      leaseOwnedRef.current;
    controlIntentRef.current = preserveTakeover ? "acquire" : "";
    setControlIntentSent(false);
    setControlPending(preserveTakeover);
  }, [setControlPending]);

  const currentBinding = useCallback(
    (): CloudBrowserWireBinding => ({
      sessionId: socketSessionRef.current,
      sessionVersion: sessionVersionRef.current,
      runtimeId: runtimeIdRef.current,
      runtimeVersion: runtimeVersionRef.current,
      incarnation: incarnationRef.current,
      nonce: nonceRef.current,
      connectionId: connectionIdRef.current,
      streamId: streamIdRef.current,
      streamGeneration: streamGenerationRef.current,
      windowId: windowIdRef.current,
    }),
    [],
  );

  const currentFence = useCallback(
    () =>
      [
        socketGenerationRef.current,
        fenceSerialRef.current,
        socketSessionRef.current,
        sessionVersionRef.current,
        runtimeIdRef.current,
        runtimeVersionRef.current,
        incarnationRef.current,
        nonceRef.current,
        connectionIdRef.current,
        streamIdRef.current,
        streamGenerationRef.current,
        windowIdRef.current,
        leaseRef.current.leaseId,
        leaseRef.current.epoch,
      ].join(":"),
    [],
  );

  const sendRaw = useCallback(
    (
      message: Record<string, unknown>,
      expectedFence?: string,
    ): boolean => {
      const socket = socketRef.current;
      if (
        socket?.readyState !== WebSocket.OPEN ||
        socketSessionRef.current !== selectedIdRef.current ||
        (expectedFence !== undefined &&
          expectedFence !== currentFence()) ||
        socket.bufferedAmount > MAX_SOCKET_BUFFER_BYTES
      ) {
        return false;
      }
      try {
        const encoded = JSON.stringify(message);
        if (
          new TextEncoder().encode(encoded).byteLength >
          CLOUD_BROWSER_MAX_CONTROL_BYTES
        ) {
          return false;
        }
        socket.send(encoded);
        return true;
      } catch {
        // Inputs are never queued, retried, or replayed after reconnect.
        return false;
      }
    },
    [currentFence],
  );

  const v3Envelope = useCallback(
    (
      type: string,
      payload: Record<string, unknown> = {},
    ) => cloudBrowserV3Message(currentBinding(), type, payload),
    [currentBinding],
  );

  function nextActionIdentity() {
    const actionSequence =
      Math.max(
        clientActionSequenceRef.current,
        lastActionSequenceRef.current,
      ) + 1;
    clientActionSequenceRef.current = actionSequence;
    const clientEventId = [
      connectionIdRef.current,
      leaseRef.current.epoch,
      actionSequence,
    ].join(".");
    return { actionSequence, clientEventId };
  }

  function rememberSentEvent(clientEventId: string) {
    sentEventIdsRef.current.add(clientEventId);
    if (sentEventIdsRef.current.size > MAX_SENT_EVENT_IDS) {
      const oldest = sentEventIdsRef.current.values().next().value;
      if (oldest) sentEventIdsRef.current.delete(oldest);
    }
  }

  const sendMutation = useCallback(
    (
      type: string,
      payload: Record<string, unknown> = {},
    ): boolean => {
      if (
        protocolRef.current !== 3 ||
        !handshakeRef.current ||
        transportStateRef.current !== "streaming" ||
        !leaseOwnedRef.current ||
        !leaseRef.current.leaseId ||
        leaseRef.current.epoch <= 0 ||
        leaseRef.current.connectionId !== connectionIdRef.current ||
        !validateCloudBrowserMutation(type, payload)
      ) {
        return false;
      }
      const fence = currentFence();
      const { actionSequence, clientEventId } = nextActionIdentity();
      if (sentEventIdsRef.current.has(clientEventId)) return false;
      const message = v3Envelope(type, {
        ...payload,
        lease_id: leaseRef.current.leaseId,
        lease_epoch: leaseRef.current.epoch,
        action_sequence: actionSequence,
        client_event_id: clientEventId,
      });
      if (fence !== currentFence() || !sendRaw(message, fence)) {
        return false;
      }
      rememberSentEvent(clientEventId);
      return true;
    },
    [currentFence, sendRaw, v3Envelope],
  );

  const sendControlMutation = useCallback(
    (
      type: "control.acquire" | "control.release" | "control.renew",
      requireOwned: boolean,
    ): boolean => {
      const currentLease = leaseRef.current;
      if (
        protocolRef.current !== 3 ||
        !handshakeRef.current ||
        transportStateRef.current !== "streaming" ||
        requireOwned !== (type !== "control.acquire") ||
        !canSendCloudBrowserControlMutation(
          type,
          currentLease,
          leaseOwnedRef.current,
          connectionIdRef.current,
        )
      ) {
        return false;
      }
      const fence = currentFence();
      const { actionSequence, clientEventId } = nextActionIdentity();
      const message = v3Envelope(type, {
        lease_id: currentLease.leaseId,
        lease_epoch: currentLease.epoch,
        action_sequence: actionSequence,
        client_event_id: clientEventId,
        ...(type === "control.acquire"
          ? { holder_kind: "human" }
          : {}),
      });
      if (fence !== currentFence() || !sendRaw(message, fence)) {
        return false;
      }
      rememberSentEvent(clientEventId);
      return true;
    },
    [currentFence, sendRaw, v3Envelope],
  );

  const armTakeoverTimeout = useCallback(() => {
    clearTakeoverTimeout();
    const generation = socketGenerationRef.current;
    const connectionId = connectionIdRef.current;
    takeoverTimeoutRef.current = window.setTimeout(() => {
      takeoverTimeoutRef.current = null;
      if (
        generation !== socketGenerationRef.current ||
        connectionId !== connectionIdRef.current ||
        controlIntentRef.current !== "acquire" ||
        !controlIntentSentRef.current ||
        !controlPendingRef.current ||
        leaseOwnedRef.current
      ) {
        return;
      }
      // Never leave a timed-out acquire live on its old socket. Clearing the
      // intent before reconnect prevents the sent mutation from being replayed
      // while gateway cleanup releases any grant that raced the timeout.
      controlIntentRef.current = "";
      setControlIntentSent(false);
      setControlPending(false);
      recoverConnectionRef.current(
        tt("实时浏览器连接失败"),
        "connection",
      );
    }, CLOUD_BROWSER_TAKEOVER_TIMEOUT_MS);
  }, [
    clearTakeoverTimeout,
    setControlIntentSent,
    setControlPending,
    tt,
  ]);

  const reconcileControlIntent = useCallback(() => {
    if (controlIntentRef.current !== "acquire") return;
    if (
      leaseOwnedRef.current &&
      leaseRef.current.connectionId === connectionIdRef.current
    ) {
      controlIntentRef.current = "";
      setControlIntentSent(false);
      setControlPending(false);
      if (failureKindRef.current === "lease_lost") {
        setFailureKind(null);
        setError("");
      }
      return;
    }
    if (
      controlIntentSentRef.current ||
      protocolRef.current !== 3 ||
      !handshakeRef.current ||
      transportStateRef.current !== "streaming"
    ) {
      return;
    }
    if (
      !canSendCloudBrowserControlMutation(
        "control.acquire",
        leaseRef.current,
        leaseOwnedRef.current,
        connectionIdRef.current,
      )
    ) {
      return;
    }
    if (sendControlMutation("control.acquire", false)) {
      setControlIntentSent(true);
      setControlPending(true);
      armTakeoverTimeout();
      return;
    }
    recoverConnectionRef.current(
      tt("实时浏览器连接失败"),
      "connection",
    );
  }, [
    armTakeoverTimeout,
    sendControlMutation,
    setControlPending,
    setError,
    setFailureKind,
    tt,
  ]);
  reconcileControlIntentRef.current = reconcileControlIntent;

  const requestControlIntent = useCallback(
    (intent: "acquire" | "release") => {
      controlIntentRef.current = intent;
      setControlIntentSent(false);
      setControlPending(true);
      if (intent === "acquire") {
        reconcileControlIntentRef.current();
        return;
      }
      if (
        transportStateRef.current === "streaming" &&
        leaseOwnedRef.current &&
        sendControlMutation("control.release", true)
      ) {
        setControlIntentSent(true);
        return;
      }
      controlIntentRef.current = "";
      setControlIntentSent(false);
      setControlPending(false);
      recoverConnectionRef.current(
        tt("实时浏览器连接失败"),
        "connection",
      );
    },
    [sendControlMutation, setControlPending, tt],
  );

  const armFirstFrameTimeout = useCallback(() => {
    clearFirstFrameTimeout();
    const generation = socketGenerationRef.current;
    const expectedStream = streamIdRef.current;
    firstFrameTimerRef.current = window.setTimeout(() => {
      firstFrameTimerRef.current = null;
      if (
        generation !== socketGenerationRef.current ||
        transportStateRef.current !== "awaiting_first_frame" ||
        expectedStream !== streamIdRef.current
      ) {
        return;
      }
      const socket = socketRef.current;
      socketRef.current = null;
      handshakeRef.current = false;
      pendingBinaryRef.current = false;
      cancelFrameDecodeRef.current(false);
      try {
        socket?.close(4000, "validated first paint timeout");
      } catch {
        // A retry always creates a fresh one-use ticket and connection.
      }
      prepareControlIntentForReconnect();
      setCurrentLease(EMPTY_BROWSER_LEASE, false);
      if (scheduleLiveRecoveryRef.current("first_paint")) {
        setFailureKind(null);
        setError("");
        return;
      }
      liveRequestedRef.current = false;
      controlIntentRef.current = "";
      setControlIntentSent(false);
      setControlPending(false);
      setFailureKind("first_paint");
      transition("failed");
      setError(tt("启动超时：原生 Chrome 画面未就绪，请重试"));
    }, FIRST_FRAME_TIMEOUT_MS);
  }, [
    clearFirstFrameTimeout,
    prepareControlIntentForReconnect,
    setControlPending,
    setCurrentLease,
    setError,
    setFailureKind,
    transition,
    tt,
  ]);

  const rejectProtocol = useCallback(
    (
      message: string,
      kind: Exclude<CloudBrowserFailureKind, "lease_lost" | null>,
    ) => {
      handshakeRef.current = false;
      pendingBinaryRef.current = false;
      clearFirstFrameTimeout();
      cancelFrameDecodeRef.current(false);
      prepareControlIntentForReconnect();
      setCurrentLease(EMPTY_BROWSER_LEASE, false);
      const socket = socketRef.current;
      socketRef.current = null;
      try {
        socket?.close(1008, "v3 protocol rejected");
      } catch {
        // The failed state is already final for this connection.
      }
      if (scheduleLiveRecoveryRef.current(kind)) {
        setFailureKind(null);
        setError("");
        return;
      }
      liveRequestedRef.current = false;
      controlIntentRef.current = "";
      setControlIntentSent(false);
      setControlPending(false);
      setFailureKind(kind);
      transition("failed");
      setError(message);
    },
    [
      clearFirstFrameTimeout,
      prepareControlIntentForReconnect,
      setControlPending,
      setCurrentLease,
      setError,
      setFailureKind,
      transition,
    ],
  );

  const {
    canvasRef,
    frameSizeRef,
    cancelFrameDecode,
    acceptFrameMeta,
    drawBlobFrame,
  } = useCloudBrowserFramePainter({
    onReceived: handleFrameReceived,
    onPresented: handleFramePresented,
    onDropped: handleFrameDropped,
    onDecodeError: handleFrameDecodeError,
  });
  cancelFrameDecodeRef.current = cancelFrameDecode;

  const protocolContext = useCallback(
    (): CloudBrowserProtocolContext => ({
      tt,
      protocolRef,
      handshakeRef,
      socketSessionRef,
      sessionVersionRef,
      runtimeIdRef,
      runtimeVersionRef,
      incarnationRef,
      nonceRef,
      connectionIdRef,
      streamIdRef,
      streamGenerationRef,
      windowIdRef,
      frameContractRef,
      capabilitiesRef,
      tabsRef,
      helloFrameSequenceRef,
      lastFrameSequenceRef,
      lastActionSequenceRef,
      lastCallbackSequenceRef,
      leaseRef,
      leaseOwnedRef,
      controlIntentRef,
      controlIntentSentRef,
      controlPendingRef,
      pendingBinaryRef,
      failureKindRef,
      transportStateRef,
      fenceSerialRef,
      setProtocolVersion,
      setCurrentLease,
      setCapabilities,
      setControlPending,
      setControlIntentSent,
      setFailureKind,
      setError,
      rejectProtocol,
      transition,
      armFirstFrameTimeout,
      cancelFrameDecode,
      resetStreamPaint: () => {
        // Rebind abandons old decode work without emitting an old-stream
        // dropped receipt after the binding refs have advanced.
        cancelFrameDecode(false, false, false);
        setHasCanvasFrame(false);
      },
      acceptFrameMeta,
      reconcileControlIntent: () =>
        reconcileControlIntentRef.current(),
      recordDiagnostic: (diagnostic) => {
        lastDiagnosticRef.current = diagnostic;
      },
      refreshCheckpoints,
    }),
    [
      tt,
      setProtocolVersion,
      setCurrentLease,
      setCapabilities,
      setControlPending,
      setControlIntentSent,
      setFailureKind,
      setError,
      rejectProtocol,
      transition,
      armFirstFrameTimeout,
      cancelFrameDecode,
      acceptFrameMeta,
      refreshCheckpoints,
    ],
  );

  const clearBinding = useCallback(() => {
    setProtocolVersion(null);
    handshakeRef.current = false;
    sessionVersionRef.current = 0;
    runtimeIdRef.current = "";
    runtimeVersionRef.current = "";
    incarnationRef.current = 0;
    nonceRef.current = "";
    connectionIdRef.current = "";
    streamIdRef.current = "";
    streamGenerationRef.current = 0;
    windowIdRef.current = "";
    frameContractRef.current = null;
    capabilitiesRef.current = EMPTY_CAPABILITIES;
    setCapabilitiesState(EMPTY_CAPABILITIES);
    tabsRef.current = [];
    helloFrameSequenceRef.current = 0;
    lastFrameSequenceRef.current = 0;
    lastActionSequenceRef.current = 0;
    lastCallbackSequenceRef.current = 0;
    clientActionSequenceRef.current = 0;
    pendingBinaryRef.current = false;
    controlIntentRef.current = "";
    setControlIntentSent(false);
    sentEventIdsRef.current.clear();
    ++fenceSerialRef.current;
  }, [setProtocolVersion]);

  const stopLive = useCallback(
    (clearFrame = true) => {
      liveRequestedRef.current = false;
      setLiveRequested(false);
      transition("closed");
      clearBinding();
      setCurrentLease(EMPTY_BROWSER_LEASE, false);
      setControlPending(false);
      setFailureKind(null);
      liveRecoveryAttemptsRef.current = 0;
      ++socketGenerationRef.current;
      ++connectAttemptSerialRef.current;
      activeConnectAttemptRef.current = null;
      waitingForOnlineRef.current = false;
      invalidateLiveRecoveryAttempt(true);
      clearFirstFrameTimeout();
      const socket = socketRef.current;
      socketRef.current = null;
      socketSessionRef.current = "";
      try {
        socket?.close(1000, "client stop");
      } catch {
        // The close event may already have run.
      }
      cancelFrameDecode(clearFrame);
      if (clearFrame) setHasCanvasFrame(false);
    },
    [
      cancelFrameDecode,
      clearBinding,
      clearFirstFrameTimeout,
      setControlPending,
      setCurrentLease,
      setFailureKind,
      setLiveRequested,
      transition,
    ],
  );

  useEffect(() => {
    const selectionChanged = selectedPropRef.current !== selectedId;
    if (!selectionChanged) return;
    selectedPropRef.current = selectedId;
    selectedIdRef.current = selectedId;
    if (
      liveRequestedRef.current &&
      socketSessionRef.current !== selectedId
    ) {
      stopLive(true);
    }
  }, [selectedId, stopLive]);

  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    if (liveRequestedRef.current) stopLive(true);
  }, [scopeKey, stopLive]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        cancelFrameDecode(false, true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
  }, [cancelFrameDecode]);

  useEffect(
    () => () => {
      liveRequestedRef.current = false;
      ++socketGenerationRef.current;
      ++connectAttemptSerialRef.current;
      activeConnectAttemptRef.current = null;
      waitingForOnlineRef.current = false;
      invalidateLiveRecoveryAttempt(true);
      clearFirstFrameTimeout();
      clearTakeoverTimeout();
      socketRef.current?.close();
      socketRef.current = null;
      cancelFrameDecode(false);
    },
    [
      cancelFrameDecode,
      clearFirstFrameTimeout,
      clearTakeoverTimeout,
    ],
  );

  useEffect(() => {
    if (protocol !== 3 || transportState !== "streaming") return;
    const timer = window.setInterval(() => {
      if (!handshakeRef.current) return;
      const fence = currentFence();
      if (
        !sendRaw(
          v3Envelope("heartbeat", { sent_at: Date.now() }),
          fence,
        )
      ) {
        recoverConnectionRef.current(
          tt("实时浏览器连接失败"),
          "connection",
        );
      }
    }, LIVE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [
    currentFence,
    protocol,
    sendRaw,
    transportState,
    tt,
    v3Envelope,
  ]);

  useEffect(() => {
    if (
      protocol !== 3 ||
      !leaseOwned ||
      !lease.leaseId ||
      transportState !== "streaming"
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      if (!sendControlMutation("control.renew", true)) {
        recoverConnectionRef.current(
          tt("实时浏览器连接失败"),
          "connection",
        );
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [
    protocol,
    leaseOwned,
    lease.leaseId,
    lease.epoch,
    transportState,
    sendControlMutation,
    tt,
  ]);

  useEffect(() => {
    const onOffline = () => {
      if (!liveRequestedRef.current) return;
      waitingForOnlineRef.current = true;
      recoverConnectionRef.current(
        tt("实时浏览器连接失败"),
        "connection",
      );
    };
    const onOnline = () => {
      if (
        !liveRequestedRef.current ||
        !waitingForOnlineRef.current
      ) {
        return;
      }
      waitingForOnlineRef.current = false;
      reconnectAttemptsRef.current = 0;
      recoverConnectionRef.current(
        tt("实时浏览器连接失败"),
        "connection",
        true,
      );
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [tt]);

  function connectionCurrent(sessionId: string, generation: number) {
    return (
      generation === socketGenerationRef.current &&
      liveRequestedRef.current &&
      socketSessionRef.current === sessionId
    );
  }

  function connectionAttemptCurrent(
    sessionId: string,
    generation: number,
    attempt: number,
  ) {
    return (
      attempt === connectAttemptSerialRef.current &&
      connectionCurrent(sessionId, generation)
    );
  }

  function invalidateLiveRecoveryAttempt(clearTimer = false) {
    ++liveRecoveryAttemptSerialRef.current;
    liveRecoveryAttemptRef.current = null;
    if (clearTimer && reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function scheduleLiveRecovery(
    kind: Exclude<CloudBrowserFailureKind, null>,
  ): boolean {
    const sessionId = socketSessionRef.current;
    const generation = socketGenerationRef.current;
    if (!connectionCurrent(sessionId, generation)) return false;
    const activeAttempt = liveRecoveryAttemptRef.current;
    if (
      activeAttempt?.sessionId === sessionId &&
      activeAttempt.generation === generation
    ) {
      // Keep one attempt active from backoff expiry until its asynchronous
      // ticket/connect path settles. Duplicate rejects share that attempt.
      return true;
    }
    if (
      transportStateRef.current === "reconnecting" &&
      reconnectTimerRef.current !== null
    ) {
      // A retry is already pending; a duplicate reject for the same
      // failure must not burn a second recovery attempt.
      return true;
    }
    if (
      waitingForOnlineRef.current ||
      (typeof navigator !== "undefined" &&
        navigator.onLine === false)
    ) {
      scheduleReconnect(
        sessionId,
        generation,
        tt("实时浏览器连接失败"),
        "connection",
      );
      return true;
    }
    const plan = planCloudBrowserLiveRecovery(
      kind,
      liveRecoveryAttemptsRef.current,
    );
    if (!plan.retry) return false;
    liveRecoveryAttemptsRef.current += 1;
    ++connectAttemptSerialRef.current;
    activeConnectAttemptRef.current = null;
    prepareControlIntentForReconnect();
    const token = ++liveRecoveryAttemptSerialRef.current;
    liveRecoveryAttemptRef.current = { token, sessionId, generation };
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
    }
    transition("reconnecting");
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      const attempt = liveRecoveryAttemptRef.current;
      if (
        attempt?.token !== token ||
        !connectionCurrent(sessionId, generation)
      ) {
        if (attempt?.token === token) {
          liveRecoveryAttemptRef.current = null;
        }
        return;
      }
      // Reuses the ticket path: connectLive re-issues a one-use ticket
      // and rebuilds the socket under the same generation fence.
      void connectLive(sessionId, generation, false).finally(() => {
        if (liveRecoveryAttemptRef.current?.token === token) {
          liveRecoveryAttemptRef.current = null;
        }
      });
    }, plan.delayMs);
    return true;
  }
  scheduleLiveRecoveryRef.current = scheduleLiveRecovery;

  function scheduleReconnect(
    sessionId: string,
    generation: number,
    reason: string,
    kind: Exclude<CloudBrowserFailureKind, null> = "connection",
    immediate = false,
  ) {
    if (!connectionCurrent(sessionId, generation)) return;
    if (
      reconnectTimerRef.current !== null ||
      activeConnectAttemptRef.current !== null
    ) {
      return;
    }
    ++connectAttemptSerialRef.current;
    activeConnectAttemptRef.current = null;
    clearFirstFrameTimeout();
    handshakeRef.current = false;
    pendingBinaryRef.current = false;
    cancelFrameDecode(false);
    prepareControlIntentForReconnect();
    setCurrentLease(EMPTY_BROWSER_LEASE, false);
    ++fenceSerialRef.current;
    setFailureKind(kind);
    transition("reconnecting");
    setError("");
    if (
      waitingForOnlineRef.current ||
      (typeof navigator !== "undefined" &&
        navigator.onLine === false)
    ) {
      waitingForOnlineRef.current = true;
      setBusy(false);
      return;
    }
    if (reconnectAttemptsRef.current >= MAX_LIVE_RECONNECTS) {
      transition("failed");
      setError(reason || tt("实时浏览器连接已中断"));
      setBusy(false);
      return;
    }
    const attempt = reconnectAttemptsRef.current++;
    const delay = immediate
      ? 0
      : LIVE_RECONNECT_BASE_MS * 2 ** attempt;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectLive(sessionId, generation, false);
    }, delay);
  }

  function recoverCurrentConnection(
    reason: string,
    kind: Exclude<CloudBrowserFailureKind, null> = "connection",
    immediate = false,
  ) {
    const sessionId = socketSessionRef.current;
    const generation = socketGenerationRef.current;
    if (!connectionCurrent(sessionId, generation)) return;
    ++connectAttemptSerialRef.current;
    activeConnectAttemptRef.current = null;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    invalidateLiveRecoveryAttempt(false);
    const socket = socketRef.current;
    socketRef.current = null;
    try {
      socket?.close(1001, "fresh v3 connection required");
    } catch {
      // The fresh-ticket reconnect below owns recovery.
    }
    scheduleReconnect(
      sessionId,
      generation,
      reason,
      kind,
      immediate,
    );
  }
  recoverConnectionRef.current = recoverCurrentConnection;

  function seedTicket(
    auth: Extract<
      ReturnType<typeof cloudBrowserAuthMessage>,
      { ok: true }
    >,
  ) {
    const { binding } = auth;
    socketSessionRef.current = binding.sessionId;
    sessionVersionRef.current = binding.sessionVersion;
    runtimeIdRef.current = binding.runtimeId;
    runtimeVersionRef.current = "";
    incarnationRef.current = binding.incarnation;
    nonceRef.current = binding.ticketNonce;
    connectionIdRef.current = "";
    streamIdRef.current = "";
    streamGenerationRef.current = 0;
    windowIdRef.current = "";
    frameContractRef.current = null;
    capabilitiesRef.current = EMPTY_CAPABILITIES;
    setCapabilitiesState(EMPTY_CAPABILITIES);
    tabsRef.current = [];
    helloFrameSequenceRef.current = 0;
    lastFrameSequenceRef.current = 0;
    lastActionSequenceRef.current = 0;
    lastCallbackSequenceRef.current = 0;
    clientActionSequenceRef.current = 0;
    pendingBinaryRef.current = false;
    setControlIntentSent(false);
    sentEventIdsRef.current.clear();
    ++fenceSerialRef.current;
  }

  async function connectLive(
    sessionId: string,
    generation: number,
    initial: boolean,
  ): Promise<boolean> {
    if (!connectionCurrent(sessionId, generation)) return false;
    if (initial) transition("ticketing");
    const attempt = ++connectAttemptSerialRef.current;
    activeConnectAttemptRef.current = attempt;
    waitingForOnlineRef.current = false;
    let ticket: Awaited<
      ReturnType<typeof createCloudBrowserTicket>
    >;
    try {
      ticket = await createCloudBrowserTicket(sessionId);
    } catch (error) {
      if (activeConnectAttemptRef.current === attempt) {
        activeConnectAttemptRef.current = null;
      }
      if (!connectionAttemptCurrent(sessionId, generation, attempt)) {
        return false;
      }
      lastDiagnosticRef.current = {
        source: "server",
        type: "live-ticket",
        message:
          error instanceof Error ? error.message : String(error),
      };
      scheduleReconnect(
        sessionId,
        generation,
        tt("云端浏览器恢复失败"),
      );
      return false;
    }
    if (activeConnectAttemptRef.current === attempt) {
      activeConnectAttemptRef.current = null;
    }
    if (
      initial &&
      connectionAttemptCurrent(sessionId, generation, attempt)
    ) {
      setBusy(false);
    }
    if (!connectionAttemptCurrent(sessionId, generation, attempt)) {
      return false;
    }
    if (!ticket.ok || !ticket.data) {
      if (ticket.error) {
        lastDiagnosticRef.current = {
          source: "server",
          type: "live-ticket",
          message: ticket.error,
        };
      }
      scheduleReconnect(
        sessionId,
        generation,
        tt("云端浏览器恢复失败"),
      );
      return false;
    }
    const auth = cloudBrowserAuthMessage(ticket.data, sessionId);
    if (!auth.ok) {
      const expired = auth.reason === "ticket_expired";
      if (expired) {
        scheduleReconnect(
          sessionId,
          generation,
          tt("实时连接票据已过期，请重试"),
          "ticket_expired",
        );
        return false;
      }
      liveRequestedRef.current = false;
      controlIntentRef.current = "";
      setControlIntentSent(false);
      setControlPending(false);
      setFailureKind(expired ? "ticket_expired" : "protocol_mismatch");
      transition("failed");
      setError(
        tt("服务端未提供严格平铺 v3 票据，已拒绝降级连接"),
      );
      return false;
    }
    setProtocolVersion(null);
    handshakeRef.current = false;
    seedTicket(auth);
    setCurrentLease(EMPTY_BROWSER_LEASE, false);
    prepareControlIntentForReconnect();
    setFailureKind(null);
    if (initial) transition("ws_connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(cloudBrowserLiveUrl(sessionId));
    } catch {
      scheduleReconnect(
        sessionId,
        generation,
        tt("实时浏览器连接失败"),
      );
      return false;
    }
    if (!connectionAttemptCurrent(sessionId, generation, attempt)) {
      socket.close();
      return false;
    }
    socket.binaryType = "blob";
    socketRef.current = socket;
    socket.onopen = () => {
      if (
        socketRef.current !== socket ||
        !connectionAttemptCurrent(sessionId, generation, attempt)
      ) {
        socket.close();
        return;
      }
      if (auth.expiresAt <= Date.now()) {
        socketRef.current = null;
        socket.close(1008, "ticket expired");
        scheduleReconnect(
          sessionId,
          generation,
          tt("实时连接票据在握手前已过期，请重试"),
          "ticket_expired",
        );
        return;
      }
      try {
        socket.send(JSON.stringify(auth.message));
      } catch {
        socket.close();
        return;
      }
      transition("authenticated");
    };
    socket.onmessage = (event) => {
      if (
        socketRef.current !== socket ||
        !connectionAttemptCurrent(sessionId, generation, attempt)
      ) {
        return;
      }
      if (event.data instanceof Blob) {
        if (
          protocolRef.current !== 3 ||
          !handshakeRef.current ||
          !pendingBinaryRef.current
        ) {
          rejectProtocol(
            tt("画面流校验失败（收到未配对的画面数据），请重试连接"),
            "protocol_mismatch",
          );
          return;
        }
        pendingBinaryRef.current = false;
        if (!drawBlobFrame(event.data)) {
          rejectProtocol(
            tt("画面流校验失败，请重试连接"),
            "protocol_mismatch",
          );
        }
        return;
      }
      const decoded = decodeCloudBrowserProtocolMessage(event.data);
      if (!decoded.ok) {
        rejectProtocol(
          tt("连接数据格式异常，请重试连接"),
          "protocol_mismatch",
        );
        return;
      }
      handleCloudBrowserProtocolMessage(
        decoded.message,
        protocolContext(),
      );
    };
    socket.onerror = () => {
      if (socketRef.current === socket) {
        try {
          socket.close();
        } catch {
          // onclose owns a bounded reconnect.
        }
      }
    };
    socket.onclose = () => {
      if (
        socketRef.current !== socket ||
        !connectionAttemptCurrent(sessionId, generation, attempt)
      ) {
        return;
      }
      socketRef.current = null;
      scheduleReconnect(
        sessionId,
        generation,
        tt("实时浏览器连接失败"),
      );
    };
    return true;
  }

  async function openLive(sessionId?: string): Promise<boolean> {
    const requestedSessionId = sessionId || selectedIdRef.current;
    if (!requestedSessionId) return false;
    selectedIdRef.current = requestedSessionId;
    if (
      liveRequestedRef.current &&
      socketSessionRef.current === requestedSessionId &&
      REUSABLE_LIVE_STATES.has(transportStateRef.current)
    ) {
      // Power-on and reconnect are idempotent for the active session. A
      // repeated render/click must not issue another ticket or WSS stream.
      return true;
    }
    invalidateLiveRecoveryAttempt(true);
    const oldSocket = socketRef.current;
    socketRef.current = null;
    try {
      oldSocket?.close(1000, "new v3 live request");
    } catch {
      // Already closed.
    }
    const generation = ++socketGenerationRef.current;
    ++connectAttemptSerialRef.current;
    activeConnectAttemptRef.current = null;
    waitingForOnlineRef.current = false;
    reconnectAttemptsRef.current = 0;
    liveRecoveryAttemptsRef.current = 0;
    socketSessionRef.current = requestedSessionId;
    liveRequestedRef.current = true;
    setLiveRequested(true);
    clearBinding();
    setCurrentLease(EMPTY_BROWSER_LEASE, false);
    setControlPending(false);
    setHasCanvasFrame(false);
    setFailureKind(null);
    setBusy(true);
    setError("");
    clearFirstFrameTimeout();
    cancelFrameDecode(true);
    return connectLive(requestedSessionId, generation, true);
  }

  function sendFrameReceipt(
    type: "frame.received" | "frame.dropped" | "frame.presented",
    meta: ValidatedCloudBrowserFrameMeta,
  ) {
    if (!handshakeRef.current || protocolRef.current !== 3) return false;
    const binding = currentBinding();
    if (
      (meta.sessionVersion !== undefined &&
        meta.sessionVersion !== binding.sessionVersion) ||
      (meta.runtimeId !== undefined &&
        meta.runtimeId !== binding.runtimeId) ||
      (meta.runtimeVersion !== undefined &&
        meta.runtimeVersion !== binding.runtimeVersion) ||
      (meta.incarnation !== undefined &&
        meta.incarnation !== binding.incarnation) ||
      (meta.nonce !== undefined && meta.nonce !== binding.nonce) ||
      (meta.connectionId !== undefined &&
        meta.connectionId !== binding.connectionId) ||
      (meta.streamId !== undefined &&
        meta.streamId !== binding.streamId) ||
      (meta.generation !== undefined &&
        meta.generation !== binding.streamGeneration) ||
      (meta.windowId !== undefined &&
        meta.windowId !== binding.windowId)
    ) {
      return false;
    }
    const fence = currentFence();
    return sendRaw(
      cloudBrowserV3FrameReceipt(
        binding,
        type,
        meta.sequence,
        meta.actionSequence,
      ),
      fence,
    );
  }

  function handleFrameReceived(meta: ValidatedCloudBrowserFrameMeta) {
    pendingBinaryRef.current = false;
    if (!sendFrameReceipt("frame.received", meta)) {
      recoverConnectionRef.current(
        tt("实时浏览器连接失败"),
        "connection",
      );
      return false;
    }
    return true;
  }

  function handleFrameDropped(meta: ValidatedCloudBrowserFrameMeta) {
    if (!handshakeRef.current || protocolRef.current !== 3) return;
    if (!sendFrameReceipt("frame.dropped", meta)) {
      recoverConnectionRef.current(
        tt("实时浏览器连接失败"),
        "connection",
      );
    }
  }

  function handleFramePresented(meta: ValidatedCloudBrowserFrameMeta) {
    if (
      !handshakeRef.current ||
      protocolRef.current !== 3 ||
      meta.sequence <= helloFrameSequenceRef.current ||
      meta.source !== "native-chrome-window" ||
      meta.paintState !== "real" ||
      !meta.nativeChromeWindow
    ) {
      rejectProtocol(
        tt("画面校验未通过（不是新鲜的原生 Chrome 画面），请重试连接"),
        "stale_stream",
      );
      return;
    }
    setHasCanvasFrame(true);
    if (!sendFrameReceipt("frame.presented", meta)) {
      recoverConnectionRef.current(
        tt("实时浏览器连接失败"),
        "connection",
      );
      return;
    }
    clearFirstFrameTimeout();
    reconnectAttemptsRef.current = 0;
    liveRecoveryAttemptsRef.current = 0;
    invalidateLiveRecoveryAttempt(true);
    setFailureKind(null);
    transition("streaming");
    setError("");
    reconcileControlIntentRef.current();
  }

  function handleFrameDecodeError(reason: string) {
    rejectProtocol(
      `${tt("画面显示失败，请重试连接")}：${reason}`,
      transportStateRef.current === "streaming"
        ? "protocol_mismatch"
        : "first_paint",
    );
  }

  const actions = createCloudBrowserTransportActions({
    transportStateRef,
    leaseOwnedRef,
    controlPendingRef,
    capabilitiesRef,
    sendMutation,
    requestControlIntent,
  });

  return {
    transportState,
    protocol,
    capabilities,
    driving: leaseOwned,
    lease,
    controlPending,
    controlIntentSent,
    hasCanvasFrame,
    failureKind,
    canvasRef,
    frameSizeRef,
    openLive,
    stopLive,
    sendMutation,
    ...actions,
  };
}
