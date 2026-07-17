"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
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
  const importLocalAudio = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (file) await editor.importSource(file);
    },
    [editor.importSource],
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "audio",
        label: editorToolLabel({ type: "audio" }),
        toolbox: {
          label: "音轨工具",
          icon: "timeline",
          content: <AudioControls editor={editor} accent={accent} />,
        },
        contextToolbar: (
          <AudioContextToolbar editor={editor} accent={accent} />
        ),
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        viewport: {
          value: Math.round((editor.zoom / 30) * 100),
          min: 33,
          max: 667,
          step: 5,
          setValue: (value) => editor.setWaveformZoom((value / 100) * 30),
          fit: () => editor.setWaveformZoom(30),
        },
        actions: [
          {
            id: "audio-download-wav",
            label: "下载 WAV",
            icon: "download",
            disabled: editor.loading,
            onTrigger: editor.download,
          },
        ],
        upload: {
          accept: "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac",
          onFiles: importLocalAudio,
        },
        stage: <AudioStage editor={editor} accent={accent} />,
        status:
          editor.error ||
          (editor.dirty
            ? "有未保存的修改"
            : editor.savedUrl
              ? "已保存到我的库"
              : editor.loading
                ? "正在载入音频"
                : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("audio", item),
            ready: !editor.loading,
            capture: editor.captureRecovery,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
