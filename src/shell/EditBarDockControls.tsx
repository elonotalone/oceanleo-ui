"use client";

import type {
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import type { EditBarDockMode } from "./edit-bar-dock-state";
import type { FloatingToolbarPoint } from "./floating-toolbar-geometry";

export function EditBarDragHandle({
  side,
  mode,
  offset,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onDoubleClick,
  onKeyDown,
}: {
  side: "left" | "right";
  mode: EditBarDockMode;
  offset: FloatingToolbarPoint;
  dragging: boolean;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerMove: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onLostPointerCapture: PointerEventHandler<HTMLButtonElement>;
  onDoubleClick: MouseEventHandler<HTMLButtonElement>;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const tt = useUI();
  return (
    <button
      type="button"
      data-floating-toolbar-handle={side}
      data-edit-bar-mode={mode}
      data-floating-toolbar-offset={`${offset.x},${offset.y}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      className={`grid h-11 w-11 shrink-0 touch-none select-none place-items-center rounded-xl text-[13px] text-[var(--awb-muted)] outline-none transition hover:bg-[var(--awb-hover)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/40 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      aria-label={tt(
        mode === "docked"
          ? side === "left"
            ? "从左侧拖出编辑栏"
            : "从右侧拖出编辑栏"
          : side === "left"
            ? "从左侧拖动编辑栏"
            : "从右侧拖动编辑栏",
      )}
      aria-keyshortcuts="Enter Space ArrowLeft ArrowRight ArrowUp ArrowDown Home"
      title={tt(
        mode === "docked"
          ? "拖出编辑栏；按回车取消固定"
          : "拖动编辑栏；拖到停靠区固定；双击复位",
      )}
    >
      ⠿
    </button>
  );
}

export function EditBarPinButton({
  mode,
  onToggle,
}: {
  mode: EditBarDockMode;
  onToggle: () => void;
}) {
  const tt = useUI();
  const label = tt(
    mode === "docked" ? "取消固定编辑栏" : "固定编辑栏到库",
  );
  return (
    <button
      type="button"
      data-edit-bar-pin
      data-edit-bar-mode={mode}
      onClick={onToggle}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--awb-muted)] outline-none transition hover:bg-[var(--awb-hover)] hover:text-[var(--awb-text)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/40"
      aria-label={label}
      aria-pressed={mode === "docked"}
      title={label}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill={mode === "docked" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path
          d="m8 4 8 0-1 6 3 3H6l3-3-1-6Zm4 9v7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
