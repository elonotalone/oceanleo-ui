"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { remoteDesktopClient, type RemoteDesktopAction, type RemoteDesktopClient, type RemoteDesktopFrameData, type RemoteDesktopStream, type RemoteMediaStatus } from "../api/remote-desktop";
import { RemoteDesktopVideo } from "./RemoteDesktopVideo";
import { useUI } from "../i18n/ui/useUI";
import { chunkText, clampPaste, classifyInput, containedRect, insideRect, isNearby, isPointerDrag, keyEventToAction, mouseButton, remoteDesktopErrorCopy, sanitizeRemoteText, softInputKeyAction, toNormalized } from "./remote-desktop-input";
import { remoteDesktopPortal, releaseRemoteDesktopFullscreen, requestRemoteDesktopFullscreen } from "./remote-desktop-fullscreen";
import { CLOUD_AGENT_COPY } from "../lib/local-agent-task";

export { requestRemoteDesktopFullscreen } from "./remote-desktop-fullscreen";

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
   * The cloud assistant working on this computer for the task the panel was
   * opened from (device-link protocol §13, bridge doc §17.6). Banner and hand
   * back only: the media and input paths are unchanged.
   */
  agent?: RemoteDesktopAgentBanner;
}

export interface RemoteDesktopAgentBanner {
  /** Chinese source sentence from `CLOUD_AGENT_COPY`, rendered through `tt`. */
  text: string;
  /** Offer 交还给 AI (the AI is paused and the owner may resume it). */
  handBack: boolean;
  busy: boolean;
  /** One revision-fenced `resume`; the computer re-observes before acting. */
  onHandBack: () => void;
}

type Phase = "starting" | "waiting" | "connecting" | "active" | "closed" | "error" | "denied" | "timed_out" | "revoked" | "signed_out";
const terminal = (code?: string): Phase => code === "denied" ? "denied" : code === "request_expired" ? "timed_out" : code === "signed_out" ? "signed_out" : code === "revoked" || code === "controller_revoked" ? "revoked" : "error";
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, ms);
  if (signal.aborted) done(); else signal.addEventListener("abort", done, { once: true });
});

export function RemoteDesktopPanel({ deviceId, deviceName, client = remoteDesktopClient, onClose, frameIntervalMs = 250, doubleClickWindowMs = 220, agent }: RemoteDesktopPanelProps) {
  const tt = useUI();
  const [portal] = useState(remoteDesktopPortal);
  const [phase, setPhase] = useState<Phase>("starting");
  const [frame, setFrame] = useState<RemoteDesktopFrameData | null>(null);
  const [message, setMessage] = useState("");
  const [congested, setCongested] = useState(false);
  const [toolbar, setToolbar] = useState(true);
  const [coarse, setCoarse] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mediaMode, setMediaMode] = useState<"legacy" | "artc">("legacy");
  const mediaModeRef = useRef<"legacy" | "artc">("legacy");
  const [mediaStatus, setMediaStatus] = useState<RemoteMediaStatus | null>(null);
  const mediaStatusRef = useRef<RemoteMediaStatus | null>(null);
  const [displayId, setDisplayId] = useState<string>();
  const [zoom, setZoom] = useState(1);
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
  const queueRef = useRef<RemoteDesktopAction[]>([]);
  const pumpingRef = useRef(false);
  const sequenceRef = useRef(0);
  const heldKeys = useRef(new Map<string, string>());
  const pointerRef = useRef<{ id: number; pointerType: string; x: number; y: number; button: "left" | "right" | "middle"; buttons: Set<"left" | "right" | "middle"> } | null>(null);
  const pendingClick = useRef<{ x: number; y: number } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const moveRef = useRef<RemoteDesktopAction | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      while (queueRef.current.length && !closedRef.current && sessionRef.current) {
        const action = queueRef.current.shift()!;
        const result = await client.sendInput(deviceId, sessionRef.current, ++sequenceRef.current, action, { signal: abortRef.current?.signal });
        if (!result.ok && !abortRef.current?.signal.aborted) {
          // Unknown ACK must never be replayed. End the session, including held input.
          queueRef.current = [];
          updatePhase(terminal(result.error));
          setFrame(null);
          setMessage(remoteDesktopErrorCopy(result.error, result.status));
          if (sessionRef.current) void client.closeSession(deviceId, sessionRef.current).catch(() => {});
          break;
        }
      }
    } finally { pumpingRef.current = false; }
  }, [client, deviceId, updatePhase]);

  const send = useCallback((action: RemoteDesktopAction) => {
    if (closedRef.current || phaseRef.current !== "active" || !frameRef.current) return;
    if (streamModeRef.current) { streamRef.current?.send(action); return; }
    if (queueRef.current.length >= 64) { setMessage("操作太快，部分输入被丢弃了。"); return; }
    queueRef.current.push(action);
    void pump();
  }, [pump]);

  const flushMove = useCallback(() => {
    if (moveTimer.current) clearTimeout(moveTimer.current);
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

  const releaseInput = useCallback(() => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = null;
    pendingClick.current = null;
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = null;
    moveRef.current = null;
    heldKeys.current.clear();
    pointerRef.current = null;
    panRef.current = null;
    composing.current = false;
    if (streamModeRef.current) streamRef.current?.send({ kind: "release_all" });
  }, []);

  const disconnect = useCallback(() => {
    if (closedRef.current) return;
    releaseInput();
    closedRef.current = true;
    streamRef.current?.close();
    streamRef.current = null;
    abortRef.current?.abort();
    queueRef.current = [];
    if (toolbarTimer.current) clearTimeout(toolbarTimer.current);
    if (sessionRef.current) void client.closeSession(deviceId, sessionRef.current).catch(() => {});
  }, [client, deviceId, releaseInput]);

  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    closedRef.current = false;
    sessionRef.current = null;
    streamRef.current = null;
    streamModeRef.current = false;
    sequenceRef.current = 0;
    setKeyboard(false);
    frameRef.current = null;
    setFrame(null);
    setCongested(false);
    mediaModeRef.current = "legacy";
    mediaStatusRef.current = null;
    setMediaMode("legacy"); setMediaReady(false); setMediaStatus(null); setDisplayId(undefined); setZoom(1); setPanMode(false); setMediaNotice(""); setMessage("");
    updatePhase("starting");
    const previousOverflow = document.body.style.overflow;
    let mediaAttempted = false, mediaDescriptorSeen = false;
    document.body.style.overflow = "hidden";
    setCoarse(Boolean(window.matchMedia?.("(pointer: coarse)").matches));
    const end = (error?: string) => {
      disconnect();
      setFrame(null);
      updatePhase(terminal(error));
      setMessage(remoteDesktopErrorCopy(error));
      revealToolbar();
    };
    void (async () => {
      let result = await client.createSession(deviceId, { signal: abort.signal });
      for (let retry = 0; !result.ok && result.error === "session_active" && retry < 2 && !abort.signal.aborted; retry++) {
        await wait(700, abort.signal);
        result = await client.createSession(deviceId, { signal: abort.signal });
      }
      if (abort.signal.aborted) {
        if (result.ok && result.data) void client.closeSession(deviceId, result.data.session_id).catch(() => {});
        return;
      }
      if (!result.ok || !result.data) { end(result.error); return; }
      sessionRef.current = result.data.session_id;
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
            mediaStatusRef.current = status;
            setMediaStatus(status);
            if (status?.state === "failed") end(status.error || "media_unavailable");
            // A missing descriptor before negotiation is normal. After activation it revokes video.
            if (media) mediaDescriptorSeen = true;
            else if (mediaDescriptorSeen) end("media_session_closed");
          },
          error(code) { if (!abort.signal.aborted) end(code); },
          congestion(busy) { if (!abort.signal.aborted) setCongested(busy); },
        }, { signal: abort.signal });
        if (abort.signal.aborted) opened.data?.close();
        else if (opened.ok && opened.data) streamRef.current = opened.data;
        else end(opened.error);
        return;
      }
      streamModeRef.current = false;
      setMediaNotice("兼容画面：请更新电脑客户端以启用流畅视频。");
      let failures = 0;
      while (!abort.signal.aborted && !closedRef.current) {
        const response = await client.getFrame(deviceId, result.data.session_id, { signal: abort.signal });
        if (abort.signal.aborted) break;
        if (!response.ok || !response.data) {
          if (++failures >= 6 || [401, 403, 404, 410].includes(response.status || 0)) { end(response.error); break; }
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
    })().catch(() => { if (!abort.signal.aborted) end("network_error"); });
    return () => {
      disconnect();
      document.body.style.overflow = previousOverflow;
      releaseRemoteDesktopFullscreen();
    };
  }, [client, deviceId, disconnect, frameIntervalMs, releaseInput, revealToolbar, updatePhase, attempt]);

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
    const start = () => { flushClick(); releaseInput(); composing.current = true; };
    const end = (event: CompositionEvent) => { composing.current = false; input.value = ""; sendText(event.data || ""); };
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
  }, [flushClick, releaseInput, send, sendText]);

  const point = (event: { clientX: number; clientY: number }, strict = true) => {
    const image = mediaModeRef.current === "artc" ? videoRef.current : imageRef.current, current = frameRef.current;
    if (!image || !current) return null;
    const rect = containedRect(image.getBoundingClientRect(), current.width, current.height);
    if (strict && !insideRect(event.clientX, event.clientY, rect)) return null;
    return toNormalized(event.clientX, event.clientY, rect);
  };

  function syncModifiers(event: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }, exclude?: string) {
    if (!streamModeRef.current) return;
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
    if (panModeRef.current && zoom > 1) {
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
    if (!moveTimer.current) moveTimer.current = setTimeout(flushMove, 16);
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
    if (phaseRef.current !== "active" || composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || ["Process", "Dead", "Unidentified"].includes(event.key)) return;
    // Paste must reach the browser clipboard event so its text travels naturally.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
    flushMove();
    if (!streamModeRef.current) {
      const action = keyEventToAction(event);
      if (action) { event.preventDefault(); flushClick(); send(action); }
      return;
    }
    if (!event.key) return;
    event.preventDefault();
    syncModifiers(event, event.key);
    const id = event.code || event.key;
    const key = heldKeys.current.get(id) || (event.key === " " ? "Space" : event.key === "OS" ? "Meta" : event.key);
    if (!heldKeys.current.has(id)) heldKeys.current.set(id, key);
    send({ kind: "key_down", key });
  }

  function keyUp(event: KeyboardEvent<HTMLDivElement>) {
    const id = event.code || event.key, key = heldKeys.current.get(id);
    if (!key) { syncModifiers(event); return; }
    event.preventDefault();
    flushMove();
    heldKeys.current.delete(id);
    send({ kind: "key_up", key });
    syncModifiers(event);
    if (key === "Meta") releaseInput();
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
  const status = phase === "starting" ? "正在请求这台电脑…" : phase === "waiting" ? "等待这台电脑确认…" : phase === "connecting" ? "已发出请求，等这台电脑显示画面…" : active ? "已连接" : message || "远程会话已结束。";
  return createPortal(
    <div data-oceanleo-remote-desktop data-remote-phase={phase} data-remote-media={mediaMode} data-remote-video-ready={mediaReady} style={{ position: "fixed", inset: 0, zIndex: 2147483647, background: "#08090b", color: "#fff", width: "100%", height: "100dvh", overflow: "hidden" }}>
      <div ref={stageRef} data-remote-stage tabIndex={0} aria-label={tt("远程桌面")}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={releaseInput} onLostPointerCapture={() => { if (pointerRef.current) releaseInput(); }}
        onKeyDown={keyDown} onKeyUp={keyUp} onContextMenu={(event) => event.preventDefault()}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) releaseInput(); }}
        style={{ position: "absolute", inset: 0, outline: "none", touchAction: "none", userSelect: "none", overflow: zoom > 1 ? "auto" : "hidden" }}>
        {mediaMode === "artc" && active && sessionRef.current ? <RemoteDesktopVideo client={client} deviceId={deviceId} sessionId={sessionRef.current} videoRef={videoRef} displayId={displayId} zoom={zoom}
          onFrame={(width, height) => {
            if (displayId && mediaStatusRef.current?.geometry?.display_id !== displayId) return;
            if (!frameRef.current || frameRef.current.width !== width || frameRef.current.height !== height) {
              const next = { image: "", width, height, sequence: 0 }; frameRef.current = next; setFrame(next);
            }
            setMediaReady(true);
          }}
          onState={(value, error) => {
            if (value !== "playing") { setMediaReady(false); releaseInput(); frameRef.current = null; setFrame(null); }
            setMediaNotice(value === "playing" ? "" : value === "reconnecting" ? "连接不稳，正在重试…" : "已发出请求，等这台电脑显示画面…");
            if (value === "error") { disconnect(); updatePhase("error"); setMessage(remoteDesktopErrorCopy(error)); revealToolbar(); }
          }}
          onLegacy={() => { mediaModeRef.current = "legacy"; setMediaMode("legacy"); setMediaNotice("兼容画面：请更新电脑客户端以启用流畅视频。"); }}
          onStatus={(status) => { mediaStatusRef.current = status; setMediaStatus(status); }} /> : frame && active ? <img ref={imageRef} data-remote-frame src={frame.image} alt={tt("远程桌面画面，点击后可用键盘")} draggable={false}
          onLoad={() => streamRef.current?.acknowledgeFrame(frame.sequence)}
          onError={() => { releaseInput(); disconnect(); updatePhase("error"); setFrame(null); setMessage("画面无法显示，请重新连接。"); }}
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, maxWidth: "none", objectFit: "contain", display: "block" }} /> :
          <div role="status" style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 14 }}>{tt(status)}</div>}
        {mediaMode === "artc" && active && !mediaReady ? <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#08090be8", pointerEvents: "none" }}>{tt(mediaNotice)}</div> : null}
        <textarea ref={inputRef} data-remote-input aria-label={tt("远程桌面键盘输入")} disabled={!active || (mediaMode === "artc" && !mediaReady)} inputMode={coarse && !keyboard ? "none" : "text"}
          autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
          style={{ position: "absolute", left: "50%", top: "50%", width: 1, height: 1, opacity: 0, padding: 0, border: 0, resize: "none" }} />
      </div>
      <div onPointerEnter={revealToolbar} onFocus={revealToolbar} style={{ position: "absolute", top: "max(12px, env(safe-area-inset-top))", left: "50%", transform: `translate(-50%, ${toolbar || !active ? "0" : "-150%"})`, transition: "transform .18s", display: "flex", alignItems: "center", gap: 16, padding: "9px 14px", borderRadius: 12, background: "rgba(25,28,32,.92)", maxWidth: "calc(100% - 24px)", fontSize: 12, boxShadow: "0 4px 24px #0006" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deviceName}</span>
        <span role="status" style={{ opacity: .65, whiteSpace: "nowrap" }}>{tt(active && mediaMode === "artc" && !mediaReady ? "已发出请求，等这台电脑显示画面…" : active ? "已连接" : status)}{frame && active ? ` · ${frame.width}×${frame.height}` : ""}</span>
        {active ? <select aria-label={tt("画面缩放")} value={zoom} onChange={(event) => { releaseInput(); setZoom(Number(event.target.value)); setPanMode(false); }}><option value={1}>{tt("适应窗口")}</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option></select> : null}
        {active && zoom > 1 ? <button type="button" aria-pressed={panMode} onClick={() => { releaseInput(); setPanMode((value) => !value); }}>{tt(panMode ? "操作电脑" : "移动画面")}</button> : null}
        {active && (mediaStatus?.displays?.length ?? 0) > 1 ? <select aria-label={tt("显示器")} value={displayId || mediaStatus?.geometry?.display_id || ""} onChange={(event) => { releaseInput(); setFrame(null); frameRef.current = null; setMediaReady(false); setDisplayId(event.target.value); }}>{mediaStatus?.displays?.map((display) => <option key={display.display_id} value={display.display_id}>{display.label} · {display.width}×{display.height}</option>)}</select> : null}
        {coarse && active ? <button data-remote-keyboard-toggle type="button" aria-pressed={keyboard} onMouseDown={(event) => event.preventDefault()} onClick={() => {
          const next = !keyboard; setKeyboard(next);
          inputRef.current?.setAttribute("inputmode", next ? "text" : "none");
          if (next) inputRef.current?.focus({ preventScroll: true });
          else { inputRef.current?.blur(); stageRef.current?.focus({ preventScroll: true }); releaseInput(); }
        }}>{tt("键盘")}</button> : null}
        <button type="button" onClick={requestRemoteDesktopFullscreen} style={{ whiteSpace: "nowrap" }}>{tt("全屏")}</button>
        {!active && !["starting", "waiting", "connecting"].includes(phase) ? <button type="button" onClick={() => { disconnect(); setAttempt((value) => value + 1); }}>{tt("重新连接")}</button> : null}
        <button type="button" onClick={() => { disconnect(); onClose(); }} style={{ whiteSpace: "nowrap" }}>{tt("退出桌面")}</button>
      </div>
      {agent ? <div data-remote-agent-banner role="status" style={{ position: "absolute", left: "50%", bottom: "max(64px, calc(env(safe-area-inset-bottom) + 56px))", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 10, background: "rgba(25,28,32,.92)", maxWidth: "calc(100% - 24px)", fontSize: 12, boxShadow: "0 4px 24px #0006" }}>
        <span>{tt(agent.text)}</span>
        {/* Let go of anything this viewer still holds first: the computer resumes the AI only once no person holds input. */}
        {agent.handBack ? <button type="button" data-remote-agent-hand-back disabled={agent.busy} onClick={() => { releaseInput(); agent.onHandBack(); }} style={{ whiteSpace: "nowrap" }}>{tt(CLOUD_AGENT_COPY.handBack)}</button> : null}
      </div> : null}
      {active && (congested || message || (mediaMode === "legacy" && mediaNotice)) ? <div role="status" data-remote-input-status style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#25282d", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>{tt(congested ? "输入正在等待确认，画面保持连接。" : message || mediaNotice)}</div> : null}
    </div>, portal,
  );
}
