"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import type { DeckResizeHandle } from "./deck-geometry";
import type { DeckElement } from "./deck-schema";
import type { DeckElementTextEditability } from "./deck-text-gesture";

export type DeckElementInteractionMode = "move" | "resize" | "rotate";

export type DeckResizeHandleSpec = {
  id: DeckResizeHandle;
  className: string;
  cursor: string;
};

export function DeckElementSelectionChrome({
  element,
  rendered,
  textEditability,
  resizeHandles,
  onStartInteraction,
  onBeginTextEditing,
  onAskAi,
  onDuplicate,
  onToggleLock,
  onDelete,
}: {
  element: DeckElement;
  rendered: DeckElement;
  textEditability: DeckElementTextEditability;
  resizeHandles: readonly DeckResizeHandleSpec[];
  onStartInteraction: (
    event: ReactPointerEvent<HTMLElement>,
    element: DeckElement,
    mode: DeckElementInteractionMode,
    handle?: DeckResizeHandle,
  ) => void;
  onBeginTextEditing: (elementId: string) => void;
  onAskAi: () => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div
        className="absolute left-1/2 top-[-44px] z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1 text-[var(--fg,#292524)] shadow-xl"
        style={{
          transform: `translateX(-50%) rotate(${-rendered.rotation}deg)`,
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {textEditability.textBearing && (
          <button
            type="button"
            data-deck-edit-text
            disabled={!textEditability.editable}
            onClick={() => onBeginTextEditing(element.id)}
            className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] disabled:cursor-not-allowed disabled:opacity-35"
            title={
              textEditability.reason ||
              "编辑文字（选中后也可按 Enter 或 F2）"
            }
            aria-label={textEditability.actionLabel}
          >
            <AdvancedEditorIcon name="case" className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onAskAi}
          className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
          title="让 AI 改"
          aria-label="让 AI 改"
        >
          <AdvancedEditorIcon name="ai" className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={element.locked}
          onClick={onDuplicate}
          className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] disabled:cursor-not-allowed disabled:opacity-35"
          title="复制"
          aria-label="复制"
        >
          <AdvancedEditorIcon name="duplicate" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleLock}
          className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[var(--surface-hover,rgba(0,0,0,.06))]"
          title={element.locked ? "解锁" : "锁定"}
          aria-label={element.locked ? "解锁" : "锁定"}
        >
          <AdvancedEditorIcon
            name={element.locked ? "unlock" : "lock"}
            className="h-4 w-4"
          />
        </button>
        <button
          type="button"
          disabled={element.locked}
          onClick={onDelete}
          className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-35"
          title="删除"
          aria-label="删除"
        >
          <AdvancedEditorIcon name="delete" className="h-4 w-4" />
        </button>
      </div>
      {!element.locked &&
        resizeHandles.map((handle) => (
          <span
            key={handle.id}
            role="presentation"
            onPointerDown={(event) =>
              onStartInteraction(event, element, "resize", handle.id)
            }
            className={`absolute z-20 h-3 w-3 rounded-[3px] border-2 border-white bg-[#8b5cf6] shadow ${handle.className}`}
            style={{ cursor: handle.cursor }}
          />
        ))}
      {!element.locked && (
        <>
          <span className="pointer-events-none absolute -bottom-7 left-1/2 h-7 w-px -translate-x-1/2 bg-[#8b5cf6]" />
          <span
            role="presentation"
            onPointerDown={(event) =>
              onStartInteraction(event, element, "rotate")
            }
            className="absolute -bottom-10 left-1/2 z-20 grid h-4 w-4 -translate-x-1/2 cursor-grab place-items-center rounded-full border-2 border-white bg-[#8b5cf6] shadow active:cursor-grabbing"
          />
        </>
      )}
    </>
  );
}
