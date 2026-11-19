"use client";

import { BackButton } from "../ui/BackButton";
import {
  createContext, useContext, useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ReactNode, type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../i18n/ui/useUI";
import { editBarPanelGeometry, type EditBarPanelRect } from "./edit-bar-panel-geometry";
import { createLiveReactNodeStore, LiveReactNode, publishLiveReactNode } from "./live-react-node";
import { PluginThemeScope, type PluginThemeId } from "./plugin-theme";

export type EditBarPanelAnchor = HTMLElement | EditBarPanelRect;
export interface EditBarPanel {
  id: string;
  label: ReactNode;
  content: ReactNode;
  anchor?: EditBarPanelAnchor;
  width?: number;
  onDismiss?: () => void;
}
interface OpenPanel extends EditBarPanel {
  anchor: EditBarPanelAnchor;
  rect: EditBarPanelRect;
  trigger: HTMLElement | null;
  store: ReturnType<typeof createLiveReactNodeStore>;
}

function isElement(anchor: EditBarPanelAnchor): anchor is HTMLElement {
  return typeof HTMLElement !== "undefined" && anchor instanceof HTMLElement;
}

/** One stack for both editor shells. Hidden parents stay mounted while navigating back. */
export function useEditBarPanelStack() {
  const owner = useId();
  const [panels, setPanels] = useState<OpenPanel[]>([]);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const eventAnchor = useRef<HTMLElement | null>(null);
  // Several existing editor callbacks deliberately preserve the canvas selection
  // on pointerdown. Capture the actual button, rather than document.activeElement.
  useEffect(() => {
    const remember = (event: Event) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, [role="button"], [role="option"], select')
        : null;
      eventAnchor.current = button;
      queueMicrotask(() => { if (eventAnchor.current === button) eventAnchor.current = null; });
    };
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, []);
  const replace = useCallback((next: OpenPanel[], removed: OpenPanel[]) => {
    panelsRef.current = next;
    setPanels(next);
    for (const panel of [...removed].reverse()) panel.onDismiss?.();
  }, []);
  const close = useCallback(() => {
    const current = panelsRef.current;
    replace([], current);
    const trigger = current[0]?.trigger;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, [replace]);
  // Effect cleanup releases its registration. It must not tell the source
  // control to close. Restore focus only if that release still owns the next
  // frame, so Strict Mode replay cannot pull focus out of a reopened panel.
  const dismiss = useCallback((id: string, notify = true) => {
    const current = panelsRef.current;
    const index = current.findIndex(panel => panel.id === id);
    if (index < 0) return;
    const next = current.slice(0, index);
    replace(next, notify ? current.slice(index) : []);
    requestAnimationFrame(() => {
      if (panelsRef.current === next) current[index]?.trigger?.focus({ preventScroll: true });
    });
  }, [replace]);
  const open = useCallback((panel: EditBarPanel) => {
    const openingAnchor = panel.anchor ?? eventAnchor.current;
    const focusTrigger = document.activeElement instanceof HTMLElement && document.activeElement.matches('button, [role="button"]') ? document.activeElement : null;
    const anchor = openingAnchor ?? focusTrigger;
    const trigger = anchor && isElement(anchor) ? anchor : eventAnchor.current ?? focusTrigger;
    const rect = anchor && isElement(anchor) ? anchor.getBoundingClientRect() : anchor ??
      { left: 0, top: 0, right: 0, bottom: 0 };
    const current = panelsRef.current;
    const existing = current.find(entry => entry.id === panel.id);
    if (existing) {
      if (eventAnchor.current && existing.trigger === eventAnchor.current) close();
      return;
    }
    const store = createLiveReactNodeStore();
    publishLiveReactNode(store, panel.content);
    const next: OpenPanel = { ...panel, content: <LiveReactNode store={store} />, anchor: anchor ?? rect, rect, trigger, store };
    const nested = openingAnchor && trigger?.closest("[data-edit-bar-floating-owner]")?.getAttribute("data-edit-bar-floating-owner") === owner;
    replace(nested ? [...current, next] : [next], nested ? [] : current);
  }, [close, owner, replace]);
  const update = useCallback((id: string, content: ReactNode) => {
    const panel = panelsRef.current.find(panel => panel.id === id);
    if (panel) publishLiveReactNode(panel.store, content);
  }, []);
  const back = useCallback(() => {
    const current = panelsRef.current;
    const child = current.at(-1);
    if (child) dismiss(child.id);
  }, [dismiss]);
  return { owner, panels, open, update, close, dismiss, back, active: panels.at(-1) ?? null };
}

export type EditBarPanelStack = ReturnType<typeof useEditBarPanelStack>;
export const EditBarPanelContext = createContext<EditBarPanelStack | null>(null);

export function EditBarFloatingPanel({
  controller,
  containerRef,
  editBarRef,
  pluginThemeId,
}: {
  controller: EditBarPanelStack;
  containerRef: RefObject<HTMLElement | null>;
  editBarRef?: RefObject<HTMLElement | null>;
  pluginThemeId?: PluginThemeId | null;
}) {
  const tt = useUI();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const { active, panels, close, back, owner } = controller;
  const activeId = active?.id;
  const [position, setPosition] = useState<ReturnType<typeof editBarPanelGeometry> | null>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const place = () => {
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const visible = { left, top, right: left + (viewport?.width ?? window.innerWidth), bottom: top + (viewport?.height ?? window.innerHeight) };
      const container = containerRef.current?.getBoundingClientRect() ?? visible;
      // Children replace the body in the same panel. Their button determines
      // lineage and return focus; the root edit-bar button determines placement.
      const root = panels[0] ?? active;
      const triggerRect = isElement(root.anchor) ? root.trigger?.getBoundingClientRect() : undefined;
      const anchor = triggerRect && triggerRect.width > 0 ? triggerRect : root.rect;
      const bar = (root.trigger?.closest("[data-workspace-edit-bar]") ??
        editBarRef?.current?.querySelector("[data-workspace-edit-bar]"))?.getBoundingClientRect();
      const barBottom = bar?.bottom ?? root.rect.bottom;
      const base = editBarPanelGeometry({ anchor, container, viewport: visible, barBottom, width: root.width });
      const next = root === active ? base : editBarPanelGeometry({ anchor: { ...anchor, left: base.left }, container, viewport: visible, barBottom, width: active.width });
      setPosition(previous => previous && Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof next]) ? previous : next);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (containerRef.current) observer?.observe(containerRef.current);
    if (panels[0]?.trigger) observer?.observe(panels[0].trigger);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      observer?.disconnect();
    };
  }, [active, containerRef, editBarRef, panels]);
  useLayoutEffect(() => {
    if (!activeId) return;
    const current = panelRef.current?.querySelector<HTMLElement>('[data-edit-bar-panel-current="true"]');
    (current?.querySelector<HTMLElement>('input:not([type="file"]):not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex="0"]') ?? panelRef.current?.querySelector<HTMLElement>("button") ?? panelRef.current)?.focus({ preventScroll: true });
  }, [activeId]);
  useEffect(() => {
    if (!active) return;
    const outside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (panelRef.current?.contains(event.target)) return;
      if (panels.some(panel => panel.trigger?.contains(event.target as Node))) return;
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("click", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [active, close, panels]);
  if (!active || typeof document === "undefined") return null;
  const body = (
    <div
      ref={panelRef}
      id={active.id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-edit-bar-floating-panel={active.id}
      data-edit-bar-floating-owner={owner}
      style={{ position: "fixed", boxSizing: "border-box", zIndex: 2147483600, ...position, height: active.id === "materials" || active.id === "mine" ? position?.maxHeight : undefined, visibility: position ? "visible" : "hidden", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 16, border: "1px solid var(--awb-border,var(--border,#e7e5e4))", background: "var(--awb-popover-bg,var(--card,#fff))", color: "var(--awb-text,var(--fg,#292524))", boxShadow: "0 12px 40px #0003" }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--awb-border,var(--border,#e7e5e4))] px-3" style={{ minHeight: 40 }}>
        {panels.length > 1 && <BackButton data-edit-bar-panel-back onClick={back} label={tt("返回")} />}
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-xs font-semibold">{active.label}</h2>
        <button type="button" aria-label={tt("关闭")} onClick={close} className="min-h-11 min-w-11 h-8 w-8 rounded-lg">×</button>
      </div>
      <div className="min-h-0 flex-1" style={{ overflow: "auto", overscrollBehavior: "contain" }}>
        {panels.map(panel => <div key={panel.id} data-edit-bar-panel-current={panel.id === active.id} hidden={panel.id !== active.id} style={{ display: panel.id === active.id ? "block" : "none", minHeight: 0, height: panel.id === "materials" || panel.id === "mine" ? "100%" : undefined }}>{panel.content}</div>)}
      </div>
    </div>
  );
  return createPortal(<EditBarPanelContext.Provider value={controller}>{pluginThemeId ? <PluginThemeScope pluginId={pluginThemeId}>{body}</PluginThemeScope> : body}</EditBarPanelContext.Provider>, document.fullscreenElement ?? document.body);
}

/** For tools whose open state belongs to the editor stage (PDF Find/signatures). */
export function EditBarPanelRequest({ id, label, triggerSelector, onClose, children }: {
  id: string; label: ReactNode; triggerSelector: string; onClose: () => void; children: ReactNode;
}) {
  const host = useContext(EditBarPanelContext);
  const markerRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef(children);
  const closeRef = useRef(onClose);
  contentRef.current = children;
  closeRef.current = onClose;
  const open = host?.open;
  const dismiss = host?.dismiss;
  const update = host?.update;
  useLayoutEffect(() => {
    if (!open) return;
    const scope = markerRef.current?.closest("[data-edit-bar-layer-root], [data-plugin-chrome]") ?? markerRef.current?.closest("[data-inline-editor]");
    open({ id, label, content: contentRef.current, anchor: scope?.querySelector<HTMLElement>(triggerSelector) ?? undefined, onDismiss: () => closeRef.current() });
    return () => dismiss?.(id, false);
  }, [dismiss, id, label, open, triggerSelector]);
  useLayoutEffect(() => { update?.(id, children); }, [children, id, update]);
  return <><span hidden ref={markerRef} />{host ? null : children}</>;
}
