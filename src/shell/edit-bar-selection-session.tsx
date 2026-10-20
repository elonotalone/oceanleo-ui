"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SelectionContext } from "./selection-context";
import {
  editBarPopoverOpen,
  preserveEditBarSelection,
} from "./edit-bar-selection-preserve";

/**
 * Keep the last live selection while the pointer is on the bar or a portaled
 * More/select popover is open. Hosted editors clear selection on iframe blur
 * as soon as the bar is pressed; without this hold the compact buttons unmount
 * before click and the command never leaves the toolbar.
 */
export function useEditBarSelectionSession(
  liveContext: SelectionContext | null,
  keepAlive = false,
): {
  context: SelectionContext | null;
  holding: boolean;
  onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
} {
  const lastRef = useRef<SelectionContext | null>(liveContext);
  const [holding, setHolding] = useState(false);
  if (liveContext) lastRef.current = liveContext;

  const hold = useCallback(() => {
    if (lastRef.current) setHolding(true);
  }, []);

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      hold();
      preserveEditBarSelection(event);
    },
    [hold],
  );

  useEffect(() => {
    if (!holding) return;
    const release = () => {
      const tryRelease = () => {
        if (editBarPopoverOpen()) {
          window.setTimeout(tryRelease, 50);
          return;
        }
        setHolding(false);
      };
      window.setTimeout(tryRelease, 0);
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
  }, [holding]);

  const context =
    liveContext ?? (holding || keepAlive ? lastRef.current : null);
  return { context, holding: holding || keepAlive, onPointerDownCapture };
}
