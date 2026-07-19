"use client";

import { AdvancedFontPicker } from "../AdvancedFontPicker";
import type { DeckEditorState } from "./use-deck-editor";

export function DeckFontPanel({ editor }: { editor: DeckEditorState }) {
  const selected = editor.selectedElement;
  return (
    <AdvancedFontPicker
      selectedFamily={selected?.fontFamily}
      disabled={!selected || selected.type !== "text" || selected.locked}
      onSelect={(fontFamily) => {
        if (selected?.type === "text") {
          editor.patchElement(selected.id, { fontFamily });
        }
      }}
    />
  );
}
