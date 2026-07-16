"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { FabricImageContextToolbar } from "../image-editor/FabricImageContextToolbar";
import {
  FabricImageControls,
  FabricImageFilterPanel,
  FabricImageFontPanel,
} from "../image-editor/FabricImageControls";
import { FabricImageStage } from "../image-editor/FabricImageStage";
import { useFabricImageEditor } from "../image-editor/use-fabric-image-editor";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

export function ImageRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useFabricImageEditor(item, siteId);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "fabric-image-materials@3",
      actions: ["insert", "replace"],
      accepts: (material) => {
        const urls = [
          material.url,
          material.previewUrl,
          material.thumbUrl,
        ].filter(Boolean);
        const mime = String(material.meta.mime || "").toLowerCase();
        return (
          Boolean(material.previewUrl || material.thumbUrl) ||
          material.kind === "image" ||
          mime.startsWith("image/") ||
          urls.some((url) =>
            /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url || ""),
          )
        );
      },
      mutate: async (action, material, placement) => {
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
        if (action === "replace") {
          await editor.replaceSelectedImageFromUrl(url);
        } else {
          await editor.addImageFromUrl(
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
        }
      },
    }),
    [editor.addImageFromUrl, editor.replaceSelectedImageFromUrl],
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
      editorLabel={editorToolLabel({ type: "image" })}
      editorDrawers={[
        {
          id: "image-create",
          label: "元素",
          icon: "elements",
          content: (
            <FabricImageControls
              editor={editor}
              accent={accent}
              sections={["tools", "objects"]}
            />
          ),
        },
        {
          id: "image-layers",
          label: "图层",
          icon: "layers",
          content: (
            <FabricImageControls editor={editor} sections={["layers"]} />
          ),
        },
        {
          id: "image-canvas",
          label: "画布",
          icon: "templates",
          content: (
            <FabricImageControls editor={editor} sections={["canvas"]} />
          ),
        },
        {
          id: "image-ai",
          label: "AI 创作",
          icon: "agent",
          content: (
            <FabricImageControls
              editor={editor}
              accent={accent}
              sections={["ai"]}
            />
          ),
        },
        {
          id: "image-export",
          label: "导出",
          icon: "download",
          content: (
            <FabricImageControls editor={editor} sections={["export"]} />
          ),
        },
        {
          id: "image-filters",
          label: "图片调整",
          icon: "filter",
          hiddenFromRail: true,
          content: <FabricImageFilterPanel editor={editor} />,
        },
        {
          id: "image-fonts",
          label: "字体",
          icon: "font",
          hiddenFromRail: true,
          content: <FabricImageFontPanel editor={editor} />,
        },
      ]}
      editorContextualToolbar={
        <FabricImageContextToolbar editor={editor} accent={accent} />
      }
      editorHeaderActions={
        <>
          <button
            type="button"
            onClick={editor.download}
            disabled={editor.loading}
            className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white disabled:opacity-40"
            title="下载"
            aria-label="下载"
          >
            <AdvancedEditorIcon name="download" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void editor.save()}
            disabled={editor.loading || editor.saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold shadow-sm transition hover:bg-white/90 disabled:opacity-40"
            style={{ color: accent }}
          >
            <AdvancedEditorIcon name="save" className="h-4 w-4" />
            {editor.saving ? "保存中…" : "保存"}
          </button>
        </>
      }
      editorStage={<FabricImageStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入图片编辑器" : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
