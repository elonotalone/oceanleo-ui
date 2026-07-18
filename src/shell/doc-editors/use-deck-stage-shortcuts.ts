"use client";

import { useEffect } from "react";
import type { DeckEditorState } from "./use-deck-editor";

export function useDeckStageShortcuts(editor: DeckEditorState) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (
        command &&
        event.key.toLowerCase() === "d" &&
        editor.selectedElement
      ) {
        event.preventDefault();
        editor.duplicateElement();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        editor.selectedElement &&
        !editor.selectedElement.locked
      ) {
        event.preventDefault();
        editor.deleteElement();
      } else if (
        editor.selectedElement &&
        !editor.selectedElement.locked &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 1 : 0.2;
        editor.patchElement(editor.selectedElement.id, {
          x:
            editor.selectedElement.x +
            (event.key === "ArrowLeft"
              ? -step
              : event.key === "ArrowRight"
                ? step
                : 0),
          y:
            editor.selectedElement.y +
            (event.key === "ArrowUp"
              ? -step
              : event.key === "ArrowDown"
                ? step
                : 0),
        });
      } else if (event.key === "PageUp") {
        event.preventDefault();
        const previous = editor.deck.slides[editor.activeIndex - 1];
        if (previous) editor.selectSlide(previous.id);
      } else if (event.key === "PageDown") {
        event.preventDefault();
        const next = editor.deck.slides[editor.activeIndex + 1];
        if (next) editor.selectSlide(next.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);
}
