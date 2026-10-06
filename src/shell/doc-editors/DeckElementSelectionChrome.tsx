"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { DeckResizeHandle } from "./deck-geometry";
import type { DeckElement } from "./deck-schema";
import { safeSelectionColor, type PeerSelection } from "../collab/adapters/visual-selection";

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

/**
 * 多人同改：别人选中了这个元素 —— 用他的颜色描边，并在左上角标他的名字。
 * 只是画出来：不拦鼠标、不进键盘顺序，颜色只认按用户 id 算出的 hsl。
 */
export function DeckPeerSelectionMarks({ peers }: { peers: readonly PeerSelection[] }) {
  if (!peers.length) return null;
  return (
    <>
      {peers.map((peer, index) => {
        const color = safeSelectionColor(peer.color);
        return (
          <span
            key={peer.userId}
            aria-hidden="true"
            data-deck-peer-selection={peer.userId}
            className="pointer-events-none absolute z-[19]"
            style={{
              inset: -2 - index * 3,
              border: `2px solid ${color}`,
              borderRadius: 2,
            }}
          >
            <span
              className="absolute left-[-2px] top-0 max-w-[12em] -translate-y-full overflow-hidden text-ellipsis whitespace-nowrap rounded-t px-1 text-[10px] leading-4 text-white"
              style={{ background: color }}
            >
              {peer.name || "…"}
            </span>
          </span>
        );
      })}
    </>
  );
}
