"use client";

import type { LibraryItem } from "../library-data";
import { useOnSaved } from "./doc-io";
import { GridStage } from "./GridStage";
import { useGridEditor } from "./use-grid-editor";

export interface GridEditorProps {
  item: LibraryItem;
  siteId?: string;
  accent?: string;
  onSaved?: (url: string) => void;
}

/** Composed editor; route adapters may also place hook/controls/stage separately. */
export function GridEditor({
  item,
  siteId = "",
  accent = "#4f46e5",
  onSaved,
}: GridEditorProps) {
  const editor = useGridEditor(item, siteId);
  useOnSaved(editor.savedUrl, onSaved);
  return (
    <div className="h-full min-h-0 bg-[var(--card,#fff)]">
      <GridStage editor={editor} accent={accent} />
    </div>
  );
}
