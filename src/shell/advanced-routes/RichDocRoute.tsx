"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { RichDocContextToolbar } from "../doc-editors/RichDocContextToolbar";
import { RichDocControls } from "../doc-editors/RichDocControls";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { RichDocStage } from "../doc-editors/RichDocStage";
import { downloadText } from "../doc-editors/doc-io";
import { artifactSaveStepMessage } from "../doc-editors/artifact-save-contract";
import {
  richDocSavedItemForHandoff,
  useRichDocEditor,
  RICHDOC_SOURCE_FORMAT,
  RICHDOC_SOURCE_MEDIA_TYPE,
} from "../doc-editors/use-rich-doc-editor";
import { isDurableLibraryItem } from "../library-data";
import { useOfficeArtifactSource } from "../office-editor";
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
  // A successful commit updates `item` to the new pinned revision. Keep the
  // loaded bytes stable so that parent identity updates cannot discard edits
  // that landed while the save request was in flight.
  const openedItemRef = useRef(item);
  const officeSource = useOfficeArtifactSource(openedItemRef.current);
  const editor = useRichDocEditor(
    officeSource.item,
    siteId,
    officeSource.resourceFailed,
  );
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
    if (!saved) {
      return {
        ok: false as const,
        error:
          editor.error ||
          artifactSaveStepMessage(
            "contract",
            "文档源可能尚未成功载入，没有可提交的内容",
          ),
      };
    }
    const savedMeta = {
      source_format: saved.sourceFormat || RICHDOC_SOURCE_FORMAT,
      source_media_type: saved.sourceMediaType || RICHDOC_SOURCE_MEDIA_TYPE,
      source_url: saved.url,
      delivery_format: RICHDOC_SOURCE_FORMAT,
      editor_project_url: saved.projectUrl,
      editor_project_schema: saved.projectSchema,
      editor_manifest_url: saved.projectUrl,
      editor_manifest_schema: saved.projectSchema,
      editor_working_head_url: saved.projectUrl,
      editor_working_head_project_url: saved.projectUrl,
      editor_working_head_schema: saved.projectSchema,
    };
    const receipt = advancedSavedItem(item, {
      url: saved.url,
      versionId: saved.versionId,
      title: saved.title,
      meta: savedMeta,
    });
    // The typed revision is published by the editor's own save through the
    // shared contract. A durable item that comes back without a new revision
    // means the commit silently fell through to the legacy creation path.
    if (isDurableLibraryItem(item)) {
      if (
        !saved.item ||
        !isDurableLibraryItem(saved.item) ||
        saved.item.artifactId !== item.artifactId ||
        !saved.revisionId ||
        saved.revisionId === saved.previousRevisionId
      ) {
        return {
          ok: false as const,
          error: artifactSaveStepMessage(
            "revision-verify",
            "这次保存没有在同一份素材上产生新的版本",
          ),
        };
      }
      return {
        ok: true as const,
        item: richDocSavedItemForHandoff(saved.item, saved),
      };
    }
    return {
      ok: true as const,
      item: richDocSavedItemForHandoff(receipt || item, saved),
    };
  }, [editor.error, editor.save, item]);
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
          disabled: !editor.editor || editor.loading || !editor.sourceReady,
          onTrigger: editor.exportDoc,
        },
        actions: [
          ...(officeSource.error && !editor.dirty
            ? [
                {
                  id: "richdoc-refresh-office-source",
                  label: "刷新 source/full 后重试",
                  onTrigger: officeSource.retry,
                },
              ]
            : []),
          {
            id: "richdoc-export-markdown",
            label: "导出 Markdown",
            group: "download",
            disabled: !editor.editor || editor.loading || !editor.sourceReady,
            onTrigger: editor.exportMarkdown,
          },
          {
            id: "richdoc-export-html",
            label: "导出 HTML",
            group: "download",
            disabled: !editor.editor || editor.loading || !editor.sourceReady,
            onTrigger: editor.exportHtml,
          },
          {
            id: "richdoc-export-json",
            label: "导出可编辑 JSON",
            group: "download",
            disabled: !editor.editor || editor.loading || !editor.sourceReady,
            onTrigger: exportStructuredJson,
          },
        ],
        upload: {
          accept:
            ".doc,.docx,.md,.markdown,.txt,.html,.htm,image/*,text/plain,text/markdown,text/html",
          multiple: true,
          onFiles: importLocalFiles,
        },
        stage:
          !editor.loading && !editor.sourceReady ? (
            // 取源失败时这条路由不挂 tiptap，`RichDocStage` 里的失败态就够不着；
            // 重试入口必须由顶掉舞台的这一格自己带上，否则文案里的「重新载入」
            // 又会变成一句用户点不到的空话。
            <EditorSourceFailurePanel
              variant="surface"
              message={editor.error || "文档源未成功载入，编辑器已停止。"}
              onReload={editor.reload}
            />
          ) : (
            <RichDocStage editor={editor} accent={accent} />
          ),
        status:
          exportError ||
          (!item.meta.editor_project_url &&
            Boolean(item.url || item.artifactId) &&
            officeSource.error) ||
          editor.error ||
          (editor.loading || officeSource.loading ? "正在载入文档" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("richdoc", item),
            ready: Boolean(editor.editor) && !editor.loading,
            capture: () =>
              editor.sourceReady ? editor.editor?.getJSON() || null : null,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
