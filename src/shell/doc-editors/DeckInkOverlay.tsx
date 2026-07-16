"use client";

import { useRef, useState } from "react";
import {
  deckInkPath,
  type DeckInkPoint,
  type DeckInkStroke,
  type DeckInkStyle,
} from "./deck-ink";

export function DeckInkOverlay({
  style,
  onCommit,
}: {
  style: DeckInkStyle;
  onCommit: (stroke: DeckInkStroke) => void;
}) {
  const [draft, setDraft] = useState<DeckInkPoint[]>([]);
  const draftRef = useRef<DeckInkPoint[]>([]);
  const point = (
    event: React.PointerEvent<SVGSVGElement>,
  ): DeckInkPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  };
  const replace = (next: DeckInkPoint[]) => {
    draftRef.current = next;
    setDraft(next);
  };
  const finish = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (draftRef.current.length) onCommit(draftRef.current);
    replace([]);
  };

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="absolute inset-0 z-[100] h-full w-full cursor-crosshair touch-none"
      aria-label="画笔绘制层"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        replace([point(event)]);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const nextPoint = point(event);
        const previous = draftRef.current[draftRef.current.length - 1];
        if (
          previous &&
          Math.hypot(
            nextPoint.x - previous.x,
            nextPoint.y - previous.y,
          ) < 0.12
        ) {
          return;
        }
        replace([...draftRef.current, nextPoint]);
      }}
      onPointerUp={finish}
      onPointerCancel={() => replace([])}
    >
      {draft.length > 0 && (
        <path
          d={deckInkPath(draft)}
          fill="none"
          stroke={style.color}
          strokeWidth={Math.max(1.1, style.width)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={style.opacity}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
