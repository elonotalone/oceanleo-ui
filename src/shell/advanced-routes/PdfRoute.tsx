"use client";

/**
 * PDF 编辑器（2026-10-23 操作员裁定 D4）。
 *
 * 一个 EmbedPDF 查看器实例，两张页：
 * - 编辑（基础）：画面就是 PDF 页面；左侧缩略图栏整理页面；编辑栏没选中东西时
 *   直接列出十个工具（高亮、下划线、删除线、打勾、打叉、加文字、签名、画笔、便签、
 *   查找），选中批注时变成它的属性；
 * - 专业编辑：同一个实例显示 EmbedPDF 官方完整界面。切换只显隐工具，不重载。
 * 改动是标准 PDF 批注，自动保存成同一份 PDF 的新版本。
 */
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { saveAdvancedEditorFromAgent } from "../advanced-draft-gates";
import { useAdvancedSession } from "../advanced-session-context";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import type { AdvancedWorkbenchAction } from "../advanced-workbench-chrome";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { editorToolLabel } from "../workbench-routes";
import { useUI } from "../../i18n/ui/useUI";
import { usePdfCollab } from "../collab/adapters/use-pdf-collab";
import { guardPluginSurface } from "../collab/adapters/visual-readonly";
import { usePluginCommandSurface } from "../plugin-command";
import { usePluginTheme } from "../plugin-theme";
import type { LibraryItem } from "../library-data";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import { PdfControls } from "../media-editors/PdfControls";
import { PdfFindBar } from "../media-editors/PdfFindBar";
import { PdfSelectionBar } from "../media-editors/PdfSelectionBar";
import { PdfSignatureDialog } from "../media-editors/PdfSignatureDialog";
import { usePdfWorkbench } from "../media-editors/use-pdf-workbench";
import { buildPdfCommandSurface } from "../media-editors/pdf-command-surface";
import { PDF_MARK_TOOL_IDS } from "../media-editors/pdf-mark-tools";
import { pdfDataUrlBytes } from "../media-editors/pdf-signature-store";

/** 查看器是 WASM + worker，只在浏览器里装；`import()` 字面量必须写在这一层（切 chunk）。 */
const PdfStage = dynamic(
  () => import("../media-editors/PdfStage").then((module) => module.PdfStage),
  { ssr: false, loading: () => null },
);

/** 编辑栏空态的十个工具（顺序即显示顺序）。 */
const PDF_TOOLS: readonly {
  id: string;
  label: string;
  tool?: string;
  icon?: AdvancedWorkbenchAction["icon"];
}[] = [
  { id: "pdf-tool-highlight", label: "高亮", tool: "highlight", icon: "highlight" },
  { id: "pdf-tool-underline", label: "下划线", tool: "underline", icon: "underline" },
  { id: "pdf-tool-strikeout", label: "删除线", tool: "strikeout", icon: "strike" },
  { id: "pdf-tool-check", label: "打勾", tool: PDF_MARK_TOOL_IDS.check },
  { id: "pdf-tool-cross", label: "打叉", tool: PDF_MARK_TOOL_IDS.cross },
  { id: "pdf-tool-text", label: "加文字", tool: "freeText", icon: "text" },
  { id: "pdf-tool-signature", label: "签名", icon: "signature" },
  { id: "pdf-tool-ink", label: "画笔", tool: "ink", icon: "draw" },
  { id: "pdf-tool-note", label: "便签", tool: "textComment", icon: "note" },
  { id: "pdf-tool-find", label: "查找" },
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
  const tt = useUI();
  const advancedSession = useAdvancedSession();
  const [externalItem, setExternalItem] = useState<LibraryItem | null>(null);
  const collab = usePdfCollab({ item, onExternalItem: setExternalItem });
  const readOnly = collab.readOnly;
  const editor = usePdfWorkbench(externalItem ?? item, siteId, { readOnly });
  const dark = usePluginTheme("pdf").theme === "dark";
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const chrome = mode === "pro" ? "pro" : "basic";
  const [findOpen, setFindOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const bridge = editor.bridge;
  const activeTool = bridge ? bridge.activeTool() : null;
  void editor.annotationVersion;

  const switchMode = useCallback((next: EditorMode) => {
    setFindOpen(false);
    setSignatureOpen(false);
    setMode(next);
  }, []);

  const toolActions = useMemo<AdvancedWorkbenchAction[]>(() => {
    const disabled = readOnly || !bridge || editor.processing;
    return PDF_TOOLS.map((entry) => {
      const active = entry.tool
        ? activeTool === entry.tool
        : entry.id === "pdf-tool-find"
          ? findOpen
          : signatureOpen;
      return {
        id: entry.id,
        label: entry.label,
        ...(entry.icon ? { icon: entry.icon } : {}),
        group: "edit" as const,
        variant: active ? ("primary" as const) : ("default" as const),
        disabled: entry.id === "pdf-tool-find" ? !bridge : disabled,
        onTrigger: () => {
          if (!bridge) return;
          if (entry.id === "pdf-tool-find") {
            setFindOpen((open) => !open);
            return;
          }
          if (entry.id === "pdf-tool-signature") {
            bridge.setTool(null);
            setSignatureOpen(true);
            return;
          }
          bridge.deselect();
          bridge.setTool(active ? null : entry.tool ?? null);
        },
      };
    });
  }, [activeTool, bridge, editor.processing, findOpen, readOnly, signatureOpen]);

  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "pdf-stamps@3",
      actions: ["insert"],
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
  useWorkbenchMaterialAdapter(materialAdapter);

  const flush = useCallback(async () => {
    // 只读（只有查看权限 / 别人在编辑）：不落库，别人保存后这里会自动更新。
    if (!collab.mayWrite) return { ok: true as const, item };
    const result = await editor.save();
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

  usePluginCommandSurface(
    useMemo(
      () =>
        guardPluginSurface(
          buildPdfCommandSurface(editor, {
            download: editor.download,
            item,
            save: () => saveAdvancedEditorFromAgent(item, advancedSession?.flush),
          }),
          readOnly,
        ),
      [advancedSession?.flush, editor, item, readOnly],
    ),
  );

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
        actions: chrome === "basic" ? toolActions : [],
        contextToolbar:
          chrome === "basic" && bridge ? (
            <PdfSelectionBar
              bridge={bridge}
              selected={editor.selected}
              activeTool={activeTool}
              version={editor.annotationVersion}
              readOnly={readOnly}
              accent={accent}
            />
          ) : null,
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
          min: 25,
          max: 400,
          step: 5,
          setValue: editor.setZoom,
          fit: editor.fit,
        },
        directDownload: {
          id: "pdf-download",
          label: "直接下载 PDF",
          icon: "download",
          disabled: !bridge,
          onTrigger: async () => {
            const failure = await editor.download();
            if (failure) editor.setError(failure);
          },
        },
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
            className="flex h-full min-h-0 bg-[var(--awb-stage-bg)]"
          >
            {chrome === "basic" && bridge ? (
              <PdfControls
                pageCount={editor.pageCount}
                currentPage={editor.currentPage}
                version={editor.thumbVersion}
                aspect={(index) => {
                  const page = bridge.pages()[index];
                  return page ? page.size.height / page.size.width : 1.414;
                }}
                renderThumb={(index) => bridge.renderThumb(index, 1)}
                readOnly={readOnly}
                busy={editor.processing}
                onGoTo={editor.goToPage}
                onRotate={(index) => void editor.rotatePage(index)}
                onDelete={(index) => void editor.deletePage(index)}
                onMove={(from, to) => void editor.movePage(from, to)}
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
                onFindShortcut={() => setFindOpen(true)}
              />
              {findOpen && chrome === "basic" && bridge ? (
                <PdfFindBar bridge={bridge} onClose={() => setFindOpen(false)} />
              ) : null}
              {signatureOpen && chrome === "basic" ? (
                <PdfSignatureDialog onPlace={placeSignature} onClose={() => setSignatureOpen(false)} />
              ) : null}
            </div>
          </div>
        ),
        status,
        persistence: {
          dirty: collab.mayWrite ? editor.dirty : false,
          editRevision: editor.editRevision,
          autoSave: collab.mayWrite && Boolean(bridge),
          flush,
          recovery: {
            key: advancedRecoveryKey("pdf", item),
            ready: Boolean(bridge) && !editor.loading,
            capture: editor.captureRecovery,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
