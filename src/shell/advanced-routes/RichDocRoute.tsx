"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { RichDocContextToolbar } from "../doc-editors/RichDocContextToolbar";
import { RichDocControls } from "../doc-editors/RichDocControls";
import { RichDocStage } from "../doc-editors/RichDocStage";
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
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "richdoc" })}
      editorDrawerLabel="插入"
      editorDrawerIcon="add"
      editorToolbox={<RichDocControls editor={editor} accent={accent} />}
      editorContextualToolbar={
        <RichDocContextToolbar editor={editor} accent={accent} />
      }
      editorHistory={{
        canUndo: editor.editor?.can().undo() ?? false,
        canRedo: editor.editor?.can().redo() ?? false,
        undo: () => {
          editor.editor?.chain().focus().undo().run();
        },
        redo: () => {
          editor.editor?.chain().focus().redo().run();
        },
      }}
      editorHeaderActions={
        <>
          <button
            type="button"
            onClick={() => void editor.exportMarkdown()}
            className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-medium text-white transition hover:bg-white/20"
          >
            Markdown
          </button>
          <button
            type="button"
            onClick={() => void editor.exportDoc()}
            className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-medium text-white transition hover:bg-white/20"
          >
            DOCX
          </button>
          <button
            type="button"
            disabled={editor.saving}
            onClick={() => void editor.save()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold shadow-sm disabled:opacity-40"
            style={{ color: accent }}
          >
            <AdvancedEditorIcon name="save" className="h-4 w-4" />
            {editor.saving ? "保存中…" : "保存"}
          </button>
        </>
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
