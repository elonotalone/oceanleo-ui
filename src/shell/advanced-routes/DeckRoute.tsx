"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { DeckContextToolbar } from "../doc-editors/DeckContextToolbar";
import { DeckControls } from "../doc-editors/DeckControls";
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
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "deck-elements@2",
      actions: ["insert", "replace"],
      accepts: (material) => {
        const url = material.url || material.previewUrl || material.thumbUrl || "";
        const mime = String(material.meta.mime || "").toLowerCase();
        return (
          material.kind === "image" ||
          mime.startsWith("image/") ||
          /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url)
        );
      },
      mutate: (action, material) => {
        const url = material.url || material.previewUrl || material.thumbUrl || "";
        if (!url) throw new Error("这个图片素材没有可用地址。");
        editor.insertImageElement(url, material.title, action === "replace");
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
      editorToolbox={<DeckControls editor={editor} accent={accent} />}
      editorContextualToolbar={
        <DeckContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<DeckStage editor={editor} accent={accent} />}
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
