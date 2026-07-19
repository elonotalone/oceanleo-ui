"use client";

import { useCallback, useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { RichDocContextToolbar } from "../doc-editors/RichDocContextToolbar";
import { RichDocControls } from "../doc-editors/RichDocControls";
import { RichDocStage } from "../doc-editors/RichDocStage";
import { downloadText } from "../doc-editors/doc-io";
import { useRichDocEditor } from "../doc-editors/use-rich-doc-editor";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

export function RichDocRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useRichDocEditor(item, siteId);
  const [exportError, setExportError] = useState("");
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "richdoc-materials@2",
      actions: ["insert"],
      accepts: (material) => {
        const urls = [
          material.url,
          material.previewUrl,
          material.thumbUrl,
        ].filter(Boolean);
        return (
          Boolean(material.previewUrl || material.thumbUrl) ||
          material.kind === "image" ||
          String(material.meta.mime || "").startsWith("image/") ||
          urls.some((url) =>
            /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url || ""),
          )
        );
      },
      mutate: (_action, material, placement) => {
        const candidates = [
          material.previewUrl,
          material.thumbUrl,
          material.url,
        ].filter(Boolean) as string[];
        const url =
          candidates.find((candidate) =>
            /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(candidate),
          ) || candidates[0] || "";
        if (!url) throw new Error("这个图片素材没有可用地址。");
        editor.insertImageUrl(
          url,
          placement?.source === "drop" &&
            Number.isFinite(placement.clientX) &&
            Number.isFinite(placement.clientY)
            ? {
                clientX: placement.clientX as number,
                clientY: placement.clientY as number,
              }
            : undefined,
        );
      },
    }),
    [editor.insertImageUrl],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    return saved
      ? {
          ok: true as const,
          item: advancedSavedItem(item, {
            url: saved.url,
            versionId: saved.versionId,
            meta: {
              editor_project_url: saved.projectUrl,
              editor_project_schema: saved.projectSchema,
            },
          }),
        }
      : { ok: false as const };
  }, [editor.save, item]);
  const importLocalFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (file.type.startsWith("image/")) await editor.uploadImage(file);
        else await editor.importSource(file);
      }
    },
    [editor.importSource, editor.uploadImage],
  );
  const exportStructuredJson = useCallback(() => {
    setExportError("");
    if (!editor.editor) {
      setExportError("文档尚未载入，不能导出可编辑 JSON。");
      return;
    }
    try {
      downloadText(
        `${item.title || "document"}.richdoc.json`,
        JSON.stringify(editor.editor.getJSON(), null, 2),
        "application/json;charset=utf-8",
      );
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : "文档 JSON 导出失败",
      );
    }
  }, [editor.editor, item.title]);
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "richdoc",
        label: editorToolLabel({ type: "richdoc" }),
        toolbox: {
          label: "插入",
          icon: "add",
          content: <RichDocControls editor={editor} accent={accent} />,
        },
        contextToolbar: (
          <RichDocContextToolbar editor={editor} accent={accent} />
        ),
        history: {
          canUndo: editor.editor?.can().undo() ?? false,
          canRedo: editor.editor?.can().redo() ?? false,
          undo: () => {
            editor.editor?.chain().focus().undo().run();
          },
          redo: () => {
            editor.editor?.chain().focus().redo().run();
          },
        },
        directDownload: {
          id: "richdoc-export-docx",
          label: "直接下载 DOCX",
          icon: "download",
          disabled: !editor.editor || editor.loading,
          onTrigger: editor.exportDoc,
        },
        actions: [
          {
            id: "richdoc-export-markdown",
            label: "导出 Markdown",
            disabled: !editor.editor || editor.loading,
            onTrigger: editor.exportMarkdown,
          },
          {
            id: "richdoc-export-html",
            label: "导出 HTML",
            disabled: !editor.editor || editor.loading,
            onTrigger: editor.exportHtml,
          },
          {
            id: "richdoc-export-json",
            label: "导出可编辑 JSON",
            disabled: !editor.editor || editor.loading,
            onTrigger: exportStructuredJson,
          },
        ],
        upload: {
          accept:
            ".doc,.docx,.md,.markdown,.txt,.html,.htm,image/*,text/plain,text/markdown,text/html",
          multiple: true,
          onFiles: importLocalFiles,
        },
        stage: <RichDocStage editor={editor} accent={accent} />,
        status:
          exportError ||
          editor.error ||
          (editor.loading ? "正在载入文档" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("richdoc", item),
            ready: Boolean(editor.editor) && !editor.loading,
            capture: () => editor.editor?.getJSON() || null,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
