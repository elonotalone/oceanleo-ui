import type { ChangeEvent, KeyboardEvent } from "react";
import type { DeckElement } from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

export interface DeckElementTextEditability {
  textBearing: boolean;
  editable: boolean;
  actionLabel: string;
  reason: string;
}

export function deckElementTextEditability(
  element: DeckElement,
): DeckElementTextEditability {
  const textBearing =
    element.type === "text" ||
    element.type === "table" ||
    (element.type === "shape" && typeof element.text === "string");
  if (!textBearing) {
    return {
      textBearing: false,
      editable: false,
      actionLabel: "此元素没有可编辑文字",
      reason: "此元素没有可编辑文字",
    };
  }
  if (element.locked) {
    return {
      textBearing: true,
      editable: false,
      actionLabel: "文字已锁定",
      reason: "元素已锁定；请先解锁再编辑文字",
    };
  }
  return {
    textBearing: true,
    editable: true,
    actionLabel: "编辑文字",
    reason: "",
  };
}

/** Prefer title-like copy near the top, then reading order. */
export function deckPrimaryEditableTextElement(
  elements: readonly DeckElement[],
): DeckElement | null {
  const editable = elements.filter(
    (element) => deckElementTextEditability(element).editable,
  );
  if (!editable.length) return null;
  return [...editable].sort(
    (left, right) =>
      left.y - right.y ||
      left.x - right.x ||
      left.order - right.order ||
      (right.fontSize || 18) - (left.fontSize || 18),
  )[0];
}

export function deckTextEditKeyStartsEditing(key: string): boolean {
  return key === "Enter" || key === "F2";
}

export function deckTextGestureProps(
  editor: DeckEditorState,
  field: "title" | "body",
) {
  return {
    "data-deck-editable-text": true,
    onFocus: () => editor.beginGesture(),
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
      editor.beginGesture();
      editor.patchSlideTransient(
        field === "title"
          ? { title: event.target.value }
          : { body: event.target.value },
      );
    },
    onBlur: () => editor.endGesture(),
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Escape") return;
      editor.cancelGesture();
      event.currentTarget.blur();
    },
  };
}
