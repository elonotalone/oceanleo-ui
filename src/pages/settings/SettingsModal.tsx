"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../i18n/ui/useUI";
import { SettingsHub, type SettingsHubProps } from "./SettingsHub";

export type SettingsModalProps = Omit<SettingsHubProps, "variant" | "onClose"> & { open: boolean; onClose: () => void };
const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SettingsModal({ open, onClose, ...props }: SettingsModalProps) {
  const tt = useUI();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (open) setPresent(true); else setVisible(false); }, [open]);
  useEffect(() => { if (!open) setExpanded(false); }, [open]);
  useEffect(() => {
    if (!present || !open) return;
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [present, open]);
  useEffect(() => {
    if (!present) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = () => panel.current?.querySelector<HTMLElement>(focusable) ?? panel.current;
    first()?.focus();
    function foreignModalOwns(node: Node | null) {
      if (!(node instanceof Element) || !panel.current) return false;
      if (panel.current.contains(node)) return false;
      const dialog = node.closest('[role="dialog"][aria-modal="true"], .leo-overlay-scrim');
      return Boolean(dialog && !panel.current.contains(dialog));
    }
    function key(event: KeyboardEvent) {
      if (foreignModalOwns(event.target instanceof Node ? event.target : document.activeElement)) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab" || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll<HTMLElement>(focusable)].filter((node) => !node.closest('[hidden], [aria-hidden="true"]'));
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (!nodes.length) { event.preventDefault(); panel.current.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index === nodes.length - 1 || index < 0)) { event.preventDefault(); nodes[0]?.focus(); }
    }
    function focus(event: FocusEvent) {
      if (panel.current?.contains(event.target as Node) || foreignModalOwns(event.target as Node)) return;
      first()?.focus();
    }
    document.addEventListener("keydown", key, true);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("focusin", focus);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [present]);
  useEffect(() => {
    if (open || !present) return;
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--leo-dur-4").trim();
    const duration = parseFloat(raw) * (raw.endsWith("ms") ? 1 : 1000);
    const timer = window.setTimeout(() => setPresent(false), Number.isFinite(duration) ? duration : 0);
    return () => window.clearTimeout(timer);
  }, [open, present]);
  if (!present || typeof document === "undefined") return null;
  const size = expanded
    ? "h-[calc(100dvh-1.5rem)] w-[calc(100dvw-1.5rem)]"
    : "h-[min(760px,88vh)] w-[min(1040px,94vw)]";
  return createPortal(<div data-settings-backdrop className={`fixed inset-0 z-[160] flex items-center justify-center bg-black/25 backdrop-blur-sm transition-opacity duration-[var(--leo-dur-4)] ease-[var(--leo-ease-standard)] dark:bg-black/50 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={tt("设置")} tabIndex={-1} data-settings-expanded={expanded ? "1" : "0"} className={`relative ${size} overflow-hidden rounded-2xl bg-white shadow-2xl outline-none transition-[width,height,transform] duration-[var(--leo-dur-4)] ease-[var(--leo-ease-standard)] focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45 dark:bg-neutral-950 dark:text-neutral-100 motion-reduce:transition-none ${visible ? "scale-100" : "scale-95"}`}>
      <button type="button" data-settings-expand onClick={() => setExpanded((value) => !value)} aria-label={expanded ? tt("缩小") : tt("放大")} className="absolute left-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
        {expanded ? <ShrinkGlyph /> : <ExpandGlyph />}
      </button>
      <button type="button" onClick={onClose} aria-label={tt("关闭")} className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">✕</button>
      <SettingsHub {...props} variant="modal" onClose={onClose} />
    </div>
  </div>, document.body);
}

function ExpandGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9 3H3v6M15 3h6v6M15 21h6v-6M9 21H3v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShrinkGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9 15H3v6M15 15h6v6M15 9h6V3M9 9H3V3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
