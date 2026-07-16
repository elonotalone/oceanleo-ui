"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import {
  AdvancedWorkbenchShell,
  type EditorPanelDescriptor,
} from "../AdvancedWorkbenchShell";
import type { TopBarModel } from "../advanced-topbar";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME } from "../editor-chrome";
import { EditorIcon } from "../editor-icons";
import { FabricImageContextToolbar } from "../image-editor/FabricImageContextToolbar";
import { FabricImageControls } from "../image-editor/FabricImageControls";
import { FabricImageStage } from "../image-editor/FabricImageStage";
import { useFabricImageEditor } from "../image-editor/use-fabric-image-editor";
import { editorToolLabel } from "../workbench-routes";

export function ImageRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useFabricImageEditor(item, siteId);
  const savedItem = useMemo(
    () =>
      editor.savedUrl
        ? advancedSavedItem(item, { url: editor.savedUrl })
        : null,
    [editor.savedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.save();
    return url
      ? { ok: true as const, item: advancedSavedItem(item, { url }) }
      : { ok: false as const };
  }, [editor.save, item]);

  // 统一顶栏：撤销/重做 · 加对象（文字/形状/图片/上传）· 调整/图层面板 ——
  // 收尾区：下载/保存。选中对象的样式仍在对象上方浮动 bar。
  const topBarModel = useMemo<TopBarModel>(
    () => ({
      groups: [
        {
          id: "history",
          actions: [
            {
              kind: "action",
              id: "undo",
              label: tt("撤销"),
              icon: "undo",
              iconOnly: true,
              disabled: !editor.canUndo,
              onRun: editor.undo,
            },
            {
              kind: "action",
              id: "redo",
              label: tt("重做"),
              icon: "redo",
              iconOnly: true,
              disabled: !editor.canRedo,
              onRun: editor.redo,
            },
          ],
        },
        {
          id: "insert",
          actions: [
            {
              kind: "action",
              id: "add-text",
              label: tt("文字"),
              icon: "add-text",
              onRun: editor.addText,
            },
            {
              kind: "action",
              id: "add-shape",
              label: tt("形状"),
              icon: "add-shape",
              onRun: () => editor.addShape("rect"),
            },
            {
              // 上传本地图片需要 <input type=file>：用 custom 直接渲染一个
              // 与 ToolButton 同款的 label（点击即开系统文件框），无需 ref。
              kind: "custom",
              id: "add-image",
              render: (
                <label
                  title={tt("图片")}
                  className={`inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition ${CHROME.fg2} ${CHROME.hover} hover:text-[var(--fg,#1c1917)]`}
                >
                  <EditorIcon name="add-image" className="h-4 w-4" />
                  <span className="max-w-[9rem] truncate">{tt("图片")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void editor.addImageFromFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              ),
            },
          ],
        },
        {
          id: "edit",
          actions: [
            {
              kind: "panel",
              id: "adjust",
              label: tt("调整"),
              icon: "adjust",
              panelId: "adjust",
            },
            {
              kind: "panel",
              id: "layers",
              label: tt("图层"),
              icon: "layers",
              panelId: "layers",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "download",
          label: tt("下载"),
          icon: "download",
          iconOnly: true,
          disabled: editor.loading,
          onRun: editor.download,
        },
        {
          kind: "action",
          id: "save",
          label: editor.saving ? tt("保存中…") : tt("保存"),
          icon: "save",
          disabled: editor.loading || editor.saving,
          onRun: () => void editor.save(),
        },
      ],
    }),
    [
      editor.addImageFromFile,
      editor.addShape,
      editor.addText,
      editor.canRedo,
      editor.canUndo,
      editor.download,
      editor.loading,
      editor.redo,
      editor.save,
      editor.saving,
      editor.undo,
      tt,
    ],
  );

  // 调整面板与图层面板共用同一份 FabricImageControls（内含所有分节）；panelId
  // 只决定顶栏哪个按钮点亮，overlay 内容一致，避免两份重复实现。
  const editorPanels = useMemo<EditorPanelDescriptor[]>(() => {
    const content = <FabricImageControls editor={editor} accent={accent} />;
    return [
      { id: "adjust", title: tt("调整"), width: 320, content },
      { id: "layers", title: tt("图层"), width: 320, content },
    ];
  }, [accent, editor, tt]);

  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "image" })}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
      editorContextualToolbar={
        <FabricImageContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<FabricImageStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入图片编辑器" : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
