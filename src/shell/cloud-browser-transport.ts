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
  type CloudBrowserControlLease,
  type CloudBrowserFrameMeta,
  type CloudBrowserTab,
  type CloudBrowserTransportState,
} from "../lib/browser";
import { useCloudBrowserFramePainter } from "./cloud-browser-live";
import { handleCloudBrowserProtocolMessage, type CloudBrowserProtocolContext } from "./cloud-browser-protocol";
import { createCloudBrowserTransportActions } from "./cloud-browser-transport-actions";
import { EMPTY_BROWSER_LEASE, LIVE_RECONNECT_BASE_MS, MAX_LIVE_RECONNECTS, type CloudBrowserTransportOptions } from "./cloud-browser-transport-config";
import {
  cloudBrowserAuthMessage,
  cloudBrowserV2Message,
} from "./cloud-browser-wire";
import {
  decodeCloudBrowserProtocolMessage,
  reduceCloudBrowserTransportTransition,
} from "./cloud-browser-transport-model";

export function useCloudBrowserTransport({
  selectedId,
  liveRequested,
  setLiveRequested,
  scopeKey,
  tt,
  setBusy,
  setError,
  refreshEvents,
}: CloudBrowserTransportOptions) {
  const [transportState, setTransportState] =
    useState<CloudBrowserTransportState>("idle");
  const [protocol, setProtocol] = useState<1 | 2 | null>(null);
  const [tabs, setTabsState] = useState<CloudBrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [lease, setLease] =
    useState<CloudBrowserControlLease>(EMPTY_BROWSER_LEASE);
  const [leaseOwned, setLeaseOwned] = useState(false);
  const [legacyDriving, setLegacyDriving] = useState(false);
  const [controlPending, setControlPendingState] = useState(false);
  const [hasCanvasFrame, setHasCanvasFrame] = useState(false);
  const [address, setAddressState] = useState("");

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
  const protocolRef = useRef<1 | 2 | null>(null);
  const handshakeRef = useRef(false);
  const connectionIdRef = useRef("");
  const runtimeIdRef = useRef("");
  const incarnationRef = useRef(0);
  const streamIdRef = useRef("");
  const streamGenerationRef = useRef(0);
  const activeTabIdRef = useRef("");
  const leaseRef = useRef<CloudBrowserControlLease>(EMPTY_BROWSER_LEASE);
  const leaseOwnedRef = useRef(false);
  const legacyDrivingRef = useRef(false);
  const controlIntentRef = useRef<"acquire" | "release" | "">("");
  const mutationSequenceRef = useRef(0);
  const dropNextBinaryRef = useRef(false);
  const pendingV2BinaryRef = useRef(false);
  const tabsRef = useRef<CloudBrowserTab[]>([]);
  const controlPendingRef = useRef(false);
  const addressRef = useRef("");

  const setTabs = useCallback(
    (value: SetStateAction<CloudBrowserTab[]>) => {
      setTabsState((current) => {
        const next =
          typeof value === "function"
            ? value(current)
            : value;
        tabsRef.current = next;
        return next;
      });
    },
    [],
  );

  const setControlPending = useCallback(
    (value: SetStateAction<boolean>) => {
      setControlPendingState((current) => {
        const next =
          typeof value === "function"
            ? value(current)
            : value;
        controlPendingRef.current = next;
        return next;
      });
    },
    [],
  );

  const setAddress = useCallback((value: SetStateAction<string>) => {
    setAddressState((current) => {
      const next =
        typeof value === "function"
          ? value(current)
          : value;
      addressRef.current = next;
      return next;
    });
  }, []);

  const {
    canvasRef,
    frameSizeRef,
    cancelFrameDecode,
    acceptFrameMeta,
    drawBlobFrame,
    drawTextFrame,
  } = useCloudBrowserFramePainter({
    onPresented: handleFramePresented,
    onDecodeError: handleFrameDecodeError,
  });

  const driving = protocol === 2 ? leaseOwned : legacyDriving;

  const transition = useCallback((next: CloudBrowserTransportState) => {
    const legal = reduceCloudBrowserTransportTransition(
      transportStateRef.current,
      next,
    );
    transportStateRef.current = legal;
    setTransportState(legal);
  }, []);

  const setProtocolVersion = useCallback((next: 1 | 2 | null) => {
    protocolRef.current = next;
    setProtocol(next);
  }, []);

  const setCurrentLease = useCallback(
    (next: CloudBrowserControlLease, owned: boolean) => {
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

  const armFirstFrameTimeout = useCallback(() => {
    clearFirstFrameTimeout();
    const generation = socketGenerationRef.current;
    const expectedStream = streamIdRef.current;
    firstFrameTimerRef.current = window.setTimeout(() => {
      firstFrameTimerRef.current = null;
      if (
        generation !== socketGenerationRef.current ||
        transportStateRef.current !== "awaiting_first_frame" ||
        (expectedStream &&
          streamIdRef.current &&
          expectedStream !== streamIdRef.current)
      ) {
        return;
      }
      liveRequestedRef.current = false;
      const socket = socketRef.current;
      socketRef.current = null;
      try {
        socket?.close(4000, "first frame timeout");
      } catch {
        // Retry creates a fresh ticket and socket.
      }
      transition("failed");
      setError(tt("5 秒内未收到可绘制首帧，仍显示最后截图"));
    }, 5_000);
  }, [clearFirstFrameTimeout, setError, transition, tt]);

  const rejectProtocol = useCallback((message: string) => {
    handshakeRef.current = false;
    pendingV2BinaryRef.current = false;
    dropNextBinaryRef.current = false;
    clearFirstFrameTimeout();
    transition("failed");
    setError(message);
    try {
      socketRef.current?.close(1008, "protocol binding mismatch");
    } catch {
      // onclose owns reconnect when the socket is still current.
    }
  }, [clearFirstFrameTimeout, setError, transition]);

  const sendRaw = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (
      socket?.readyState !== WebSocket.OPEN ||
      socketSessionRef.current !== selectedIdRef.current
    ) {
      return false;
    }
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      // Never queue or replay clicks/keys after a reconnect.
      return false;
    }
  }, []);

  const v2Envelope = useCallback((
    type: string,
    payload: Record<string, unknown> = {},
  ) => cloudBrowserV2Message(
    {
      sessionId: socketSessionRef.current,
      runtimeId: runtimeIdRef.current,
      incarnation: incarnationRef.current,
      connectionId: connectionIdRef.current,
    },
    type,
    payload,
  ), []);

  const nextClientEventId = useCallback(
    () => `web-${Date.now()}-${++mutationSequenceRef.current}`,
    [],
  );

  const sendMutation = useCallback((
    type: string,
    payload: Record<string, unknown> = {},
    legacy?: Record<string, unknown>,
  ) => {
    if (protocolRef.current === 2) {
      if (!leaseOwnedRef.current) return false;
      return sendRaw(v2Envelope(type, {
        tab_id: activeTabIdRef.current,
        lease_id: leaseRef.current.leaseId,
        lease_epoch: leaseRef.current.epoch,
        client_event_id: nextClientEventId(),
        ...payload,
      }));
    }
    if (!legacyDrivingRef.current) return false;
    return sendRaw(legacy || { t: type, ...payload });
  }, [nextClientEventId, sendRaw, v2Envelope]);

  const adoptLegacyHandshake = useCallback(() => {
    if (protocolRef.current === 2) return;
    setProtocolVersion(1);
    handshakeRef.current = true;
    if (transportStateRef.current !== "streaming") {
      transition("awaiting_first_frame");
      armFirstFrameTimeout();
    }
  }, [armFirstFrameTimeout, setProtocolVersion, transition]);

  const protocolContext = useCallback((): CloudBrowserProtocolContext => ({
    tt,
    protocolRef,
    handshakeRef,
    connectionIdRef,
    runtimeIdRef,
    incarnationRef,
    streamIdRef,
    streamGenerationRef,
    activeTabIdRef,
    tabsRef,
    leaseRef,
    leaseOwnedRef,
    legacyDrivingRef,
    controlIntentRef,
    controlPendingRef,
    addressRef,
    dropNextBinaryRef,
    pendingV2BinaryRef,
    socketSessionRef,
    transportStateRef,
    setProtocolVersion,
    setCurrentLease,
    setTabs,
    setActiveTabId,
    setLegacyDriving,
    setControlPending,
    setAddress,
    setError,
    rejectProtocol,
    transition,
    armFirstFrameTimeout,
    cancelFrameDecode,
    acceptFrameMeta,
    drawTextFrame,
    refreshEvents,
  }), [
    tt,
    setProtocolVersion,
    setCurrentLease,
    setError,
    rejectProtocol,
    transition,
    armFirstFrameTimeout,
    cancelFrameDecode,
    acceptFrameMeta,
    drawTextFrame,
    refreshEvents,
  ]);

  const stopLive = useCallback((clearFrame = true) => {
    liveRequestedRef.current = false;
    setLiveRequested(false);
    transition("closed");
    setProtocolVersion(null);
    handshakeRef.current = false;
    streamIdRef.current = "";
    streamGenerationRef.current = 0;
    connectionIdRef.current = "";
    runtimeIdRef.current = "";
    incarnationRef.current = 0;
    legacyDrivingRef.current = false;
    setLegacyDriving(false);
    setCurrentLease(EMPTY_BROWSER_LEASE, false);
    setControlPending(false);
    controlIntentRef.current = "";
    dropNextBinaryRef.current = false;
    pendingV2BinaryRef.current = false;
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
  }, [
    cancelFrameDecode,
    clearFirstFrameTimeout,
    setCurrentLease,
    setLiveRequested,
    setProtocolVersion,
    transition,
  ]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    legacyDrivingRef.current = legacyDriving;
  }, [legacyDriving]);

  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    if (liveRequestedRef.current) stopLive(true);
  }, [scopeKey, stopLive]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelFrameDecode(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [cancelFrameDecode]);

  useEffect(() => () => {
    liveRequestedRef.current = false;
    ++socketGenerationRef.current;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
    }
    clearFirstFrameTimeout();
    socketRef.current?.close();
    socketRef.current = null;
    cancelFrameDecode(false);
  }, [cancelFrameDecode, clearFirstFrameTimeout]);

  useEffect(() => {
    if (
      protocol !== 2 ||
      !leaseOwned ||
      !lease.leaseId ||
      transportState !== "streaming"
    ) {
      return;
    }
    const renew = () => sendRaw(v2Envelope("control.renew", {
      lease_id: leaseRef.current.leaseId,
      lease_epoch: leaseRef.current.epoch,
    }));
    const timer = window.setInterval(renew, 5_000);
    return () => window.clearInterval(timer);
  }, [
    protocol,
    leaseOwned,
    lease.leaseId,
    lease.epoch,
    transportState,
    sendRaw,
    v2Envelope,
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
    if (reconnectAttemptsRef.current >= MAX_LIVE_RECONNECTS) {
      liveRequestedRef.current = false;
      transition("failed");
      legacyDrivingRef.current = false;
      setLegacyDriving(false);
      setCurrentLease(EMPTY_BROWSER_LEASE, false);
      setError(reason || tt("实时浏览器连接已中断"));
      setBusy(false);
      return;
    }
    const attempt = reconnectAttemptsRef.current++;
    const delay = LIVE_RECONNECT_BASE_MS * 2 ** attempt;
    transition("reconnecting");
    legacyDrivingRef.current = false;
    setLegacyDriving(false);
    setCurrentLease(EMPTY_BROWSER_LEASE, false);
    setControlPending(false);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectLive(sessionId, generation, false);
    }, delay);
  }

  async function connectLive(
    sessionId: string,
    generation: number,
    initial: boolean,
  ): Promise<boolean> {
    if (initial) transition("ticketing");
    const ticket = await createCloudBrowserTicket(sessionId);
    if (initial && generation === socketGenerationRef.current) setBusy(false);
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
    setProtocolVersion(null);
    handshakeRef.current = false;
    connectionIdRef.current = "";
    runtimeIdRef.current = auth.binding?.runtimeId || "";
    incarnationRef.current = auth.binding?.incarnation || 0;
    streamIdRef.current = "";
    streamGenerationRef.current = 0;
    pendingV2BinaryRef.current = false;
    dropNextBinaryRef.current = false;
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
      socket.send(JSON.stringify(auth.message));
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
        if (dropNextBinaryRef.current) {
          dropNextBinaryRef.current = false;
          pendingV2BinaryRef.current = false;
          return;
        }
        if (protocolRef.current === 2 && !pendingV2BinaryRef.current) return;
        if (!handshakeRef.current && protocolRef.current !== 2) {
          adoptLegacyHandshake();
        }
        pendingV2BinaryRef.current = false;
        drawBlobFrame(event.data);
        return;
      }
      const decoded = decodeCloudBrowserProtocolMessage(event.data);
      if (!decoded.ok) return;
      handleCloudBrowserProtocolMessage(decoded.message, protocolContext());
    };
    socket.onerror = () => {
      if (socketRef.current === socket) {
        try {
          socket.close();
        } catch {
          // onclose owns reconnect.
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
      cancelFrameDecode(false);
      scheduleReconnect(sessionId, generation, tt("实时浏览器连接失败"));
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
      oldSocket?.close(1000, "new live request");
    } catch {
      // Already closed.
    }
    const generation = ++socketGenerationRef.current;
    reconnectAttemptsRef.current = 0;
    socketSessionRef.current = requestedSessionId;
    liveRequestedRef.current = true;
    setLiveRequested(true);
    setProtocolVersion(null);
    handshakeRef.current = false;
    legacyDrivingRef.current = false;
    setLegacyDriving(false);
    setCurrentLease(EMPTY_BROWSER_LEASE, false);
    setControlPending(false);
    setTabs([]);
    activeTabIdRef.current = "";
    setActiveTabId("");
    streamIdRef.current = "";
    streamGenerationRef.current = 0;
    setHasCanvasFrame(false);
    setBusy(true);
    setError("");
    clearFirstFrameTimeout();
    cancelFrameDecode(true);
    return connectLive(requestedSessionId, generation, true);
  }

  function handleFramePresented(meta: CloudBrowserFrameMeta | null) {
    if (!handshakeRef.current) return;
    if (protocolRef.current === 2) {
      const streamId = meta?.streamId || streamIdRef.current;
      const sequence = meta?.sequence;
      if (!streamId || !sequence) {
        transition("failed");
        setError(tt("首帧缺少校验信息，未进入实时状态"));
        return;
      }
      if (
        (meta?.tabId &&
          activeTabIdRef.current &&
          meta.tabId !== activeTabIdRef.current) ||
        (streamIdRef.current && streamId !== streamIdRef.current)
      ) {
        return;
      }
      streamIdRef.current = streamId;
      if (!sendRaw(v2Envelope("frame.presented", {
        stream_id: streamId,
        generation:
          meta?.generation || streamGenerationRef.current || undefined,
        tab_id: meta?.tabId || activeTabIdRef.current,
        sequence,
        painted_at: new Date().toISOString(),
      }))) {
        return;
      }
    }
    clearFirstFrameTimeout();
    reconnectAttemptsRef.current = 0;
    transition("streaming");
    setHasCanvasFrame(true);
    setError("");
  }

  function handleFrameDecodeError() {
    if (
      transportStateRef.current === "awaiting_first_frame" ||
      transportStateRef.current === "authenticated"
    ) {
      clearFirstFrameTimeout();
      transition("failed");
      setError(tt("首帧解码失败，仍显示最后截图"));
    }
  }

  const actions = createCloudBrowserTransportActions({
    transportStateRef,
    protocolRef,
    leaseOwnedRef,
    leaseRef,
    legacyDrivingRef,
    controlIntentRef,
    activeTabIdRef,
    setControlPending,
    sendRaw,
    v2Envelope,
    sendMutation,
    nextClientEventId,
  });

  return {
    transportState,
    protocol,
    tabs,
    activeTabId,
    driving,
    lease,
    controlPending,
    hasCanvasFrame,
    address,
    setAddress,
    canvasRef,
    frameSizeRef,
    openLive,
    stopLive,
    sendMutation,
    ...actions,
  };
}
