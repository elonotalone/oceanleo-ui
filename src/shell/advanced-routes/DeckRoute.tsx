"use client";

import { useCallback, useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { DeckContextToolbar } from "../doc-editors/DeckContextToolbar";
import {
  DeckDrawPanel,
  DeckLinePanel,
  DeckNotesPanel,
  DeckSignaturePanel,
  DeckTablePanel,
} from "../doc-editors/DeckCreationPanels";
import {
  DeckDesignPanel,
  DeckEffectsPanel,
  DeckElementsPanel,
  DeckLayersPanel,
  DeckTextPanel,
  DeckUploadPanel,
} from "../doc-editors/DeckControls";
import { DeckFontPanel } from "../doc-editors/DeckFontPanel";
import type { DeckCreationTool } from "../doc-editors/deck-quick-tools";
import type { DeckInkStyle } from "../doc-editors/deck-ink";
import { DeckStage } from "../doc-editors/DeckStage";
import { useDeckEditor } from "../doc-editors/use-deck-editor";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

export function DeckRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useDeckEditor(item, siteId, previewContent);
  const [zoom, setZoom] = useState(100);
  const [activeTool, setActiveTool] =
    useState<DeckCreationTool>("select");
  const [inkStyle, setInkStyle] = useState<DeckInkStyle>({
    color: "#111827",
    width: 2.5,
    opacity: 1,
  });
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "deck-elements@2",
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
      mutate: (action, material, placement) => {
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
        editor.insertImageElement(
          url,
          material.title,
          action === "replace",
          placement,
        );
      },
    }),
    [editor.insertImageElement],
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
              editor_project_url: saved.projectUrl,
              editor_project_schema: saved.projectSchema,
            },
          }),
        }
      : { ok: false as const };
  }, [editor.save, item]);
  const addLocalImages = useCallback(
    async (files: File[]) => {
      const read = (file: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("图片读取失败"));
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("图片读取失败"));
          reader.readAsDataURL(file);
        });
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        editor.insertImageElement(await read(file), file.name);
      }
    },
    [editor.insertImageElement],
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "deck",
        label: editorToolLabel({ type: "deck" }),
        drawers: [
          {
            id: "deck-design",
            label: "模板",
            icon: "templates",
            content: <DeckDesignPanel editor={editor} accent={accent} />,
          },
          {
            id: "deck-elements",
            label: "元素",
            icon: "elements",
            content: <DeckElementsPanel editor={editor} />,
          },
          {
            id: "deck-draw",
            label: "画笔",
            icon: "draw",
            hiddenFromRail: true,
            content: (
              <DeckDrawPanel
                style={inkStyle}
                onStyleChange={setInkStyle}
                onToolChange={setActiveTool}
              />
            ),
          },
          {
            id: "deck-lines",
            label: "线条",
            icon: "line",
            hiddenFromRail: true,
            content: <DeckLinePanel editor={editor} />,
          },
          {
            id: "deck-notes",
            label: "便签",
            icon: "note",
            hiddenFromRail: true,
            content: <DeckNotesPanel editor={editor} />,
          },
          {
            id: "deck-text",
            label: "文字",
            icon: "text",
            content: <DeckTextPanel editor={editor} />,
          },
          {
            id: "deck-signature",
            label: "签名",
            icon: "signature",
            hiddenFromRail: true,
            content: <DeckSignaturePanel editor={editor} />,
          },
          {
            id: "deck-tables",
            label: "表格",
            icon: "table",
            hiddenFromRail: true,
            content: <DeckTablePanel editor={editor} />,
          },
          {
            id: "deck-uploads",
            label: "上传",
            icon: "uploads",
            content: <DeckUploadPanel editor={editor} />,
          },
          {
            id: "deck-layers",
            label: "图层",
            icon: "layers",
            content: <DeckLayersPanel editor={editor} accent={accent} />,
          },
          {
            id: "deck-effects",
            label: "效果",
            icon: "effects",
            hiddenFromRail: true,
            content: <DeckEffectsPanel editor={editor} />,
          },
          {
            id: "deck-fonts",
            label: "字体",
            icon: "font",
            hiddenFromRail: true,
            content: <DeckFontPanel editor={editor} />,
          },
        ],
        contextToolbar: editor.selectedElement ? (
          <DeckContextToolbar
            editor={editor}
            accent={accent}
          />
        ) : null,
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        viewport: {
          value: zoom,
          min: 10,
          max: 300,
          step: 1,
          setValue: setZoom,
          fit: () => setZoom(100),
        },
        directDownload: {
          id: "deck-export-pptx",
          label: "直接下载 PPTX",
          icon: "download",
          busyLabel: "导出中…",
          busy: editor.exporting,
          onTrigger: editor.exportPptx,
        },
        actions: [
          {
            id: "deck-download-project",
            label: "下载工程",
            icon: "download",
            variant: "icon",
            onTrigger: editor.downloadJson,
          },
        ],
        upload: {
          accept: "image/*",
          multiple: true,
          onFiles: addLocalImages,
        },
        stage: (
          <DeckStage
            editor={editor}
            accent={accent}
            zoom={zoom}
            onZoomChange={setZoom}
            activeTool={activeTool}
            inkStyle={inkStyle}
          />
        ),
        status:
          editor.error ||
          editor.notice ||
          (editor.loading ? "正在载入演示文稿" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("deck", item),
            ready: !editor.loading,
            capture: () => structuredClone(editor.deck),
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
