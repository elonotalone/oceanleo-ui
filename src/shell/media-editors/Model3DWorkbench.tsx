"use client";

import { threeDSubtypeFor, type LibraryItem } from "../library-data";
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
  const subtype = threeDSubtypeFor(item);
  if (subtype !== "model") {
    return (
      <div
        role="alert"
        className="grid h-full min-h-[320px] place-items-center bg-[var(--surface,#f5f5f4)] p-6"
      >
        <div className="max-w-md rounded-xl border border-amber-200 bg-[var(--card,#fff)] p-5 text-center text-sm text-amber-700">
          {subtype === "hdri"
            ? "HDRI 是环境光照素材，不能作为 3D 模型加载。"
            : subtype === "texture"
              ? "纹理是模型贴图素材，不能作为 3D 模型加载。"
              : "这个条目不是可加载的 3D 模型。"}
        </div>
      </div>
    );
  }
  return (
    <Model3DWorkbenchRuntime
      item={item}
      siteId={siteId}
      accent={accent}
      onSaved={onSaved}
    />
  );
}

function Model3DWorkbenchRuntime({
  item,
  siteId = "",
  accent = "#4f46e5",
  onSaved,
}: Model3DWorkbenchProps) {
  const editor = useModel3DWorkbench(item, siteId, onSaved);
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--card,#fff)] md:flex-row">
      <aside className="max-h-[42%] w-full shrink-0 overflow-y-auto border-b border-[var(--border,#e7e5e4)] md:max-h-none md:w-64 md:border-b-0 md:border-r">
        <Model3DControls editor={editor} accent={accent} />
      </aside>
      <main className="min-h-0 min-w-0 flex-1">
        <Model3DStage editor={editor} accent={accent} />
      </main>
    </div>
  );
}
