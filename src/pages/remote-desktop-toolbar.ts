"use client";

import { useEffect, useLayoutEffect, type KeyboardEvent, type PointerEvent } from "react";

import type { RemoteDesktopPanelContext } from "./remote-desktop-panel-state";

export function useRemoteDesktopToolbar(context: RemoteDesktopPanelContext) {
  const { toolbar, dock, setToolbar, setDock, setFullscreen, stageRef, toolbarRoot, toolbarPanel,
    positionKey, releaseInput } = context;
  useEffect(() => {
    let alive = true, identityRevision = 0;
    const load = (userId: string | null) => {
      positionKey.current = userId ? `oceanleo:remote-toolbar:${userId}` : null;
      let saved: typeof dock | null = null;
      try { saved = JSON.parse(positionKey.current ? window.localStorage.getItem(positionKey.current) || "null" : "null"); } catch { /* storage may be unavailable */ }
      setDock(saved && ["left", "right", "top", "bottom"].includes(saved.edge) && Number.isFinite(saved.offset)
        ? { edge: saved.edge, offset: Math.max(0, Math.min(1, saved.offset)) } : { edge: "right", offset: .5 });
    };
    const readIdentity = (revision: number) => {
      void import("../lib/auth/client").then(auth => auth.getUserIdSnapshot()).then(value => { if (alive && identityRevision === revision && value.available) load(value.userId); }).catch(() => {});
    };
    readIdentity(0);
    const identity = (event: Event) => {
      const revision = ++identityRevision, detail = (event as CustomEvent<{ userId?: string | null }>).detail;
      if (detail && "userId" in detail) load(detail.userId ?? null);
      else readIdentity(revision);
    };
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("oceanleo:auth-state", identity);
    document.addEventListener("fullscreenchange", changed); changed();
    return () => { alive = false; window.removeEventListener("oceanleo:auth-state", identity); document.removeEventListener("fullscreenchange", changed); };
  }, [positionKey, setDock, setFullscreen]);
  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => { if (!toolbarRoot.current?.contains(event.target as Node)) setToolbar(false); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.ctrlKey && event.altKey && event.shiftKey) { event.preventDefault(); event.stopPropagation(); releaseInput(); setToolbar(true); }
      else if (toolbar) { event.preventDefault(); event.stopPropagation(); setToolbar(false); stageRef.current?.focus({ preventScroll: true }); }
    };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape, true); };
  }, [toolbar, releaseInput, toolbarRoot, setToolbar, stageRef]);

  useLayoutEffect(() => {
    if (!toolbar) return;
    const place = () => {
      const root = toolbarRoot.current, panel = toolbarPanel.current;
      if (!root || !panel) return;
      const handle = root.getBoundingClientRect(), size = panel.getBoundingClientRect();
      const gap = 8, w = window.innerWidth, h = window.innerHeight;
      const x = dock.edge === "left" ? handle.right + gap : dock.edge === "right" ? handle.left - size.width - gap : handle.left + 16 - size.width / 2;
      const y = dock.edge === "top" ? handle.bottom + gap : dock.edge === "bottom" ? handle.top - size.height - gap : handle.top + 16 - size.height / 2;
      panel.style.left = `${Math.max(8, Math.min(w - size.width - 8, x)) - handle.left}px`;
      panel.style.top = `${Math.max(8, Math.min(h - size.height - 8, y)) - handle.top}px`;
    };
    place(); window.addEventListener("resize", place);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    if (toolbarPanel.current) observer?.observe(toolbarPanel.current);
    return () => { window.removeEventListener("resize", place); observer?.disconnect(); };
  }, [toolbar, dock, toolbarPanel, toolbarRoot]);

}
