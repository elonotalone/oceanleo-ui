"use client";

import { useUI } from "../../i18n/ui/useUI";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? "rounded-lg px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-45"
          : "rounded-lg border border-stone-200 px-2 py-2 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
      }
      style={primary ? { background: accent || "#4f46e5" } : undefined}
    >
      {children}
    </button>
  );
}

export function Model3DControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: Model3DWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const busy =
    editor.loading || editor.capturing || editor.saving || editor.downloading;
  return (
    <div className="space-y-4 overflow-y-auto p-3">
      <section className="space-y-2">
        <p className="text-[11px] font-semibold text-stone-800">
          {tt("3D 模型")}
        </p>
        <label className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-stone-200 px-2 py-2 text-[11px] text-stone-600 hover:bg-stone-50">
          {editor.sourceUrl ? tt("替换模型") : tt("导入 GLB / glTF")}
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void editor.importModel(file);
              event.target.value = "";
            }}
          />
        </label>
        <p className="text-[10px] leading-relaxed text-stone-400">
          {tt("点击模型后，相机、灯光、背景和动画会出现在画布上方。")}
        </p>
      </section>

      <section className="space-y-1.5 border-t border-stone-100 pt-3">
        <p className="mb-2 text-[11px] font-semibold text-stone-800">
          {tt("截图与保存")}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton
            disabled={busy || !editor.modelLoaded}
            onClick={() => void editor.downloadScreenshot()}
          >
            {editor.capturing ? tt("截图中…") : tt("下载截图")}
          </ActionButton>
          <ActionButton
            disabled={busy || !editor.modelLoaded}
            onClick={() => void editor.saveScreenshot()}
          >
            {tt("保存截图")}
          </ActionButton>
          <ActionButton
            disabled={busy || !editor.sourceUrl}
            onClick={() => void editor.downloadModel()}
          >
            {editor.downloading ? tt("下载中…") : tt("下载模型")}
          </ActionButton>
          <ActionButton
            primary
            accent={accent}
            disabled={busy || !editor.modelLoaded}
            onClick={() => void editor.saveCopy()}
          >
            {editor.saving ? tt("保存中…") : tt("保存视图副本")}
          </ActionButton>
        </div>
        {editor.savedUrl && (
          <p className="text-[10px] text-emerald-600">
            {tt("3D 视图副本已保存到我的库")}
          </p>
        )}
      </section>
    </div>
  );
}
