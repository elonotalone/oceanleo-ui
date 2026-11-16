"use client";

import { useCallback, useEffect, type KeyboardEvent, type PointerEvent } from "react";

import { chunkText, clampPaste, classifyInput, containedRect, insideRect, mouseButton, remoteChordKey, remoteKeyboardKey, sanitizeRemoteText, softInputKeyAction, toNormalized } from "./remote-desktop-input";

import type { RemoteDesktopPanelContext } from "./remote-desktop-panel-state";
/** Mouse moves are coalesced to one per display frame (latest wins). */
const nextFrame = (fn: () => void): ReturnType<typeof setTimeout> | number =>
  typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame(fn) : setTimeout(fn, 16);
const cancelFrame = (id: ReturnType<typeof setTimeout> | number) => {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function" && typeof id === "number") window.cancelAnimationFrame(id);
  clearTimeout(id as ReturnType<typeof setTimeout>);
};

import type { useRemoteDesktopSession } from "./remote-desktop-session";
export function useRemoteDesktopInput(context: RemoteDesktopPanelContext, session: ReturnType<typeof useRemoteDesktopSession>, doubleClickWindowMs = 220) {
  const { phase, frame, keyboard, mediaMode, mediaReady, setMessage, videoRef, stageRef, imageRef,
    inputRef, streamModeRef, heldKeys, pointerRef, pendingClick, clickTimer, composing, inputEpoch,
    moveRef, moveTimer, model, releaseInput, inputCleanup, canSend } = context;
  const { send, disconnect } = session;
  const flushMove = useCallback(() => {
    if (moveTimer.current !== null) cancelFrame(moveTimer.current);
    moveTimer.current = null;
    if (moveRef.current) send(moveRef.current);
    moveRef.current = null;
  }, [moveRef, moveTimer, send]);

  const clearInput = useCallback(() => {
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
    composing.current = false;
  }, [clickTimer, composing, heldKeys, inputEpoch, inputRef, moveRef, moveTimer, pendingClick, pointerRef]);
  inputCleanup.current = clearInput;
  useEffect(() => {
    if (phase === "active") {
      if (!window.matchMedia?.("(pointer: coarse)").matches) inputRef.current?.focus({ preventScroll: true });
    }
  }, [inputRef, phase]);

  useEffect(() => {
    const blur = () => { releaseInput(); };
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
  }, [disconnect, releaseInput]);

  const sendText = useCallback((text: string) => {

    flushMove();
    const paste = clampPaste(sanitizeRemoteText(text));
    for (const part of chunkText(paste.text, 200)) send({ kind: "type", text: part });
    if (paste.truncated) setMessage("文字太长，只发送了前面一部分。");
  }, [flushMove, send, setMessage]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let claimed: string | null = null;
    let compositionEpoch: number | null = null;
    const start = () => { releaseInput(); if (canSend()) { composing.current = true; compositionEpoch = inputEpoch.current; } };
    const end = (event: CompositionEvent) => { const valid = composing.current && compositionEpoch === inputEpoch.current; compositionEpoch = null; composing.current = false; input.value = ""; if (valid) sendText(event.data || ""); };
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
      if (action) { if (already !== kind) { send(action); } return; }
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
  }, [canSend, composing, inputEpoch, inputRef, releaseInput, send, sendText]);

  const point = useCallback((event: { clientX: number; clientY: number }, strict = true) => {
    if (!model.getSnapshot().mediaReady) return null;
    const image = videoRef.current, current = model.getSnapshot().frame;
    if (!image || !current) return null;
    const rect = containedRect(image.getBoundingClientRect(), current.width, current.height);
    if (strict && !insideRect(event.clientX, event.clientY, rect)) return null;
    return toNormalized(event.clientX, event.clientY, rect);
  }, [model, videoRef]);

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
    if (model.getSnapshot().phase !== "active") return;
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
    if (!streamModeRef.current || model.getSnapshot().phase !== "active") return;
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
    const down = pointerRef.current;
    if (!down || down.id !== event.pointerId) return;
    const p = point(event, false);
    flushMove();
    if (p) {
      for (const button of down.buttons) send({ kind: "pointer_up", ...p, button });
    } else releaseInput();
    pointerRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && event.ctrlKey && event.altKey && event.shiftKey) { event.preventDefault(); releaseInput(); return; }
    if (!canSend() || composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || ["Process", "Dead", "Unidentified"].includes(event.key)) return;
    // Paste must reach the browser clipboard event so its text travels naturally.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
    flushMove();
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
      const p = point(event);
      if (!p || model.getSnapshot().phase !== "active") return;
      event.preventDefault(); flushMove();
      const factor = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? stage.clientHeight : 1;
      const clamp = (value: number) => Math.max(-10_000, Math.min(10_000, value * factor));
      send({ kind: "scroll", ...p, deltaX: clamp(event.deltaX), deltaY: clamp(event.deltaY) });
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [flushMove, model, point, send, stageRef]);

  return { pointerDown, pointerMove, pointerUp, keyDown, keyUp };
}
