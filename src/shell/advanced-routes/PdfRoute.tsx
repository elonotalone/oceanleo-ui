"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { resolveEditorCore } from "../editor-core-flags";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor";
import { pdfNextEditorFacade } from "../media-editors/pdf-next-facade";
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

/**
 * 新核舞台的懒加载入口。
 *
 * `import()` 的字面量**必须**写在这一层：它是打包器切 chunk 的唯一依据
 * （`01-verified-facts.md` §1.7），搬进 helper 会让 PDFium 退回主包。
 * `ssr: false` 是硬要求——PDFium 是 WASM + blob worker，服务端渲染时两者都不存在。
 */
const PdfNextStage = dynamic(
  () =>
    import("../media-editors/PdfNextStage").then(
      (module) => module.PdfNextStage,
    ),
  { ssr: false, loading: () => null },
);

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
  // 双核 flag 顶层判一次（`editor-core-flags.ts` 三条纪律的第 1 条）：
  // 默认 `legacy`，翻到 `next` 才拉起 EmbedPDF 那个叶子。
  const core = resolveEditorCore("pdf");
  // L0 专业模式（R3）：默认普通，唯一入口是宿主经 adapter 的 `setMode`。
  // Native 件不发 postMessage —— 那是 Hosted 件的路（契约 v2 §4）。
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [nextCoreFailure, setNextCoreFailure] = useState("");
  const effectiveCore = core === "next" || mode === "pro" ? "next" : "legacy";
  /**
   * 新核档下，`pdf.rotate-page`（写不进文件）与 `pdf.add-blank-page`（缺 API）
   * 换成「说明原因并失败」。包在 editor 这一层，是因为 L1 浮条、指令面、agent
   * 三个入口最后都调它上面的同一个方法——只拦指令面的话，L1 那个按钮就是死键。
   * `legacy` 档拿到的是**同一个对象**，旧核那条路一个字节不变。
   */
  const nextCoreEditor = useMemo(
    () => pdfNextEditorFacade(editor, effectiveCore, setNextCoreFailure),
    [effectiveCore, editor],
  );
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
    buildPdfCommandSurface(nextCoreEditor, { download: downloadAs }),
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
          content: <PdfControls editor={nextCoreEditor} />,
        },
        contextToolbar: (
          <PdfContextToolbar editor={nextCoreEditor} accent={accent} />
        ),
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        // L3 专业模式 = EmbedPDF 的即用查看器（R4）。**同一个文档实例**：
        // 两个模式吃的是同一份 `editor.currentBytes()`，切换不重新载入、不丢改动。
        //
        // 旧核档点专业模式也交出 setMode：切到同一份字节上的新核查看器。
        mode: {
          current: mode,
          setMode,
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
        // flag=`next` 或专业模式走 EmbedPDF 叶子（普通模式我们自己画、专业
        // 模式换成上游即用查看器，**同一份字节**）。
        stage:
          core === "next" || mode === "pro" ? (
            <PdfNextStage
              bytes={nextCoreEditor.currentBytes()}
              name={`${item.title || "document"}.pdf`}
              mode={mode}
              onFailure={setNextCoreFailure}
            />
          ) : (
            <PdfStage editor={editor} accent={accent} />
          ),
        // §6: a failed load reaches the shell status bar with its code, so the
        // route never presents an empty stage with no stated reason.
        status:
          importError ||
          nextCoreFailure ||
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
