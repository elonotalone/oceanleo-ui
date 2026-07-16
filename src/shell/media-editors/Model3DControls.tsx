"use client";

import { useUI } from "../../i18n/ui/useUI";
import { CHROME, PanelSection } from "../editor-chrome";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

// 3D「模型与材质」overlay 侧栏内容：模型导入/替换。截图、下载、保存副本已上移到
// 统一顶栏（AdvancedTopBar）；相机 / 灯光 / 背景 / 动画在选中模型浮动 bar
// （Model3DContextToolbar）。全部走 CHROME/CSS 变量令牌跟随双主题。

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
  void accent;
  return (
    <div className="space-y-1">
      <PanelSection title={tt("3D 模型")}>
        <label
          className={`flex w-full cursor-pointer items-center justify-center rounded-lg border ${CHROME.border} px-2 py-2 text-[11px] ${CHROME.fg2} ${CHROME.hover}`}
        >
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
        <p className={`mt-1.5 text-[10px] leading-relaxed ${CHROME.muted}`}>
          {tt("点击模型后，相机、灯光、背景和动画会出现在画布上方。")}
        </p>
      </PanelSection>
    </div>
  );
}
