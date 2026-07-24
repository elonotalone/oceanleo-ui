"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { FabricImageContextToolbar } from "../image-editor/FabricImageContextToolbar";
import {
  FabricImageControls,
  FabricImageFilterPanel,
  FabricImageFontPanel,
} from "../image-editor/FabricImageControls";
import {
  FabricImageBrushPanel,
  FabricImageExportPanel,
  FabricImageLinePanel,
  FabricImageNotePanel,
  FabricImageShapePanel,
  FabricImageSignaturePanel,
  FabricImageTablePanel,
  FabricImageTextPanel,
} from "../image-editor/FabricImageCreationPanels";
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
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    return saved
      ? {
          ok: true as const,
          item: advancedSavedItem(item, {
            url: saved.url,
          versionId: saved.versionId,
            meta: {
              editor: "fabric-v3",
              fabric_document_url: saved.projectUrl,
              fabric_preview_url: saved.url,
              fabric_saved_at: saved.savedAt,
            editor_project_url: saved.projectUrl,
            editor_project_schema: "oceanleo.fabric-image.v1",
            editor_saved_at: saved.savedAt,
            },
          }),
        }
      : { ok: false as const };
  }, [editor.save, item]);
  const addLocalImages = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          await editor.addImageFromFile(file);
        }
      }
    },
    [editor.addImageFromFile],
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "image",
        label: editorToolLabel({ type: "image" }),
        drawers: [
          {
            id: "image-brush",
            label: "画笔",
            icon: "draw",
            hiddenFromRail: true,
            content: <FabricImageBrushPanel editor={editor} />,
          },
          {
            id: "image-shapes",
            label: "形状",
            icon: "shape",
            hiddenFromRail: true,
            content: <FabricImageShapePanel editor={editor} />,
          },
          {
            id: "image-lines",
            label: "线条",
            icon: "line",
            hiddenFromRail: true,
            content: <FabricImageLinePanel editor={editor} />,
          },
          {
            id: "image-notes",
            label: "便签",
            icon: "note",
            hiddenFromRail: true,
            content: <FabricImageNotePanel editor={editor} />,
          },
          {
            id: "image-text",
            label: "文字",
            icon: "text",
            hiddenFromRail: true,
            content: <FabricImageTextPanel editor={editor} />,
          },
          {
            id: "image-signature",
            label: "签名",
            icon: "signature",
            hiddenFromRail: true,
            content: <FabricImageSignaturePanel editor={editor} />,
          },
          {
            id: "image-tables",
            label: "表格",
            icon: "table",
            hiddenFromRail: true,
            content: <FabricImageTablePanel editor={editor} />,
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
            label: "尺寸与背景",
            icon: "templates",
            content: (
              <FabricImageControls editor={editor} sections={["canvas"]} />
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
          {
            id: "image-export",
            label: "导出图片",
            icon: "download",
            hiddenFromRail: true,
            content: <FabricImageExportPanel editor={editor} />,
          },
        ],
        contextToolbar: editor.selected ? (
          <FabricImageContextToolbar editor={editor} accent={accent} />
        ) : null,
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        viewport: {
          value: Math.round(editor.zoom * 100),
          min: 10,
          max: 400,
          step: 1,
          setValue: (value) => editor.setZoom(value / 100),
          fit: editor.zoomFit,
        },
        directDownload: {
          id: "image-download-png",
          label: "直接下载 PNG",
          icon: "download",
          disabled: editor.loading,
          onTrigger: editor.downloadDefaultPng,
        },
        actions: [
          {
            id: "image-export",
            label: "导出图片",
            icon: "download",
            group: "download",
            panelId: "image-export",
            disabled: editor.loading,
          },
        ],
        upload: {
          accept: "image/png,image/jpeg,image/webp,image/svg+xml",
          multiple: true,
          onFiles: addLocalImages,
        },
        stage: <FabricImageStage editor={editor} accent={accent} />,
        status:
          editor.error ||
          editor.notice ||
          (editor.loading ? "正在载入图片编辑器" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
        },
      }}
      onClose={onClose}
    />
  );
}
