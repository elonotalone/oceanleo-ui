"use client";

import type { LibraryItem } from "../library-data";
import { PdfControls } from "./PdfControls";
import { PdfStage } from "./PdfStage";
import { usePdfWorkbench } from "./use-pdf-workbench";

export interface PdfWorkbenchProps {
  item: LibraryItem;
  siteId?: string;
  accent?: string;
  onSaved?: (url: string) => void;
}

export function PdfWorkbench({
  item,
  siteId = "",
  accent = "#4f46e5",
  onSaved,
}: PdfWorkbenchProps) {
  const editor = usePdfWorkbench(item, siteId, onSaved);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white md:flex-row">
      <aside className="max-h-[42%] w-full shrink-0 overflow-y-auto border-b border-stone-200 md:max-h-none md:w-64 md:border-b-0 md:border-r">
        <PdfControls editor={editor} accent={accent} />
      </aside>
      <main className="min-h-0 min-w-0 flex-1">
        <PdfStage editor={editor} accent={accent} />
      </main>
    </div>
  );
}
