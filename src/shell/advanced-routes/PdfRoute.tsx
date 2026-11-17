"use client";
import { useLibraryEditReadOnly } from "../plugin-command/use-library-edit";

import { useExportDownloads } from "../doc-editors/use-export-downloads";

/**
 * PDF 编辑器（2026-10-23 操作员裁定 D4）。
 *
 * 一个 EmbedPDF 查看器实例，两张页：
 * - 编辑（基础）：画面就是 PDF 页面；左侧缩略图栏整理页面；编辑栏常驻
 *   直接列出十个工具（高亮、下划线、删除线、打勾、打叉、加文字、签名、画笔、便签、
 *   查找）的创建图标，选中批注的属性合入同一工具条，共用量宽与 More；
 * - 专业编辑：同一个实例显示 EmbedPDF 官方完整界面。切换只显隐工具，不重载。
 * 改动是标准 PDF 批注，自动保存成同一份 PDF 的新版本。
 */
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { useAdvancedSession } from "../advanced-session-context";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import type { AdvancedEditorCreationTool } from "../advanced-editor-adapter";
import type { CreationToolId } from "../creation-tools";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { PDF_WORKING_COPY_SCHEMA } from "../media-editors/pdf-recovery";
import { advancedRootItemId, advancedSavedItem } from "../advanced-session";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { editorToolLabel } from "../workbench-routes";
import { useUI } from "../../i18n/ui/useUI";
import { usePdfCollab } from "../collab/adapters/use-pdf-collab";
import { useEditorContext } from "../plugin-command";
import { usePluginTheme } from "../plugin-theme";
import type { LibraryItem } from "../library-data";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import { PdfControls } from "../media-editors/PdfControls";
import { EditBarPanelRequest } from "../EditBarFloatingPanel";
import { PdfFindBar } from "../media-editors/PdfFindBar";
import { PdfToolPalette } from "../media-editors/PdfToolPalette";
import { pdfSelectionBarVisible } from "../media-editors/pdf-selection-controls";
import { usePdfSelectionAdapter } from "../media-editors/use-pdf-selection-adapter";
import { PdfSignatureDialog } from "../media-editors/PdfSignatureDialog";
import { usePdfWorkbench } from "../media-editors/use-pdf-workbench";
import { buildPdfContext } from "../media-editors/pdf-command-surface";
import { PDF_MARK_TOOL_IDS } from "../media-editors/pdf-mark-tools";
import { pdfDataUrlBytes } from "../media-editors/pdf-signature-store";
import { PDF_MAX_ZOOM, PDF_MIN_ZOOM } from "../media-editors/pdf-workbench-utils";
import { withEditorHistoryCommand } from "../workbench-material-command";

/** 查看器是 WASM + worker，只在浏览器里装；`import()` 字面量必须写在这一层（切 chunk）。 */
const PdfStage = dynamic(
  () => import("../media-editors/PdfStage").then((module) => module.PdfStage),
  { ssr: false, loading: () => null },
);

/** 创建域的十个工具；nativeTool 保留 EmbedPDF 原生工具 identity。 */
const PDF_TOOLS: readonly {
  id: string;
  tool: CreationToolId;
  nativeTool?: string;
}[] = [
  { id: "pdf-tool-highlight", tool: "highlight", nativeTool: "highlight" },
  { id: "pdf-tool-underline", tool: "underline", nativeTool: "underline" },
  { id: "pdf-tool-strikeout", tool: "strikeout", nativeTool: "strikeout" },
  { id: "pdf-tool-check", tool: "check", nativeTool: PDF_MARK_TOOL_IDS.check },
  { id: "pdf-tool-cross", tool: "cross", nativeTool: PDF_MARK_TOOL_IDS.cross },
  { id: "pdf-tool-text", tool: "text", nativeTool: "freeText" },
  { id: "pdf-tool-signature", tool: "signature" },
  { id: "pdf-tool-ink", tool: "ink", nativeTool: "ink" },
  { id: "pdf-tool-note", tool: "note", nativeTool: "textComment" },
  { id: "pdf-tool-find", tool: "find" },
];

function isImageMaterial(material: LibraryItem): boolean {
  const mime = String(material.meta.mime || "").toLowerCase();
  const urls = [material.url, material.previewUrl, material.thumbUrl].filter(Boolean);
  return (
    material.kind === "image" ||
    mime.startsWith("image/") ||
    urls.some((url) => /\.(?:png|jpe?g)(?:$|[?#])/i.test(url || ""))
  );
}

export function PdfRoute({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const aiReadOnly = useLibraryEditReadOnly(item);
  const tt = useUI();
  const advancedSession = useAdvancedSession();
  const [externalItem, setExternalItem] = useState<LibraryItem | null>(null);
  const collab = usePdfCollab({ item, onExternalItem: setExternalItem });
  const readOnly = collab.readOnly || aiReadOnly;
  const editor = usePdfWorkbench(externalItem ?? item, siteId, { readOnly });
  const exportDownloads = useExportDownloads({ editor: "pdf", item, disabled: !editor.bridge, generate: editor.exportFile });
  const dark = usePluginTheme("pdf").theme === "dark";
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const chrome = mode === "pro" ? "pro" : "basic";
  const [findOpen, setFindOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const bridge = editor.bridge;
  const activeTool = bridge ? bridge.activeTool() : null;
  void editor.annotationVersion;

  // Save, selection and tool state do not change the PDF page pixels.
  const pageAspect = useCallback((index: number) => {
    const page = bridge?.pages()[index];
    return page ? page.size.height / page.size.width : 1.414;
  }, [bridge]);
  const renderThumb = useCallback((index: number) => bridge!.renderThumb(index, 1), [bridge]);
  const openFind = useCallback(() => setFindOpen(true), []);

  const switchMode = useCallback((next: EditorMode) => {
    setFindOpen(false);
    setSignatureOpen(false);
    setMode(next);
  }, []);

  const creationTools = useMemo<AdvancedEditorCreationTool[]>(() => {
    const disabled = readOnly || !bridge || editor.processing;
    return PDF_TOOLS.map((entry) => {
      const active = entry.nativeTool
        ? activeTool === entry.nativeTool
        : entry.id === "pdf-tool-find"
          ? findOpen
          : signatureOpen;
      return {
        id: entry.id,
        tool: entry.tool,
        value: active,
        disabled: entry.id === "pdf-tool-find" ? !bridge : disabled,
        execute: () => {
          if (!bridge || (entry.id !== "pdf-tool-find" && disabled)) return;
          if (entry.id === "pdf-tool-find") {
            setFindOpen((open) => !open);
            return;
          }
          if (entry.id === "pdf-tool-signature") {
            bridge.setTool(null);
            setSignatureOpen((open) => !open);
            return;
          }
          bridge.deselect();
          bridge.setTool(active ? null : entry.nativeTool ?? null);
        },
      };
    });
  }, [activeTool, bridge, editor.processing, findOpen, readOnly, signatureOpen]);

  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "pdf-stamps@3",
      actions: ["insert"],
      // 素材库面板按申报列：PDF 只收图片（含签名图片），作为图章放进页面。
      materialTypes: ["image"],
      accepts: (material) => !readOnly && isImageMaterial(material),
      mutate: async (_action, material, placement) => {
        const candidates = [material.url, material.previewUrl, material.thumbUrl].filter(Boolean) as string[];
        const url = candidates.find((value) => /\.(?:png|jpe?g)(?:$|[?#])/i.test(value)) || candidates[0];
        if (!url) throw new Error(tt("这个图片素材没有可用地址。"));
        const blob = await fetchMediaBlob(url, { maxBytes: 24 * 1024 * 1024 });
        const mime = blob.type === "image/jpeg" ? "image/jpeg" : "image/png";
        await editor.insertImage(await blob.arrayBuffer(), mime, {
          clientX: placement?.source === "drop" ? placement.clientX : undefined,
          clientY: placement?.source === "drop" ? placement.clientY : undefined,
        });
      },
    }),
    [editor.insertImage, readOnly, tt],
  );
  // 素材库「点一下 / 拖进去 = 插入」：图章经查看器的 createAnnotation 进 EmbedPDF 自己的
  // 撤销历史（顶栏撤销即可撤回）；基线是当前 revision（保存后随 item 前移），未知时不登记。
  const materialCommandAdapter = useMemo(
    () =>
      withEditorHistoryCommand(materialAdapter, {
        documentId: advancedRootItemId(item),
        targetRevisionId: item.revisionId,
      }),
    [item, materialAdapter],
  );
  useWorkbenchMaterialAdapter(materialCommandAdapter);

  const saveBeforeNewConversation = useCallback(async (publish = editor.save) => {
    // 只读（只有查看权限 / 别人在编辑）：不落库，别人保存后这里会自动更新。
    if (!collab.mayWrite) return { ok: true as const, item };
    const result = await publish();
    if (!result.ok) return { ok: false as const, error: result.error };
    const saved = result.version;
    if (saved.versionId) collab.markSaved(String(saved.versionId));
    const next: LibraryItem = {
      ...advancedSavedItem(item, {
        url: saved.url,
        versionId: saved.versionId,
        meta: { editor: "pdf-native-v1" },
      }),
      ...(saved.item
        ? {
            artifactId: saved.item.artifactId,
            revisionId: saved.item.revisionId,
            artifact: saved.item.artifact,
            artifactType: saved.item.artifactType,
          }
        : {}),
    };
    return { ok: true as const, item: next };
  }, [collab.markSaved, collab.mayWrite, editor.save, item]);

  useEditorContext(buildPdfContext(editor, item));

  const placeSignature = useCallback(
    async (signature: { dataUrl: string }) => {
      await editor.insertImage(pdfDataUrlBytes(signature.dataUrl), "image/png");
    },
    [editor.insertImage],
  );

  const status =
    (readOnly && collab.lockHolderName
      ? tt("「{name}」正在编辑这个作品，你现在只能看；他保存后这里会自动更新。", {
          name: collab.lockHolderName,
        })
      : "") ||
    (collab.isViewer ? tt("你只有查看权限，只能看、翻页和复制文字。") : "") ||
    editor.error ||
    editor.notice ||
    (editor.loading ? tt("正在载入 PDF") : "");

  const selection = usePdfSelectionAdapter({
    bridge, selected: editor.selected, activeTool, version: editor.annotationVersion, readOnly,
    enabled: chrome === "basic" && pdfSelectionBarVisible(editor.selected, activeTool, readOnly),
  });
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        collab: collab.collab,
        id: "pdf",
        label: editorToolLabel({ type: "pdf" }),
        creationTools: chrome === "basic" ? creationTools : [],
        selection,
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        mode: { current: mode, setMode: switchMode },
        pages: {},
        // 全程一个缩放：基础档用外壳右下角那个（与查看器同步）；专业档官方工具栏
        // 里有缩放，外壳那个藏起来。
        nativeChrome: { viewport: chrome === "pro" },
        viewport: {
          value: editor.zoom,
          min: PDF_MIN_ZOOM,
          max: PDF_MAX_ZOOM,
          step: 5,
          setValue: editor.setZoom,
          fit: editor.fit,
        },
        directDownload: exportDownloads[0],
        actions: exportDownloads.slice(1),
        upload: readOnly
          ? undefined
          : {
              accept: "image/png,image/jpeg",
              multiple: true,
              onFiles: async (files) => {
                for (const file of files) {
                  await editor.insertImage(await file.arrayBuffer(), file.type || "image/png");
                }
              },
            },
        stage: (
          <div
            data-collab-readonly={readOnly ? "true" : undefined}
            data-pdf-dirty={editor.dirty ? "true" : "false"}
            data-pdf-revision={editor.editRevision}
            data-pdf-may-write={collab.mayWrite ? "true" : "false"}
            data-pdf-collab={collab.room?.status ?? "none"}
            data-pdf-processing={editor.processing ? "true" : "false"}
            data-pdf-error={editor.error || undefined}
            className="flex h-full min-h-0 bg-[var(--awb-stage-bg)]"
          >
            {chrome === "basic" && bridge ? (
              <PdfControls
                pageCount={editor.pageCount}
                currentPage={editor.currentPage}
                version={editor.thumbVersion}
                aspect={pageAspect}
                renderThumb={renderThumb}
                readOnly={readOnly}
                busy={editor.processing}
                onGoTo={editor.goToPage}
                onRotate={editor.rotatePage}
                onDelete={editor.deletePage}
                onMove={editor.movePage}
              />
            ) : null}
            <div className="relative min-h-0 min-w-0 flex-1">
              <PdfStage
                bytes={editor.initialBytes}
                name={`${item.title || "document"}.pdf`}
                mode={chrome}
                accent={accent}
                dark={dark}
                onHandle={editor.attach}
                onFailure={editor.setError}
                onFindShortcut={openFind}
              />
              {chrome === "basic" && bridge && !readOnly ? (
                <PdfToolPalette key={activeTool} inline bridge={bridge} activeTool={activeTool} triggerId={PDF_TOOLS.find((tool) => tool.nativeTool === activeTool)?.id} />
              ) : null}
              {findOpen && chrome === "basic" && bridge ? (
                <EditBarPanelRequest id="pdf-find" label={tt("查找")} triggerSelector='[data-workspace-action-id="pdf-tool-find"]' onClose={() => setFindOpen(false)}>
                  <PdfFindBar inline bridge={bridge} onClose={() => setFindOpen(false)} />
                </EditBarPanelRequest>
              ) : null}
              {signatureOpen && chrome === "basic" ? (
                <EditBarPanelRequest id="pdf-signature" label={tt("签名")} triggerSelector='[data-workspace-action-id="pdf-tool-signature"]' onClose={() => setSignatureOpen(false)}>
                  <PdfSignatureDialog inline onPlace={placeSignature} onClose={() => setSignatureOpen(false)} />
                </EditBarPanelRequest>
              ) : null}
            </div>
          </div>
        ),
        status,
        persistence: {
          dirty: collab.mayWrite ? editor.dirty : false,
          editRevision: editor.editRevision,
          autoSave: collab.mayWrite && Boolean(bridge),
          flush: saveBeforeNewConversation,
          ...{ preparePublish: () => {
            const publish = editor.prepareSave();
            return () => saveBeforeNewConversation(publish);
          } },
          recovery: {
            draftSchema: PDF_WORKING_COPY_SCHEMA,
            key: `pdf:${item.artifactId || item.meta.artifact_id || item.id}`,
            ready: Boolean(bridge) && !editor.loading && editor.workingCopyReady,
            capture: editor.captureRecovery,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
