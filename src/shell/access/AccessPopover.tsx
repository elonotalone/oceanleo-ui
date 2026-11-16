"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { AnchoredPopover } from "../anchored-popover";

/** Top sheet on narrow screens; room above the composer is the maximum panel height. */
export function AccessPopover({ open, anchorRef, onClose, title, id, width = 480, children }: {
  open: boolean; anchorRef: RefObject<HTMLElement | null>; onClose: () => void;
  title: string; id?: string; width?: number; children: ReactNode;
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
      setRoom(Math.max(80, Math.min(560, bottom - (anchor?.bottom ?? 56) - 8)));
      setNarrow(window.innerWidth < 640);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const footer = document.querySelector('[data-agent-chat-footer]');
    if (footer) observer?.observe(footer);
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, [open, anchorRef]);
  return <AnchoredPopover open={open} anchorRef={anchorRef} onClose={onClose} id={id}
    role="dialog" ariaLabel={title} align="end" preferredPlacement="below" maxHeight={room}
    className="z-[100] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3 text-[var(--foreground)] shadow-xl"
    style={{ width: narrow ? "calc(100vw - 16px)" : width }} attributes={{ "data-access-popover": narrow ? "sheet" : "popover" }}>
    {children}
  </AnchoredPopover>;
}
