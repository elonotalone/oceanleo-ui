"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type AnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type PanelSize = {
  width: number;
  height: number;
};

export type AnchoredFixedPlacement = "above" | "below";

export type AnchoredFixedStyle = {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  placement: AnchoredFixedPlacement;
};

const DEFAULT_GAP = 8;
const DEFAULT_MARGIN = 8;

/**
 * Place a fixed panel next to an anchor. Default is above the button
 * (`bottom = viewportHeight - rect.top + gap`), left-aligned then clamped
 * into the viewport. If there is more room below, it flips.
 */
export function computeAnchoredFixedStyle(
  anchor: AnchorRect,
  panel: PanelSize,
  viewport: ViewportSize,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
): AnchoredFixedStyle {
  const spaceAbove = Math.max(0, anchor.top - gap - margin);
  const spaceBelow = Math.max(0, viewport.height - anchor.bottom - gap - margin);
  const need = Math.max(panel.height, 1);
  const placement: AnchoredFixedPlacement =
    spaceAbove >= Math.min(need, 96) || spaceAbove >= spaceBelow
      ? "above"
      : "below";

  const width = Math.max(panel.width, 1);
  const left = Math.max(
    margin,
    Math.min(anchor.left, viewport.width - width - margin),
  );

  if (placement === "above") {
    return {
      left,
      bottom: viewport.height - anchor.top + gap,
      maxHeight: Math.max(120, spaceAbove),
      placement,
    };
  }
  return {
    left,
    top: anchor.bottom + gap,
    maxHeight: Math.max(120, spaceBelow),
    placement,
  };
}

export function AnchoredFixedPopover({
  open,
  anchorRef,
  onClose,
  children,
  className = "",
  width = 320,
  zIndexClass = "z-[60]",
}: {
  open: boolean;
  anchorRef: { current: HTMLElement | null };
  onClose: (reason: "escape" | "outside") => void;
  children: ReactNode;
  className?: string;
  width?: number;
  zIndexClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    left: 0,
    bottom: 0,
    width,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panel = panelRef.current;
    const panelSize: PanelSize = {
      width: panel?.offsetWidth || width,
      height: panel?.offsetHeight || 240,
    };
    const viewport: ViewportSize = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const next = computeAnchoredFixedStyle(rect, panelSize, viewport);
    const css: CSSProperties = {
      position: "fixed",
      left: next.left,
      width,
      maxHeight: next.maxHeight,
    };
    if (next.placement === "above") css.bottom = next.bottom;
    else css.top = next.top;
    setStyle(css);
  }, [anchorRef, width]);

  useLayoutEffect(() => {
    if (!open || !mounted) return;
    reposition();
  }, [open, mounted, reposition, children]);

  useEffect(() => {
    if (!open || !mounted) return;
    const onWindowChange = () => reposition();
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    window.visualViewport?.addEventListener("resize", onWindowChange);
    window.visualViewport?.addEventListener("scroll", onWindowChange);
    return () => {
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
      window.visualViewport?.removeEventListener("resize", onWindowChange);
      window.visualViewport?.removeEventListener("scroll", onWindowChange);
    };
  }, [open, mounted, reposition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current("escape");
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onCloseRef.current("outside");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, anchorRef]);

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      data-oceanleo-anchored-fixed
      className={`${zIndexClass} ${className}`}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}
