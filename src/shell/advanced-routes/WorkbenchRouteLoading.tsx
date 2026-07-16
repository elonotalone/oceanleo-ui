"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function WorkbenchRouteLoading() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="正在加载编辑器"
      className="fixed inset-0 z-[2147482999] grid min-h-[100dvh] place-items-center bg-[var(--card,#fff)]"
    >
      <div role="status" aria-live="polite" className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--border,#e7e5e4)] border-t-[var(--accent,#7c3aed)]" />
        <p className="mt-3 text-[12px] text-[var(--muted,#78716c)]">正在加载编辑器…</p>
      </div>
    </div>,
    document.body,
  );
}
