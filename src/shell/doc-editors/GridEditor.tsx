"use client";

import type { LibraryItem } from "../library-data";
import { useOnSaved } from "./doc-io";
import { GridControls } from "./GridControls";
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
    <div className="flex h-full min-h-0 bg-white">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-stone-200">
        <GridControls editor={editor} accent={accent} />
      </aside>
      <main className="min-w-0 flex-1">
        <GridStage editor={editor} accent={accent} />
      </main>
    </div>
  );
}
