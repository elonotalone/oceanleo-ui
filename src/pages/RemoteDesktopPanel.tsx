"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { remoteDesktopClient, type RemoteDesktopAction, type RemoteDesktopClient, type RemoteDesktopFrameData, type RemoteDesktopStream } from "../api/remote-desktop";
import { useUI } from "../i18n/ui/useUI";
import { chunkText, clampPaste, classifyInput, containedRect, insideRect, keyEventToAction, mouseButton, remoteDesktopErrorCopy, sanitizeRemoteText, softInputKeyAction, toNormalized } from "./remote-desktop-input";
import { remoteDesktopPortal, releaseRemoteDesktopFullscreen, requestRemoteDesktopFullscreen } from "./remote-desktop-fullscreen";

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
}

type Phase = "starting" | "waiting" | "connecting" | "active" | "closed" | "error" | "denied" | "timed_out" | "revoked" | "signed_out";
const terminal = (code?: string): Phase => code === "denied" ? "denied" : code === "request_expired" ? "timed_out" : code === "signed_out" ? "signed_out" : code === "revoked" || code === "controller_revoked" ? "revoked" : "error";
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, ms);
  if (signal.aborted) done(); else signal.addEventListener("abort", done, { once: true });
});

export function RemoteDesktopPanel({ deviceId, deviceName, client = remoteDesktopClient, onClose, frameIntervalMs = 250 }: RemoteDesktopPanelProps) {
  const tt = useUI();
  const [portal] = useState(remoteDesktopPortal);
  const [phase, setPhase] = useState<Phase>("starting");
  const [frame, setFrame] = useState<RemoteDesktopFrameData | null>(null);
  const [message, setMessage] = useState("");
  const [toolbar, setToolbar] = useState(true);
  const [coarse, setCoarse] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
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
  const pointerRef = useRef<{ id: number; x: number; y: number; button: "left" | "right" | "middle"; buttons: Set<"left" | "right" | "middle"> } | null>(null);
  const composing = useRef(false);
  const moveRef = useRef<RemoteDesktopAction | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  frameRef.current = frame;

  const updatePhase = useCallback((value: Phase) => { phaseRef.current = value; setPhase(value); }, []);
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

  const releaseInput = useCallback(() => {
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = null;
    moveRef.current = null;
    heldKeys.current.clear();
    pointerRef.current = null;
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
    frameRef.current = null;
    setFrame(null);
    updatePhase("starting");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setCoarse(Boolean(window.matchMedia?.("(pointer: coarse)").matches));
    const end = (error?: string) => {
      releaseInput();
      streamRef.current?.close();
      setFrame(null);
      updatePhase(terminal(error));
      setMessage(remoteDesktopErrorCopy(error));
      revealToolbar();
      if (sessionRef.current) void client.closeSession(deviceId, sessionRef.current).catch(() => {});
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
            else updatePhase(state === "pending_consent" ? "waiting" : state);
          },
          frame(value) {
            if (abort.signal.aborted || phaseRef.current !== "active") return;
            setFrame(value);
          },
          error(code) { if (!abort.signal.aborted) end(code); },
        }, { signal: abort.signal });
        if (abort.signal.aborted) opened.data?.close();
        else if (opened.ok && opened.data) streamRef.current = opened.data;
        else end(opened.error);
        return;
      }
      streamModeRef.current = false;
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
  }, [client, deviceId, disconnect, frameIntervalMs, releaseInput, revealToolbar, updatePhase]);

  useEffect(() => {
    if (phase === "active") { revealToolbar(); inputRef.current?.focus({ preventScroll: true }); }
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
    flushMove();
    const paste = clampPaste(sanitizeRemoteText(text));
    for (const part of chunkText(paste.text)) send({ kind: "type", text: part });
    if (paste.truncated) setMessage("文字太长，只发送了前面一部分。");
  }, [flushMove, send]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let claimed: string | null = null;
    const start = () => { releaseInput(); composing.current = true; };
    const end = (event: CompositionEvent) => { composing.current = false; input.value = ""; sendText(event.data || ""); };
    const before = (event: InputEvent) => {
      const kind = classifyInput(event.inputType, composing.current || event.isComposing);
      const action = softInputKeyAction(kind);
      if (!action) return;
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
      if (action) { if (already !== kind) send(action); return; }
      if (kind !== "text" || (event.data && !value.includes(event.data))) return;
      sendText(event.data || value);
    };
    const paste = (event: ClipboardEvent) => { event.preventDefault(); releaseInput(); sendText(event.clipboardData?.getData("text/plain") || ""); };
    input.addEventListener("compositionstart", start);
    input.addEventListener("compositionend", end);
    input.addEventListener("beforeinput", before as EventListener);
    input.addEventListener("input", insert as EventListener);
    input.addEventListener("paste", paste);
    return () => {
      input.removeEventListener("compositionstart", start); input.removeEventListener("compositionend", end);
      input.removeEventListener("beforeinput", before as EventListener); input.removeEventListener("input", insert as EventListener); input.removeEventListener("paste", paste);
    };
  }, [releaseInput, send, sendText]);

  const point = (event: { clientX: number; clientY: number }, strict = true) => {
    const image = imageRef.current, current = frameRef.current;
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
    if (pointerRef.current && pointerRef.current.id !== event.pointerId) { releaseInput(); return; }
    const p = point(event), button = mouseButton(event.button);
    if (!p || !button) return;
    event.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    flushMove();
    syncModifiers(event);
    pointerRef.current = { id: event.pointerId, ...p, button, buttons: new Set([button]) };
    if (streamModeRef.current) send({ kind: "pointer_down", ...p, button });
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.clientY < 70) revealToolbar();
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
    const down = pointerRef.current;
    if (!down || down.id !== event.pointerId) return;
    const p = point(event, false);
    flushMove();
    if (p) {
      if (streamModeRef.current) for (const button of down.buttons) send({ kind: "pointer_up", ...p, button });
      else if (Math.hypot(p.x - down.x, p.y - down.y) > .006) send({ kind: "drag", x: down.x, y: down.y, toX: p.x, toY: p.y, button: down.button });
      else send({ kind: "click", ...p, button: down.button });
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
      if (action) { event.preventDefault(); send(action); }
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
      const p = point(event);
      if (!p || phaseRef.current !== "active") return;
      event.preventDefault(); flushMove();
      const factor = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? stage.clientHeight : 1;
      const clamp = (value: number) => Math.max(-10_000, Math.min(10_000, value * factor));
      send({ kind: "scroll", ...p, deltaX: clamp(event.deltaX), deltaY: clamp(event.deltaY) });
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [flushMove, send]);

  if (!portal) return null;
  const active = phase === "active";
  const status = phase === "starting" ? "正在请求这台电脑…" : phase === "waiting" ? "等待这台电脑确认…" : phase === "connecting" ? "已发出请求，等这台电脑显示画面…" : active ? "已连接" : message || "远程会话已结束。";
  return createPortal(
    <div data-oceanleo-remote-desktop data-remote-phase={phase} style={{ position: "fixed", inset: 0, zIndex: 2147483647, background: "#08090b", color: "#fff", width: "100%", height: "100dvh", overflow: "hidden" }}>
      <div ref={stageRef} data-remote-stage tabIndex={0} aria-label={tt("远程桌面")}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={releaseInput} onLostPointerCapture={() => { if (pointerRef.current) releaseInput(); }}
        onKeyDown={keyDown} onKeyUp={keyUp} onContextMenu={(event) => event.preventDefault()}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) releaseInput(); }}
        style={{ position: "absolute", inset: 0, outline: "none", touchAction: "none", userSelect: "none" }}>
        {frame && active ? <img ref={imageRef} data-remote-frame src={frame.image} alt={tt("远程桌面画面，点击后可用键盘")} draggable={false}
          onLoad={() => streamRef.current?.acknowledgeFrame(frame.sequence)}
          onError={() => { releaseInput(); disconnect(); updatePhase("error"); setFrame(null); setMessage("画面无法显示，请重新连接。"); }}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} /> :
          <div role="status" style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 14 }}>{tt(status)}</div>}
        <textarea ref={inputRef} data-remote-input aria-label={tt("远程桌面键盘输入")} disabled={!active} inputMode={coarse && !keyboard ? "none" : "text"}
          autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
          style={{ position: "absolute", left: "50%", top: "50%", width: 1, height: 1, opacity: 0, padding: 0, border: 0, resize: "none" }} />
      </div>
      <div onPointerEnter={revealToolbar} onFocus={revealToolbar} style={{ position: "absolute", top: "max(12px, env(safe-area-inset-top))", left: "50%", transform: `translate(-50%, ${toolbar || !active ? "0" : "-150%"})`, transition: "transform .18s", display: "flex", alignItems: "center", gap: 16, padding: "9px 14px", borderRadius: 12, background: "rgba(25,28,32,.92)", maxWidth: "calc(100% - 24px)", fontSize: 12, boxShadow: "0 4px 24px #0006" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deviceName}</span>
        <span role="status" style={{ opacity: .65, whiteSpace: "nowrap" }}>{tt(active ? "已连接" : status)}{frame && active ? ` · ${frame.width}×${frame.height}` : ""}</span>
        {coarse && active ? <button data-remote-keyboard-toggle type="button" onClick={() => { setKeyboard(true); inputRef.current?.setAttribute("inputmode", "text"); inputRef.current?.focus({ preventScroll: true }); }}>{tt("键盘")}</button> : null}
        <button type="button" onClick={requestRemoteDesktopFullscreen} style={{ whiteSpace: "nowrap" }}>{tt("全屏")}</button>
        <button type="button" onClick={() => { disconnect(); onClose(); }} style={{ whiteSpace: "nowrap" }}>{tt("退出桌面")}</button>
      </div>
      {active && message ? <div role="status" style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#25282d", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>{tt(message)}</div> : null}
    </div>, portal,
  );
}
