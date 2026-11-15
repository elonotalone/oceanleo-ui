"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  NODE_MENU_CAPABILITIES,
  NODE_MENU_ENTRY_IDS,
  type NodeMenuEntryId,
} from "./command-registry";

export const CANVAS_CREATE_MIME = "application/x-leovideo-v2-node";

export interface CanvasMenuPoint {
  x: number;
  y: number;
  openedAt: number;
}

export function CanvasCreateMenu({
  point,
  onCreate,
  onClose,
}: {
  point: CanvasMenuPoint | null;
  onCreate: (entryId: NodeMenuEntryId) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ x: 12, y: 12 });
  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return NODE_MENU_ENTRY_IDS;
    return NODE_MENU_ENTRY_IDS.filter((entryId) => {
      const capability = NODE_MENU_CAPABILITIES[entryId];
      return [
        entryId,
        capability.label,
        capability.purpose,
        ...capability.aliases,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [query]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!point || !menu) return;
    const edge = 12;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    setPosition({
      x: Math.max(edge, Math.min(point.x, window.innerWidth - width - edge)),
      y: Math.max(edge, Math.min(point.y, window.innerHeight - height - edge)),
    });
    const visibleAt = performance.now();
    menu.dataset.visibleMs = String(visibleAt - point.openedAt);
    searchRef.current?.focus({ preventScroll: true });
    menu.dataset.focusMs = String(performance.now() - point.openedAt);
  }, [point]);

  useEffect(() => {
    if (!point) setQuery("");
  }, [point]);

  useEffect(() => {
    if (!point) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !menuRef.current) return;
      const focusable = [
        ...menuRef.current.querySelectorAll<HTMLElement>(
          "input, button:not(:disabled)",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, point]);

  if (!point) return null;

  return (
    <section
      ref={menuRef}
      role="dialog"
      aria-modal="true"
      aria-label="Create or open canvas content"
      data-canvas-create-menu
      className="fixed z-50 flex h-[min(460px,calc(100vh-24px))] min-h-[420px] w-[min(600px,calc(100vw-32px))] min-w-[560px] flex-col overflow-hidden rounded-2xl border border-[var(--vc-border-strong)] bg-[var(--vc-surface-glass)] shadow-[var(--vc-shadow-float)] backdrop-blur-xl max-[600px]:h-[74vh] max-[600px]:min-h-0 max-[600px]:w-[94vw] max-[600px]:min-w-0"
      style={{ left: position.x, top: position.y }}
    >
      <div className="flex items-center gap-3 border-b border-[var(--vc-border)] p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--vc-text)]">Add to canvas</h2>
          <p className="mt-0.5 text-[11px] text-[var(--vc-text-3)]">
            Add text, subtitles, audio, media, or a shot plan
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close create menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--vc-text-2)] hover:bg-[var(--vc-hover)] hover:text-[var(--vc-text)]"
        >
          ×
        </button>
      </div>
      <label className="mx-4 mt-4 flex h-11 shrink-0 items-center rounded-xl border border-[var(--vc-border)] bg-[var(--vc-surface-2)] px-3">
        <span aria-hidden className="mr-2 text-[var(--vc-text-3)]">
          ⌕
        </span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search canvas entries"
          placeholder="Search supported nodes and media"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--vc-text)] outline-none placeholder:text-[var(--vc-text-3)]"
        />
      </label>
      <div
        role="list"
        className="grid min-h-0 flex-1 grid-cols-5 gap-2.5 overflow-y-auto p-4 max-[600px]:grid-cols-2"
      >
        {visibleEntries.map((entryId) => {
          const capability = NODE_MENU_CAPABILITIES[entryId];
          return (
            <button
              key={entryId}
              type="button"
              role="listitem"
              data-entry-id={entryId}
              data-command-id={capability.commandId}
              data-disabled-reason-code={capability.disabledReasonCode}
              disabled={!capability.enabled}
              draggable={
                capability.enabled &&
                capability.commandId === "canvas.node.create"
              }
              aria-disabled={!capability.enabled}
              aria-describedby={
                capability.disabledReason
                  ? `canvas-entry-reason-${entryId}`
                  : undefined
              }
              onClick={() => {
                onCreate(entryId);
                onClose();
              }}
              onDragStart={(event) => {
                if (
                  !capability.enabled ||
                  capability.commandId !== "canvas.node.create"
                ) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData(CANVAS_CREATE_MIME, entryId);
                event.dataTransfer.effectAllowed = "copy";
              }}
              className="group flex min-h-36 flex-col items-start justify-between rounded-xl border border-[var(--vc-border)] bg-[var(--vc-surface-2)] p-3 text-left transition enabled:cursor-grab enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--vc-accent-border)] enabled:hover:bg-[var(--vc-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              title={capability.disabledReason}
            >
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[var(--vc-accent-strong)] to-[var(--vc-info-strong)] text-sm font-black tracking-wider text-[var(--vc-on-accent)]">
                {capability.visual}
              </span>
              <span>
                <span className="block text-xs font-semibold text-[var(--vc-text)]">
                  {capability.label}
                </span>
                <span
                  id={`canvas-entry-reason-${entryId}`}
                  className="mt-1 block text-[9px] leading-relaxed text-[var(--vc-text-3)]"
                >
                  {capability.disabledReason || capability.purpose}
                </span>
              </span>
            </button>
          );
        })}
        {visibleEntries.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-[var(--vc-text-3)]">
            No matching canvas capability.
          </p>
        )}
      </div>
    </section>
  );
}
