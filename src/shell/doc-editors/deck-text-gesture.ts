import type { ChangeEvent, KeyboardEvent } from "react";
import type { DeckEditorState } from "./use-deck-editor";

export function deckTextGestureProps(
  editor: DeckEditorState,
  field: "title" | "body",
) {
  return {
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
