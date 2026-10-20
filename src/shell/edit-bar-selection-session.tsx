"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { SelectionContext } from "./selection-context";
import type { SelectionInteractionChange } from "./edit-bar-hosted-selection-hold";
import { preserveEditBarSelection } from "./edit-bar-selection-preserve";

export const EditBarSelectionSessionContext = createContext<string | null>(
  null,
);

export function useEditBarSessionId(): string | null {
  return useContext(EditBarSelectionSessionContext);
}

function escapeSessionId(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

export function ownEditBarSessionOpen(
  sessionId: string,
  root: ParentNode | null = null,
): boolean {
  if (!sessionId) return false;
  const scope = root || (typeof document === "undefined" ? null : document);
  return Boolean(
    scope?.querySelector?.(
      `[data-edit-bar-session="${escapeSessionId(sessionId)}"][data-anchored-popover][data-leo-overlay-state="open"]`,
    ),
  );
}

export function isOwnEditBarSession(
  target: EventTarget | null,
  sessionId: string,
): boolean {
  if (!sessionId) return false;
  const el =
    typeof Element !== "undefined" && target instanceof Element
      ? target
      : typeof Node !== "undefined" && target instanceof Node
        ? target.parentElement
        : null;
  return Boolean(
    el?.closest?.(`[data-edit-bar-session="${escapeSessionId(sessionId)}"]`),
  );
}

/**
 * Keep the last live selection while this toolbar is being used: pointer
 * down, keyboard activate, focus in a typable field, or this session's
 * portaled More/select popover. Hosted editors clear selection on iframe
 * blur as soon as the bar is pressed; without this hold the compact buttons
 * unmount before click.
 *
 * Release is event-driven. Timers are one-shot microtask stand-ins so click
 * still sees the held context, and they are cleared on unmount. Another
 * overlay or another toolbar cannot keep this session alive.
 */
export function useEditBarSelectionSession(
  liveContext: SelectionContext | null,
  keepAlive = false,
  onInteractionChange?: SelectionInteractionChange,
): {
  context: SelectionContext | null;
  holding: boolean;
  sessionId: string;
  onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDownCapture: (event: ReactKeyboardEvent<HTMLElement>) => void;
} {
  const sessionId = `ebs-${useId().replace(/:/g, "")}`;
  const lastRef = useRef<SelectionContext | null>(liveContext);
  const heldSnapshotRef = useRef<SelectionContext | null>(null);
  const onInteractionChangeRef = useRef(onInteractionChange);
  onInteractionChangeRef.current = onInteractionChange;
  const [holding, setHolding] = useState(false);
  const keepAliveRef = useRef(keepAlive);
  const timersRef = useRef(new Set<number>());
  keepAliveRef.current = keepAlive;
  if (liveContext) lastRef.current = liveContext;

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current.clear();
  }, []);

  const ownActive = useCallback(() => {
    if (keepAliveRef.current) return true;
    if (typeof document === "undefined") return false;
    if (ownEditBarSessionOpen(sessionId)) return true;
    const active = document.activeElement;
    return Boolean(active && isOwnEditBarSession(active, sessionId));
  }, [sessionId]);

  const notify = useCallback((held: SelectionContext | null) => {
    onInteractionChangeRef.current?.(held);
  }, []);

  const releaseIfIdle = useCallback(() => {
    if (ownActive()) return;
    heldSnapshotRef.current = null;
    setHolding(false);
    notify(null);
  }, [notify, ownActive]);

  const hold = useCallback(() => {
    const next = lastRef.current;
    if (!next) return;
    heldSnapshotRef.current = next;
    setHolding(true);
    notify(next);
  }, [notify]);

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      hold();
      preserveEditBarSelection(event);
    },
    [hold],
  );

  const onKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      hold();
    },
    [hold],
  );

  useEffect(
    () => () => {
      clearTimers();
      heldSnapshotRef.current = null;
      notify(null);
    },
    [clearTimers, notify],
  );

  useEffect(() => {
    if (!liveContext || !holding) return;
    const held = heldSnapshotRef.current;
    if (!held) return;
    if (
      held.id === liveContext.id &&
      String(held.revision ?? "") === String(liveContext.revision ?? "") &&
      String(held.epoch ?? "") === String(liveContext.epoch ?? "")
    ) {
      return;
    }
    heldSnapshotRef.current = null;
    setHolding(false);
    notify(null);
  }, [holding, liveContext, notify]);

  useEffect(() => {
    if (!holding && !keepAlive) return;
    const later = () => {
      const id = window.setTimeout(() => {
        timersRef.current.delete(id);
        releaseIfIdle();
      }, 0);
      timersRef.current.add(id);
    };
    const observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver((records) => {
            for (const record of records) {
              const el = record.target;
              if (!(el instanceof Element)) continue;
              if (el.getAttribute("data-edit-bar-session") !== sessionId) {
                continue;
              }
              later();
              return;
            }
          });
    observer?.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-leo-overlay-state"],
    });
    window.addEventListener("pointerup", later, true);
    window.addEventListener("pointercancel", later, true);
    window.addEventListener("focusout", later, true);
    return () => {
      clearTimers();
      observer?.disconnect();
      window.removeEventListener("pointerup", later, true);
      window.removeEventListener("pointercancel", later, true);
      window.removeEventListener("focusout", later, true);
    };
  }, [clearTimers, holding, keepAlive, releaseIfIdle, sessionId]);

  useEffect(() => {
    if (!keepAlive) releaseIfIdle();
  }, [keepAlive, releaseIfIdle]);

  const context =
    liveContext ?? (holding || keepAlive ? lastRef.current : null);
  return {
    context,
    holding: holding || keepAlive,
    sessionId,
    onPointerDownCapture,
    onKeyDownCapture,
  };
}
