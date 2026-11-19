"use client";

import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ButtonHTMLAttributes } from "react";
import { useUI } from "../../../../i18n/ui/useUI";

/** A choice applies only to this entry; the camera can still be changed in the call. */
export function CallMediaMenu({ children, inCall, onChoose, onFocus }: {
  children: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
  inCall: boolean;
  onChoose: (camera: boolean) => void;
  onFocus: () => void;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };
  return (
    <span ref={root} className="relative inline-flex shrink-0" data-call-media-menu onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
      if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }}>
      {cloneElement(children, {
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (inCall) onFocus();
          else setOpen((value) => !value);
        },
        "aria-haspopup": inCall ? undefined : "menu",
        "aria-expanded": inCall ? undefined : open,
        "aria-controls": open ? menuId : undefined,
      })}
      {open && !inCall ? (
        <span id={menuId} role="menu" aria-label={tt("通话")} className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {[{ camera: false, label: tt("语音通话") }, { camera: true, label: tt("视频通话") }].map(({ camera, label }) => (
            <button key={label} type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-50" onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              close();
              onChoose(camera);
            }}>{label}</button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
