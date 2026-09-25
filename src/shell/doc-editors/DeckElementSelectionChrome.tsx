"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { DeckResizeHandle } from "./deck-geometry";
import type { DeckElement } from "./deck-schema";

export type DeckElementInteractionMode = "move" | "resize" | "rotate";

export type DeckResizeHandleSpec = {
  id: DeckResizeHandle;
  className: string;
  cursor: string;
};

export function DeckElementSelectionChrome({
  element,
  resizeHandles,
  onStartInteraction,
}: {
  element: DeckElement;
  resizeHandles: readonly DeckResizeHandleSpec[];
  onStartInteraction: (
    event: ReactPointerEvent<HTMLElement>,
    element: DeckElement,
    mode: DeckElementInteractionMode,
    handle?: DeckResizeHandle,
  ) => void;
}) {
  return (
    <>
      {!element.locked &&
        resizeHandles.map((handle) => (
          <span
            key={handle.id}
            role="presentation"
            data-deck-resize-handle={handle.id}
            onPointerDown={(event) =>
              onStartInteraction(event, element, "resize", handle.id)
            }
            className={`absolute z-20 h-3 w-3 rounded-[3px] border-2 border-white bg-[var(--awb-accent,#8b5cf6)] shadow ${handle.className}`}
            style={{ cursor: handle.cursor }}
          />
        ))}
      {!element.locked && (
        <>
          <span className="pointer-events-none absolute -bottom-7 left-1/2 h-7 w-px -translate-x-1/2 bg-[var(--awb-accent,#8b5cf6)]" />
          <span
            role="presentation"
            data-deck-rotate-handle=""
            onPointerDown={(event) =>
              onStartInteraction(event, element, "rotate")
            }
            className="absolute -bottom-10 left-1/2 z-20 grid h-4 w-4 -translate-x-1/2 cursor-grab place-items-center rounded-full border-2 border-white bg-[var(--awb-accent,#8b5cf6)] shadow active:cursor-grabbing"
          />
        </>
      )}
    </>
  );
}
