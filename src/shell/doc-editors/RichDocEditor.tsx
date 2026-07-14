"use client";

import type { LibraryItem } from "../library-data";
import { useOnSaved } from "./doc-io";
import { RichDocControls } from "./RichDocControls";
import { RichDocStage } from "./RichDocStage";
import { useRichDocEditor } from "./use-rich-doc-editor";

export interface RichDocEditorProps {
  item: LibraryItem;
  siteId?: string;
  accent?: string;
  onSaved?: (url: string) => void;
}

/** 独立组合形态；宿主也可直接复用 hook + Controls + Stage 自行排版。 */
export function RichDocEditor({
  item,
  siteId = "",
  accent = "#4f46e5",
  onSaved,
}: RichDocEditorProps) {
  const editor = useRichDocEditor(item, siteId);
  useOnSaved(editor.savedUrl, onSaved);
  return (
    <div className="flex h-full min-h-0 bg-white">
      <div className="w-72 shrink-0 overflow-y-auto border-r border-stone-200">
        <RichDocControls editor={editor} accent={accent} />
      </div>
      <div className="min-w-0 flex-1">
        <RichDocStage editor={editor} accent={accent} />
      </div>
    </div>
  );
}
