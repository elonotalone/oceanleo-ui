"use client";

import { useCallback, useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { PdfContextToolbar } from "../media-editors/PdfContextToolbar";
import { PdfControls } from "../media-editors/PdfControls";
import { PdfStage } from "../media-editors/PdfStage";
import { usePdfWorkbench } from "../media-editors/use-pdf-workbench";
import {
  PDF_MAX_ZOOM,
  PDF_MIN_ZOOM,
} from "../media-editors/pdf-workbench-utils";
import { editorToolLabel } from "../workbench-routes";
import { buildPdfCommandSurface } from "../doc-editors/doc-family-commands";
import {
  DOC_FAMILY_DOWNLOAD_FORMATS,
  docFamilyAcceptAttribute,
} from "../doc-editors/doc-family-formats";
import { importDocFamilyFile } from "../doc-editors/doc-family-import";
import { usePluginCommandSurface } from "../plugin-command";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

export function PdfRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = usePdfWorkbench(item, siteId);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "pdf-materials@2",
      actions: ["merge"],
      accepts: (material) => {
        const url = material.url || material.previewUrl || "";
        return (
          String(material.meta.format || "").toLowerCase() === "pdf" ||
          String(material.meta.mime || "").toLowerCase() === "application/pdf" ||
          /\.pdf(?:$|[?#])/i.test(url)
        );
      },
      mutate: async (_action, material) => {
        const url = material.url || material.previewUrl || "";
        if (!url) throw new Error("这个 PDF 素材没有可用地址。");
        const blob = await fetchMediaBlob(url, {
          maxBytes: 96 * 1024 * 1024,
        });
        await editor.mergePdf(
          new File([blob], `${material.title || "document"}.pdf`, {
            type: "application/pdf",
          }),
          "after-current",
        );
      },
    }),
    [editor.mergePdf],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.saveCopy();
    return saved
      ? {
          ok: true as const,
          item: advancedSavedItem(item, {
            url: saved.url,
            versionId: saved.versionId,
            meta: {
              editor: "pdf-native-v1",
              editor_project_url: saved.projectUrl,
              editor_project_schema: saved.projectSchema,
            },
          }),
        }
      : { ok: false as const };
  }, [editor.saveCopy, item]);
  const [importError, setImportError] = useState("");
  /**
   * 拖进来的不只是 PDF：Word / 表格 / 演示 / 图片先由后端转成 PDF（合同 §3.3），
   * 再作为页码接到当前页后面。转不了的报出一句能看懂的原因，不静默丢掉文件。
   */
  const mergeLocalFiles = useCallback(
    async (files: File[]) => {
      setImportError("");
      for (const file of files) {
        const outcome = await importDocFamilyFile(file, "pdf");
        if (!outcome.ok) {
          setImportError(outcome.message);
          continue;
        }
        await editor.mergePdf(outcome.file, "after-current");
      }
    },
    [editor.mergePdf],
  );
  const downloadAs = useCallback(
    async (extension: string): Promise<string> => {
      if (extension !== "pdf") {
        return `这里没有 ${extension.toUpperCase()} 这个下载格式。`;
      }
      editor.download();
      return "";
    },
    [editor.download],
  );
  usePluginCommandSurface(
    buildPdfCommandSurface(editor, { download: downloadAs }),
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "pdf",
        label: editorToolLabel({ type: "pdf" }),
        toolbox: {
          label: "页面",
          icon: "pages",
          content: <PdfControls editor={editor} />,
        },
        contextToolbar: (
          <PdfContextToolbar editor={editor} accent={accent} />
        ),
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        // §2.3 / C20–C21: the reader's zoom range is 25 %–400 %. The shell
        // slider must not cap below the carrier contract.
        viewport: {
          value: editor.zoom,
          min: PDF_MIN_ZOOM,
          max: PDF_MAX_ZOOM,
          step: 5,
          setValue: editor.setZoom,
          fit: () => editor.setZoom(100),
        },
        directDownload: {
          id: "pdf-download",
          label: `直接下载 ${DOC_FAMILY_DOWNLOAD_FORMATS.pdf[0].label}`,
          icon: "download",
          disabled: editor.loading || editor.processing,
          onTrigger: editor.download,
        },
        upload: {
          accept: docFamilyAcceptAttribute("pdf"),
          multiple: true,
          onFiles: mergeLocalFiles,
        },
        stage: <PdfStage editor={editor} accent={accent} />,
        // §6: a failed load reaches the shell status bar with its code, so the
        // route never presents an empty stage with no stated reason.
        status:
          importError ||
          editor.error ||
          editor.failure?.message ||
          editor.notice ||
          (editor.loading ? "正在载入 PDF" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("pdf", item),
            ready: !editor.loading && !editor.processing,
            capture: editor.captureRecovery,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
