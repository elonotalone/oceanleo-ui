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
import { DeckContextToolbar } from "../doc-editors/DeckContextToolbar";
import { DeckControls } from "../doc-editors/DeckControls";
import { DeckStage } from "../doc-editors/DeckStage";
import { useDeckEditor } from "../doc-editors/use-deck-editor";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

export function DeckRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useDeckEditor(item, siteId, previewContent);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "deck-elements@2",
      actions: ["insert", "replace"],
      accepts: (material) => {
        const url = material.url || material.previewUrl || material.thumbUrl || "";
        const mime = String(material.meta.mime || "").toLowerCase();
        return (
          material.kind === "image" ||
          mime.startsWith("image/") ||
          /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url)
        );
      },
      mutate: (action, material) => {
        const url = material.url || material.previewUrl || material.thumbUrl || "";
        if (!url) throw new Error("这个图片素材没有可用地址。");
        editor.insertImageElement(url, material.title, action === "replace");
      },
    }),
    [editor.insertImageElement],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
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

  // 统一顶栏：撤销/重做 · 幻灯片 · 加元素 · 设计面板 —— 收尾区：下载/导出/保存。
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
          id: "slides",
          actions: [
            {
              kind: "action",
              id: "add-slide",
              label: tt("新建一页"),
              icon: "plus",
              onRun: editor.addSlide,
            },
            {
              kind: "action",
              id: "duplicate-slide",
              label: tt("复制当前页"),
              icon: "duplicate",
              iconOnly: true,
              onRun: editor.duplicateSlide,
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
              onRun: editor.addTextElement,
            },
            {
              kind: "action",
              id: "add-image",
              label: tt("图片"),
              icon: "add-image",
              onRun: () => editor.insertImageElement("", tt("新图片")),
            },
            {
              kind: "action",
              id: "add-shape",
              label: tt("形状"),
              icon: "add-shape",
              onRun: () => editor.addShapeElement("rect"),
            },
          ],
        },
        {
          id: "design",
          actions: [
            {
              kind: "panel",
              id: "design",
              label: tt("设计"),
              icon: "palette",
              panelId: "design",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "download",
          label: tt("下载工程"),
          icon: "download",
          iconOnly: true,
          onRun: editor.downloadJson,
        },
        {
          kind: "action",
          id: "export",
          label: tt("导出 PPTX"),
          icon: "present",
          disabled: editor.exporting,
          onRun: () => void editor.exportPptx(),
        },
        {
          kind: "action",
          id: "save",
          label: editor.saving ? tt("保存中…") : tt("保存"),
          icon: "save",
          disabled: editor.saving,
          onRun: () => void editor.save(),
        },
      ],
    }),
    [
      editor.addShapeElement,
      editor.addSlide,
      editor.addTextElement,
      editor.canRedo,
      editor.canUndo,
      editor.downloadJson,
      editor.duplicateSlide,
      editor.exportPptx,
      editor.exporting,
      editor.insertImageElement,
      editor.redo,
      editor.save,
      editor.saving,
      editor.undo,
      tt,
    ],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "design",
        title: tt("设计"),
        width: 320,
        content: <DeckControls editor={editor} accent={accent} />,
      },
    ],
    [accent, editor, tt],
  );

  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "deck" })}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
      editorContextualToolbar={
        <DeckContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<DeckStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入演示文稿" : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
