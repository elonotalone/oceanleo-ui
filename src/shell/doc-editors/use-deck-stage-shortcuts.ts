"use client";

import { useEffect, useRef } from "react";
import type { DeckEditorState } from "./use-deck-editor";

export function useDeckStageShortcuts(editor: DeckEditorState) {
  const heldArrowKeys = useRef(new Set<string>());
  const editorRef = useRef(editor);
  editorRef.current = editor;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const currentEditor = editorRef.current;
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) currentEditor.redo();
        else currentEditor.undo();
      } else if (
        command &&
        event.key.toLowerCase() === "d" &&
        currentEditor.selectedElement &&
        !currentEditor.selectedElement.locked
      ) {
        event.preventDefault();
        currentEditor.duplicateElement();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        currentEditor.selectedElement &&
        !currentEditor.selectedElement.locked
      ) {
        event.preventDefault();
        currentEditor.deleteElement();
      } else if (
        currentEditor.selectedElement &&
        !currentEditor.selectedElement.locked &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        heldArrowKeys.current.add(event.key);
        currentEditor.beginGesture();
        const step = event.shiftKey ? 1 : 0.2;
        currentEditor.patchElementTransient(currentEditor.selectedElement.id, {
          x:
            currentEditor.selectedElement.x +
            (event.key === "ArrowLeft"
              ? -step
              : event.key === "ArrowRight"
                ? step
                : 0),
          y:
            currentEditor.selectedElement.y +
            (event.key === "ArrowUp"
              ? -step
              : event.key === "ArrowDown"
                ? step
                : 0),
        });
      } else if (event.key === "PageUp") {
        event.preventDefault();
        const previous =
          currentEditor.deck.slides[currentEditor.activeIndex - 1];
        if (previous) currentEditor.selectSlide(previous.id);
      } else if (event.key === "PageDown") {
        event.preventDefault();
        const next =
          currentEditor.deck.slides[currentEditor.activeIndex + 1];
        if (next) currentEditor.selectSlide(next.id);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        heldArrowKeys.current.delete(event.key) &&
        heldArrowKeys.current.size === 0
      ) {
        editorRef.current.endGesture();
      }
    };
    const onBlur = () => {
      if (!heldArrowKeys.current.size) return;
      heldArrowKeys.current.clear();
      editorRef.current.endGesture();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (heldArrowKeys.current.size) {
        heldArrowKeys.current.clear();
        editorRef.current.endGesture();
      }
    };
  }, []);
}
