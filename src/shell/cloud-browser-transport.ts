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
import { createCloudBrowserTransportActions } from "./cloud-browser-transport-actions";
import {
  EMPTY_BROWSER_LEASE,
  LIVE_RECONNECT_BASE_MS,
  MAX_LIVE_RECONNECTS,
  type CloudBrowserTransportOptions,
} from "./cloud-browser-transport-config";
import {
  decodeCloudBrowserProtocolMessage,
  reduceCloudBrowserTransportTransition,
  type CloudBrowserFailureKind,
  type CloudBrowserHelloTab,
} from "./cloud-browser-transport-model";
import {
  CLOUD_BROWSER_MAX_CONTROL_BYTES,
  canSendCloudBrowserControlMutation,
  cloudBrowserAuthMessage,
  cloudBrowserV3FrameReceipt,
  cloudBrowserV3Message,
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
  const [hasCanvasFrame, setHasCanvasFrame] = useState(false);
  const [failureKind, setFailureKindState] =
    useState<CloudBrowserFailureKind>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const socketSessionRef = useRef("");
  const socketGenerationRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const firstFrameTimerRef = useRef<number | null>(null);
  const liveRequestedRef = useRef(false);
  const selectedIdRef = useRef("");
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
  const controlPendingRef = useRef(false);
  const pendingBinaryRef = useRef(false);
  const failureKindRef = useRef<CloudBrowserFailureKind>(null);
  const fenceSerialRef = useRef(0);
  const sentEventIdsRef = useRef(new Set<string>());
  const cancelFrameDecodeRef =
    useRef<(clearCanvas?: boolean) => void>(() => {});

  const setControlPending = useCallback(
    (value: SetStateAction<boolean>) => {
      setControlPendingState((current) => {
        const next =
          typeof value === "function" ? value(current) : value;
        controlPendingRef.current = next;
        return next;
      });
    },
    [],
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
      if (
        previous.leaseId !== next.leaseId ||
        previous.epoch !== next.epoch ||
        previous.connectionId !== next.connectionId ||
        leaseOwnedRef.current !== owned
      ) {
        ++fenceSerialRef.current;
      }
      leaseRef.current = next;
      leaseOwnedRef.current = owned;
      setLease(next);
      setLeaseOwned(owned);
    },
    [],
  );

  const clearFirstFrameTimeout = useCallback(() => {
    if (firstFrameTimerRef.current === null) return;
    window.clearTimeout(firstFrameTimerRef.current);
    firstFrameTimerRef.current = null;
  }, []);

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
      liveRequestedRef.current = false;
      const socket = socketRef.current;
      socketRef.current = null;
      cancelFrameDecodeRef.current(false);
      try {
        socket?.close(4000, "validated first paint timeout");
      } catch {
        // A retry always creates a fresh one-use ticket and connection.
      }
      setCurrentLease(EMPTY_BROWSER_LEASE, false);
      setFailureKind("first_paint");
      transition("failed");
      setError(
        tt("5 秒内未收到带原生 Chrome 证据的新鲜首帧，未进入实时状态"),
      );
    }, 5_000);
  }, [
    clearFirstFrameTimeout,
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
      liveRequestedRef.current = false;
      handshakeRef.current = false;
      pendingBinaryRef.current = false;
      clearFirstFrameTimeout();
      cancelFrameDecodeRef.current(false);
      setCurrentLease(EMPTY_BROWSER_LEASE, false);
      setFailureKind(kind);
      transition("failed");
      setError(message);
      const socket = socketRef.current;
      socketRef.current = null;
      try {
        socket?.close(1008, "v3 protocol rejected");
      } catch {
        // The failed state is already final for this connection.
      }
    },
    [
      clearFirstFrameTimeout,
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
      controlPendingRef,
      pendingBinaryRef,
      failureKindRef,
      transportStateRef,
      setProtocolVersion,
      setCurrentLease,
      setCapabilities,
      setControlPending,
      setFailureKind,
      setError,
      rejectProtocol,
      transition,
      armFirstFrameTimeout,
      cancelFrameDecode,
      acceptFrameMeta,
      refreshCheckpoints,
    }),
    [
      tt,
      setProtocolVersion,
      setCurrentLease,
      setCapabilities,
      setControlPending,
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
      ++socketGenerationRef.current;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
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
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    if (liveRequestedRef.current) stopLive(true);
  }, [scopeKey, stopLive]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        cancelFrameDecode(false);
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
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      clearFirstFrameTimeout();
      socketRef.current?.close();
      socketRef.current = null;
      cancelFrameDecode(false);
    },
    [cancelFrameDecode, clearFirstFrameTimeout],
  );

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
        setCurrentLease(EMPTY_BROWSER_LEASE, false);
        setFailureKind("lease_lost");
        setError(tt("控制租约续期失败，输入已停用"));
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
    setCurrentLease,
    setError,
    setFailureKind,
    tt,
  ]);

  function connectionCurrent(sessionId: string, generation: number) {
    return (
      generation === socketGenerationRef.current &&
      liveRequestedRef.current &&
      socketSessionRef.current === sessionId
    );
  }

  function scheduleReconnect(
    sessionId: string,
    generation: number,
    reason: string,
  ) {
    if (!connectionCurrent(sessionId, generation)) return;
    clearFirstFrameTimeout();
    handshakeRef.current = false;
    pendingBinaryRef.current = false;
    cancelFrameDecode(false);
    setCurrentLease(EMPTY_BROWSER_LEASE, false);
    setControlPending(false);
    ++fenceSerialRef.current;
    if (reconnectAttemptsRef.current >= MAX_LIVE_RECONNECTS) {
      liveRequestedRef.current = false;
      setFailureKind("connection");
      transition("failed");
      setError(reason || tt("实时浏览器连接已中断"));
      setBusy(false);
      return;
    }
    const attempt = reconnectAttemptsRef.current++;
    const delay = LIVE_RECONNECT_BASE_MS * 2 ** attempt;
    setFailureKind("connection");
    transition("reconnecting");
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectLive(sessionId, generation, false);
    }, delay);
  }

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
    sentEventIdsRef.current.clear();
    ++fenceSerialRef.current;
  }

  async function connectLive(
    sessionId: string,
    generation: number,
    initial: boolean,
  ): Promise<boolean> {
    if (initial) transition("ticketing");
    const ticket = await createCloudBrowserTicket(sessionId);
    if (initial && generation === socketGenerationRef.current) {
      setBusy(false);
    }
    if (!connectionCurrent(sessionId, generation)) return false;
    if (!ticket.ok || !ticket.data) {
      scheduleReconnect(
        sessionId,
        generation,
        ticket.error || tt("云端浏览器恢复失败"),
      );
      return false;
    }
    const auth = cloudBrowserAuthMessage(ticket.data, sessionId);
    if (!auth.ok) {
      const expired = auth.reason === "ticket_expired";
      liveRequestedRef.current = false;
      setFailureKind(expired ? "ticket_expired" : "protocol_mismatch");
      transition("failed");
      setError(
        expired
          ? tt("实时连接票据已过期，请重试")
          : tt("服务端未提供严格平铺 v3 票据，已拒绝降级连接"),
      );
      return false;
    }
    setProtocolVersion(null);
    handshakeRef.current = false;
    seedTicket(auth);
    setCurrentLease(EMPTY_BROWSER_LEASE, false);
    setControlPending(false);
    setFailureKind(null);
    if (initial) transition("ws_connecting");
    const socket = new WebSocket(cloudBrowserLiveUrl(sessionId));
    socket.binaryType = "blob";
    socketRef.current = socket;
    socket.onopen = () => {
      if (
        socketRef.current !== socket ||
        generation !== socketGenerationRef.current
      ) {
        socket.close();
        return;
      }
      if (auth.expiresAt <= Date.now()) {
        socketRef.current = null;
        liveRequestedRef.current = false;
        setFailureKind("ticket_expired");
        transition("failed");
        setError(tt("实时连接票据在握手前已过期，请重试"));
        socket.close(1008, "ticket expired");
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
        generation !== socketGenerationRef.current
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
            tt("收到未配对的二进制画面，已拒绝连接"),
            "protocol_mismatch",
          );
          return;
        }
        pendingBinaryRef.current = false;
        if (!drawBlobFrame(event.data)) {
          rejectProtocol(
            tt("二进制画面大小或配对校验失败"),
            "protocol_mismatch",
          );
        }
        return;
      }
      const decoded = decodeCloudBrowserProtocolMessage(event.data);
      if (!decoded.ok) {
        rejectProtocol(
          tt("控制消息格式无效或超过大小限制"),
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
        generation !== socketGenerationRef.current
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
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const oldSocket = socketRef.current;
    socketRef.current = null;
    try {
      oldSocket?.close(1000, "new v3 live request");
    } catch {
      // Already closed.
    }
    const generation = ++socketGenerationRef.current;
    reconnectAttemptsRef.current = 0;
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
    return sendRaw(
      cloudBrowserV3FrameReceipt(
        currentBinding(),
        type,
        meta.sequence,
        meta.actionSequence,
      ),
    );
  }

  function handleFrameReceived(meta: ValidatedCloudBrowserFrameMeta) {
    pendingBinaryRef.current = false;
    if (!sendFrameReceipt("frame.received", meta)) {
      rejectProtocol(
        tt("画面接收确认发送失败，未进入实时状态"),
        "connection",
      );
      return false;
    }
    return true;
  }

  function handleFrameDropped(meta: ValidatedCloudBrowserFrameMeta) {
    void sendFrameReceipt("frame.dropped", meta);
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
        tt("首帧不含新鲜的原生 Chrome 窗口证据"),
        "stale_stream",
      );
      return;
    }
    if (!sendFrameReceipt("frame.presented", meta)) {
      return;
    }
    clearFirstFrameTimeout();
    reconnectAttemptsRef.current = 0;
    setFailureKind(null);
    transition("streaming");
    setHasCanvasFrame(true);
    setError("");
  }

  function handleFrameDecodeError(reason: string) {
    rejectProtocol(
      `${tt("原生 Chrome 窗口画面校验或解码失败")}：${reason}`,
      transportStateRef.current === "streaming"
        ? "protocol_mismatch"
        : "first_paint",
    );
  }

  const actions = createCloudBrowserTransportActions({
    transportStateRef,
    leaseOwnedRef,
    controlIntentRef,
    capabilitiesRef,
    setControlPending,
    sendMutation,
    sendControlMutation,
  });

  return {
    transportState,
    protocol,
    capabilities,
    driving: leaseOwned,
    lease,
    controlPending,
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
