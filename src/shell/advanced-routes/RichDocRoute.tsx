"use client";

import { useCallback, useMemo } from "react";
import { useEditorState } from "@tiptap/react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import {
  AdvancedWorkbenchShell,
  type EditorPanelDescriptor,
} from "../AdvancedWorkbenchShell";
import type { TopBarModel } from "../advanced-topbar";
import { useUI } from "../../i18n/ui/useUI";
import { RichDocContextToolbar } from "../doc-editors/RichDocContextToolbar";
import { RichDocControls } from "../doc-editors/RichDocControls";
import { RichDocStage } from "../doc-editors/RichDocStage";
import { useRichDocEditor } from "../doc-editors/use-rich-doc-editor";
import { editorToolLabel } from "../workbench-routes";

export function RichDocRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useRichDocEditor(item, siteId);
  const instance = editor.editor;

  // 顶栏的高频排版开关（粗/斜/下划线/列表）需要 tiptap 的实时 isActive 态，
  // 用 useEditorState 订阅一次，避免每次事务手动 forceUpdate。
  const marks = useEditorState({
    editor: instance,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
      canUndo: e?.can().chain().focus().undo().run() ?? false,
      canRedo: e?.can().chain().focus().redo().run() ?? false,
    }),
  }) ?? {
    bold: false,
    italic: false,
    underline: false,
    bulletList: false,
    orderedList: false,
    canUndo: false,
    canRedo: false,
  };

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

  // 统一顶栏：撤销/重做 · 排版开关（粗/斜/下划线/列表）· 插入表格 · 样式面板
  // —— 收尾区：导出 Markdown/DOCX/保存。
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
              disabled: !instance || !marks.canUndo,
              onRun: () => instance?.chain().focus().undo().run(),
            },
            {
              kind: "action",
              id: "redo",
              label: tt("重做"),
              icon: "redo",
              iconOnly: true,
              disabled: !instance || !marks.canRedo,
              onRun: () => instance?.chain().focus().redo().run(),
            },
          ],
        },
        {
          id: "format",
          actions: [
            {
              kind: "toggle",
              id: "bold",
              label: tt("加粗"),
              icon: "bold",
              iconOnly: true,
              active: marks.bold,
              disabled: !instance,
              onRun: () => instance?.chain().focus().toggleBold().run(),
            },
            {
              kind: "toggle",
              id: "italic",
              label: tt("斜体"),
              icon: "italic",
              iconOnly: true,
              active: marks.italic,
              disabled: !instance,
              onRun: () => instance?.chain().focus().toggleItalic().run(),
            },
            {
              kind: "toggle",
              id: "underline",
              label: tt("下划线"),
              icon: "underline",
              iconOnly: true,
              active: marks.underline,
              disabled: !instance,
              onRun: () => instance?.chain().focus().toggleUnderline().run(),
            },
            {
              kind: "toggle",
              id: "bullet-list",
              label: tt("项目符号"),
              icon: "bullet-list",
              iconOnly: true,
              active: marks.bulletList,
              disabled: !instance,
              onRun: () => instance?.chain().focus().toggleBulletList().run(),
            },
            {
              kind: "toggle",
              id: "ordered-list",
              label: tt("编号列表"),
              icon: "ordered-list",
              iconOnly: true,
              active: marks.orderedList,
              disabled: !instance,
              onRun: () => instance?.chain().focus().toggleOrderedList().run(),
            },
          ],
        },
        {
          id: "insert",
          actions: [
            {
              kind: "action",
              id: "add-table",
              label: tt("表格"),
              icon: "add-table",
              disabled: !instance,
              onRun: () =>
                instance
                  ?.chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run(),
            },
            {
              kind: "action",
              id: "add-image",
              label: tt("图片"),
              icon: "add-image",
              disabled: !instance,
              onRun: () => editor.insertImageUrl(""),
            },
          ],
        },
        {
          id: "content",
          actions: [
            {
              kind: "panel",
              id: "insert-panel",
              label: tt("插入"),
              icon: "plus",
              panelId: "insert",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "export-md",
          label: tt("导出 Markdown"),
          icon: "download",
          iconOnly: true,
          disabled: !instance || editor.loading,
          onRun: () => void editor.exportMarkdown(),
        },
        {
          kind: "action",
          id: "export-doc",
          label: tt("导出 DOCX"),
          icon: "type",
          disabled: !instance || editor.loading,
          onRun: () => void editor.exportDoc(),
        },
        {
          kind: "action",
          id: "save",
          label: editor.saving ? tt("保存中…") : tt("保存"),
          icon: "save",
          disabled: editor.saving || editor.loading || !instance,
          onRun: () => void editor.save(),
        },
      ],
    }),
    [
      editor,
      instance,
      marks.bold,
      marks.bulletList,
      marks.canRedo,
      marks.canUndo,
      marks.italic,
      marks.orderedList,
      marks.underline,
      tt,
    ],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "insert",
        title: tt("插入"),
        width: 300,
        content: <RichDocControls editor={editor} accent={accent} />,
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
      editorLabel={editorToolLabel({ type: "richdoc" })}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
      editorContextualToolbar={
        <RichDocContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<RichDocStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        (editor.dirty
          ? "有未保存的修改"
          : editor.savedUrl
          ? "已保存到我的库"
          : editor.loading
            ? "正在载入文档"
            : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
