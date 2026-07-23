"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { fetchMediaBlob } from "../../lib/media-proxy";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { createArtifactRevision } from "../artifact-client";
import {
  advancedSavedItem,
  commitAdvancedSavedRevision,
} from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { RichDocContextToolbar } from "../doc-editors/RichDocContextToolbar";
import { RichDocControls } from "../doc-editors/RichDocControls";
import { RichDocStage } from "../doc-editors/RichDocStage";
import { downloadText } from "../doc-editors/doc-io";
import { useRichDocEditor } from "../doc-editors/use-rich-doc-editor";
import { isDurableLibraryItem } from "../library-data";
import { useOfficeArtifactSource } from "../office-editor";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

async function sha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前环境缺少 Web Crypto，无法验证文档 revision。");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

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
    if (!saved) return { ok: false as const };
    const savedMeta = {
      editor_project_url: saved.projectUrl,
      editor_project_schema: saved.projectSchema,
    };
    if (!isDurableLibraryItem(item)) {
      return {
        ok: true as const,
        item: advancedSavedItem(item, {
          url: saved.url,
          versionId: saved.versionId,
          meta: savedMeta,
        }),
      };
    }
    try {
      if (!saved.url || !saved.projectUrl) {
        throw new Error("文档保存没有返回完整的 source/editor manifest。");
      }
      const sourceBlobPromise = fetchMediaBlob(saved.url, {
        maxBytes: 40_000_000,
        cache: "no-store",
      });
      const manifestBlobPromise =
        saved.projectUrl === saved.url
          ? sourceBlobPromise
          : fetchMediaBlob(saved.projectUrl, {
              maxBytes: 20_000_000,
              cache: "no-store",
            });
      const [sourceBlob, manifestBlob] = await Promise.all([
        sourceBlobPromise,
        manifestBlobPromise,
      ]);
      const [sourceDigest, manifestDigest] = await Promise.all([
        sha256(sourceBlob),
        sha256(manifestBlob),
      ]);
      const committed = await commitAdvancedSavedRevision(item, {
        publish: createArtifactRevision,
        commit: {
          source: {
            format: "docx",
            url: saved.url,
            digest: sourceDigest,
          },
          renditions: [
            {
              purpose: "full",
              url: saved.url,
              digest: sourceDigest,
            },
            {
              purpose: "editor_manifest",
              url: saved.projectUrl,
              digest: manifestDigest,
            },
          ],
          provenance: {
            editor: "richdoc",
            editorProjectSchema: saved.projectSchema,
            previousRevisionId: item.revisionId,
          },
        },
        meta: savedMeta,
      });
      return { ok: true as const, item: committed };
    } catch (caught) {
      return {
        ok: false as const,
        error:
          caught instanceof Error
            ? caught.message
            : "文档 artifact revision 保存失败",
      };
    }
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
          ...(editor.error || officeSource.error
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
            capture: () => editor.editor?.getJSON() || null,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
