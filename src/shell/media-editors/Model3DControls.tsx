"use client";

import { useUI } from "../../i18n/ui/useUI";
import type { Model3DTextureSlot } from "./model3d-runtime.mjs";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

function ActionButton({
  children,
  onClick,
  disabled,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-2 text-[11px] disabled:opacity-40 ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
      }`}
    >
      {children}
    </button>
  );
}

const TEXTURE_SLOTS: Array<{
  id: Model3DTextureSlot;
  label: string;
}> = [
  { id: "baseColor", label: "基础色纹理" },
  { id: "normal", label: "法线纹理" },
  { id: "metallicRoughness", label: "金属度/粗糙度纹理" },
  { id: "emissive", label: "自发光纹理" },
  { id: "occlusion", label: "环境遮蔽纹理" },
];

function TextureSlotInput({
  editor,
  slot,
  label,
  disabled,
}: {
  editor: Model3DWorkbenchState;
  slot: Model3DTextureSlot;
  label: string;
  disabled: boolean;
}) {
  const selected = editor.materials.find(
    (entry) => entry.index === editor.selectedMaterialIndex,
  );
  const current = selected?.textures[slot] || "";
  return (
    <div className="rounded-lg border border-[var(--border,#e7e5e4)] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-[var(--fg-2,#57534e)]">
          {label}
        </span>
        {current && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => editor.clearMaterialTexture(slot)}
            className="text-[10px] text-red-500 disabled:opacity-40"
          >
            清除
          </button>
        )}
      </div>
      <label className="mt-1.5 block cursor-pointer rounded-md bg-[var(--surface,#f5f5f4)] px-2 py-1.5 text-center text-[10px] text-[var(--muted,#78716c)]">
        {current ? "替换 PNG / JPEG" : "选择 PNG / JPEG"}
        <input
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void editor.replaceMaterialTexture(slot, file);
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

export function Model3DControls({
  editor,
}: {
  editor: Model3DWorkbenchState;
}) {
  const tt = useUI();
  const busy =
    editor.loading || editor.capturing || editor.saving || editor.downloading;
  const selectedMaterial = editor.materials.find(
    (entry) => entry.index === editor.selectedMaterialIndex,
  );
  return (
    <div className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4">
      <section className="space-y-2">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("3D 模型")}
        </p>
        <label className="flex w-full cursor-pointer items-center justify-center rounded-xl border border-[var(--border,#e7e5e4)] px-2.5 py-2 text-[11px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]">
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
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("Three.js 拥有可编辑场景；保存会导出新的自包含 GLB。")}
        </p>
      </section>

      <section className="space-y-2 border-t border-[var(--border,#e7e5e4)] pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
            {tt("场景树")}
          </p>
          <span className="text-[10px] text-[var(--muted,#78716c)]">
            {editor.sceneNodes.length}
          </span>
        </div>
        <div
          data-testid="model3d-scene-tree"
          className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--border,#e7e5e4)] p-1"
        >
          {editor.sceneNodes.length ? (
            editor.sceneNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                data-node-id={node.id}
                disabled={!node.selectable}
                onClick={() => editor.selectNode(node.id)}
                className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[10px] disabled:cursor-default ${
                  editor.selectedNode?.id === node.id
                    ? "bg-violet-500/10 text-violet-700"
                    : "text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
                }`}
                style={{ paddingLeft: `${6 + node.depth * 12}px` }}
              >
                <span className="w-3 shrink-0 text-center opacity-60">
                  {node.childCount ? "▾" : "·"}
                </span>
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                <span className="shrink-0 text-[9px] opacity-50">
                  {node.kind}
                </span>
              </button>
            ))
          ) : (
            <p className="px-2 py-4 text-center text-[10px] text-[var(--muted,#78716c)]">
              {tt("载入模型后显示节点")}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton
            disabled={!editor.modelLoaded || busy}
            onClick={editor.addCamera}
          >
            {tt("添加相机")}
          </ActionButton>
          <ActionButton
            disabled={!editor.modelLoaded || busy}
            onClick={() => editor.addLight("directional")}
          >
            {tt("平行光")}
          </ActionButton>
          <ActionButton
            disabled={!editor.modelLoaded || busy}
            onClick={() => editor.addLight("point")}
          >
            {tt("点光源")}
          </ActionButton>
          <ActionButton
            disabled={!editor.modelLoaded || busy}
            onClick={() => editor.addLight("spot")}
          >
            {tt("聚光灯")}
          </ActionButton>
        </div>
        {editor.selectedNode && (
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton
              onClick={() =>
                editor.setSelectedNodeVisible(!editor.selectedNode?.visible)
              }
            >
              {editor.selectedNode.visible ? tt("隐藏节点") : tt("显示节点")}
            </ActionButton>
            <ActionButton danger onClick={editor.deleteSelectedNode}>
              {tt("删除节点")}
            </ActionButton>
          </div>
        )}
      </section>

      {selectedMaterial && (
        <section className="space-y-2 border-t border-[var(--border,#e7e5e4)] pt-3">
          <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
            {tt("PBR 纹理槽")}
          </p>
          <p className="truncate text-[10px] text-[var(--muted,#78716c)]">
            {selectedMaterial.name}
          </p>
          <div className="space-y-1.5">
            {TEXTURE_SLOTS.map((slot) => (
              <TextureSlotInput
                key={slot.id}
                editor={editor}
                slot={slot.id}
                label={tt(slot.label)}
                disabled={busy}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2 border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("模型标注")}
        </p>
        <textarea
          value={editor.annotationDraft}
          onChange={(event) => editor.setAnnotationDraft(event.target.value)}
          placeholder={tt("输入标注，再点击模型表面放置")}
          className="min-h-16 w-full resize-y rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent px-2.5 py-2 text-[11px] outline-none"
        />
        <ActionButton
          disabled={
            busy || !editor.modelLoaded || !editor.annotationDraft.trim()
          }
          onClick={editor.beginAnnotationPlacement}
        >
          {editor.annotationPlacementArmed
            ? tt("请点击模型表面…")
            : tt("点击模型放置标注")}
        </ActionButton>
      </section>

      <section className="space-y-1.5 border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="mb-2 text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("导出与截图")}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton
            disabled={busy || !editor.modelLoaded}
            onClick={() => void editor.downloadModel()}
          >
            {editor.downloading ? tt("导出中…") : tt("导出新 GLB")}
          </ActionButton>
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
            {tt("截图到文件库")}
          </ActionButton>
        </div>
      </section>
    </div>
  );
}
