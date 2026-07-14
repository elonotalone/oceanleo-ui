"use client";

import type { LibraryItem } from "../library-data";
import { Model3DControls } from "./Model3DControls";
import { Model3DStage } from "./Model3DStage";
import { useModel3DWorkbench } from "./use-model3d-workbench";

export interface Model3DWorkbenchProps {
  item: LibraryItem;
  siteId?: string;
  accent?: string;
  onSaved?: (url: string) => void;
}

export function Model3DWorkbench({
  item,
  siteId = "",
  accent = "#4f46e5",
  onSaved,
}: Model3DWorkbenchProps) {
  const editor = useModel3DWorkbench(item, siteId, onSaved);
  return (
    <div className="flex h-full min-h-0 flex-col bg-white md:flex-row">
      <aside className="max-h-[42%] w-full shrink-0 overflow-y-auto border-b border-stone-200 md:max-h-none md:w-64 md:border-b-0 md:border-r">
        <Model3DControls editor={editor} accent={accent} />
      </aside>
      <main className="min-h-0 min-w-0 flex-1">
        <Model3DStage editor={editor} accent={accent} />
      </main>
    </div>
  );
}
