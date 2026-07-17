"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import { ADVANCED_HEADER_ACTION_CLASS } from "../advanced-workbench-chrome";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { AudioContextToolbar } from "../media-editors/AudioContextToolbar";
import {
  AudioControls,
  AudioStage,
  useAudioWorkbench,
} from "../media-editors/AudioWorkbench";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

export function AudioRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useAudioWorkbench(item, siteId);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "audio-materials@2",
      actions: ["replace"],
      accepts: (material) => {
        const url = material.url || material.previewUrl || "";
        return (
          material.kind === "audio" ||
          String(material.meta.mime || "").startsWith("audio/") ||
          /\.(?:mp3|wav|m4a|aac|ogg|flac)(?:$|[?#])/i.test(url)
        );
      },
      mutate: async (_action, material) => {
        const url = material.url || material.previewUrl || "";
        if (!url) throw new Error("这个音频素材没有可用地址。");
        const blob = await fetchMediaBlob(url, {
          maxBytes: 128 * 1024 * 1024,
        });
        const extension =
          url.split(/[?#]/)[0].split(".").pop() || "audio";
        await editor.importSource(
          new File([blob], `${material.title || "audio"}.${extension}`, {
            type: blob.type || "audio/mpeg",
          }),
        );
      },
    }),
    [editor.importSource],
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
      editorLabel={editorToolLabel({ type: "audio" })}
      editorDrawerLabel="音轨工具"
      editorDrawerIcon="timeline"
      editorToolbox={<AudioControls editor={editor} accent={accent} />}
      editorContextualToolbar={
        <AudioContextToolbar editor={editor} accent={accent} />
      }
      editorHistory={{
        canUndo: editor.canUndo,
        canRedo: editor.canRedo,
        undo: editor.undo,
        redo: editor.redo,
      }}
      editorViewport={{
        value: Math.round((editor.zoom / 30) * 100),
        min: 33,
        max: 667,
        step: 5,
        setValue: (value) => editor.setWaveformZoom((value / 100) * 30),
        fit: () => editor.setWaveformZoom(30),
      }}
      editorHeaderActions={
        <>
          <button
            type="button"
            onClick={editor.download}
            disabled={editor.loading}
            className={ADVANCED_HEADER_ACTION_CLASS}
          >
            <AdvancedEditorIcon name="download" className="h-4 w-4" />
            WAV
          </button>
        </>
      }
      editorStage={<AudioStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        (editor.dirty
          ? "有未保存的修改"
          : editor.savedUrl
          ? "已保存到我的库"
          : editor.loading
            ? "正在载入音频"
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
