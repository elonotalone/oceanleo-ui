"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { remoteDesktopClient, type RemoteDesktopAccess, type RemoteDesktopAction, type RemoteDesktopBilling, type RemoteDesktopClient, type RemoteDesktopDataLane, type RemoteDesktopFrameData, type RemoteDesktopStream, type RemoteMediaStatus } from "../api/remote-desktop";
import { RemoteDesktopVideo, remoteFrameStyle } from "./RemoteDesktopVideo";
import { useUI } from "../i18n/ui/useUI";
import { chunkText, clampPaste, classifyInput, containedRect, insideRect, isNearby, isPointerDrag, keyEventToAction, mouseButton, remoteChordKey, remoteKeyboardKey, remoteDesktopErrorCopy, remoteDesktopNoticeCopy, sanitizeRemoteText, softInputKeyAction, toNormalized } from "./remote-desktop-input";
import { remoteDesktopPortal, releaseRemoteDesktopFullscreen, requestRemoteDesktopFullscreen } from "./remote-desktop-fullscreen";
import { CLOUD_AGENT_COPY, type RemoteConsent } from "../lib/local-agent-task";
import { remoteDesktopTicket, type RemoteDesktopTicket } from "./remote-desktop-ticket";

export { requestRemoteDesktopFullscreen } from "./remote-desktop-fullscreen";
export { remoteDesktopTicket, type RemoteDesktopTicket } from "./remote-desktop-ticket";

export interface RemoteDesktopPanelProps {
  deviceId: string;
  deviceName: string;
  client?: RemoteDesktopClient;
  onClose: () => void;
  /** Compatibility for an older HTTP-only target. New targets stream frames. */
  frameIntervalMs?: number;
  doubleClickWindowMs?: number;
  backpressureMs?: number;
  /**
   * The cloud assistant working on this computer (device-link protocol §13,
   * bridge doc §17.6): from the task the panel was opened from, or from the
   * computer's live session when opened from 我的设备 (C11 contract §4).
   * Banner and hand back only: the media and input paths are unchanged.
   */
  agent?: RemoteDesktopAgentBanner;
  /**
   * What to expect while the request waits (C11 contract §2): `direct` = the
   * computer approves this owner's request without a dialog; `ask` = someone
   * at the computer must click 同意本次. Absent: today's wording.
   */
  consent?: RemoteConsent;
  /**
   * The person's explicit request to connect (`remoteDesktopTicket()` in a
   * click handler). The panel sends one session request per fresh ticket.
   * Spent or null (a reload, back/forward, a remount, a dev hot reload): it
   * shows 连接 and asks nothing of the computer until that click. Omitted:
   * the panel was mounted by a click and connects once for this mount.
   */
  ticket?: RemoteDesktopTicket | null;
}

export interface RemoteDesktopAgentBanner {
  /** Chinese source sentence from `CLOUD_AGENT_COPY`, rendered through `tt`. */
  text: string;
  /** A second sentence, e.g. that the last hand back got no confirmed answer. */
  note?: string;
  /** Offer 交还给 AI (the AI is paused and the owner may resume it). */
  handBack: boolean;
  busy: boolean;
  /** One revision-fenced `resume`; the computer re-observes before acting. */
  handoffKey?: string;
  onHandBack: () => void | Promise<boolean | void>;
}

/** `idle`: no session requested; only a click on 连接 sends one. */
type Phase = "idle" | "starting" | "waiting" | "connecting" | "active" | "closed" | "error" | "denied" | "timed_out" | "revoked" | "signed_out";
const terminal = (code?: string): Phase => code === "denied" ? "denied" : code === "request_expired" ? "timed_out" : code === "signed_out" ? "signed_out" : code === "revoked" || code === "controller_revoked" ? "revoked" : "error";
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, ms);
  if (signal.aborted) done(); else signal.addEventListener("abort", done, { once: true });
});

/** Mouse moves are coalesced to one per display frame (latest wins). */
const nextFrame = (fn: () => void): ReturnType<typeof setTimeout> | number =>
  typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame(fn) : setTimeout(fn, 16);
const cancelFrame = (id: ReturnType<typeof setTimeout> | number) => {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function" && typeof id === "number") window.cancelAnimationFrame(id);
  clearTimeout(id as ReturnType<typeof setTimeout>);
};

/** "¥0.096" / "$0.013": the amount exactly as the gateway priced it, trimmed to 4 decimals. */
export function billingPrice(billing: RemoteDesktopBilling): string {
  return `${billing.currency === "CNY" ? "¥" : "$"}${Number(billing.per_minute.toFixed(4))}`;
}

/** Only the publisher's current geometry can authorize a fresh video's point mapping. */
function mediaGeometryKey(status: RemoteMediaStatus | null): string | null {
  const geometry = status?.state === "publishing" ? status.geometry : null;
  if (!geometry || !Number.isFinite(geometry.width) || !Number.isFinite(geometry.height) || geometry.width <= 0 || geometry.height <= 0) return null;
  return `${geometry.display_id}:${geometry.width}x${geometry.height}`;
}

/** Encoding may scale the display down and round one pixel; a stale aspect is never current. */
function mediaFrameMatches(status: RemoteMediaStatus | null, width: number, height: number): boolean {
  const geometry = status?.geometry;
  return Boolean(geometry && mediaGeometryKey(status) && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    && Math.abs(width * geometry.height - height * geometry.width) <= Math.max(geometry.width, geometry.height));
}

export function RemoteDesktopPanel({ deviceId, deviceName, client = remoteDesktopClient, onClose, frameIntervalMs = 250, doubleClickWindowMs = 220, agent, consent, ticket: requested }: RemoteDesktopPanelProps) {
  const tt = useUI();
  const [portal] = useState(remoteDesktopPortal);
  // The request this panel may send. State, so a remount starts from the
  // opener's (by then spent) ticket and a dev Fast Refresh keeps the spent one.
  const [ticket, setTicket] = useState<RemoteDesktopTicket | null>(() => requested === undefined ? remoteDesktopTicket() : requested);
  useEffect(() => { if (requested) setTicket(requested); }, [requested]);
  const [phase, setPhase] = useState<Phase>(() => ticket && !ticket.spent ? "starting" : "idle");
  const [frame, setFrame] = useState<RemoteDesktopFrameData | null>(null);
  const [message, setMessage] = useState("");
  const [handingBack, setHandingBack] = useState(false);
  const [handoffFrozen, setHandoffFrozen] = useState(false);
  const [handoffDone, setHandoffDone] = useState(false);
  const completedHandoff = useRef<{key?: string; callback: RemoteDesktopAgentBanner["onHandBack"]} | null>(null);
  const handoffRef = useRef<object | null>(null);
  const agentRef = useRef(agent); agentRef.current = agent;
  const [toolbar, setToolbar] = useState(true);
  const [coarse, setCoarse] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [mediaMode, setMediaMode] = useState<"legacy" | "artc">("legacy");
  const mediaModeRef = useRef<"legacy" | "artc">("legacy");
  const [mediaStatus, setMediaStatus] = useState<RemoteMediaStatus | null>(null);
  const mediaStatusRef = useRef<RemoteMediaStatus | null>(null);
  /** Geometry for which a fresh decoded frame has arrived; an ACK never sets it. */
  const mediaFrameGeometry = useRef<string | null>(null);
  const [displayId, setDisplayId] = useState<string>();
  /** D7: true = fit to window (default); false = original pixel size. */
  const [fit, setFit] = useState(true);
  const [access, setAccess] = useState<RemoteDesktopAccess | null>(null);
  const viewOnlyRef = useRef(false);
  const [billing, setBilling] = useState<RemoteDesktopBilling | null>(null);
  const laneRef = useRef<RemoteDesktopDataLane | null>(null);
  /** Media failure evidence (blocked ARTC host / SDK code), kept on screen and on the root element. */
  const [mediaDiagnostic, setMediaDiagnostic] = useState<{ blocked_host?: string; sdk_error?: number } | null>(null);
  const [panMode, setPanMode] = useState(false);
  const panModeRef = useRef(false);
  panModeRef.current = panMode;
  const panRef = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const [mediaNotice, setMediaNotice] = useState("");
  const [mediaReady, setMediaReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const phaseRef = useRef<Phase>(phase);
  const frameRef = useRef(frame);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<string | null>(null);
  const streamRef = useRef<RemoteDesktopStream | null>(null);
  const streamModeRef = useRef(false);
  const closedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const previousCloseRef = useRef<Promise<unknown>>(Promise.resolve());
  const reconnectAttempts = useRef(0);
  const reconnectTicket = useRef<RemoteDesktopTicket | null>(null);
  const queueRef = useRef<RemoteDesktopAction[]>([]);
  const pumpingRef = useRef<AbortSignal | null>(null);
  const sequenceRef = useRef(0);
  const heldKeys = useRef(new Map<string, string>());
  const pointerRef = useRef<{ id: number; pointerType: string; x: number; y: number; button: "left" | "right" | "middle"; buttons: Set<"left" | "right" | "middle"> } | null>(null);
  const pendingClick = useRef<{ x: number; y: number } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const inputEpoch = useRef(0);
  const moveRef = useRef<RemoteDesktopAction | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | number | null>(null);
  const toolbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  frameRef.current = frame;

  const updatePhase = useCallback((value: Phase) => {
    if (value !== "active") {
      if (clickTimer.current) clearTimeout(clickTimer.current);
      clickTimer.current = null; pendingClick.current = null;
    }
    phaseRef.current = value; setPhase(value);
  }, []);
  const revealToolbar = useCallback(() => {
    setToolbar(true);
    if (toolbarTimer.current) clearTimeout(toolbarTimer.current);
    toolbarTimer.current = setTimeout(() => { if (phaseRef.current === "active") setToolbar(false); }, 2200);
  }, []);

  const canSend = useCallback(() => !handoffRef.current && !closedRef.current && !viewOnlyRef.current && phaseRef.current === "active" && Boolean(frameRef.current)
    && (mediaModeRef.current !== "artc" || Boolean(mediaFrameGeometry.current && mediaFrameGeometry.current === mediaGeometryKey(mediaStatusRef.current))), []);

  const pump = useCallback(async () => {
    const sessionId = sessionRef.current;
    const signal = abortRef.current?.signal;
    if (!sessionId || !signal || signal.aborted || pumpingRef.current === signal) return;
    pumpingRef.current = signal;
    try {
      while (queueRef.current.length && !closedRef.current && !signal.aborted && sessionRef.current === sessionId) {
        const action = queueRef.current.shift()!;
        const result = await client.sendInput(deviceId, sessionId, ++sequenceRef.current, action, { signal });
        if (signal.aborted || sessionRef.current !== sessionId) return;
        if (!result.ok) {
          // Unknown ACK must never be replayed. End the session, including held input.
          queueRef.current = [];
          updatePhase(terminal(result.error));
          setFrame(null);
          setMessage(remoteDesktopErrorCopy(result.error, result.status));
          if (sessionRef.current) void client.closeSession(deviceId, sessionRef.current).catch(() => {});
          break;
        }
      }
    } finally { if (pumpingRef.current === signal) pumpingRef.current = null; }
  }, [client, deviceId, updatePhase]);

  const send = useCallback((action: RemoteDesktopAction) => {
    if (!canSend()) return;
    if (streamModeRef.current) {
      if (streamRef.current?.send(action) && action.kind !== "release_all") { completedHandoff.current = null; setHandoffDone(false); }
      return;
    }
    if (queueRef.current.length >= 64) { setMessage("操作太快，部分输入被丢弃了。"); return; }
    queueRef.current.push(action);
    void pump();
  }, [canSend, pump]);

  const flushMove = useCallback(() => {
    if (moveTimer.current !== null) cancelFrame(moveTimer.current);
    moveTimer.current = null;
    if (moveRef.current) send(moveRef.current);
    moveRef.current = null;
  }, [send]);

  const flushClick = useCallback(() => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = null;
    const point = pendingClick.current;
    pendingClick.current = null;
    if (point) send({ kind: "click", ...point, button: "left" });
  }, [send]);

  const clearLocalInput = useCallback(() => {
    inputEpoch.current++;
    if (inputRef.current) inputRef.current.value = "";
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = null;
    pendingClick.current = null;
    if (moveTimer.current !== null) cancelFrame(moveTimer.current);
    moveTimer.current = null;
    moveRef.current = null;
    heldKeys.current.clear();
    pointerRef.current = null;
    panRef.current = null;
    composing.current = false;
  }, []);
  const releaseInput = useCallback(() => {
    clearLocalInput();
    if (streamModeRef.current) streamRef.current?.send({ kind: "release_all" });
  }, [clearLocalInput]);

  const handBack = useCallback(async () => {
    const original = agentRef.current, stream = streamRef.current;
    const sessionId = sessionRef.current, signal = abortRef.current?.signal;
    if (!original?.handBack || original.busy || handoffRef.current) return;
    if (completedHandoff.current && (original.handoffKey ? completedHandoff.current.key === original.handoffKey
      : completedHandoff.current.callback === original.onHandBack)) return;
    const attempt = {}; handoffRef.current = attempt;
    setHandingBack(true); setHandoffFrozen(true);
    clearLocalInput();
    const sameSession = () => handoffRef.current === attempt && !closedRef.current && !signal?.aborted
      && sessionRef.current === sessionId && streamRef.current === stream;
    const current = () => sameSession() && phaseRef.current === "active"
      && (original.handoffKey ? agentRef.current?.handoffKey === original.handoffKey : agentRef.current?.onHandBack === original.onHandBack);
    try {
      if (!streamModeRef.current || !stream?.releaseForHandoff) throw new Error("input_ack_unknown");
      await stream.releaseForHandoff();
      const latest = agentRef.current;
      if (!current() || !latest?.handBack || latest.busy
        || (original.handoffKey ? latest.handoffKey !== original.handoffKey : latest.onHandBack !== original.onHandBack)) throw new Error("input_ack_unknown");
      const confirmed = await latest.onHandBack();
      if (!current()) return;
      if (confirmed !== true) throw new Error("input_ack_unknown");
      clearLocalInput(); stream.finishHandoff(); completedHandoff.current = {key: original.handoffKey, callback: original.onHandBack}; setHandoffDone(true); handoffRef.current = null; setHandoffFrozen(false);
    } catch {
      if (sameSession()) setMessage("没有收到电脑控制的确认，请核对最新状态；不会自动重复操作。");
    } finally { if (sameSession() || handoffRef.current === null && !closedRef.current) setHandingBack(false); }
  }, [clearLocalInput]);

  const invalidateMediaFrame = useCallback(() => {
    releaseInput();
    mediaFrameGeometry.current = null;
    frameRef.current = null;
    setFrame(null);
    setMediaReady(false);
    setMediaNotice("已发出请求，等这台电脑显示画面…");
  }, [releaseInput]);

  const acceptMediaStatus = useCallback((status: RemoteMediaStatus | null) => {
    const previous = mediaGeometryKey(mediaStatusRef.current);
    const next = mediaGeometryKey(status);
    mediaStatusRef.current = status;
    setMediaStatus(status);
    if (mediaModeRef.current === "artc" && (!next || next !== previous)) invalidateMediaFrame();
  }, [invalidateMediaFrame]);

  const disconnect = useCallback(() => {
    if (closedRef.current) return;
    releaseInput();
    closedRef.current = true;
    streamRef.current?.close();
    streamRef.current = null;
    abortRef.current?.abort();
    queueRef.current = [];
    pumpingRef.current = null;
    if (toolbarTimer.current) clearTimeout(toolbarTimer.current);
    if (sessionRef.current) {
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      previousCloseRef.current = client.closeSession(deviceId, sessionId).catch(() => {});
    }
  }, [client, deviceId, releaseInput]);

  useEffect(() => {
    if (ticket !== reconnectTicket.current) reconnectAttempts.current = 0;
    const abort = new AbortController();
    abortRef.current = abort;
    closedRef.current = false;
    handoffRef.current = null; completedHandoff.current = null; setHandoffDone(false); setHandingBack(false); setHandoffFrozen(false);
    sessionRef.current = null;
    streamRef.current = null;
    streamModeRef.current = false;
    sequenceRef.current = 0;
    setKeyboard(false);
    frameRef.current = null;
    setFrame(null);
    mediaModeRef.current = "legacy";
    mediaStatusRef.current = null;
    mediaFrameGeometry.current = null;
    setMediaMode("legacy"); setMediaReady(false); setMediaStatus(null); setDisplayId(undefined); setFit(true); setPanMode(false); setMediaNotice(""); setMessage("");
    viewOnlyRef.current = false; setAccess(null); setBilling(null); laneRef.current = null; setMediaDiagnostic(null);
    const acceptAccess = (value: RemoteDesktopAccess | null) => {
      viewOnlyRef.current = value?.input_allowed === false;
      setAccess(value);
    };
    updatePhase(ticket && !ticket.spent ? "starting" : "idle");
    const previousOverflow = document.body.style.overflow;
    let mediaAttempted = false, mediaDescriptorSeen = false;
    document.body.style.overflow = "hidden";
    setCoarse(Boolean(window.matchMedia?.("(pointer: coarse)").matches));
    const end = (error?: string, status?: number) => {
      disconnect();
      setFrame(null);
      if ((error === "network_error" || error === "stream_failed") && reconnectAttempts.current === 0) {
        reconnectAttempts.current++;
        const next = remoteDesktopTicket();
        reconnectTicket.current = next;
        setTicket(next);
        updatePhase("starting");
        revealToolbar();
        return;
      }
      updatePhase(terminal(error));
      setMessage(remoteDesktopErrorCopy(error, status));
      revealToolbar();
    };
    const connect = async () => {
      // Allow cleanup to finish first, but a broken network must not stall the retry indefinitely.
      await Promise.race([previousCloseRef.current, wait(1500, abort.signal)]);
      if (abort.signal.aborted) return;
      const result = await client.createSession(deviceId, { signal: abort.signal });
      if (abort.signal.aborted) {
        if (result.ok && result.data) void client.closeSession(deviceId, result.data.session_id).catch(() => {});
        return;
      }
      if (!result.ok || !result.data) { end(result.error, result.status); return; }
      sessionRef.current = result.data.session_id;
      if (result.data.billing) setBilling(result.data.billing);
      updatePhase(result.data.state === "pending_consent" ? "waiting" : "connecting");
      if (client.openStream && result.data.transport === "websocket-v2") {
        streamModeRef.current = true;
        const opened = await client.openStream(deviceId, result.data.session_id, {
          state(state, error) {
            if (abort.signal.aborted) return;
            if (state === "closed") end(error || "session_closed");
            else {
              if (state === "active" && client.negotiateMedia && !mediaAttempted) {
                mediaAttempted = true;
                mediaModeRef.current = "artc"; setMediaMode("artc"); setFrame(null);
              }
              updatePhase(state === "pending_consent" ? "waiting" : state);
            }
          },
          frame(value) {
            if (abort.signal.aborted || phaseRef.current !== "active") return;
            if (mediaModeRef.current === "artc") { streamRef.current?.acknowledgeFrame(value.sequence); return; }
            setFrame(value);
          },
          media(media, status) {
            if (abort.signal.aborted) return;
            acceptMediaStatus(status);
            if (status?.state === "failed") { end(status.error || "media_capture_or_publish_failed"); return; }
            // Video is fine but input cannot reach the target (admin window, lock screen): say so, keep the session.
            const notice = remoteDesktopNoticeCopy(status?.error);
            setMessage((current) => notice ? notice : current && [remoteDesktopNoticeCopy("input_target_elevated"), remoteDesktopNoticeCopy("screen_locked")].includes(current) ? "" : current);
            // A missing descriptor before negotiation is normal. After activation it revokes video.
            if (media) mediaDescriptorSeen = true;
            else if (mediaDescriptorSeen) end("media_session_closed");
          },
          error(code) { if (!abort.signal.aborted) end(code); },
          congestion(busy) {
            if (abort.signal.aborted) return;
            setMessage((current) => busy ? "输入队列暂时繁忙，请稍后重试。" : current === "输入队列暂时繁忙，请稍后重试。" ? "" : current);
          },
          session(info) {
            if (abort.signal.aborted) return;
            if (info.access?.input_allowed === false && !viewOnlyRef.current) releaseInput();
            acceptAccess(info.access);
            setBilling(info.billing);
          },
          inputRefused() {
            if (abort.signal.aborted) return;
            acceptAccess({ input_allowed: false, audio: false });
            setMessage("对方仅允许查看，输入没有发送。");
          },
        }, { signal: abort.signal });
        if (abort.signal.aborted) opened.data?.close();
        else if (opened.ok && opened.data) { streamRef.current = opened.data; opened.data.attachDataChannel?.(laneRef.current); }
        else end(opened.error, opened.status);
        return;
      }
      streamModeRef.current = false;
      let failures = 0;
      while (!abort.signal.aborted && !closedRef.current) {
        const response = await client.getFrame(deviceId, result.data.session_id, { signal: abort.signal });
        if (abort.signal.aborted) break;
        if (!response.ok || !response.data) {
          if (++failures >= 6 || [401, 403, 404, 410].includes(response.status || 0)) { end(response.error, response.status); break; }
        } else {
          failures = 0;
          const value = response.data;
          if (value.state === "closed") { end(value.error); break; }
          const previous = frameRef.current;
          if (value.state !== "active" || !value.frame || (previous && (previous.width !== value.frame.width || previous.height !== value.frame.height))) releaseInput();
          updatePhase(value.state === "pending_consent" ? "waiting" : value.state);
          setFrame(value.state === "active" ? value.frame : null);
        }
        await wait(frameIntervalMs, abort.signal);
      }
    };
    // One session request per fresh ticket: a click or the single network retry. Spent in a
    // microtask: React's dev double run of a new effect (StrictMode) cleans the
    // first run up synchronously, so only the second one sends. A remount,
    // reload, back/forward or Fast Refresh re-run finds it spent and stays idle.
    let cancelled = false;
    if (ticket && !ticket.spent) {
      queueMicrotask(() => {
        if (cancelled || abort.signal.aborted || ticket.spent) return;
        ticket.spent = true;
        connect().catch(() => { if (!abort.signal.aborted) end("network_error"); });
      });
    }
    return () => {
      cancelled = true;
      disconnect();
      document.body.style.overflow = previousOverflow;
      releaseRemoteDesktopFullscreen();
    };
  }, [client, deviceId, disconnect, frameIntervalMs, releaseInput, revealToolbar, updatePhase, ticket, acceptMediaStatus]);

  useEffect(() => {
    if (phase === "active") {
      revealToolbar();
      if (!window.matchMedia?.("(pointer: coarse)").matches) inputRef.current?.focus({ preventScroll: true });
    }
  }, [phase, revealToolbar]);

  useEffect(() => {
    const blur = () => { releaseInput(); revealToolbar(); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", disconnect);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", blur);
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", disconnect);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", blur);
    };
  }, [disconnect, releaseInput, revealToolbar]);

  const sendText = useCallback((text: string) => {
    flushClick();
    flushMove();
    const paste = clampPaste(sanitizeRemoteText(text));
    for (const part of chunkText(paste.text)) send({ kind: "type", text: part });
    if (paste.truncated) setMessage("文字太长，只发送了前面一部分。");
  }, [flushClick, flushMove, send]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let claimed: string | null = null;
    let compositionEpoch: number | null = null;
    const start = () => { flushClick(); releaseInput(); if (canSend()) { composing.current = true; compositionEpoch = inputEpoch.current; } };
    const end = (event: CompositionEvent) => { const valid = composing.current && compositionEpoch === inputEpoch.current; compositionEpoch = null; composing.current = false; input.value = ""; if (valid) sendText(event.data || ""); };
    const before = (event: InputEvent) => {
      const kind = classifyInput(event.inputType, composing.current || event.isComposing);
      const action = softInputKeyAction(kind);
      if (!action) return;
      flushClick();
      if (event.cancelable) event.preventDefault();
      if (!event.defaultPrevented) { claimed = kind; setTimeout(() => { claimed = null; }, 0); }
      send(action);
    };
    const insert = (event: InputEvent) => {
      if (composing.current || event.isComposing) return;
      const kind = classifyInput(event.inputType, false);
      const value = input.value;
      input.value = "";
      const already = claimed; claimed = null;
      const action = softInputKeyAction(kind);
      if (action) { if (already !== kind) { flushClick(); send(action); } return; }
      if (kind !== "text" || (event.data && !value.includes(event.data))) return;
      sendText(event.data || value);
    };
    const paste = (event: ClipboardEvent) => { event.preventDefault(); flushClick(); releaseInput(); sendText(event.clipboardData?.getData("text/plain") || ""); };
    input.addEventListener("compositionstart", start);
    input.addEventListener("compositionend", end);
    input.addEventListener("beforeinput", before as EventListener);
    input.addEventListener("input", insert as EventListener);
    input.addEventListener("paste", paste);
    return () => {
      input.removeEventListener("compositionstart", start); input.removeEventListener("compositionend", end);
      input.removeEventListener("beforeinput", before as EventListener); input.removeEventListener("input", insert as EventListener); input.removeEventListener("paste", paste);
    };
  }, [canSend, flushClick, releaseInput, send, sendText]);

  const point = (event: { clientX: number; clientY: number }, strict = true) => {
    if (mediaModeRef.current === "artc" && (!mediaFrameGeometry.current || mediaFrameGeometry.current !== mediaGeometryKey(mediaStatusRef.current))) return null;
    const image = mediaModeRef.current === "artc" ? videoRef.current : imageRef.current, current = frameRef.current;
    if (!image || !current) return null;
    const rect = containedRect(image.getBoundingClientRect(), current.width, current.height);
    if (strict && !insideRect(event.clientX, event.clientY, rect)) return null;
    return toNormalized(event.clientX, event.clientY, rect);
  };

  function syncModifiers(event: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }, exclude?: string) {
    if (!streamModeRef.current || !canSend()) return;
    for (const [name, pressed] of [["Control", event.ctrlKey], ["Shift", event.shiftKey], ["Alt", event.altKey], ["Meta", event.metaKey]] as const) {
      if (exclude === name) continue;
      const matches = [...heldKeys.current].filter(([, key]) => key === name);
      if (pressed && !matches.length) {
        heldKeys.current.set(`modifier:${name}`, name);
        send({ kind: "key_down", key: name });
      } else if (!pressed && matches.length) {
        for (const [id] of matches) heldKeys.current.delete(id);
        send({ kind: "key_up", key: name });
      }
    }
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (phaseRef.current !== "active") return;
    if (panModeRef.current && !fit) {
      event.preventDefault(); releaseInput();
      panRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    if (pointerRef.current && pointerRef.current.id !== event.pointerId) { releaseInput(); return; }
    const p = point(event), button = mouseButton(event.button);
    if (!p || !button) return;
    event.preventDefault();
    if (event.pointerType !== "touch" || keyboard) inputRef.current?.focus({ preventScroll: true });
    else event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    flushMove();
    syncModifiers(event);
    pointerRef.current = { id: event.pointerId, pointerType: event.pointerType, ...p, button, buttons: new Set([button]) };
    if (streamModeRef.current) send({ kind: "pointer_down", ...p, button });
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.clientY < 70) revealToolbar();
    const pan = panRef.current;
    if (pan && pan.id === event.pointerId) {
      event.currentTarget.scrollLeft = pan.left + pan.x - event.clientX;
      event.currentTarget.scrollTop = pan.top + pan.y - event.clientY;
      return;
    }
    if (panModeRef.current) return;
    if (!streamModeRef.current || phaseRef.current !== "active") return;
    if (event.pointerType === "touch" && !pointerRef.current) return;
    const p = point(event, !pointerRef.current);
    if (!p) return;
    syncModifiers(event);
    // Chorded mouse buttons are pointermove events in the Pointer Events API.
    if (pointerRef.current && event.pointerType !== "touch" && event.buttons) {
      const down = pointerRef.current;
      for (const [button, mask] of [["left", 1], ["right", 2], ["middle", 4]] as const) {
        if (Boolean(event.buttons & mask) === down.buttons.has(button)) continue;
        flushMove();
        if (event.buttons & mask) { down.buttons.add(button); send({ kind: "pointer_down", ...p, button }); }
        else { down.buttons.delete(button); send({ kind: "pointer_up", ...p, button }); }
      }
    }
    moveRef.current = { kind: "move", ...p };
    if (moveTimer.current === null) moveTimer.current = nextFrame(flushMove);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (panRef.current?.id === event.pointerId) { panRef.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); return; }
    const down = pointerRef.current;
    if (!down || down.id !== event.pointerId) return;
    const p = point(event, false);
    flushMove();
    if (p) {
      if (streamModeRef.current) for (const button of down.buttons) send({ kind: "pointer_up", ...p, button });
      else {
        const current = frameRef.current;
        const image = imageRef.current;
        const rect = image && current ? containedRect(image.getBoundingClientRect(), current.width, current.height) : null;
        if (rect && isPointerDrag(down.pointerType, down, p, rect)) {
          flushClick();
          send({ kind: "drag", x: down.x, y: down.y, toX: p.x, toY: p.y, button: down.button });
        } else if (down.button !== "left") {
          flushClick(); send({ kind: "click", ...p, button: down.button });
        } else if (pendingClick.current && isNearby(pendingClick.current, p)) {
          if (clickTimer.current) clearTimeout(clickTimer.current);
          clickTimer.current = null; pendingClick.current = null;
          send({ kind: "double_click", ...p, button: "left" });
        } else {
          flushClick(); pendingClick.current = p;
          clickTimer.current = setTimeout(flushClick, Math.max(0, doubleClickWindowMs));
        }
      }
    } else releaseInput();
    pointerRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && event.ctrlKey && event.altKey && event.shiftKey) { event.preventDefault(); releaseInput(); revealToolbar(); return; }
    if (!canSend() || composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || ["Process", "Dead", "Unidentified"].includes(event.key)) return;
    // Paste must reach the browser clipboard event so its text travels naturally.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
    flushMove();
    if (!streamModeRef.current) {
      const action = keyEventToAction(event);
      if (action) { event.preventDefault(); flushClick(); send(action); }
      return;
    }
    const mappedKey = remoteKeyboardKey(remoteChordKey(event));
    if (!mappedKey) return;
    event.preventDefault();
    syncModifiers(event, event.key);
    const id = event.code || event.key;
    const key = heldKeys.current.get(id) || mappedKey;
    const alreadyHeld = [...heldKeys.current.values()].includes(key);
    if (!heldKeys.current.has(id)) heldKeys.current.set(id, key);
    // Left/right modifiers share one native key: release only after both lift.
    if (!["Control", "Shift", "Alt", "Meta"].includes(key) || !alreadyHeld) send({ kind: "key_down", key });
  }

  function keyUp(event: KeyboardEvent<HTMLDivElement>) {
    const id = event.code || event.key, key = heldKeys.current.get(id);
    if (!key) { syncModifiers(event); return; }
    event.preventDefault();
    flushMove();
    heldKeys.current.delete(id);
    if (![...heldKeys.current.values()].includes(key)) send({ kind: "key_up", key });
    syncModifiers(event);
    if (key === "Meta" && ![...heldKeys.current.values()].includes("Meta")) releaseInput();
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const wheel = (event: WheelEvent) => {
      if (panModeRef.current) return;
      const p = point(event);
      if (!p || phaseRef.current !== "active") return;
      event.preventDefault(); flushClick(); flushMove();
      const factor = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? stage.clientHeight : 1;
      const clamp = (value: number) => Math.max(-10_000, Math.min(10_000, value * factor));
      send({ kind: "scroll", ...p, deltaX: clamp(event.deltaX), deltaY: clamp(event.deltaY) });
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [flushClick, flushMove, send]);

  if (!portal) return null;
  const active = phase === "active";
  // `direct`: the computer approves without a dialog, so this is only the connection; `ask`: a person must approve there.
  const waiting = consent === "direct" ? CLOUD_AGENT_COPY.statusConnecting : consent === "ask" ? CLOUD_AGENT_COPY.waitConsent : "等待这台电脑确认…";
  const reconnecting = ticket === reconnectTicket.current && ["starting", "waiting", "connecting"].includes(phase);
  // Ended sessions: the top bar says only 「已断开」; the full reason is shown once, in the center.
  const ended = !active && !reconnecting && !["idle", "starting", "waiting", "connecting"].includes(phase);
  const status = reconnecting ? "网络连接中断，正在重新连接…" : phase === "idle" ? CLOUD_AGENT_COPY.remoteIdle : phase === "starting" ? "正在请求这台电脑…" : phase === "waiting" ? waiting : phase === "connecting" ? "已发出请求，等这台电脑显示画面…" : active ? "已连接" : message || "远程会话已结束。";
  return createPortal(
    <div data-oceanleo-remote-desktop data-remote-phase={phase} data-remote-media={mediaMode} data-remote-video-ready={mediaReady}
      data-remote-media-blocked-host={mediaDiagnostic?.blocked_host} data-remote-media-sdk-error={mediaDiagnostic?.sdk_error} style={{ position: "fixed", inset: 0, zIndex: 2147483647, background: "#08090b", color: "#fff", width: "100%", height: "100dvh", overflow: "hidden" }}>
      <div ref={stageRef} data-remote-stage tabIndex={0} aria-label={tt("远程桌面")}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={releaseInput} onLostPointerCapture={() => { if (pointerRef.current) releaseInput(); }}
        onKeyDown={keyDown} onKeyUp={keyUp} onContextMenu={(event) => event.preventDefault()}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) releaseInput(); }}
        /* D6: the controller's own OS cursor stays visible over the video; no remote cursor is drawn. */
        style={{ position: "absolute", inset: 0, outline: "none", touchAction: "none", userSelect: "none", cursor: panMode && !fit ? "grab" : "default", overflow: fit ? "hidden" : "auto" }}>
        {mediaMode === "artc" && active && sessionRef.current ? <RemoteDesktopVideo client={client} deviceId={deviceId} sessionId={sessionRef.current} videoRef={videoRef} displayId={displayId}
          fit={fit} width={frame?.width} height={frame?.height}
          onDataChannel={(lane) => { laneRef.current = lane; streamRef.current?.attachDataChannel?.(lane); }}
          onDiagnostic={setMediaDiagnostic}
          onFrame={(width, height) => {
            const status = mediaStatusRef.current;
            const geometry = mediaGeometryKey(status);
            if (!geometry || (displayId && status?.geometry?.display_id !== displayId) || !mediaFrameMatches(status, width, height)) return;
            if (mediaFrameGeometry.current !== geometry || !frameRef.current || frameRef.current.width !== width || frameRef.current.height !== height) {
              const next = { image: "", width, height, sequence: 0 }; frameRef.current = next; setFrame(next);
            }
            mediaFrameGeometry.current = geometry;
            setMediaReady(true);
          }}
          onState={(value, error, status) => {
            if (value !== "playing") invalidateMediaFrame();
            setMediaNotice(value === "playing" && mediaFrameGeometry.current ? "" : value === "reconnecting" ? "连接不稳，正在重试…" : "已发出请求，等这台电脑显示画面…");
            if (value === "error") { disconnect(); updatePhase(terminal(error)); setMessage(remoteDesktopErrorCopy(error, status)); revealToolbar(); }
          }}
          onLegacy={() => { mediaModeRef.current = "legacy"; setMediaMode("legacy"); setMediaNotice("「{name}」上的 OceanLeo 当前没有视频能力。"); }}
          onStatus={acceptMediaStatus} /> : frame && active ? <img ref={imageRef} data-remote-frame src={frame.image} alt={tt("远程桌面画面，点击后可用键盘")} draggable={false}
          onLoad={() => streamRef.current?.acknowledgeFrame(frame.sequence)}
          onError={() => { releaseInput(); disconnect(); updatePhase("error"); setFrame(null); setMessage("画面无法显示，请重新连接。"); }}
          style={remoteFrameStyle(fit, frame.width, frame.height)} /> :
          <div role="status" style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 14 }}>{tt(status, { host: mediaDiagnostic?.blocked_host ?? "", code: String(mediaDiagnostic?.sdk_error ?? "") })}</div>}
        {mediaMode === "artc" && active && !mediaReady ? <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#08090be8", pointerEvents: "none" }}>{tt(mediaNotice)}</div> : null}
        <textarea ref={inputRef} data-remote-input aria-label={tt("远程桌面键盘输入")} disabled={!active || !frame || (mediaMode === "artc" && !mediaReady)} inputMode={coarse && !keyboard ? "none" : "text"}
          autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
          style={{ position: "absolute", left: "50%", top: "50%", width: 1, height: 1, opacity: 0, padding: 0, border: 0, resize: "none" }} />
      </div>
      <div onPointerEnter={revealToolbar} onFocus={revealToolbar} style={{ position: "absolute", top: "max(12px, env(safe-area-inset-top))", left: "50%", transform: `translate(-50%, ${toolbar || !active ? "0" : "-150%"})`, transition: "transform .18s", display: "flex", alignItems: "center", gap: 16, padding: "9px 14px", borderRadius: 12, background: "rgba(25,28,32,.92)", maxWidth: "calc(100% - 24px)", fontSize: 12, boxShadow: "0 4px 24px #0006" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deviceName}</span>
        <span role="status" style={{ opacity: .65, whiteSpace: "nowrap" }}>{tt(active && mediaMode === "artc" && !mediaReady ? "已发出请求，等这台电脑显示画面…" : active ? "已连接" : ended ? "已断开" : status, { host: mediaDiagnostic?.blocked_host ?? "", code: String(mediaDiagnostic?.sdk_error ?? "") })}{frame && active ? ` · ${frame.width}×${frame.height}` : ""}</span>
        {active && access?.input_allowed === false ? <span data-remote-view-only style={{ whiteSpace: "nowrap", color: "#f5c76b" }}>{tt("对方仅允许查看")}</span> : null}
        {active && billing ? <span data-remote-billing style={{ opacity: .65, whiteSpace: "nowrap" }}>{tt("按分钟从账户余额扣费 · {price}/分钟 · 已计 {minutes} 分钟", { price: billingPrice(billing), minutes: String(billing.charged_minutes) })}</span> : null}
        {/* D7: one icon toggle, the tooltip names what a click does. */}
        {active ? <button type="button" data-remote-fit-toggle aria-pressed={!fit} aria-label={tt(fit ? "原始大小" : "适应窗口")} title={tt(fit ? "原始大小" : "适应窗口")}
          onClick={() => { releaseInput(); setFit((value) => !value); setPanMode(false); }}
          style={{ display: "inline-grid", placeItems: "center", width: 28, height: 24, padding: 0 }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {fit ? <><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M6 6h4v4H6z" /></> : <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />}
          </svg>
        </button> : null}
        {active && !fit ? <button type="button" aria-pressed={panMode} onClick={() => { releaseInput(); setPanMode((value) => !value); }}>{tt(panMode ? "操作电脑" : "移动画面")}</button> : null}
        {active && (mediaStatus?.displays?.length ?? 0) > 1 ? <select aria-label={tt("显示器")} value={displayId || mediaStatus?.geometry?.display_id || ""} onChange={(event) => { invalidateMediaFrame(); setDisplayId(event.target.value); }}>{mediaStatus?.displays?.map((display) => <option key={display.display_id} value={display.display_id}>{display.label} · {display.width}×{display.height}</option>)}</select> : null}
        {coarse && active ? <button data-remote-keyboard-toggle type="button" aria-pressed={keyboard} onMouseDown={(event) => event.preventDefault()} onClick={() => {
          const next = !keyboard; setKeyboard(next);
          inputRef.current?.setAttribute("inputmode", next ? "text" : "none");
          if (next) inputRef.current?.focus({ preventScroll: true });
          else { inputRef.current?.blur(); stageRef.current?.focus({ preventScroll: true }); releaseInput(); }
        }}>{tt("键盘")}</button> : null}
        <button type="button" onClick={requestRemoteDesktopFullscreen} style={{ whiteSpace: "nowrap" }}>{tt("全屏")}</button>
        {/* Manual clicks start a fresh request and reset the one-retry allowance. */}
        {!active && !["starting", "waiting", "connecting"].includes(phase) ? <button type="button" data-remote-connect onClick={() => { disconnect(); setTicket(remoteDesktopTicket()); }}>{phase === "idle" ? tt("连接") : tt("重新连接")}</button> : null}
        <button type="button" onClick={() => { disconnect(); onClose(); }} style={{ whiteSpace: "nowrap" }}>{tt("退出桌面")}</button>
      </div>
      {agent ? <div data-remote-agent-banner role="status" style={{ position: "absolute", left: "50%", bottom: "max(64px, calc(env(safe-area-inset-bottom) + 56px))", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 10, background: "rgba(25,28,32,.92)", maxWidth: "calc(100% - 24px)", fontSize: 12, boxShadow: "0 4px 24px #0006" }}>
        <span>{tt(agent.text)}</span>
        {agent.note ? <span data-remote-agent-note style={{ opacity: .75 }}>{tt(agent.note)}</span> : null}
        {/* Let go of anything this viewer still holds first: the computer resumes the AI only once no person holds input. */}
        {agent.handBack ? <button type="button" data-remote-agent-hand-back disabled={agent.busy || handingBack || handoffFrozen || (handoffDone && (agent.handoffKey ? completedHandoff.current?.key === agent.handoffKey : completedHandoff.current?.callback === agent.onHandBack))} onClick={() => { void handBack(); }} style={{ whiteSpace: "nowrap" }}>{tt(CLOUD_AGENT_COPY.handBack)}</button> : null}
      </div> : null}
      {active && (message || (mediaMode === "legacy" && mediaNotice)) ? <div role="status" data-remote-input-status style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#25282d", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>{tt(message || mediaNotice, { name: deviceName })}</div> : null}
    </div>, portal,
  );
}
