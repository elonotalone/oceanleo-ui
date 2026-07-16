"use client";

import { useCallback, useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
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
      editorLabel={editorToolLabel({ type: "deck" })}
      editorDrawers={[
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
      ]}
      editorContextualToolbar={
        <DeckContextToolbar
          editor={editor}
          accent={accent}
          activeTool={activeTool}
          onActiveToolChange={setActiveTool}
        />
      }
      editorContextualToolbarInsetLeft={160}
      editorHistory={{
        canUndo: editor.canUndo,
        canRedo: editor.canRedo,
        undo: editor.undo,
        redo: editor.redo,
      }}
      editorViewport={{
        value: zoom,
        min: 10,
        max: 300,
        step: 1,
        setValue: setZoom,
        fit: () => setZoom(100),
      }}
      editorHeaderActions={
        <>
          <button
            type="button"
            onClick={editor.downloadJson}
            className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
            title="下载工程"
            aria-label="下载工程"
          >
            <AdvancedEditorIcon name="download" className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={editor.exporting}
            onClick={() => void editor.exportPptx()}
            className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-medium text-white transition hover:bg-white/20 disabled:opacity-40"
          >
            {editor.exporting ? "导出中…" : "导出 PPTX"}
          </button>
          <button
            type="button"
            disabled={editor.saving}
            onClick={() => void editor.save()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold shadow-sm transition hover:bg-white/90 disabled:opacity-40"
            style={{ color: accent }}
          >
            <AdvancedEditorIcon name="save" className="h-4 w-4" />
            {editor.saving ? "保存中…" : "保存"}
          </button>
        </>
      }
      editorStage={
        <DeckStage
          editor={editor}
          accent={accent}
          zoom={zoom}
          activeTool={activeTool}
          inkStyle={inkStyle}
        />
      }
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入演示文稿" : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
