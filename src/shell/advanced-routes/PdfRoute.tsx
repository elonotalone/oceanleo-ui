"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import { advancedSavedItem } from "../advanced-session";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { PdfContextToolbar } from "../media-editors/PdfContextToolbar";
import { PdfControls } from "../media-editors/PdfControls";
import { PdfStage } from "../media-editors/PdfStage";
import { usePdfWorkbench } from "../media-editors/use-pdf-workbench";
import { editorToolLabel } from "../workbench-routes";
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
  const savedItem = useMemo(
    () =>
      editor.savedUrl
        ? advancedSavedItem(item, {
            url: editor.savedUrl,
            meta: { editor: "pdf-native-v1" },
          })
        : null,
    [editor.savedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.saveCopy();
    return url
      ? {
          ok: true as const,
          item: advancedSavedItem(item, {
            url,
            meta: { editor: "pdf-native-v1" },
          }),
        }
      : { ok: false as const };
  }, [editor.saveCopy, item]);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "pdf" })}
      editorDrawerLabel="页面"
      editorDrawerIcon="pages"
      editorToolbox={<PdfControls editor={editor} accent={accent} />}
      editorContextualToolbar={
        <PdfContextToolbar editor={editor} accent={accent} />
      }
      editorHeaderActions={
        <>
          <button
            type="button"
            onClick={editor.download}
            disabled={editor.loading || editor.processing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-[11px] font-medium text-white hover:bg-white/20 disabled:opacity-40"
          >
            <AdvancedEditorIcon name="download" className="h-4 w-4" />
            PDF
          </button>
          <button
            type="button"
            disabled={editor.saving || editor.processing}
            onClick={() => void editor.saveCopy()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold shadow-sm disabled:opacity-40"
            style={{ color: accent }}
          >
            <AdvancedEditorIcon name="save" className="h-4 w-4" />
            {editor.saving ? "保存中…" : "保存"}
          </button>
        </>
      }
      editorStage={<PdfStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入 PDF" : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
