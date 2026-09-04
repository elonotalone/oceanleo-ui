"use client";

import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { resolveEditorCore } from "../editor-core-flags";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { exportWechatFromTiptap } from "../doc-editors/rich-doc-wechat-export";
import { RichDocContextToolbar } from "../doc-editors/RichDocContextToolbar";
import { RichDocControls } from "../doc-editors/RichDocControls";
import { RichDocCommentRail } from "../doc-editors/richdoc-review/RichDocCommentRail";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { RichDocStage } from "../doc-editors/RichDocStage";
import { downloadText } from "../doc-editors/doc-io";
import { artifactSaveStepMessage } from "../doc-editors/artifact-save-contract";
import { tiptapJsonToDocxBlob } from "../doc-editors/docx-export";
import { buildRichDocCommandSurface } from "../doc-editors/doc-family-commands";
import { downloadConvertedCopy } from "../doc-editors/doc-family-download";
import {
  DOC_FAMILY_DOWNLOAD_FORMATS,
  docFamilyAcceptAttribute,
} from "../doc-editors/doc-family-formats";
import { importDocFamilyFile } from "../doc-editors/doc-family-import";
import { usePluginCommandSurface } from "../plugin-command";
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

/**
 * 双核 `next` 分支：Umo iframe 托管。**单独 lazy**，翻 flag 前不进本 chunk
 * （`editor-core-flags.ts` 纪律 1）。
 */
const RichDocHostedRoute = lazy(() =>
  import("./RichDocHostedRoute").then((module) => ({
    default: module.RichDocHostedRoute,
  })),
);

/**
 * 双核分发口。**flag 只在这里判一次**。
 * 默认 `legacy`（§10 第 3 条）。验收绿之后才翻 flag 并单独删旧目录。
 */
export function RichDocRoute(props: AdvancedContentWorkbenchProps) {
  if (resolveEditorCore("richdoc") === "next") {
    return (
      <Suspense fallback={null}>
        <RichDocHostedRoute {...props} />
      </Suspense>
    );
  }
  return <RichDocLegacyRoute {...props} />;
}

function RichDocLegacyRoute({
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
  const [importError, setImportError] = useState("");
  /**
   * 上传/拖进来的文件先归一化：`.doc`/`.rtf`/`.odt` 这类先转成 DOCX 再进编辑器
   * （转换在后端，合同 §3.3）。转不了的一律报出**一句能看懂的原因**，
   * 不再像过去那样把二进制 `.doc` 当纯文本塞进去、留一个乱码或空白文档。
   */
  const importLocalFiles = useCallback(
    async (files: File[]) => {
      setImportError("");
      for (const file of files) {
        const outcome = await importDocFamilyFile(file, "richdoc");
        if (outcome.image) {
          await editor.uploadImage(outcome.file);
          continue;
        }
        if (!outcome.ok) {
          setImportError(outcome.message);
          continue;
        }
        await editor.importSource(outcome.file);
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
  const exportWechat = useCallback(() => {
    setExportError("");
    if (!editor.editor) {
      setExportError("文档尚未载入，不能转公众号排版。");
      return;
    }
    const result = exportWechatFromTiptap(editor.editor.getJSON(), {
      title: item.title,
    });
    if (!result.html) {
      setExportError(result.warnings[0] || "没有可排版的正文。");
      return;
    }
    downloadText(
      `${item.title || "document"}.wechat.html`,
      result.html,
      "text/html;charset=utf-8",
    );
    if (result.warnings.length > 0) setExportError(result.warnings[0]);
  }, [editor.editor, item.title]);
  /**
   * PDF 浏览器本地出不来，交给后端 `/v1/convert/office`：先用编辑器已有的 DOCX
   * 写入器出一份字节，再转一次。这样下载的 PDF 与下载的 DOCX 是同一份内容。
   */
  const exportPdf = useCallback(async (): Promise<string> => {
    if (!editor.editor) return "文档尚未载入，不能导出 PDF。";
    const title = item.title || "document";
    try {
      const docx = await tiptapJsonToDocxBlob(title, editor.editor.getJSON());
      return await downloadConvertedCopy({
        source: docx,
        sourceName: `${title}.docx`,
        target: "pdf",
        baseName: title,
      });
    } catch (caught) {
      return caught instanceof Error && caught.message
        ? caught.message
        : "导出 PDF 失败。";
    }
  }, [editor.editor, item.title]);
  /** 一个后缀 → 一次下载。返回空串表示成功，非空是要显示的原因。 */
  const downloadAs = useCallback(
    async (extension: string): Promise<string> => {
      setExportError("");
      try {
        switch (extension) {
          case "docx":
            await editor.exportDoc();
            return "";
          case "md":
            await editor.exportMarkdown();
            return "";
          case "html":
            await editor.exportHtml();
            return "";
          case "txt":
            editor.exportText();
            return "";
          case "json":
            exportStructuredJson();
            return "";
          case "pdf": {
            const failure = await exportPdf();
            if (failure) setExportError(failure);
            return failure;
          }
          default:
            return `这里没有 ${extension.toUpperCase()} 这个下载格式。`;
        }
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message
            ? caught.message
            : `导出 ${extension.toUpperCase()} 失败。`;
        setExportError(message);
        return message;
      }
    },
    [
      editor.exportDoc,
      editor.exportHtml,
      editor.exportMarkdown,
      editor.exportText,
      exportPdf,
      exportStructuredJson,
    ],
  );
  usePluginCommandSurface(
    buildRichDocCommandSurface(editor, { download: downloadAs }),
  );
  const downloadDisabled =
    !editor.editor || editor.loading || !editor.sourceReady;
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "richdoc",
        label: editorToolLabel({ type: "richdoc" }),
        // 申报了 `drawers` 之后 `resolveInlineAdvancedDrawers` 就直接返回它，
        // `toolbox` 那条合成回落整段不再执行（`inline-advanced-shell-helpers.ts:22`）。
        // 所以「插入」必须在这里原样重申一遍，漏了它插入面板当场从界面上消失。
        drawers: [
          {
            id: "editor-global",
            label: "插入",
            icon: "add",
            content: <RichDocControls editor={editor} accent={accent} />,
          },
          {
            // 工具栏的「插入批注」只负责建，读/回复/解决三件事只有这条侧栏做得到。
            id: "richdoc-review",
            label: "批注",
            icon: "note",
            content: (
              <RichDocCommentRail
                comments={editor.review.comments}
                changes={editor.review.changes}
                activeCommentId={editor.review.activeCommentId}
                trackChangesEnabled={editor.review.trackChangesEnabled}
                onFocusComment={editor.review.focusComment}
                onReply={editor.review.replyToComment}
                onResolve={editor.review.resolveComment}
                onRemove={editor.review.removeComment}
                onAcceptChange={editor.review.acceptChange}
                onRejectChange={editor.review.rejectChange}
                onAcceptAll={editor.review.acceptAllChanges}
                onRejectAll={editor.review.rejectAllChanges}
              />
            ),
          },
        ],
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
          label: `直接下载 ${DOC_FAMILY_DOWNLOAD_FORMATS.richdoc[0].label}`,
          icon: "download",
          disabled: downloadDisabled,
          onTrigger: editor.exportDoc,
        },
        // 第一条格式是主交付物，已经由 directDownload 呈现；其余每个格式一条菜单项。
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
          ...DOC_FAMILY_DOWNLOAD_FORMATS.richdoc.slice(1).map((format) => ({
            id: `richdoc-export-${format.extension}`,
            label: `下载 ${format.label}`,
            group: "download" as const,
            disabled: downloadDisabled,
            onTrigger: () => {
              void downloadAs(format.extension);
            },
          })),
          {
            id: "richdoc-wechat-layout",
            label: "转公众号排版",
            group: "download" as const,
            disabled: downloadDisabled,
            onTrigger: exportWechat,
          },
        ],
        upload: {
          accept: docFamilyAcceptAttribute("richdoc"),
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
          importError ||
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
