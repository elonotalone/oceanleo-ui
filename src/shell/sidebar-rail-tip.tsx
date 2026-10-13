"use client";

// 折叠轨图标的悬停提示：黑底白字圆角块，贴在图标右侧（对照 ChatGPT）。
// 必须 portal 出侧栏——aside 有 overflow + backdrop-filter，内部浮层会被裁掉。

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export type SidebarRailTip = {
  text: string;
  x: number;
  y: number;
  rtl: boolean;
};

let current: SidebarRailTip | null = null;
const subscribers = new Set<() => void>();

function publish(next: SidebarRailTip | null) {
  current = next;
  for (const notify of subscribers) notify();
}

function readTip(from: EventTarget | null): SidebarRailTip | null {
  if (!(from instanceof Element)) return null;
  const host = from.closest("[data-oceanleo-rail-tip]");
  if (!(host instanceof HTMLElement)) return null;
  const text = host.getAttribute("data-oceanleo-rail-tip")?.trim();
  if (!text) return null;
  const box = host.getBoundingClientRect();
  const view = host.ownerDocument.defaultView;
  const rtl = view?.getComputedStyle(host).direction === "rtl";
  return {
    text,
    x: rtl ? box.left - 10 : box.right + 10,
    y: box.top + box.height / 2,
    rtl,
  };
}

let listening = false;

function onPointerOver(event: Event) {
  publish(readTip(event.target));
}

function onFocusIn(event: Event) {
  const next = readTip(event.target);
  if (next) publish(next);
}

function onFocusOut(event: Event) {
  if (
    event.target instanceof Element &&
    event.target.closest("[data-oceanleo-rail-tip]")
  ) {
    publish(null);
  }
}

function onViewportChange() {
  publish(null);
}

function ensureListening() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("pointerover", onPointerOver);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

let layerOwner: symbol | null = null;

export function SidebarRailTipLayer() {
  const id = useRef(Symbol("leo-rail-tip"));
  const [owns, setOwns] = useState(false);
  const [ready, setReady] = useState(false);
  const tip = useSyncExternalStore(subscribe, () => current, () => null);

  useEffect(() => {
    ensureListening();
    setReady(true);
    if (!layerOwner) {
      layerOwner = id.current;
      setOwns(true);
    }
    return () => {
      if (layerOwner === id.current) layerOwner = null;
    };
  }, []);

  if (!ready || !owns || !tip) return null;
  return createPortal(
    <div
      role="tooltip"
      data-oceanleo-rail-tip-bubble=""
      data-rtl={tip.rtl ? "1" : undefined}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
