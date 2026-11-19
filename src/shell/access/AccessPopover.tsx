"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { FloatingMenu } from "../../ui/menu/FloatingMenu";

/** Top sheet on narrow screens; room above the composer is the maximum panel height. */
export function AccessPopover({ open, anchorRef, onClose, title, id, width = 480, role = "dialog", ignoreOutsideSelector, children }: {
  open: boolean; anchorRef: RefObject<HTMLElement | null>; onClose: () => void;
  title: string; id?: string; width?: number; role?: "menu" | "dialog"; ignoreOutsideSelector?: string; children: ReactNode;
}) {
  const [room, setRoom] = useState(320);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const footer = document.querySelector<HTMLElement>('[data-agent-chat-footer]:not([hidden])');
      const footerTop = footer?.getBoundingClientRect().top;
      const bottom = footerTop && footerTop > (anchor?.bottom ?? 0) ? footerTop - 8 : window.innerHeight - 16;
      setRoom(Math.max(0, Math.min(560, bottom - (anchor?.bottom ?? 56) - 8)));
      setNarrow(window.innerWidth < 640);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const footer = document.querySelector('[data-agent-chat-footer]');
    if (footer) observer?.observe(footer);
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, [open, anchorRef]);
  return <FloatingMenu open={open} anchorRef={anchorRef} onClose={onClose} id={id}
    role={role} ignoreOutsideSelector={ignoreOutsideSelector} ariaLabel={title} align="end" preferredPlacement="below" maxHeight={room}
    initialFocusSelector={role === "dialog" ? 'button:not(:disabled), input:not(:disabled), select:not(:disabled)' : undefined}
    style={{ width: narrow ? "calc(100vw - 16px)" : width }} attributes={{ "data-access-popover": narrow ? "sheet" : "popover" }}>
    {children}
  </FloatingMenu>;
}
